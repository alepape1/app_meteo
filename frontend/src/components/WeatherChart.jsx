import ReactApexChart from 'react-apexcharts'

function toMs(t) {
  if (t == null) return null
  if (typeof t === 'number') return isNaN(t) ? null : t
  const ms = new Date(String(t).replace(' ', 'T')).getTime()
  return isNaN(ms) ? null : ms
}

function buildSeries(series, timestamps) {
  const msTs = timestamps.map(toMs)
  return series.map(s => ({
    name: s.name,
    data: (s.data ?? [])
      .map((y, i) => ({
        x: msTs[i],
        y: (y != null && typeof y === 'number') ? Number(y.toFixed(2)) : null,
      }))
      .filter(pt => pt.x != null),
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
      fontFamily: '"DM Sans", system-ui, sans-serif',
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
        style: { fontSize: '11px', colors: '#8a9aaa', fontFamily: '"DM Sans"' },
        datetimeUTC: false,
      },
      axisBorder: { show: false },
      axisTicks:  { show: false },
    },
    yaxis: {
      min: yMin,
      max: yMax,
      labels: {
        style: { fontSize: '11px', colors: '#8a9aaa', fontFamily: '"DM Sans"' },
        formatter: v => v != null ? `${v.toFixed(1)}${yUnit}` : '',
      },
    },
    grid: {
      borderColor: '#f3f3ef',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      padding: { left: 0, right: 8 },
    },
    legend: {
      show: series.length > 1,
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '12px',
      fontFamily: '"DM Sans"',
      labels: { colors: '#3d506a' },
      markers: { size: 5, shape: 'circle', offsetX: -2 },
      itemMargin: { horizontal: 8 },
    },
    tooltip: {
      theme: 'light',
      shared: true,
      intersect: false,
      x: { format: 'dd MMM HH:mm' },
      y: { formatter: v => v != null ? `${v.toFixed(2)} ${yUnit}` : '—' },
      style: { fontSize: '12px', fontFamily: '"DM Sans"' },
    },
    dataLabels: { enabled: false },
  }

  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        {Icon && <Icon size={16} className="text-navy-300 shrink-0" />}
        <h3 className="font-semibold text-navy-900 text-sm">{title}</h3>
        <span className="ml-auto text-xs text-navy-200">{timestamps.length} pts</span>
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
