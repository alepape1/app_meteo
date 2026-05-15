import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ authFetch: vi.fn() }),
}))
vi.mock('react-apexcharts', () => ({ default: () => null }))

import {
  calcET0,
  getAdvice,
  getWaterColors,
  toChartMs,
  toChartNum,
  fmtPeriodLabel,
  fmtDuration,
  getBarColumnWidth,
  getChartMinWidth,
} from '../components/IrrigationView'

// ── Bloque 1: calcET0 ────────────────────────────────────────────────────────
describe('calcET0', () => {
  it('valor típico (temp=25, hum=60, viento=2) → resultado > 0 y es string', () => {
    const result = calcET0(25, 60, 2)
    expect(typeof result).toBe('string')
    expect(parseFloat(result)).toBeGreaterThan(0)
  })

  it('temp=null → retorna null', () => {
    expect(calcET0(null, 60, 2)).toBeNull()
  })

  it('humedad extrema baja (hum=5) produce ET0 mayor que hum=60', () => {
    const dry = parseFloat(calcET0(25, 5, 2))
    const normal = parseFloat(calcET0(25, 60, 2))
    expect(dry).toBeGreaterThan(normal)
  })

  it('windSpeed=0 no lanza error (clampea internamente a 0.5)', () => {
    expect(() => calcET0(25, 60, 0)).not.toThrow()
    const result = calcET0(25, 60, 0)
    expect(typeof result).toBe('string')
  })

  it('resultado es string con 1 decimal', () => {
    const result = calcET0(25, 60, 2)
    expect(result).toMatch(/^\d+\.\d$/)
  })

  it('resultado nunca negativo (parseFloat >= 0)', () => {
    const result = calcET0(1, 100, 0.1)
    expect(parseFloat(result)).toBeGreaterThanOrEqual(0)
  })
})

// ── Bloque 2: getAdvice ──────────────────────────────────────────────────────
describe('getAdvice', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('temp=null → level === "nodata"', () => {
    const result = getAdvice(null, 60, 2, 3)
    expect(result.level).toBe('nodata')
  })

  it('humidity=90 (>82) → level === "skip"', () => {
    const result = getAdvice(25, 90, 2, 3)
    expect(result.level).toBe('skip')
  })

  it('wind=6 (>5) → level === "bad" y reason contiene "Viento"', () => {
    const result = getAdvice(25, 60, 6, 3)
    expect(result.level).toBe('bad')
    expect(result.reason).toContain('Viento')
  })

  it('temp=38 (>35) → level === "bad" y reason contiene "temperatura"', () => {
    const result = getAdvice(38, 50, 2, 3)
    expect(result.level).toBe('bad')
    expect(result.reason).toContain('Temperatura')
  })

  it('ET0 ≥4 + hora óptima (8h) → level === "go"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-05-15T08:00:00'))
    const result = getAdvice(20, 50, 2, 4)
    expect(result.level).toBe('go')
  })

  it('ET0 ≥3 + hora no óptima (14h) → level === "wait"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-05-15T14:00:00'))
    const result = getAdvice(20, 50, 2, 3)
    expect(result.level).toBe('wait')
  })

  it('ET0 <3 (et0Num=2) → level === "ok"', () => {
    const result = getAdvice(20, 50, 2, 2)
    expect(result.level).toBe('ok')
  })

  it('caso default (et0Num=3.5, temp=20, hum=50, wind=2, 14h) → level en ["wait","optional"]', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-05-15T14:00:00'))
    const result = getAdvice(20, 50, 2, 3.5)
    expect(['wait', 'optional']).toContain(result.level)
  })
})

// ── Bloque 3: getWaterColors ─────────────────────────────────────────────────
describe('getWaterColors', () => {
  it('pct=50 (<85) → top === "#3fb6f0"', () => {
    expect(getWaterColors(50).top).toBe('#3fb6f0')
  })

  it('pct=90 (85-99) → top === "#ffae3b"', () => {
    expect(getWaterColors(90).top).toBe('#ffae3b')
  })

  it('pct=100 (≥100) → top === "#ff6a6a"', () => {
    expect(getWaterColors(100).top).toBe('#ff6a6a')
  })
})

// ── Bloque 4: toChartMs ──────────────────────────────────────────────────────
describe('toChartMs', () => {
  it('número finito (1234567890) → mismo número', () => {
    expect(toChartMs(1234567890)).toBe(1234567890)
  })

  it('NaN → null', () => {
    expect(toChartMs(NaN)).toBeNull()
  })

  it('ISO string "2025-05-15T10:00:00" → número finito', () => {
    const result = toChartMs('2025-05-15T10:00:00')
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result)).toBe(true)
  })

  it('string con espacio "2025-05-15 10:00:00" → número finito', () => {
    const result = toChartMs('2025-05-15 10:00:00')
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result)).toBe(true)
  })

  it('null → null', () => {
    expect(toChartMs(null)).toBeNull()
  })

  it('string inválido "not-a-date" → null', () => {
    expect(toChartMs('not-a-date')).toBeNull()
  })
})

// ── Bloque 5: toChartNum ─────────────────────────────────────────────────────
describe('toChartNum', () => {
  it('número válido 42 → 42', () => {
    expect(toChartNum(42)).toBe(42)
  })

  it('string "3.14" → 3.14', () => {
    expect(toChartNum('3.14')).toBe(3.14)
  })

  it('null → 0', () => {
    expect(toChartNum(null)).toBe(0)
  })

  it('NaN → 0', () => {
    expect(toChartNum(NaN)).toBe(0)
  })
})

// ── Bloque 6: fmtPeriodLabel ─────────────────────────────────────────────────
describe('fmtPeriodLabel', () => {
  it('key=null → "—"', () => {
    expect(fmtPeriodLabel(null, 'day')).toBe('—')
  })

  it('periodId="day", key="2025-05-15" → string no vacío con número del día', () => {
    const result = fmtPeriodLabel('2025-05-15', 'day')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).toMatch(/15/)
  })

  it('periodId="week", key="2025-W22" → "Sem 22"', () => {
    expect(fmtPeriodLabel('2025-W22', 'week')).toBe('Sem 22')
  })

  it('periodId="week", key="2025-WXX" (mal formado) → no crashea', () => {
    expect(() => fmtPeriodLabel('2025-WXX', 'week')).not.toThrow()
  })

  it('periodId="month", key="2025-03" → string que incluye "mar" o "25"', () => {
    const result = fmtPeriodLabel('2025-03', 'month')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    const lower = result.toLowerCase()
    const hasMar = lower.includes('mar')
    const has25 = result.includes('25')
    expect(hasMar || has25).toBe(true)
  })

  it('periodId="session", key=timestamp número → string no vacío', () => {
    const result = fmtPeriodLabel(1747310400000, 'session')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ── Bloque 7: fmtDuration ────────────────────────────────────────────────────
describe('fmtDuration', () => {
  it('45 → "45s"', () => {
    expect(fmtDuration(45)).toBe('45s')
  })

  it('90 → "1m 30s"', () => {
    expect(fmtDuration(90)).toBe('1m 30s')
  })

  it('120 → "2m"', () => {
    expect(fmtDuration(120)).toBe('2m')
  })

  it('0 → "0s"', () => {
    expect(fmtDuration(0)).toBe('0s')
  })
})

// ── Bloque 8: getBarColumnWidth ──────────────────────────────────────────────
describe('getBarColumnWidth', () => {
  it('count=3 → "34%"', () => {
    expect(getBarColumnWidth(3)).toBe('34%')
  })

  it('count=10 → "42%"', () => {
    expect(getBarColumnWidth(10)).toBe('42%')
  })

  it('count=30, periodId="session" → "68%"', () => {
    expect(getBarColumnWidth(30, 'session')).toBe('68%')
  })
})

// ── Bloque 9: getChartMinWidth ───────────────────────────────────────────────
describe('getChartMinWidth', () => {
  it('count=5, periodId="day" → >= 680', () => {
    expect(getChartMinWidth(5, 'day')).toBeGreaterThanOrEqual(680)
  })

  it('count=5, periodId="session" → >= 760', () => {
    expect(getChartMinWidth(5, 'session')).toBeGreaterThanOrEqual(760)
  })

  it('count=100 → valor grande (> 680)', () => {
    expect(getChartMinWidth(100)).toBeGreaterThan(680)
  })
})

// ── Bloque 10: SavingsCard — cálculos de consumo y ahorro ───────────────────
// Helpers inline que replican la lógica del componente
function calcSavingsPct(savings_liters, baseline_liters) {
  if (!baseline_liters) return 0
  return Math.round((savings_liters / baseline_liters) * 100)
}

function calcConsumptionPct(total_liters, baseline_liters) {
  if (!baseline_liters) return 0
  return (total_liters / baseline_liters) * 100
}

function calcHasLeak(leak_liters) {
  return leak_liters > 0.5
}

function calcWaterStatus(consumptionPct) {
  if (consumptionPct >= 100) return 'danger'
  if (consumptionPct >= 85) return 'warn'
  return 'ok'
}

function calcPillText(status, savingsPct, overLiters) {
  if (status === 'danger') return `+${Math.round(overLiters)} L sobre el límite`
  if (status === 'ok') return `${savingsPct}% de ahorro`
  return `${savingsPct}% de ahorro`
}

describe('SavingsCard — cálculos de consumo y ahorro', () => {
  it('savingsPct con baseline 100L y 30L ahorrados → 30%', () => {
    expect(calcSavingsPct(30, 100)).toBe(30)
  })

  it('savingsPct con baseline 0 → 0% (no divide por cero)', () => {
    expect(calcSavingsPct(30, 0)).toBe(0)
  })

  it('consumptionPct 80L de 200L → 40%', () => {
    expect(calcConsumptionPct(80, 200)).toBe(40)
  })

  it('consumptionPct ≥100% cuando total > baseline', () => {
    expect(calcConsumptionPct(250, 200)).toBeGreaterThanOrEqual(100)
  })

  it('hasLeak cuando leak_liters=1 → true', () => {
    expect(calcHasLeak(1)).toBe(true)
  })

  it('hasLeak cuando leak_liters=0 → false', () => {
    expect(calcHasLeak(0)).toBe(false)
  })

  it('hasLeak en umbral: leak_liters=0.5 → false (no > 0.5)', () => {
    expect(calcHasLeak(0.5)).toBe(false)
  })

  it('estado ok cuando consumptionPct < 85', () => {
    expect(calcWaterStatus(70)).toBe('ok')
  })

  it('estado warn cuando consumptionPct entre 85 y 99', () => {
    expect(calcWaterStatus(90)).toBe('warn')
  })

  it('estado danger cuando consumptionPct >= 100', () => {
    expect(calcWaterStatus(100)).toBe('danger')
  })

  it('pillText en danger incluye "+ L sobre el límite"', () => {
    const text = calcPillText('danger', 0, 15)
    expect(text).toContain('L sobre el límite')
  })

  it('pillText en ok incluye "% de ahorro"', () => {
    const text = calcPillText('ok', 25, 0)
    expect(text).toContain('% de ahorro')
  })
})
