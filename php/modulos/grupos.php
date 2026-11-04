<?php
// Grupos de usuarios: conjuntos de personas a los que se les puede dar privilegios de una vez (ver privilegios.php).
// Crear, editar y borrar grupos exige el privilegio «Gestionar grupos de usuarios» (o ser el administrador). Los miembros del grupo marcados como
// administradores pueden cambiar quiénes son sus miembros. Un grupo que TIENE privilegios solo lo cambia el administrador: si no, quien gestiona
// grupos podría meterse en él (o meter a otros) y darse privilegios por la puerta de atrás.
declare(strict_types=1);

function cargar_grupo($id, array $u): array {
    return uno('SELECT * FROM grupos WHERE id = ? AND empresa_id = ?', $id, $u['empresa_id']) ?? falla(404, 'Grupo no encontrado');
}
// Las personas nuevas entran solas a los grupos marcados «por defecto» (se llama al crear o importar una persona)
function unir_a_grupos_por_defecto(int $usuarioId, int $empresaId): void {
    foreach (todos('SELECT id FROM grupos WHERE empresa_id = ? AND por_defecto = 1', $empresaId) as $g)
        ejecutar('INSERT IGNORE INTO grupo_miembros (grupo_id, usuario_id, administrador) VALUES (?,?,0)', $g['id'], $usuarioId);
}
function grupo_con_privilegios(array $g): bool { return uno("SELECT 1 FROM privilegios_otorgados WHERE tipo = 'grupo' AND ref_id = ?", $g['id']) !== null; }
function solo_admin_si_da_privilegios(array $g, array $u): void {
    if ($u['rol'] !== 'admin' && grupo_con_privilegios($g)) falla(403, 'Este grupo da privilegios: solo el administrador lo puede cambiar');
}
function administra_algun_grupo(int $usuarioId): bool {
    try { return uno('SELECT 1 FROM grupo_miembros WHERE usuario_id = ? AND administrador = 1', $usuarioId) !== null; }
    catch (PDOException $e) { error_log('OIKOS: no se pudieron leer los grupos: ' . $e->getMessage()); return false; }
}
function puede_ver_grupos(array $u): bool { return puede_administrar($u) || tiene_privilegio($u, 'gestionar_grupos') || administra_algun_grupo((int)$u['id']); }

// Las personas de la empresa (para elegirlas como miembros o dueñas de un cargo): solo lo que hace falta para reconocerlas
$R->get('/api/personas', function (Peticion $req) {
    if (!puede_ver_grupos($req->u)) falla(403, 'No tienes permiso para ver esta lista');
    return todos('SELECT id, nombre, usuario, correo, cargo, cargo_id, rol, activo FROM usuarios WHERE empresa_id = ? ORDER BY activo DESC, nombre', $req->u['empresa_id']);
});

$R->get('/api/grupos', function (Peticion $req) {
    if (!puede_ver_grupos($req->u)) falla(403, 'No tienes permiso para ver los grupos');
    return todos("SELECT g.id, g.nombre, g.por_defecto, g.creado, c.nombre creado_por,
        EXISTS(SELECT 1 FROM grupo_miembros m WHERE m.grupo_id = g.id AND m.usuario_id = ? AND m.administrador = 1) administro,
        (SELECT COUNT(*) FROM grupo_miembros m WHERE m.grupo_id = g.id) miembros,
        (SELECT GROUP_CONCAT(u.nombre ORDER BY u.nombre SEPARATOR ', ') FROM grupo_miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.grupo_id = g.id AND m.administrador = 1) administradores,
        (SELECT COUNT(*) FROM privilegios_otorgados p WHERE p.tipo = 'grupo' AND p.ref_id = g.id) privilegios
      FROM grupos g LEFT JOIN usuarios c ON c.id = g.creado_por WHERE g.empresa_id = ? ORDER BY g.nombre", $req->u['id'], $req->u['empresa_id']);
});
$R->get('/api/grupos/:id', function (Peticion $req) {
    if (!puede_ver_grupos($req->u)) falla(403, 'No tienes permiso para ver los grupos');
    $g = cargar_grupo($req->p('id'), $req->u);
    return $g + ['miembros' => todos('SELECT u.id, u.nombre, u.usuario, u.activo, m.administrador FROM grupo_miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.grupo_id = ? ORDER BY u.nombre', $g['id']),
        'privilegios' => array_map(fn($p) => ['clave' => $p['privilegio'], 'nombre' => PRIVILEGIOS[$p['privilegio']]['nombre'] ?? $p['privilegio']],
            todos("SELECT privilegio FROM privilegios_otorgados WHERE tipo = 'grupo' AND ref_id = ? ORDER BY privilegio", $g['id']))];
});

function datos_grupo(Peticion $req, int $id = 0): array {
    exigir_privilegio($req->u, 'gestionar_grupos');
    $nombre = txt($req->b('nombre'));
    if ($nombre === '' || mb_strlen($nombre) > 120) falla(400, 'El nombre del grupo va de 1 a 120 letras');
    if (uno('SELECT 1 FROM grupos WHERE empresa_id = ? AND nombre = ? AND id <> ?', $req->u['empresa_id'], $nombre, $id)) falla(400, "Ya existe un grupo llamado «{$nombre}»");
    $d = $req->b('por_defecto');
    return [$nombre, ($d === true || $d === 1 || $d === '1') ? 1 : 0];
}
$R->post('/api/grupos', function (Peticion $req) {
    [$nombre, $porDefecto] = datos_grupo($req);
    return ['id' => ejecutar('INSERT INTO grupos (empresa_id, nombre, por_defecto, creado_por, creado) VALUES (?,?,?,?,?)', $req->u['empresa_id'], $nombre, $porDefecto, $req->u['id'], ahora())];
});
$R->put('/api/grupos/:id', function (Peticion $req) {
    $g = cargar_grupo($req->p('id'), $req->u);
    [$nombre, $porDefecto] = datos_grupo($req, (int)$g['id']);
    solo_admin_si_da_privilegios($g, $req->u);
    ejecutar('UPDATE grupos SET nombre = ?, por_defecto = ? WHERE id = ?', $nombre, $porDefecto, $g['id']);
    return ['ok' => true];
});
$R->delete('/api/grupos/:id', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_grupos');
    $g = cargar_grupo($req->p('id'), $req->u);
    solo_admin_si_da_privilegios($g, $req->u);
    transaccion(function () use ($g) {
        ejecutar("DELETE FROM privilegios_otorgados WHERE tipo = 'grupo' AND ref_id = ?", $g['id']);   // los privilegios que daba el grupo se van con él
        ejecutar('DELETE FROM grupos WHERE id = ?', $g['id']);                                          // sus miembros se borran solos (ON DELETE CASCADE)
    });
    return ['ok' => true];
});

// Reemplaza los miembros del grupo: {miembros: [{id, administrador}]}
$R->put('/api/grupos/:id/miembros', function (Peticion $req) {
    $g = cargar_grupo($req->p('id'), $req->u); $u = $req->u;
    $esAdminDelGrupo = uno('SELECT 1 FROM grupo_miembros WHERE grupo_id = ? AND usuario_id = ? AND administrador = 1', $g['id'], $u['id']) !== null;
    if (!tiene_privilegio($u, 'gestionar_grupos') && !$esAdminDelGrupo) falla(403, sprintf(MENSAJE_PRIVILEGIO, PRIVILEGIOS['gestionar_grupos']['nombre']));
    solo_admin_si_da_privilegios($g, $u);
    $lista = $req->b('miembros');
    if (!is_array($lista)) falla(400, 'Faltan los miembros del grupo');
    $nuevos = [];
    foreach ($lista as $m) {
        $id = (int)(is_array($m) ? ($m['id'] ?? 0) : $m);
        if (!uno('SELECT 1 FROM usuarios WHERE id = ? AND empresa_id = ? AND activo = 1', $id, $u['empresa_id'])) falla(400, 'Una de las personas no existe o está desactivada');
        $adm = is_array($m) && ($m['administrador'] === true || ($m['administrador'] ?? null) === 1 || ($m['administrador'] ?? null) === '1') ? 1 : 0;
        $nuevos[$id] = $adm;
    }
    transaccion(function () use ($g, $nuevos) {
        ejecutar('DELETE FROM grupo_miembros WHERE grupo_id = ?', $g['id']);
        foreach ($nuevos as $id => $adm) ejecutar('INSERT INTO grupo_miembros (grupo_id, usuario_id, administrador) VALUES (?,?,?)', $g['id'], $id, $adm);
    });
    return ['ok' => true, 'miembros' => count($nuevos)];
});
