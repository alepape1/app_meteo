# run_release_tests.ps1 — Suite completa de tests para validar una release beta
# Uso: .\run_release_tests.ps1
# Uso con tag de versión: .\run_release_tests.ps1 -Version "v0.1.0-beta.4"
#
# Requisitos previos:
#   - Docker Desktop corriendo con la infraestructura dev activa
#     (docker compose -f docker-compose.dev.yml up -d)
#   - El .venv del proyecto debe existir en la raíz del workspace

param(
    [string]$Version = ""
)

$Root        = $PSScriptRoot
$Backend     = Join-Path $Root "backend"
$Pytest      = Join-Path $Root "..\.venv\Scripts\pytest.exe"
$ReportsDir  = Join-Path $Backend "tests\reports"
$Timestamp   = Get-Date -Format "yyyy-MM-dd_HH-mm"
$Tag         = if ($Version) { $Version } else { $Timestamp }

# ── Colores ───────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "   ✅ $msg" -ForegroundColor Green }
function Write-Fail  { param($msg) Write-Host "   ❌ $msg" -ForegroundColor Red }
function Write-Warn  { param($msg) Write-Host "   ⚠️  $msg" -ForegroundColor Yellow }

Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Aquantia Release Test Suite  $Tag" -ForegroundColor Magenta
Write-Host "══════════════════════════════════════════════`n" -ForegroundColor Magenta

# ── 1. Verificar Docker ───────────────────────────────────────────────────────
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

# ── 2. Verificar pytest ───────────────────────────────────────────────────────
Write-Step "Verificando entorno Python..."
if (-not (Test-Path $Pytest)) {
    Write-Fail "No se encontró pytest en $Pytest"
    Write-Host "   Asegúrate de que el .venv está creado en la raíz del workspace."
    exit 1
}
Write-Ok "pytest encontrado."

# ── 3. Crear directorio de reportes con tag de versión ───────────────────────
$ReportTagDir = Join-Path $ReportsDir $Tag
New-Item -ItemType Directory -Force -Path $ReportTagDir | Out-Null

$HtmlReport = Join-Path $ReportTagDir "report.html"
$XmlReport  = Join-Path $ReportTagDir "junit.xml"

# Copiar también a la ubicación por defecto (para el reporte.html del editor)
$DefaultHtml = Join-Path $ReportsDir "report.html"
$DefaultXml  = Join-Path $ReportsDir "junit.xml"

# ── 4. Ejecutar tests ─────────────────────────────────────────────────────────
Write-Step "Ejecutando suite completa de tests..."

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
$ExitCode = $LASTEXITCODE

Pop-Location

# Copiar a ubicación por defecto
Copy-Item $HtmlReport $DefaultHtml -Force
Copy-Item $XmlReport  $DefaultXml  -Force

# ── 5. Resumen ────────────────────────────────────────────────────────────────
Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Magenta
if ($ExitCode -eq 0) {
    Write-Ok "Todos los tests pasaron. Release $Tag validada."
    Write-Host "`n   Reporte HTML: $HtmlReport" -ForegroundColor Gray
    Write-Host "   Reporte XML:  $XmlReport`n" -ForegroundColor Gray
    # Abrir el reporte en el navegador
    Start-Process $HtmlReport
} else {
    Write-Fail "Hay tests fallando. NO hagas merge/tag hasta resolverlos."
    Write-Host "`n   Reporte HTML: $HtmlReport" -ForegroundColor Gray
    Write-Host "   Reporte XML:  $XmlReport`n" -ForegroundColor Gray
    Start-Process $HtmlReport
}
Write-Host "══════════════════════════════════════════════`n" -ForegroundColor Magenta

exit $ExitCode
