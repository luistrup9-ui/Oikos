<?php
// Indicadores, mediciones, cuadro de mando (BSC), planes de acción y reporte Seguimiento MOP (antes en indicadores.js)
declare(strict_types=1);
require_once __DIR__ . '/../xlsx.php';

const PERIODOS = ['Mensual' => 12, 'Bimestral' => 6, 'Trimestral' => 4, 'Semestral' => 2, 'Anual' => 1];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function etiqueta_periodo(string $frecuencia, int $p): string {
    if ($frecuencia === 'Mensual') return MESES[$p - 1];
    if ($frecuencia === 'Anual') return 'Año';
    return ['Bimestral' => 'B', 'Trimestral' => 'T', 'Semestral' => 'S'][$frecuencia] . $p;
}
// Último periodo ya cerrado del año (para saber qué mediciones están atrasadas)
function periodo_vencido(string $frecuencia, int $anio): int {
    $anioHoy = (int)date('Y');
    if ($anio < $anioHoy) return PERIODOS[$frecuencia];
    if ($anio > $anioHoy) return 0;
    return (int)floor(((int)date('n') - 1) / (12 / PERIODOS[$frecuencia])); // meses completos transcurridos
}
function anio_actual(): int { return (int)date('Y'); }
// Math.round de JavaScript a dos decimales
function redondear2(float $x): float { return floor($x * 100 + 0.5) / 100; }

// Semáforo y cumplimiento según el sentido del indicador
function evaluar($valor, $meta, ?string $sentido, $tolerancia): array {
    if ($valor === null || $meta === null) return ['semaforo' => 'sin_dato', 'cumplimiento' => null];
    $t = ($tolerancia ?? 10) / 100;
    if ($sentido === 'Descendente') {
        $semaforo = $valor <= $meta ? 'verde' : ($valor <= $meta * (1 + $t) ? 'amarillo' : 'rojo');
        $cumplimiento = $valor <= 0 ? 100 : $meta / $valor * 100;
    } else {
        $semaforo = $valor >= $meta ? 'verde' : ($valor >= $meta * (1 - $t) ? 'amarillo' : 'rojo');
        $cumplimiento = $meta == 0 ? ($valor >= 0 ? 100 : 0) : $valor / $meta * 100;
    }
    return ['semaforo' => $semaforo, 'cumplimiento' => max(0, min(100, $cumplimiento))];
}
// Mejor / Peor / Igual: el último valor frente a la medición previa
function tendencia(array $ind): ?string {
    if (($ind['ultimo']['valor'] ?? null) === null || ($ind['previo']['valor'] ?? null) === null) return null;
    $d = $ind['ultimo']['valor'] - $ind['previo']['valor'];
    if (!$d) return 'Igual';
    return ($ind['sentido'] === 'Descendente' ? $d < 0 : $d > 0) ? 'Mejor' : 'Peor';
}

// Enriquece un indicador con su serie del año, último valor, previo y semáforo
function con_datos(array $ind, int $anio): array {
    $meds = todos('SELECT * FROM mediciones WHERE indicador_id = ? ORDER BY anio, periodo', $ind['id']);
    $delAnio = array_filter($meds, fn($m) => $m['anio'] === $anio);
    $serie = [];
    for ($i = 1; $i <= PERIODOS[$ind['frecuencia']]; $i++) {
        $m = null; foreach ($delAnio as $x) if ($x['periodo'] === $i) { $m = $x; break; }
        $meta = $m['meta'] ?? $ind['meta'];
        $serie[] = ['periodo' => $i, 'etiqueta' => etiqueta_periodo($ind['frecuencia'], $i), 'valor' => $m ? $m['valor'] : null, 'meta' => $meta]
            + evaluar($m['valor'] ?? null, $meta, $ind['sentido'], $ind['tolerancia']);
    }
    $conValor = array_values(array_filter($meds, fn($m) => $m['anio'] <= $anio));
    $ultima = $conValor[count($conValor) - 1] ?? null; $previa = $conValor[count($conValor) - 2] ?? null;
    $vencido = periodo_vencido($ind['frecuencia'], $anio);
    $faltantes = array_values(array_map(fn($s) => $s['etiqueta'], array_filter($serie, fn($s) => $s['periodo'] <= $vencido && $s['valor'] === null)));
    $resumen = fn($x) => $x ? ['valor' => $x['valor'], 'anio' => $x['anio'], 'etiqueta' => etiqueta_periodo($ind['frecuencia'], $x['periodo'])] : null;
    return array_merge($ind, ['serie' => $serie, 'faltantes' => $faltantes, 'ultimo' => $resumen($ultima), 'previo' => $resumen($previa)],
        evaluar($ultima['valor'] ?? null, $ultima['meta'] ?? $ind['meta'], $ind['sentido'], $ind['tolerancia']));
}

const SELECT_IND = 'SELECT i.*, p.nombre proceso, p.categoria, p.orden proceso_orden, u.nombre responsable, o.codigo objetivo_codigo, o.nombre objetivo FROM indicadores i
  JOIN procesos p ON p.id = i.proceso_id LEFT JOIN usuarios u ON u.id = i.responsable_id LEFT JOIN objetivos o ON o.id = i.objetivo_id';
function puede_medir(array $ind, array $u): bool { return es_calidad($u) || $ind['responsable_id'] === $u['id'] || lidera($ind['proceso_id'], $u); }
function anio_de(Peticion $req): int { return (int)$req->q('anio') ?: anio_actual(); }

$R->get('/api/indicadores', function (Peticion $req) {
    $anio = anio_de($req);
    $w = ['i.empresa_id = ?']; $p = [$req->u['empresa_id']];
    if ($req->q('inactivos') !== '1') $w[] = 'i.activo = 1';
    $procs = lista($req->q('proceso'));
    if ($procs) { $w[] = 'i.proceso_id IN (' . marcas($procs) . ')'; array_push($p, ...$procs); }
    if ($req->q('texto')) { $w[] = '(i.nombre LIKE ? OR i.codigo LIKE ?)'; array_push($p, '%' . $req->q('texto') . '%', '%' . $req->q('texto') . '%'); }
    $fi = filtro($req->u, 'i.proceso_id'); // el Líder solo ve los indicadores de sus procesos
    $lista = array_map(fn($i) => con_datos($i, $anio), todos(SELECT_IND . ' WHERE ' . implode(' AND ', $w) . $fi['sql'] . ' ORDER BY p.orden, i.codigo', ...array_merge($p, $fi['params'])));
    $sem = lista($req->q('semaforo'));
    if ($sem) $lista = array_values(array_filter($lista, fn($i) => in_array($i['semaforo'], $sem, true)));
    return array_map(fn($i) => $i + ['puede_medir' => puede_medir($i, $req->u)], $lista);
});

$R->get('/api/indicadores/:id', function (Peticion $req) {
    $ind = uno(SELECT_IND . ' WHERE i.id = ? AND i.empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    if (!$ind || !ve($ind['proceso_id'], $req->u)) falla(404, 'Indicador no encontrado');
    $anio = anio_de($req);
    return con_datos($ind, $anio) + [
        'anio' => $anio, 'puede_medir' => puede_medir($ind, $req->u), 'puede_editar' => es_calidad($req->u),
        'anios' => array_map(fn($x) => $x['anio'], todos('SELECT DISTINCT anio FROM mediciones WHERE indicador_id = ? ORDER BY anio', $ind['id'])),
        'mediciones' => todos('SELECT m.*, u.nombre usuario FROM mediciones m LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE indicador_id = ? AND anio = ? ORDER BY periodo', $ind['id'], $anio),
        'planes' => todos('SELECT a.*, u.nombre responsable FROM planes_accion a LEFT JOIN usuarios u ON u.id = a.responsable_id WHERE a.indicador_id = ? ORDER BY a.id DESC', $ind['id']),
    ];
});

const CAMPOS_IND = ['proceso_id', 'objetivo_id', 'codigo', 'nombre', 'proposito', 'formula', 'calculo', 'unidad', 'frecuencia', 'sentido', 'meta', 'tolerancia', 'responsable_id', 'fuente', 'activo'];
function guardar_indicador(Peticion $req, $id = null): array {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad administra los indicadores');
    $b = $req->body + ['activo' => 1, 'tolerancia' => 10];
    if (txt($b['nombre'] ?? '') === '' || empty($b['proceso_id'])) falla(400, 'Nombre y proceso son obligatorios');
    if (($b['meta'] ?? '') === '' || $b['meta'] === null || !is_numeric($b['meta'])) falla(400, 'La meta debe ser un número');
    if (!isset(PERIODOS[$b['frecuencia'] ?? ''])) falla(400, 'Frecuencia inválida');
    if (empty($b['codigo'])) {
        $sigla = uno('SELECT sigla FROM procesos WHERE id = ?', $b['proceso_id'])['sigla'];
        $n = (int)uno('SELECT COUNT(*) n FROM indicadores WHERE codigo LIKE ?', "IND-$sigla-%")['n'] + 1;
        $b['codigo'] = "IND-$sigla-" . str_pad((string)$n, 2, '0', STR_PAD_LEFT);
    }
    $vals = array_map(fn($c) => $b[$c] ?? null, CAMPOS_IND);
    if ($id) {
        $actual = uno('SELECT frecuencia FROM indicadores WHERE id = ? AND empresa_id = ?', $id, $req->u['empresa_id']);
        if (!$actual) falla(404, 'Indicador no encontrado');
        if ($actual['frecuencia'] !== $b['frecuencia'] && uno('SELECT 1 FROM mediciones WHERE indicador_id = ?', $id))
            falla(400, 'No se puede cambiar la frecuencia de un indicador que ya tiene mediciones');
        ejecutar('UPDATE indicadores SET ' . implode(', ', array_map(fn($c) => "$c = ?", CAMPOS_IND)) . ' WHERE id = ?', ...array_merge($vals, [$id]));
        return ['id' => (int)$id];
    }
    return ['id' => ejecutar('INSERT INTO indicadores (empresa_id, ' . implode(', ', CAMPOS_IND) . ') VALUES (?' . str_repeat(', ?', count(CAMPOS_IND)) . ')', $req->u['empresa_id'], ...$vals)];
}
$R->post('/api/indicadores', fn(Peticion $req) => guardar_indicador($req));
$R->put('/api/indicadores/:id', fn(Peticion $req) => guardar_indicador($req, $req->p('id')));

// Registrar o corregir la medición de un periodo
$R->post('/api/indicadores/:id/mediciones', function (Peticion $req) {
    $ind = uno('SELECT * FROM indicadores WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']);
    if (!$ind) falla(404, 'Indicador no encontrado');
    if (!puede_medir($ind, $req->u)) falla(403, 'Solo el responsable, el líder del proceso o Calidad registran mediciones');
    $b = $req->body; $anio = (int)($b['anio'] ?? 0); $periodo = is_numeric($b['periodo'] ?? null) ? $b['periodo'] + 0 : 0;
    if (!$anio || !($periodo >= 1 && $periodo <= PERIODOS[$ind['frecuencia']])) falla(400, 'Periodo inválido para la frecuencia del indicador');
    if ($periodo > periodo_vencido($ind['frecuencia'], $anio) + 1) falla(400, 'Ese periodo todavía no ha transcurrido');
    $num = ($b['numerador'] ?? '') === '' ? null : (float)$b['numerador'];
    $den = ($b['denominador'] ?? '') === '' ? null : (float)$b['denominador'];
    if ($ind['calculo'] === 'razon') {
        if ($num === null || !$den) falla(400, 'Registra numerador y un denominador distinto de cero');
        $valor = redondear2($num / $den * ($ind['unidad'] === '%' ? 100 : 1));
    } else {
        if (($b['valor'] ?? '') === '' || !is_numeric($b['valor'])) falla(400, 'El valor debe ser un número');
        $valor = $b['valor'] + 0;
    }
    $ev = evaluar($valor, $ind['meta'], $ind['sentido'], $ind['tolerancia']);
    if ($ev['semaforo'] !== 'verde' && txt($b['analisis'] ?? '') === '') falla(400, 'El resultado no alcanza la meta: escribe el análisis de la causa');
    ejecutar('INSERT INTO mediciones (indicador_id, anio, periodo, numerador, denominador, valor, meta, analisis, usuario_id, fecha) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE numerador = VALUES(numerador), denominador = VALUES(denominador), valor = VALUES(valor), meta = VALUES(meta),
      analisis = VALUES(analisis), usuario_id = VALUES(usuario_id), fecha = VALUES(fecha)',
        $ind['id'], $anio, (int)$periodo, $num, $den, $valor, $ind['meta'], ($b['analisis'] ?? null) ?: null, $req->u['id'], ahora());
    return ['ok' => true, 'valor' => $valor] + $ev;
});

$R->delete('/api/indicadores/:id/mediciones/:mid', function (Peticion $req) {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad elimina mediciones');
    ejecutar('DELETE FROM mediciones WHERE id = ? AND indicador_id IN (SELECT id FROM indicadores WHERE id = ? AND empresa_id = ?)', $req->p('mid'), $req->p('id'), $req->u['empresa_id']);
    return ['ok' => true];
});

// ---------- Cuadro de mando ----------
function promedio(array $l) { $v = array_filter($l, fn($x) => $x !== null); return $v ? array_sum($v) / count($v) : null; }
$R->get('/api/bsc', function (Peticion $req) {
    $planes = todos('SELECT * FROM planes_estrategicos WHERE empresa_id = ? ORDER BY anio_inicio DESC', $req->u['empresa_id']);
    $plan = null; foreach ($planes as $x) if ($x['id'] === (int)$req->q('plan')) $plan = $x;
    $plan ??= $planes[0] ?? null;
    if (!$plan) return ['planes' => $planes, 'plan' => null, 'perspectivas' => []];
    $anio = (int)$req->q('anio') ?: min(max(anio_actual(), $plan['anio_inicio']), $plan['anio_fin']);
    $restringido = propios($req->u) !== null;
    $perspectivas = [];
    foreach (todos('SELECT * FROM perspectivas WHERE plan_id = ? ORDER BY orden', $plan['id']) as $per) {
        $objetivos = [];
        foreach (todos('SELECT o.*, u.nombre responsable FROM objetivos o LEFT JOIN usuarios u ON u.id = o.responsable_id WHERE perspectiva_id = ? ORDER BY codigo', $per['id']) as $o) {
            $inds = array_values(array_map(fn($i) => con_datos($i, $anio), array_filter(todos(SELECT_IND . ' WHERE i.objetivo_id = ? AND i.activo = 1 ORDER BY i.codigo', $o['id']), fn($i) => ve($i['proceso_id'], $req->u))));
            $pls = array_values(array_filter(todos('SELECT a.*, u.nombre responsable FROM planes_accion a LEFT JOIN usuarios u ON u.id = a.responsable_id WHERE a.objetivo_id = ? ORDER BY a.fecha_fin', $o['id']),
                fn($a) => !$restringido || $a['responsable_id'] === $req->u['id']));
            $cumplimiento = promedio(array_column($inds, 'cumplimiento'));
            if ($restringido && !$inds && !$pls) continue; // el Líder solo ve los objetivos donde tiene algo
            $objetivos[] = array_merge($o, ['indicadores' => $inds, 'planes' => $pls, 'cumplimiento' => $cumplimiento, 'avance_planes' => promedio(array_column($pls, 'avance'))],
                $cumplimiento === null ? ['semaforo' => 'sin_dato'] : evaluar($cumplimiento, 100, 'Ascendente', 10));
        }
        if ($restringido && !$objetivos) continue;
        $c = promedio(array_column($objetivos, 'cumplimiento'));
        $perspectivas[] = $per + ['objetivos' => $objetivos, 'cumplimiento' => $c, 'semaforo' => $c === null ? 'sin_dato' : evaluar($c, 100, 'Ascendente', 10)['semaforo']];
    }
    return ['planes' => $planes, 'plan' => $plan, 'anio' => $anio, 'perspectivas' => $perspectivas, 'cumplimiento' => promedio(array_column($perspectivas, 'cumplimiento'))];
});

// Estructura del plan (solo Calidad)
function solo_calidad_plan(Peticion $req): void { if (!es_calidad($req->u)) falla(403, 'Solo Calidad administra el plan estratégico'); }
$R->post('/api/planes-estrategicos', function (Peticion $req) {
    solo_calidad_plan($req);
    $b = $req->body;
    if (txt($b['nombre'] ?? '') === '' || empty($b['anio_inicio'])) falla(400, 'Nombre y año son obligatorios');
    return transaccion(function () use ($req, $b) {
        $id = ejecutar('INSERT INTO planes_estrategicos (empresa_id, nombre, anio_inicio, anio_fin) VALUES (?,?,?,?)',
            $req->u['empresa_id'], txt($b['nombre']), (int)$b['anio_inicio'], (int)(($b['anio_fin'] ?? null) ?: $b['anio_inicio']));
        foreach (['Financiera', 'Cliente', 'Procesos internos', 'Aprendizaje y crecimiento'] as $i => $n) ejecutar('INSERT INTO perspectivas (plan_id, nombre, orden) VALUES (?,?,?)', $id, $n, $i);
        return ['id' => $id];
    });
});
$R->post('/api/objetivos', function (Peticion $req) {
    solo_calidad_plan($req);
    $b = $req->body;
    if (txt($b['nombre'] ?? '') === '' || empty($b['perspectiva_id'])) falla(400, 'Nombre y perspectiva son obligatorios');
    if (!empty($b['id'])) {
        ejecutar('UPDATE objetivos SET perspectiva_id = ?, codigo = ?, nombre = ?, descripcion = ?, responsable_id = ? WHERE id = ?',
            $b['perspectiva_id'], $b['codigo'] ?? null, txt($b['nombre']), $b['descripcion'] ?? null, $b['responsable_id'] ?? null, $b['id']);
        return ['id' => (int)$b['id']];
    }
    return ['id' => ejecutar('INSERT INTO objetivos (perspectiva_id, codigo, nombre, descripcion, responsable_id) VALUES (?,?,?,?,?)',
        $b['perspectiva_id'], $b['codigo'] ?? null, txt($b['nombre']), $b['descripcion'] ?? null, $b['responsable_id'] ?? null)];
});
$R->delete('/api/objetivos/:id', function (Peticion $req) { solo_calidad_plan($req); ejecutar('DELETE FROM objetivos WHERE id = ?', $req->p('id')); return ['ok' => true]; });

// Planes de acción (de un objetivo, un indicador o un riesgo)
$R->post('/api/planes-accion', function (Peticion $req) {
    $b = $req->body;
    if (txt($b['nombre'] ?? '') === '') falla(400, 'El nombre es obligatorio');
    if (empty($b['objetivo_id']) && empty($b['indicador_id']) && empty($b['riesgo_id'])) falla(400, 'El plan debe asociarse a un objetivo, un indicador o un riesgo');
    $avance = max(0, min(100, is_numeric($b['avance'] ?? null) ? $b['avance'] + 0 : 0));
    $estado = $avance >= 100 ? 'Cerrado' : ($avance > 0 ? 'En curso' : 'Abierto');
    if (!empty($b['id'])) {
        $a = uno('SELECT * FROM planes_accion WHERE id = ? AND empresa_id = ?', $b['id'], $req->u['empresa_id']);
        if (!$a) falla(404, 'Plan no encontrado');
        if (!es_calidad($req->u) && $a['responsable_id'] !== $req->u['id']) falla(403, 'Solo el responsable o Calidad actualizan el plan');
        ejecutar('UPDATE planes_accion SET nombre = ?, responsable_id = ?, fecha_inicio = ?, fecha_fin = ?, avance = ?, estado = ?, observaciones = ? WHERE id = ?',
            txt($b['nombre']), $b['responsable_id'] ?? null, $b['fecha_inicio'] ?? null, $b['fecha_fin'] ?? null, $avance, $estado, $b['observaciones'] ?? null, $b['id']);
        return ['id' => (int)$b['id']];
    }
    if ($req->u['rol'] === 'consulta') falla(403, 'Los usuarios de consulta no crean planes');
    return ['id' => ejecutar('INSERT INTO planes_accion (empresa_id, objetivo_id, indicador_id, riesgo_id, nombre, responsable_id, fecha_inicio, fecha_fin, avance, estado, observaciones)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)', $req->u['empresa_id'], $b['objetivo_id'] ?? null, $b['indicador_id'] ?? null, $b['riesgo_id'] ?? null,
        txt($b['nombre']), ($b['responsable_id'] ?? null) ?: $req->u['id'], $b['fecha_inicio'] ?? null, $b['fecha_fin'] ?? null, $avance, $estado, $b['observaciones'] ?? null)];
});

// ---------- Reporte «Seguimiento al MOP»: exportación XLSX / CSV ----------
$R->get('/api/mop/exportar', function (Peticion $req) {
    $anio = anio_de($req);
    $formato = $req->q('formato') === 'csv' ? 'csv' : 'xlsx';
    $lista = array_map(fn($i) => con_datos($i, $anio), array_filter(todos(SELECT_IND . ' WHERE i.empresa_id = ? AND i.activo = 1 ORDER BY p.orden, i.codigo', $req->u['empresa_id']), fn($i) => ve($i['proceso_id'], $req->u)));
    $SEM = ['verde' => 'Cumple', 'amarillo' => 'En alerta', 'rojo' => 'No cumple', 'sin_dato' => 'Sin dato'];
    $encabezado = array_merge(['Categoría', 'Proceso', 'Código', 'Indicador', 'Frecuencia', 'Unidad', 'Sentido', 'Meta', 'Medición previa', 'Periodo previo', 'Último valor', 'Último periodo',
        'Tendencia', 'Semáforo', 'Cumplimiento %'], array_map(fn($m) => "$m $anio", MESES));
    $filas = [];
    foreach ($lista as $i) {
        // Cada periodo se ubica en el mes en que cierra (T1 → Mar, S2 → Dic, Año → Dic)
        $meses = array_fill(0, 12, null);
        foreach ($i['serie'] as $s) if ($s['valor'] !== null) $meses[(int)($s['periodo'] * 12 / PERIODOS[$i['frecuencia']] - 1)] = $s['valor'];
        $filas[] = array_merge([$i['categoria'], $i['proceso'], $i['codigo'], $i['nombre'], $i['frecuencia'], $i['unidad'], $i['sentido'], $i['meta'],
            $i['previo']['valor'] ?? null, $i['previo'] ? "{$i['previo']['etiqueta']} {$i['previo']['anio']}" : null,
            $i['ultimo']['valor'] ?? null, $i['ultimo'] ? "{$i['ultimo']['etiqueta']} {$i['ultimo']['anio']}" : null,
            tendencia($i), $SEM[$i['semaforo']], $i['cumplimiento'] === null ? null : floor($i['cumplimiento'] * 10 + 0.5) / 10], $meses);
    }
    $nombre = "seguimiento-mop-$anio.$formato";
    if ($formato === 'csv') enviar_archivo(csv(array_merge([$encabezado], array_map(fn($f) => array_map(fn($v) => is_int($v) || is_float($v) ? str_replace('.', ',', numero_js($v)) : $v, $f), $filas))), $nombre, 'text/csv; charset=utf-8');
    else enviar_archivo(xlsx('Seguimiento MOP', array_merge([$encabezado], $filas), array_merge([14, 30, 12, 42, 11, 8, 12, 8, 10, 11, 10, 11, 10, 11, 11], array_fill(0, 12, 9))), $nombre, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return null;
});

// Mediciones atrasadas para «Mi plan de trabajo»
$R->get('/api/indicadores-pendientes', function (Peticion $req) {
    $anio = anio_actual();
    $out = [];
    foreach (todos(SELECT_IND . ' WHERE i.empresa_id = ? AND i.activo = 1', $req->u['empresa_id']) as $i) {
        if (!(puede_medir($i, $req->u) && (($req->u['rol'] !== 'admin' && $req->u['rol'] !== 'lider_calidad') ? true : $i['responsable_id'] === $req->u['id']))) continue;
        $c = con_datos($i, $anio);
        if ($c['faltantes']) $out[] = $c;
    }
    return $out;
});
