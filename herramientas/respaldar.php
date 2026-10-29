<?php
// Crea una copia de seguridad (base de datos + adjuntos). Para la copia diaria, en cPanel → Cron Jobs:
//   0 2 * * *  php /home/USUARIO/oikos/herramientas/respaldar.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../php/nucleo.php';
require __DIR__ . '/../php/respaldo.php';
try {
    $r = crear_respaldo();
    printf("Respaldo creado: %s/%s (%d KB)\n", dir_respaldos(), $r['nombre'], max(1, round($r['bytes'] / 1024)));
} catch (Throwable $e) { fwrite(STDERR, 'FALLÓ EL RESPALDO: ' . $e->getMessage() . "\n"); exit(1); }
