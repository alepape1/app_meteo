#!/usr/bin/env bash
# monitor.sh — Monitor en tiempo real Aquantia
# Uso: ./tools/monitor.sh
#
# Layout tmux:
#   ┌──────────────────────────────────────┐
#   │         MQTT LIVE  (aquantia/#)      │  25% alto
#   ├───────────────────────┬──────────────┤
#   │   BACKEND  (todo)     │  DB últimas  │  75% alto
#   │                       │  20 filas    │
#   └───────────────────────┴──────────────┘

SESSION="aquantia-monitor"

# ── Leer MQTT_PASSWORD del .env ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
MQTT_PASS=""
if [[ -f "$ENV_FILE" ]]; then
  MQTT_PASS="$(grep -E '^MQTT_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
: "${MQTT_PASS:=cambia_esto}"

# ── Matar sesión previa ───────────────────────────────────────────────────────
tmux kill-session -t "$SESSION" 2>/dev/null || true

# ── Crear sesión ──────────────────────────────────────────────────────────────
tmux new-session -d -s "$SESSION"

# Panel 0: MQTT live — franja superior
tmux send-keys -t "$SESSION:0.0" \
  "docker exec app-mosquitto-1 mosquitto_sub \
    -h localhost -p 1883 \
    -u backend -P '$MQTT_PASS' \
    -t 'aquantia/#' -v 2>&1 \
  | while IFS= read -r l; do printf '\033[33m%s\033[0m %s\n' \"\$(date +%H:%M:%S)\" \"\$l\"; done" \
  Enter

# Dividir verticalmente 25/75 → panel inferior
tmux split-window -t "$SESSION:0.0" -v -p 75

# Panel 1 (inferior izquierda): Backend — todos los logs
tmux send-keys -t "$SESSION:0.1" \
  "docker logs app-backend-1 -f --tail=100" \
  Enter

# Dividir horizontalmente → panel inferior derecha
tmux split-window -t "$SESSION:0.1" -h -p 35

# Panel 2 (inferior derecha): DB watch
tmux send-keys -t "$SESSION:0.2" \
  "watch -n 5 \"docker exec app-timescaledb-1 psql -U aquantia -d aquantia \
    -P 'border=2' \
    -c \\\"SELECT to_char(timestamp AT TIME ZONE 'Europe/Madrid','HH24:MI:SS') hora, \
      left(device_mac,17) mac, \
      round(temperature::numeric,1) temp, \
      round(humidity::numeric,1) hum, \
      round(pressure::numeric,1) pres, \
      round(light::numeric,0) lux, \
      relay_active \
    FROM home_weather_station \
    WHERE timestamp > NOW() - INTERVAL '15 minutes' \
    ORDER BY timestamp DESC LIMIT 20;\\\"\"" \
  Enter

# Títulos de paneles
tmux select-pane -t "$SESSION:0.0" -T "MQTT LIVE — aquantia/#"
tmux select-pane -t "$SESSION:0.1" -T "BACKEND — todos los logs"
tmux select-pane -t "$SESSION:0.2" -T "DB — últimas lecturas"

# Barra de estado
tmux set -t "$SESSION" status-style          "bg=colour235,fg=colour250"
tmux set -t "$SESSION" status-left           "#[fg=colour214,bold] ◉ Aquantia  "
tmux set -t "$SESSION" status-right          "#[fg=colour245] Ctrl+B D: desconectar  Ctrl+B [: scroll "
tmux set -t "$SESSION" pane-border-style     "fg=colour238"
tmux set -t "$SESSION" pane-active-border-style "fg=colour214"
tmux set -t "$SESSION" pane-border-status    top
tmux set -t "$SESSION" pane-border-format    " #[bold]#{pane_title} "

# Enfocar el panel de backend al arrancar
tmux select-pane -t "$SESSION:0.1"

tmux attach-session -t "$SESSION"
