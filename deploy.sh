#!/usr/bin/env bash
# deploy.sh — Actualiza la app Aquantia en producción
#
# Si Node.js y npm están instalados en el servidor, compila el frontend
# automáticamente tras el git pull. Si no lo están, continúa usando el dist/
# presente en el repositorio como fallback.
#
# Uso:
#   ./deploy.sh                     — actualización normal
#   ./deploy.sh --migrate           — primer despliegue: migra SQLite → PostgreSQL
#   ./deploy.sh --no-docker         — omite rebuild Docker
#   ./deploy.sh --no-frontend-build — omite compilación frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REBUILD_DOCKER=true
MIGRATE=false
BUILD_FRONTEND=true

for arg in "$@"; do
    case $arg in
        --no-docker)         REBUILD_DOCKER=false ;;
        --migrate)           MIGRATE=true ;;
        --no-frontend-build) BUILD_FRONTEND=false ;;
    esac
done

echo ""
echo " Aquantia — Deploy"
echo " =================="
echo ""

# ── 1. Git pull ───────────────────────────────────────────────────────────────
echo " [1/3] Actualizando código..."
git pull
echo " OK"
echo ""

# ── 2. Frontend ───────────────────────────────────────────────────────────────
if [ "$BUILD_FRONTEND" = true ]; then
    if command -v npm >/dev/null 2>&1; then
        echo " [2/4] Compilando frontend..."
        (cd frontend && npm ci && npm run build)
        echo " OK — frontend compilado"
    else
        echo " [2/4] npm no está instalado; se mantiene el dist/ del repo"
    fi
else
    echo " [2/4] Build frontend omitido (--no-frontend-build)"
fi

# ── 3. Docker ─────────────────────────────────────────────────────────────────
if [ "$REBUILD_DOCKER" = true ]; then
    echo " [3/4] Rebuilding y reiniciando contenedores..."
    docker compose up -d --build --remove-orphans
    echo " OK — contenedores activos"
else
    echo " [3/4] Docker omitido (--no-docker)"
fi

# ── 4. Migración SQLite → PostgreSQL (solo primer despliegue) ──────────────────
if [ "$MIGRATE" = true ]; then
    echo ""
    echo " [4/4] Migrando datos SQLite → PostgreSQL..."
    # Esperar a que TimescaleDB esté listo
    echo "       Esperando TimescaleDB..."
    sleep 5
    docker compose exec backend python /app/migrate_sqlite_to_pg.py
    echo " OK — migración completada"
else
    echo " [4/4] Migración omitida (usa --migrate en el primer despliegue)"
fi

echo ""
echo " Deploy completado."
docker compose ps
echo ""
