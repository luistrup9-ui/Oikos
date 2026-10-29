<?php
// Usuarios, claves y «¿Olvidaste tu clave?» (antes en admin.js)
declare(strict_types=1);

const ROLES = ['admin', 'lider_calidad', 'lider_proceso', 'consulta'];
// Las claves internas no cambian (la base las exige); estos son los nombres que ve la gente
const ROL_ETIQUETA = ['admin' => 'Administrador', 'lider_calidad' => 'Gestor de Calidad', 'lider_proceso' => 'Líder', 'consulta' => 'Colaborador'];
const CORREO_RE = '/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u';

function generar_clave(): string {
    $a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do { $c = ''; foreach (str_split(random_bytes(10)) as $b) $c .= $a[ord($b) % strlen($a)]; }
    while (!preg_match('/[a-zA-Z]/', $c) || !preg_match('/\d/', $c));
    return $c;
}
function solo_admin(array $u, string $msg = 'Solo el administrador gestiona usuarios'): void { if ($u['rol'] !== 'admin') falla(403, $msg); }
function clave_valida($clave, $usuario): void {
    $clave = (string)($clave ?? '');
    if (mb_strlen($clave) < 8) falla(400, 'La clave debe tener al menos 8 caracteres');
    if (!preg_match('/[a-zA-Z]/', $clave) || !preg_match('/\d/', $clave)) falla(400, 'La clave debe mezclar letras y números');
    if (norm($clave) === norm($usuario)) falla(400, 'La clave no puede ser igual al usuario');
}
function otros_admins(int $id): int { return (int)uno("SELECT COUNT(*) n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id != ?", $id)['n']; }
function limpiar_correo($c): string { return mb_strtolower(txt($c)); }
function correo_libre(string $correo, int $idPropio = 0): void {
    if (!preg_match(CORREO_RE, $correo) || mb_strlen($correo) > 120) falla(400, 'El correo no es válido (ejemplo: nombre@empresa.com)');
    if (uno('SELECT 1 FROM usuarios WHERE correo = ? AND id != ?', $correo, $idPropio)) falla(400, 'Ese correo ya pertenece a otro usuario');
}
// El usuario interno sale de la parte del correo antes de la @; si ya existe se le agrega un número
function usuario_desde(string $correo): string {
    $base = preg_replace('/[^a-z0-9._-]+/', '.', norm(explode('@', $correo)[0]));
    $base = str_pad(substr(trim($base, '.'), 0, 26), 3, 'x');
    $u = $base; $n = 2;
    while (uno('SELECT 1 FROM usuarios WHERE usuario = ?', $u)) $u = $base . $n++;
    return $u;
}
// El Líder lidera los procesos y subprocesos que el administrador le marque; los demás roles pueden tener un proceso de referencia
function lista_ids($v): array {
    $out = [];
    foreach ((array)($v ?? []) as $x) foreach (explode(',', (string)$x) as $p) { $n = (int)$p; if ($n > 0) $out[$n] = $n; }
    return array_values($out);
}
function con_subprocesos(int $id): array { return array_map(fn($p) => (int)$p['id'], todos('SELECT id FROM procesos WHERE id = ? OR padre_id = ?', $id, $id)); }
function validar_perfil(array &$b, int $empresaId): void {
    if (txt($b['nombre'] ?? '') === '') falla(400, 'El nombre es obligatorio');
    if (!in_array($b['rol'] ?? null, ROLES, true)) falla(400, 'Rol inválido');
    $b['procesos'] = $b['rol'] !== 'lider_proceso' ? [] : (array_key_exists('procesos', $b) ? lista_ids($b['procesos']) : (!empty($b['proceso_id']) ? con_subprocesos((int)$b['proceso_id']) : []));
    if ($b['rol'] === 'lider_proceso' && !$b['procesos']) falla(400, 'Marca al menos un proceso que lidere');
    foreach (array_merge($b['procesos'], !empty($b['proceso_id']) ? [$b['proceso_id']] : []) as $id)
        if (!uno('SELECT 1 FROM procesos WHERE id = ? AND empresa_id = ?', $id, $empresaId)) falla(400, 'Proceso inválido');
    // proceso principal (agenda, perfil): el primero marcado que no sea subproceso, o el primero
    if ($b['rol'] === 'lider_proceso') {
        $principal = $b['procesos'][0];
        foreach ($b['procesos'] as $id) if (!uno('SELECT padre_id FROM procesos WHERE id = ?', $id)['padre_id']) { $principal = $id; break; }
        $b['proceso_id'] = $principal;
    }
}
// Cargo: si viene cargo_id, el nombre del cargo sale de la tabla de cargos
function resolver_cargo(array $b, int $empresaId, array $actual = []): array {
    if (!array_key_exists('cargo_id', $b)) return ['cargo_id' => $actual['cargo_id'] ?? null, 'cargo' => $b['cargo'] ?? $actual['cargo'] ?? null];
    $id = (int)$b['cargo_id'] ?: null;
    if (!$id) return ['cargo_id' => null, 'cargo' => null];
    $c = uno('SELECT nombre FROM cargos WHERE id = ? AND empresa_id = ?', $id, $empresaId);
    if (!$c) falla(400, 'Cargo inválido');
    return ['cargo_id' => $id, 'cargo' => $c['nombre']];
}
function guardar_procesos(int $id, array $lista): void {
    ejecutar('DELETE FROM usuario_procesos WHERE usuario_id = ?', $id);
    foreach ($lista as $p) ejecutar('INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (?,?)', $id, $p);
}

$R->get('/api/usuarios', function (Peticion $req) {
    solo_admin($req->u);
    $marcados = [];
    foreach (todos('SELECT up.usuario_id, up.proceso_id FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id WHERE u.empresa_id = ? ORDER BY up.proceso_id', $req->u['empresa_id']) as $x)
        $marcados[$x['usuario_id']][] = $x['proceso_id'];
    return array_map(fn($u) => $u + ['procesos' => $u['rol'] === 'lider_proceso' ? ($marcados[$u['id']] ?? []) : []],
        todos('SELECT u.id, u.usuario, u.correo, u.nombre, u.cargo, u.cargo_id, u.rol, u.proceso_id, u.activo, u.debe_cambiar, u.reinicio_solicitado, p.nombre proceso
          FROM usuarios u LEFT JOIN procesos p ON p.id = u.proceso_id WHERE u.empresa_id = ? ORDER BY u.activo DESC, u.nombre', $req->u['empresa_id']));
});

$R->post('/api/usuarios', function (Peticion $req) {
    solo_admin($req->u);
    $b = $req->body; $correo = limpiar_correo($b['correo'] ?? '');
    correo_libre($correo);
    $usuario = mb_strtolower(txt($b['usuario'] ?? ''));
    if ($usuario !== '') {
        if (!preg_match('/^[a-z0-9._-]{3,30}$/', $usuario)) falla(400, 'El usuario va de 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo');
        if (uno('SELECT 1 FROM usuarios WHERE usuario = ?', $usuario)) falla(400, 'Ese usuario ya existe');
    } else $usuario = usuario_desde($correo);
    validar_perfil($b, $req->u['empresa_id']);
    if (!empty($b['clave'])) clave_valida($b['clave'], $usuario);
    $clave = !empty($b['clave']) ? (string)$b['clave'] : generar_clave();
    $cg = resolver_cargo($b, $req->u['empresa_id']);
    $id = transaccion(function () use ($req, $usuario, $correo, $b, $cg, $clave) {
        $id = ejecutar('INSERT INTO usuarios (empresa_id, usuario, correo, nombre, cargo, cargo_id, rol, proceso_id, clave, activo, debe_cambiar)
          VALUES (?,?,?,?,?,?,?,?,?,1,1)', $req->u['empresa_id'], $usuario, $correo, txt($b['nombre']), $cg['cargo'], $cg['cargo_id'], $b['rol'], ($b['proceso_id'] ?? null) ?: null, hash_clave($clave));
        guardar_procesos($id, $b['procesos']);
        return $id;
    });
    return ['id' => $id, 'usuario' => $usuario, 'clave_temporal' => !empty($b['clave']) ? null : $clave];
});

$R->put('/api/usuarios/:id', function (Peticion $req) {
    solo_admin($req->u);
    $t = uno('SELECT * FROM usuarios WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    if (!$t) falla(404, 'Usuario no encontrado');
    $b = $req->body + ['rol' => $t['rol'], 'activo' => $t['activo']];
    validar_perfil($b, $req->u['empresa_id']);
    $activo = ($b['activo'] === 0 || $b['activo'] === '0' || $b['activo'] === false) ? 0 : 1;
    if ($t['id'] === $req->u['id'] && !$activo) falla(400, 'No puedes desactivar tu propia cuenta');
    if ($t['activo'] && $t['rol'] === 'admin' && (!$activo || $b['rol'] !== 'admin') && !otros_admins($t['id']))
        falla(400, 'Debe quedar al menos un administrador activo');
    // Correo: sin tocar si no viene; quien ya tiene uno no puede quedar sin él
    $correo = $t['correo'];
    if (array_key_exists('correo', $b)) {
        $nuevo = limpiar_correo($b['correo']);
        if ($nuevo === '' && $t['correo']) falla(400, 'El correo no se puede dejar vacío: es con el que ingresa');
        if ($nuevo !== '') { correo_libre($nuevo, $t['id']); $correo = $nuevo; }
    }
    $cg = resolver_cargo($b, $req->u['empresa_id'], $t);
    transaccion(function () use ($b, $cg, $activo, $correo, $t) {
        ejecutar('UPDATE usuarios SET nombre = ?, cargo = ?, cargo_id = ?, rol = ?, proceso_id = ?, activo = ?, correo = ? WHERE id = ?',
            txt($b['nombre']), $cg['cargo'], $cg['cargo_id'], $b['rol'], ($b['proceso_id'] ?? null) ?: null, $activo, $correo, $t['id']);
        guardar_procesos($t['id'], $b['procesos']);
        if (!$activo || $b['rol'] !== $t['rol']) ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', $t['id']);
    });
    return ['ok' => true];
});

// Atajo para la primera carga: a quien no tiene correo se le asigna usuario@dominio
$R->post('/api/usuarios/completar-correos', function (Peticion $req) {
    solo_admin($req->u);
    $dominio = preg_replace('/^@/', '', mb_strtolower(txt($req->b('dominio'))));
    if (!preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)+$/', $dominio)) falla(400, 'Escribe el dominio de la empresa, por ejemplo metalcof.co');
    $sin = todos('SELECT id, usuario FROM usuarios WHERE empresa_id = ? AND activo = 1 AND correo IS NULL', $req->u['empresa_id']);
    $omitidos = []; $actualizados = 0;
    transaccion(function () use ($sin, $dominio, &$omitidos, &$actualizados) {
        foreach ($sin as $u) {
            $correo = "{$u['usuario']}@$dominio";
            if (!preg_match(CORREO_RE, $correo) || uno('SELECT 1 FROM usuarios WHERE correo = ?', $correo)) { $omitidos[] = $u['usuario']; continue; }
            ejecutar('UPDATE usuarios SET correo = ? WHERE id = ?', $correo, $u['id']); $actualizados++;
        }
    });
    return ['actualizados' => $actualizados, 'omitidos' => $omitidos];
});

$R->post('/api/usuarios/:id/clave', function (Peticion $req) {
    solo_admin($req->u);
    $t = uno('SELECT * FROM usuarios WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    if (!$t) falla(404, 'Usuario no encontrado');
    if ($req->b('clave')) clave_valida($req->b('clave'), $t['usuario']);
    $clave = $req->b('clave') ? (string)$req->b('clave') : generar_clave();
    ejecutar('UPDATE usuarios SET clave = ?, debe_cambiar = 1, reinicio_solicitado = NULL WHERE id = ?', hash_clave($clave), $t['id']);
    ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', $t['id']);
    return ['clave_temporal' => $req->b('clave') ? null : $clave];
});

// Cambiar mi propia clave
$R->post('/api/yo/clave', function (Peticion $req) {
    $u = uno('SELECT * FROM usuarios WHERE id = ?', $req->u['id']);
    if (!verificar((string)($req->b('actual') ?? ''), $u['clave'])) falla(400, 'La clave actual no es correcta');
    clave_valida($req->b('nueva'), $u['usuario']);
    if ($req->b('nueva') === $req->b('actual')) falla(400, 'La clave nueva debe ser distinta de la actual');
    ejecutar('UPDATE usuarios SET clave = ?, debe_cambiar = 0, reinicio_solicitado = NULL WHERE id = ?', hash_clave((string)$req->b('nueva')), $u['id']);
    ejecutar('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?', $u['id'], token_cookie());
    return ['ok' => true];
});

// ---------- Olvidé mi clave (sin sesión) ----------
// Con correo configurado se envía un enlace de un solo uso; sin él, la petición queda como aviso al administrador.
// La respuesta es la misma exista o no el correo: no se revela quién tiene cuenta.
function permitido(string $clave, int $max): bool { // como mucho $max pedidos por hora para esa clave
    $ahoraMs = (int)(microtime(true) * 1000);
    ejecutar('DELETE FROM pedidos_clave WHERE momento < ?', $ahoraMs - 3600000);
    if ((int)uno('SELECT COUNT(*) n FROM pedidos_clave WHERE clave = ?', $clave)['n'] >= $max) return false;
    ejecutar('INSERT INTO pedidos_clave (clave, momento) VALUES (?,?)', $clave, $ahoraMs);
    return true;
}
function avisar_al_admin(int $id): void { ejecutar('UPDATE usuarios SET reinicio_solicitado = ? WHERE id = ?', ahora(), $id); }

$R->post('/api/olvide', function (Peticion $req) {
    $correo = limpiar_correo($req->b('correo'));
    if (!preg_match(CORREO_RE, $correo)) falla(400, 'Escribe tu correo');
    $respuesta = ['ok' => true, 'por_correo' => correo_configurado()];
    if (!permitido('ip:' . $req->ip, 20) || !permitido('correo:' . $correo, 3)) return $respuesta;
    $u = uno('SELECT * FROM usuarios WHERE correo = ? AND activo = 1', $correo);
    if (!$u) return $respuesta;
    if (!correo_configurado()) { avisar_al_admin($u['id']); return $respuesta; }
    $token = bin2hex(random_bytes(32));
    transaccion(function () use ($u, $token) {
        ejecutar('UPDATE reinicios_clave SET usado = ? WHERE usuario_id = ? AND usado IS NULL', ahora(), $u['id']); // el enlace nuevo anula los anteriores
        ejecutar('INSERT INTO reinicios_clave (usuario_id, token_hash, creado, vence) VALUES (?,?,?,?)', $u['id'], hash('sha256', $token), ahora(), hace_segundos(3600));
    });
    // Después de responder: así la respuesta tarda lo mismo exista o no la cuenta. Si el correo falla, se avisa al administrador.
    despues_de_responder(function () use ($u, $correo, $token) {
        try {
            correo_enviar($correo, 'Restablece tu clave de OIKOS', "Hola {$u['nombre']},\n\nPediste restablecer tu clave de OIKOS. Entra a este enlace y elige una nueva (vale 60 minutos y se usa una sola vez):\n\n"
                . enlace_restablecer($token) . "\n\nSi no lo pediste tú, ignora este mensaje: tu clave sigue igual.\n");
        } catch (Throwable $e) { error_log('No se pudo enviar el correo de recuperación: ' . $e->getMessage()); avisar_al_admin($u['id']); }
    });
    return $respuesta;
}, true);

$R->post('/api/restablecer', function (Peticion $req) {
    $malo = fn() => falla(400, 'El enlace no es válido o ya venció. Pide uno nuevo desde «¿Olvidaste tu clave?».');
    $token = (string)($req->b('token') ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) $malo();
    $f = uno('SELECT * FROM reinicios_clave WHERE token_hash = ?', hash('sha256', $token));
    if (!$f || $f['usado'] || $f['vence'] < ahora()) $malo();
    $u = uno('SELECT * FROM usuarios WHERE id = ? AND activo = 1', $f['usuario_id']);
    if (!$u) $malo();
    clave_valida($req->b('nueva'), $u['usuario']);
    transaccion(function () use ($req, $u, $f) {
        ejecutar('UPDATE usuarios SET clave = ?, debe_cambiar = 0, reinicio_solicitado = NULL WHERE id = ?', hash_clave((string)$req->b('nueva')), $u['id']);
        ejecutar('UPDATE reinicios_clave SET usado = ? WHERE id = ?', ahora(), $f['id']);
        ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', $u['id']);
    });
    return ['ok' => true];
}, true);
