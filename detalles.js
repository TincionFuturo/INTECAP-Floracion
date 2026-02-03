// detalles.js — llena tarjetas (NDVI/NDWI/NDRE/FPI/%Nubes) y dibuja la gráfica

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const fmt = (v, n = 3) => (Number.isFinite(v) ? v.toFixed(n) : '–');

  // === Recuperar análisis ===
  const currentId = localStorage.getItem('currentAnalysisId');
  const history = JSON.parse(localStorage.getItem('analysisHistory') || '[]');
  const analysis = history.find(a => a.id === currentId) || history[history.length - 1] || null;

  // Elementos de la UI
  const areaEl   = $('area-ha');          // <span id="area-ha">
  const ndviEl   = $('m-ndvi');           // <div id="m-ndvi">
  const ndwiEl   = $('m-ndwi');           // <div id="m-ndwi">
  const ndreEl   = $('m-ndre');           // <div id="m-ndre">
  const fpiEl    = $('m-fpi');            // <div id="m-fpi">
  const cloudEl  = $('m-cloud');          // <div id="m-cloud">
  const noDataEl = $('no-data');          // (opcional)
  const canvas   = $('indicesChart');     // <canvas id="indicesChart">

  if (!analysis) {
    if (noDataEl) noDataEl.style.display = 'block';
    return;
  }

  // Mostrar área (ya viene como string con dos decimales desde Funciones.js)
  if (areaEl) areaEl.textContent = analysis.area ?? '–';

  // Series
  const ndvi  = analysis.indices?.ndvi || [];
  const ndwi  = analysis.indices?.ndwi || [];
  const ndre  = analysis.indices?.ndre || [];
  const cloud = analysis.indices?.cloudCoverage || []; // ya en %

  const hasAny = [ndvi, ndwi, ndre, cloud].some(a => a && a.length);
  if (noDataEl) noDataEl.style.display = hasAny ? 'none' : 'block';

  const lastVal = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return NaN;
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = arr[i]?.value;
      if (Number.isFinite(v)) return v;
    }
    return NaN;
  };

  const ndviLast  = lastVal(ndvi);
  const ndwiLast  = lastVal(ndwi);
  const ndreLast  = lastVal(ndre);
  const cloudLast = lastVal(cloud);

  // FPI (experimental): NDVI alto * (1 - NDWI normalizado)
  const norm = (v) => Math.max(0, Math.min(1, (v + 1) / 2)); // [-1,1] -> [0,1]
  const fpi = (Number.isFinite(ndviLast) && Number.isFinite(ndwiLast))
    ? +(norm(ndviLast) * (1 - norm(ndwiLast)))
    : NaN;

  // Pinta tarjetas
  if (ndviEl)   ndviEl.textContent  = fmt(ndviLast, 3);
  if (ndwiEl)   ndwiEl.textContent  = fmt(ndwiLast, 3);
  if (ndreEl)   ndreEl.textContent  = fmt(ndreLast, 3);
  if (fpiEl)    fpiEl.textContent   = fmt(fpi, 3);
  if (cloudEl)  cloudEl.textContent = Number.isFinite(cloudLast) ? cloudLast.toFixed(2) : '–';

  // === Gráfica ===
  if (canvas && window.Chart) {
    const labels =
      (ndvi.length ? ndvi :
       ndwi.length ? ndwi :
       ndre.length ? ndre : cloud).map(p => p.date);

    const datasets = [];
    if (ndvi.length) datasets.push({ label: 'NDVI', data: ndvi.map(p => p.value), yAxisID: 'y' });
    if (ndwi.length) datasets.push({ label: 'NDWI', data: ndwi.map(p => p.value), yAxisID: 'y' });
    if (ndre.length) datasets.push({ label: 'NDRE', data: ndre.map(p => p.value), yAxisID: 'y' });
    if (cloud.length) datasets.push({ label: 'Nubes (%)', data: cloud.map(p => p.value), yAxisID: 'y1' });

    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        stacked: false,
        plugins: {
          title: { display: true, text: 'Evolución de Índices y Nubes en el Tiempo' },
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const y = ctx.parsed.y;
                const label = ctx.dataset.label || '';
                if (!Number.isFinite(y)) return `${label}: –`;
                return label.includes('Nubes') ? `${label}: ${y.toFixed(2)}%` : `${label}: ${y.toFixed(3)}`;
              }
            }
          }
        },
        scales: {
          y:   { title: { display: true, text: 'Índices' },  suggestedMin: -0.2, suggestedMax: 1.0 },
          y1:  { position: 'right', title: { display: true, text: 'Nubes (%)' }, suggestedMin: 0, suggestedMax: 100, grid: { drawOnChartArea: false } },
          x:   { ticks: { autoSkip: true, maxTicksLimit: 12 } }
        }
      }
    });
  }
});
