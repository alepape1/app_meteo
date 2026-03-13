@echo off
chcp 65001 >nul
title MeteoStation

echo.
echo  MeteoStation - Arranque
echo  ========================

REM --- Crear .env si no existe ---
if not exist "backend\.env" (
    echo  Creando backend\.env desde .env.example...
    copy "backend\.env.example" "backend\.env" >nul
)

REM --- Instalar dependencias Python si faltan ---
python -c "import flask" 2>nul
if errorlevel 1 (
    echo  Instalando dependencias Python...
    pip install -r backend\requirements.txt
)

REM --- Instalar dependencias Node si faltan ---
if not exist "frontend\node_modules" (
    echo  Instalando dependencias Node...
    cd frontend && npm install && cd ..
)

echo.
echo  Iniciando Backend Flask...
start "MeteoStation - Backend" cmd /k "cd backend && python app.py"

timeout /t 2 >nul

echo  Iniciando Frontend React...
start "MeteoStation - Frontend" cmd /k "cd frontend && npm run dev"

timeout /t 3 >nul

echo.
echo  Backend :  http://localhost:7000
echo  Frontend:  http://localhost:5173
echo.
echo  Abre el navegador en http://localhost:5173
echo.
pause
