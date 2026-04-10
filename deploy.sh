#!/usr/bin/env bash
# deploy.sh — Actualiza la app Aquantia en producción
# El dist/ viene precompilado en el repo (no requiere npm en el servidor)
#
# Uso:
#   ./deploy.sh              — actualización normal
#   ./deploy.sh --migrate    — primer despliegue: migra SQLite → PostgreSQL
#   ./deploy.sh --no-docker  — solo actualiza el frontend (sin rebuild Docker)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REBUILD_DOCKER=true
MIGRATE=false

for arg in "$@"; do
    case $arg in
        --no-docker) REBUILD_DOCKER=false ;;
        --migrate)   MIGRATE=true ;;
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

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if [ "$REBUILD_DOCKER" = true ]; then
    echo " [2/3] Rebuilding y reiniciando contenedores..."
    docker compose up -d --build
    echo " OK — contenedores activos"
else
    echo " [2/3] Docker omitido (--no-docker)"
fi

# ── 3. Migración SQLite → PostgreSQL (solo primer despliegue) ──────────────────
if [ "$MIGRATE" = true ]; then
    echo ""
    echo " [3/3] Migrando datos SQLite → PostgreSQL..."
    # Esperar a que TimescaleDB esté listo
    echo "       Esperando TimescaleDB..."
    sleep 5
    docker compose exec backend python /app/migrate_sqlite_to_pg.py
    echo " OK — migración completada"
else
    echo " [3/3] Migración omitida (usa --migrate en el primer despliegue)"
fi

echo ""
echo " Deploy completado."
docker compose ps
echo ""
