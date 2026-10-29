<?php
// Ingreso, salida, quién soy y catálogos (antes en server.js)
declare(strict_types=1);

// Bloqueo tras 5 fallos en 15 minutos (en Node vivía en memoria; aquí en la tabla intentos_login)
function intentos_de(string $clave): ?array {
    $r = uno('SELECT n, hasta FROM intentos_login WHERE clave = ?', $clave);
    return $r && $r['hasta'] > (int)(microtime(true) * 1000) ? $r : null;
}

$R->post('/api/login', function (Peticion $req) {
    // Se ingresa con el correo corporativo (o con el usuario de siempre); el campo del formulario se llama «usuario»
    $nombre = mb_strtolower(txt($req->b('usuario') ?? $req->b('correo')));
    $reg = intentos_de($nombre);
    if ($reg && $reg['n'] >= 5) falla(429, 'Demasiados intentos fallidos. Espera 15 minutos.');
    $u = uno(str_contains($nombre, '@') ? 'SELECT * FROM usuarios WHERE correo = ?' : 'SELECT * FROM usuarios WHERE usuario = ?', $nombre);
    if (!$u || !$u['activo'] || !verificar((string)($req->b('clave') ?? ''), $u['clave'], $u['id'])) {
        ejecutar('REPLACE INTO intentos_login (clave, n, hasta) VALUES (?,?,?)', $nombre, ($reg ? $reg['n'] : 0) + 1, (int)(microtime(true) * 1000) + 15 * 60 * 1000);
        falla(401, 'Correo o clave incorrectos');
    }
    ejecutar('DELETE FROM intentos_login WHERE clave = ?', $nombre);
    $t = bin2hex(random_bytes(24));
    ejecutar('INSERT INTO sesiones (token, usuario_id, creada) VALUES (?,?,?)', $t, $u['id'], ahora());
    cookie_sesion($t, sesion_segundos());
    return ['ok' => true];
}, true);

$R->post('/api/logout', function (Peticion $req) {
    ejecutar('DELETE FROM sesiones WHERE token = ?', token_cookie());
    cookie_sesion('', 0);
    return ['ok' => true];
});

// procesos_propios: los procesos que lidera; null si no tiene restricción
$R->get('/api/yo', fn(Peticion $req) => $req->u + [
    'empresa' => uno('SELECT nombre FROM empresas WHERE id = ?', $req->u['empresa_id'])['nombre'] ?? null,
    'procesos_propios' => propios($req->u),
]);

$R->get('/api/catalogos', fn(Peticion $req) => [
    'procesos' => todos('SELECT * FROM procesos WHERE empresa_id = ? ORDER BY orden', $req->u['empresa_id']),
    'tipos' => todos('SELECT * FROM tipos_documento ORDER BY id'),
    'clases' => todos('SELECT * FROM clases_documento ORDER BY nombre'),
    'estados' => todos('SELECT * FROM estados ORDER BY orden'),
    'transiciones' => todos('SELECT id, nombre FROM transiciones ORDER BY pos'),
    'usuarios' => todos('SELECT id, nombre, cargo, rol FROM usuarios WHERE empresa_id = ? AND activo = 1 ORDER BY nombre', $req->u['empresa_id']),
]);
