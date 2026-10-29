<?php
// Enrutador para el servidor integrado de PHP (pruebas y desarrollo sin Apache):
//   php -S 127.0.0.1:3196 -t public herramientas/servidor-local.php
$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/(api/|healthz$)#', $ruta)) { require __DIR__ . '/../public/api/index.php'; return true; }
return false; // archivos estáticos de public/
