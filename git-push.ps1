# Script para hacer push del POS a GitHub
# Ejecuta en PowerShell desde la carpeta del proyecto: .\git-push.ps1

Set-Location $PSScriptRoot

Write-Host "=== Push Maria Chorizos POS ===" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. Agregando archivos..." -ForegroundColor Cyan
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error en git add. Si ves 'No such file or directory':" -ForegroundColor Red
    Write-Host "  - Cierra OneDrive si la carpeta está sincronizada" -ForegroundColor Red
    Write-Host "  - O ejecuta manualmente: git add . && git commit -m 'Config inicial' && git push origin main" -ForegroundColor Red
    exit 1
}

Write-Host "2. Creando commit..." -ForegroundColor Cyan
git commit -m "Configuración inicial POS - Maria Chorizos"

Write-Host "3. Enviando a GitHub..." -ForegroundColor Cyan
git push -u origin main

Write-Host ""
Write-Host "Listo. Vercel detectará el push y desplegará automáticamente." -ForegroundColor Green
