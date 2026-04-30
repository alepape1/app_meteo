---
applyTo: "app_meteo/backend/**/*.py, app_meteo/frontend/src/**/*.{js,jsx}"
description: "Use when editing the Aquantia app locally: keep changes local-safe, focused on the active repo, and aligned with the standard Flask plus Vite development flow."
---

# Aquantia local development rules

- Prefer local-first changes and avoid production-only assumptions unless explicitly requested.
- For local infrastructure, use the development compose setup rather than the production stack.
- Treat the active repository as the default scope; do not modify the sibling firmware repository unless the task clearly requires it.
- Keep changes small, practical, and easy to run from VS Code.
- Avoid scanning or relying on generated or heavy folders such as node_modules, dist, logs, and data.

## Local run targets

- Backend: run the Flask app from the backend folder on port 7000.
- Frontend: run the Vite app from the frontend folder on port 5173 or the next available Vite port.
- Support services: PostgreSQL or TimescaleDB on 5432, MQTT on 1883, and Adminer on 8888.

## Coding guidance

- Prefer minimal, targeted file reads and focused edits.
- Keep local-safe configuration values and do not introduce production TLS, server paths, or deployment-specific behavior into local development work.
- When working on dashboard or API behavior, preserve per-user device isolation and avoid exposing global device data.
