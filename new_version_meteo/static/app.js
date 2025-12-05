// ==========================================
// 1. VARIABLES GLOBALES Y SELECTORES
// ==========================================

const chartInstances = {};

const inputCantidadMuestras = document.getElementById("cantidad_muestras");
const historySlider = document.getElementById('historySlider');
const sliderLabel = document.getElementById('sliderLabel');
const btnAplicarFiltro = document.getElementById('btn-aplicar-filtro');

let selectedStartDate = null;
let selectedEndDate = null;

// ==========================================
// 2. LÓGICA DE GRÁFICOS (Chart.js Moderno)
// ==========================================

function renderChart(canvasId, config) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    chartInstances[canvasId] = new Chart(ctx, config);
}

function actualizarTodosLosGraficos() {
    
    // ESTILOS COMUNES PARA GRÁFICOS MODERNOS
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                display: true, // Mostrar leyenda
                labels: { usePointStyle: true, boxWidth: 6 } 
            },
            tooltip: { 
                mode: 'index', 
                intersect: false,
                backgroundColor: 'rgba(0,0,0,0.8)',
                titleFont: { family: 'Poppins' },
                bodyFont: { family: 'Poppins' }
            }
        },
        scales: {
            x: {
                grid: { display: false }, // Ocultar rejilla vertical
                ticks: { 
                    maxTicksLimit: 8, 
                    color: '#adb5bd',
                    font: { family: 'Poppins', size: 10 }
                }
            },
            y: {
                beginAtZero: false,
                grid: { 
                    color: '#f1f3f5', 
                    borderDash: [5, 5] // Rejilla horizontal punteada
                },
                ticks: { 
                    color: '#adb5bd',
                    font: { family: 'Poppins', size: 10 }
                }
            }
        },
        elements: {
            point: {
                radius: 0, // Ocultar puntos por defecto (más limpio)
                hitRadius: 10,
                hoverRadius: 6
            },
            line: {
                tension: 0.4 // Curvar las líneas (Spline)
            }
        }
    };

    // 1. TEMPERATURA
    renderChart("widget-temperatura", {
        type: 'line',
        data: {
            labels: timestamp,
            datasets: [{
                label: "Temp (°C)",
                data: temperature,
                borderWidth: 2,
                backgroundColor: "rgba(220, 53, 69, 0.1)", // Rojo muy suave
                borderColor: "#dc3545", // Rojo vibrante
                fill: true
            }, {
                label: "Barómetro (°C)",
                data: temperature_bar,
                borderWidth: 2,
                borderColor: "#6f42c1", // Morado
                borderDash: [5, 5], // Línea punteada para diferenciar
                fill: false
            }]
        },
        options: commonOptions
    });

    // 2. PRESIÓN
    renderChart("widget-presion", {
        type: 'line',
        data: {
            labels: timestamp,
            datasets: [{
                label: "Presión (hPa)",
                data: pressure,
                backgroundColor: "rgba(40, 167, 69, 0.1)",
                borderColor: "#28a745",
                borderWidth: 2,
                fill: true
            }]
        },
        options: commonOptions
    });

    // 3. HUMEDAD
    renderChart("widget-humedad", {
        type: 'line',
        data: {
            labels: timestamp,
            datasets: [{
                label: "Humedad (%)",
                data: humidity,
                backgroundColor: "rgba(23, 162, 184, 0.1)",
                borderColor: "#17a2b8",
                borderWidth: 2,
                fill: true
            }]
        },
        options: commonOptions
    });

    // 4. TEMP BARÓMETRO
    renderChart("widget-temperatura_bar", {
        type: 'line',
        data: {
            labels: timestamp,
            datasets: [{
                label: "Temp. Bar (°C)",
                data: temperature_bar,
                backgroundColor: "rgba(255, 193, 7, 0.1)",
                borderColor: "#ffc107",
                borderWidth: 2,
                fill: true
            }]
        },
        options: commonOptions
    });

    // 5. VELOCIDAD VIENTO
    renderChart("widget-windSpeed", {
        type: 'line',
        data: {
            labels: timestamp,
            datasets: [{
                label: "Viento (m/s)",
                data: windSpeed,
                backgroundColor: "rgba(23, 162, 184, 0.05)",
                borderColor: "#17a2b8",
                borderWidth: 1
            },{
                label: "Filtrado (m/s)",
                data: windSpeedFiltered,
                borderWidth: 2,
                borderColor: "#0056b3",
                fill: false
            }]
        },
        options: commonOptions
    });

    // 6. DIRECCIÓN VIENTO
    renderChart("widget-windDirection", {
        type: 'line',
        data: {
            labels: timestamp,
            datasets: [{
                label: "Dirección (º)",
                data: windDirection,
                backgroundColor: "rgba(108, 117, 125, 0.1)",
                borderColor: "#6c757d",
                borderWidth: 1.5,
                showLine: false, // Solo puntos
                pointRadius: 2 // Aquí sí mostramos puntos pequeños
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    min: 0,
                    max: 360,
                    ticks: { stepSize: 90, color: '#adb5bd' },
                    grid: { color: '#f1f3f5' }
                }
            }
        }
    });
}

// ==========================================
// 3. LÓGICA DEL SLIDER
// ==========================================

if (historySlider) {
    historySlider.addEventListener('input', function() {
        const diasAtras = parseInt(this.value);
        const format = 'YYYY-MM-DD HH:mm:ss';

        if (diasAtras === 0) {
            sliderLabel.innerText = "Viendo: Hoy";
            selectedStartDate = moment().startOf('day').format(format);
            selectedEndDate = moment().endOf('day').format(format);
        } else {
            sliderLabel.innerText = `Viendo: Hace ${diasAtras} día(s)`;
            selectedStartDate = moment().subtract(diasAtras, 'days').startOf('day').format(format);
            selectedEndDate = moment().subtract(diasAtras, 'days').endOf('day').format(format);
        }
    });
}

// ==========================================
// 4. AJAX / FETCH
// ==========================================

if (btnAplicarFiltro) {
    btnAplicarFiltro.addEventListener('click', function() {
        if (!selectedStartDate) {
            historySlider.dispatchEvent(new Event('input'));
        }

        const btn = this;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
        btn.disabled = true;

        fetch('/api/filtrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start_date: selectedStartDate, end_date: selectedEndDate })
        })
        .then(response => response.json())
        .then(data => {
            if(data.error) { alert("Error: " + data.error); return; }

            timestamp = data.timestamp;
            temperature = data.temperature;
            pressure = data.pressure;
            humidity = data.humidity;
            temperature_bar = data.temperature_bar;
            windSpeed = data.windSpeed;
            windDirection = data.windDirection;
            windSpeedFiltered = data.windSpeedFiltered;
            windDirectionFiltered = data.windDirectionFiltered;

            actualizarTodosLosGraficos();
        })
        .catch(error => { console.error(error); alert("Error de conexión"); })
        .finally(() => {
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        });
    });
}

if (inputCantidadMuestras) {
    inputCantidadMuestras.addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            const cantidad = inputCantidadMuestras.value;
            if(cantidad > 0) window.location.href = `/descargar/${cantidad}`;
        }
    });
}

// ==========================================
// 5. INICIALIZAR
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    if(historySlider) historySlider.dispatchEvent(new Event('input'));
    actualizarTodosLosGraficos();
});