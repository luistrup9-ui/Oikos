<?php
// Calendario de actividades de «Personal»: reúne lo que tiene fecha y le corresponde a la persona, ya sea porque se lo asignaron
// (responsable, integrante, asistente, auditor) o porque es de su proceso (indicadores y vencimiento de documentos).
// No guarda nada: se arma al consultar (antes en calendario.js).
declare(strict_types=1);

const MAX_DIAS = 100; // un mes visible cabe de sobra; evita consultas gigantes
function es_fecha($v): bool { return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', (string)($v ?? ''), $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]); }
function etiqueta_cal(string $frecuencia, int $p): string {
    return $frecuencia === 'Mensual' ? MESES[$p - 1] : ($frecuencia === 'Anual' ? 'Año' : (['Bimestral' => 'B', 'Trimestral' => 'T', 'Semestral' => 'S'][$frecuencia] ?? 'P') . $p);
}

$R->get('/api/calendario', function (Peticion $req) {
    $desde = $req->q('desde'); $hasta = $req->q('hasta'); $u = $req->u;
    if (!es_fecha($desde) || !es_fecha($hasta) || $desde > $hasta) falla(400, 'El rango de fechas no es válido');
    if ((strtotime("$hasta UTC") - strtotime("$desde UTC")) / 86400 > MAX_DIAS) falla(400, 'El rango no puede pasar de ' . MAX_DIAS . ' días');
    $hoy = gmdate('Y-m-d'); $eventos = [];
    // Una reunión pasada no está «vencida»
    $agregar = function (array $e) use (&$eventos, $hoy) { $eventos[] = array_merge(['hora_inicio' => null, 'hora_fin' => null, 'detalle' => ''], $e, ['vencida' => !$e['terminada'] && $e['fecha'] < $hoy && $e['tipo'] !== 'reunion']); };
    $procs = asignados($u); $P = $procs ?: [-1]; $M = marcas($P); // -1 no coincide con ningún proceso: sin proceso no se recibe lo «de su proceso»

    // 1) Reuniones de los mecanismos de integración donde la persona es integrante o asistente
    foreach (todos("SELECT a.id, a.codigo, a.fecha, a.hora_inicio, a.hora_fin, a.estado, m.nombre mecanismo FROM actas a JOIN mecanismos m ON m.id = a.mecanismo_id
       WHERE m.empresa_id = ? AND a.fecha BETWEEN ? AND ? AND a.estado <> 'Anulada'
         AND (EXISTS (SELECT 1 FROM mecanismo_integrantes i WHERE i.mecanismo_id = m.id AND i.usuario_id = ?) OR EXISTS (SELECT 1 FROM acta_asistentes s WHERE s.acta_id = a.id AND s.usuario_id = ?))",
        $u['empresa_id'], $desde, $hasta, $u['id'], $u['id']) as $a)
        $agregar(['tipo' => 'reunion', 'titulo' => $a['mecanismo'], 'detalle' => $a['codigo'], 'fecha' => $a['fecha'], 'hora_inicio' => $a['hora_inicio'], 'hora_fin' => $a['hora_fin'],
            'terminada' => $a['estado'] === 'Cerrada', 'enlace' => "#/acta/{$a['id']}"]);

    // 2) Compromisos de las actas de los que la persona es responsable
    foreach (todos('SELECT c.id, c.nombre, c.fecha_fin fecha, c.avance, c.fecha_terminacion, a.codigo acta, m.nombre mecanismo
        FROM compromisos c JOIN compromiso_responsables cr ON cr.compromiso_id = c.id AND cr.usuario_id = ?
        LEFT JOIN actas a ON a.id = c.acta_id LEFT JOIN mecanismos m ON m.id = c.mecanismo_id WHERE c.fecha_fin BETWEEN ? AND ?', $u['id'], $desde, $hasta) as $c)
        $agregar(['tipo' => 'compromiso', 'titulo' => $c['nombre'], 'detalle' => implode(' · ', array_filter([$c['mecanismo'], $c['acta']])), 'fecha' => $c['fecha'],
            'terminada' => $c['avance'] >= 100 || (bool)$c['fecha_terminacion'], 'enlace' => "#/compromiso/{$c['id']}"]);

    // 3) Actividades de las acciones correctivas y de mejora asignadas a la persona
    foreach (todos('SELECT t.id, t.descripcion, t.fecha, t.cumplida, t.accion_id, ac.codigo FROM actividades t JOIN acciones ac ON ac.id = t.accion_id
       WHERE ac.empresa_id = ? AND t.responsable_id = ? AND t.fecha BETWEEN ? AND ?', $u['empresa_id'], $u['id'], $desde, $hasta) as $t)
        $agregar(['tipo' => 'actividad', 'titulo' => $t['descripcion'], 'detalle' => $t['codigo'], 'fecha' => $t['fecha'], 'terminada' => (bool)$t['cumplida'], 'enlace' => "#/accion/{$t['accion_id']}"]);

    // 4) Fecha compromiso de las acciones de las que la persona es responsable o verificadora
    foreach (todos('SELECT id, codigo, correccion, fecha_compromiso fecha, estado FROM acciones
       WHERE empresa_id = ? AND (responsable_id = ? OR verificador_id = ?) AND fecha_compromiso BETWEEN ? AND ?', $u['empresa_id'], $u['id'], $u['id'], $desde, $hasta) as $a)
        $agregar(['tipo' => 'accion', 'titulo' => "Fecha compromiso de {$a['codigo']}", 'detalle' => $a['correccion'] ?: '', 'fecha' => $a['fecha'], 'terminada' => $a['estado'] === 'Cerrada', 'enlace' => "#/accion/{$a['id']}"]);

    // 5) Planes de acción: fin del plan
    foreach (todos('SELECT id, nombre, fecha_fin fecha, avance, indicador_id FROM planes_accion WHERE empresa_id = ? AND responsable_id = ? AND fecha_fin BETWEEN ? AND ?',
        $u['empresa_id'], $u['id'], $desde, $hasta) as $p)
        $agregar(['tipo' => 'plan', 'titulo' => "Plan de acción: {$p['nombre']}", 'fecha' => $p['fecha'], 'terminada' => $p['avance'] >= 100,
            'enlace' => $p['indicador_id'] ? "#/indicador/{$p['indicador_id']}" : '#/tablero']);

    // 6) Evaluaciones: como auditor (inicio y fin) o por la agenda de los procesos que audita o que le toca atender
    foreach (todos('SELECT id, codigo, nombre, fecha_inicio, fecha_fin, estado FROM evaluaciones WHERE empresa_id = ? AND auditor_id = ? AND (fecha_inicio BETWEEN ? AND ? OR fecha_fin BETWEEN ? AND ?)',
        $u['empresa_id'], $u['id'], $desde, $hasta, $desde, $hasta) as $e) {
        $base = ['tipo' => 'evaluacion', 'detalle' => $e['codigo'], 'terminada' => $e['estado'] === 'Terminada', 'enlace' => "#/auditoria/{$e['id']}"];
        if ($e['fecha_inicio'] >= $desde && $e['fecha_inicio'] <= $hasta) $agregar($base + ['titulo' => "Inicia: {$e['nombre']}", 'fecha' => $e['fecha_inicio']]);
        if ($e['fecha_fin'] >= $desde && $e['fecha_fin'] <= $hasta) $agregar($base + ['titulo' => "Termina: {$e['nombre']}", 'fecha' => $e['fecha_fin']]);
    }
    foreach (todos("SELECT ep.fecha, e.id, e.codigo, e.nombre, e.estado, p.nombre proceso FROM evaluacion_procesos ep JOIN evaluaciones e ON e.id = ep.evaluacion_id JOIN procesos p ON p.id = ep.proceso_id
       WHERE e.empresa_id = ? AND ep.fecha BETWEEN ? AND ? AND (ep.auditado_id = ? OR ep.proceso_id IN ($M) OR e.auditor_id = ?)", $u['empresa_id'], $desde, $hasta, $u['id'], ...array_merge($P, [$u['id']])) as $x)
        $agregar(['tipo' => 'evaluacion', 'titulo' => "{$x['nombre']}: {$x['proceso']}", 'detalle' => $x['codigo'], 'fecha' => $x['fecha'], 'terminada' => $x['estado'] === 'Terminada', 'enlace' => "#/auditoria/{$x['id']}"]);

    // 7) Vencimiento de los documentos vigentes que son de la persona o de su proceso
    foreach (todos("SELECT id, codigo, nombre, fecha_vencimiento fecha FROM documentos WHERE empresa_id = ? AND estado = 'VIGENTE' AND fecha_vencimiento BETWEEN ? AND ? AND (responsable_id = ? OR proceso_id IN ($M))",
        $u['empresa_id'], $desde, $hasta, $u['id'], ...$P) as $d)
        $agregar(['tipo' => 'vencimiento', 'titulo' => "Vence: {$d['nombre']}", 'detalle' => $d['codigo'], 'fecha' => $d['fecha'], 'terminada' => false, 'enlace' => "#/documento/{$d['id']}"]);

    // 8) Mediciones de indicadores: cada periodo se ubica en el último día del mes en que cierra
    $anios = range((int)substr($desde, 0, 4), (int)substr($hasta, 0, 4));
    foreach (todos("SELECT id, codigo, nombre, frecuencia FROM indicadores WHERE empresa_id = ? AND activo = 1 AND (responsable_id = ? OR proceso_id IN ($M))", $u['empresa_id'], $u['id'], ...$P) as $i) {
        $n = PERIODOS[$i['frecuencia']] ?? 0; if (!$n) continue;
        foreach ($anios as $anio) {
            $medidos = array_column(todos('SELECT periodo FROM mediciones WHERE indicador_id = ? AND anio = ? AND valor IS NOT NULL', $i['id'], $anio), 'periodo');
            for ($p = 1; $p <= $n; $p++) {
                $fecha = gmdate('Y-m-t', gmmktime(0, 0, 0, intdiv($p * 12, $n), 1, $anio));
                if ($fecha >= $desde && $fecha <= $hasta) $agregar(['tipo' => 'medicion', 'titulo' => "Medir: {$i['nombre']} (" . etiqueta_cal($i['frecuencia'], $p) . ')', 'detalle' => $i['codigo'],
                    'fecha' => $fecha, 'terminada' => in_array($p, $medidos, true), 'enlace' => "#/indicador/{$i['id']}"]);
            }
        }
    }
    usort($eventos, fn($a, $b) => strcmp($a['fecha'], $b['fecha']) ?: strcmp((string)($a['hora_inicio'] ?: '99'), (string)($b['hora_inicio'] ?: '99')) ?: strcmp(norm($a['titulo']), norm($b['titulo'])));
    return $eventos;
});
