<?php
// Pasa los datos de la versión Node (sgi.db, SQLite) a MySQL, sin perder nada. Se corre una sola vez, en consola:
//   php herramientas/migrar-sqlite-a-mysql.php ruta/a/sgi.db [--reemplazar]
// - Crea las tablas si la base MySQL está vacía (mysql/esquema.sql).
// - Si la base ya tiene datos, se detiene; con --reemplazar los borra y copia de nuevo.
// - Copia los adjuntos (carpeta «archivos» junto a sgi.db) a la carpeta de datos configurada.
// - Completa lo que Node creaba al arrancar (cargos, procesos de cada Líder, nombres de estados).
// La configuración de la base sale de php/config.php (o de la ruta en la variable OIKOS_CONFIG).
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../php/nucleo.php';
require __DIR__ . '/../php/semillas.php';

$args = array_slice($argv, 1);
$reemplazar = in_array('--reemplazar', $args, true);
$origen = current(array_filter($args, fn($a) => !str_starts_with($a, '--')));
if (!$origen || !is_file($origen)) { fwrite(STDERR, "Uso: php herramientas/migrar-sqlite-a-mysql.php ruta/a/sgi.db [--reemplazar]\n"); exit(1); }

$lite = new PDO('sqlite:' . $origen, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$my = bd();

// 1) Esquema
$tablasMy = $my->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
if (!$tablasMy) {
    echo "Creando las tablas (mysql/esquema.sql)...\n";
    instalar_esquema();
    $tablasMy = $my->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
}
$conDatos = (int)$my->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
if ($conDatos && !$reemplazar) { fwrite(STDERR, "La base MySQL ya tiene $conDatos usuarios. Para borrarla y copiar de nuevo usa --reemplazar.\n"); exit(1); }

// 2) Datos, tabla por tabla, con las columnas que existen en ambos lados
$tablasLite = $lite->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);
$omitir = ['sesiones', 'intentos_login', 'pedidos_clave']; // al migrar todos vuelven a ingresar
$my->exec('SET FOREIGN_KEY_CHECKS = 0');
$resumen = [];
foreach ($tablasMy as $t) {
    if ($reemplazar) $my->exec("DELETE FROM `$t`");
    if (in_array($t, $omitir, true) || !in_array($t, $tablasLite, true)) continue;
    $colsMy = []; // nombre => tipo
    foreach ($my->query("SHOW COLUMNS FROM `$t`") as $c) $colsMy[$c['Field']] = strtolower($c['Type']);
    $colsLite = array_column($lite->query("PRAGMA table_info(`$t`)")->fetchAll(), 'name');
    $cols = array_values(array_intersect($colsLite, array_keys($colsMy)));
    $filas = $lite->query('SELECT ' . implode(',', array_map(fn($c) => "`$c`", $cols)) . " FROM `$t`")->fetchAll();
    foreach (array_chunk($filas, 200) as $lote) {
        $vals = [];
        foreach ($lote as $f) foreach ($cols as $c) $vals[] = convertir($f[$c], $colsMy[$c], $t, $c);
        $fila = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';
        $st = $my->prepare("INSERT INTO `$t` (" . implode(',', array_map(fn($c) => "`$c`", $cols)) . ') VALUES ' . implode(',', array_fill(0, count($lote), $fila)));
        $st->execute($vals);
    }
    $resumen[$t] = count($filas);
}
$my->exec('SET FOREIGN_KEY_CHECKS = 1');

// 3) Lo que Node creaba al arrancar
completar_base();

// 4) Adjuntos
$dirOrigen = dirname(realpath($origen)) . '/archivos';
$copiados = 0;
if (is_dir($dirOrigen)) foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dirOrigen, FilesystemIterator::SKIP_DOTS)) as $a) {
    $destino = dir_archivos() . '/' . substr($a->getPathname(), strlen($dirOrigen) + 1);
    if (!is_dir(dirname($destino))) mkdir(dirname($destino), 0775, true);
    if (!is_file($destino)) { copy($a->getPathname(), $destino); $copiados++; }
}

// 5) Comprobación: las mismas filas en ambos lados
$diferencias = 0;
foreach ($resumen as $t => $n) {
    $m = (int)$my->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
    if ($m !== $n) { $diferencias++; echo "  ¡OJO! $t: $n en SQLite, $m en MySQL\n"; }
}
printf("Migración terminada: %d tablas, %d filas, %d adjuntos copiados a %s. %s\n", count($resumen), array_sum($resumen), $copiados, dir_archivos(),
    $diferencias ? "$diferencias tablas con diferencias (ver arriba)." : 'Todas las tablas cuadran.');
printf("Usuarios: %d · Cargos: %d · Líderes con procesos: %d\n", $my->query('SELECT COUNT(*) FROM usuarios')->fetchColumn(),
    $my->query('SELECT COUNT(*) FROM cargos')->fetchColumn(), $my->query('SELECT COUNT(DISTINCT usuario_id) FROM usuario_procesos')->fetchColumn());

// Ajusta cada valor al tipo de la columna MySQL
function convertir($v, string $tipo, string $tabla, string $col) {
    if ($v === null) return ($tabla === 'proceso_es' && in_array($col, ['entradas', 'salidas'], true)) ? '[]' : null;
    if ($tipo === 'datetime') { // SQLite guardaba texto: se normaliza a AAAA-MM-DD HH:MM:SS
        if (preg_match('/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/', (string)$v, $m))
            return $m[1] . ' ' . (isset($m[2]) ? str_pad($m[2], 8, ':00') : '00:00:00');
        return null;
    }
    return $v;
}
function instalar_esquema(): void {
    $sql = file_get_contents(__DIR__ . '/../mysql/esquema.sql');
    $sql = preg_replace('/^--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $s) bd()->exec($s);
}
