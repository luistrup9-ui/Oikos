<?php
// Ficha de caracterización de procesos y subprocesos, historial de versiones, creación de procesos y sus líderes (antes en procesos.js)
declare(strict_types=1);

const TIPOS_PROCESO = ['Proceso', 'Subproceso', 'Procedimiento'];
const CICLOS = ['P', 'H', 'V', 'A'];
const CATEGORIAS = ['Estratégico', 'Misional', 'Apoyo'];
// JSON como JSON.stringify de Node (sin escapar tildes ni barras)
function json_texto($v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }

function cargar_proceso($id, array $u): array {
    return uno('SELECT * FROM procesos WHERE id = ? AND empresa_id = ?', $id, $u['empresa_id']) ?? falla(404, 'Proceso no encontrado');
}
function leer_es(int $id): array {
    return array_map(fn($e) => ['entradas' => json_decode((string)$e['entradas'], true) ?? [], 'salidas' => json_decode((string)$e['salidas'], true) ?? []] + $e,
        todos('SELECT e.*, s.nombre subproceso FROM proceso_es e LEFT JOIN procesos s ON s.id = e.subproceso_id WHERE e.proceso_id = ? ORDER BY e.orden, e.id', $id));
}
// Lo que se guarda en cada versión del historial
function contenido_proceso(array $p): array {
    return ['nombre' => $p['nombre'] ?? null, 'codigo' => $p['codigo'] ?? null, 'categoria' => $p['categoria'] ?? null, 'tipo' => $p['tipo'] ?? null, 'fecha' => $p['fecha'] ?? null,
        'secciones' => todos('SELECT titulo, texto FROM proceso_secciones WHERE proceso_id = ? ORDER BY orden, id', $p['id']),
        'entradas_salidas' => array_map(fn($e) => ['actividad' => $e['actividad'], 'ciclo' => $e['ciclo'], 'subproceso_id' => $e['subproceso_id'], 'entradas' => $e['entradas'], 'salidas' => $e['salidas']], leer_es((int)$p['id']))];
}

$R->get('/api/procesos/:id', function (Peticion $req) {
    $p = cargar_proceso($req->p('id'), $req->u);
    $ruta = [];
    for ($x = $p; $x && $x['padre_id']; $x = uno('SELECT id, nombre, padre_id FROM procesos WHERE id = ?', $x['padre_id'])) {
        $padre = uno('SELECT id, nombre, padre_id FROM procesos WHERE id = ?', $x['padre_id']);
        if ($padre) array_unshift($ruta, $padre);
    }
    return $p + [
        'ruta' => $ruta,
        'secciones' => todos('SELECT id, titulo, texto FROM proceso_secciones WHERE proceso_id = ? ORDER BY orden, id', $p['id']),
        'hijos' => todos('SELECT id, codigo, nombre, tipo FROM procesos WHERE padre_id = ? ORDER BY orden, nombre', $p['id']),
        'entradas_salidas' => leer_es($p['id']),
        'documentacion' => todos('SELECT clase, nombre FROM proceso_documentacion WHERE proceso_id = ? ORDER BY clase, nombre', $p['id']),
        'documentos' => todos("SELECT d.id, d.codigo, d.nombre, d.version, d.estado, c.nombre clase FROM documentos d LEFT JOIN clases_documento c ON c.id = d.clase_id
          WHERE d.proceso_id = ? AND d.estado = 'VIGENTE' ORDER BY c.nombre, d.codigo", $p['id']),
        // Quien lidera ve la ficha y los documentos vigentes de todos, pero los indicadores solo los de sus procesos
        'indicadores' => ve($p['id'], $req->u) ? todos('SELECT id, codigo, nombre, frecuencia, meta, unidad FROM indicadores WHERE proceso_id = ? AND activo = 1 ORDER BY codigo', $p['id']) : [],
        'propio' => ve($p['id'], $req->u),
        'puede_editar' => es_calidad($req->u) || lidera($p['id'], $req->u),
    ];
});

$R->get('/api/procesos/:id/historial', function (Peticion $req) {
    $p = cargar_proceso($req->p('id'), $req->u);
    return array_map(fn($v) => $v + ['actual' => $v['version'] === $p['version']],
        todos('SELECT v.id, v.version, v.fecha, v.comentario, u.nombre usuario FROM proceso_versiones v LEFT JOIN usuarios u ON u.id = v.usuario_id
          WHERE v.proceso_id = ? ORDER BY v.version DESC, v.id DESC', $p['id']));
});
$R->get('/api/procesos/:id/historial/:vid', function (Peticion $req) {
    $p = cargar_proceso($req->p('id'), $req->u);
    $v = uno('SELECT * FROM proceso_versiones WHERE id = ? AND proceso_id = ?', $req->p('vid'), $p['id']);
    if (!$v) falla(404, 'Versión no encontrada');
    $v['contenido'] = json_decode((string)$v['contenido']);
    return $v;
});

// Editar la ficha: cada guardado genera una nueva versión en el historial
$R->put('/api/procesos/:id', function (Peticion $req) {
    $p = cargar_proceso($req->p('id'), $req->u); $b = $req->body;
    if (!es_calidad($req->u) && !lidera($p['id'], $req->u)) falla(403, 'Solo Calidad o el líder del proceso editan su caracterización');
    // El Líder edita el contenido de su proceso; el nombre, el código y el tipo (su identidad) los define Calidad
    if (!es_calidad($req->u)) { $b['nombre'] = $p['nombre']; $b['codigo'] = $p['codigo']; $b['tipo'] = $p['tipo']; }
    if (txt($b['nombre'] ?? '') === '') falla(400, 'El nombre es obligatorio');
    if (!empty($b['tipo']) && !in_array($b['tipo'], TIPOS_PROCESO, true)) falla(400, 'Tipo no válido');
    if (txt($b['comentario'] ?? '') === '') falla(400, 'Describe la modificación para el historial');
    $secciones = array_values(array_filter((array)($b['secciones'] ?? []), fn($s) => txt($s['titulo'] ?? '') !== ''));
    $es = array_values(array_filter((array)($b['entradas_salidas'] ?? []), fn($e) => txt($e['actividad'] ?? '') !== ''));
    foreach ($es as $e) if (!empty($e['ciclo']) && !in_array($e['ciclo'], CICLOS, true)) falla(400, 'El ciclo debe ser P, H, V o A');
    return transaccion(function () use ($p, $b, $secciones, $es, $req) {
        $version = $p['version'] + 1;
        ejecutar('UPDATE procesos SET nombre = ?, codigo = ?, tipo = ?, fecha = ?, version = ?, modificado = ? WHERE id = ?',
            txt($b['nombre']), ($b['codigo'] ?? null) ?: null, ($b['tipo'] ?? null) ?: $p['tipo'], ($b['fecha'] ?? null) ?: $p['fecha'], $version, ahora(), $p['id']);
        ejecutar('DELETE FROM proceso_secciones WHERE proceso_id = ?', $p['id']);
        foreach ($secciones as $i => $s) ejecutar('INSERT INTO proceso_secciones (proceso_id, orden, titulo, texto) VALUES (?,?,?,?)', $p['id'], $i, txt($s['titulo']), ($s['texto'] ?? null) ?: null);
        ejecutar('DELETE FROM proceso_es WHERE proceso_id = ?', $p['id']);
        foreach ($es as $i => $e)
            ejecutar('INSERT INTO proceso_es (proceso_id, orden, actividad, ciclo, subproceso_id, entradas, salidas) VALUES (?,?,?,?,?,?,?)',
                $p['id'], $i, txt($e['actividad']), ($e['ciclo'] ?? null) ?: null, ($e['subproceso_id'] ?? null) ?: null,
                json_texto(array_values(array_filter((array)($e['entradas'] ?? []), fn($x) => !empty($x['proveedor']) || !empty($x['entrada'])))),
                json_texto(array_values(array_filter((array)($e['salidas'] ?? []), fn($x) => !empty($x['salida']) || !empty($x['cliente'])))));
        ejecutar('INSERT INTO proceso_versiones (proceso_id, version, fecha, usuario_id, comentario, contenido) VALUES (?,?,?,?,?,?)',
            $p['id'], $version, ahora(), $req->u['id'], txt($b['comentario']), json_texto(contenido_proceso(array_merge($p, $b, ['id' => $p['id']]))));
        return ['ok' => true, 'version' => $version];
    });
});

// ---------- Administración de procesos: crear procesos y asignar sus líderes (solo el administrador) ----------
function sigla_de(string $nombre): string {
    $s = '';
    foreach (preg_split('/\s+/', norm($nombre)) as $w) if (mb_strlen($w) > 3) $s .= mb_substr($w, 0, 1);
    return mb_strtoupper(mb_substr($s, 0, 4)) ?: 'PRO';
}
// Un Líder puede liderar varios procesos y subprocesos, y un proceso puede tener varios líderes
function lideres_de(int $id): array {
    return todos("SELECT u.id, u.usuario, u.correo, u.nombre, u.cargo FROM usuarios u JOIN usuario_procesos up ON up.usuario_id = u.id
      WHERE up.proceso_id = ? AND u.rol = 'lider_proceso' AND u.activo = 1 ORDER BY u.nombre", $id);
}
const SOLO_ADMIN_PROCESOS = 'Solo el administrador crea procesos y asigna a sus líderes';

$R->get('/api/procesos-lideres', function (Peticion $req) {
    solo_admin($req->u, SOLO_ADMIN_PROCESOS);
    return array_map(fn($p) => $p + ['lideres' => lideres_de($p['id'])],
        todos("SELECT id, nombre, sigla, codigo, categoria, tipo, padre_id FROM procesos WHERE empresa_id = ?
          ORDER BY CASE categoria WHEN 'Estratégico' THEN 0 WHEN 'Misional' THEN 1 ELSE 2 END, orden, nombre", $req->u['empresa_id']));
});

$R->post('/api/procesos', function (Peticion $req) {
    solo_admin($req->u, SOLO_ADMIN_PROCESOS);
    $b = $req->body; $nombre = txt($b['nombre'] ?? '');
    if ($nombre === '') falla(400, 'El nombre es obligatorio');
    $padre = !empty($b['padre_id']) ? cargar_proceso($b['padre_id'], $req->u) : null;
    $categoria = $padre ? $padre['categoria'] : ($b['categoria'] ?? null); // un subproceso hereda la categoría de su proceso
    if (!in_array($categoria, CATEGORIAS, true)) falla(400, 'La categoría debe ser Estratégico, Misional o Apoyo');
    $tipo = $padre ? (in_array($b['tipo'] ?? null, TIPOS_PROCESO, true) && $b['tipo'] !== 'Proceso' ? $b['tipo'] : 'Subproceso') : 'Proceso';
    $codigo = txt($b['codigo'] ?? '') ?: null;
    if ($codigo && uno('SELECT 1 FROM procesos WHERE empresa_id = ? AND codigo = ?', $req->u['empresa_id'], $codigo)) falla(400, "Ya existe un proceso con el código $codigo");
    if (uno('SELECT 1 FROM procesos WHERE empresa_id = ? AND padre_id <=> ? AND lower(nombre) = lower(?)', $req->u['empresa_id'], $padre['id'] ?? null, $nombre)) falla(400, 'Ya existe un proceso con ese nombre en ese lugar');
    return transaccion(function () use ($req, $b, $nombre, $padre, $categoria, $tipo, $codigo) {
        $orden = (int)uno('SELECT COALESCE(MAX(orden), 0) + 1 n FROM procesos WHERE empresa_id = ? AND padre_id <=> ?', $req->u['empresa_id'], $padre['id'] ?? null)['n'];
        $id = ejecutar('INSERT INTO procesos (empresa_id, nombre, sigla, categoria, orden, padre_id, tipo, codigo, version, fecha, modificado) VALUES (?,?,?,?,?,?,?,?,1,?,?)',
            $req->u['empresa_id'], $nombre, mb_strtoupper(txt($b['sigla'] ?? '')) ?: sigla_de($nombre), $categoria, $orden, $padre['id'] ?? null, $tipo, $codigo, substr(ahora(), 0, 10), ahora());
        ejecutar('INSERT INTO proceso_versiones (proceso_id, version, fecha, usuario_id, comentario, contenido) VALUES (?,?,?,?,?,?)',
            $id, 1, ahora(), $req->u['id'], 'Creación del proceso', json_texto(contenido_proceso(cargar_proceso($id, $req->u))));
        return ['id' => $id];
    });
});

// Agrega este proceso a los que lidera la persona (si es un proceso principal, también sus subprocesos)
$R->post('/api/procesos/:id/lideres', function (Peticion $req) {
    solo_admin($req->u, SOLO_ADMIN_PROCESOS);
    $p = cargar_proceso($req->p('id'), $req->u);
    $u = uno('SELECT * FROM usuarios WHERE id = ? AND empresa_id = ? AND activo = 1', $req->b('usuario_id'), $req->u['empresa_id']);
    if (!$u) falla(404, 'Usuario no encontrado o inactivo');
    if ($u['rol'] === 'admin' || $u['rol'] === 'lider_calidad') falla(400, 'El administrador y el Gestor de Calidad ya ven todo: no necesitan ser líderes de un proceso');
    $ids = $req->b('con_subprocesos') === false ? [$p['id']] : array_map(fn($x) => $x['id'], todos('SELECT id FROM procesos WHERE id = ? OR padre_id = ?', $p['id'], $p['id']));
    transaccion(function () use ($ids, $u, $p) {
        foreach ($ids as $id) ejecutar('INSERT IGNORE INTO usuario_procesos (usuario_id, proceso_id) VALUES (?,?)', $u['id'], $id);
        if ($u['rol'] !== 'lider_proceso' || !$u['proceso_id']) {
            ejecutar("UPDATE usuarios SET rol = 'lider_proceso', proceso_id = COALESCE(proceso_id, ?) WHERE id = ?", $p['padre_id'] ?: $p['id'], $u['id']);
            ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', $u['id']); // al cambiar de rol se cierran sus sesiones
        }
    });
    return ['ok' => true, 'agregados' => count($ids)];
});

// Quita solo este proceso; si ya no lidera ninguno, queda como Colaborador
$R->delete('/api/procesos/:id/lideres/:usuario', function (Peticion $req) {
    solo_admin($req->u, SOLO_ADMIN_PROCESOS);
    $p = cargar_proceso($req->p('id'), $req->u);
    $u = uno('SELECT u.* FROM usuarios u JOIN usuario_procesos up ON up.usuario_id = u.id WHERE u.id = ? AND u.empresa_id = ? AND up.proceso_id = ?', $req->p('usuario'), $req->u['empresa_id'], $p['id']);
    if (!$u) falla(404, 'Esa persona no es líder de este proceso');
    $quedan = transaccion(function () use ($u, $p) {
        ejecutar('DELETE FROM usuario_procesos WHERE usuario_id = ? AND proceso_id = ?', $u['id'], $p['id']);
        $resto = todos('SELECT up.proceso_id, pr.padre_id FROM usuario_procesos up JOIN procesos pr ON pr.id = up.proceso_id WHERE up.usuario_id = ?', $u['id']);
        if (!$resto) {
            ejecutar("UPDATE usuarios SET rol = 'consulta', proceso_id = NULL WHERE id = ?", $u['id']);
            ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', $u['id']);
        } elseif ($u['proceso_id'] === $p['id']) {
            $nuevo = $resto[0]['proceso_id'];
            foreach ($resto as $x) if (!$x['padre_id']) { $nuevo = $x['proceso_id']; break; }
            ejecutar('UPDATE usuarios SET proceso_id = ? WHERE id = ?', $nuevo, $u['id']);
        }
        return count($resto);
    });
    return ['ok' => true, 'quedan' => $quedan];
});
