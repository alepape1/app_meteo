#!/usr/bin/env bash
# deploy.sh — Actualiza la app Aquantia en producción
# El dist/ viene precompilado en el repo (no requiere npm en el servidor)
#
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

# ── 1. Git pull (trae código + dist/ precompilado) ─────────────────────────────
echo " [1/2] Actualizando código..."
git pull
echo " OK"
echo ""

# ── 2. Docker (backend) ────────────────────────────────────────────────────────
if [ "$REBUILD_DOCKER" = true ]; then
    echo " [2/2] Rebuilding y reiniciando backend Docker..."
    docker compose build
    docker compose up -d
    echo " OK — contenedor reiniciado"
else
    echo " [2/2] Docker omitido (--no-docker)"
fi

echo ""
echo " Deploy completado."
echo " Frontend: dist/ actualizado via git"
echo " Backend:  $(docker compose ps 2>/dev/null | grep meteostation | grep -q Up && echo 'contenedor activo' || echo 'ver estado con: docker compose ps')"
echo ""
