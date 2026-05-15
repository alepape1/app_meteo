import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClaimDeviceView from '../components/ClaimDeviceView'

const mockAuthFetch = vi.fn()

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ authFetch: mockAuthFetch }),
}))

// html5-qrcode is only used in the camera scan flow — mock it to avoid
// browser API errors in jsdom
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn().mockImplementation(() => ({
    scanFile: vi.fn().mockResolvedValue('DEVICE-001'),
  })),
}))

describe('ClaimDeviceView', () => {
  beforeEach(() => mockAuthFetch.mockReset())
  afterEach(() => vi.clearAllMocks())

  it('renders serial number input and submit button', () => {
    render(<ClaimDeviceView />)
    expect(screen.getByPlaceholderText('AQ-FCB467F37748')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reclamar dispositivo/i })).toBeInTheDocument()
  })

  it('populates serial from initialSerial prop', () => {
    render(<ClaimDeviceView initialSerial="SN-PREPOP" />)
    expect(screen.getByDisplayValue('SN-PREPOP')).toBeInTheDocument()
  })

  it('does not submit when serial is empty', async () => {
    const user = userEvent.setup()
    render(<ClaimDeviceView />)
    // The submit button is disabled when serialNumber is empty
    expect(screen.getByRole('button', { name: /Reclamar dispositivo/i })).toBeDisabled()
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('calls POST /api/devices/claim with serial and finca_id on submit', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ serial_number: 'SN-001', finca_id: 'F1' }),
    })
    render(<ClaimDeviceView />)

    await user.type(screen.getByPlaceholderText('AQ-FCB467F37748'), 'sn-001')
    await user.type(screen.getByPlaceholderText('mi-finca'), 'F1')
    await user.click(screen.getByRole('button', { name: /Reclamar dispositivo/i }))

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/devices/claim',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ serial_number: 'SN-001', finca_id: 'F1' }),
        })
      )
    })
  })

  it('shows success state after successful claim', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ serial_number: 'SN-001', finca_id: 'F1' }),
    })
    render(<ClaimDeviceView />)

    await user.type(screen.getByPlaceholderText('AQ-FCB467F37748'), 'sn-001')
    await user.click(screen.getByRole('button', { name: /Reclamar dispositivo/i }))

    await screen.findByText('Dispositivo registrado correctamente')
  })

  it('shows error message when API returns error', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Dispositivo no encontrado' }),
    })
    render(<ClaimDeviceView />)

    await user.type(screen.getByPlaceholderText('AQ-FCB467F37748'), 'sn-999')
    await user.click(screen.getByRole('button', { name: /Reclamar dispositivo/i }))

    await screen.findByText('Dispositivo no encontrado')
  })

  it('shows generic error when network throws', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'))
    render(<ClaimDeviceView />)

    await user.type(screen.getByPlaceholderText('AQ-FCB467F37748'), 'sn-xxx')
    await user.click(screen.getByRole('button', { name: /Reclamar dispositivo/i }))

    await screen.findByText(/No se pudo conectar con el servidor/i)
  })

  it('serial input is trimmed and uppercased before submitting', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ serial_number: 'SN-ABC', finca_id: '' }),
    })
    render(<ClaimDeviceView />)

    await user.type(screen.getByPlaceholderText('AQ-FCB467F37748'), '  sn-abc  ')
    await user.click(screen.getByRole('button', { name: /Reclamar dispositivo/i }))

    await waitFor(() => {
      const body = JSON.parse(mockAuthFetch.mock.calls[0][1].body)
      expect(body.serial_number).toBe('SN-ABC')
    })
  })
})
