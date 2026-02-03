// sentinel.js — Versión final corregida para Vercel y Copernicus

// ====== GUARDS & GLOBALS ======
(function initGlobals() {
  // Si no existe, respetamos lo que pones en config.js.
  if (typeof window.sentinelHubInstanceId === 'undefined') {
    window.sentinelHubInstanceId = null;
  }

  // Evalscript NDVI mínimo (fallback)
  if (typeof window.EVALSCRIPT_INDICES === 'undefined') {
    console.warn('[sentinel.js] EVALSCRIPT_INDICES no encontrado. Cargando NDVI por defecto.');
    window.EVALSCRIPT_INDICES = `//VERSION=3
function setup(){return {input:[{bands:["B04","B08","SCL"]}],output:{bands:1,sampleType:"FLOAT32"}};}
function clear(s){return ![8,9,10,11].includes(s.SCL);} // nubes básicas
function evaluatePixel(s){
  if(!clear(s)) return [NaN];
  const d=s.B08+s.B04; if(d===0) return [NaN];
  return [(s.B08-s.B04)/d];
}`;
  }

  // Land Cover placeholder
  if (typeof window.LULC_EVALSCRIPT === 'undefined') {
    console.warn('[sentinel.js] LULC_EVALSCRIPT no encontrado. Cargando placeholder.');
    window.LULC_EVALSCRIPT = `//VERSION=3
function setup(){return {input:[{bands:["SCENECLASSIFICATION"]}],output:{bands:1}};}
function evaluatePixel(s){return [s.SCENECLASSIFICATION];}`;
  }
})();

// ====== TOKEN (Conectado a tu API en Vercel) ======
async function getAuthToken() {
  // 1. Usa caché si sigue válido para no saturar
  if (window.cachedToken) return window.cachedToken;

  // 2. Intentamos conectar con TU servidor (la carpeta /api)
  const endpoints = [
    '/api/get-sentinel-token', // Ruta para Vercel
    '/.netlify/functions/get-sentinel-token' // Ruta de respaldo
  ];

  let lastErr;
  for (const url of endpoints) {
    try {
      // Hacemos la llamada a tu propio backend
      const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }});
      
      if (!res.ok) {
        lastErr = new Error(`Auth ${res.status}: ${await res.text()}`);
        continue;
      }

      const data = await res.json();
      
      // Verificamos que realmente nos llegó un token
      if (!data?.access_token) throw new Error('La API respondió, pero sin access_token.');
      
      const token = data.access_token;

      // 3. Guardamos el token en memoria (Caché)
      const ttl = Math.max(30, (data.expires_in || 3600) - 30);
      window.cachedToken = token;
      setTimeout(() => { window.cachedToken = null; }, ttl * 1000);
      
      return token;

    } catch (e) {
      console.warn(`Fallo intentando conectar a ${url}:`, e);
      lastErr = e;
    }
  }

  // Si llegamos aquí, ninguna ruta funcionó
  throw new Error(`Fallo total al obtener el token. Asegúrate de que tu archivo api/get-sentinel-token.js existe. Detalle: ${lastErr ? lastErr.message : ''}`);
}

// ====== STATISTICS API (NDVI/índices) ======
async function getSatelliteData(token, geojson, opts = {}) {
  if (!token) throw new ReferenceError('getSatelliteData: token vacío');
  if (!geojson) throw new ReferenceError('getSatelliteData: geometry vacío');

  // Fechas: últimos 12 meses por defecto
  const now = new Date();
  const end = opts.end || now.toISOString();
  const past = new Date(now); past.setFullYear(past.getFullYear() - 1);
  const start = opts.start || past.toISOString();

  // Intervalo de agregación (mensual por defecto)
  const interval = opts.interval || 'P1M';

  // Construcción del body: Statistics API con S2L2A
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

  // URL de Copernicus Data Space Ecosystem
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

  const json = await res.json();
  return json;
}

// ====== EXPORTS AL SCOPE GLOBAL ======
window.getAuthToken = getAuthToken;
window.getSatelliteData = getSatelliteData;
window.EVALSCRIPT_INDICES = window.EVALSCRIPT_INDICES;
window.LULC_EVALSCRIPT = window.LULC_EVALSCRIPT;
window.sentinelHubInstanceId = window.sentinelHubInstanceId;