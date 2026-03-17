import { useState, useEffect, useCallback } from 'react'

const EMPTY = {
  timestamp: [], temperature: [], temperature_bar: [], humidity: [],
  pressure: [], windSpeed: [], windDirection: [], windSpeedFiltered: [],
  windDirectionFiltered: [], light: [],
}

export function useWeatherData() {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error, setError] = useState(null)

  const applyData = (json) => {
    setData(json)
    setLastUpdate(new Date().toLocaleTimeString('es-ES'))
    setError(null)
  }

  const fetchSamples = useCallback(async (n = 100) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/muestras/${n}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json())
    } catch (e) {
      setError('No se pudo conectar al servidor Flask')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFiltered = useCallback(async (startDate, endDate) => {
    setLoading(true)
    try {
      const res = await fetch('/api/filtrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json())
    } catch (e) {
      setError('Error al filtrar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/latest')
      if (!res.ok) return
      const json = await res.json()
      if (json.timestamp?.length > 0) {
        setLastUpdate(new Date().toLocaleTimeString('es-ES'))
        setError(null)
      }
    } catch (_) {}
  }, [])

  // Carga inicial
  useEffect(() => { fetchSamples(150) }, [fetchSamples])

  // Auto-refresco cada 60s
  useEffect(() => {
    const id = setInterval(refresh, 60000)
    return () => clearInterval(id)
  }, [refresh])

  const latest = {
    temperature:    data.temperature.at(-1),
    temperature_bar: data.temperature_bar.at(-1),
    humidity:       data.humidity.at(-1),
    pressure:       data.pressure.at(-1),
    windSpeed:      data.windSpeed.at(-1),
    windDirection:  data.windDirection.at(-1),
  }

  return { data, latest, loading, lastUpdate, error, fetchSamples, fetchFiltered }
}
