// Funciones.js — versión ajustada

document.addEventListener('DOMContentLoaded', function () {

  // ===== Utilidades y “guard rails” =====

  // Asegura que existan los evalscripts esperados por el resto del código.
  function ensureEvalscripts() {
    // Si tu app esperaba EVALSCRIPT_INDICES, mapeamos al NDVI por defecto.
    if (typeof window.EVALSCRIPT_INDICES === 'undefined') {
      if (typeof window.EVALSCRIPT_NDVI !== 'undefined') {
        window.EVALSCRIPT_INDICES = window.EVALSCRIPT_NDVI; // fallback
      } else {
        console.warn('EVALSCRIPT_INDICES y EVALSCRIPT_NDVI no están definidos; define evalscripts.js antes.');
      }
    }

    // Land Cover (ESA WorldCover): si no existe, creamos uno simple que devuelva SCL (placeholder).
    if (typeof window.LULC_EVALSCRIPT === 'undefined') {
      window.LULC_EVALSCRIPT = `//VERSION=3
function setup(){return {input:[{bands:["SCENECLASSIFICATION"]}],output:{bands:1}};}
function evaluatePixel(s){return [s.SCENECLASSIFICATION];}
      `;
      console.warn('LULC_EVALSCRIPT no estaba definido. Se ha cargado un placeholder basado en SCENECLASSIFICATION.');
    }
  }

  // Cálculo de área con fallback si L.GeometryUtil no está presente.
  function computeAreaHa(layer) {
    try {
      if (L.GeometryUtil && typeof L.GeometryUtil.geodesicArea === 'function') {
        // Leaflet.draw trae GeometryUtil; si está, úsalo.
        const latlngs = layer.getLatLngs();
        // Soporte tanto para Polygon (array de anillos) como Rectangle
        const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
        return L.GeometryUtil.geodesicArea(ring) / 10000.0; // a hectáreas
      }
    } catch (e) {
      console.warn('Fallo al usar L.GeometryUtil.geodesicArea:', e);
    }
    // Fallback planar básico (no geodésico) si lo de arriba no existe.
    try {
      const coords = layer.toGeoJSON().geometry.coordinates[0];
      let area = 0;
      for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const [x1, y1] = coords[j];
        const [x2, y2] = coords[i];
        area += (x1 * y2 - x2 * y1);
      }
      area = Math.abs(area / 2); // área en grados^2, no es real; sólo para no romper
      console.warn('Usando área planar aproximada (no geodésica). Instala/usa Leaflet.GeometryUtil para precisión.');
      return area; // no en hectáreas reales; solo evita que truene
    } catch {
      return 0;
    }
  }

  // ===== EFECTO PARALLAX =====
  const heroScene = document.querySelector('.hero-scene');
  if (heroScene) {
    const globeContainer = document.querySelector('.globe-container');
    const heroText = document.querySelector('.hero-text');
    const particles = document.getElementById('particles-foreground');
    heroScene.addEventListener('mousemove', function(e) {
      const { clientX, clientY } = e;
      const { offsetWidth, offsetHeight } = heroScene;
      const xPos = (clientX / offsetWidth) - 0.5;
      const yPos = (clientY / offsetHeight) - 0.5;
      if (globeContainer) globeContainer.style.transform = `translate(${xPos*20}px, ${yPos*20}px)`;
      if (heroText) heroText.style.transform = `translate(${xPos*-10}px, ${yPos*-10}px)`;
      if (particles) particles.style.transform = `translate(${xPos*40}px, ${yPos*40}px)`;
    });
  }

  // ===== MISIONES DIARIAS =====
  function generateDailyMissions() {
    const missionPool = [
      { title: "El Despertar de la Primavera", desc: "Encuentra un área en el hemisferio norte donde el NDVI haya aumentado significativamente en los últimos 3 meses.", lat: 40, lng: -95 },
      { title: "El Estrés del Verano", desc: "Localiza una zona agrícola en el sur de España y busca signos de estrés hídrico (NDWI bajo).", lat: 37, lng: -5 },
      { title: "Retroceso Glaciar en Groenlandia", desc: "Observa la costa oeste de Groenlandia para identificar el retroceso de los glaciares.", lat: 70, lng: -50 },
      { title: "Deforestación Amazónica", desc: "Explora el estado de Rondônia, en Brasil, un área conocida por la deforestación.", lat: -11.5, lng: -62.5 }
    ];
    const missionContainer = document.getElementById('mission-1-title');
    if (!missionContainer) return;

    const getDayOfYear = () => { const now = new Date(); const start = new Date(now.getFullYear(), 0, 0); const diff = now - start; const oneDay = 1000*60*60*24; return Math.floor(diff/oneDay); };
    const dayOfYear = getDayOfYear();
    const missionCount = missionPool.length;
    const index1 = dayOfYear % missionCount;
    const index2 = (dayOfYear + 3) % missionCount;
    const mission1 = missionPool[index1];
    const mission2 = missionPool[index2 === index1 ? (index1 + 1) % missionCount : index2];

    document.getElementById('mission-1-title').textContent = mission1.title;
    document.getElementById('mission-1-desc').textContent = mission1.desc;
    const btn1 = document.getElementById('mission-1-btn'); btn1.dataset.lat = mission1.lat; btn1.dataset.lng = mission1.lng;

    document.getElementById('mission-2-title').textContent = mission2.title;
    document.getElementById('mission-2-desc').textContent = mission2.desc;
    const btn2 = document.getElementById('mission-2-btn'); btn2.dataset.lat = mission2.lat; btn2.dataset.lng = mission2.lng;
  }
  generateDailyMissions();

  // ===== MAPA =====
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) return;

  const hybridMap = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'], attribution: 'Datos del mapa ©2025 Google', noWrap: true });
  const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', noWrap: true });
  let ndviTimeLayer = L.tileLayer('', { attribution: 'Sentinel Hub | Copernicus', zIndex: 5 });

  const map = L.map('map-container', {
    layers: [hybridMap, ndviTimeLayer],
    minZoom: 2,
    zoomControl: false,
    maxBounds: [[-90,-180],[90,180]]
  }).setView([20,0], 2);

  const baseMaps = { "Híbrido": hybridMap, "Callejero": streetMap };
  const overlayMaps = { "NDVI Global": ndviTimeLayer };
  L.control.layers(baseMaps, overlayMaps).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);
  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: { polygon: true, rectangle: true, marker: true, polyline: false, circle: false, circlemarker: false }
  });
  map.addControl(drawControl);
  loadSavedShapes();

  // ===== LÍNEA DE TIEMPO / WMS Sentinel Hub =====
  const timelineSlider = document.getElementById('timeline-slider');
  const timelineYear = document.getElementById('timeline-year');

  function updateNDVILayer(year) {
    const inst = (typeof window !== 'undefined') ? window.sentinelHubInstanceId : null;
    if (!inst) {
      console.error("sentinelHubInstanceId no configurado en config.js (NDVI WMS deshabilitado).");
      if (map.hasLayer(ndviTimeLayer)) map.removeLayer(ndviTimeLayer);
      return;
    }
    const timeFrom = `${year}-01-01T00:00:00Z`;
    const timeTo   = `${year}-12-31T23:59:59Z`;
    // URL actualizada para WMS de Copernicus
    const ndviUrl = `https://sh.dataspace.copernicus.eu/ogc/wms/${inst}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=NDVI&CRS=EPSG:3857&TIME=${timeFrom}/${timeTo}&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
    ndviTimeLayer.setUrl(ndviUrl);
    if (timelineYear) timelineYear.textContent = year;
    if (!map.hasLayer(ndviTimeLayer)) ndviTimeLayer.addTo(map);
  }
  if (timelineSlider) {
    timelineSlider.addEventListener('input', (e) => updateNDVILayer(e.target.value));
    updateNDVILayer(timelineSlider.value || new Date().getFullYear());
  }

  // ===== DIBUJO Y ANÁLISIS =====
  map.on(L.Draw.Event.CREATED, async function (event) {
    ensureEvalscripts();

    const layer = event.layer;
    const type = event.layerType;

    if (type !== 'rectangle' && type !== 'polygon') {
      if (type === 'marker') {
        drawnItems.addLayer(layer);
        addZoomOnClick(layer);
        const coords = layer.getLatLng();
        const locationName = await getReverseGeocode(coords.lat, coords.lng);
        let poiHistory = JSON.parse(localStorage.getItem('poiHistory')) || [];
        poiHistory.push({ id: Date.now(), name: locationName || `Punto de Interés`, coords: [coords.lat, coords.lng] });
        localStorage.setItem('poiHistory', JSON.stringify(poiHistory));
        alert(`Punto de Interés guardado en: ${locationName}`);
      }
      return;
    }

    drawnItems.addLayer(layer);

    const areaHa = computeAreaHa(layer);
    const geojson = layer.toGeoJSON().geometry;

    const loadingPopup = L.popup()
      .setLatLng(layer.getBounds().getCenter())
      .setContent('Obteniendo datos y clasificación...')
      .openOn(map);

    // --- DEPURACIÓN ---
    console.log("Iniciando procesamiento para polígono...");
    console.log("EVALSCRIPT para índices:", !!window.EVALSCRIPT_INDICES);
    console.log("EVALSCRIPT para Land Cover:", !!window.LULC_EVALSCRIPT);

    try {
      if (typeof getAuthToken !== 'function') throw new ReferenceError('getAuthToken no está definido (revisa sentinel.js).');
      if (typeof getSatelliteData !== 'function') throw new ReferenceError('getSatelliteData no está definido (revisa sentinel.js).');

      // 1) Token
      const authToken = await getAuthToken();
      console.log("Token obtenido con éxito.");

      // 2) NDVI/índices + Land Cover en paralelo
      const [satelliteData, landCoverData] = await Promise.all([
        getSatelliteData(authToken, geojson),     // Debe usar window.EVALSCRIPT_INDICES internamente
        getLandCoverData(authToken, geojson)      // Usa window.LULC_EVALSCRIPT
      ]);

      // 3) Post-proceso / empaquetado
      const analysisPackage = processSatelliteData(satelliteData, areaHa, geojson, landCoverData);

      map.closePopup();
      L.popup()
        .setLatLng(layer.getBounds().getCenter())
        .setContent('¡Análisis completado! Revisa el historial.')
        .openOn(map);

      saveToHistory(analysisPackage);
      localStorage.setItem('currentAnalysisId', analysisPackage.id);
      setTimeout(() => { window.location.href = 'detalles.html'; }, 1000);

    } catch (error) {
      console.error("Error al procesar la solicitud a Sentinel:", error);
      map.closePopup();
      L.popup()
        .setLatLng(layer.getBounds().getCenter())
        .setContent(`Error: ${error.message}`)
        .openOn(map);
    }
  });

  // ===== Land Cover (ESA WorldCover) vía Process API =====
  async function getLandCoverData(token, geojson) {
    const body = {
      input: {
        bounds: {
          geometry: geojson,
          properties: {
            crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
          }
        },
        data: [
          {
            // CAMBIO AQUÍ: Usamos S2L2A porque contiene la banda SCENECLASSIFICATION (SCL)
            type: "S2L2A",
            dataFilter: {
                timeRange: { from: "2024-01-01T00:00:00Z", to: new Date().toISOString() },
                mosaickingOrder: "mostRecent"
            }
          }
        ]
      },
      output: {
        width: 512,
        height: 512,
        responses: [
          {
            identifier: "default",
            format: { type: "image/tiff" }
          }
        ]
      },
      evalscript: window.LULC_EVALSCRIPT
    };

    // URL actualizada para Process API de Copernicus
    const res = await fetch("https://sh.dataspace.copernicus.eu/api/v1/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Error en API de clasificación: ${t}`);
    }

    // Recibes un TIFF binario; aquí solo retornamos un marcador hasta que implementes la interpretación.
    console.log("Respuesta de Land Cover recibida (TIFF).");
    return { landCover: "Datos recibidos (TIFF), pendiente de procesar." };
  }

  // ===== Post-proceso de índices =====
  function processSatelliteData(sentinelData, areaHa, geojson, landCoverData) {
    const analysisId = `analisis_${Date.now()}`;
    const analysisDate = new Date().toISOString();
    const ndviSeries = [], ndwiSeries = [], ndreSeries = [], cloudCoverageSeries = [];

    // Mapa de clases (si más adelante interpretas la clasificación)
    const landCoverMap = {
      10: "Cobertura arbórea",
      20: "Matorral",
      30: "Pastizal",
      40: "Cultivos",
      50: "Área construida",
      60: "Suelo desnudo/escasa vegetación",
      70: "Nieve/Hielo",
      80: "Agua permanente",
      90: "Humedal herbáceo",
      95: "Manglar",
      100: "Musgo/Líquenes"
    };

    let dominantCover = "No disponible";
    if (landCoverData && typeof landCoverData.landCover === 'string') {
      dominantCover = landCoverData.landCover;
    }

    // Esperamos estructura tipo Statistics API (ajusta si tu getSatelliteData devuelve otra forma)
    if (sentinelData && Array.isArray(sentinelData.data)) {
      sentinelData.data.forEach(d => {
        const date = d.interval?.from?.split('T')[0] || d.date || '';
        const out = d.outputs;

        const safeNumber = (v) => Number.isFinite(v) ? v : NaN;

        const ndvi = safeNumber(out?.indices?.bands?.B0?.stats?.mean);
        const ndwi = safeNumber(out?.indices?.bands?.B1?.stats?.mean);
        const ndre = safeNumber(out?.indices?.bands?.B2?.stats?.mean);

        if (Number.isFinite(ndvi)) ndviSeries.push({ date, value: +ndvi.toFixed(4) });
        if (Number.isFinite(ndwi)) ndwiSeries.push({ date, value: +ndwi.toFixed(4) });
        if (Number.isFinite(ndre)) ndreSeries.push({ date, value: +ndre.toFixed(4) });

        const cloudMean = safeNumber(out?.cloud_info?.bands?.B0?.stats?.mean);
        if (Number.isFinite(cloudMean)) {
          cloudCoverageSeries.push({ date, value: +(cloudMean * 100).toFixed(2) });
        }
      });
    }

    return {
      id: analysisId,
      date: analysisDate,
      area: areaHa.toFixed(2),
      geometry: geojson,
      cropType: dominantCover,
      indices: { ndvi: ndviSeries, ndwi: ndwiSeries, ndre: ndreSeries, cloudCoverage: cloudCoverageSeries },
      recommendations: "Recomendaciones basadas en datos reales próximamente."
    };
  }

  // ===== Historial =====
  function saveToHistory(analysisPackage) {
    let history = JSON.parse(localStorage.getItem('analysisHistory')) || [];
    history.push(analysisPackage);
    localStorage.setItem('analysisHistory', JSON.stringify(history));
  }

  function loadSavedShapes() {
    const analysisHistory = JSON.parse(localStorage.getItem('analysisHistory')) || [];
    analysisHistory.forEach(analysis => {
      if (analysis.geometry) {
        const layer = L.geoJSON(analysis.geometry, { style: { color: "#2ecc71", weight: 1, opacity: 0.7, interactive: false } });
        drawnItems.addLayer(layer);
      }
    });
    const poiHistory = JSON.parse(localStorage.getItem('poiHistory')) || [];
    poiHistory.forEach(poi => {
      if (poi.coords) {
        const marker = L.marker(poi.coords);
        addZoomOnClick(marker);
        drawnItems.addLayer(marker);
      }
    });
  }

  function addZoomOnClick(marker) { marker.on('click', e => map.setView(e.target.getLatLng(), 16)); }

  // ===== Utilidad: geocodificación inversa =====
  async function getReverseGeocode(lat, lon) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, { cache: 'no-cache' });
      const data = await response.json();
      return data.address?.village || data.address?.town || data.address?.city || data.display_name;
    } catch (error) {
      console.error("Error en geocodificación inversa:", error);
      return `Ubicación en ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  }

  // ===== Revisión de “revisit” (si existe en localStorage) =====
  const revisitLocationData = localStorage.getItem('revisitLocation');
  if (revisitLocationData) {
    try {
      const revisitBounds = JSON.parse(revisitLocationData);
      if (revisitBounds && revisitBounds.type === "Polygon") {
        const layer = L.geoJSON(revisitBounds, { style: { color: "#3498db", weight: 2, fillOpacity: 0.1, interactive: false } });
        setTimeout(() => { map.fitBounds(layer.getBounds()); layer.addTo(map); }, 200);
      }
      localStorage.removeItem('revisitLocation');
    } catch (e) {
      console.error("Error al procesar 'revisitLocation'.", e);
      localStorage.removeItem('revisitLocation');
    }
  }

  // Deshabilita la herramienta de dibujo cuando termina
  map.on('draw:drawstop', function () { drawControl._toolbars.draw.disable(); });

  // ===== Botones de misión (fix: lat/lng pueden ser 0) =====
  const missionButtons = document.querySelectorAll('.mission-btn');
  const mapSection = document.getElementById('mapa');
  missionButtons.forEach(button => {
    button.addEventListener('click', function() {
      const lat = parseFloat(this.dataset.lat);
      const lng = parseFloat(this.dataset.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        if (mapSection) mapSection.scrollIntoView({ behavior: 'smooth' });
        map.flyTo([lat, lng], 9, { duration: 2 });
        const pulseMarker = L.circle([lat, lng], { radius: 20000, color: '#e67e22', fillColor: '#f39c12', fillOpacity: 0.5 }).addTo(map);
        setTimeout(() => { map.removeLayer(pulseMarker); }, 3000);
      }
    });
  });

});
