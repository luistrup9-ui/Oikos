<?php
// Crea un administrador, o devuelve el acceso a uno que ya existe, sobre la base MySQL en uso. En consola:
//   php herramientas/crear-admin.php correo@empresa.com --nombre="Nombre Apellido" [--clave=MiClave123]
//   php herramientas/crear-admin.php usuario_ya_existente [--clave=MiClave123]      (p. ej. admin)
// Sin --clave genera una y la muestra. La clave queda tal cual (no pide cambiarla al entrar) para poder anotarla.
// También sirve cuando se perdieron todos los accesos: solo lo corre quien tiene acceso al servidor.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../php/nucleo.php';

function uso(string $msg = ''): never {
    fwrite(STDERR, ($msg ? "$msg\n\n" : '') . "Uso:\n  php herramientas/crear-admin.php correo@empresa.com --nombre=\"Nombre Apellido\" [--clave=MiClave123]\n  php herramientas/crear-admin.php usuario_ya_existente [--clave=MiClave123]\n(la clave: mínimo 8 caracteres, con letras y números; si no la das, se genera una)\n");
    exit(1);
}
// En Windows los argumentos llegan en la página de códigos local; la base guarda UTF-8
function utf8(string $s): string { return mb_check_encoding($s, 'UTF-8') ? $s : mb_convert_encoding($s, 'UTF-8', 'Windows-1252'); }
function generar_clave(): string {
    $a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do { $c = ''; foreach (str_split(random_bytes(10)) as $b) $c .= $a[ord($b) % strlen($a)]; }
    while (!preg_match('/[a-zA-Z]/', $c) || !preg_match('/\d/', $c));
    return $c;
}

$pos = []; $op = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--(nombre|clave)=(.*)$/s', $a, $m)) $op[$m[1]] = utf8($m[2]); else $pos[] = utf8($a);
}
$quien = mb_strtolower(trim($pos[0] ?? ''));
if ($quien === '' || count($pos) > 1) uso();
$nombre = trim($op['nombre'] ?? '');
$clave = $op['clave'] ?? '';
$generada = $clave === '';
if ($generada) $clave = generar_clave();
if (strlen($clave) < 8 || !preg_match('/[a-zA-Z]/', $clave) || !preg_match('/\d/', $clave)) uso('La clave debe tener al menos 8 caracteres, con letras y números.');

$u = uno(str_contains($quien, '@') ? 'SELECT * FROM usuarios WHERE correo = ?' : 'SELECT * FROM usuarios WHERE usuario = ?', $quien);
if ($u) {
    $antes = $u['activo'] && $u['rol'] === 'admin' ? '' : ' (antes: ' . ($u['activo'] ? '' : 'inactivo, ') . $u['rol'] . ')';
    ejecutar("UPDATE usuarios SET rol = 'admin', activo = 1, clave = ?, debe_cambiar = 0, reinicio_solicitado = NULL, nombre = ? WHERE id = ?", hash_clave($clave), $nombre !== '' ? $nombre : $u['nombre'], $u['id']);
    $accion = 'Acceso devuelto al usuario existente' . $antes;
} else {
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u', $quien)) uso("No existe el usuario «{$quien}». Para crear uno nuevo, escribe su correo.");
    if ($nombre === '') uso('Falta el nombre: --nombre="Nombre Apellido".');
    $base = substr(preg_replace('/[^a-z0-9._-]+/', '.', explode('@', $quien)[0]) ?: 'admin', 0, 30);
    $usuario = $base;
    for ($n = 2; uno('SELECT id FROM usuarios WHERE usuario = ?', $usuario); $n++) $usuario = substr($base, 0, 30 - strlen((string)$n)) . $n;
    $empresa = uno('SELECT id FROM empresas ORDER BY id LIMIT 1')['id'] ?? null;
    $id = ejecutar("INSERT INTO usuarios (empresa_id, usuario, correo, nombre, cargo, rol, clave, activo, debe_cambiar) VALUES (?, ?, ?, ?, 'Administrador del sistema', 'admin', ?, 1, 0)",
        $empresa, $usuario, $quien, $nombre, hash_clave($clave));
    $u = uno('SELECT * FROM usuarios WHERE id = ?', $id);
    $accion = 'Administrador creado';
}
// Que el nuevo acceso funcione de inmediato: sin bloqueos por intentos fallidos ni sesiones viejas
foreach (array_filter([mb_strtolower($u['usuario']), mb_strtolower((string)$u['correo'])]) as $k) ejecutar('DELETE FROM intentos_login WHERE clave = ?', $k);
ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', $u['id']);

$u = uno('SELECT * FROM usuarios WHERE id = ?', $u['id']);
echo "$accion.\n";
echo "  Nombre:  {$u['nombre']}\n";
echo "  Usuario: {$u['usuario']}\n";
echo '  Correo:  ' . ($u['correo'] ?: '(sin correo; ingresa con el usuario)') . "\n";
echo "  Clave:   $clave" . ($generada ? '  (generada)' : '') . "\n";
echo "  Rol:     Administrador\n";
