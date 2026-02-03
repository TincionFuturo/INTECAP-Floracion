// sentinel.js — versión robusta para Statistics API (S2L2A)

// ====== GUARDS & GLOBALS ======
(function initGlobals() {
  // Si no existe, respetamos lo que pones en config.js.
  if (typeof window.sentinelHubInstanceId === 'undefined') {
    window.sentinelHubInstanceId = null;
  }

  // Evalscript NDVI mínimo (fallback) si no definiste EVALSCRIPT_INDICES en evalscripts.js
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

  // Land Cover placeholder si no lo definiste (lo procesa tu Funciones.js con Process API aparte)
  if (typeof window.LULC_EVALSCRIPT === 'undefined') {
    console.warn('[sentinel.js] LULC_EVALSCRIPT no encontrado. Cargando placeholder.');
    window.LULC_EVALSCRIPT = `//VERSION=3
function setup(){return {input:[{bands:["SCENECLASSIFICATION"]}],output:{bands:1}};}
function evaluatePixel(s){return [s.SCENECLASSIFICATION];}`;
  }
})();

// ====== TOKEN (Netlify/Vercel function) ======
async function getAuthToken() {
  // Usa caché si sigue válido
  if (window.cachedToken) return window.cachedToken;

  // OPCIÓN A: Si actualizas tu backend, usa la ruta de siempre.
  // OPCIÓN B: Para pruebas rápidas (CDSE), puedes usar credenciales directas aquí (¡Cuidado! No exponer en prod).
  // Regístrate en: https://dataspace.copernicus.eu/
  const CDSE_CLIENT_ID = 'sh-e0012b65-b70f-49b1-8cbf-b91e09390a57'; // Pon tu ID aquí si quieres probar directo
  const CDSE_CLIENT_SECRET = 'bn67L8mXm80vA0gZGe3i4rPJ3anLRLeg'; // Pon tu Secret aquí

  if (CDSE_CLIENT_ID && CDSE_CLIENT_SECRET) {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CDSE_CLIENT_ID,
      client_secret: CDSE_CLIENT_SECRET
    });
    const res = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });
    if (!res.ok) throw new Error(`Error Auth CDSE: ${res.status}`);
    const data = await res.json();
    window.cachedToken = data.access_token;
    setTimeout(() => { window.cachedToken = null; }, (data.expires_in - 30) * 1000);
    return data.access_token;
  }

  // Endpoint de tu función serverless (ajústalo si usas otra ruta)
  const endpoints = [
    '/api/get-sentinel-token', // Ruta estándar en Vercel
    '/.netlify/functions/get-sentinel-token' // Legacy (Netlify)
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
      if (!data?.access_token) throw new Error('Respuesta de auth sin access_token.');
      const token = data.access_token;

      // Cachea y expira un poco antes
      const ttl = Math.max(30, (data.expires_in || 3600) - 30);
      window.cachedToken = token;
      setTimeout(() => { window.cachedToken = null; }, ttl * 1000);
      return token;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Fallo al obtener el token de Sentinel. ${lastErr ? lastErr.message : ''}`);
}

// ====== STATISTICS API (NDVI/índices) ======
// getSatelliteData(token, geojson, opts?)
// - token: string Bearer
// - geojson: geometry (Polygon/MultiPolygon) en WGS84 [lon,lat]
// - opts: { start: ISO, end: ISO, interval: "P1M"|"P1D"|... }
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
        // CRS explícito (CRS84 equivale a lon/lat)
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' }
      },
      data: [{
        type: 'S2L2A',
        dataFilter: {
          // También puedes filtrar por porcentaje de nubes si quieres
          // maxCloudCoverage: 80,
          timeRange: { from: start, to: end },
          mosaickingOrder: 'mostRecent'
        }
      }]
    },
    aggregation: {
      // La API acepta el timeRange aquí también; mantenerlo no molesta y deja claro el rango.
      timeRange: { from: start, to: end },
      aggregationInterval: { of: interval },
      evalscript: window.EVALSCRIPT_INDICES
    }
  };

  // URL actualizada para Copernicus Data Space Ecosystem
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
    // Mensaje claro para tu UI
    throw new Error(`Error en Statistics API (${res.status}): ${t}`);
  }

  // Estructura esperada por tu processSatelliteData (data[].outputs...)
  const json = await res.json();
  return json;
}

// ====== EXPORTS AL SCOPE GLOBAL (usados por Funciones.js) ======
window.getAuthToken = getAuthToken;
window.getSatelliteData = getSatelliteData;
// Las siguientes quedan disponibles si otras partes las leen:
window.EVALSCRIPT_INDICES = window.EVALSCRIPT_INDICES;
window.LULC_EVALSCRIPT = window.LULC_EVALSCRIPT;
// No forzamos instanceId; sólo lo exponemos si lo definiste en config.js
window.sentinelHubInstanceId = window.sentinelHubInstanceId;
