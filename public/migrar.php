<?php
// Aplica las migraciones pendientes de la base (mysql/migraciones/*.sql). Solo POST, con el encabezado X-Migracion-Token igual a
// migracion_token de php/config.php. Es un disparo manual opcional: el despliegue normal corre las migraciones con herramientas/desplegar.sh (cron).
// Responde JSON: {ok, aplicadas, pendientes, error, respaldo}.
// Sin token, con uno equivocado o con migracion_token vacío en la configuración: 403 y no hace nada.
declare(strict_types=1);
require __DIR__ . '/../php/migraciones.php';

function responder(int $estado, array $datos): never {
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); responder(405, ['ok' => false, 'error' => 'Solo POST']); }

$esperado = (string)config('migracion_token');
$recibido = (string)($_SERVER['HTTP_X_MIGRACION_TOKEN'] ?? '');
// Con token vacío o corto la dirección queda apagada (hash_equals('', '') sería verdadero)
if (strlen($esperado) < 32 || !hash_equals($esperado, $recibido)) {
    usleep(300000);
    responder(403, ['ok' => false, 'error' => 'No autorizado']);
}

try {
    $r = aplicar_migraciones();
    responder($r['ok'] ? 200 : (str_starts_with((string)$r['error'], 'Ya hay otra') ? 409 : 500), $r);
} catch (Throwable $e) {
    error_log('OIKOS migrar: ' . $e);
    responder(500, ['ok' => false, 'aplicadas' => [], 'pendientes' => [], 'error' => $e->getMessage(), 'respaldo' => null]);
}
