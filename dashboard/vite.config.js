import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Lee el puerto de new_version_meteo/.env (fuente única de verdad)
function loadFlaskEnv() {
  const envPath = path.resolve(__dirname, '../new_version_meteo/.env')
  const defaults = { FLASK_HOST: '127.0.0.1', FLASK_PORT: '7000' }
  try {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const [k, v] = line.split('=')
      if (k && v) defaults[k.trim()] = v.trim()
    }
  } catch (_) {}
  return defaults
}

const flaskEnv = loadFlaskEnv()
const flaskUrl = `http://127.0.0.1:${flaskEnv.FLASK_PORT}`

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': flaskUrl,
      '/descargar': flaskUrl,
    },
  },
})
