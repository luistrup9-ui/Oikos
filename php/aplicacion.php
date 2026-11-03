<?php
// Atiende una petición a la API: arma la petición, valida la sesión, llama al módulo y responde JSON (como server.js).
declare(strict_types=1);

// Un aviso de PHP (obsoleto, variable sin definir...) nunca debe mezclarse con el JSON: se anota en el registro y no se muestra
ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/nucleo.php';
require_once __DIR__ . '/alcance.php';
require_once __DIR__ . '/correo.php';
require_once __DIR__ . '/migraciones.php';

// Tareas que corren después de enviar la respuesta (p. ej. el correo de recuperación)
function despues_de_responder(?callable $fn = null): array {
    static $tareas = [];
    if ($fn) $tareas[] = $fn;
    return $tareas;
}

// Módulos ya pasados a PHP. Cada uno registra sus rutas en $R.
const MODULOS = ['sesion', 'usuarios', 'cargos', 'documentos', 'procesos', 'indicadores', 'riesgos', 'auditorias', 'mecanismos', 'glosario', 'calendario', 'importar', 'respaldos'];

$R = new Rutas();
foreach (MODULOS as $m) require __DIR__ . "/modulos/$m.php";
$R->get('/healthz', function () {
    bd()->query('SELECT 1');
    // migraciones_pendientes: cuántas de mysql/migraciones/ faltan por aplicar (null si la carpeta o el registro no cuadran)
    $m = estado_migraciones();
    // commit: versión del código en esta carpeta; despliegue_ok: si el último despliegue automático (cron) salió bien
    return ['ok' => true, 'php' => PHP_VERSION, 'modulos' => MODULOS, 'migraciones_pendientes' => $m['error'] ? null : count($m['pendientes']), 'commit' => commit_desplegado(), 'despliegue_ok' => despliegue_ok()];
}, true);

// Cabeceras de seguridad (las mismas de la versión Node)
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
if (es_https()) header('Strict-Transport-Security: max-age=31536000');

$req = new Peticion();
$req->metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$ruta = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
// La app puede vivir en una subcarpeta (XAMPP: /OIKOS/public/api/...); se toma desde /api o /healthz
$req->ruta = preg_match('#(/api/.*|/healthz)$#', $ruta, $m) ? $m[1] : $ruta;
$req->query = leer_query($_SERVER['QUERY_STRING'] ?? '');
$req->ip = $_SERVER['REMOTE_ADDR'] ?? '';
$tipo = $_SERVER['CONTENT_TYPE'] ?? '';
if (str_contains($tipo, 'application/json')) $req->body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
else $req->body = $_POST;
$req->files = $_FILES;

try {
    $encontrada = $R->buscar($req->metodo, $req->ruta);
    if (!$encontrada) falla(404, 'No encontrado');
    [$fn, $params, $publica] = $encontrada;
    $req->params = $params;
    if (!$publica) {
        $req->u = usuario_de_sesion();
        if (!$req->u) falla(401, 'Sesión no válida');
    }
    $out = $fn($req);
    if ($out !== null) json_respuesta(200, $out);
} catch (ErrorHttp $e) {
    json_respuesta($e->estado, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
    // El detalle (SQL, rutas, servidor) queda solo en el registro; a la persona le llega un mensaje entendible
    error_log('OIKOS: ' . $e);
    $mysql = $e instanceof PDOException ? (int)($e->errorInfo[1] ?? $e->getCode()) : 0;
    if (in_array($mysql, [2002, 2003, 2006, 1045, 1049], true))
        json_respuesta(503, ['error' => 'No se pudo conectar con la base de datos. Intenta de nuevo en un momento o avisa al administrador.']);
    elseif ($mysql === 1062)
        json_respuesta(409, ['error' => 'Ya existe un registro con ese código o nombre. Revisa los datos e intenta de nuevo.']);
    elseif (in_array($mysql, [1451, 1452], true))
        json_respuesta(409, ['error' => 'No se puede completar: el registro está relacionado con otros datos (o apunta a uno que ya no existe).']);
    else json_respuesta(500, ['error' => 'Ocurrió un error inesperado. Intenta de nuevo; si se repite, avisa al administrador.']);
}

// Lo que no debe demorar la respuesta
if ($tareas = despues_de_responder()) {
    // Se libera la respuesta antes de seguir (PHP-FPM o LiteSpeed, que son los de cPanel); sin ninguno, se vacía el búfer y ya
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
    else flush();
    foreach ($tareas as $t) { try { $t(); } catch (Throwable $e) { error_log('OIKOS: ' . $e); } }
}
// De vez en cuando se limpian las sesiones vencidas y los registros de intentos
if (random_int(1, 100) === 1) {
    try {
        ejecutar('DELETE FROM sesiones WHERE creada < ?', hace_segundos(-sesion_segundos()));
        ejecutar('DELETE FROM intentos_login WHERE hasta < ?', (int)(microtime(true) * 1000));
    } catch (Throwable $e) { error_log('OIKOS: ' . $e); }
}
