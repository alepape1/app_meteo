FROM python:3.12-slim

WORKDIR /app

# psycopg2-binary necesita libpq — ya viene con psycopg2-binary, no hace falta libpq-dev
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 7000

# 1 worker: el cliente MQTT de paho usa un hilo interno; con >1 worker
# cada proceso abriría su propia conexión MQTT y duplicaría mensajes.
CMD ["gunicorn", "--bind", "0.0.0.0:7000", "--workers", "1",
     "--timeout", "120", "app:app"]
