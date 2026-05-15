import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlertsPanel from '../components/AlertsPanel'

const mockAuthFetch = vi.fn()

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ authFetch: mockAuthFetch }),
}))

const sampleAlerts = [
  {
    id: 1,
    alert_type: 'temperature',
    severity: 'warning',
    message: 'Temperatura alta',
    acked: 0,
    created_at: new Date().toISOString(),
    device_mac: 'AA:BB:CC:DD:EE:FF',
    finca_id: 'finca-1',
  },
  {
    id: 2,
    alert_type: 'disconnect',
    severity: 'critical',
    message: 'Dispositivo offline',
    acked: 1,
    created_at: new Date().toISOString(),
    device_mac: 'AA:BB:CC:DD:EE:FF',
    finca_id: null,
  },
]

describe('AlertsPanel', () => {
  beforeEach(() => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleAlerts),
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('renders alert messages returned from API on mount', async () => {
    render(<AlertsPanel />)
    await screen.findByText('Temperatura alta')
    expect(screen.getByText('Dispositivo offline')).toBeInTheDocument()
  })

  it('initial fetch uses ?acked=0 (pending filter is default)', async () => {
    render(<AlertsPanel />)
    await screen.findByText('Temperatura alta')
    expect(mockAuthFetch).toHaveBeenCalledWith('/api/alerts?acked=0')
  })

  it('switching to "Todas" refetches without filter', async () => {
    const user = userEvent.setup()
    render(<AlertsPanel />)
    await screen.findByText('Temperatura alta')

    await user.click(screen.getByText('Todas'))

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/alerts')
    })
  })

  it('shows "Sin alertas pendientes" empty state when API returns []', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    render(<AlertsPanel />)
    await screen.findByText('Sin alertas pendientes')
  })

  it('shows "Sin alertas registradas" empty state in "Todas" filter', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    render(<AlertsPanel />)
    await screen.findByText('Sin alertas pendientes')

    await user.click(screen.getByText('Todas'))
    await screen.findByText('Sin alertas registradas')
  })

  it('ack button calls POST /api/alerts/:id/ack', async () => {
    render(<AlertsPanel />)
    await screen.findByText('Temperatura alta')

    // Only unacked alerts have the ACK button
    const ackBtn = screen.getByTitle('Marcar como resuelto')
    fireEvent.click(ackBtn)

    expect(mockAuthFetch).toHaveBeenCalledWith('/api/alerts/1/ack', { method: 'POST' })
  })

  it('delete button calls DELETE /api/alerts/:id and removes alert from DOM', async () => {
    render(<AlertsPanel />)
    await screen.findByText('Temperatura alta')

    const deleteButtons = screen.getAllByTitle('Eliminar alerta')
    fireEvent.click(deleteButtons[0])

    expect(mockAuthFetch).toHaveBeenCalledWith('/api/alerts/1', { method: 'DELETE' })
    await waitFor(() => {
      expect(screen.queryByText('Temperatura alta')).not.toBeInTheDocument()
    })
  })

  it('"Eliminar todas" calls DELETE /api/alerts and clears the list', async () => {
    render(<AlertsPanel />)
    await screen.findByText('Temperatura alta')

    fireEvent.click(screen.getByTitle('Eliminar todas las alertas'))

    expect(mockAuthFetch).toHaveBeenCalledWith('/api/alerts', { method: 'DELETE' })
    await waitFor(() => {
      expect(screen.queryByText('Temperatura alta')).not.toBeInTheDocument()
      expect(screen.queryByText('Dispositivo offline')).not.toBeInTheDocument()
    })
  })

  it('"Eliminar todas" button is not shown when list is empty', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    render(<AlertsPanel />)
    await screen.findByText('Sin alertas pendientes')
    expect(screen.queryByTitle('Eliminar todas las alertas')).not.toBeInTheDocument()
  })
})
