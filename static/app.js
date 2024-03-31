
const inputCantidadMuestras = document.getElementById("cantidad_muestras");



// Variables para los canvas
var ctxTemperatura = document.getElementById("widget-temperatura").getContext("2d");
var ctxPresion = document.getElementById("widget-presion").getContext("2d");
var ctxHumedad = document.getElementById("widget-humedad").getContext("2d");
var ctxTemperatura_bar = document.getElementById("widget-temperatura_bar").getContext("2d");
var ctxWindSpeed = document.getElementById("widget-windSpeed").getContext("2d");
var ctxWindDirection = document.getElementById("widget-windDirection").getContext("2d");

// Creación de los gráficos
var chartTemperatura = new Chart(ctxTemperatura, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: "Temperatura(°C)",
      data: [],
      borderWidth: 2,
      backgroundColor: "rgba(255, 99, 132, 0.2)",
      borderColor: "rgb(255, 99, 132)"
    }, {
      label: "Temperatura_Barometro_(°C)",
      type: 'line',
      label: "Temperatura Barometro (°C)",
      data: [],
      borderWidth: 2,
      borderColor: "rgb(145, 53, 145)"
    }]
  },
  options: {
    scales: {
      xAxes: [{
        ticks: {
          callback: function (value, index, values) {
            return moment(value).format('YYYY-MM'); // Format X-axis labels (modify format as needed)
          }
        }
      }],

      yAxes: [{
        ticks: {
          suggestedMin: 0,
          suggestedMax: 40
        }
      }]
    }
  }
});

var chartPresion = new Chart(ctxPresion, {
  type: 'line',
  data: {
    labels: [1, 2, 3, 4, 5, 6],
    datasets: [{
      label: "Presión (mBar)",
      data: [25, 24, 25, 25, 26, 25],
      backgroundColor: "rgba(54, 162, 235, 0.05)",
      borderColor: "rgb(110, 202, 106)"
    }]
  },
  options: {
    scales: {
      yAxes: [{
        ticks: {
          suggestedMin: 950,
          suggestedMax: 1050
        }
      }]
    }
  }
});

var chartHumedad = new Chart(ctxHumedad, {
  type: 'line',
  data: {
    labels: [1, 2, 3, 4, 5, 6],
    datasets: [{
      label: "Humedad (%)",
      data: [25, 24, 25, 25, 26, 25],
      backgroundColor: "rgba(54, 162, 235, 0.05)",
      borderColor: "rgb(54, 162, 235)"
    }]
  },
  options: {
    scales: {
      xAxes: [{
        ticks: {
          suggestedMin: 10,
          suggestedMax: 20
        }
      }],
      yAxes: [{
        ticks: {
          suggestedMin: 10,
          suggestedMax: 20
        }
      }]
    }
  }
});

var chartTemperatura_bar = new Chart(ctxTemperatura_bar, {
  type: 'line',
  data: {
    labels: [1, 2, 3, 4, 5, 6],
    datasets: [{
      label: "Temperatura (°C)",
      data: [25, 24, 25, 25, 26, 25],
      backgroundColor: "rgba(54, 162, 235, 0.05)",
      borderColor: "rgb(255, 99, 132)"
    }]
  },
  options: {
    scales: {
      yAxes: [{
        ticks: {

          suggestedMin: 20,
          suggestedMax: 35
        }
      }]
    }
  }
});

var chartWindSpeed = new Chart(ctxWindSpeed, {
  type: 'line',
  data: {
    labels: [1, 2, 3, 4, 5, 6],
    datasets: [{
      label: "windSpeed (m/sg)",
      data: [25, 24, 25, 25, 26, 25],
      backgroundColor: "rgba(54, 162, 235, 0.05)",
      borderColor: "rgb(220, 229, 47)"
    },{
      label: "wind Speed Filter(m/sg)",
      type: 'line',
      label: "Wind Speed Filter",
      data: [],
      borderWidth: 2,
      borderColor: "rgb(145, 53, 145)"
    }]
  },
  options: {
    scales: {
      xAxes: [{
        ticks: {
          suggestedMin: 10,
          suggestedMax: 20
        }
      }],
      yAxes: [{
        ticks: {
          suggestedMin: 10,
          suggestedMax: 20
        }
      }]
    }
  }
});

var chartWindDirection = new Chart(ctxWindDirection, {
  type: 'line',
  data: {
    labels: [1, 2, 3, 4, 5, 6],
    datasets: [{
      label: "Degrees (º)",
      data: [25, 24, 25, 25, 26, 25],
      backgroundColor: "rgba(220, 229, 47, 0.05)",
      borderColor: "rgb(220, 229, 47)"
    },{
      label: "wind Direction Filter(m/sg)",
      type: 'line',
      label: "Wind Direction Filter",
      data: [],
      borderWidth: 2,
      borderColor: "rgb(145, 53, 145)"
    }]
  },
  options: {
    scales: {
      xAxes: [{
        ticks: {
          suggestedMin: 10,
          suggestedMax: 20
        }
      }],
      yAxes: [{
        ticks: {
          suggestedMin: 10,
          suggestedMax: 20
        }
      }]
    }
  }
});


inputCantidadMuestras.addEventListener("change", () => {
  const cantidadIntroducida = inputCantidadMuestras.value;
  // Enviar la cantidad introducida al servidor para realizar la consulta
  const urlDescarga = `/descargar/${cantidadIntroducida}`;
  console.log(cantidadIntroducida)
  window.location.href = urlDescarga;
});

// Función para actualizar los gráficos con un nuevo dato
function actualizarGraficos(timestamp, temperature, pressure, humidity, temperature_bar, windSpeed, windDirection, windSpeedFiltered, windDirectionFiltered) {

  // console.log(datos_DB.map(resultado => resultado[1]))
  console.log(timestamp);
  console.log(temperature)
  console.log(pressure)
  console.log(temperature_bar)
  console.log(windSpeed)
  console.log(windDirection)
  console.log(windDirectionFiltered)
  console.log(windSpeedFiltered)
  // Obtener la fecha actual
  var fechaActual = new Date();

  // Agregar la fecha actual al conjunto de etiquetas
  chartTemperatura.data.labels = timestamp;
  chartPresion.data.labels = timestamp;
  chartHumedad.data.labels = timestamp;
  chartTemperatura_bar.data.labels = timestamp;
  chartWindSpeed.data.labels = timestamp;
  chartWindDirection.data.labels = timestamp;


  // Agregar el nuevo dato al conjunto de datos de temperatura
  chartTemperatura.data.datasets[0].data = temperature;
  chartTemperatura.data.datasets[1].data = temperature_bar;
  chartPresion.data.datasets[0].data = pressure;
  chartHumedad.data.datasets[0].data = humidity;
  chartTemperatura_bar.data.datasets[0].data = temperature_bar;
  chartWindSpeed.data.datasets[0].data = windSpeed;
  chartWindSpeed.data.datasets[1].data = windSpeedFiltered;
  chartWindDirection.data.datasets[0].data = windDirection;
  chartWindDirection.data.datasets[1].data = windDirectionFiltered;
  

  // Actualizar los gráficos
  chartTemperatura.update();
  chartPresion.update();
  chartHumedad.update();
  chartTemperatura_bar.update();
  chartWindSpeed.update();
  chartWindDirection.update();

}




