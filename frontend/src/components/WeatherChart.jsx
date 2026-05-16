import { useMemo, memo, useRef, useEffect } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, DataZoomComponent,
} from 'echarts/components'
import { LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, LegacyGridContainLabel, CanvasRenderer])

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
        .map((y, i) => [msTs[i], toNum(y)])
        .filter(pt => pt[0] != null && pt[1] != null),
    }))
    .filter(s => s.data.length > 0)
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function buildOption({ builtSeries, colors, accentColor, isScatter, type, resolvedYMin, resolvedYMax, yUnit }) {
  const eType = isScatter ? 'scatter' : 'line'

  const seriesDefs = builtSeries.map((s, i) => {
    const color = colors?.[i] ?? accentColor
    const isFirst = i === 0

    const def = {
      name: s.name,
      type: eType,
      data: s.data,
      symbol: isScatter ? 'circle' : 'none',
      symbolSize: isScatter ? 7 : 0,
      smooth: !isScatter,
      lineStyle: isScatter ? { width: 0 } : {
        width: isFirst ? 2.5 : 2,
        type: isFirst ? 'solid' : [6, 4],
        cap: 'round',
        color,
      },
      itemStyle: { color },
      emphasis: { disabled: true },
    }

    if (!isScatter && type === 'area') {
      def.areaStyle = {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0,    color: hexAlpha(color, 0.22) },
            { offset: 0.75, color: hexAlpha(color, 0.04) },
            { offset: 1,    color: hexAlpha(color, 0)    },
          ],
        },
      }
    }

    return def
  })

  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 8, bottom: 28, left: 8, right: 12, containLabel: true },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10.5,
        fontFamily: '"DM Sans", system-ui, sans-serif',
        formatter: (val) => {
          const d = new Date(val)
          return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        },
      },
    },
    yAxis: {
      type: 'value',
      min: resolvedYMin,
      max: resolvedYMax,
      splitLine: {
        lineStyle: {
          color: hexAlpha(accentColor, 0.07),
          type: [4, 6],
        },
      },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10.5,
        fontFamily: '"DM Sans", system-ui, sans-serif',
        formatter: v => {
          const n = Number(v)
          return Number.isFinite(n) ? `${n.toFixed(1)}${yUnit}` : ''
        },
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: hexAlpha(accentColor, 0.35), width: 1 },
      },
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      extraCssText: 'box-shadow:none;',
      formatter: (params) => {
        if (!params?.length) return ''
        const xVal = params[0].value?.[0] ?? params[0].axisValue
        let timeLabel = ''
        if (xVal != null) {
          const d = new Date(xVal)
          if (!isNaN(d.getTime())) {
            timeLabel = d.toLocaleString('es-ES', {
              day: '2-digit', month: 'short',
              hour: '2-digit', minute: '2-digit',
            })
          }
        }
        const rows = params
          .map(p => {
            const val = Array.isArray(p.value) ? p.value[1] : p.value
            if (val == null) return ''
            const n = Number(val)
            const formatted = Number.isFinite(n) ? `${n.toFixed(2)} ${yUnit}` : '—'
            const color = p.color ?? accentColor
            const name = p.seriesName ?? ''
            return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 6px ${color}88;"></span>
                <span style="color:rgba(148,163,184,0.85);font-size:11px;flex:1;">${name}</span>
                <span style="color:#fff;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;">${formatted}</span>
              </div>`
          })
          .filter(Boolean)
          .join('')

        return `<div style="font-family:'DM Sans',system-ui,sans-serif;background:${hexAlpha(accentColor, 0.22)};backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,0.12);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45),0 1px 0 rgba(255,255,255,0.08) inset;padding:0;overflow:hidden;min-width:155px;max-width:240px;">
            <div style="padding:6px 12px 5px;border-bottom:1px solid rgba(255,255,255,0.08);background:${hexAlpha(accentColor, 0.18)};color:rgba(148,163,184,0.9);font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">${timeLabel}</div>
            <div style="padding:6px 12px 8px;">${rows}</div>
          </div>`
      },
    },
    series: seriesDefs,
  }
}

function useEChart(containerRef, option, height) {
  const chartRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = echarts.init(el, null, { renderer: 'canvas' })
    chartRef.current = chart
    chart.setOption(option, { notMerge: false, lazyUpdate: true })

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.setOption(option, { notMerge: false, lazyUpdate: true })
  }, [option])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.resize()
  }, [height])
}

function WeatherChart({
  title, icon: Icon, series, timestamps, colors,
  type = 'area', yUnit = '', yMin, yMax, minYRange, height = 230,
  hideLegend = false,
}) {
  const builtSeries = useMemo(() => buildSeries(series, timestamps), [series, timestamps])
  const hasData = builtSeries.some(s => s.data.length > 0)
  const chartId = `weather-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${type}`
  const legendItems = builtSeries.map((item, index) => ({
    name: item.name,
    color: colors?.[index] ?? '#012d5c',
  }))

  const accentColor = colors?.[0] ?? '#0c8ecc'
  const accentColor2 = colors?.[1] ?? accentColor
  const isScatter = type === 'scatter'

  const { resolvedYMin, resolvedYMax } = useMemo(() => {
    const yValues = builtSeries.flatMap(s => s.data.map(pt => pt[1])).filter(v => Number.isFinite(v))
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
        if (!Number.isFinite(yMin)) resolvedYMin = Math.floor((center - half) / step) * step
        if (!Number.isFinite(yMax)) resolvedYMax = Math.ceil((center + half) / step) * step
      }
    }
    return { resolvedYMin, resolvedYMax }
  }, [builtSeries, yMin, yMax, minYRange])

  const option = useMemo(() => buildOption({
    builtSeries, colors, accentColor, isScatter, type,
    resolvedYMin, resolvedYMax, yUnit,
  }), [builtSeries, colors, accentColor, isScatter, type, resolvedYMin, resolvedYMax, yUnit])

  const containerRef = useRef(null)
  useEChart(containerRef, option, height)

  const accentGrad = colors?.length > 1
    ? `linear-gradient(90deg, ${accentColor}, ${accentColor2})`
    : accentColor

  return (
    <div
      className="relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-px"
      style={{
        background: 'linear-gradient(150deg, #f8fafc 0%, #ffffff 55%, #f0f4ff 100%)',
        border: '1px solid rgba(148,163,184,0.16)',
        boxShadow: `0 1px 2px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)`,
      }}
    >
      {/* Top accent bar with glow */}
      <div
        style={{
          height: 3,
          background: accentGrad,
          boxShadow: `0 1px 10px ${accentColor}55`,
        }}
      />

      {/* Subtle header wash from accent color */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 3,
          left: 0,
          right: 0,
          height: 52,
          background: `linear-gradient(180deg, ${hexAlpha(accentColor, 0.055)} 0%, transparent 100%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-5 pt-3.5 pb-2" style={{ zIndex: 1 }}>
        {Icon && (
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
            style={{
              background: `linear-gradient(135deg, ${hexAlpha(accentColor, 0.14)}, ${hexAlpha(accentColor, 0.06)})`,
              border: `1px solid ${hexAlpha(accentColor, 0.22)}`,
              boxShadow: `0 2px 8px ${hexAlpha(accentColor, 0.15)}, inset 0 1px 0 rgba(255,255,255,0.7)`,
            }}
          >
            <Icon size={15} style={{ color: accentColor }} />
          </span>
        )}
        <h3 className="font-semibold text-slate-700 text-sm tracking-tight">{title}</h3>
        <span
          className="ml-auto text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-md"
          style={{
            background: hexAlpha(accentColor, 0.1),
            color: accentColor,
            border: `1px solid ${hexAlpha(accentColor, 0.18)}`,
          }}
        >
          {timestamps.length} pts
        </span>
      </div>

      {!hideLegend && legendItems.length > 1 && (
        <div className="px-5 pb-2 flex flex-wrap gap-1.5" style={{ zIndex: 1, position: 'relative' }}>
          {legendItems.map((item, index) => (
            <span
              key={`${chartId}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: hexAlpha(item.color, 0.08),
                border: `1px solid ${hexAlpha(item.color, 0.22)}`,
                color: item.color,
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: item.color,
                  boxShadow: `0 0 5px ${item.color}90`,
                }}
              />
              {item.name}
            </span>
          ))}
        </div>
      )}

      {/* Chart — always rendered with real dimensions so ECharts can measure */}
      <div style={{ position: 'relative', height }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: hexAlpha(accentColor, 0.08), border: `1px solid ${hexAlpha(accentColor, 0.15)}` }}
            >
              {Icon && <Icon size={16} style={{ color: hexAlpha(accentColor, 0.4) }} />}
            </div>
            <span className="text-slate-300 text-xs">Sin datos</span>
          </div>
        )}
      </div>
    </div>
  )
}

function arePropsEqual(prev, next) {
  if (next.paused) return true

  if (
    prev.title !== next.title ||
    prev.type !== next.type ||
    prev.yUnit !== next.yUnit ||
    prev.yMin !== next.yMin ||
    prev.yMax !== next.yMax ||
    prev.minYRange !== next.minYRange ||
    prev.height !== next.height ||
    prev.hideLegend !== next.hideLegend
  ) return false

  if ((prev.colors ?? []).join(',') !== (next.colors ?? []).join(',')) return false

  const pt = prev.timestamps, nt = next.timestamps
  if (pt !== nt) {
    if (pt.length !== nt.length || pt[0] !== nt[0] || pt.at(-1) !== nt.at(-1)) return false
  }

  const ps = prev.series, ns = next.series
  if (ps !== ns) {
    if (ps.length !== ns.length) return false
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].name !== ns[i].name) return false
      const pd = ps[i].data ?? [], nd = ns[i].data ?? []
      if (pd !== nd) {
        if (pd.length !== nd.length || pd.at(-1) !== nd.at(-1)) return false
      }
    }
  }

  return true
}

export default memo(WeatherChart, arePropsEqual)
