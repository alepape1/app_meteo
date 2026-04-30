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
  hideLegend = false,
}) {
  const builtSeries = buildSeries(series, timestamps)
  const hasData = builtSeries.some(s => s.data.length > 0)
  const chartId = `weather-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${type}`
  const legendItems = builtSeries.map((item, index) => ({
    name: item.name,
    color: colors?.[index] ?? '#012d5c',
  }))

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

  const accentColor = colors?.[0] ?? '#0c8ecc'
  const accentColor2 = colors?.[1] ?? accentColor

  const options = {
    chart: {
      id: chartId,
      type,
      toolbar: { show: false },
      animations: { enabled: true, speed: 400, easing: 'easeinout' },
      background: 'transparent',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      zoom: { enabled: true },
    },
    colors,
    stroke: {
      curve: 'smooth',
      lineCap: 'round',
      width: type === 'scatter' ? 0 : series.map((_, i) => i === 0 ? 2.5 : 2),
      dashArray: series.map((_, i) => i > 0 ? 5 : 0),
    },
    fill: {
      type: type === 'area' ? 'gradient' : 'solid',
      gradient: {
        type: 'vertical',
        shadeIntensity: 0,
        opacityFrom: 0.18,
        opacityTo: 0,
        stops: [0, 85, 100],
      },
    },
    markers: {
      size: type === 'scatter' ? 3.5 : 0,
      hover: { size: 5 },
      strokeWidth: 0,
    },
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } },
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { fontSize: '11px', colors: '#94a3b8', fontFamily: '"DM Sans"' },
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
        style: { fontSize: '11px', colors: '#94a3b8', fontFamily: '"DM Sans"' },
        formatter: v => {
          const n = Number(v)
          return Number.isFinite(n) ? `${n.toFixed(1)}${yUnit}` : ''
        },
      },
    },
    grid: {
      borderColor: '#e2e8f0',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 0, right: 8, top: -4 },
    },
    legend: {
      show: false,
    },
    tooltip: {
      theme: false,
      shared: true,
      intersect: false,
      custom: function({ series, dataPointIndex, w }) {
        const xVal = w.globals.seriesX?.[0]?.[dataPointIndex]
        let timeLabel = ''
        if (xVal != null) {
          const d = new Date(xVal)
          if (!isNaN(d)) {
            timeLabel = d.toLocaleString('es-ES', {
              day: '2-digit', month: 'short',
              hour: '2-digit', minute: '2-digit',
            })
          }
        }

        const rows = series
          .map((s, i) => {
            const val = s[dataPointIndex]
            if (val == null) return ''
            const n = Number(val)
            const formatted = Number.isFinite(n) ? `${n.toFixed(2)} ${yUnit}` : '—'
            const color = w.config.colors?.[i] ?? '#0c8ecc'
            const name = w.globals.seriesNames?.[i] ?? ''
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 6px ${color}88;"></span>
                <span style="color:rgba(148,163,184,0.85);font-size:11px;flex:1;">${name}</span>
                <span style="color:#fff;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;">${formatted}</span>
              </div>`
          })
          .filter(Boolean)
          .join('')

        return `
          <div style="
            font-family:'DM Sans',system-ui,sans-serif;
            background:rgba(8,16,32,0.82);
            backdrop-filter:blur(16px) saturate(180%);
            -webkit-backdrop-filter:blur(16px) saturate(180%);
            border:1px solid rgba(255,255,255,0.10);
            border-radius:12px;
            box-shadow:0 12px 40px rgba(0,0,0,0.5),0 1px 0 rgba(255,255,255,0.06) inset;
            padding:0;
            overflow:hidden;
            min-width:155px;
            max-width:240px;
          ">
            <div style="
              padding:6px 12px 5px;
              border-bottom:1px solid rgba(255,255,255,0.07);
              background:rgba(255,255,255,0.04);
              color:rgba(148,163,184,0.8);
              font-size:10px;
              font-weight:600;
              letter-spacing:0.05em;
              text-transform:uppercase;
            ">${timeLabel}</div>
            <div style="padding:6px 12px 8px;">${rows}</div>
          </div>`
      },
    },
    dataLabels: { enabled: false },
  }

  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm overflow-hidden transition-shadow duration-200 hover:shadow-md">
      {/* Colored accent bar */}
      <div
        className="h-[3px]"
        style={{
          background: colors?.length > 1
            ? `linear-gradient(90deg, ${accentColor}, ${accentColor2})`
            : accentColor,
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-3.5 pb-2">
        {Icon && (
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{ backgroundColor: `${accentColor}18` }}
          >
            <Icon size={14} style={{ color: accentColor }} />
          </span>
        )}
        <h3 className="font-semibold text-navy-900 text-sm">{title}</h3>
        <span className="ml-auto text-[11px] text-slate-300 font-medium tabular-nums">
          {timestamps.length} pts
        </span>
      </div>

      {!hideLegend && legendItems.length > 1 && (
        <div className="px-5 pb-1.5 flex flex-wrap gap-1.5">
          {legendItems.map((item, index) => (
            <span
              key={`${chartId}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </span>
          ))}
        </div>
      )}

      {hasData ? (
        <ReactApexChart
          key={`${chartId}-${timestamps.length}-${timestamps[0] ?? ''}-${timestamps.at(-1) ?? ''}`}
          options={options}
          series={builtSeries}
          type={type}
          height={height}
        />
      ) : (
        <div className="flex items-center justify-center text-slate-300 text-sm" style={{ height }}>
          Sin datos — usa el simulador o conecta el ESP32
        </div>
      )}
    </div>
  )
}
