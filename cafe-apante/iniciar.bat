@echo off
rem Abre el sistema de Cafe Apante. Basta con hacer doble clic en este archivo.
chcp 65001 >nul
title Cafe Apante - Sistema de Caja e Inventario
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No se encontro Node.js en esta computadora.
  echo  Instale "Node.js LTS" desde https://nodejs.org y vuelva a abrir este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  Instalando los componentes del sistema por primera vez. Puede tardar unos minutos...
  call npm install
  if errorlevel 1 goto :fallo
)

if not exist "dist\index.html" (
  echo  Preparando las pantallas del sistema...
  call npm run build
  if errorlevel 1 goto :fallo
)

rem Abre el navegador unos segundos despues, cuando el sistema ya esta listo.
start "" /min cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3000"

node server/index.js
echo.
echo  El sistema se detuvo. Si no fue a proposito, lea el mensaje de arriba.
pause
exit /b 0

:fallo
echo.
echo  No se pudo preparar el sistema. Revise la conexion a internet e intente de nuevo.
pause
exit /b 1
