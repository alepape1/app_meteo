import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockFetch = vi.fn()

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ authFetch: mockFetch }),
}))

import { toMs, clampInput } from '../components/PipelineView'
import PipelineView from '../components/PipelineView'

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeStatus = (detectionStatus, current = null, confidence = 0.85) => ({
  current,
  detection: { status: detectionStatus, confidence, alerts: [] },
  config: {
    scenario: 'normal',
    mode: 'sim',
    irrigation_type: 'sprinkler',
    leak_detect_trained: false,
    source: 'sim',
  },
})

// fetchLive makes two concurrent calls: /status and /readings
// applyConfig makes one POST, then fetchLive (two more GETs)
const setupMockFetch = (statusData) => {
  mockFetch.mockImplementation((url, opts) => {
    if (opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ scenario: 'leak', mode: 'sim', irrigation_type: 'sprinkler' }),
      })
    }
    if (typeof url === 'string' && url.includes('/status')) {
      return Promise.resolve({ ok: true, json: async () => statusData })
    }
    // /readings endpoint
    return Promise.resolve({ ok: true, json: async () => [] })
  })
}

// ── Bloque 1: toMs — conversión de timestamps ────────────────────────────────

describe('toMs', () => {
  it('número finito 1234567890 → mismo número', () => {
    expect(toMs(1234567890)).toBe(1234567890)
  })

  it('0 → 0', () => {
    expect(toMs(0)).toBe(0)
  })

  it('NaN (pasado como Number) → null', () => {
    expect(toMs(NaN)).toBeNull()
  })

  it('ISO string → número finito', () => {
    const result = toMs('2025-05-15T10:00:00')
    expect(Number.isFinite(result)).toBe(true)
  })

  it('string con espacio → número finito (reemplaza espacio por T)', () => {
    const result = toMs('2025-05-15 10:00:00')
    expect(Number.isFinite(result)).toBe(true)
  })

  it('null → null', () => {
    expect(toMs(null)).toBeNull()
  })

  it('string inválido "not-a-date" → null', () => {
    expect(toMs('not-a-date')).toBeNull()
  })
})

// ── Bloque 2: clampInput — clamp de enteros ──────────────────────────────────

describe('clampInput', () => {
  it('valor dentro del rango (5, min=1, max=10) → 5', () => {
    expect(clampInput(5, 1, 10)).toBe(5)
  })

  it('valor por debajo del mínimo (0, min=1, max=10) → 1', () => {
    expect(clampInput(0, 1, 10)).toBe(1)
  })

  it('valor por encima del máximo (15, min=1, max=10) → 10', () => {
    expect(clampInput(15, 1, 10)).toBe(10)
  })

  it('string numérico ("7", min=1, max=10) → 7', () => {
    expect(clampInput('7', 1, 10)).toBe(7)
  })

  it('NaN como string ("abc", min=1, max=10) → min', () => {
    expect(clampInput('abc', 1, 10)).toBe(1)
  })

  it('float ("3.9", min=1, max=10) → 3 (parseInt trunca)', () => {
    expect(clampInput('3.9', 1, 10)).toBe(3)
  })
})

// ── Bloque 3: STATUS_CFG — labels renderizados en StatusBanner ───────────────

describe('STATUS_CFG labels via PipelineView', () => {
  afterEach(() => vi.clearAllMocks())

  it('NORMAL → "Sistema normal" visible', async () => {
    setupMockFetch(makeStatus('NORMAL'))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Sistema normal')
  })

  it('LEAK → "Fuga detectada" visible', async () => {
    setupMockFetch(makeStatus('LEAK'))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Fuga detectada')
  })

  it('BURST → "Rotura detectada" visible', async () => {
    setupMockFetch(makeStatus('BURST'))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Rotura detectada')
  })

  it('OBSTRUCTION → "Obstrucción detectada" visible', async () => {
    setupMockFetch(makeStatus('OBSTRUCTION'))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Obstrucción detectada')
  })

  it('NO_DATA → "Sin datos suficientes" visible', async () => {
    setupMockFetch(makeStatus('NO_DATA'))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Sin datos suficientes')
  })
})

// ── Bloque 4: ReadingCard — sub-componente de métricas ───────────────────────

describe('ReadingCard via PipelineView', () => {
  afterEach(() => vi.clearAllMocks())

  it('con datos de presión → valor numérico de presión visible', async () => {
    setupMockFetch(makeStatus('NORMAL', { pressure_bar: 2.5, flow_lpm: 4.2 }))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('2.5')
  })

  it('con datos de caudal → valor numérico de caudal visible', async () => {
    setupMockFetch(makeStatus('NORMAL', { pressure_bar: 2.5, flow_lpm: 4.2 }))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('4.2')
  })

  it('current null → guión visible en lugar de valores numéricos', async () => {
    setupMockFetch(makeStatus('NO_DATA', null))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Sin datos suficientes')
    // con current=null, pressure_bar y flow_lpm son undefined → ReadingCard renderiza '—'
    expect(document.body.innerHTML).toContain('—')
    expect(screen.queryByText('2.5')).toBeNull()
    expect(screen.queryByText('4.2')).toBeNull()
  })

  it('detection.alerts con item → mensaje de alerta visible en StatusBanner', async () => {
    const statusWithAlert = {
      current: { pressure_bar: 2.5, flow_lpm: 4.2 },
      detection: {
        status: 'LEAK',
        confidence: 0.9,
        alerts: [{ method: 'THRESHOLD', message: 'Caudal elevado detectado' }],
      },
      config: { scenario: 'normal', mode: 'sim', irrigation_type: 'sprinkler', source: 'sim' },
    }
    setupMockFetch(statusWithAlert)
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Caudal elevado detectado')
  })
})

// ── Bloque 5: Interacciones UI ───────────────────────────────────────────────

describe('PipelineView UI interactions', () => {
  beforeEach(() => {
    setupMockFetch(makeStatus('NORMAL', { pressure_bar: 2.5, flow_lpm: 4.2 }))
  })

  afterEach(() => vi.clearAllMocks())

  it('botón "Normal" de escenario está visible', async () => {
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Sistema normal')
    expect(screen.getByText('Normal')).toBeInTheDocument()
  })

  it('botón "Simulación" de modo está visible', async () => {
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Sistema normal')
    expect(screen.getByText('Simulación')).toBeInTheDocument()
  })

  it('botón "Aspersión" de tipo de irrigación está visible', async () => {
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Sistema normal')
    // "Aspersión" aparece en el selector Y en DetectionStats como etiqueta del perfil
    const elements = screen.getAllByText('Aspersión')
    expect(elements.length).toBeGreaterThan(0)
  })

  it('cambiar escenario llama a authFetch con POST a /api/pipeline/config', async () => {
    const user = userEvent.setup()
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Sistema normal')
    // "Fuga" is the label for scenario 'leak', not currently selected
    await user.click(screen.getByText('Fuga'))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/pipeline/config',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('botón Actualizar existe y al hacer click llama a authFetch', async () => {
    render(<PipelineView selectedMac={null} />)
    const refreshBtn = await screen.findByText('Actualizar')
    expect(refreshBtn).toBeInTheDocument()
    const callCountBefore = mockFetch.mock.calls.length
    fireEvent.click(refreshBtn)
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callCountBefore)
    })
  })

  it('renderiza sin crash con selectedMac=null', async () => {
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('Sistema normal')
  })

  it('renderiza sin crash con selectedMac=MAC y pasa MAC en la URL', async () => {
    render(<PipelineView selectedMac="AA:BB:CC:DD:EE:FF" />)
    await screen.findByText('Sistema normal')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('AA%3ABB%3ACC%3ADD%3AEE%3AFF'),
      expect.anything(),
    )
  })

  it('confidence=0.9 y status LEAK → "90% confianza" visible', async () => {
    setupMockFetch(makeStatus('LEAK', { pressure_bar: 2.5, flow_lpm: 0.3 }, 0.9))
    render(<PipelineView selectedMac={null} />)
    await screen.findByText('90% confianza')
  })
})
