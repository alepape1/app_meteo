@echo off
chcp 65001 >nul
title MeteoStation

REM Directorio raiz del proyecto (donde esta este .bat)
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend

echo.
echo  MeteoStation - Arranque
echo  ========================

REM --- Crear .env si no existe ---
if not exist "%BACKEND%\.env" (
    echo  Creando backend\.env desde .env.example...
    copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
)

REM --- Instalar dependencias Python ---
echo  Verificando dependencias Python...
pip install -q -r "%BACKEND%\requirements.txt"

REM --- Instalar dependencias Node si faltan ---
if not exist "%FRONTEND%\node_modules" (
    echo  Instalando dependencias Node...
    pushd "%FRONTEND%" && npm install && popd
)

echo.
echo  Iniciando Backend Flask...
start "MeteoStation - Backend" cmd /k "cd /d "%BACKEND%" && python app.py"

timeout /t 2 >nul

echo  Iniciando Frontend React...
start "MeteoStation - Frontend" cmd /k "cd /d "%FRONTEND%" && npm run dev"

timeout /t 3 >nul

echo.
echo  Backend :  http://localhost:7000
echo  Frontend:  http://localhost:5173
echo.
echo  Abre el navegador en http://localhost:5173
echo.
pause
