#!/usr/bin/env bash
# deploy.sh — Actualiza la app Aquantia en producción
# Uso: ./deploy.sh [--no-docker]
#   --no-docker  Solo actualiza el frontend (sin rebuild Docker)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REBUILD_DOCKER=true
if [[ "$1" == "--no-docker" ]]; then
    REBUILD_DOCKER=false
fi

echo ""
echo " Aquantia — Deploy"
echo " =================="
echo ""

# ── 1. Git pull ────────────────────────────────────────────────────────────────
echo " [1/3] Actualizando código..."
git pull
echo " OK"
echo ""

# ── 2. Frontend React ──────────────────────────────────────────────────────────
echo " [2/3] Compilando frontend React..."
if [ ! -d frontend/node_modules ]; then
    echo "  Instalando dependencias npm..."
    (cd frontend && npm install)
fi
(cd frontend && npm run build)
echo " OK — dist/ actualizado"
echo ""

# ── 3. Docker (backend) ────────────────────────────────────────────────────────
if [ "$REBUILD_DOCKER" = true ]; then
    echo " [3/3] Rebuilding y reiniciando backend Docker..."
    docker compose build
    docker compose up -d
    echo " OK — contenedor reiniciado"
else
    echo " [3/3] Docker omitido (--no-docker)"
fi

echo ""
echo " Deploy completado."
echo " Frontend: dist/ servido por Nginx"
echo " Backend:  $(docker compose ps --quiet meteostation 2>/dev/null && echo 'contenedor activo' || echo 'ver estado con: docker compose ps')"
echo ""
