<?php
// Núcleo de la API de OIKOS en PHP + MySQL: configuración, base de datos, sesión, enrutador y respuestas JSON.
// Reemplaza a server.js/db.js de la versión Node con el mismo contrato: mismas rutas /api/..., mismas respuestas y mensajes.
declare(strict_types=1);

require_once __DIR__ . '/scrypt.php';

// Hora local para periodos y años (las fechas guardadas siguen en UTC, como antes)
date_default_timezone_set('America/Bogota');

// ---------- Configuración ----------
function config(?string $clave = null) {
    static $c = null;
    if ($c === null) {
        $ruta = getenv('OIKOS_CONFIG') ?: __DIR__ . '/config.php'; // las pruebas usan su propia configuración
        if (!is_file($ruta)) { http_response_code(500); header('Content-Type: application/json'); echo json_encode(['error' => 'Falta php/config.php (copia php/config.ejemplo.php)']); exit; }
        $c = require $ruta;
    }
    return $clave === null ? $c : ($c[$clave] ?? null);
}
function datos_dir(): string {
    $d = config('datos_dir') ?: dirname(__DIR__) . '/datos';
    if (!is_dir($d)) @mkdir($d, 0775, true);
    // Si la carpeta queda dentro de la parte pública del servidor, Apache no la sirve
    if (is_dir($d) && !is_file("$d/.htaccess")) @file_put_contents("$d/.htaccess", "Require all denied\n");
    return rtrim($d, '/\\');
}
function dir_archivos(): string { $d = datos_dir() . '/archivos'; if (!is_dir($d)) @mkdir($d, 0775, true); return $d; }

// ---------- Base de datos ----------
function bd(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO('mysql:host=' . config('db_host') . ';dbname=' . config('db_nombre') . ';charset=utf8mb4', config('db_usuario'), config('db_clave'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,      // enteros y decimales llegan como números, igual que en Node
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ]);
    // Fechas en UTC como antes, y GROUP BY tolerante como SQLite
    $pdo->exec("SET time_zone = '+00:00', sql_mode = REPLACE(REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''), ',,', ',')");
    return $pdo;
}
// Como en Node: undefined y '' se guardan como NULL; los booleanos como 0/1
function nulos(array $p): array {
    return array_map(fn($v) => ($v === null || $v === '') ? null : (is_bool($v) ? (int)$v : $v), $p);
}
function preparar(string $sql, array $p): PDOStatement {
    $st = bd()->prepare($sql);
    foreach (array_values(nulos($p)) as $i => $v)
        $st->bindValue($i + 1, $v, is_int($v) ? PDO::PARAM_INT : ($v === null ? PDO::PARAM_NULL : PDO::PARAM_STR));
    $st->execute();
    return $st;
}
function todos(string $sql, ...$p): array { return preparar($sql, $p)->fetchAll(); }
function uno(string $sql, ...$p): ?array { $f = preparar($sql, $p)->fetch(); return $f === false ? null : $f; }
// Devuelve el id insertado (lastInsertRowid de Node) o, si no hubo inserción, las filas afectadas
function ejecutar(string $sql, ...$p): int {
    $st = preparar($sql, $p);
    $id = (int)bd()->lastInsertId();
    return stripos(ltrim($sql), 'INSERT') === 0 && $id ? $id : $st->rowCount();
}
function transaccion(callable $fn) {
    static $nivel = 0;
    if ($nivel++ === 0) bd()->beginTransaction();
    try { $v = $fn(); if (--$nivel === 0) bd()->commit(); return $v; }
    catch (Throwable $e) { if (--$nivel === 0 && bd()->inTransaction()) bd()->rollBack(); throw $e; }
}
// Lista de marcadores "?,?,?" para IN (...)
function marcas(array $l): string { return implode(',', array_fill(0, max(1, count($l)), '?')); }
function ahora(): string { return gmdate('Y-m-d H:i:s'); }
function hace_segundos(int $s): string { return gmdate('Y-m-d H:i:s', time() + $s); }

// ---------- Errores HTTP ----------
final class ErrorHttp extends Exception {
    public int $estado;
    public function __construct(int $estado, string $msg) { parent::__construct($msg); $this->estado = $estado; }
}
function falla(int $estado, string $msg): never { throw new ErrorHttp($estado, $msg); }

// ---------- Claves ----------
function hash_clave(string $clave): string { return password_hash($clave, PASSWORD_DEFAULT); }
// Acepta las claves nuevas (password_hash) y las heredadas de Node (scrypt "sal:hash"); estas se vuelven a guardar al acertar
function verificar(string $clave, string $guardada, ?int $usuarioId = null): bool {
    if (str_starts_with($guardada, '$')) return password_verify($clave, $guardada);
    if (!preg_match('/^([a-f0-9]+):([a-f0-9]{64})$/', $guardada, $m)) return false;
    $ok = hash_equals($m[2], bin2hex(scrypt_hash($clave, $m[1])));
    if ($ok && $usuarioId) ejecutar('UPDATE usuarios SET clave = ? WHERE id = ?', hash_clave($clave), $usuarioId);
    return $ok;
}

// ---------- Texto ----------
// Como norm() de Node: sin tildes, sin espacios a los lados y en minúsculas
function norm($s): string {
    $s = (string)($s ?? '');
    if (class_exists('Normalizer')) $s = preg_replace('/\p{Mn}+/u', '', Normalizer::normalize($s, Normalizer::FORM_D));
    else $s = strtr($s, ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n','Á'=>'A','É'=>'E','Í'=>'I','Ó'=>'O','Ú'=>'U','Ü'=>'U','Ñ'=>'N']);
    return mb_strtolower(trim($s));
}
function txt($v): string { return trim((string)($v ?? '')); }
function esta($a, string $k): bool { return is_array($a) && array_key_exists($k, $a); }

// ---------- Petición ----------
final class Peticion {
    public string $metodo; public string $ruta; public array $params = []; public array $query = []; public array $body = [];
    public array $files = []; public ?array $u = null; public string $ip;
    public function q(string $k) { return $this->query[$k] ?? null; }       // como req.query.x: texto, o lista si se repite
    public function b(string $k) { return $this->body[$k] ?? null; }
    public function p(string $k): string { return (string)($this->params[$k] ?? ''); }
}
// Lee la cadena de consulta como Express: una clave repetida (?tipo=1&tipo=2) da una lista
function leer_query(string $qs): array {
    $out = [];
    foreach (explode('&', $qs) as $par) {
        if ($par === '') continue;
        [$k, $v] = array_pad(explode('=', $par, 2), 2, '');
        $k = urldecode(str_replace('+', ' ', $k)); $v = urldecode(str_replace('+', ' ', $v));
        if (str_ends_with($k, '[]')) $k = substr($k, 0, -2);
        if (array_key_exists($k, $out)) $out[$k] = array_merge((array)$out[$k], [$v]); else $out[$k] = $v;
    }
    return $out;
}
// Valor de consulta como lista sin vacíos (lista(v) de Node)
function lista($v): array { return array_values(array_filter(is_array($v) ? $v : ($v === null ? [] : [$v]), fn($x) => $x !== '' && $x !== null)); }

// ---------- Enrutador ----------
final class Rutas {
    private array $rutas = [];
    public function agregar(string $metodo, string $patron, callable $fn, bool $publica = false): void {
        $re = '#^' . preg_replace('#:([a-z_]+)#', '(?P<$1>[^/]+)', $patron) . '$#';
        $this->rutas[] = [$metodo, $re, $fn, $publica];
    }
    public function get(string $p, callable $f, bool $pub = false): void { $this->agregar('GET', $p, $f, $pub); }
    public function post(string $p, callable $f, bool $pub = false): void { $this->agregar('POST', $p, $f, $pub); }
    public function put(string $p, callable $f): void { $this->agregar('PUT', $p, $f); }
    public function delete(string $p, callable $f): void { $this->agregar('DELETE', $p, $f); }
    public function buscar(string $metodo, string $ruta): ?array {
        foreach ($this->rutas as [$m, $re, $fn, $pub])
            if ($m === $metodo && preg_match($re, $ruta, $mm))
                return [$fn, array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY), $pub];
        return null;
    }
}

// ---------- Respuestas ----------
function json_respuesta(int $estado, $datos): void {
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
}
// Envía un archivo para descargar (res.download de Node)
function descargar(string $ruta, string $nombre): void {
    if (!is_file($ruta)) falla(404, 'Archivo no encontrado');
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($ruta));
    header("Content-Disposition: attachment; filename=\"" . str_replace('"', '', preg_replace('/[^\x20-\x7e]/', '_', $nombre)) . "\"; filename*=UTF-8''" . rawurlencode($nombre));
    readfile($ruta);
}
// Envía contenido generado (CSV, XLSX) como descarga
function enviar_archivo(string $contenido, string $nombre, string $tipo): void {
    header('Content-Type: ' . $tipo);
    header("Content-Disposition: attachment; filename=\"" . preg_replace('/[^\x20-\x7e]/', '_', $nombre) . "\"; filename*=UTF-8''" . rawurlencode($nombre));
    echo $contenido;
}

// ---------- Sesión ----------
function sesion_segundos(): int { return max(2, (int)round(((float)(config('sesion_horas') ?: 12)) * 3600)); }
function es_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}
function cookie_sesion(string $valor, int $vida): void {
    header('Set-Cookie: ' . "sgi=$valor; HttpOnly; SameSite=Strict; Path=/; Max-Age=$vida" . (es_https() ? '; Secure' : ''), false);
}
function token_cookie(): ?string {
    return preg_match('/(?:^|;\s*)sgi=([a-f0-9]+)/', $_SERVER['HTTP_COOKIE'] ?? '', $m) ? $m[1] : null;
}
function usuario_de_sesion(): ?array {
    $t = token_cookie();
    if (!$t) return null;
    return uno('SELECT u.id, u.usuario, u.correo, u.nombre, u.cargo, u.rol, u.proceso_id, u.empresa_id, u.debe_cambiar
      FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND u.activo = 1 AND s.creada > ?', $t, hace_segundos(-sesion_segundos()));
}
function es_calidad(array $u): bool { return $u['rol'] === 'admin' || $u['rol'] === 'lider_calidad'; }
