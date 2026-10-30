@echo off
rem Doble clic: guarda todos los datos de OIKOS en datos\oikos-datos.sql (necesita MySQL encendido en XAMPP)
chcp 65001 >nul
"C:\xampp\php\php.exe" "%~dp0exportar-sql.php"
echo.
pause
