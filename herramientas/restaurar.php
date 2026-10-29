<?php
// Restaura una copia de seguridad (.tar.gz creado por OIKOS) en la base configurada en php/config.php. En consola:
//   php herramientas/restaurar.php ruta/a/oikos-AAAA-MM-DD_HHMMSS.tar.gz
// Reemplaza TODA la base y los adjuntos. Antes de tocar nada guarda una copia del estado actual en la carpeta de respaldos.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../php/nucleo.php';
require __DIR__ . '/../php/respaldo.php';

$origen = $argv[1] ?? '';
if (!$origen || !is_file($origen)) { fwrite(STDERR, "Uso: php herramientas/restaurar.php ruta/a/la-copia.tar.gz\n"); exit(1); }
$tmp = sys_get_temp_dir() . '/oikos-restaurar-' . bin2hex(random_bytes(4));
try {
    $copia = new PharData(realpath($origen));
    $copia->extractTo($tmp);
    if (!is_file("$tmp/oikos.sql")) throw new RuntimeException('El archivo no es una copia de OIKOS (falta oikos.sql)');
    $sql = file_get_contents("$tmp/oikos.sql");
    if (!str_contains($sql, 'CREATE TABLE')) throw new RuntimeException('La copia está incompleta o dañada');

    $previa = crear_respaldo(); // por si hay que deshacer
    echo "Estado actual guardado en {$previa['nombre']}\n";

    $pdo = bd();
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach (preg_split('/;\n(?=(?:DROP|CREATE|INSERT|SET)\b)/', $sql) as $s) { $s = trim(preg_replace('/^--.*$/m', '', $s)); if ($s !== '') $pdo->exec($s); }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

    if (is_dir("$tmp/archivos")) foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$tmp/archivos", FilesystemIterator::SKIP_DOTS)) as $a) {
        $destino = dir_archivos() . '/' . substr($a->getPathname(), strlen("$tmp/archivos") + 1);
        if (!is_dir(dirname($destino))) mkdir(dirname($destino), 0775, true);
        copy($a->getPathname(), $destino);
    }
    printf("Restauración terminada: %d usuarios, %d documentos.\n", $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn(), $pdo->query('SELECT COUNT(*) FROM documentos')->fetchColumn());
} catch (Throwable $e) { fwrite(STDERR, 'No se restauró nada: ' . $e->getMessage() . "\n"); exit(1); }
finally {
    if (is_dir($tmp)) { foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname()); rmdir($tmp); }
}
