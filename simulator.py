"""
Simulador de estacion meteorologica (ESP32)
==========================================
Genera datos meteorologicos realistas y los envia al servidor Flask
exactamente como lo haria el hardware real.

Uso:
    python simulator.py                        # localhost:5000, cada 5s
    python simulator.py --host 192.168.1.32    # servidor en red local
    python simulator.py --interval 2           # enviar cada 2 segundos
    python simulator.py --interval 2 --count 50  # solo 50 muestras y para
"""

import argparse
import time
import random
import math
import sys

try:
    import requests
except ImportError:
    print("Falta la libreria 'requests'. Instalala con:  pip install requests")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Generador de datos meteorologicos realistas
# ---------------------------------------------------------------------------

class WeatherSimulator:
    def __init__(self):
        # Valores iniciales plausibles
        self.temp        = 20.0    # °C
        self.temp_bar    = 19.5    # °C (sensor barometrico, ligeramente distinto)
        self.humidity    = 60.0    # %
        self.pressure    = 1013.0  # hPa
        self.wind_speed  = 3.0     # m/s
        self.wind_dir    = 180.0   # grados (0-360)

        # Historial para el filtro de media movil del viento (como hace un ESP32 real)
        self._ws_history = [3.0] * 5
        self._wd_history = [180.0] * 5

        self._step = 0

    def next(self):
        self._step += 1

        # --- Temperatura: deriva lenta + ruido pequeno ---
        # Simula ciclo diario muy suavizado
        daily_wave = math.sin(self._step / 120) * 3.0
        self.temp     = 20.0 + daily_wave + random.gauss(0, 0.3)
        self.temp_bar = self.temp - 0.5 + random.gauss(0, 0.15)
        self.temp     = round(max(-10, min(50, self.temp)), 2)
        self.temp_bar = round(max(-10, min(50, self.temp_bar)), 2)

        # --- Humedad ---
        self.humidity += random.gauss(0, 1.0)
        self.humidity  = round(max(20.0, min(99.0, self.humidity)), 2)

        # --- Presion ---
        self.pressure += random.gauss(0, 0.2)
        self.pressure  = round(max(970.0, min(1040.0, self.pressure)), 2)

        # --- Viento: rafagas con media movil ---
        self.wind_speed += random.gauss(0, 0.8)
        self.wind_speed  = round(max(0.0, min(25.0, self.wind_speed)), 2)

        self.wind_dir   += random.gauss(0, 8.0)
        self.wind_dir    = self.wind_dir % 360
        self.wind_dir    = round(self.wind_dir, 2)

        # Filtro media movil (ventana de 5 muestras)
        self._ws_history = self._ws_history[1:] + [self.wind_speed]
        self._wd_history = self._wd_history[1:] + [self.wind_dir]

        ws_filtered = round(sum(self._ws_history) / len(self._ws_history), 2)
        wd_filtered = round(sum(self._wd_history) / len(self._wd_history), 2)

        return (
            self.temp,
            self.pressure,
            self.temp_bar,
            self.humidity,
            self.wind_speed,
            self.wind_dir,
            ws_filtered,
            wd_filtered,
        )

    def to_csv(self, values):
        return ",".join(str(v) for v in values)


# ---------------------------------------------------------------------------
# Logica de envio
# ---------------------------------------------------------------------------

def send(url, csv_data):
    r = requests.post(url, data=csv_data.encode("utf-8"), timeout=5)
    return r.status_code


def format_row(values, status, count):
    t, p, tb, h, ws, wd, wsf, wdf = values
    ok = "OK " if status == 200 else f"ERR {status}"
    return (
        f"  [{ok}] #{count:>4} | "
        f"Temp:{t:>6.2f}°C  "
        f"Pres:{p:>8.2f}hPa  "
        f"Hum:{h:>5.1f}%  "
        f"Viento:{ws:>5.2f}m/s {wd:>6.1f}°"
    )


def main():
    parser = argparse.ArgumentParser(description="Simulador ESP32 para app_meteo")
    parser.add_argument("--host",     default="127.0.0.1", help="IP del servidor Flask (default: 127.0.0.1)")
    parser.add_argument("--port",     default=5000, type=int, help="Puerto Flask (default: 5000)")
    parser.add_argument("--interval", default=5, type=float, help="Segundos entre envios (default: 5)")
    parser.add_argument("--count",    default=0, type=int, help="Numero de muestras (0 = infinito)")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}/send_message"
    sim = WeatherSimulator()

    print(f"\n  Simulador MeteoStation")
    print(f"  Servidor : {url}")
    print(f"  Intervalo: {args.interval}s")
    print(f"  Muestras : {'infinitas' if args.count == 0 else args.count}")
    print(f"  Ctrl+C para detener\n")
    print(f"  {'Estado':8} {'#':>5} | {'Temp':>10}  {'Presion':>13}  {'Humedad':>9}  {'Viento':>17}")
    print("  " + "-" * 75)

    count = 0
    errors = 0

    try:
        while True:
            count += 1
            values = sim.next()
            csv = sim.to_csv(values)

            try:
                status = send(url, csv)
                print(format_row(values, status, count))
                if status != 200:
                    errors += 1
            except requests.exceptions.ConnectionError:
                print(f"  [ERR] #{count:>4} | No se puede conectar a {url}")
                print(f"         Asegurate de que la app Flask este corriendo.")
                errors += 1

            if args.count > 0 and count >= args.count:
                break

            time.sleep(args.interval)

    except KeyboardInterrupt:
        pass

    print(f"\n  Simulacion terminada: {count} muestras enviadas, {errors} errores.\n")


if __name__ == "__main__":
    main()
