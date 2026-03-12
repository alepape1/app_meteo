import ReactApexChart from 'react-apexcharts'

function toMs(t) {
  if (!t) return null
  return new Date(t.replace(' ', 'T')).getTime()
}

function buildSeries(series, timestamps) {
  const msTs = timestamps.map(toMs)
  return series.map(s => ({
    name: s.name,
    data: s.data.map((y, i) => ({ x: msTs[i], y: y != null ? Number(y.toFixed(2)) : null })),
  }))
}

export default function WeatherChart({
  title, icon: Icon, series, timestamps, colors,
  type = 'area', yUnit = '', yMin, yMax, height = 230,
}) {
  const builtSeries = buildSeries(series, timestamps)
  const hasData = timestamps.length > 0

  const options = {
    chart: {
      type,
      toolbar: { show: false },
      animations: { enabled: true, speed: 500 },
      background: 'transparent',
      fontFamily: 'Inter, system-ui, sans-serif',
      zoom: { enabled: true },
    },
    colors,
    stroke: {
      curve: 'smooth',
      width: type === 'scatter' ? 0 : series.map((_, i) => i === 0 ? 2.5 : 2),
      dashArray: series.map((_, i) => i > 0 ? 4 : 0),
    },
    fill: {
      type: type === 'area' ? 'gradient' : 'solid',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.2,
        opacityTo: 0.01,
        stops: [0, 100],
      },
    },
    markers: {
      size: type === 'scatter' ? 3 : 0,
      hover: { size: 5 },
      strokeWidth: 0,
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { fontSize: '11px', colors: '#94a3b8', fontFamily: 'Inter' },
        datetimeUTC: false,
      },
      axisBorder: { show: false },
      axisTicks:  { show: false },
    },
    yaxis: {
      min: yMin,
      max: yMax,
      labels: {
        style: { fontSize: '11px', colors: '#94a3b8', fontFamily: 'Inter' },
        formatter: v => v != null ? `${v.toFixed(1)}${yUnit}` : '',
      },
    },
    grid: {
      borderColor: '#f1f5f9',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      padding: { left: 0, right: 8 },
    },
    legend: {
      show: series.length > 1,
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '12px',
      fontFamily: 'Inter',
      labels: { colors: '#64748b' },
      markers: { size: 5, shape: 'circle', offsetX: -2 },
      itemMargin: { horizontal: 8 },
    },
    tooltip: {
      theme: 'light',
      shared: true,
      intersect: false,
      x: { format: 'dd MMM HH:mm' },
      y: { formatter: v => v != null ? `${v.toFixed(2)} ${yUnit}` : '—' },
      style: { fontSize: '12px', fontFamily: 'Inter' },
    },
    dataLabels: { enabled: false },
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        {Icon && <Icon size={16} className="text-slate-400 shrink-0" />}
        <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
        <span className="ml-auto text-xs text-slate-300">{timestamps.length} pts</span>
      </div>
      {hasData ? (
        <ReactApexChart options={options} series={builtSeries} type={type} height={height} />
      ) : (
        <div className="flex items-center justify-center text-slate-300 text-sm" style={{ height }}>
          Sin datos — usa el simulador o conecta el ESP32
        </div>
      )}
    </div>
  )
}
