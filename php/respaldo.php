<?php
// Copias de seguridad: volcado SQL de toda la base + archivos adjuntos, empaquetados en un .tar.gz con PharData
// (viene con PHP; no necesita el programa tar ni mysqldump, que muchos hostings no dejan ejecutar). Reemplaza a backup.js.
declare(strict_types=1);

const PATRON_RESPALDO = '/^oikos-\d{4}-\d{2}-\d{2}_\d{6}\.tar\.gz$/';
function dir_respaldos(): string { $d = datos_dir() . '/respaldos'; if (!is_dir($d)) @mkdir($d, 0775, true); return $d; }
function conservar_respaldos(): int { return max(1, (int)(config('respaldos_conservar') ?: 30)); }

function info_respaldo(string $ruta): array {
    return ['nombre' => basename($ruta), 'bytes' => filesize($ruta), 'fecha' => gmdate('Y-m-d\TH:i:s.000\Z', filemtime($ruta))];
}
function listar_respaldos(): array {
    $nombres = array_values(array_filter(scandir(dir_respaldos()) ?: [], fn($n) => preg_match(PATRON_RESPALDO, $n)));
    rsort($nombres);
    return array_map(fn($n) => info_respaldo(dir_respaldos() . "/$n"), $nombres);
}

// Volcado SQL completo: estructura (SHOW CREATE TABLE) y datos de cada tabla
function volcar_sql(): string {
    $pdo = bd();
    $sql = "-- OIKOS: copia de seguridad del " . gmdate('Y-m-d H:i:s') . " UTC\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n";
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) {
        $crear = $pdo->query("SHOW CREATE TABLE `$t`")->fetch(PDO::FETCH_NUM)[1];
        $sql .= "\nDROP TABLE IF EXISTS `$t`;\n$crear;\n";
        $st = $pdo->query("SELECT * FROM `$t`");
        $lote = [];
        while ($f = $st->fetch(PDO::FETCH_ASSOC)) {
            $lote[] = '(' . implode(',', array_map(fn($v) => $v === null ? 'NULL' : (is_int($v) || is_float($v) ? (string)$v : $pdo->quote((string)$v)), $f)) . ')';
            if (count($lote) === 200) { $sql .= "INSERT INTO `$t` VALUES " . implode(",\n", $lote) . ";\n"; $lote = []; }
        }
        if ($lote) $sql .= "INSERT INTO `$t` VALUES " . implode(",\n", $lote) . ";\n";
    }
    return $sql . "SET FOREIGN_KEY_CHECKS = 1;\n";
}

function crear_respaldo(): array {
    $nombre = 'oikos-' . date('Y-m-d_His') . '.tar.gz';
    $destino = dir_respaldos() . "/$nombre";
    if (is_file($destino)) throw new RuntimeException('Ya existe un respaldo de este mismo segundo');
    $tar = dir_respaldos() . '/parcial-' . bin2hex(random_bytes(4)) . '.tar';
    try {
        $p = new PharData($tar);
        $p->addFromString('oikos.sql', volcar_sql());
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(dir_archivos(), FilesystemIterator::SKIP_DOTS)) as $a)
            $p->addFile($a->getPathname(), 'archivos/' . str_replace('\\', '/', substr($a->getPathname(), strlen(dir_archivos()) + 1)));
        $p->compress(Phar::GZ);
        unset($p);
        rename($tar . '.gz', $destino);
    } finally {
        @unlink($tar); @unlink($tar . '.gz');
    }
    foreach (array_slice(listar_respaldos(), conservar_respaldos()) as $x) @unlink(dir_respaldos() . '/' . $x['nombre']); // solo las últimas N
    return info_respaldo($destino);
}
