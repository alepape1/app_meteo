# Aquantia workspace context for Copilot

This workspace contains two related repositories:
- app_meteo: the local web application and backend for the Aquantia weather and irrigation system.
- weather-station-ESP: the ESP32 firmware repository; only use it when the task is about device code, provisioning, MQTT behavior, or flashing.

Default development flow:
- Develop locally first and deploy to production later.
- Use app_meteo/app_meteo/docker-compose.dev.yml for local infrastructure.
- Run the Flask backend from app_meteo/app_meteo/backend on port 7000.
- Run the React/Vite frontend from app_meteo/app_meteo/frontend on port 5173.
- Local support services: PostgreSQL/TimescaleDB on 5432, MQTT on 1883, Adminer on 8888.

Guidelines:
- Prefer minimal, targeted file reads instead of scanning the whole workspace.
- Focus on the active repository unless the user explicitly asks for cross-repo changes.
- Prefer local-safe configs; production TLS and server paths may not apply locally.
- Keep changes small, practical, and easy to run from VS Code.

Token-saving rules:
- Do not read the whole workspace unless explicitly requested.
- Avoid generated or heavy folders such as node_modules, dist, logs, and data.
- Use the current file and a few directly related files as primary context.
- Treat this instruction file as the default summary of the project context.
