// historial.js — versión robusta con comparar (2) y export CSV mejorado
document.addEventListener('DOMContentLoaded', () => {
  const historyList = document.getElementById('history-list');
  const emptyMsg    = document.getElementById('empty-history-msg');   // opcional en tu HTML
  const compareBtn  = document.getElementById('compare-btn');
  const exportBtn   = document.getElementById('export-csv-btn');

  // Mantener selección (máx 2)
  let selectedForComparison = [];

  const getHistory = () => {
    try { return JSON.parse(localStorage.getItem('analysisHistory')) || []; }
    catch { return []; }
  };
  const setHistory = (arr) => localStorage.setItem('analysisHistory', JSON.stringify(arr));

  const fmt = (v, n = 3) => (Number.isFinite(v) ? v.toFixed(n) : 'N/A');
  const lastVal = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return NaN;
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = arr[i]?.value;
      if (Number.isFinite(v)) return v;
    }
    return NaN;
  };

  function loadHistory() {
    const analysisHistory = getHistory();

    // Estado vacío / habilitar export
    if (emptyMsg) emptyMsg.style.display = analysisHistory.length ? 'none' : 'block';
    if (exportBtn) exportBtn.disabled = analysisHistory.length === 0;

    // Limpiar
    if (historyList) historyList.innerHTML = '';

    if (analysisHistory.length === 0) return;

    // Orden: más reciente primero (no mutar el array original)
    const sorted = [...analysisHistory].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    // Render
    sorted.forEach(item => {
      const card = createHistoryCard(item);
      historyList.appendChild(card);
    });

    updateCompareButton();
  }

  function createHistoryCard(item) {
    const card = document.createElement('div');
    card.className = 'history-item';
    card.dataset.id = item.id;

    const date = new Date(item.date).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const avg = (arr) => {
      if (!arr || !arr.length) return NaN;
      const sum = arr.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
      return sum / arr.length;
    };

    const avgNdvi  = avg(item.indices?.ndvi);
    const avgNdwi  = avg(item.indices?.ndwi);
    const avgNdre  = avg(item.indices?.ndre);
    const avgCloud = avg(item.indices?.cloudCoverage); // ya es %

    // FPI experimental para resumen (0..1 aprox)
    const norm = (v) => Math.max(0, Math.min(1, (v + 1) / 2));
    const fpi = (Number.isFinite(avgNdvi) && Number.isFinite(avgNdwi))
      ? (norm(avgNdvi) * (1 - norm(avgNdwi)))
      : NaN;

    card.innerHTML = `
      <div class="history-item-header">
        <h4>${item.tag ? `${item.tag} • ` : ''}Análisis del ${date}</h4>
        <input type="checkbox" class="compare-checkbox" title="Seleccionar para comparar" ${selectedForComparison.includes(item.id) ? 'checked' : ''}>
      </div>
      <div class="history-item-body">
        <p><strong>Tipo:</strong> ${item.cropType || 'No especificado'}</p>
        <p><strong>Área:</strong> ${item.area ?? '–'} hectáreas</p>
        <p><strong>NDVI Promedio:</strong> ${fmt(avgNdvi)}</p>
        <p><strong>NDWI Promedio:</strong> ${fmt(avgNdwi)}</p>
        <p><strong>NDRE Promedio:</strong> ${fmt(avgNdre)}</p>
        <p><strong>% Nubes (prom.):</strong> ${Number.isFinite(avgCloud) ? avgCloud.toFixed(1) + '%' : 'N/A'}</p>
        <p><strong>FPI (exp.) Promedio:</strong> ${fmt(fpi, 3)}</p>
      </div>
      <div class="history-item-actions">
        <button class="btn-details btn">Ver Detalles</button>
        <button class="btn-revisit btn">Revisitar en Mapa</button>
        <button class="btn-delete btn">Eliminar</button>
      </div>
    `;

    // Selección visual
    if (selectedForComparison.includes(item.id)) {
      card.classList.add('selected');
    }

    // Listeners
    card.querySelector('.btn-details')
      .addEventListener('click', () => viewDetails(item.id));

    card.querySelector('.btn-revisit')
      .addEventListener('click', () => revisitOnMap(item.geometry));

    card.querySelector('.btn-delete')
      .addEventListener('click', () => deleteItem(item.id));

    card.querySelector('.compare-checkbox')
      .addEventListener('change', (e) => handleCompareSelection(e, item.id));

    return card;
  }

  function handleCompareSelection(event, itemId) {
    const checked = event.target.checked;

    if (checked) {
      if (selectedForComparison.length >= 2) {
        // No permitir más de 2
        event.target.checked = false;
        alert('Solo puedes comparar 2 análisis a la vez.');
        return;
      }
      selectedForComparison.push(itemId);
      const card = document.querySelector(`[data-id="${itemId}"]`);
      if (card) card.classList.add('selected');
    } else {
      selectedForComparison = selectedForComparison.filter(id => id !== itemId);
      const card = document.querySelector(`[data-id="${itemId}"]`);
      if (card) card.classList.remove('selected');
    }

    updateCompareButton();
  }

  function updateCompareButton() {
    if (!compareBtn) return;
    compareBtn.textContent = `Comparar Seleccionados (${selectedForComparison.length}/2)`;
    compareBtn.disabled = selectedForComparison.length !== 2;
  }

  function viewDetails(itemId) {
    localStorage.setItem('currentAnalysisId', itemId);
    window.location.href = 'detalles.html';
  }

  function revisitOnMap(geometry) {
    if (geometry) {
      localStorage.setItem('revisitLocation', JSON.stringify(geometry));
      window.location.href = 'index.html#mapa';
    } else {
      alert('Este análisis no tiene geometría guardada.');
    }
  }

  function deleteItem(itemId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este análisis?')) return;
    let history = getHistory();
    history = history.filter(item => item.id !== itemId);
    setHistory(history);
    // Si estaba seleccionado, quítalo
    selectedForComparison = selectedForComparison.filter(id => id !== itemId);
    loadHistory();
  }

  function exportToCSV() {
    const history = getHistory();
    if (!history.length) return;

    // CSV con cabecera completa
    const rows = [];
    rows.push([
      'analysis_id','date_iso','tag','crop_type','area_ha',
      'avg_ndvi','avg_ndwi','avg_ndre','avg_cloud_pct','avg_fpi'
    ]);

    const norm = (v) => Math.max(0, Math.min(1, (v + 1) / 2));
    const avgOf = (arr) => (arr && arr.length)
      ? arr.reduce((a,b)=>a+(Number(b.value)||0), 0)/arr.length
      : NaN;

    history.forEach(item => {
      const avgNdvi  = avgOf(item.indices?.ndvi);
      const avgNdwi  = avgOf(item.indices?.ndwi);
      const avgNdre  = avgOf(item.indices?.ndre);
      const avgCloud = avgOf(item.indices?.cloudCoverage);
      const fpi = (Number.isFinite(avgNdvi) && Number.isFinite(avgNdwi))
        ? (norm(avgNdvi) * (1 - norm(avgNdwi)))
        : NaN;

      rows.push([
        item.id,
        new Date(item.date).toISOString(),
        item.tag || '',
        item.cropType || '',
        item.area ?? '',
        Number.isFinite(avgNdvi)  ? avgNdvi.toFixed(4)  : '',
        Number.isFinite(avgNdwi)  ? avgNdwi.toFixed(4)  : '',
        Number.isFinite(avgNdre)  ? avgNdre.toFixed(4)  : '',
        Number.isFinite(avgCloud) ? avgCloud.toFixed(2) : '',
        Number.isFinite(fpi)      ? fpi.toFixed(3)      : ''
      ]);
    });

    downloadCsv(rows, 'historial_bloomwatch.csv');
  }

  // Utilidad para descargar CSV (escape de comas/citas)
  function downloadCsv(rows, filename) {
    const csv = rows.map(r =>
      r.map(x => {
        if (x === null || x === undefined) return '';
        const s = String(x);
        return (s.includes(',') || s.includes('"') || s.includes('\n'))
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // === Eventos globales ===
  if (compareBtn) {
    compareBtn.addEventListener('click', () => {
      if (selectedForComparison.length !== 2) return;
      // Guarda selección para la página comparador.html
      localStorage.setItem('compareSelection', JSON.stringify(selectedForComparison));
      // Redirige al comparador (ajusta si tu archivo tiene otro nombre)
      window.location.href = 'comparador.html';
    });
  }

  if (exportBtn) exportBtn.addEventListener('click', exportToCSV);

  // Carga inicial
  loadHistory();
});
