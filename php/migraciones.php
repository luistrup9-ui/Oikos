<?php
// Migraciones de la base de datos: aplica, en orden y UNA sola vez cada una, los archivos mysql/migraciones/NNN_descripcion.sql.
// El registro está en la tabla migraciones_aplicadas (archivo, fecha, sha). Lo usan herramientas/migrar.php (consola),
// public/migrar.php (POST con token; lo llama el despliegue automático) y /healthz (cuenta las pendientes).
// Cómo se escribe una migración: ver CLAUDE.md y mysql/migraciones/LEEME.md.
declare(strict_types=1);

require_once __DIR__ . '/nucleo.php';

const PATRON_MIGRACION = '/^\d{3}_[a-z0-9_]+\.sql$/';
// Misma definición que en mysql/esquema.sql: así existe también en bases que se crearon antes de las migraciones
const TABLA_MIGRACIONES = 'CREATE TABLE IF NOT EXISTS migraciones_aplicadas (archivo VARCHAR(190) PRIMARY KEY, fecha DATETIME NOT NULL, sha CHAR(64) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

function dir_migraciones(): string { return dirname(__DIR__) . '/mysql/migraciones'; }

// Nombres de los archivos .sql de la carpeta, en el orden en que se aplican
function archivos_migraciones(): array {
    $nombres = [];
    foreach (is_dir(dir_migraciones()) ? scandir(dir_migraciones()) : [] as $n) {
        if (strtolower(substr($n, -4)) !== '.sql') continue;
        if (!preg_match(PATRON_MIGRACION, $n)) throw new RuntimeException("Nombre de migración inválido: $n (debe ser NNN_descripcion.sql, en minúsculas y con guion bajo)");
        $nombres[] = $n;
    }
    sort($nombres, SORT_STRING);
    for ($i = 1; $i < count($nombres); $i++)
        if (substr($nombres[$i], 0, 3) === substr($nombres[$i - 1], 0, 3))
            throw new RuntimeException('Hay dos migraciones con el número ' . substr($nombres[$i], 0, 3) . ": {$nombres[$i - 1]} y {$nombres[$i]}");
    return $nombres;
}
// Contenido sin BOM y con saltos de línea \n: el sha no cambia entre Windows (CRLF) y el servidor (LF)
function leer_migracion(string $nombre): string {
    $t = file_get_contents(dir_migraciones() . "/$nombre");
    if ($t === false) throw new RuntimeException("No pude leer la migración $nombre");
    return str_replace("\r\n", "\n", preg_replace('/^\xEF\xBB\xBF/', '', $t));
}
function sha_migracion(string $nombre): string { return hash('sha256', leer_migracion($nombre)); }

// archivo => sha de las migraciones ya aplicadas (vacío si la tabla aún no existe)
function migraciones_registradas(): array {
    try { return array_column(todos('SELECT archivo, sha FROM migraciones_aplicadas'), 'sha', 'archivo'); }
    catch (PDOException $e) { if ((int)($e->errorInfo[1] ?? 0) === 1146) return []; throw $e; }
}

// Compara los archivos con el registro. Si algo no cuadra, 'error' dice qué y no se debe aplicar nada.
function estado_migraciones(): array {
    $aplicadas = migraciones_registradas();
    try { $archivos = archivos_migraciones(); }
    catch (RuntimeException $e) { return ['aplicadas' => $aplicadas, 'pendientes' => [], 'error' => $e->getMessage()]; }
    $nombres = array_keys($aplicadas); sort($nombres, SORT_STRING);
    $ultima = (string)end($nombres);
    $pendientes = []; $error = null;
    foreach ($archivos as $n) {
        if (!isset($aplicadas[$n])) {
            if ($ultima !== '' && $n < $ultima) $error ??= "La migración $n va antes de la última aplicada ($ultima): ponle un número mayor.";
            $pendientes[] = $n;
        } elseif (!hash_equals($aplicadas[$n], sha_migracion($n)))
            $error ??= "La migración $n ya estaba aplicada y su contenido cambió. Nunca se edita una migración ya subida: devuelve el cambio y crea una nueva.";
    }
    return ['aplicadas' => $aplicadas, 'pendientes' => $pendientes, 'error' => $error];
}

// Parte un script SQL en sentencias. Respeta textos y nombres entre comillas (un «;» dentro de un texto no corta) y quita
// los comentarios «-- », «#» y «/* */» (los /*! ... */ de mysqldump se conservan). No sirve para DELIMITER (triggers ni procedimientos).
function dividir_sql(string $sql): array {
    $sentencias = []; $actual = ''; $n = strlen($sql);
    for ($i = 0; $i < $n; $i++) {
        $c = $sql[$i];
        if ($c === "'" || $c === '"' || $c === '`') {
            $j = $i + 1;
            while ($j < $n) {
                if ($sql[$j] === '\\' && $c !== '`') { $j += 2; continue; }
                if ($sql[$j] === $c) { if (($sql[$j + 1] ?? '') === $c) { $j += 2; continue; } break; }
                $j++;
            }
            $actual .= substr($sql, $i, $j - $i + 1); $i = $j;
        } elseif ($c === '#' || ($c === '-' && ($sql[$i + 1] ?? '') === '-' && in_array($sql[$i + 2] ?? "\n", [' ', "\t", "\r", "\n"], true))) {
            $fin = strpos($sql, "\n", $i); $actual .= "\n"; $i = $fin === false ? $n : $fin;
        } elseif ($c === '/' && ($sql[$i + 1] ?? '') === '*') {
            $fin = strpos($sql, '*/', $i + 2); $fin = $fin === false ? $n - 1 : $fin + 1;
            if (($sql[$i + 2] ?? '') === '!' || substr($sql, $i + 2, 2) === 'M!') $actual .= substr($sql, $i, $fin - $i + 1);
            $i = $fin;
        } elseif ($c === ';') {
            if (trim($actual) !== '') $sentencias[] = trim($actual);
            $actual = '';
        } else $actual .= $c;
    }
    if (trim($actual) !== '') $sentencias[] = trim($actual);
    return $sentencias;
}

// Instalación nueva: mysql/esquema.sql ya trae el efecto de todas las migraciones que existen, así que se anotan como aplicadas sin correrlas.
function registrar_migraciones_existentes(): int {
    bd()->exec(TABLA_MIGRACIONES);
    $nuevas = 0;
    foreach (archivos_migraciones() as $a)
        $nuevas += preparar('INSERT IGNORE INTO migraciones_aplicadas (archivo, fecha, sha) VALUES (?,?,?)', [$a, ahora(), sha_migracion($a)])->rowCount();
    return $nuevas;
}

// Aplica las pendientes, de una en una y en orden. Antes hace una copia de seguridad (solo si hay algo que aplicar).
// Cada archivo se anota solo si terminó bien; si una sentencia falla se detiene ahí (MySQL no deshace el DDL: por eso
// las migraciones se escriben con IF NOT EXISTS y de a un cambio). Devuelve ok, aplicadas, pendientes, error y respaldo.
function aplicar_migraciones(): array {
    $r = ['ok' => false, 'aplicadas' => [], 'pendientes' => [], 'error' => null, 'respaldo' => null];
    @set_time_limit(600);
    $pdo = bd();
    $candado = 'oikos_migraciones_' . config('db_nombre'); // evita que dos ejecuciones corran a la vez (p. ej. dos push seguidos)
    if (!$pdo->query('SELECT GET_LOCK(' . $pdo->quote($candado) . ', 0)')->fetchColumn()) { $r['error'] = 'Ya hay otra migración corriendo; espera a que termine.'; return $r; }
    try {
        $pdo->exec(TABLA_MIGRACIONES);
        $e = estado_migraciones();
        $r['pendientes'] = $e['pendientes'];
        if ($e['error']) { $r['error'] = $e['error']; return $r; }
        if (!$e['pendientes']) { $r['ok'] = true; return $r; }

        if (!function_exists('crear_respaldo')) require __DIR__ . '/respaldo.php';
        try { $r['respaldo'] = crear_respaldo()['nombre']; }
        catch (Throwable $x) { $r['error'] = 'No se aplicó nada: falló la copia de seguridad previa (' . $x->getMessage() . ')'; return $r; }

        foreach ($e['pendientes'] as $nombre) {
            $sentencias = dividir_sql(leer_migracion($nombre));
            try { foreach ($sentencias as $i => $s) $pdo->exec($s); }
            catch (Throwable $x) {
                $r['error'] = "Falló $nombre en la sentencia " . ($i + 1) . ' de ' . count($sentencias) . ': ' . $x->getMessage() . ' (el archivo no quedó anotado como aplicado; revisa la base antes de volver a correrlo)';
                return $r;
            } finally { $pdo->exec('SET FOREIGN_KEY_CHECKS = 1'); }
            preparar('INSERT INTO migraciones_aplicadas (archivo, fecha, sha) VALUES (?,?,?)', [$nombre, ahora(), sha_migracion($nombre)]);
            $r['aplicadas'][] = $nombre;
            array_shift($r['pendientes']);
        }
        $r['ok'] = true;
        return $r;
    } finally { $pdo->query('SELECT RELEASE_LOCK(' . $pdo->quote($candado) . ')')->fetchAll(); }
}
