# start-vida-divina.ps1 — Launcher local único para Vida Divina.
#
# Arranca (si no están ya activos, nunca duplica):
#   - Dashboard Vida Divina  -> :4310  (dashboard/server/index.js)
#   - WhatsApp / Hermes      -> :4311  (hermes-kit, "npm run dev")
#   - Baileys en modo QR SEGURO       (hermes-kit, "npm run start:qr")
#   - Voice Engine real (WSL2)        (voice-engine/, FastAPI + Chatterbox +
#     ffmpeg -- MISMO servicio y MISMO comando real ya documentados en
#     voice-engine/README.md "Iniciar el servicio desde WSL2", solo
#     automatizado aquí. No es un servidor nuevo. Arranca en paralelo, sin
#     esperar a que el modelo termine de cargar (~15-30s reales) -- eso se
#     ve en el Command Center del Dashboard (ARRANCANDO -> OPERATIVO), no
#     bloquea este launcher. Si WSL2/el venv no existen en esta máquina, se
#     avisa y se continúa igual: Hermes sigue funcionando con fallback a
#     texto (generateVoice ya lo maneja, sin cambios).
#
# Baileys arranca por defecto SOLO en modo QR (start:qr) -- el mismo modo de
# validación local ya existente: no requiere OPENROUTER_API_KEY, nunca llama
# a un LLM, nunca envía nada. Sirve para ver/probar el QR desde el Dashboard.
# El AGENTE COMPLETO (start:bot, sí responde con IA) sigue sin arrancar
# nunca por defecto -- solo con -WithBot / START_HERMES_BOT=true, igual que
# antes. Esto es intencional: evita conectar el número real por accidente
# solo por abrir el Dashboard con un clic.
#
# Al final, si el Dashboard queda accesible en :4310, abre el navegador
# automáticamente ahí.
#
# No toca lógica interna de ningún proceso: solo los lanza con los MISMOS
# comandos que ya existían (`node server/index.js`, `npm run dev`,
# `npm run start:qr`, `npm run start:bot`) -- cero cambios de arquitectura.

param(
  [switch]$WithBot
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$StartBot = $WithBot.IsPresent -or ($env:START_HERMES_BOT -eq 'true')

function Get-ListeningPid([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty OwningProcess
}

function Get-BaileysPid {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'start-qr\.ts|start-bot\.ts' } |
    Select-Object -First 1 -ExpandProperty ProcessId
}

Write-Host "== Vida Divina -- arranque local ==" -ForegroundColor Cyan
Write-Host ""

# --- Dashboard Vida Divina :4310 ---
$dashPid = Get-ListeningPid 4310
if ($dashPid) {
  Write-Host "[dashboard] ya activo en :4310 (PID $dashPid) -- no se duplica." -ForegroundColor Yellow
} else {
  # --env-file-if-exists=.env (Fase "Corregir carga de .env en el launcher
  # real", 2026-09-19): mismo mecanismo exacto que dashboard/package.json
  # #scripts.start (node --env-file-if-exists=.env server/index.js) --
  # antes este launcher arrancaba el mismo server/index.js pero SIN esta
  # flag, así que dashboard/.env (DASHBOARD_ADMIN_EMAIL/PASSWORD) nunca se
  # cargaba y el bootstrap del ADMIN real nunca se disparaba cuando se
  # arrancaba por este camino (confirmado: la sesión, el login y todo lo
  # demás ya funcionaban bien -- lo único que faltaba era esta flag real).
  Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'server/index.js' `
    -WorkingDirectory (Join-Path $RepoRoot 'dashboard') -WindowStyle Minimized
  Write-Host "[dashboard] arrancando en :4310..." -ForegroundColor Green
}

# --- WhatsApp / Hermes (Next.js) :4311 ---
$hermesPid = Get-ListeningPid 4311
if ($hermesPid) {
  Write-Host "[hermes]    ya activo en :4311 (PID $hermesPid) -- no se duplica." -ForegroundColor Yellow
} else {
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' `
    -WorkingDirectory (Join-Path $RepoRoot 'hermes-kit') -WindowStyle Minimized
  Write-Host "[hermes]    arrancando en :4311..." -ForegroundColor Green
}

# --- Baileys / WhatsApp bot ---
# Por defecto arranca en modo QR SEGURO (start:qr, ver hermes-kit/scripts/
# start-qr.ts): no requiere OPENROUTER_API_KEY, nunca llama a un LLM, nunca
# envía nada -- solo conecta Baileys para poder ver/probar el QR. El AGENTE
# COMPLETO (start:bot) sigue sin arrancar nunca salvo -WithBot /
# START_HERMES_BOT=true, exactamente igual que antes.
$existingBaileys = Get-BaileysPid
if ($existingBaileys) {
  Write-Host "[baileys]   ya activo (PID $existingBaileys) -- no se duplica." -ForegroundColor Yellow
} elseif ($StartBot) {
  Write-Host "[baileys]   START_HERMES_BOT=true (o -WithBot) -- arrancando el AGENTE COMPLETO" -ForegroundColor Yellow
  Write-Host "            (npm run start:bot -- requiere OPENROUTER_API_KEY; si auth/ ya tiene" -ForegroundColor Yellow
  Write-Host "            una sesión vinculada, esto SÍ reconecta ese número real)." -ForegroundColor Yellow
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'start:bot' `
    -WorkingDirectory (Join-Path $RepoRoot 'hermes-kit') -WindowStyle Minimized
} else {
  Write-Host "[baileys]   arrancando en modo QR seguro (npm run start:qr -- sin IA, sin OPENROUTER_API_KEY)." -ForegroundColor Green
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'start:qr' `
    -WorkingDirectory (Join-Path $RepoRoot 'hermes-kit') -WindowStyle Minimized
  Write-Host "            Para el AGENTE COMPLETO con IA en su lugar: start-vida-divina.bat --with-bot" -ForegroundColor DarkGray
}

# --- Mantener WSL2 (Ubuntu) activo -- evita que WSL2 apague la VM completa ---
# Diagnóstico real (2026-09-08): aunque voice-engine.service ya es un
# servicio systemd persistente (Restart=always, WantedBy=multi-user.target),
# WSL2 apaga/reinicia la VM entera (systemd incluido) cada pocos minutos
# cuando no detecta ningún proceso wsl.exe "adjunto" a la distro --
# confirmado con journalctl --list-boots mostrando reinicios completos de la
# VM mientras solo se hacían peticiones HTTP normales a :8000/health (esas
# peticiones NO cuentan como cliente adjunto para WSL2). Chatterbox tarda
# ~15-35s en cargar, así que casi nunca sobrevive un ciclo completo antes del
# siguiente apagón. Fix mínimo y reversible: mantener un proceso wsl.exe
# vivo y adjunto (equivalente a "wsl.exe -d Ubuntu -- sleep infinity")
# mientras el launcher esté activo, sin ventana visible. No modifica
# voice-engine.service ni /etc/wsl.conf -- solo evita que WSL2 apague la
# distro por "inactividad". stop-vida-divina.ps1 lo detiene igual que el
# resto.
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
  $wslKeepAliveDistro = if ($env:VOICE_ENGINE_WSL_DISTRO) { $env:VOICE_ENGINE_WSL_DISTRO } else { 'Ubuntu' }
  $wslKeepAlivePid = Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'sleep\s+infinity' } |
    Select-Object -First 1 -ExpandProperty ProcessId
  if ($wslKeepAlivePid) {
    Write-Host "[wsl2]      ya mantenido activo (PID $wslKeepAlivePid) -- no se duplica." -ForegroundColor Yellow
  } else {
    Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', $wslKeepAliveDistro, '--', 'sleep', 'infinity') -WindowStyle Hidden
    Write-Host "[wsl2]      manteniendo activa la distro $wslKeepAliveDistro (evita que WSL2 la apague por inactividad)." -ForegroundColor Green
  }
}

# --- Voice Engine real (WSL2) :8000 ---
# Voice Engine YA NO se arranca manualmente desde aquí. Corre como servicio
# systemd (voice-engine.service, enabled) dentro de la distro Ubuntu, y esa
# distro se mantiene arrancada por el bloque de keep-alive de arriba -- en
# cuanto la distro está viva, systemd arranca voice-engine.service solo.
#
# Diagnóstico real (2026-09-08): este bloque SÍ arrancaba antes un uvicorn
# manual en paralelo al de systemd -- los dos intentaban bindear
# 127.0.0.1:8000 a la vez, y el que perdía la carrera reventaba con
# "[Errno 98] Address already in use" / "error while attempting to bind ...
# address already in use", entrando en un bucle de reinicios. Se elimina el
# arranque manual: systemd queda como ÚNICA fuente de arranque de Voice
# Engine. Aquí solo se informa del estado real vía /health.
function Get-VoiceEngineHealth {
  # TimeoutSec 6 (no 2): hallazgo real -- Invoke-RestMethod contra
  # localhost:8000 a través del puente NAT de WSL2 tarda ~2.2s de verdad en
  # esta máquina (medido), muy por encima de lo que tarda curl/fetch de
  # Node contra el mismo endpoint. Un timeout de 2s producía falsos
  # negativos intermitentes. Incluso a 6s se observó UN falso negativo
  # aislado en pruebas reales -- 2 intentos (nunca solo 1) antes de asumir
  # "no está corriendo".
  for ($intento = 1; $intento -le 2; $intento++) {
    try {
      return Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 6 -ErrorAction Stop
    } catch {
      if ($intento -eq 2) { return $null }
    }
  }
}

$voiceEngineHealth = Get-VoiceEngineHealth
if ($voiceEngineHealth) {
  $vePhase = if ($voiceEngineHealth.model_loaded) { 'OPERATIVO' } else { 'ARRANCANDO' }
  Write-Host "[voice-engine] activo ($vePhase) -- gestionado por systemd (voice-engine.service)." -ForegroundColor Yellow
} elseif (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  Write-Host "[voice-engine] WSL2 no está disponible en esta máquina -- se omite. Hermes seguirá funcionando con fallback a texto." -ForegroundColor DarkYellow
} else {
  Write-Host "[voice-engine] todavía no responde -- systemd (voice-engine.service) lo arranca solo dentro de WSL2; Chatterbox tarda ~15-35s en cargar (ver Command Center)." -ForegroundColor Green
}

Write-Host ""
Write-Host "Dashboard:       http://localhost:4310" -ForegroundColor Cyan
Write-Host "WhatsApp/Hermes: http://localhost:4310/hermes" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para detener todo: stop-vida-divina.bat" -ForegroundColor Cyan

# --- Abrir el navegador en el Dashboard en cuanto :4310 esté disponible ---
# Sondeo por puerto (mismo criterio que el resto del script), nunca abre el
# navegador antes de que el servidor realmente esté escuchando.
Write-Host ""
Write-Host "Esperando a que el Dashboard responda en :4310..." -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  if (Get-ListeningPid 4310) { $ready = $true; break }
  Start-Sleep -Milliseconds 500
}
if ($ready) {
  Start-Process 'http://localhost:4310'
  Write-Host "Navegador abierto en http://localhost:4310" -ForegroundColor Cyan
} else {
  Write-Host "El Dashboard no respondió a tiempo en :4310 -- ábrelo manualmente." -ForegroundColor Yellow
}
