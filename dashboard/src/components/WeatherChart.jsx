import ReactApexChart from 'react-apexcharts'

// Formatea timestamps para el eje X (muestra solo HH:MM)
function formatLabels(timestamps) {
  return timestamps.map(t => {
    if (!t) return ''
    const d = new Date(t.replace(' ', 'T'))
    return isNaN(d) ? t : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  })
}

export default function WeatherChart({ title, icon: Icon, series, timestamps, colors, type = 'area', yUnit = '', yMin, yMax, height = 220 }) {
  const labels = formatLabels(timestamps)

  const options = {
    chart: {
      type,
      toolbar: { show: false },
      animations: { enabled: true, speed: 600, easing: 'easeinout' },
      background: 'transparent',
      fontFamily: 'Inter, system-ui, sans-serif',
      sparkline: { enabled: false },
    },
    stroke: {
      curve: 'smooth',
      width: series.map(() => 2),
    },
    fill: {
      type: type === 'area' ? 'gradient' : 'solid',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.25,
        opacityTo: 0.02,
        stops: [0, 100],
      },
    },
    colors,
    xaxis: {
      categories: labels,
      tickAmount: 6,
      labels: {
        style: { fontSize: '11px', colors: '#94a3b8' },
        rotate: 0,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: yMin,
      max: yMax,
      labels: {
        style: { fontSize: '11px', colors: '#94a3b8' },
        formatter: v => v != null ? `${v.toFixed(1)}${yUnit}` : '',
      },
    },
    grid: {
      borderColor: '#f1f5f9',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
    },
    legend: {
      show: series.length > 1,
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '12px',
      labels: { colors: '#64748b' },
      markers: { size: 5, shape: 'circle' },
    },
    tooltip: {
      shared: true,
      intersect: false,
      y: { formatter: v => v != null ? `${v.toFixed(2)} ${yUnit}` : '—' },
    },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 5 } },
  }

  const hasData = timestamps.length > 0

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={18} className="text-slate-400" />}
        <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
      </div>
      {hasData ? (
        <ReactApexChart options={options} series={series} type={type} height={height} />
      ) : (
        <div className="flex items-center justify-center text-slate-300 text-sm" style={{ height }}>
          Sin datos
        </div>
      )}
    </div>
  )
}
