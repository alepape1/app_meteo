import ReactApexChart from 'react-apexcharts'

function toMs(t) {
  if (t == null) return null
  if (typeof t === 'number') return isNaN(t) ? null : t
  const raw = String(t).trim()
  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) return parsed
  const ms = new Date(raw.includes(',') ? raw : raw.replace(' ', 'T')).getTime()
  return Number.isNaN(ms) ? null : ms
}

function toNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null
}

function buildSeries(series, timestamps) {
  const msTs = (timestamps ?? []).map(toMs)
  return (series ?? [])
    .map(s => ({
      name: s.name,
      data: (s.data ?? [])
        .map((y, i) => ({
          x: msTs[i],
          y: toNum(y),
        }))
        .filter(pt => pt.x != null && pt.y != null),
    }))
    .filter(s => s.data.length > 0)
}

export default function WeatherChart({
  title, icon: Icon, series, timestamps, colors,
  type = 'area', yUnit = '', yMin, yMax, minYRange, height = 230,
}) {
  const builtSeries = buildSeries(series, timestamps)
  const hasData = builtSeries.some(s => s.data.length > 0)
  const chartId = `weather-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${type}`

  const yValues = builtSeries
    .flatMap(s => s.data.map(pt => pt.y))
    .filter(v => Number.isFinite(v))

  let resolvedYMin = yMin
  let resolvedYMax = yMax

  if (Number.isFinite(minYRange) && yValues.length > 0) {
    const dataMin = Number.isFinite(yMin) ? yMin : Math.min(...yValues)
    const dataMax = Number.isFinite(yMax) ? yMax : Math.max(...yValues)
    const span = dataMax - dataMin

    if (span < minYRange) {
      const center = (dataMin + dataMax) / 2
      const half = minYRange / 2
      const step = minYRange >= 20 ? 2 : 1

      if (!Number.isFinite(yMin)) {
        resolvedYMin = Math.floor((center - half) / step) * step
      }
      if (!Number.isFinite(yMax)) {
        resolvedYMax = Math.ceil((center + half) / step) * step
      }
    }
  }

  const options = {
    chart: {
      id: chartId,
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
      lineCap: 'round',
      width: type === 'scatter' ? 0 : series.map((_, i) => i === 0 ? 3 : 2),
      dashArray: series.map((_, i) => i > 0 ? 4 : 0),
    },
    fill: {
      type: type === 'area' ? 'gradient' : 'solid',
      gradient: {
        shadeIntensity: 0,
        opacityFrom: 0.08,
        opacityTo: 0,
        stops: [0, 100],
      },
    },
    markers: {
      size: type === 'scatter' ? 3 : 0,
      hover: { size: 4 },
      strokeWidth: 0,
    },
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } },
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { fontSize: '11px', colors: '#8a9aaa', fontFamily: '"DM Sans"' },
        datetimeUTC: false,
        // Formatter explícito para evitar el crash interno de ApexCharts (ki/formatDate)
        // cuando recibe un número en vez de un string durante updateOptions.
        formatter: (val) => {
          if (val == null) return ''
          const ms = typeof val === 'number' ? val : toMs(val)
          if (ms == null) return ''
          const d = new Date(ms)
          if (isNaN(d.getTime())) return ''
          return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        },
      },
      axisBorder: { show: false },
      axisTicks:  { show: false },
    },
    yaxis: {
      min: resolvedYMin,
      max: resolvedYMax,
      labels: {
        style: { fontSize: '11px', colors: '#8a9aaa', fontFamily: '"DM Sans"' },
        formatter: v => {
          const n = Number(v)
          return Number.isFinite(n) ? `${n.toFixed(1)}${yUnit}` : ''
        },
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
      y: {
        formatter: v => {
          const n = Number(v)
          return Number.isFinite(n) ? `${n.toFixed(2)} ${yUnit}` : '—'
        },
      },
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
