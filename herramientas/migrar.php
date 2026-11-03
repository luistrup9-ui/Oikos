<?php
// Aplica las migraciones pendientes (mysql/migraciones/NNN_descripcion.sql) a la base de php/config.php. En consola:
//   php herramientas/migrar.php
// Antes de aplicar hace una copia de seguridad (base + adjuntos). Si una migración falla, se detiene y dice cuál.
// En el hosting lo mismo lo hace public/migrar.php (POST con token) después de cada push; aquí es para probar en el equipo.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../php/migraciones.php';

try { $r = aplicar_migraciones(); }
catch (Throwable $e) { fwrite(STDERR, 'NO SE PUDO MIGRAR: ' . $e->getMessage() . "\n¿Está encendido MySQL en el panel de XAMPP?\n"); exit(1); }

if ($r['respaldo']) echo "Respaldo previo: {$r['respaldo']}\n";
foreach ($r['aplicadas'] as $a) echo "Aplicada: $a\n";
if (!$r['ok']) {
    fwrite(STDERR, "ERROR: {$r['error']}\n");
    if ($r['pendientes']) fwrite(STDERR, 'Pendientes: ' . implode(', ', $r['pendientes']) . "\n");
    exit(1);
}
echo $r['aplicadas'] ? sprintf("Listo: %d migración(es) aplicada(s).\n", count($r['aplicadas'])) : "No hay migraciones pendientes.\n";
