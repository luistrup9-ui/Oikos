<?php
// Guarda TODA la base (estructura + datos) en un solo archivo .sql, listo para importar en phpMyAdmin o en cPanel. En consola:
//   php herramientas/exportar-sql.php [ruta/salida.sql]
// Por defecto escribe datos/oikos-datos.sql (carpeta protegida y fuera de Git) y reemplaza el anterior.
// No lleva las sesiones abiertas ni las fichas de recuperación de clave: son accesos vivos y no deben salir de este equipo.
// Los adjuntos (PDF, Word…) no caben en un .sql: están en datos/archivos y los incluye el respaldo de Administración → Respaldos.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../php/nucleo.php';
require __DIR__ . '/../php/respaldo.php';

const SIN_DATOS = ['sesiones', 'intentos_login', 'pedidos_clave', 'reinicios_clave'];

$parcial = '';
try {
    $destino = $argv[1] ?? datos_dir() . '/oikos-datos.sql';
    $sql = volcar_sql(SIN_DATOS);
    $parcial = $destino . '.parcial';
    if (file_put_contents($parcial, $sql) === false) throw new RuntimeException("No pude escribir en $destino");
    if (!@rename($parcial, $destino)) { @unlink($destino); rename($parcial, $destino); } // Windows no reemplaza con rename
    $tablas = bd()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $filas = 0;
    foreach (array_diff($tablas, SIN_DATOS) as $t) $filas += (int)uno("SELECT COUNT(*) n FROM `$t`")['n'];
    printf("Datos guardados en %s\n  %d tablas, %d filas, %d KB (sin sesiones ni fichas de clave)\n", realpath($destino), count($tablas), $filas, max(1, round(strlen($sql) / 1024)));
} catch (Throwable $e) {
    if ($parcial) @unlink($parcial);
    fwrite(STDERR, 'NO SE PUDO GUARDAR: ' . $e->getMessage() . "\n¿Está encendido MySQL en el panel de XAMPP?\n");
    exit(1);
}
