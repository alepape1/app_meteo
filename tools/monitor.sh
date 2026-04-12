#!/usr/bin/env bash
# monitor.sh — Monitor en tiempo real para Aquantia
# Uso: ./tools/monitor.sh [--no-tmux]
#
# Abre una sesión tmux con 4 paneles:
#   [0] Mosquitto logs  [1] MQTT live (suscriptor)
#   [2] Backend logs    [3] DB — últimas inserciones
#
# Sin tmux (--no-tmux): imprime todo en un solo stream con prefijos de color.

set -euo pipefail

SESSION="aquantia-monitor"

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'; RESET='\033[0m'

# ── Comandos de cada panel ─────────────────────────────────────────────────────
CMD_MOSQUITTO="docker logs app-mosquitto-1 -f --tail=50 2>&1 \
  | grep --line-buffered -v 'level=debug' \
  | sed 's/^/[MQTT] /'"

CMD_MQTTSUB="docker exec app-mosquitto-1 mosquitto_sub \
  -h localhost -p 1883 \
  -u backend -P \"\${MQTT_PASSWORD:-cambia_esto}\" \
  -t 'aquantia/#' -v 2>&1 \
  | grep --line-buffered '' \
  | while IFS= read -r line; do
      echo \"\$(date '+%H:%M:%S') \$line\"
    done"

CMD_BACKEND="docker logs app-backend-1 -f --tail=50 2>&1 \
  | grep --line-buffered -E 'INFO|WARNING|ERROR|mqtt|telemetry|relay|register|auth' \
  | sed 's/^/[BACK] /'"

CMD_DB="watch -n 5 \"docker exec app-timescaledb-1 psql -U aquantia -d aquantia -t -A -F'|' -c \\\"
SELECT
  to_char(timestamp AT TIME ZONE 'Europe/Madrid', 'HH24:MI:SS') AS hora,
  device_mac,
  round(temperature::numeric,2)  AS temp,
  round(humidity::numeric,1)     AS hum,
  round(pressure::numeric,2)     AS pres,
  round(light::numeric,1)        AS lux,
  relay_active
FROM home_weather_station
WHERE timestamp > NOW() - INTERVAL '10 minutes'
ORDER BY timestamp DESC
LIMIT 20;
\\\"\""

# ── Función para leer MQTT_PASSWORD del .env ──────────────────────────────────
get_mqtt_pass() {
  local env_file
  env_file="$(dirname "$0")/../.env"
  if [[ -f "$env_file" ]]; then
    grep -E '^MQTT_PASSWORD=' "$env_file" | cut -d= -f2- | tr -d '"' | tr -d "'"
  else
    echo "cambia_esto"
  fi
}

MQTT_PASS="$(get_mqtt_pass)"

# ── Modo sin tmux ─────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--no-tmux" ]]; then
  echo -e "${CYAN}=== Aquantia Monitor (sin tmux) ===${RESET}"
  echo -e "${YELLOW}Ctrl+C para salir${RESET}\n"

  # Fondo: logs mosquitto + backend
  docker logs app-mosquitto-1 -f --tail=20 2>&1 \
    | grep --line-buffered -v 'level=debug' \
    | sed "s/^/$(printf "${RED}[MQTT]${RESET}") /" &
  PID_MOSQ=$!

  docker logs app-backend-1 -f --tail=20 2>&1 \
    | grep --line-buffered -E 'INFO|WARNING|ERROR|mqtt|telemetry|relay|register|auth' \
    | sed "s/^/$(printf "${GREEN}[BACK]${RESET}") /" &
  PID_BACK=$!

  # Suscriptor MQTT en primer plano
  echo -e "${BLUE}[MQTT-SUB] Escuchando aquantia/# ...${RESET}"
  docker exec app-mosquitto-1 mosquitto_sub \
    -h localhost -p 1883 \
    -u backend -P "$MQTT_PASS" \
    -t 'aquantia/#' -v 2>&1 \
    | while IFS= read -r line; do
        printf "${CYAN}%s ${YELLOW}%s${RESET}\n" "$(date '+%H:%M:%S')" "$line"
      done

  kill $PID_MOSQ $PID_BACK 2>/dev/null
  exit 0
fi

# ── Modo tmux ─────────────────────────────────────────────────────────────────
if ! command -v tmux &>/dev/null; then
  echo -e "${YELLOW}tmux no encontrado. Usa: $0 --no-tmux${RESET}"
  exit 1
fi

# Matar sesión previa si existe
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Crear sesión y paneles
#  Layout: 2 filas × 2 columnas
#  ┌─────────────────┬─────────────────┐
#  │  0 Mosquitto    │  1 MQTT live    │
#  ├─────────────────┼─────────────────┤
#  │  2 Backend      │  3 DB watch     │
#  └─────────────────┴─────────────────┘

tmux new-session  -d -s "$SESSION" -x 220 -y 50

# Panel 0 (izquierda arriba) — Mosquitto logs
tmux send-keys -t "$SESSION:0.0" \
  "printf '\033[0;31m=== MOSQUITTO LOGS ===\033[0m\n'; $CMD_MOSQUITTO" Enter

# Dividir horizontalmente → panel 1 (derecha arriba) — MQTT suscriptor
tmux split-window -t "$SESSION:0.0" -h
tmux send-keys -t "$SESSION:0.1" \
  "printf '\033[0;33m=== MQTT LIVE (aquantia/#) ===\033[0m\n'; MQTT_PASSWORD='$MQTT_PASS' bash -c \"docker exec app-mosquitto-1 mosquitto_sub -h localhost -p 1883 -u backend -P '$MQTT_PASS' -t 'aquantia/#' -v 2>&1 | while IFS= read -r l; do printf '%s %s\n' \\\"\$(date +%H:%M:%S)\\\" \\\"\$l\\\"; done\"" Enter

# Seleccionar panel 0, dividir verticalmente → panel 2 (izquierda abajo) — Backend
tmux select-pane  -t "$SESSION:0.0"
tmux split-window -t "$SESSION:0.0" -v
tmux send-keys -t "$SESSION:0.2" \
  "printf '\033[0;32m=== BACKEND LOGS ===\033[0m\n'; $CMD_BACKEND" Enter

# Seleccionar panel 1, dividir verticalmente → panel 3 (derecha abajo) — DB
tmux select-pane  -t "$SESSION:0.1"
tmux split-window -t "$SESSION:0.1" -v
tmux send-keys -t "$SESSION:0.3" \
  "printf '\033[0;36m=== DB — últimas filas (refresh 5s) ===\033[0m\n'; $CMD_DB" Enter

# Equilibrar tamaños
tmux select-layout -t "$SESSION" tiled

# Mostrar leyenda
tmux set-option -t "$SESSION" status-left \
  "#[fg=yellow,bold] Aquantia Monitor  #[fg=white]| [0]Mosq [1]MQTT-sub [2]Back [3]DB | q para salir "

echo -e "${GREEN}Sesión tmux '${SESSION}' creada.${RESET}"
echo -e "${CYAN}Conectando... (Ctrl+B D para desconectar sin cerrar)${RESET}"
tmux attach-session -t "$SESSION"
