<?php
// Glosario de términos y buscador global, que busca en todos los módulos a la vez (antes en glosario.js).
// MySQL compara sin distinguir tildes ni mayúsculas (cotejamiento utf8mb4_unicode_ci): «accion» encuentra «Acción».
declare(strict_types=1);

// Cada fuente del buscador: qué tabla, qué columnas se comparan y a qué pantalla lleva el resultado
const FUENTES = [
    ['tipo' => 'Documento', 'ruta' => 'documento', 'n' => 2, 'sql' => "SELECT d.id, d.codigo, d.nombre titulo, p.nombre proceso, d.estado detalle FROM documentos d
      LEFT JOIN procesos p ON p.id = d.proceso_id WHERE d.empresa_id = ? AND d.estado != 'ELIMINADO' AND (d.codigo LIKE ? OR d.nombre LIKE ?)"],
    ['tipo' => 'Registro', 'ruta' => 'registros', 'n' => 2, 'sql' => 'SELECT r.id, NULL codigo, r.nombre titulo, p.nombre proceso, r.medio detalle FROM registros r
      LEFT JOIN procesos p ON p.id = r.proceso_id WHERE r.empresa_id = ? AND (r.nombre LIKE ? OR r.ubicacion LIKE ?)'],
    ['tipo' => 'Término', 'ruta' => 'glosario', 'n' => 2, 'sql' => 'SELECT g.id, NULL codigo, g.termino titulo, g.glosario proceso, g.descripcion detalle FROM glosario g
      WHERE g.empresa_id = ? AND (g.termino LIKE ? OR g.descripcion LIKE ?)'],
    ['tipo' => 'Riesgo', 'ruta' => 'riesgo', 'n' => 3, 'sql' => 'SELECT r.id, r.codigo, r.nombre titulo, p.nombre proceso, r.tipo detalle FROM riesgos r
      LEFT JOIN procesos p ON p.id = r.proceso_id WHERE r.empresa_id = ? AND r.activo = 1 AND (r.codigo LIKE ? OR r.nombre LIKE ? OR r.descripcion LIKE ?)'],
    ['tipo' => 'Control', 'ruta' => 'riesgo', 'n' => 2, 'sql' => 'SELECT r.id, c.codigo, c.descripcion titulo, p.nombre proceso, c.clasificacion detalle FROM controles c
      JOIN riesgos r ON r.id = c.riesgo_id LEFT JOIN procesos p ON p.id = r.proceso_id WHERE r.empresa_id = ? AND (c.codigo LIKE ? OR c.descripcion LIKE ?)'],
    ['tipo' => 'Indicador', 'ruta' => 'indicador', 'n' => 3, 'sql' => 'SELECT i.id, i.codigo, i.nombre titulo, p.nombre proceso, i.frecuencia detalle FROM indicadores i
      LEFT JOIN procesos p ON p.id = i.proceso_id WHERE i.empresa_id = ? AND (i.codigo LIKE ? OR i.nombre LIKE ? OR i.proposito LIKE ?)'],
    ['tipo' => 'Evaluación', 'ruta' => 'auditoria', 'n' => 3, 'sql' => 'SELECT e.id, e.codigo, e.nombre titulo, NULL proceso, e.estado detalle FROM evaluaciones e
      WHERE e.empresa_id = ? AND (e.codigo LIKE ? OR e.nombre LIKE ? OR e.objetivo LIKE ?)'],
    ['tipo' => 'Acción de mejora', 'ruta' => 'accion', 'n' => 3, 'sql' => 'SELECT a.id, a.codigo, COALESCE(a.correccion, a.causa_raiz, a.tipo) titulo, NULL proceso, a.estado detalle
      FROM acciones a WHERE a.empresa_id = ? AND (a.codigo LIKE ? OR a.correccion LIKE ? OR a.causa_raiz LIKE ?)'],
];

// Restricción de cada tipo para quien lidera procesos (ids = sus procesos). Los documentos vigentes, registros y términos son de todos.
function restriccion_busqueda(string $tipo, array $ids, array $u): array {
    $o = $ids ?: [-1];
    return match ($tipo) {
        'Documento' => ['sql' => " AND (d.estado = 'VIGENTE' OR d.responsable_id = ?" . ($ids ? ' OR d.proceso_id IN (' . marcas($ids) . ')' : '') . ')', 'params' => [$u['id'], ...$ids]],
        'Riesgo', 'Control' => ['sql' => ' AND r.proceso_id IN (' . marcas($o) . ')', 'params' => $o],
        'Indicador' => ['sql' => ' AND i.proceso_id IN (' . marcas($o) . ')', 'params' => $o],
        'Evaluación' => ['sql' => ' AND (e.auditor_id = ?' . ($ids ? ' OR e.id IN (SELECT evaluacion_id FROM evaluacion_procesos WHERE proceso_id IN (' . marcas($ids) . '))' : '') . ')', 'params' => [$u['id'], ...$ids]],
        'Acción de mejora' => ['sql' => ' AND (a.responsable_id = ?' . ($ids ? ' OR a.hallazgo_id IN (SELECT id FROM hallazgos WHERE proceso_id IN (' . marcas($ids) . '))' : '') . ')', 'params' => [$u['id'], ...$ids]],
        default => ['sql' => '', 'params' => []],
    };
}

// ---------- Glosario ----------
$R->get('/api/glosario', function (Peticion $req) {
    $w = ['empresa_id = ?']; $p = [$req->u['empresa_id']];
    if ($req->q('glosario')) { $w[] = 'glosario = ?'; $p[] = $req->q('glosario'); }
    if ($req->q('texto')) { $t = '%' . $req->q('texto') . '%'; $w[] = '(termino LIKE ? OR descripcion LIKE ?)'; array_push($p, $t, $t); }
    if ($req->q('letra')) { $w[] = 'termino LIKE ?'; $p[] = $req->q('letra') . '%'; }
    return [
        'terminos' => todos('SELECT * FROM glosario WHERE ' . implode(' AND ', $w) . ' ORDER BY termino', ...$p),
        'glosarios' => array_column(todos('SELECT DISTINCT glosario FROM glosario WHERE empresa_id = ? ORDER BY glosario', $req->u['empresa_id']), 'glosario'),
    ];
});
function guardar_termino(Peticion $req, ?int $id = null): array {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad administra el glosario');
    $termino = txt($req->b('termino')); $descripcion = txt($req->b('descripcion'));
    if ($termino === '' || $descripcion === '') falla(400, 'El término y la descripción son obligatorios');
    $glosario = txt($req->b('glosario')) ?: 'General';
    if (uno('SELECT id FROM glosario WHERE empresa_id = ? AND glosario = ? AND termino = ? AND id != ?', $req->u['empresa_id'], $glosario, $termino, $id ?: 0))
        falla(400, "\"$termino\" ya está en el glosario $glosario");
    if ($id) ejecutar('UPDATE glosario SET glosario = ?, termino = ?, descripcion = ?, fuente = ?, modificado = ? WHERE id = ? AND empresa_id = ?',
        $glosario, $termino, $descripcion, $req->b('fuente') ?: null, ahora(), $id, $req->u['empresa_id']);
    else $id = ejecutar('INSERT INTO glosario (empresa_id, glosario, termino, descripcion, fuente, creado, modificado) VALUES (?, ?, ?, ?, ?, ?, ?)',
        $req->u['empresa_id'], $glosario, $termino, $descripcion, $req->b('fuente') ?: null, ahora(), ahora());
    return ['id' => $id];
}
$R->post('/api/glosario', fn(Peticion $req) => guardar_termino($req));
$R->put('/api/glosario/:id', fn(Peticion $req) => guardar_termino($req, (int)$req->p('id')));
$R->delete('/api/glosario/:id', function (Peticion $req) {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad administra el glosario');
    ejecutar('DELETE FROM glosario WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    return ['ok' => true];
});

// ---------- Buscador global ----------
$R->get('/api/buscar', function (Peticion $req) {
    $texto = txt($req->q('q'));
    if (mb_strlen($texto) < 2) falla(400, 'Escribe al menos 2 caracteres');
    $tipos = lista($req->q('tipo'));
    $like = '%' . norm($texto) . '%';
    $resultados = []; $ids = propios($req->u);
    foreach (FUENTES as $f) {
        if ($tipos && !in_array($f['tipo'], $tipos, true)) continue;
        $rs = $ids !== null ? restriccion_busqueda($f['tipo'], $ids, $req->u) : ['sql' => '', 'params' => []];
        foreach (todos($f['sql'] . $rs['sql'] . ' LIMIT 50', $req->u['empresa_id'], ...array_merge(array_fill(0, $f['n'], $like), $rs['params'])) as $fila)
            $resultados[] = $fila + ['tipo' => $f['tipo'], 'ruta' => $f['ruta']];
    }
    return ['texto' => $texto, 'tipos' => array_column(FUENTES, 'tipo'), 'resultados' => $resultados];
});
