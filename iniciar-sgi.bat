@echo off
rem ============================================================================
rem  Inicia SGI y lo abre por XAMPP:  http://sgi.localhost/
rem  - Enciende Apache (XAMPP) si no esta corriendo.
rem  - Enciende SGI (Node) en el puerto 3100 si no esta corriendo. Apache le pasa las peticiones.
rem  - La ventana "SGI" queda minimizada: si la cierras, SGI se apaga.
rem  Uso:  doble clic    |    iniciar-sgi.bat sinnavegador  (no abre el navegador)
rem ============================================================================
setlocal
cd /d "%~dp0"
set "PORT=3100"

netstat -ano | findstr /R /C:":80 .*LISTENING" >nul
if errorlevel 1 (
  echo Encendiendo Apache de XAMPP...
  start "" /min "%~dp0..\..\..\apache_start.bat"
  ping -n 5 127.0.0.1 >nul
)

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if errorlevel 1 (
  echo Encendiendo SGI en el puerto %PORT%...
  start "SGI (no cierres esta ventana)" /min cmd /c "set PORT=%PORT%&& node server.js"
  ping -n 4 127.0.0.1 >nul
) else (
  echo SGI ya estaba encendido en el puerto %PORT%.
)

if /i not "%~1"=="sinnavegador" start "" "http://sgi.localhost/"
endlocal
