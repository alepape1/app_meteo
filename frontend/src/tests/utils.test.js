/**
 * Tests for pure helper functions.
 * These functions are exported from their respective component files
 * specifically to enable unit testing without full component rendering.
 */
import { describe, it, expect } from 'vitest'
import { toMs, clampInput } from '../components/PipelineView'
import { calcET0, getAdvice } from '../components/IrrigationView'
import { parseSerial } from '../components/ClaimDeviceView'

// ─── toMs ────────────────────────────────────────────────────────────────────
describe('toMs', () => {
  it('returns null for null input', () => {
    expect(toMs(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(toMs(undefined)).toBeNull()
  })

  it('returns numeric value unchanged', () => {
    expect(toMs(1700000000000)).toBe(1700000000000)
  })

  it('returns null for NaN number', () => {
    expect(toMs(NaN)).toBeNull()
  })

  it('parses a valid ISO string', () => {
    const iso = '2024-06-15T10:00:00.000Z'
    const expected = new Date(iso).getTime()
    expect(toMs(iso)).toBe(expected)
  })

  it('returns null for an unparseable string', () => {
    expect(toMs('not-a-date')).toBeNull()
  })

  it('handles space-separated datetime string', () => {
    const spaced = '2024-06-15 10:00:00'
    const result = toMs(spaced)
    expect(result).toBeTypeOf('number')
    expect(Number.isNaN(result)).toBe(false)
  })
})

// ─── clampInput ──────────────────────────────────────────────────────────────
describe('clampInput', () => {
  it('returns value when within range', () => {
    expect(clampInput('5', 1, 10)).toBe(5)
  })

  it('clamps to min when below range', () => {
    expect(clampInput('0', 1, 10)).toBe(1)
  })

  it('clamps to max when above range', () => {
    expect(clampInput('15', 1, 10)).toBe(10)
  })

  it('returns min for non-numeric string', () => {
    expect(clampInput('abc', 1, 10)).toBe(1)
  })

  it('returns min for empty string', () => {
    expect(clampInput('', 2, 8)).toBe(2)
  })
})

// ─── calcET0 ─────────────────────────────────────────────────────────────────
describe('calcET0', () => {
  it('returns null when temp is null', () => {
    expect(calcET0(null, 50, 2)).toBeNull()
  })

  it('returns a numeric string for valid inputs', () => {
    const result = calcET0(25, 60, 2)
    expect(typeof result).toBe('string')
    expect(Number.isNaN(Number(result))).toBe(false)
  })

  it('returns non-negative value', () => {
    const result = calcET0(10, 90, 1)
    expect(Number(result)).toBeGreaterThanOrEqual(0)
  })

  it('returns higher ET0 for higher temperature', () => {
    const low = Number(calcET0(15, 50, 2))
    const high = Number(calcET0(35, 50, 2))
    expect(high).toBeGreaterThan(low)
  })

  it('uses 60% humidity default when humidity is null', () => {
    const result = calcET0(25, null, 2)
    expect(result).not.toBeNull()
    expect(Number.isNaN(Number(result))).toBe(false)
  })
})

// ─── getAdvice ───────────────────────────────────────────────────────────────
describe('getAdvice', () => {
  it('returns nodata when temp is null', () => {
    const advice = getAdvice(null, 50, 2, 3)
    expect(advice.level).toBe('nodata')
  })

  it('returns skip when humidity > 82', () => {
    const advice = getAdvice(22, 85, 2, 2)
    expect(advice.level).toBe('skip')
    expect(advice.color).toBe('blue')
  })

  it('returns bad when wind > 5', () => {
    const advice = getAdvice(22, 50, 6, 3)
    expect(advice.level).toBe('bad')
    expect(advice.color).toBe('orange')
  })

  it('returns bad when temp > 35', () => {
    const advice = getAdvice(38, 40, 2, 5)
    expect(advice.level).toBe('bad')
    expect(advice.color).toBe('red')
  })

  it('returns an object with level, color, title, reason', () => {
    const advice = getAdvice(22, 50, 2, 3)
    expect(advice).toHaveProperty('level')
    expect(advice).toHaveProperty('color')
    expect(advice).toHaveProperty('title')
    expect(advice).toHaveProperty('reason')
  })
})

// ─── parseSerial ─────────────────────────────────────────────────────────────
describe('parseSerial', () => {
  it('returns plain text uppercased and trimmed', () => {
    expect(parseSerial('  abc123  ')).toBe('ABC123')
  })

  it('extracts serial param from a URL', () => {
    expect(parseSerial('https://aquantia.app/claim?serial=sn-001')).toBe('SN-001')
  })

  it('falls back to full text uppercased when URL has no serial param', () => {
    expect(parseSerial('https://aquantia.app/claim?other=x')).toBe('HTTPS://AQUANTIA.APP/CLAIM?OTHER=X')
  })

  it('handles already-uppercase input', () => {
    expect(parseSerial('DEVICE-42')).toBe('DEVICE-42')
  })
})
