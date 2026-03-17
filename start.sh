#!/usr/bin/env bash
set -e

echo ""
echo " MeteoStation - Arranque"
echo " ========================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- Crear .env si no existe ---
if [ ! -f backend/.env ]; then
    echo " Creando backend/.env desde .env.example..."
    cp backend/.env.example backend/.env
fi

# --- Instalar dependencias Python si faltan ---
if ! python3 -c "import flask" 2>/dev/null; then
    echo " Instalando dependencias Python..."
    pip3 install -r backend/requirements.txt
fi

# --- Instalar dependencias Node si faltan ---
if [ ! -d frontend/node_modules ]; then
    echo " Instalando dependencias Node..."
    (cd frontend && npm install)
fi

echo ""
echo " Iniciando servicios... (Ctrl+C para detener todo)"
echo ""

# Arranca backend y frontend en segundo plano
python3 backend/app.py &
PID_BACKEND=$!

(cd frontend && npm run dev) &
PID_FRONTEND=$!

echo " Backend  PID: $PID_BACKEND  -> http://localhost:7000"
echo " Frontend PID: $PID_FRONTEND -> http://localhost:5173"
echo ""

# Al pulsar Ctrl+C mata ambos procesos
trap "echo ''; echo ' Deteniendo servicios...'; kill $PID_BACKEND $PID_FRONTEND 2>/dev/null; exit 0" INT TERM

wait
