<?php
// Vistas de la matriz de riesgos que piden datos propios: el plan de acción de los riesgos, con sus fechas planeadas y ejecutadas y su balance.
// (La torta por zona, la tabla absoluto vs residual y la exposición se arman en el navegador con la misma lista de /api/riesgos.)
declare(strict_types=1);

// Las fechas planeadas se guardan como texto: 'AAAA-MM-DD' al comienzo → ese día; si no hay una fecha, null
function dia_plan($v): ?string { return preg_match('/^\d{4}-\d{2}-\d{2}/', (string)$v) ? substr((string)$v, 0, 10) : null; }
function marca_dia(string $d): int { return gmmktime(0, 0, 0, (int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4)); }

// Avance que el plan debería llevar en ese día según sus fechas planeadas: 0 % antes del inicio, 100 % desde el fin y, entre las dos,
// lo que va del tiempo (en línea recta). null si le falta una de las dos fechas o el fin queda antes del inicio.
function avance_planeado(?string $inicio, ?string $fin, string $dia): ?float {
    if (!$inicio || !$fin || $fin < $inicio) return null;
    if ($dia >= $fin) return 100.0;
    if ($dia <= $inicio) return 0.0;
    return round((marca_dia($dia) - marca_dia($inicio)) / (marca_dia($fin) - marca_dia($inicio)) * 100, 1);
}

// Plan de acción de la matriz: los planes de los riesgos que cumplen los mismos filtros de /api/riesgos (proceso, tipo, texto y zona).
// Planeado = fecha_inicio y fecha_fin; Ejecutado = fecha_inicio_real y fecha_fin_real. Balance = avance real menos el avance planeado de hoy (puntos de %);
// negativo es atraso respecto al plan y positivo, adelanto.
$R->get('/api/riesgos-planes', function (Peticion $req) {
    $riesgos = array_column(riesgos_filtrados($req), null, 'id');
    if (!$riesgos) return [];
    $dia = substr(ahora(), 0, 10); // hoy, en UTC como el resto del sistema
    $filas = [];
    foreach (todos('SELECT a.id, a.riesgo_id, a.nombre, u.nombre responsable, a.estado, a.avance, a.fecha_inicio, a.fecha_fin, a.fecha_inicio_real, a.fecha_fin_real
        FROM planes_accion a LEFT JOIN usuarios u ON u.id = a.responsable_id
        WHERE a.empresa_id = ? AND a.riesgo_id IN (' . marcas(array_keys($riesgos)) . ') ORDER BY a.id', $req->u['empresa_id'], ...array_keys($riesgos)) as $a) {
        $r = $riesgos[$a['riesgo_id']];
        $avance = (float)$a['avance'];
        $planeado = avance_planeado(dia_plan($a['fecha_inicio']), dia_plan($a['fecha_fin']), $dia);
        $filas[] = ['id' => (int)$a['id'], 'riesgo_id' => (int)$r['id'], 'proceso' => $r['proceso'], 'proceso_orden' => (int)$r['proceso_orden'], 'riesgo_codigo' => $r['codigo'], 'riesgo' => $r['nombre'],
            'actividad' => $a['nombre'], 'responsable' => $a['responsable'], 'estado' => $a['estado'], 'avance' => $avance,
            'avance_planeado' => $planeado, 'balance' => $planeado === null ? null : round($avance - $planeado, 1),
            'planeado_inicio' => dia_plan($a['fecha_inicio']), 'planeado_fin' => dia_plan($a['fecha_fin']),
            'ejecutado_inicio' => $a['fecha_inicio_real'], 'ejecutado_fin' => $a['fecha_fin_real']];
    }
    usort($filas, fn($x, $y) => [$x['proceso_orden'], $x['riesgo_codigo'], $x['id']] <=> [$y['proceso_orden'], $y['riesgo_codigo'], $y['id']]);
    return $filas;
});
