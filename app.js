console.log("script cargado")

// Variables para los canvas
var ctxTemperatura = document.getElementById("widget-temperatura").getContext("2d");
var ctxPresion = document.getElementById("widget-presion").getContext("2d")
// Creación de los gráficos
var chartTemperatura = new Chart(ctxTemperatura, {
    type: 'line',
    data: {
        labels: ["Actual"],
        datasets: [{
            label: "Temperatura (°C)",
            data: [0],
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            borderColor: "rgb(255, 99, 132)"
        }]
    },
    options: {
        scales: {
            yAxes: [{
                ticks: {
                    suggestedMin: 0,
                    suggestedMax: 40
                }
            }]
        }
    }
})
var chartPresion = new Chart(ctxPresion, {
    type: 'line',
    data: {
        labels: ["Actual"],
        datasets: [{
            label: "Presión (hPa)",
            data: [0],
            backgroundColor: "rgba(54, 162, 235, 0.2)",
            borderColor: "rgb(54, 162, 235)"
        }]
    },
    options: {
        scales: {
            yAxes: [{
                ticks: {
                    suggestedMin: 950,
                    suggestedMax: 1500
                }
            }]
        }
    }
})
// Función para actualizar los gráficos
function actualizarGraficos(datos) {
    print(datos)
    chartTemperatura.data.datasets[0].data = 10;
    chartTemperatura.update();
    chartPresion.data.datasets[0].data = [datos.presion];
    chartPresion.update();
}
// Actualizar gráficos al cargar la página
actualizarGraficos({{ datos | tojson }});