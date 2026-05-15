# run_release_tests.ps1 — Suite completa de tests (backend + frontend) para validar una release
# Uso: .\run_release_tests.ps1
# Uso con tag de versión: .\run_release_tests.ps1 -Version "v0.1.0-beta.4"
# Solo backend: .\run_release_tests.ps1 -SkipFrontend
# Solo frontend: .\run_release_tests.ps1 -SkipBackend
#
# Requisitos previos:
#   - Docker Desktop corriendo con la infraestructura dev activa
#     (docker compose -f docker-compose.dev.yml up -d)
#   - El .venv del proyecto debe existir en c:\repos\app_meteo\.venv
#   - Node.js instalado (npm disponible en PATH)

param(
    [string]$Version      = "",
    [switch]$SkipBackend,
    [switch]$SkipFrontend
)

$Root        = $PSScriptRoot
$Backend     = Join-Path $Root "backend"
$Frontend    = Join-Path $Root "frontend"
$Pytest      = Join-Path $Root ".venv\Scripts\pytest.exe"
$ReportsDir  = Join-Path $Backend "tests\reports"
$Timestamp   = Get-Date -Format "yyyy-MM-dd_HH-mm"
$Tag         = if ($Version) { $Version } else { $Timestamp }

# ── Colores ───────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "   ✅ $msg" -ForegroundColor Green }
function Write-Fail  { param($msg) Write-Host "   ❌ $msg" -ForegroundColor Red }
function Write-Warn  { param($msg) Write-Host "   ⚠️  $msg" -ForegroundColor Yellow }

Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Aquantia Test Suite  $Tag" -ForegroundColor Magenta
Write-Host "══════════════════════════════════════════════`n" -ForegroundColor Magenta

$BackendExit  = 0
$FrontendExit = 0

# ── 1. Verificar Docker ───────────────────────────────────────────────────────
if (-not $SkipBackend) {
    Write-Step "Verificando infraestructura Docker..."
    $dockerPs = docker ps --format "{{.Names}}" 2>$null
    $needsPostgres = $dockerPs -notmatch "postgres|timescale|aquantia"
    $needsMqtt     = $dockerPs -notmatch "mosquitto|mqtt"

    if ($needsPostgres -or $needsMqtt) {
        Write-Warn "Infraestructura no detectada. Arrancando docker-compose.dev.yml..."
        Push-Location $Root
        docker compose -f docker-compose.dev.yml up -d
        Start-Sleep -Seconds 5
        Pop-Location
    } else {
        Write-Ok "PostgreSQL y Mosquitto detectados."
    }
}

# ── 2. Verificar pytest ───────────────────────────────────────────────────────
if (-not $SkipBackend) {
    Write-Step "Verificando entorno Python..."
    if (-not (Test-Path $Pytest)) {
        Write-Fail "No se encontró pytest en $Pytest"
        Write-Host "   Asegúrate de que el .venv está creado en la raíz del workspace."
        exit 1
    }
    Write-Ok "pytest encontrado."
}

# ── 3. Crear directorio de reportes con tag de versión ───────────────────────
$ReportTagDir = Join-Path $ReportsDir $Tag
New-Item -ItemType Directory -Force -Path $ReportTagDir | Out-Null

$HtmlReport  = Join-Path $ReportTagDir "report.html"
$XmlReport   = Join-Path $ReportTagDir "junit.xml"
$DefaultHtml = Join-Path $ReportsDir "report.html"
$DefaultXml  = Join-Path $ReportsDir "junit.xml"

# ── 4. Backend (pytest) ───────────────────────────────────────────────────────
if (-not $SkipBackend) {
    Write-Step "Ejecutando tests de backend (pytest)..."
    Push-Location $Backend

    $PytestArgs = @(
        "tests/",
        "-v",
        "--tb=short",
        "--html=$HtmlReport",
        "--self-contained-html",
        "--junitxml=$XmlReport"
    )

    & $Pytest @PytestArgs
    $BackendExit = $LASTEXITCODE
    Pop-Location

    Copy-Item $HtmlReport $DefaultHtml -Force
    Copy-Item $XmlReport  $DefaultXml  -Force

    if ($BackendExit -eq 0) {
        Write-Ok "Backend: todos los tests pasaron."
    } else {
        Write-Fail "Backend: hay tests fallando."
    }
} else {
    Write-Warn "Backend: omitido (-SkipBackend)."
}

# ── 5. Frontend (Vitest) ──────────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Step "Ejecutando tests de frontend (Vitest)..."

    # Verificar que node_modules existen
    if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
        Write-Warn "node_modules no encontrado. Ejecutando npm install..."
        Push-Location $Frontend
        npm install --silent
        Pop-Location
    }

    Push-Location $Frontend
    npm run test:coverage -- --reporter=verbose 2>&1
    $FrontendExit = $LASTEXITCODE
    Pop-Location

    if ($FrontendExit -eq 0) {
        Write-Ok "Frontend: todos los tests pasaron."
    } else {
        Write-Fail "Frontend: hay tests fallando."
    }
} else {
    Write-Warn "Frontend: omitido (-SkipFrontend)."
}

# ── 6. Resumen final ──────────────────────────────────────────────────────────
$GlobalExit = if ($BackendExit -ne 0 -or $FrontendExit -ne 0) { 1 } else { 0 }

Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Resumen  $Tag" -ForegroundColor Magenta
Write-Host "══════════════════════════════════════════════" -ForegroundColor Magenta

if (-not $SkipBackend) {
    $beColor = if ($BackendExit -eq 0) { "Green" } else { "Red" }
    $beIcon  = if ($BackendExit -eq 0) { "✅" } else { "❌" }
    Write-Host "  $beIcon  Backend  (pytest)  -> reporte: $HtmlReport" -ForegroundColor $beColor
}
if (-not $SkipFrontend) {
    $feColor = if ($FrontendExit -eq 0) { "Green" } else { "Red" }
    $feIcon  = if ($FrontendExit -eq 0) { "✅" } else { "❌" }
    $fedCov  = Join-Path $Frontend "coverage\index.html"
    Write-Host "  $feIcon  Frontend (Vitest)  -> cobertura: $fedCov" -ForegroundColor $feColor
}

Write-Host "══════════════════════════════════════════════`n" -ForegroundColor Magenta

# Abrir reportes en el navegador si existen
if (-not $SkipBackend -and (Test-Path $HtmlReport)) { Start-Process $HtmlReport }
$FrontendCoverage = Join-Path $Frontend "coverage\index.html"
if (-not $SkipFrontend -and (Test-Path $FrontendCoverage)) { Start-Process $FrontendCoverage }

exit $GlobalExit
