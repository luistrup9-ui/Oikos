<?php
// Parametrización de las evaluaciones (Administración → Evaluaciones): emisores, ciclos, tipos, unidades auditables, clasificación de hallazgos,
// cortes del semáforo del nivel de gestión y el reporte de puntos de atención. Solo Calidad y el administrador.
declare(strict_types=1);

function solo_param_eval(array $u): void { if (!es_calidad($u)) falla(403, 'Solo Calidad o el administrador parametrizan las evaluaciones'); }
function nombre_catalogo($v, string $que, int $max = 100): string {
    $n = txt($v ?? '');
    if ($n === '') falla(400, "Escribe el nombre del $que");
    if (mb_strlen($n) > $max) falla(400, "El nombre del $que admite hasta $max caracteres");
    return $n;
}

// Todo lo que muestra la pantalla, en una sola llamada
$R->get('/api/eval-param', function (Peticion $req) {
    solo_param_eval($req->u); $e = $req->u['empresa_id'];
    return [
        'emisores' => todos('SELECT m.*, (SELECT COUNT(*) FROM evaluaciones v WHERE v.empresa_id = m.empresa_id AND v.evaluador = m.nombre) evaluaciones
          FROM eval_emisores m WHERE m.empresa_id = ? ORDER BY m.id', $e),
        'tipos' => todos("SELECT t.*, (SELECT COUNT(*) FROM evaluaciones v WHERE v.empresa_id = t.empresa_id AND v.tipo = t.nombre) evaluaciones,
            (SELECT COUNT(*) FROM evaluacion_procesos ep JOIN evaluaciones v ON v.id = ep.evaluacion_id
              WHERE v.empresa_id = t.empresa_id AND v.tipo = t.nombre AND ep.fecha IS NOT NULL AND ep.fecha <> '') cronogramas
          FROM eval_tipos t WHERE t.empresa_id = ? ORDER BY t.id", $e),
        'ciclos' => todos('SELECT c.*, (SELECT COUNT(*) FROM evaluaciones v WHERE v.ciclo_id = c.id) evaluaciones FROM eval_ciclos c WHERE c.empresa_id = ? ORDER BY c.orden, c.nombre', $e),
        'clasificaciones' => todos('SELECT c.*, (SELECT COUNT(*) FROM hallazgos h WHERE h.clasificacion_id = c.id) hallazgos
          FROM hallazgo_clasificaciones c WHERE c.empresa_id = ? ORDER BY c.nombre', $e),
        'cortes' => cortes_semaforo($e),
    ];
});

// Unidades auditables: una por proceso (se crean solas con los procesos); muestra su código, el proceso y quién lo lidera
$R->get('/api/eval-param/unidades', function (Peticion $req) {
    solo_param_eval($req->u);
    return todos("SELECT p.id, p.codigo, p.nombre, p.categoria, p.tipo, pa.nombre padre,
        (SELECT GROUP_CONCAT(u.nombre ORDER BY u.nombre SEPARATOR ', ') FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id
          WHERE up.proceso_id = p.id AND u.activo = 1) lideres,
        (SELECT COUNT(*) FROM evaluacion_procesos ep WHERE ep.proceso_id = p.id) evaluaciones
      FROM procesos p LEFT JOIN procesos pa ON pa.id = p.padre_id WHERE p.empresa_id = ?
      ORDER BY FIELD(p.categoria, 'Estratégico', 'Misional', 'Apoyo'), p.orden, p.nombre", $req->u['empresa_id']);
});

// Emisores: los nombres son fijos (CAL, MC, EXT); se editan sus opciones «por defecto»
$R->put('/api/eval-param/emisores/:id', function (Peticion $req) {
    solo_param_eval($req->u);
    $m = uno('SELECT * FROM eval_emisores WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Emisor no encontrado');
    $v = fn(string $c) => array_key_exists($c, $req->body) ? ($req->body[$c] ? 1 : 0) : (int)$m[$c];
    ejecutar('UPDATE eval_emisores SET riesgos_defecto = ?, indicadores_defecto = ?, tramites_defecto = ? WHERE id = ?', $v('riesgos_defecto'), $v('indicadores_defecto'), $v('tramites_defecto'), $m['id']);
    return ['ok' => true];
});

// Tipos de evaluación: se elige cuál queda preseleccionado al programar una evaluación
$R->put('/api/eval-param/tipos/:id', function (Peticion $req) {
    solo_param_eval($req->u);
    $t = uno('SELECT * FROM eval_tipos WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Tipo no encontrado');
    transaccion(function () use ($t, $req) {
        ejecutar('UPDATE eval_tipos SET por_defecto = 0 WHERE empresa_id = ?', $req->u['empresa_id']);
        ejecutar('UPDATE eval_tipos SET por_defecto = 1 WHERE id = ?', $t['id']);
    });
    return ['ok' => true];
});

// Ciclos de evaluación
$R->post('/api/eval-param/ciclos', function (Peticion $req) {
    solo_param_eval($req->u); $e = $req->u['empresa_id'];
    $nombre = nombre_catalogo($req->b('nombre'), 'ciclo');
    if (uno('SELECT 1 FROM eval_ciclos WHERE empresa_id = ? AND nombre = ?', $e, $nombre)) falla(400, "Ya existe el ciclo “$nombre”");
    $orden = $req->b('orden') !== null && $req->b('orden') !== '' ? (int)$req->b('orden') : (int)uno('SELECT COALESCE(MAX(orden), 0) + 1 n FROM eval_ciclos WHERE empresa_id = ?', $e)['n'];
    return ['id' => ejecutar('INSERT INTO eval_ciclos (empresa_id, nombre, orden, activo) VALUES (?,?,?,1)', $e, $nombre, $orden)];
});
$R->put('/api/eval-param/ciclos/:id', function (Peticion $req) {
    solo_param_eval($req->u); $e = $req->u['empresa_id'];
    $c = uno('SELECT * FROM eval_ciclos WHERE id = ? AND empresa_id = ?', $req->p('id'), $e) ?? falla(404, 'Ciclo no encontrado');
    $nombre = array_key_exists('nombre', $req->body) ? nombre_catalogo($req->b('nombre'), 'ciclo') : $c['nombre'];
    if ($nombre !== $c['nombre'] && uno('SELECT 1 FROM eval_ciclos WHERE empresa_id = ? AND nombre = ? AND id <> ?', $e, $nombre, $c['id'])) falla(400, "Ya existe el ciclo “$nombre”");
    ejecutar('UPDATE eval_ciclos SET nombre = ?, orden = ?, activo = ? WHERE id = ?', $nombre, array_key_exists('orden', $req->body) ? (int)$req->b('orden') : (int)$c['orden'],
        array_key_exists('activo', $req->body) ? ($req->b('activo') ? 1 : 0) : (int)$c['activo'], $c['id']);
    return ['ok' => true];
});
$R->delete('/api/eval-param/ciclos/:id', function (Peticion $req) {
    solo_param_eval($req->u);
    $c = uno('SELECT * FROM eval_ciclos WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Ciclo no encontrado');
    $n = (int)uno('SELECT COUNT(*) n FROM evaluaciones WHERE ciclo_id = ?', $c['id'])['n'];
    if ($n) falla(400, "El ciclo está en uso en $n evaluación(es): desactívalo en lugar de borrarlo");
    ejecutar('DELETE FROM eval_ciclos WHERE id = ?', $c['id']);
    return ['ok' => true];
});

// Clasificación de hallazgos
$R->post('/api/eval-param/clasificaciones', function (Peticion $req) {
    solo_param_eval($req->u); $e = $req->u['empresa_id'];
    $nombre = nombre_catalogo($req->b('nombre'), 'clasificación');
    if (uno('SELECT 1 FROM hallazgo_clasificaciones WHERE empresa_id = ? AND nombre = ?', $e, $nombre)) falla(400, "Ya existe la clasificación “$nombre”");
    return ['id' => ejecutar('INSERT INTO hallazgo_clasificaciones (empresa_id, nombre) VALUES (?,?)', $e, $nombre)];
});
$R->put('/api/eval-param/clasificaciones/:id', function (Peticion $req) {
    solo_param_eval($req->u); $e = $req->u['empresa_id'];
    $c = uno('SELECT * FROM hallazgo_clasificaciones WHERE id = ? AND empresa_id = ?', $req->p('id'), $e) ?? falla(404, 'Clasificación no encontrada');
    $nombre = nombre_catalogo($req->b('nombre'), 'clasificación');
    if ($nombre !== $c['nombre'] && uno('SELECT 1 FROM hallazgo_clasificaciones WHERE empresa_id = ? AND nombre = ? AND id <> ?', $e, $nombre, $c['id'])) falla(400, "Ya existe la clasificación “$nombre”");
    ejecutar('UPDATE hallazgo_clasificaciones SET nombre = ? WHERE id = ?', $nombre, $c['id']);
    return ['ok' => true];
});
$R->delete('/api/eval-param/clasificaciones/:id', function (Peticion $req) {
    solo_param_eval($req->u);
    $c = uno('SELECT * FROM hallazgo_clasificaciones WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Clasificación no encontrada');
    $n = (int)uno('SELECT COUNT(*) n FROM hallazgos WHERE clasificacion_id = ?', $c['id'])['n'];
    if ($n) falla(400, "La clasificación está en uso en $n hallazgo(s): no se puede borrar");
    ejecutar('DELETE FROM hallazgo_clasificaciones WHERE id = ?', $c['id']);
    return ['ok' => true];
});

// Cortes del semáforo del nivel de gestión
$R->put('/api/eval-param/semaforo', function (Peticion $req) {
    solo_param_eval($req->u);
    foreach (['verde', 'amarillo'] as $k) if (!is_numeric($req->b($k))) falla(400, 'Los cortes del semáforo son números (porcentajes)');
    $verde = (float)$req->b('verde'); $amarillo = (float)$req->b('amarillo');
    if ($verde > 100 || $amarillo < 0 || $amarillo >= $verde) falla(400, 'El corte amarillo debe ser menor que el verde, y ambos entre 0 y 100');
    transaccion(function () use ($req, $verde, $amarillo) {
        foreach (['evaluacion.corte_verde' => $verde, 'evaluacion.corte_amarillo' => $amarillo] as $clave => $valor)
            ejecutar('INSERT INTO parametros (empresa_id, clave, valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', $req->u['empresa_id'], $clave, (string)$valor);
    });
    return ['ok' => true];
});

// Reporte de puntos de atención: las acciones que salen de los hallazgos de las evaluaciones, con filtros y orden
$R->get('/api/eval-param/atenciones', function (Peticion $req) {
    solo_param_eval($req->u);
    $w = ['a.empresa_id = ?']; $p = [$req->u['empresa_id']];
    en_lista($w, $p, 'e.anio', $req->q('anio')); en_lista($w, $p, 'e.estado', $req->q('estado_informe')); en_lista($w, $p, 'e.evaluador', $req->q('evaluador'));
    en_lista($w, $p, 'e.id', $req->q('evaluacion')); en_lista($w, $p, 'a.estado', $req->q('estado')); en_lista($w, $p, 'a.tipo', $req->q('tipo'));
    en_lista($w, $p, 'h.proceso_id', $req->q('unidad')); en_lista($w, $p, 'a.responsable_id', $req->q('responsable'));
    if ($req->q('texto')) { $w[] = '(a.codigo LIKE ? OR h.codigo LIKE ? OR h.descripcion LIKE ?)'; array_push($p, ...array_fill(0, 3, '%' . $req->q('texto') . '%')); }
    $orden = ['fecha_compromiso' => 'a.fecha_compromiso IS NULL, a.fecha_compromiso', 'codigo' => 'a.codigo', 'estado' => 'a.estado', 'unidad' => 'p.nombre', 'evaluacion' => 'e.codigo'][$req->q('orden_por')]
        ?? 'a.fecha_compromiso IS NULL, a.fecha_compromiso';
    $sentido = strtolower((string)$req->q('orden')) === 'desc' ? ' DESC' : '';
    $filas = array_map('con_vencida', todos("SELECT a.id, a.codigo, a.tipo, a.estado, a.fecha_compromiso, a.reaperturas, a.eficaz, u.nombre responsable, p.nombre unidad,
        h.id hallazgo_id, h.codigo hallazgo_codigo, h.tipo hallazgo_tipo, h.descripcion hallazgo,
        e.id evaluacion_id, e.codigo evaluacion_codigo, e.nombre evaluacion, e.anio, e.estado estado_informe, e.evaluador,
        (SELECT COUNT(*) FROM actividades t WHERE t.accion_id = a.id) actividades,
        (SELECT COUNT(*) FROM actividades t WHERE t.accion_id = a.id AND t.cumplida = 1) cumplidas,
        (SELECT COUNT(*) FROM acciones_bitacora b WHERE b.accion_id = a.id) seguimientos
      FROM acciones a JOIN hallazgos h ON h.id = a.hallazgo_id JOIN evaluaciones e ON e.id = h.evaluacion_id
      LEFT JOIN procesos p ON p.id = h.proceso_id LEFT JOIN usuarios u ON u.id = a.responsable_id
      WHERE " . implode(' AND ', $w) . " ORDER BY $orden$sentido, a.id", ...$p));
    foreach ($filas as &$f) $f['avance'] = $f['actividades'] ? round($f['cumplidas'] / $f['actividades'] * 100, 2) : null;
    unset($f);
    return ['total' => count($filas), 'filas' => $filas,
        'por_estado' => array_map(fn($s) => ['estado' => $s, 'n' => count(array_filter($filas, fn($f) => $f['estado'] === $s))], ['Análisis', 'Ejecución', 'Verificación', 'Cerrada'])];
});
