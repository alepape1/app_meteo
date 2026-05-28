import { useState, useEffect, useCallback, useRef, startTransition } from 'react'
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
  soil_temperature: [], soil_ph: [], soil_ec: [], soil_tds: [],
  soil_n: [], soil_p: [], soil_k: [],
  pipeline_flow: [], pipeline_pressure: [],
  dew_point: [], heat_index: [], abs_humidity: [],
}

const AUTO_REFRESH_MS = 15000
const MAX_POINTS = 150
// Puntos objetivo para datos filtrados según el rango temporal (ms → puntos)
const FILTER_POINTS_BY_RANGE = [
  { ms: 2  * 60 * 60 * 1000,  points: 120 },  // ≤2h  → 1 pt/min
  { ms: 12 * 60 * 60 * 1000,  points: 180 },  // ≤12h → 1 pt/5min
  { ms: 2  * 24 * 60 * 60 * 1000, points: 288 }, // ≤2d → 1 pt/10min
  { ms: 7  * 24 * 60 * 60 * 1000, points: 336 }, // ≤7d → 1 pt/30min
]
const MAX_FILTERED_POINTS_DEFAULT = 500 // rangos >7d o desconocidos

function calcFilterPoints(startDate, endDate) {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime()
  if (isNaN(ms) || ms <= 0) return MAX_FILTERED_POINTS_DEFAULT
  const entry = FILTER_POINTS_BY_RANGE.find(e => ms <= e.ms)
  return entry ? entry.points : MAX_FILTERED_POINTS_DEFAULT
}

export function useWeatherData() {
  const { authFetch } = useAuth()
  // Ref estable: evita que los useCallback dependan de authFetch como valor
  // y causen un cascade de re-renders / rebuilds de interval cuando el token
  // no ha cambiado realmente.
  const authFetchRef = useRef(authFetch)
  useEffect(() => { authFetchRef.current = authFetch }, [authFetch])

  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error, setError] = useState(null)
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [devices, setDevices] = useState([])
  // Último timestamp recibido del servidor, para decidir si actualizar lastUpdate
  const lastIncomingTsRef = useRef(null)
  const [devicesLoaded, setDevicesLoaded] = useState(false)
  const [selectedMac, setSelectedMac] = useState(null)
  // Guarda los parámetros del último fetchFiltered activo.
  // Cuando no es null, el polling re-ejecuta ese filtro en lugar de fetchSamples/fetchLatest.
  const activeFilterRef = useRef(null)

  const applyData = useCallback((json, mode = 'replace', maxPoints = MAX_POINTS) => {
    const normalized = { ...EMPTY, ...(json || {}) }

    // Detección de cambio antes del startTransition: compara el último timestamp
    // entrante con el que ya teníamos. En modo replace siempre hay cambio.
    const incomingLastTs = Array.isArray(normalized.timestamp)
      ? String(normalized.timestamp.at(-1) ?? '')
      : ''
    if (mode !== 'append' || incomingLastTs !== lastIncomingTsRef.current) {
      lastIncomingTsRef.current = incomingLastTs
      setLastUpdate(new Date().toLocaleTimeString('es-ES'))
      setError(null)
    }

    // startTransition: marca la actualización de datos como no urgente para que
    // React pueda repartir los re-renders de los charts entre frames y no bloquee
    // el hilo principal con varios forced-reflow simultáneos.
    startTransition(() => {
      setData(prev => {
        if (mode !== 'append' || !Array.isArray(prev.timestamp) || prev.timestamp.length === 0) {
          const replaced = {}
          Object.keys(EMPTY).forEach((key) => {
            replaced[key] = Array.isArray(normalized[key]) ? normalized[key].slice(-maxPoints) : []
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

        if (appendIndexes.length === 0 && incomingTimestamps.at(-1) && incomingTimestamps.at(-1) === prevTimestamps.at(-1)) {
          const anyChanged = Object.keys(EMPTY).some((key) => {
            const prevArr = Array.isArray(prev[key]) ? prev[key] : []
            const nextArr = Array.isArray(normalized[key]) ? normalized[key] : []
            return prevArr.length > 0 && String(prevArr.at(-1)) !== String(nextArr.at(-1))
          })
          if (!anyChanged) return prev
        }

        const merged = {}
        Object.keys(EMPTY).forEach((key) => {
          const prevArr = Array.isArray(prev[key]) ? prev[key] : []
          const nextArr = Array.isArray(normalized[key]) ? normalized[key] : []

          if (appendIndexes.length > 0) {
            merged[key] = [
              ...prevArr,
              ...appendIndexes.map(i => (i < nextArr.length ? nextArr[i] : null)),
            ].slice(-maxPoints)
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
    })
  }, [])

  // Ref al AbortController activo para peticiones de muestras/latest/filtrar.
  // Se cancela si selectedMac cambia antes de que llegue la respuesta.
  const abortRef = useRef(null)
  // Refs para cancelar fetchLatest y fetchDeviceInfo si el poller dispara uno nuevo
  // antes de que el anterior haya respondido.
  const latestAbortRef = useRef(null)
  const deviceInfoAbortRef = useRef(null)

  const fetchSamples = useCallback(async (n = MAX_POINTS) => {
    if (!selectedMac) {
      setData(EMPTY)
      return
    }
    // Cancelar petición anterior si sigue en vuelo
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    // Salir del modo filtro: el usuario quiere datos recientes
    activeFilterRef.current = null
    setLoading(true)
    try {
      const url = `/api/muestras/${n}?mac=${encodeURIComponent(selectedMac)}`
      const res = await authFetchRef.current(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json())
    } catch (e) {
      if (e.name !== 'AbortError') setError('No se pudo conectar al servidor Flask')
    } finally {
      setLoading(false)
    }
  }, [selectedMac, applyData])

  const fetchLatest = useCallback(async () => {
    if (!selectedMac) return
    // Cancelar la petición anterior si sigue en vuelo
    if (latestAbortRef.current) latestAbortRef.current.abort()
    const controller = new AbortController()
    latestAbortRef.current = controller
    try {
      const url = `/api/latest?mac=${encodeURIComponent(selectedMac)}`
      const res = await authFetchRef.current(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const appendMax = activeFilterRef.current?.maxPoints ?? MAX_POINTS
      applyData(await res.json(), 'append', appendMax)
    } catch (e) {
      if (e.name !== 'AbortError') { /* ignorar errores transitorios del refresco */ }
    }
  }, [selectedMac, applyData])

  const fetchFiltered = useCallback(async (startDate, endDate) => {
    if (!selectedMac) return
    // Cancelar petición anterior si sigue en vuelo (mismo patrón que fetchSamples)
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const maxPoints = calcFilterPoints(startDate, endDate)
    // Guardar parámetros para que el polling sepa que hay un rango activo
    activeFilterRef.current = { startDate, endDate, maxPoints }
    setLoading(true)
    try {
      const body = { start_date: startDate, end_date: endDate, mac: selectedMac, max_points: maxPoints }
      const res = await authFetchRef.current('/api/filtrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyData(await res.json(), 'replace', maxPoints)
    } catch (e) {
      if (e.name !== 'AbortError') setError('Error al filtrar datos')
    } finally {
      setLoading(false)
    }
  }, [selectedMac, applyData])

  const fetchDeviceInfo = useCallback(async () => {
    if (!selectedMac) {
      setDeviceInfo(null)
      return
    }
    // Cancelar la petición anterior si sigue en vuelo
    if (deviceInfoAbortRef.current) deviceInfoAbortRef.current.abort()
    const controller = new AbortController()
    deviceInfoAbortRef.current = controller
    try {
      const url = `/api/device_info?mac=${encodeURIComponent(selectedMac)}`
      const res = await authFetchRef.current(url, { signal: controller.signal })
      if (!res.ok) return
      const json = await res.json()
      const nextStr = JSON.stringify(json)
      setDeviceInfo(prev => {
        if (Object.keys(json).length === 0) return null
        return JSON.stringify(prev) === nextStr ? prev : json
      })
    } catch (e) {
      if (e.name !== 'AbortError') { /* ignorar errores transitorios de device_info */ }
    }
  }, [selectedMac])

  const fetchDevices = useCallback(async () => {
    try {
      const res = await authFetchRef.current('/api/devices/mine')
      if (!res.ok) return
      const json = await res.json()
      const nextDevStr = JSON.stringify(json)
      setDevices(prev => JSON.stringify(prev) === nextDevStr ? prev : json)
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
  }, [])

  // Limpiar datos obsoletos al cambiar de dispositivo y cancelar requests en vuelo
  useEffect(() => {
    if (abortRef.current)           { abortRef.current.abort();           abortRef.current = null }
    if (latestAbortRef.current)     { latestAbortRef.current.abort();     latestAbortRef.current = null }
    if (deviceInfoAbortRef.current) { deviceInfoAbortRef.current.abort(); deviceInfoAbortRef.current = null }
    setData(EMPTY)
    setDeviceInfo(null)
    activeFilterRef.current = null
  }, [selectedMac])

  // Carga inicial y recarga al cambiar dispositivo
  useEffect(() => { fetchSamples(MAX_POINTS) }, [fetchSamples])
  useEffect(() => { fetchDeviceInfo() }, [fetchDeviceInfo])
  // Fetch de dispositivos una vez al montar
  useEffect(() => { fetchDevices() }, [fetchDevices])

  // Auto-refresco incremental: añade solo puntos nuevos y hace resincronización periódica.
  useEffect(() => {
    let tick = 0

    const refreshAll = () => {
      if (typeof document !== 'undefined' && document.hidden) return

      // Si hay un filtro activo, solo añadir el punto más reciente con fetchLatest
      // (rápido, una fila). Re-ejecutar fetchFiltered completo solo cuando el
      // usuario cambia el rango explícitamente — no en cada tick del poller.
      tick += 1
      if (activeFilterRef.current) {
        fetchLatest()
        if (tick % 8 === 0) fetchDevices()
        fetchDeviceInfo()
        return
      }
      if (tick % 4 === 0) fetchSamples(MAX_POINTS)
      else fetchLatest()

      // fetchDevices cada 8 ticks (~2 min): la lista de dispositivos no cambia
      // frecuentemente y llamarla en cada tick causaba re-renders masivos.
      if (tick % 8 === 0) fetchDevices()
      fetchDeviceInfo()
    }

    const handleVisibility = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        if (activeFilterRef.current) {
          const { startDate, endDate } = activeFilterRef.current
          fetchFiltered(startDate, endDate)
        } else {
          fetchSamples(MAX_POINTS)
        }
        fetchDeviceInfo()
      }
    }

    const id = setInterval(refreshAll, AUTO_REFRESH_MS)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility)
    }
    // Nota: NO se añade listener de 'focus' en window — visibilitychange ya
    // cubre la vuelta al tab. El handler de focus causaba doble burst de
    // peticiones al volver a la ventana.

    return () => {
      clearInterval(id)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
  }, [fetchLatest, fetchSamples, fetchFiltered, fetchDevices, fetchDeviceInfo])

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
    soil_temperature:   data.soil_temperature?.at(-1),
    soil_ph:            data.soil_ph?.at(-1),
    soil_ec:            data.soil_ec?.at(-1),
    soil_tds:           data.soil_tds?.at(-1),
    soil_n:             data.soil_n?.at(-1),
    soil_p:             data.soil_p?.at(-1),
    soil_k:             data.soil_k?.at(-1),
    pipeline_flow:      data.pipeline_flow.at(-1),
    pipeline_pressure:  data.pipeline_pressure.at(-1),
    dew_point:          data.dew_point.at(-1),
    heat_index:         data.heat_index.at(-1),
    abs_humidity:       data.abs_humidity.at(-1),
  }

  const setRelay = useCallback(async (state, index = 0) => {
    await authFetchRef.current('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac: selectedMac, state, index }),
    })
  }, [selectedMac])

  return {
    data, latest, loading, lastUpdate, error,
    deviceInfo,
    devices, devicesLoaded, selectedMac, setSelectedMac,
    fetchSamples, fetchLatest, fetchFiltered, fetchDeviceInfo, fetchDevices, setRelay,
  }
}
