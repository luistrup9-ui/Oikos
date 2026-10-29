<?php
// Evaluaciones (auditorías), lista de verificación, hallazgos y acciones correctivas / de mejora (antes en auditorias.js)
declare(strict_types=1);

const ESTADOS_EVAL = ['Planeación', 'Ejecución', 'Evaluación', 'Terminada'];
const ORIGENES = ['Auditoría interna', 'Auditoría externa', 'Autoevaluación', 'Inspección', 'Queja o reclamo de cliente', 'Indicador',
    'Riesgo', 'Revisión por la dirección', 'Producto no conforme', 'Otro'];
// Preguntas base ISO 9001:2015 para cargar en la lista de verificación de cada proceso
const PREGUNTAS_ISO = [
    ['4.4', '¿El proceso tiene caracterización actualizada con entradas, salidas, responsables e indicadores?'],
    ['5.3', '¿Los roles, responsabilidades y autoridades del proceso están definidos y comunicados?'],
    ['6.1', '¿Se identificaron los riesgos del proceso y se implementan sus controles?'],
    ['6.2', '¿Los objetivos del proceso son medibles y se les hace seguimiento?'],
    ['7.1.5', '¿Los equipos de seguimiento y medición están calibrados o verificados?'],
    ['7.2', '¿El personal tiene la competencia requerida y hay evidencia de su formación?'],
    ['7.5', '¿Los documentos que se usan son la versión vigente y los registros se conservan según el listado maestro?'],
    ['8.5', '¿La operación se realiza en condiciones controladas, según los procedimientos?'],
    ['9.1', '¿Los indicadores se miden con la frecuencia definida y se analizan sus resultados?'],
    ['10.2', '¿Las no conformidades tienen análisis de causa y acciones correctivas eficaces?'],
];

function hoy(): string { return substr(ahora(), 0, 10); }
function en_lista(array &$w, array &$p, string $col, $v): void { $l = lista($v); if ($l) { $w[] = "$col IN (" . marcas($l) . ')'; array_push($p, ...$l); } }
function consecutivo(string $tabla, string $prefijo): string {
    return $prefijo . str_pad((string)((int)uno("SELECT COUNT(*) n FROM $tabla WHERE codigo LIKE ?", $prefijo . '%')['n'] + 1), 2, '0', STR_PAD_LEFT);
}

// ================= Evaluaciones =================
const SELECT_EVAL = "SELECT e.*, u.nombre auditor,
    (SELECT GROUP_CONCAT(p.nombre ORDER BY ep.proceso_id SEPARATOR ', ') FROM evaluacion_procesos ep JOIN procesos p ON p.id = ep.proceso_id WHERE ep.evaluacion_id = e.id) procesos,
    (SELECT COUNT(*) FROM hallazgos h WHERE h.evaluacion_id = e.id) total_hallazgos
  FROM evaluaciones e LEFT JOIN usuarios u ON u.id = e.auditor_id";
function es_auditor(array $e, array $u): bool { return es_calidad($u) || $e['auditor_id'] === $u['id']; }

$R->get('/api/evaluaciones/catalogos', fn() => ['estados' => ESTADOS_EVAL, 'origenes' => ORIGENES,
    'tipos' => ['Auditoría interna', 'Auditoría externa', 'Autoevaluación', 'Inspección'], 'evaluadores' => ['Coordinador de Calidad', 'Dueños de proceso', 'Externo']]);

$R->get('/api/evaluaciones', function (Peticion $req) {
    $w = ['e.empresa_id = ?']; $p = [$req->u['empresa_id']];
    en_lista($w, $p, 'e.tipo', $req->q('tipo')); en_lista($w, $p, 'e.anio', $req->q('anio')); en_lista($w, $p, 'e.evaluador', $req->q('evaluador')); en_lista($w, $p, 'e.estado', $req->q('estado'));
    $procs = lista($req->q('proceso'));
    if ($procs) { $w[] = 'e.id IN (SELECT evaluacion_id FROM evaluacion_procesos WHERE proceso_id IN (' . marcas($procs) . '))'; array_push($p, ...$procs); }
    if ($req->q('texto')) { $w[] = '(e.nombre LIKE ? OR e.codigo LIKE ?)'; array_push($p, '%' . $req->q('texto') . '%', '%' . $req->q('texto') . '%'); }
    // El Líder ve las evaluaciones donde es auditor o donde participan sus procesos
    $ids = propios($req->u);
    if ($ids !== null) { $w[] = '(e.auditor_id = ?' . ($ids ? ' OR e.id IN (SELECT evaluacion_id FROM evaluacion_procesos WHERE proceso_id IN (' . marcas($ids) . '))' : '') . ')'; array_push($p, $req->u['id'], ...$ids); }
    return todos(SELECT_EVAL . ' WHERE ' . implode(' AND ', $w) . ' ORDER BY e.anio DESC, e.fecha_inicio, e.id', ...$p);
});

function cargar_eval(Peticion $req): array {
    $e = uno(SELECT_EVAL . ' WHERE e.id = ? AND e.empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    if (!$e) falla(404, 'Evaluación no encontrada');
    $ids = propios($req->u);
    if ($ids !== null && $e['auditor_id'] !== $req->u['id'] && !array_intersect(array_column(todos('SELECT proceso_id FROM evaluacion_procesos WHERE evaluacion_id = ?', $e['id']), 'proceso_id'), $ids))
        falla(404, 'Evaluación no encontrada');
    return $e;
}

$R->get('/api/evaluaciones/:id', function (Peticion $req) {
    $e = cargar_eval($req);
    // Quien no es auditor y lidera procesos solo ve lo de sus procesos dentro de la evaluación
    $ids = propios($req->u);
    $propio = fn($x) => $ids === null || es_auditor($e, $req->u) || in_array($x['proceso_id'], $ids, true);
    $items = array_values(array_filter(todos('SELECT * FROM verificacion_items WHERE evaluacion_id = ? ORDER BY proceso_id, id', $e['id']), $propio));
    return $e + [
        'puede_editar' => es_calidad($req->u), 'es_auditor' => es_auditor($e, $req->u),
        'lista_procesos' => array_values(array_filter(todos('SELECT ep.*, p.nombre, u.nombre auditado FROM evaluacion_procesos ep JOIN procesos p ON p.id = ep.proceso_id
          LEFT JOIN usuarios u ON u.id = ep.auditado_id WHERE ep.evaluacion_id = ? ORDER BY p.orden', $e['id']), $propio)),
        'items' => $items,
        'resumen' => array_map(fn($x) => ['resultado' => $x, 'n' => count(array_filter($items, fn($i) => $i['resultado'] === $x))], ['Conforme', 'No conforme', 'Observación', 'No aplica', null]),
        'hallazgos' => array_values(array_filter(todos('SELECT h.*, p.nombre proceso, (SELECT COUNT(*) FROM acciones a WHERE a.hallazgo_id = h.id) total_acciones
          FROM hallazgos h LEFT JOIN procesos p ON p.id = h.proceso_id WHERE h.evaluacion_id = ? ORDER BY h.id', $e['id']), $propio)),
    ];
});

const CAMPOS_EVAL = ['anio', 'tipo', 'nombre', 'objetivo', 'alcance', 'criterios', 'evaluador', 'auditor_id', 'auditor_externo', 'fecha_inicio', 'fecha_fin'];
function guardar_eval(Peticion $req, $id = null): array {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad programa evaluaciones');
    $b = $req->body;
    if (txt($b['nombre'] ?? '') === '' || !(is_numeric($b['anio'] ?? null) && $b['anio'] + 0)) falla(400, 'Nombre y año son obligatorios');
    if (!empty($b['fecha_inicio']) && !empty($b['fecha_fin']) && $b['fecha_fin'] < $b['fecha_inicio']) falla(400, 'La fecha final no puede ser anterior a la inicial');
    if (($b['evaluador'] ?? null) === 'Externo' && txt($b['auditor_externo'] ?? '') === '') falla(400, 'Indica el auditor u organismo externo');
    $procesos = array_map('intval', lista($b['procesos'] ?? null));
    $vals = array_map(fn($c) => $b[$c] ?? null, CAMPOS_EVAL);
    return transaccion(function () use ($req, $id, $b, $procesos, $vals) {
        if ($id) {
            $e = uno('SELECT * FROM evaluaciones WHERE id = ? AND empresa_id = ?', $id, $req->u['empresa_id']);
            if (!$e) falla(404, 'Evaluación no encontrada');
            if ($e['estado'] === 'Terminada') falla(400, 'Una evaluación terminada no se modifica');
            ejecutar('UPDATE evaluaciones SET ' . implode(', ', array_map(fn($c) => "$c = ?", CAMPOS_EVAL)) . ' WHERE id = ?', ...array_merge($vals, [$id]));
        } else {
            $id = ejecutar('INSERT INTO evaluaciones (empresa_id, codigo, ' . implode(', ', CAMPOS_EVAL) . ') VALUES (?, ?' . str_repeat(', ?', count(CAMPOS_EVAL)) . ')',
                $req->u['empresa_id'], consecutivo('evaluaciones', "EV-{$b['anio']}-"), ...$vals);
        }
        if (array_key_exists('procesos', $b)) {
            $actuales = array_column(todos('SELECT proceso_id FROM evaluacion_procesos WHERE evaluacion_id = ?', $id), 'proceso_id');
            foreach (array_diff($actuales, $procesos) as $p) {
                ejecutar('DELETE FROM evaluacion_procesos WHERE evaluacion_id = ? AND proceso_id = ?', $id, $p);
                ejecutar('DELETE FROM verificacion_items WHERE evaluacion_id = ? AND proceso_id = ?', $id, $p);
            }
            foreach (array_diff($procesos, $actuales) as $p) ejecutar('INSERT INTO evaluacion_procesos (evaluacion_id, proceso_id) VALUES (?,?)', $id, $p);
        }
        return ['id' => $id];
    });
}
$R->post('/api/evaluaciones', fn(Peticion $req) => guardar_eval($req));
$R->put('/api/evaluaciones/:id', fn(Peticion $req) => guardar_eval($req, $req->p('id')));
$R->delete('/api/evaluaciones/:id', function (Peticion $req) {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad elimina evaluaciones');
    $e = cargar_eval($req);
    if ($e['estado'] !== 'Planeación') falla(400, 'Solo se eliminan evaluaciones en planeación');
    ejecutar('DELETE FROM evaluaciones WHERE id = ?', $e['id']);
    return ['ok' => true];
});

// Fecha y auditado por proceso (agenda de la auditoría)
$R->put('/api/evaluaciones/:id/procesos/:pid', function (Peticion $req) {
    $e = cargar_eval($req);
    if (!es_auditor($e, $req->u)) falla(403, 'Solo Calidad o el auditor ajustan la agenda');
    ejecutar('UPDATE evaluacion_procesos SET fecha = ?, auditado_id = ? WHERE evaluacion_id = ? AND proceso_id = ?', $req->b('fecha'), $req->b('auditado_id'), $e['id'], $req->p('pid'));
    return ['ok' => true];
});

// Cambio de estado con sus reglas
$R->post('/api/evaluaciones/:id/estado', function (Peticion $req) {
    $e = cargar_eval($req);
    $destino = $req->b('estado');
    $i = array_search($e['estado'], ESTADOS_EVAL, true); $j = array_search($destino, ESTADOS_EVAL, true);
    if ($j === false || abs($j - $i) !== 1) falla(400, 'Solo se avanza o retrocede un paso a la vez');
    if (!es_auditor($e, $req->u)) falla(403, 'Solo Calidad o el auditor asignado cambian el estado');
    if ($destino === 'Terminada' && !es_calidad($req->u)) falla(403, 'Solo Calidad cierra la evaluación');
    if ($e['estado'] === 'Terminada') falla(400, 'La evaluación ya está terminada');
    if ($j > $i) {
        if ($destino === 'Ejecución') {
            if (!uno('SELECT 1 FROM evaluacion_procesos WHERE evaluacion_id = ?', $e['id'])) falla(400, 'Agrega al menos un proceso a evaluar');
            if (!$e['auditor_id'] && !$e['auditor_externo']) falla(400, 'Asigna el auditor');
            if (!uno('SELECT 1 FROM verificacion_items WHERE evaluacion_id = ?', $e['id'])) falla(400, 'Prepara la lista de verificación');
        }
        if ($destino === 'Evaluación' && uno('SELECT 1 FROM verificacion_items WHERE evaluacion_id = ? AND resultado IS NULL', $e['id']))
            falla(400, 'Faltan preguntas de la lista de verificación por responder');
        if ($destino === 'Terminada' && txt($req->b('conclusiones') ?: $e['conclusiones']) === '') falla(400, 'Escribe las conclusiones del informe');
    }
    ejecutar('UPDATE evaluaciones SET estado = ?, conclusiones = COALESCE(?, conclusiones) WHERE id = ?', $destino, $req->b('conclusiones'), $e['id']);
    return ['ok' => true];
});

// Lista de verificación
function editable_lista(array $e, array $u): void {
    if (!es_auditor($e, $u)) falla(403, 'Solo Calidad o el auditor asignado editan la lista de verificación');
    if (!in_array($e['estado'], ['Planeación', 'Ejecución'], true)) falla(400, 'La lista solo se edita en planeación o ejecución');
}
$R->post('/api/evaluaciones/:id/items', function (Peticion $req) {
    $e = cargar_eval($req); editable_lista($e, $req->u);
    $procesos = array_column(todos('SELECT proceso_id FROM evaluacion_procesos WHERE evaluacion_id = ?', $e['id']), 'proceso_id');
    if ($req->b('plantilla') === 'iso9001') {
        $destino = $req->b('proceso_id') ? [(int)$req->b('proceso_id')] : $procesos;
        transaccion(function () use ($destino, $e) {
            foreach ($destino as $p) foreach (PREGUNTAS_ISO as [$requisito, $pregunta])
                if (!uno('SELECT 1 FROM verificacion_items WHERE evaluacion_id = ? AND proceso_id = ? AND requisito = ?', $e['id'], $p, $requisito))
                    ejecutar('INSERT INTO verificacion_items (evaluacion_id, proceso_id, requisito, pregunta) VALUES (?,?,?,?)', $e['id'], $p, $requisito, $pregunta);
        });
        return ['ok' => true];
    }
    if (!in_array((int)$req->b('proceso_id'), $procesos, true)) falla(400, 'El proceso no hace parte de esta evaluación');
    if (txt($req->b('pregunta')) === '') falla(400, 'Escribe la pregunta');
    return ['id' => ejecutar('INSERT INTO verificacion_items (evaluacion_id, proceso_id, requisito, pregunta) VALUES (?,?,?,?)', $e['id'], $req->b('proceso_id'), $req->b('requisito'), txt($req->b('pregunta')))];
});
$R->delete('/api/evaluaciones/:id/items/:iid', function (Peticion $req) {
    $e = cargar_eval($req); editable_lista($e, $req->u);
    ejecutar('DELETE FROM verificacion_items WHERE id = ? AND evaluacion_id = ?', $req->p('iid'), $e['id']);
    return ['ok' => true];
});

function crear_hallazgo(array $d, array $u): int {
    $sigla = !empty($d['proceso_id']) ? (uno('SELECT sigla FROM procesos WHERE id = ?', $d['proceso_id'])['sigla'] ?? null) : 'GEN';
    if (!$sigla) falla(400, 'Proceso inválido');
    return ejecutar('INSERT INTO hallazgos (empresa_id, codigo, evaluacion_id, item_id, origen, proceso_id, tipo, requisito, descripcion, evidencia, usuario_id, fecha) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        $u['empresa_id'], consecutivo('hallazgos', "H-$sigla-"), $d['evaluacion_id'] ?? null, $d['item_id'] ?? null, $d['origen'] ?? null, $d['proceso_id'] ?? null,
        $d['tipo'] ?? null, $d['requisito'] ?? null, $d['descripcion'] ?? null, $d['evidencia'] ?? null, $u['id'], ahora());
}

// Responder una pregunta: si no es conforme u observación, se genera el hallazgo automáticamente
$R->put('/api/evaluaciones/:id/items/:iid', function (Peticion $req) {
    $e = cargar_eval($req);
    if (!es_auditor($e, $req->u)) falla(403, 'Solo el auditor asignado o Calidad responden la lista');
    if ($e['estado'] !== 'Ejecución') falla(400, 'Las preguntas se responden con la evaluación en ejecución');
    $it = uno('SELECT * FROM verificacion_items WHERE id = ? AND evaluacion_id = ?', $req->p('iid'), $e['id']);
    if (!$it) falla(404, 'Pregunta no encontrada');
    $resultado = $req->b('resultado'); $evidencia = $req->b('evidencia');
    if (!in_array($resultado, ['Conforme', 'No conforme', 'Observación', 'No aplica'], true)) falla(400, 'Resultado inválido');
    if ($resultado !== 'No aplica' && txt($evidencia) === '') falla(400, 'Registra la evidencia observada');
    return transaccion(function () use ($req, $e, $it, $resultado, $evidencia) {
        ejecutar('UPDATE verificacion_items SET resultado = ?, evidencia = ? WHERE id = ?', $resultado, $evidencia, $it['id']);
        $tipoH = ['No conforme' => $req->b('tipo_hallazgo') === 'No conformidad mayor' ? 'No conformidad mayor' : 'No conformidad menor', 'Observación' => 'Observación'][$resultado] ?? null;
        $previo = uno('SELECT * FROM hallazgos WHERE item_id = ?', $it['id']);
        $hallazgo_id = $previo['id'] ?? null;
        if ($tipoH && !$previo)
            $hallazgo_id = crear_hallazgo(['evaluacion_id' => $e['id'], 'item_id' => $it['id'], 'origen' => $e['tipo'], 'proceso_id' => $it['proceso_id'], 'tipo' => $tipoH,
                'requisito' => $it['requisito'], 'descripcion' => "{$it['pregunta']} — $evidencia", 'evidencia' => $evidencia], $req->u);
        elseif ($tipoH && $previo) ejecutar('UPDATE hallazgos SET tipo = ?, evidencia = ? WHERE id = ?', $tipoH, $evidencia, $previo['id']);
        elseif (!$tipoH && $previo) {
            if (uno('SELECT 1 FROM acciones WHERE hallazgo_id = ?', $previo['id'])) falla(400, 'Ese hallazgo ya tiene acciones; no se puede quitar');
            ejecutar('DELETE FROM hallazgos WHERE id = ?', $previo['id']); $hallazgo_id = null;
        }
        return ['ok' => true, 'hallazgo_id' => $hallazgo_id];
    });
});

// ================= Hallazgos y acciones =================
const SELECT_ACC = "SELECT a.*, h.codigo hallazgo_codigo, h.tipo hallazgo_tipo, h.descripcion hallazgo, h.origen, h.proceso_id,
    p.nombre proceso, u.nombre responsable, v.nombre verificador,
    (SELECT COUNT(*) FROM actividades t WHERE t.accion_id = a.id) total_actividades,
    (SELECT COUNT(*) FROM actividades t WHERE t.accion_id = a.id AND t.cumplida = 1) actividades_cumplidas
  FROM acciones a JOIN hallazgos h ON h.id = a.hallazgo_id LEFT JOIN procesos p ON p.id = h.proceso_id
  LEFT JOIN usuarios u ON u.id = a.responsable_id LEFT JOIN usuarios v ON v.id = a.verificador_id";
function con_vencida(array $a): array { return $a + ['vencida' => ($a['estado'] !== 'Cerrada' && $a['fecha_compromiso'] && $a['fecha_compromiso'] < hoy()) ? 1 : 0]; }
function puede_gestionar(array $a, array $u): bool { return es_calidad($u) || $a['responsable_id'] === $u['id'] || lidera($a['proceso_id'], $u); }
function bitacora_accion(int $accionId, string $evento, $comentario, array $u): void {
    ejecutar('INSERT INTO acciones_bitacora (accion_id, evento, comentario, usuario_id, fecha) VALUES (?,?,?,?,?)', $accionId, $evento, $comentario ?: null, $u['id'], ahora());
}

$R->get('/api/hallazgos', function (Peticion $req) {
    $w = ['h.empresa_id = ?']; $p = [$req->u['empresa_id']];
    en_lista($w, $p, 'h.tipo', $req->q('tipo')); en_lista($w, $p, 'h.origen', $req->q('origen')); en_lista($w, $p, 'h.proceso_id', $req->q('proceso'));
    if ($req->q('texto')) { $w[] = '(h.descripcion LIKE ? OR h.codigo LIKE ?)'; array_push($p, '%' . $req->q('texto') . '%', '%' . $req->q('texto') . '%'); }
    if ($req->q('sin_accion') === '1') $w[] = 'NOT EXISTS (SELECT 1 FROM acciones a WHERE a.hallazgo_id = h.id)';
    $fh = filtro($req->u, 'h.proceso_id');
    return todos("SELECT h.*, p.nombre proceso, e.codigo evaluacion_codigo, u.nombre registrado_por,
        (SELECT COUNT(*) FROM acciones a WHERE a.hallazgo_id = h.id) total_acciones,
        (SELECT COUNT(*) FROM acciones a WHERE a.hallazgo_id = h.id AND a.estado = 'Cerrada') acciones_cerradas
      FROM hallazgos h LEFT JOIN procesos p ON p.id = h.proceso_id LEFT JOIN evaluaciones e ON e.id = h.evaluacion_id
      LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE " . implode(' AND ', $w) . $fh['sql'] . ' ORDER BY h.id DESC', ...array_merge($p, $fh['params']));
});

// Hallazgos de otras fuentes (quejas, indicadores, riesgos, producto no conforme…)
$R->post('/api/hallazgos', function (Peticion $req) {
    $b = $req->body; $u = $req->u;
    if ($u['rol'] === 'consulta') falla(403, 'Los usuarios de consulta no registran hallazgos');
    if (!in_array($b['origen'] ?? null, ORIGENES, true)) falla(400, 'Origen inválido');
    if (!in_array($b['tipo'] ?? null, ['No conformidad mayor', 'No conformidad menor', 'Observación', 'Oportunidad de mejora'], true)) falla(400, 'Tipo de hallazgo inválido');
    if (txt($b['descripcion'] ?? '') === '' || empty($b['proceso_id'])) falla(400, 'Proceso y descripción son obligatorios');
    if ($u['rol'] === 'lider_proceso' && !lidera($b['proceso_id'], $u)) falla(403, 'Solo registras hallazgos de tu proceso');
    return ['id' => crear_hallazgo(['evaluacion_id' => null, 'item_id' => null] + $b, $u)];
});

$R->get('/api/acciones', function (Peticion $req) {
    $w = ['a.empresa_id = ?']; $p = [$req->u['empresa_id']];
    en_lista($w, $p, 'a.estado', $req->q('estado')); en_lista($w, $p, 'a.tipo', $req->q('tipo')); en_lista($w, $p, 'h.proceso_id', $req->q('proceso')); en_lista($w, $p, 'h.origen', $req->q('origen'));
    if ($req->q('mias') === '1') { $w[] = 'a.responsable_id = ?'; $p[] = $req->u['id']; }
    if ($req->q('texto')) { $w[] = '(a.codigo LIKE ? OR h.descripcion LIKE ? OR a.causa_raiz LIKE ?)'; array_push($p, ...array_fill(0, 3, '%' . $req->q('texto') . '%')); }
    $ids = propios($req->u); // el Líder ve las acciones de los hallazgos de sus procesos o las que le asignaron
    if ($ids !== null) { $w[] = '(a.responsable_id = ?' . ($ids ? ' OR h.proceso_id IN (' . marcas($ids) . ')' : '') . ')'; array_push($p, $req->u['id'], ...$ids); }
    $out = array_map('con_vencida', todos(SELECT_ACC . ' WHERE ' . implode(' AND ', $w) . " ORDER BY a.estado = 'Cerrada', a.fecha_compromiso", ...$p));
    if ($req->q('vencidas') === '1') $out = array_values(array_filter($out, fn($a) => $a['vencida']));
    return $out;
});

$R->get('/api/acciones/:id', function (Peticion $req) {
    $a = uno(SELECT_ACC . ' WHERE a.id = ? AND a.empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    if (!$a || !(ve($a['proceso_id'], $req->u) || $a['responsable_id'] === $req->u['id'])) falla(404, 'Acción no encontrada');
    return con_vencida($a) + [
        'puede_gestionar' => puede_gestionar($a, $req->u), 'puede_verificar' => es_calidad($req->u),
        'hallazgo_completo' => uno('SELECT h.*, e.codigo evaluacion_codigo FROM hallazgos h LEFT JOIN evaluaciones e ON e.id = h.evaluacion_id WHERE h.id = ?', $a['hallazgo_id']),
        'actividades' => todos('SELECT t.*, u.nombre responsable FROM actividades t LEFT JOIN usuarios u ON u.id = t.responsable_id WHERE accion_id = ? ORDER BY t.fecha, t.id', $a['id']),
        'bitacora' => todos('SELECT b.*, u.nombre usuario FROM acciones_bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id WHERE accion_id = ? ORDER BY b.id DESC', $a['id']),
    ];
});

$R->post('/api/acciones', function (Peticion $req) {
    $b = $req->body; $u = $req->u;
    $h = uno('SELECT * FROM hallazgos WHERE id = ? AND empresa_id = ?', $b['hallazgo_id'] ?? null, $u['empresa_id']);
    if (!$h) falla(404, 'Hallazgo no encontrado');
    if (!es_calidad($u) && !lidera($h['proceso_id'], $u)) falla(403, 'Solo Calidad o el líder del proceso abren acciones');
    if (!in_array($b['tipo'] ?? null, ['Corrección', 'Acción correctiva', 'Acción de mejora'], true)) falla(400, 'Tipo de acción inválido');
    if (str_starts_with($h['tipo'], 'No conformidad') && $b['tipo'] === 'Acción de mejora') falla(400, 'Una no conformidad requiere acción correctiva o corrección');
    if (empty($b['fecha_compromiso'])) falla(400, 'Define la fecha de compromiso');
    $sigla = $h['proceso_id'] ? uno('SELECT sigla FROM procesos WHERE id = ?', $h['proceso_id'])['sigla'] : 'GEN';
    return transaccion(function () use ($u, $h, $b, $sigla) {
        $id = ejecutar('INSERT INTO acciones (empresa_id, codigo, hallazgo_id, tipo, correccion, responsable_id, fecha_compromiso, creado) VALUES (?,?,?,?,?,?,?,?)',
            $u['empresa_id'], consecutivo('acciones', "AC-$sigla-"), $h['id'], $b['tipo'], $b['correccion'] ?? null, ($b['responsable_id'] ?? null) ?: $u['id'], $b['fecha_compromiso'], ahora());
        bitacora_accion($id, 'Acción abierta', null, $u);
        return ['id' => $id];
    });
});

function cargar_accion(Peticion $req): array {
    return uno(SELECT_ACC . ' WHERE a.id = ? AND a.empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Acción no encontrada');
}

// Análisis de causa y datos generales (antes de cerrar)
$R->put('/api/acciones/:id', function (Peticion $req) {
    $a = cargar_accion($req); $b = $req->body;
    if (!puede_gestionar($a, $req->u)) falla(403, 'Solo el responsable, el líder del proceso o Calidad editan la acción');
    if ($a['estado'] === 'Cerrada') falla(400, 'La acción está cerrada');
    if ($a['estado'] !== 'Análisis' && ($b['causa_raiz'] ?? $a['causa_raiz']) !== $a['causa_raiz']) falla(400, 'La causa raíz solo se cambia en la etapa de análisis');
    ejecutar('UPDATE acciones SET correccion = ?, metodo_causa = ?, analisis_causa = ?, causa_raiz = ?, responsable_id = ?, fecha_compromiso = ? WHERE id = ?',
        $b['correccion'] ?? $a['correccion'], $b['metodo_causa'] ?? $a['metodo_causa'], $b['analisis_causa'] ?? $a['analisis_causa'], $b['causa_raiz'] ?? $a['causa_raiz'],
        ($b['responsable_id'] ?? null) ?: $a['responsable_id'], ($b['fecha_compromiso'] ?? null) ?: $a['fecha_compromiso'], $a['id']);
    if (!empty($b['fecha_compromiso']) && $b['fecha_compromiso'] !== $a['fecha_compromiso'])
        bitacora_accion($a['id'], 'Fecha de compromiso cambiada', "{$a['fecha_compromiso']} → {$b['fecha_compromiso']}", $req->u);
    return ['ok' => true];
});

// Actividades del plan
$R->post('/api/acciones/:id/actividades', function (Peticion $req) {
    $a = cargar_accion($req);
    if (!puede_gestionar($a, $req->u)) falla(403, 'Solo el responsable, el líder del proceso o Calidad planean actividades');
    if (!in_array($a['estado'], ['Análisis', 'Ejecución'], true)) falla(400, 'Las actividades se planean en análisis o ejecución');
    if (txt($req->b('descripcion')) === '' || !$req->b('fecha')) falla(400, 'Descripción y fecha son obligatorias');
    return ['id' => ejecutar('INSERT INTO actividades (accion_id, descripcion, responsable_id, fecha) VALUES (?,?,?,?)', $a['id'], txt($req->b('descripcion')), $req->b('responsable_id') ?: $a['responsable_id'], $req->b('fecha'))];
});
$R->put('/api/acciones/:id/actividades/:tid', function (Peticion $req) {
    $a = cargar_accion($req);
    $t = uno('SELECT * FROM actividades WHERE id = ? AND accion_id = ?', $req->p('tid'), $a['id']);
    if (!$t) falla(404, 'Actividad no encontrada');
    if (!puede_gestionar($a, $req->u) && $t['responsable_id'] !== $req->u['id']) falla(403, 'Solo el responsable de la actividad o de la acción la reportan');
    if ($a['estado'] !== 'Ejecución') falla(400, 'Las actividades se reportan con la acción en ejecución');
    $cumplida = $req->b('cumplida') ? 1 : 0;
    if ($cumplida && txt($req->b('evidencia')) === '') falla(400, 'Adjunta la evidencia de cumplimiento');
    ejecutar('UPDATE actividades SET cumplida = ?, evidencia = ?, fecha_cumplida = ? WHERE id = ?', $cumplida, $req->b('evidencia'), $cumplida ? hoy() : null, $t['id']);
    if ($cumplida) bitacora_accion($a['id'], 'Actividad cumplida', $t['descripcion'], $req->u);
    return ['ok' => true];
});
$R->delete('/api/acciones/:id/actividades/:tid', function (Peticion $req) {
    $a = cargar_accion($req);
    if (!puede_gestionar($a, $req->u)) falla(403, 'Sin permiso');
    if ($a['estado'] !== 'Análisis') falla(400, 'Solo se eliminan actividades en análisis');
    ejecutar('DELETE FROM actividades WHERE id = ? AND accion_id = ?', $req->p('tid'), $a['id']);
    return ['ok' => true];
});

// Flujo: Análisis → Ejecución → Verificación → Cerrada (o reabierta a Ejecución si no fue eficaz)
$R->post('/api/acciones/:id/avanzar', function (Peticion $req) {
    $a = cargar_accion($req); $u = $req->u; $b = $req->body;
    return transaccion(function () use ($a, $u, $b) {
        if ($a['estado'] === 'Análisis') {
            if (!puede_gestionar($a, $u)) falla(403, 'Sin permiso');
            if ($a['tipo'] !== 'Corrección' && txt($a['causa_raiz']) === '') falla(400, 'Registra la causa raíz antes de ejecutar');
            if (!$a['total_actividades']) falla(400, 'Planea al menos una actividad');
            ejecutar("UPDATE acciones SET estado = 'Ejecución' WHERE id = ?", $a['id']);
            bitacora_accion($a['id'], 'Plan aprobado: pasa a ejecución', $b['comentario'] ?? null, $u);
        } elseif ($a['estado'] === 'Ejecución') {
            if (!puede_gestionar($a, $u)) falla(403, 'Sin permiso');
            if ($a['actividades_cumplidas'] < $a['total_actividades']) falla(400, 'Faltan actividades por cumplir');
            ejecutar("UPDATE acciones SET estado = 'Verificación' WHERE id = ?", $a['id']);
            bitacora_accion($a['id'], 'Enviada a verificación de eficacia', $b['comentario'] ?? null, $u);
        } elseif ($a['estado'] === 'Verificación') {
            if (!es_calidad($u)) falla(403, 'Solo Calidad verifica la eficacia');
            if ($a['responsable_id'] === $u['id']) falla(403, 'El responsable de la acción no puede verificar su propia eficacia');
            if (txt($b['verificacion'] ?? '') === '') falla(400, 'Describe cómo se verificó la eficacia');
            if (!empty($b['eficaz'])) {
                ejecutar("UPDATE acciones SET estado = 'Cerrada', eficaz = 1, verificacion = ?, verificador_id = ?, fecha_cierre = ? WHERE id = ?", $b['verificacion'], $u['id'], hoy(), $a['id']);
                bitacora_accion($a['id'], 'Cerrada: eficaz', $b['verificacion'], $u);
            } else {
                ejecutar("UPDATE acciones SET estado = 'Ejecución', eficaz = 0, verificacion = ?, verificador_id = ?, reaperturas = reaperturas + 1 WHERE id = ?", $b['verificacion'], $u['id'], $a['id']);
                bitacora_accion($a['id'], 'No eficaz: reabierta a ejecución', $b['verificacion'], $u);
            }
        } else falla(400, 'La acción ya está cerrada');
        return ['ok' => true];
    });
});

// Estadísticas + valor sugerido para el indicador «Acciones correctivas»
$R->get('/api/acciones-estadisticas', function (Peticion $req) {
    $e = $req->u['empresa_id']; $anio = (int)$req->q('anio') ?: (int)date('Y');
    $restringido = propios($req->u) !== null;
    $acc = array_values(array_filter(array_map('con_vencida', todos(SELECT_ACC . ' WHERE a.empresa_id = ? AND substr(a.creado, 1, 4) = ?', $e, (string)$anio)),
        fn($a) => !$restringido || ve($a['proceso_id'], $req->u) || $a['responsable_id'] === $req->u['id']));
    $fp = filtro($req->u, 'p.id');
    $cerradas = array_filter($acc, fn($a) => $a['estado'] === 'Cerrada');
    $eficaces = count(array_filter($cerradas, fn($a) => $a['eficaz']));
    return [
        'anio' => $anio, 'total' => count($acc), 'abiertas' => count($acc) - count($cerradas), 'cerradas' => count($cerradas),
        'eficaces' => $eficaces, 'vencidas' => count(array_filter($acc, fn($a) => $a['vencida'])),
        'reaperturas' => array_sum(array_column($acc, 'reaperturas')),
        'eficacia' => $acc ? floor($eficaces / count($acc) * 10000 + 0.5) / 100 : null,
        'por_estado' => array_map(fn($s) => ['estado' => $s, 'n' => count(array_filter($acc, fn($a) => $a['estado'] === $s))], ['Análisis', 'Ejecución', 'Verificación', 'Cerrada']),
        'por_proceso' => todos("SELECT p.nombre, COUNT(h.id) hallazgos, CAST(SUM(h.tipo LIKE 'No conformidad%') AS SIGNED) nc FROM procesos p
          LEFT JOIN hallazgos h ON h.proceso_id = p.id AND substr(h.fecha, 1, 4) = ?
          WHERE p.empresa_id = ?{$fp['sql']} GROUP BY p.id HAVING hallazgos > 0 ORDER BY hallazgos DESC", (string)$anio, $e, ...$fp['params']),
    ];
});

// Pendientes para «Mi plan de trabajo»
$R->get('/api/auditorias-pendientes', function (Peticion $req) {
    $u = $req->u;
    return [
        'acciones' => array_values(array_filter(array_map('con_vencida', todos(SELECT_ACC . " WHERE a.empresa_id = ? AND a.estado != 'Cerrada'", $u['empresa_id'])),
            fn($a) => $a['responsable_id'] === $u['id'] || ($a['estado'] === 'Verificación' && es_calidad($u) && $a['responsable_id'] !== $u['id']))),
        'evaluaciones' => todos(SELECT_EVAL . " WHERE e.empresa_id = ? AND e.auditor_id = ? AND e.estado IN ('Planeación','Ejecución')", $u['empresa_id'], $u['id']),
    ];
});
