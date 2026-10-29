<?php
// Riesgos y controles: matriz 5×5, riesgo inherente (absoluto) y residual según los controles (antes en riesgos.js)
declare(strict_types=1);

const TIPOS_RIESGO = ['Calidad', 'Ambiental', 'Estratégicos', 'Operacionales', 'Seguridad y Salud en el Trabajo', 'Comerciales',
    'Compras y proveedores', 'Legales', 'Información y tecnología', 'Financieros y continuidad'];
const PROBABILIDAD = ['Rara vez', 'Improbable', 'Posible', 'Probable', 'Casi seguro'];
const IMPACTO = ['Insignificante', 'Menor', 'Moderado', 'Mayor', 'Catastrófico'];
const DESPLAZA = ['Fuerte' => 2, 'Moderado' => 1, 'Débil' => 0]; // casillas que baja un control según su efectividad

function zona(int $p, int $i): string { $s = $p * $i; return $s >= 15 ? 'Extrema' : ($s >= 10 ? 'Alta' : ($s >= 5 ? 'Moderada' : 'Baja')); }
// Residual: cada control baja la probabilidad y/o el impacto según su efectividad (mínimo 1)
function residual(array $riesgo, array $controles): array {
    $p = $riesgo['probabilidad']; $i = $riesgo['impacto'];
    foreach ($controles as $c) { $n = DESPLAZA[$c['efectividad']] ?? 0; if ($c['mitiga_probabilidad']) $p -= $n; if ($c['mitiga_impacto']) $i -= $n; }
    $p = max(1, $p); $i = max(1, $i);
    return ['probabilidad_residual' => $p, 'impacto_residual' => $i, 'zona_residual' => zona($p, $i), 'puntaje_residual' => $p * $i];
}

const SELECT_R = 'SELECT r.*, p.nombre proceso, p.sigla proceso_sigla, p.orden proceso_orden, u.nombre responsable FROM riesgos r
  JOIN procesos p ON p.id = r.proceso_id LEFT JOIN usuarios u ON u.id = r.responsable_id';
function valorar(array $rg): array {
    $controles = todos('SELECT * FROM controles WHERE riesgo_id = ?', $rg['id']);
    return array_merge($rg, ['zona' => zona($rg['probabilidad'], $rg['impacto']), 'puntaje' => $rg['probabilidad'] * $rg['impacto'], 'total_controles' => count($controles)], residual($rg, $controles));
}
// Calidad administra todo; el Líder, los riesgos de sus procesos
function puede_editar_riesgo(array $rg, array $u): bool { return es_calidad($u) || lidera($rg['proceso_id'] ?? null, $u); }

$R->get('/api/riesgos/catalogos', fn() => ['tipos' => TIPOS_RIESGO, 'probabilidad' => PROBABILIDAD, 'impacto' => IMPACTO, 'zonas' => ['Baja', 'Moderada', 'Alta', 'Extrema']]);

$R->get('/api/riesgos', function (Peticion $req) {
    $w = ['r.empresa_id = ?', 'r.activo = 1']; $p = [$req->u['empresa_id']];
    $procs = lista($req->q('proceso')); $tipos = lista($req->q('tipo'));
    if ($procs) { $w[] = 'r.proceso_id IN (' . marcas($procs) . ')'; array_push($p, ...$procs); }
    if ($tipos) { $w[] = 'r.tipo IN (' . marcas($tipos) . ')'; array_push($p, ...$tipos); }
    if ($req->q('texto')) { $w[] = '(r.nombre LIKE ? OR r.codigo LIKE ?)'; array_push($p, '%' . $req->q('texto') . '%', '%' . $req->q('texto') . '%'); }
    $fr = filtro($req->u, 'r.proceso_id'); // el Líder solo ve los riesgos de sus procesos
    $out = array_map('valorar', todos(SELECT_R . ' WHERE ' . implode(' AND ', $w) . $fr['sql'] . ' ORDER BY p.orden, r.codigo', ...array_merge($p, $fr['params'])));
    $zonas = lista($req->q('zona'));
    if ($zonas) $out = array_values(array_filter($out, fn($x) => in_array($req->q('matriz') === 'residual' ? $x['zona_residual'] : $x['zona'], $zonas, true)));
    return array_map(fn($x) => $x + ['puede_editar' => puede_editar_riesgo($x, $req->u)], $out);
});

$R->get('/api/riesgos/:id', function (Peticion $req) {
    $rg = uno(SELECT_R . ' WHERE r.id = ? AND r.empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    if (!$rg || !ve($rg['proceso_id'], $req->u)) falla(404, 'Riesgo no encontrado');
    return valorar($rg) + [
        'puede_editar' => puede_editar_riesgo($rg, $req->u),
        'controles' => todos('SELECT c.*, g.nombre responsable_gestion, v.nombre responsable_revision,
            (SELECT ejecutado FROM monitoreos m WHERE m.control_id = c.id AND m.periodo = ?) ejecutado_mes
          FROM controles c LEFT JOIN usuarios g ON g.id = c.responsable_gestion_id LEFT JOIN usuarios v ON v.id = c.responsable_revision_id
          WHERE c.riesgo_id = ? ORDER BY c.codigo', gmdate('Y-m'), $rg['id']),
        'monitoreos' => todos('SELECT m.*, c.codigo control, u.nombre usuario FROM monitoreos m JOIN controles c ON c.id = m.control_id
          LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE c.riesgo_id = ? ORDER BY m.periodo DESC, c.codigo LIMIT 60', $rg['id']),
        'planes' => todos('SELECT a.*, u.nombre responsable FROM planes_accion a LEFT JOIN usuarios u ON u.id = a.responsable_id WHERE a.riesgo_id = ? ORDER BY a.id DESC', $rg['id']),
    ];
});

const CAMPOS_R = ['proceso_id', 'tipo', 'nombre', 'descripcion', 'causas', 'consecuencias', 'probabilidad', 'impacto', 'tratamiento', 'responsable_id'];
function guardar_riesgo(Peticion $req, $id = null): array {
    $b = $req->body;
    if ($id) {
        $actual = uno('SELECT * FROM riesgos WHERE id = ? AND empresa_id = ?', $id, $req->u['empresa_id']);
        if (!$actual) falla(404, 'Riesgo no encontrado');
        if (!puede_editar_riesgo($actual, $req->u)) falla(403, 'Solo Calidad o el líder del proceso editan este riesgo');
    }
    if (!puede_editar_riesgo($b, $req->u)) falla(403, 'Solo puedes registrar riesgos de tu proceso');
    if (txt($b['nombre'] ?? '') === '' || empty($b['proceso_id'])) falla(400, 'Nombre y proceso son obligatorios');
    if (!in_array($b['tipo'] ?? null, TIPOS_RIESGO, true)) falla(400, 'Tipo de riesgo inválido');
    foreach (['probabilidad', 'impacto'] as $c) if (!(is_numeric($b[$c] ?? null) && $b[$c] >= 1 && $b[$c] <= 5)) falla(400, "La $c va de 1 a 5");
    $vals = array_map(fn($c) => $b[$c] ?? null, CAMPOS_R);
    if ($id) {
        ejecutar('UPDATE riesgos SET ' . implode(', ', array_map(fn($c) => "$c = ?", CAMPOS_R)) . ', modificado = ? WHERE id = ?', ...array_merge($vals, [ahora(), $id]));
        return ['id' => (int)$id];
    }
    $sigla = uno('SELECT sigla FROM procesos WHERE id = ?', $b['proceso_id'])['sigla'];
    $codigo = "R-$sigla-" . str_pad((string)((int)uno('SELECT COUNT(*) n FROM riesgos WHERE codigo LIKE ?', "R-$sigla-%")['n'] + 1), 2, '0', STR_PAD_LEFT);
    return ['id' => ejecutar('INSERT INTO riesgos (empresa_id, codigo, ' . implode(', ', CAMPOS_R) . ', creado, modificado) VALUES (?, ?' . str_repeat(', ?', count(CAMPOS_R)) . ', ?, ?)',
        $req->u['empresa_id'], $codigo, ...array_merge($vals, [ahora(), ahora()]))];
}
$R->post('/api/riesgos', fn(Peticion $req) => guardar_riesgo($req));
$R->put('/api/riesgos/:id', fn(Peticion $req) => guardar_riesgo($req, $req->p('id')));
$R->delete('/api/riesgos/:id', function (Peticion $req) {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad retira riesgos de la matriz');
    ejecutar('UPDATE riesgos SET activo = 0, modificado = ? WHERE id = ? AND empresa_id = ?', ahora(), $req->p('id'), $req->u['empresa_id']);
    return ['ok' => true];
});

// ---------- Controles ----------
$R->get('/api/controles', function (Peticion $req) {
    $w = ['r.empresa_id = ?', 'r.activo = 1']; $p = [$req->u['empresa_id']];
    $procs = lista($req->q('proceso')); $clases = lista($req->q('clasificacion'));
    if ($procs) { $w[] = 'r.proceso_id IN (' . marcas($procs) . ')'; array_push($p, ...$procs); }
    if ($clases) { $w[] = 'c.clasificacion IN (' . marcas($clases) . ')'; array_push($p, ...$clases); }
    if ($req->q('texto')) { $w[] = '(c.descripcion LIKE ? OR c.codigo LIKE ? OR r.nombre LIKE ?)'; array_push($p, ...array_fill(0, 3, '%' . $req->q('texto') . '%')); }
    if ($req->q('responsable')) { $w[] = 'c.' . ($req->q('rol') === 'revision' ? 'responsable_revision_id' : 'responsable_gestion_id') . ' = ?'; $p[] = $req->q('responsable'); }
    $fc = filtro($req->u, 'r.proceso_id');
    return todos('SELECT c.*, r.codigo riesgo_codigo, r.nombre riesgo, r.id riesgo_id, pr.nombre proceso, g.nombre responsable_gestion, v.nombre responsable_revision FROM controles c
      JOIN riesgos r ON r.id = c.riesgo_id JOIN procesos pr ON pr.id = r.proceso_id
      LEFT JOIN usuarios g ON g.id = c.responsable_gestion_id LEFT JOIN usuarios v ON v.id = c.responsable_revision_id
      WHERE ' . implode(' AND ', $w) . $fc['sql'] . ' ORDER BY pr.orden, r.codigo, c.codigo', ...array_merge($p, $fc['params']));
});

const CAMPOS_C = ['descripcion', 'clasificacion', 'mitiga_probabilidad', 'mitiga_impacto', 'efectividad', 'frecuencia', 'documentado', 'evidencia', 'responsable_gestion_id', 'responsable_revision_id'];
function guardar_control(Peticion $req, $id = null): array {
    $b = $req->body; $riesgoId = $b['riesgo_id'] ?? null;
    if ($id) { $c = uno('SELECT * FROM controles WHERE id = ?', $id); if (!$c) falla(404, 'Control no encontrado'); $riesgoId = $c['riesgo_id']; }
    $rg = uno('SELECT * FROM riesgos WHERE id = ? AND empresa_id = ?', $riesgoId, $req->u['empresa_id']);
    if (!$rg) falla(404, 'Riesgo no encontrado');
    if (!puede_editar_riesgo($rg, $req->u)) falla(403, 'Solo Calidad o el líder del proceso administran estos controles');
    if (txt($b['descripcion'] ?? '') === '') falla(400, 'Describe el control');
    foreach (['mitiga_probabilidad', 'mitiga_impacto', 'documentado'] as $k) $b[$k] = (($b[$k] ?? null) === true || ($b[$k] ?? null) === 1 || ($b[$k] ?? null) === '1') ? 1 : 0;
    if (!$b['mitiga_probabilidad'] && !$b['mitiga_impacto']) falla(400, 'El control debe mitigar la probabilidad, el impacto o ambos');
    $vals = array_map(fn($c) => $b[$c] ?? null, CAMPOS_C);
    if ($id) ejecutar('UPDATE controles SET ' . implode(', ', array_map(fn($c) => "$c = ?", CAMPOS_C)) . ' WHERE id = ?', ...array_merge($vals, [$id]));
    else {
        $sigla = uno('SELECT sigla FROM procesos WHERE id = ?', $rg['proceso_id'])['sigla'];
        $codigo = "C-$sigla-" . str_pad((string)((int)uno('SELECT COUNT(*) n FROM controles WHERE codigo LIKE ?', "C-$sigla-%")['n'] + 1), 2, '0', STR_PAD_LEFT);
        $id = ejecutar('INSERT INTO controles (riesgo_id, codigo, ' . implode(', ', CAMPOS_C) . ') VALUES (?, ?' . str_repeat(', ?', count(CAMPOS_C)) . ')', $rg['id'], $codigo, ...$vals);
    }
    ejecutar('UPDATE riesgos SET modificado = ? WHERE id = ?', ahora(), $rg['id']);
    return ['id' => (int)$id];
}
$R->post('/api/controles', fn(Peticion $req) => guardar_control($req));
$R->put('/api/controles/:id', fn(Peticion $req) => guardar_control($req, $req->p('id')));
function cargar_control(Peticion $req): array {
    return uno('SELECT c.*, r.proceso_id FROM controles c JOIN riesgos r ON r.id = c.riesgo_id WHERE c.id = ? AND r.empresa_id = ?', $req->p('id'), $req->u['empresa_id'])
        ?? falla(404, 'Control no encontrado');
}
$R->delete('/api/controles/:id', function (Peticion $req) {
    $c = cargar_control($req);
    if (!puede_editar_riesgo($c, $req->u)) falla(403, 'Solo Calidad o el líder del proceso eliminan este control');
    ejecutar('DELETE FROM controles WHERE id = ?', $c['id']);
    return ['ok' => true];
});

// Monitoreo: el responsable de gestión reporta si ejecutó el control en el mes
$R->post('/api/controles/:id/monitoreo', function (Peticion $req) {
    $c = cargar_control($req);
    if (!es_calidad($req->u) && $c['responsable_gestion_id'] !== $req->u['id'] && !puede_editar_riesgo($c, $req->u))
        falla(403, 'Solo el responsable del control, el líder del proceso o Calidad reportan su ejecución');
    $periodo = (string)($req->b('periodo') ?: gmdate('Y-m'));
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $periodo)) falla(400, 'Periodo inválido (AAAA-MM)');
    $e = $req->b('ejecutado');
    $ejecutado = ($e === true || $e === '1' || $e === 1) ? 1 : 0;
    if (!$ejecutado && txt($req->b('observacion')) === '') falla(400, 'Explica por qué no se ejecutó el control');
    ejecutar('INSERT INTO monitoreos (control_id, periodo, ejecutado, observacion, usuario_id, fecha) VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE ejecutado = VALUES(ejecutado), observacion = VALUES(observacion), usuario_id = VALUES(usuario_id), fecha = VALUES(fecha)',
        $c['id'], $periodo, $ejecutado, $req->b('observacion') ?: null, $req->u['id'], ahora());
    return ['ok' => true];
});
