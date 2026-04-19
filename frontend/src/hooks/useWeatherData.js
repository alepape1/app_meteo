import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../AuthContext'

const EMPTY = {
  timestamp: [], temperature: [], temperature_bar: [], humidity: [],
  pressure: [], temperature_source: [], pressure_source: [],
  bmp280_ok: [], bmp280_temperature: [], bmp280_pressure: [],
  windSpeed: [], windDirection: [], windSpeedFiltered: [],
  windDirectionFiltered: [], light: [],
  dht_temperature: [], dht_humidity: [],
  rssi: [], free_heap: [], uptime_s: [], relay_active: [],
  soil_moisture: [],
}

const AUTO_REFRESH_MS = 15000
const MAX_POINTS = 150

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

  const applyData = useCallback((json, mode = 'replace') => {
    const normalized = { ...EMPTY, ...(json || {}) }

    setData(prev => {
      if (mode !== 'append' || !Array.isArray(prev.timestamp) || prev.timestamp.length === 0) {
        const replaced = {}
        Object.keys(EMPTY).forEach((key) => {
          replaced[key] = Array.isArray(normalized[key]) ? normalized[key].slice(-MAX_POINTS) : []
        })
        return replaced
      }

      const prevTimestamps = prev.timestamp.map(v => String(v))
      const incomingTimestamps = Array.isArray(normalized.timestamp)
        ? normalized.timestamp.map(v => String(v))
        : []

      const seen = new Set(prevTimestamps)
      const appendIndexes = []
      incomingTimestamps.forEach((ts, index) => {
        if (!seen.has(ts)) appendIndexes.push(index)
      })

      const merged = {}
      Object.keys(EMPTY).forEach((key) => {
        const prevArr = Array.isArray(prev[key]) ? prev[key] : []
        const nextArr = Array.isArray(normalized[key]) ? normalized[key] : []

        if (appendIndexes.length > 0) {
          merged[key] = [
            ...prevArr,
            ...appendIndexes.map(i => (i < nextArr.length ? nextArr[i] : null)),
          ].slice(-MAX_POINTS)
          return
        }

        if (incomingTimestamps.at(-1) && incomingTimestamps.at(-1) === prevTimestamps.at(-1) && prevArr.length > 0) {
          const updated = prevArr.slice()
          updated[updated.length - 1] = nextArr.at(-1) ?? updated.at(-1)
          merged[key] = updated
          return
        }

        merged[key] = prevArr
      })

      return merged
    })

    setLastUpdate(new Date().toLocaleTimeString('es-ES'))
    setError(null)
  }, [])

  const fetchSamples = useCallback(async (n = MAX_POINTS) => {
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

  const fetchLatest = useCallback(async () => {
    if (!selectedMac) return
    try {
      const url = `/api/latest?mac=${encodeURIComponent(selectedMac)}`
      const res = await authFetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json(), 'append')
    } catch {
      // Ignorar errores transitorios del refresco incremental.
    }
  }, [authFetch, selectedMac, applyData])

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

  // Auto-refresco incremental: añade solo puntos nuevos y hace resincronización periódica.
  useEffect(() => {
    let tick = 0

    const refreshAll = () => {
      if (typeof document !== 'undefined' && document.hidden) return

      tick += 1
      if (tick % 4 === 0) fetchSamples(MAX_POINTS)
      else fetchLatest()

      fetchDevices()
      fetchDeviceInfo()
    }

    const handleVisibility = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        fetchSamples(MAX_POINTS)
        fetchDevices()
        fetchDeviceInfo()
      }
    }

    const id = setInterval(refreshAll, AUTO_REFRESH_MS)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibility)
    }

    return () => {
      clearInterval(id)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibility)
      }
    }
  }, [fetchLatest, fetchSamples, fetchDevices, fetchDeviceInfo])

  const latest = {
    temperature:        data.temperature.at(-1),
    temperature_bar:    data.temperature_bar.at(-1),
    humidity:           data.humidity.at(-1),
    pressure:           data.pressure.at(-1),
    temperature_source: data.temperature_source.at(-1),
    pressure_source:    data.pressure_source.at(-1),
    bmp280_ok:          data.bmp280_ok.at(-1),
    bmp280_temperature: data.bmp280_temperature.at(-1),
    bmp280_pressure:    data.bmp280_pressure.at(-1),
    windSpeed:          data.windSpeed.at(-1),
    windDirection:      data.windDirection.at(-1),
    rssi:               data.rssi.at(-1),
    free_heap:          data.free_heap.at(-1),
    uptime_s:           data.uptime_s.at(-1),
    relay_active:       data.relay_active.at(-1) ?? 0,
    soil_moisture:      data.soil_moisture.at(-1),
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
    fetchSamples, fetchLatest, fetchFiltered, fetchDeviceInfo, fetchDevices, setRelay,
  }
}
