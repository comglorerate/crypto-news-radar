@echo off
title Crypto News Radar
cd /d "%~dp0"
echo.
echo   ============================================
echo    CRYPTO NEWS RADAR - Analisis Fundamental
echo   ============================================
echo.
if not exist "node_modules" (
  echo   Instalando dependencias por primera vez...
  call npm install
)
echo   Abriendo http://localhost:4000 en el navegador...
start "" http://localhost:4000
echo.
echo   Servidor corriendo. Cierra esta ventana para detenerlo.
echo.
node server.js
pause
