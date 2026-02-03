document.addEventListener('DOMContentLoaded', function() {
    const comparisonIds = JSON.parse(localStorage.getItem('comparisonIds'));
    const history = JSON.parse(localStorage.getItem('analysisHistory')) || [];
    const resultsContainer = document.getElementById('comparison-results');

    if (!comparisonIds || comparisonIds.length !== 2) {
        resultsContainer.innerHTML = '<p>Error: No se seleccionaron dos análisis para comparar. Por favor, vuelve al historial.</p>';
        return;
    }

    const analysis1 = history.find(a => a.id == comparisonIds[0]);
    const analysis2 = history.find(a => a.id == comparisonIds[1]);

    if (!analysis1 || !analysis2) {
        resultsContainer.innerHTML = '<p>Error: No se pudieron encontrar los datos de los análisis seleccionados.</p>';
        return;
    }

    // Renderizar las columnas con la información
    resultsContainer.innerHTML = `
        <div class="analysis-column">
            <h3>${analysis1.locationName}</h3>
            <div class="results-grid">
                <p>NDVI Actual: <span>${analysis1.current.ndvi}</span></p>
                <p>NDWI Actual: <span>${analysis1.current.ndwi}</span></p>
                <p>Nubes: <span>${analysis1.current.cloudPercent}%</span></p>
                <p>Fecha: <span>${analysis1.date}</span></p>
            </div>
        </div>
        <div class="analysis-column">
            <h3>${analysis2.locationName}</h3>
            <div class="results-grid">
                <p>NDVI Actual: <span>${analysis2.current.ndvi}</span></p>
                <p>NDWI Actual: <span>${analysis2.current.ndwi}</span></p>
                <p>Nubes: <span>${analysis2.current.cloudPercent}%</span></p>
                <p>Fecha: <span>${analysis2.date}</span></p>
            </div>
        </div>
    `;

    // Renderizar el gráfico de comparación
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: analysis1.history.labels, // Asumimos que las etiquetas son las mismas
            datasets: [
                {
                    label: `NDVI - ${analysis1.locationName.substring(0, 20)}...`,
                    data: analysis1.history.ndvi,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: `NDVI - ${analysis2.locationName.substring(0, 20)}...`,
                    data: analysis2.history.ndvi,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Comparación Histórica de NDVI'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Valor de NDVI'
                    }
                }
            }
        }
    });

    // Limpiar los IDs de comparación del localStorage
    localStorage.removeItem('comparisonIds');
});
