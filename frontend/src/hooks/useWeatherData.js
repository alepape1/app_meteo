import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../AuthContext'

const EMPTY = {
  timestamp: [], temperature: [], temperature_bar: [], humidity: [],
  pressure: [], windSpeed: [], windDirection: [], windSpeedFiltered: [],
  windDirectionFiltered: [], light: [],
  dht_temperature: [], dht_humidity: [],
  rssi: [], free_heap: [], uptime_s: [], relay_active: [],
  soil_moisture: [],
}

export function useWeatherData() {
  const { authFetch } = useAuth()
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error, setError] = useState(null)
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [devices, setDevices] = useState([])
  const [devicesLoaded, setDevicesLoaded] = useState(false)
  const [selectedMac, setSelectedMac] = useState(null)

  const applyData = (json) => {
    const normalized = { ...EMPTY, ...(json || {}) }
    setData(normalized)
    setLastUpdate(new Date().toLocaleTimeString('es-ES'))
    setError(null)
  }

  const fetchSamples = useCallback(async (n = 100) => {
    if (!selectedMac) {
      setData(EMPTY)
      return
    }
    setLoading(true)
    try {
      const url = `/api/muestras/${n}?mac=${encodeURIComponent(selectedMac)}`
      const res = await authFetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json())
    } catch {
      setError('No se pudo conectar al servidor Flask')
    } finally {
      setLoading(false)
    }
  }, [authFetch, selectedMac])

  const fetchFiltered = useCallback(async (startDate, endDate) => {
    if (!selectedMac) return
    setLoading(true)
    try {
      const body = { start_date: startDate, end_date: endDate, mac: selectedMac }
      const res = await authFetch('/api/filtrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json())
    } catch {
      setError('Error al filtrar datos')
    } finally {
      setLoading(false)
    }
  }, [authFetch, selectedMac])

  const fetchDeviceInfo = useCallback(async () => {
    if (!selectedMac) {
      setDeviceInfo(null)
      return
    }
    try {
      const url = `/api/device_info?mac=${encodeURIComponent(selectedMac)}`
      const res = await authFetch(url)
      if (!res.ok) return
      const json = await res.json()
      if (Object.keys(json).length > 0) setDeviceInfo(json)
      else setDeviceInfo(null)
    } catch {
      // Ignorar errores transitorios de información del dispositivo.
    }
  }, [authFetch, selectedMac])

  const fetchDevices = useCallback(async () => {
    try {
      const res = await authFetch('/api/devices/mine')
      if (!res.ok) return
      const json = await res.json()
      setDevices(json)
      setSelectedMac(current => (
        current && json.some(device => device.mac_address === current)
          ? current
          : (json[0]?.mac_address ?? null)
      ))
    } catch {
      // Ignorar errores transitorios de la lista de dispositivos.
    } finally {
      setDevicesLoaded(true)
    }
  }, [authFetch])

  // Carga inicial y recarga al cambiar dispositivo
  useEffect(() => { fetchSamples(150) }, [fetchSamples])
  useEffect(() => { fetchDeviceInfo() }, [fetchDeviceInfo])
  // Fetch de dispositivos una vez al montar
  useEffect(() => { fetchDevices() }, [fetchDevices])

  // Auto-refresco cada 60s — actualiza gráficos y lista de dispositivos
  useEffect(() => {
    const id = setInterval(() => { fetchSamples(150); fetchDevices() }, 60000)
    return () => clearInterval(id)
  }, [fetchSamples, fetchDevices])

  const latest = {
    temperature:     data.temperature.at(-1),
    temperature_bar: data.temperature_bar.at(-1),
    humidity:        data.humidity.at(-1),
    pressure:        data.pressure.at(-1),
    windSpeed:       data.windSpeed.at(-1),
    windDirection:   data.windDirection.at(-1),
    rssi:            data.rssi.at(-1),
    free_heap:       data.free_heap.at(-1),
    uptime_s:        data.uptime_s.at(-1),
    relay_active:    data.relay_active.at(-1) ?? 0,
    soil_moisture:   data.soil_moisture.at(-1),
  }

  const setRelay = useCallback(async (state, index = 0) => {
    await authFetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac: selectedMac, state, index }),
    })
  }, [authFetch, selectedMac])

  return {
    data, latest, loading, lastUpdate, error,
    deviceInfo,
    devices, devicesLoaded, selectedMac, setSelectedMac,
    fetchSamples, fetchFiltered, fetchDeviceInfo, fetchDevices, setRelay,
  }
}
