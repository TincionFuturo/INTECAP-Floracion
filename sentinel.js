// sentinel.js — Versión final: Soporte Multibanda y DataMask

// ====== GUARDS & GLOBALS ======
(function initGlobals() {
  if (typeof window.sentinelHubInstanceId === 'undefined') {
    window.sentinelHubInstanceId = null;
  }

  // --- AQUÍ ESTÁ LA MAGIA ---
  // Definimos un script completo que:
  // 1. Pide bandas para NDVI (Vegetación), NDWI (Agua) y NDRE (Estrés)
  // 2. Devuelve 'dataMask' para que Copernicus no de error 400
  // 3. Devuelve 'indices' con 3 bandas para que tus gráficos funcionen
  if (typeof window.EVALSCRIPT_INDICES === 'undefined') {
    window.EVALSCRIPT_INDICES = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B03", "B04", "B05", "B08", "SCL"]
    }],
    output: [
      { id: "indices", bands: 3, sampleType: "FLOAT32" }, // B0: NDVI, B1: NDWI, B2: NDRE
      { id: "dataMask", bands: 1 } // ¡Esto soluciona el error 400!
    ]
  };
}

function evaluatePixel(sample) {
  // Clasificación de nubes (8, 9, 10, 11 son nubes/nieve)
  const isCloud = [8, 9, 10, 11].includes(sample.SCL);
  
  // Si es nube, marcamos como dato inválido (dataMask = 0)
  if (isCloud) {
    return {
      indices: [NaN, NaN, NaN],
      dataMask: [0]
    };
  }

  // --- CÁLCULO DE ÍNDICES ---
  // NDVI (Vegetación) = (NIR - Red) / (NIR + Red)
  const ndvi = index(sample.B08, sample.B04);
  
  // NDWI (Agua/Humedad) = (Green - NIR) / (Green + NIR)
  const ndwi = index(sample.B03, sample.B08);

  // NDRE (Clorofila/Estrés) = (NIR - RedEdge) / (NIR + RedEdge)
  const ndre = index(sample.B08, sample.B05);

  return {
    indices: [ndvi, ndwi, ndre],
    dataMask: [1] // Dato válido
  };
}

function index(a, b) {
  return (a + b) === 0 ? NaN : (a - b) / (a + b);
}`;
  }

  // Placeholder para Land Cover (que ya te funciona)
  if (typeof window.LULC_EVALSCRIPT === 'undefined') {
    window.LULC_EVALSCRIPT = `//VERSION=3
function setup(){return {input:[{bands:["SCENECLASSIFICATION"]}],output:{bands:1}};}
function evaluatePixel(s){return [s.SCENECLASSIFICATION];}`;
  }
})();

// ====== TOKEN (Conectado a tu API en Vercel) ======
async function getAuthToken() {
  if (window.cachedToken) return window.cachedToken;

  const endpoints = [
    '/api/get-sentinel-token',
    '/.netlify/functions/get-sentinel-token'
  ];

  let lastErr;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }});
      if (!res.ok) {
        lastErr = new Error(`Auth ${res.status}: ${await res.text()}`);
        continue;
      }
      const data = await res.json();
      if (!data?.access_token) throw new Error('La API respondió, pero sin access_token.');
      const token = data.access_token;
      
      const ttl = Math.max(30, (data.expires_in || 3600) - 30);
      window.cachedToken = token;
      setTimeout(() => { window.cachedToken = null; }, ttl * 1000);
      return token;
    } catch (e) {
      console.warn(`Fallo intentando conectar a ${url}:`, e);
      lastErr = e;
    }
  }
  throw new Error(`Fallo total al obtener el token. Asegúrate de que tu archivo api/get-sentinel-token.js existe.`);
}

// ====== STATISTICS API (NDVI/índices) ======
async function getSatelliteData(token, geojson, opts = {}) {
  if (!token) throw new ReferenceError('getSatelliteData: token vacío');
  if (!geojson) throw new ReferenceError('getSatelliteData: geometry vacío');

  const now = new Date();
  const end = opts.end || now.toISOString();
  const past = new Date(now); past.setFullYear(past.getFullYear() - 1);
  const start = opts.start || past.toISOString();
  const interval = opts.interval || 'P1M';

  const body = {
    input: {
      bounds: {
        geometry: geojson,
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' }
      },
      data: [{
        type: 'S2L2A',
        dataFilter: {
          timeRange: { from: start, to: end },
          mosaickingOrder: 'mostRecent'
        }
      }]
    },
    aggregation: {
      timeRange: { from: start, to: end },
      aggregationInterval: { of: interval },
      evalscript: window.EVALSCRIPT_INDICES
    }
  };

  const res = await fetch('https://sh.dataspace.copernicus.eu/api/v1/statistics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Error en Statistics API (${res.status}): ${t}`);
  }

  return await res.json();
}

// ====== EXPORTS AL SCOPE GLOBAL ======
window.getAuthToken = getAuthToken;
window.getSatelliteData = getSatelliteData;
window.EVALSCRIPT_INDICES = window.EVALSCRIPT_INDICES;
window.LULC_EVALSCRIPT = window.LULC_EVALSCRIPT;
window.sentinelHubInstanceId = window.sentinelHubInstanceId;