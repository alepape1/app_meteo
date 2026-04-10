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
  const [deviceLastSeen, setDeviceLastSeen] = useState(null)
  const [devices, setDevices] = useState([])
  const [selectedMac, setSelectedMac] = useState(null)

  const applyData = (json) => {
    setData(json)
    setLastUpdate(new Date().toLocaleTimeString('es-ES'))
    setError(null)
    if (json.timestamp?.length > 0) setDeviceLastSeen(json.timestamp.at(-1))
  }

  const fetchSamples = useCallback(async (n = 100) => {
    setLoading(true)
    try {
      const url = selectedMac
        ? `/api/muestras/${n}?mac=${encodeURIComponent(selectedMac)}`
        : `/api/muestras/${n}`
      const res = await authFetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json())
    } catch (e) {
      setError('No se pudo conectar al servidor Flask')
    } finally {
      setLoading(false)
    }
  }, [selectedMac])

  const fetchFiltered = useCallback(async (startDate, endDate) => {
    setLoading(true)
    try {
      const body = { start_date: startDate, end_date: endDate }
      if (selectedMac) body.mac = selectedMac
      const res = await authFetch('/api/filtrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json())
    } catch (e) {
      setError('Error al filtrar datos')
    } finally {
      setLoading(false)
    }
  }, [selectedMac])

  const refresh = useCallback(async () => {
    try {
      const url = selectedMac
        ? `/api/latest?mac=${encodeURIComponent(selectedMac)}`
        : '/api/latest'
      const res = await authFetch(url)
      if (!res.ok) return
      const json = await res.json()
      if (json.timestamp?.length > 0) {
        setLastUpdate(new Date().toLocaleTimeString('es-ES'))
        setError(null)
        setDeviceLastSeen(json.timestamp.at(-1))
      }
    } catch (_) {}
  }, [selectedMac])

  const fetchDeviceInfo = useCallback(async () => {
    try {
      const url = selectedMac
        ? `/api/device_info?mac=${encodeURIComponent(selectedMac)}`
        : '/api/device_info'
      const res = await authFetch(url)
      if (!res.ok) return
      const json = await res.json()
      if (Object.keys(json).length > 0) setDeviceInfo(json)
    } catch (_) {}
  }, [selectedMac])

  const fetchDevices = useCallback(async () => {
    try {
      const res = await authFetch('/api/devices')
      if (!res.ok) return
      setDevices(await res.json())
    } catch (_) {}
  }, [])

  // Carga inicial y recarga al cambiar dispositivo
  useEffect(() => { fetchSamples(150) }, [fetchSamples])
  useEffect(() => { fetchDeviceInfo() }, [fetchDeviceInfo])
  // Fetch de dispositivos una vez al montar
  useEffect(() => { fetchDevices() }, [fetchDevices])

  // Auto-refresco cada 60s
  useEffect(() => {
    const id = setInterval(() => { refresh(); fetchDevices() }, 60000)
    return () => clearInterval(id)
  }, [refresh, fetchDevices])

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

  const setRelay = useCallback(async (state) => {
    await authFetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    })
  }, [])

  return {
    data, latest, loading, lastUpdate, error,
    deviceInfo, deviceLastSeen,
    devices, selectedMac, setSelectedMac,
    fetchSamples, fetchFiltered, fetchDeviceInfo, fetchDevices, setRelay,
  }
}
