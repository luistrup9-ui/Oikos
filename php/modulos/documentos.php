<?php
// Gestión documental: documentos y su flujo, solicitudes, pendientes, estadísticas y listado de registros (antes en server.js)
declare(strict_types=1);

const TAMANO_MAXIMO = 25 * 1024 * 1024; // 25 MB por archivo, como en Node

// ---------- Motor de flujo ----------
function transiciones_disponibles(array $doc, array $u): array {
    return array_values(array_filter(todos('SELECT * FROM transiciones ORDER BY pos'), function ($t) use ($doc, $u) {
        if ($t['desde'] ? $t['desde'] !== $doc['estado'] : $doc['estado'] === 'ELIMINADO') return false;
        if (!in_array($u['rol'], explode(',', $t['roles']), true)) return false;
        // El Líder solo mueve documentos de sus procesos o de los que es responsable
        if ($u['rol'] === 'lider_proceso') return $doc['responsable_id'] === $u['id'] || lidera($doc['proceso_id'], $u);
        return true;
    }));
}

function aplicar_transicion(array $doc, $transicionId, array $u, $comentario): void {
    $t = null;
    foreach (transiciones_disponibles($doc, $u) as $x) if ($x['id'] === $transicionId) $t = $x;
    if (!$t) falla(403, 'Transición no permitida para este documento o rol');
    if ($t['id'] === 'devolver' && txt($comentario) === '') falla(400, 'Para devolver hay que explicar el motivo');
    if ($t['id'] === 'enviar_revision' && !uno('SELECT 1 FROM documento_versiones WHERE documento_id = ? AND version = ? AND archivo IS NOT NULL', $doc['id'], $doc['version']))
        falla(400, "Adjunta el archivo de la versión {$doc['version']} antes de enviarlo a revisión");
    $version = $t['nueva_version'] ? $doc['version'] + 1 : $doc['version'];
    ejecutar('UPDATE documentos SET estado = ?, version = ?, modificado = ? WHERE id = ?', $t['hacia'], $version, ahora(), $doc['id']);
    ejecutar('INSERT INTO bitacora (documento_id, version, transicion_id, estado_inicial, estado_final, usuario_id, comentario, fecha) VALUES (?,?,?,?,?,?,?,?)',
        $doc['id'], $version, $t['id'], $doc['estado'], $t['hacia'], $u['id'], $comentario ?: null, ahora());
    if ($t['id'] === 'publicar' && !$doc['fecha_documento'])
        ejecutar('UPDATE documentos SET fecha_documento = ? WHERE id = ?', substr(ahora(), 0, 10), $doc['id']);
}

function nuevo_codigo($procesoId, $claseId): string {
    $p = uno('SELECT sigla FROM procesos WHERE id = ?', $procesoId);
    $c = uno('SELECT sigla FROM clases_documento WHERE id = ?', $claseId);
    if (!$p || !$c) falla(400, 'Proceso o clase inválidos');
    $prefijo = "{$p['sigla']}-{$c['sigla']}-";
    $n = (int)uno("SELECT COUNT(*) n FROM documentos WHERE codigo LIKE CONCAT(?, '%')", $prefijo)['n'] + 1;
    return $prefijo . str_pad((string)$n, 2, '0', STR_PAD_LEFT);
}

function crear_documento(array $datos, array $u): int {
    if (txt($datos['nombre'] ?? '') === '') falla(400, 'El nombre es obligatorio');
    $codigo = nuevo_codigo($datos['proceso_id'] ?? null, $datos['clase_id'] ?? null);
    $id = ejecutar("INSERT INTO documentos (empresa_id, codigo, nombre, tipo_id, clase_id, proceso_id, origen, descripcion, responsable_id, estado, fecha_vencimiento, creado, modificado)
      VALUES (?,?,?,?,?,?,?,?,?, 'ELABORACION', ?, ?, ?)",
        $u['empresa_id'], $codigo, txt($datos['nombre']), $datos['tipo_id'] ?? null, $datos['clase_id'] ?? null, $datos['proceso_id'] ?? null, ($datos['origen'] ?? '') ?: 'Interno',
        ($datos['descripcion'] ?? null) ?: null, ($datos['responsable_id'] ?? null) ?: $u['id'], ($datos['fecha_vencimiento'] ?? null) ?: null, ahora(), ahora());
    ejecutar("INSERT INTO bitacora (documento_id, version, transicion_id, estado_inicial, estado_final, usuario_id, comentario, fecha) VALUES (?,1,'crear',NULL,'ELABORACION',?,?,?)",
        $id, $u['id'], 'Documento creado', ahora());
    return $id;
}

// ---------- Documentos ----------
const SELECT_DOC = 'SELECT d.*, t.nombre tipo, c.nombre clase, p.nombre proceso, p.categoria, e.nombre estado_nombre, u.nombre responsable FROM documentos d
  JOIN tipos_documento t ON t.id = d.tipo_id JOIN clases_documento c ON c.id = d.clase_id
  JOIN procesos p ON p.id = d.proceso_id JOIN estados e ON e.id = d.estado
  LEFT JOIN usuarios u ON u.id = d.responsable_id';

$R->get('/api/documentos', function (Peticion $req) {
    $w = ['d.empresa_id = ?']; $p = [$req->u['empresa_id']];
    $enLista = function (string $col, $v) use (&$w, &$p) { $l = lista($v); if ($l) { $w[] = "$col IN (" . marcas($l) . ')'; array_push($p, ...$l); } };
    $enLista('d.tipo_id', $req->q('tipo')); $enLista('d.proceso_id', $req->q('proceso')); $enLista('d.clase_id', $req->q('clase'));
    $enLista('d.origen', $req->q('origen')); $enLista('d.estado', $req->q('estado'));
    if (!lista($req->q('estado'))) $w[] = "d.estado != 'ELIMINADO'";
    // El Colaborador solo ve documentos vigentes
    if ($req->u['rol'] === 'consulta') $w[] = "d.estado = 'VIGENTE'";
    // El Líder lee los vigentes de todos los procesos, pero el trabajo en curso solo el de sus procesos
    if ($req->u['rol'] === 'lider_proceso') {
        $ids = propios($req->u);
        $w[] = "(d.estado = 'VIGENTE' OR d.responsable_id = ?" . ($ids ? ' OR d.proceso_id IN (' . marcas($ids) . ')' : '') . ')';
        array_push($p, $req->u['id'], ...$ids);
    }
    if ($req->q('texto')) { $w[] = '(d.codigo LIKE ? OR d.nombre LIKE ? OR d.descripcion LIKE ?)'; array_push($p, ...array_fill(0, 3, '%' . $req->q('texto') . '%')); }
    $campoFecha = ['creado' => 'd.creado', 'documento' => 'd.fecha_documento', 'vencimiento' => 'd.fecha_vencimiento'][$req->q('campo_fecha')] ?? 'd.modificado';
    $op = $req->q('op'); $f1 = $req->q('fecha1'); $f2 = $req->q('fecha2');
    if ($op === '>' && $f1) { $w[] = "$campoFecha >= ?"; $p[] = $f1; }
    if ($op === '<' && $f1) { $w[] = "$campoFecha <= ?"; $p[] = $f1 . ' 23:59:59'; }
    if ($op === 'entre' && $f1 && $f2) { $w[] = "$campoFecha BETWEEN ? AND ?"; array_push($p, $f1, $f2 . ' 23:59:59'); }
    return todos(SELECT_DOC . ' WHERE ' . implode(' AND ', $w) . ' ORDER BY p.orden, d.codigo', ...$p);
});

function cargar_doc(Peticion $req): array {
    $d = uno(SELECT_DOC . ' WHERE d.id = ? AND d.empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    $u = $req->u;
    if (!$d || ($u['rol'] === 'consulta' && $d['estado'] !== 'VIGENTE') ||
        ($u['rol'] === 'lider_proceso' && $d['estado'] !== 'VIGENTE' && $d['responsable_id'] !== $u['id'] && !lidera($d['proceso_id'], $u))) falla(404, 'Documento no encontrado');
    return $d;
}
function puede_editar_doc(array $d, array $u): bool {
    return $d['estado'] === 'ELABORACION' && (es_calidad($u) || ($u['rol'] === 'lider_proceso' && ($d['responsable_id'] === $u['id'] || lidera($d['proceso_id'], $u))));
}

$R->get('/api/documentos/:id', function (Peticion $req) {
    $d = cargar_doc($req);
    return $d + [
        'puede_editar' => puede_editar_doc($d, $req->u),
        'transiciones' => array_map(fn($t) => ['id' => $t['id'], 'nombre' => $t['nombre']], transiciones_disponibles($d, $req->u)),
        'versiones' => todos('SELECT v.id, v.version, v.archivo_nombre, v.cambios, v.fecha, u.nombre usuario FROM documento_versiones v
          LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE documento_id = ? ORDER BY v.version DESC, v.id DESC', $d['id']),
        'bitacora' => todos('SELECT b.*, u.nombre usuario, t.nombre transicion FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
          LEFT JOIN transiciones t ON t.id = b.transicion_id WHERE documento_id = ? ORDER BY b.id DESC', $d['id']),
        'registros' => todos('SELECT * FROM registros WHERE documento_id = ?', $d['id']),
    ];
});

$R->post('/api/documentos', function (Peticion $req) {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad crea documentos directamente; los demás deben radicar una solicitud');
    return ['id' => transaccion(fn() => crear_documento($req->body, $req->u))];
});

$R->put('/api/documentos/:id', function (Peticion $req) {
    $d = cargar_doc($req);
    if (!puede_editar_doc($d, $req->u)) falla(403, 'Solo se edita en estado de Elaboración, por su responsable o por Calidad');
    $b = $req->body;
    ejecutar('UPDATE documentos SET nombre = ?, tipo_id = ?, clase_id = ?, origen = ?, descripcion = ?, responsable_id = ?, fecha_vencimiento = ?, modificado = ? WHERE id = ?',
        ($b['nombre'] ?? null) ?: $d['nombre'], ($b['tipo_id'] ?? null) ?: $d['tipo_id'], ($b['clase_id'] ?? null) ?: $d['clase_id'], ($b['origen'] ?? null) ?: $d['origen'],
        array_key_exists('descripcion', $b) && $b['descripcion'] !== null ? $b['descripcion'] : $d['descripcion'],
        ($b['responsable_id'] ?? null) ?: $d['responsable_id'], ($b['fecha_vencimiento'] ?? null) ?: null, ahora(), $d['id']);
    return ['ok' => true];
});

// Guarda un archivo subido en la carpeta de datos con un nombre al azar (como multer); devuelve [nombre guardado, nombre original, tamaño]
function guardar_subida(array $files, string $campo = 'archivo'): ?array {
    $f = $files[$campo] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || $f['size'] > TAMANO_MAXIMO) falla(413, 'El archivo supera el tamaño permitido');
    if ($f['error'] !== UPLOAD_ERR_OK) falla(400, 'No se pudo recibir el archivo');
    $nombre = bin2hex(random_bytes(16));
    if (!move_uploaded_file($f['tmp_name'], dir_archivos() . '/' . $nombre) && !rename($f['tmp_name'], dir_archivos() . '/' . $nombre)) falla(500, 'No se pudo guardar el archivo');
    return [$nombre, $f['name'], (int)$f['size']];
}

$R->post('/api/documentos/:id/archivo', function (Peticion $req) {
    $d = cargar_doc($req);
    $a = guardar_subida($req->files);
    if (!$a) falla(400, 'No llegó ningún archivo');
    if (!puede_editar_doc($d, $req->u)) { @unlink(dir_archivos() . '/' . $a[0]); falla(403, 'Solo se adjuntan archivos en estado de Elaboración'); }
    ejecutar('INSERT INTO documento_versiones (documento_id, version, archivo, archivo_nombre, cambios, usuario_id, fecha) VALUES (?,?,?,?,?,?,?)',
        $d['id'], $d['version'], $a[0], $a[1], $req->b('cambios') ?: null, $req->u['id'], ahora());
    ejecutar('UPDATE documentos SET modificado = ? WHERE id = ?', ahora(), $d['id']);
    return ['ok' => true];
});

$R->get('/api/documentos/:id/versiones/:vid', function (Peticion $req) {
    $d = cargar_doc($req);
    $v = uno('SELECT * FROM documento_versiones WHERE id = ? AND documento_id = ?', $req->p('vid'), $d['id']);
    if (!$v) falla(404, 'Archivo no encontrado');
    descargar(dir_archivos() . '/' . $v['archivo'], (string)$v['archivo_nombre']);
    return null;
});

$R->post('/api/documentos/:id/transicion', function (Peticion $req) {
    $d = cargar_doc($req);
    transaccion(fn() => aplicar_transicion($d, $req->b('transicion'), $req->u, $req->b('comentario')));
    return ['ok' => true];
});

// ---------- Solicitudes ----------
const SELECT_SOL = 'SELECT s.*, u.nombre solicitante, r.nombre revisor, p.nombre proceso, c.nombre clase, t.nombre tipo, d.codigo documento_codigo FROM solicitudes s
  LEFT JOIN usuarios u ON u.id = s.solicitante_id LEFT JOIN usuarios r ON r.id = s.revisor_id
  LEFT JOIN procesos p ON p.id = s.proceso_id LEFT JOIN clases_documento c ON c.id = s.clase_id
  LEFT JOIN tipos_documento t ON t.id = s.tipo_id LEFT JOIN documentos d ON d.id = s.documento_id';

$R->get('/api/solicitudes', function (Peticion $req) {
    $u = $req->u;
    if ($req->q('vista') === 'pendientes') // las que debo resolver yo
        return es_calidad($u) ? todos(SELECT_SOL . " WHERE s.empresa_id = ? AND s.estado = 'Pendiente' ORDER BY s.id", $u['empresa_id']) : [];
    if ($req->q('vista') === 'tramite')
        return todos(SELECT_SOL . " WHERE s.solicitante_id = ? AND s.estado = 'Pendiente' ORDER BY s.id DESC", $u['id']);
    return todos(SELECT_SOL . ' WHERE ' . (es_calidad($u) ? 's.empresa_id = ?' : 's.solicitante_id = ?') . " AND s.estado != 'Pendiente' ORDER BY s.id DESC",
        es_calidad($u) ? $u['empresa_id'] : $u['id']);
});

$R->post('/api/solicitudes', function (Peticion $req) {
    $b = $req->body; $u = $req->u;
    if ($u['rol'] === 'consulta') falla(403, 'Los usuarios de consulta no radican solicitudes');
    if (!in_array($b['tipo_solicitud'] ?? null, ['Creación', 'Modificación', 'Eliminación'], true)) falla(400, 'Tipo de solicitud inválido');
    if (txt($b['justificacion'] ?? '') === '') falla(400, 'La justificación es obligatoria');
    $datos = $b;
    if ($b['tipo_solicitud'] !== 'Creación') {
        $d = uno('SELECT * FROM documentos WHERE id = ? AND empresa_id = ?', $b['documento_id'] ?? null, $u['empresa_id']);
        if (!$d || $d['estado'] !== 'VIGENTE') falla(400, 'Solo se puede pedir modificar o eliminar un documento vigente');
        $datos = $d + ['documento_id' => $d['id']];
    } elseif (txt($b['nombre'] ?? '') === '' || empty($b['proceso_id']) || empty($b['clase_id']) || empty($b['tipo_id'])) {
        falla(400, 'Tipo, proceso, clase y nombre son obligatorios');
    }
    $id = ejecutar('INSERT INTO solicitudes (empresa_id, tipo_solicitud, documento_id, tipo_id, clase_id, proceso_id, nombre, justificacion, descripcion, solicitante_id, creada)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)', $u['empresa_id'], $b['tipo_solicitud'], ($datos['documento_id'] ?? null) ?: null, $datos['tipo_id'] ?? null, $datos['clase_id'] ?? null,
        $datos['proceso_id'] ?? null, $datos['nombre'] ?? null, txt($b['justificacion']), ($b['descripcion'] ?? null) ?: null, $u['id'], ahora());
    return ['id' => $id];
});

$R->post('/api/solicitudes/:id/resolver', function (Peticion $req) {
    $u = $req->u;
    if (!es_calidad($u)) falla(403, 'Solo Calidad resuelve solicitudes');
    $s = uno("SELECT * FROM solicitudes WHERE id = ? AND empresa_id = ? AND estado = 'Pendiente'", $req->p('id'), $u['empresa_id']);
    if (!$s) falla(404, 'Solicitud no encontrada o ya resuelta');
    $aprobar = (bool)$req->b('aprobar');
    if (!$aprobar && txt($req->b('respuesta')) === '') falla(400, 'Explica por qué se rechaza');
    return transaccion(function () use ($s, $u, $aprobar, $req) {
        $documentoId = $s['documento_id'];
        if ($aprobar) {
            $solicitante = uno('SELECT * FROM usuarios WHERE id = ?', $s['solicitante_id']);
            if ($s['tipo_solicitud'] === 'Creación') $documentoId = crear_documento(['responsable_id' => $s['solicitante_id']] + $s, $u);
            else {
                $d = uno('SELECT * FROM documentos WHERE id = ?', $s['documento_id']);
                aplicar_transicion($d, $s['tipo_solicitud'] === 'Modificación' ? 'modificar' : 'eliminar', $u, "Solicitud #{$s['id']}: {$s['justificacion']}");
                if ($s['tipo_solicitud'] === 'Modificación') ejecutar('UPDATE documentos SET responsable_id = ? WHERE id = ?', $solicitante['id'], $d['id']);
            }
        }
        ejecutar('UPDATE solicitudes SET estado = ?, revisor_id = ?, respuesta = ?, resuelta = ?, documento_id = ? WHERE id = ?',
            $aprobar ? 'Aprobada' : 'Rechazada', $u['id'], $req->b('respuesta') ?: null, ahora(), $documentoId, $s['id']);
        return ['ok' => true, 'documento_id' => $documentoId];
    });
});

// ---------- Mis pendientes ----------
$R->get('/api/pendientes', function (Peticion $req) {
    $docs = [];
    foreach (todos(SELECT_DOC . " WHERE d.empresa_id = ? AND d.estado IN ('ELABORACION','REVISION','PUBLICACION')", $req->u['empresa_id']) as $d) {
        $t = array_values(array_map(fn($x) => $x['nombre'], array_filter(transiciones_disponibles($d, $req->u), fn($x) => $x['id'] !== 'eliminar')));
        if ($t) $docs[] = $d + ['transiciones' => $t];
    }
    $solicitudes = es_calidad($req->u) ? (int)uno("SELECT COUNT(*) n FROM solicitudes WHERE empresa_id = ? AND estado = 'Pendiente'", $req->u['empresa_id'])['n'] : 0;
    $fv = filtro($req->u, 'd.proceso_id');
    $porVencer = todos(SELECT_DOC . " WHERE d.empresa_id = ? AND d.estado = 'VIGENTE' AND d.fecha_vencimiento IS NOT NULL
      AND d.fecha_vencimiento <= ?{$fv['sql']} ORDER BY d.fecha_vencimiento", $req->u['empresa_id'], gmdate('Y-m-d', time() + 30 * 86400), ...$fv['params']);
    return ['documentos' => $docs, 'solicitudes' => $solicitudes, 'por_vencer' => $porVencer];
});

// ---------- Estadísticas ----------
$R->get('/api/estadisticas', function (Peticion $req) {
    $w = ['d.empresa_id = ?']; $p = [$req->u['empresa_id']];
    foreach ([['d.tipo_id', 'tipo'], ['b.transicion_id', 'transicion'], ['b.estado_inicial', 'estado_inicial'], ['b.estado_final', 'estado_final'], ['b.usuario_id', 'usuario']] as [$col, $q]) {
        $l = lista($req->q($q)); if ($l) { $w[] = "$col IN (" . marcas($l) . ')'; array_push($p, ...$l); }
    }
    if ($req->q('texto')) { $w[] = '(d.codigo LIKE ? OR d.nombre LIKE ?)'; array_push($p, '%' . $req->q('texto') . '%', '%' . $req->q('texto') . '%'); }
    $fe = filtro($req->u, 'd.proceso_id');
    return [
        'por_estado' => todos("SELECT e.nombre, e.id, COUNT(d.id) n FROM estados e LEFT JOIN documentos d ON d.estado = e.id AND d.empresa_id = ?{$fe['sql']}
          GROUP BY e.id ORDER BY e.orden", $req->u['empresa_id'], ...$fe['params']),
        'por_proceso' => todos("SELECT p.nombre, p.categoria, COUNT(d.id) n FROM procesos p LEFT JOIN documentos d ON d.proceso_id = p.id
          AND d.estado = 'VIGENTE' WHERE p.empresa_id = ? GROUP BY p.id ORDER BY p.orden", $req->u['empresa_id']),
        'transiciones' => todos('SELECT b.*, d.codigo, d.nombre, t.nombre tipo, u.nombre usuario, tr.nombre transicion, ei.nombre estado_inicial_nombre, ef.nombre estado_final_nombre
          FROM bitacora b JOIN documentos d ON d.id = b.documento_id JOIN tipos_documento t ON t.id = d.tipo_id
          LEFT JOIN usuarios u ON u.id = b.usuario_id LEFT JOIN transiciones tr ON tr.id = b.transicion_id
          LEFT JOIN estados ei ON ei.id = b.estado_inicial LEFT JOIN estados ef ON ef.id = b.estado_final
          WHERE ' . implode(' AND ', $w) . $fe['sql'] . ' ORDER BY b.id DESC LIMIT 500', ...array_merge($p, $fe['params'])),
    ];
});

// ---------- Listado maestro de registros ----------
const CAMPOS_REG = ['nombre', 'documento_id', 'proceso_id', 'responsable_cargo', 'responsable_area', 'medio', 'ubicacion', 'tiempo_retencion', 'disposicion_final', 'recuperacion'];
$R->get('/api/registros', function (Peticion $req) {
    $w = ['r.empresa_id = ?']; $p = [$req->u['empresa_id']];
    if ($req->q('texto')) { $w[] = 'r.nombre LIKE ?'; $p[] = '%' . $req->q('texto') . '%'; }
    $procs = lista($req->q('proceso'));
    if ($procs) { $w[] = 'r.proceso_id IN (' . marcas($procs) . ')'; array_push($p, ...$procs); }
    return todos('SELECT r.*, p.nombre proceso, d.codigo documento_codigo FROM registros r
      LEFT JOIN procesos p ON p.id = r.proceso_id LEFT JOIN documentos d ON d.id = r.documento_id WHERE ' . implode(' AND ', $w) . ' ORDER BY p.orden, r.nombre', ...$p);
});
function guardar_registro(Peticion $req, $id = null): array {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad administra el listado de registros');
    if (txt($req->b('nombre')) === '') falla(400, 'El nombre es obligatorio');
    $vals = array_map(fn($c) => $req->b($c) ?: null, CAMPOS_REG);
    if ($id) ejecutar('UPDATE registros SET ' . implode(', ', array_map(fn($c) => "$c = ?", CAMPOS_REG)) . ' WHERE id = ? AND empresa_id = ?', ...array_merge($vals, [$id, $req->u['empresa_id']]));
    else $id = ejecutar('INSERT INTO registros (empresa_id, ' . implode(', ', CAMPOS_REG) . ') VALUES (?' . str_repeat(', ?', count(CAMPOS_REG)) . ')', $req->u['empresa_id'], ...$vals);
    return ['id' => $id]; // como Node: en una edición devuelve el id tal como llegó
}
$R->post('/api/registros', fn(Peticion $req) => guardar_registro($req));
$R->put('/api/registros/:id', fn(Peticion $req) => guardar_registro($req, $req->p('id')));
$R->delete('/api/registros/:id', function (Peticion $req) {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad administra el listado de registros');
    ejecutar('DELETE FROM registros WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    return ['ok' => true];
});
