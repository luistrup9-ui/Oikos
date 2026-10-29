<?php
// Mecanismos de integración (comités, comités primarios y reuniones): configuración e integrantes, actas (planeación, desarrollo,
// compromisos), compromisos con seguimientos y reprogramaciones, arrastre de compromisos abiertos y estadísticas (antes en mecanismos.js)
declare(strict_types=1);
require_once __DIR__ . '/../xlsx.php';

const TIPOS_MEC = ['Comité', 'Comité Primario', 'Reunión'];
const PERIODICIDADES = ['Anual', 'Bimestral', 'Eventual', 'Mensual', 'Quincenal', 'Semanal', 'Semestral', 'Trimestral'];
const OPCIONES_MEC = ['indicar_lugar', 'mostrar_tipo', 'indicar_asistentes', 'control_asistencia', 'tiene_compromisos', 'control_compromisos',
    'arrastrar_compromisos', 'miembros_compromisos', 'notificar_cierre'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Verdad como en JavaScript: "0" y "no" son verdaderos; solo null, false, 0 y "" son falsos
function js_verdad($v): bool { return !($v === null || $v === false || $v === 0 || $v === 0.0 || $v === ''); }
function hoy_mec(): string { return substr(ahora(), 0, 10); }
function dias_entre(string $a, string $b): int { return (int)round((strtotime($a . ' UTC') - strtotime($b . ' UTC')) / 86400); }
function prom_lista(array $l) { return $l ? array_sum($l) / count($l) : null; }

// ---------- Permisos ----------
function integrante_de(array $m, array $u): ?array { return uno('SELECT * FROM mecanismo_integrantes WHERE mecanismo_id = ? AND usuario_id = ?', $m['id'], $u['id']); }
function administra(array $m, array $u): bool { return es_calidad($u) || ($m['coordinador_id'] ?? null) === $u['id'] || str_contains((string)(integrante_de($m, $u)['privilegio'] ?? ''), 'Administrador'); }
function puede_actas(array $m, array $u): bool { return administra($m, $u) || (bool)(integrante_de($m, $u)['adiciona_actas'] ?? 0); }
function puede_compromisos(array $m, array $u): bool { return administra($m, $u) || ($m['miembros_compromisos'] && integrante_de($m, $u)); }
// Solo ve los mecanismos de los que hace parte (o que coordina); Calidad y administración ven todos
function ve_mecanismo(array $m, array $u): bool {
    return es_calidad($u) || (bool)integrante_de($m, $u) || ($m['coordinador_id'] ?? uno('SELECT coordinador_id FROM mecanismos WHERE id = ?', $m['id'])['coordinador_id'] ?? null) === $u['id'];
}
function asistente_de(array $acta, array $u): bool { return (bool)uno('SELECT 1 FROM acta_asistentes WHERE acta_id = ? AND usuario_id = ?', $acta['id'], $u['id']); }
function responsable_de(array $c, array $u): bool { return (bool)uno('SELECT 1 FROM compromiso_responsables WHERE compromiso_id = ? AND usuario_id = ?', $c['id'], $u['id']); }

function cargar_mecanismo($id, array $u, bool $tieneAcceso = false): array {
    $m = uno('SELECT * FROM mecanismos WHERE id = ? AND empresa_id = ?', $id, $u['empresa_id']);
    if (!$m) falla(404, 'Mecanismo no encontrado');
    if (!$tieneAcceso && !ve_mecanismo($m, $u)) falla(403, 'No haces parte de este mecanismo');
    return $m;
}
function cargar_acta($id, array $u): array {
    $a = uno('SELECT * FROM actas WHERE id = ?', $id);
    if (!$a) falla(404, 'Acta no encontrada');
    return [$a, cargar_mecanismo($a['mecanismo_id'], $u, asistente_de($a, $u))]; // quien está convocado al acta la ve
}
function cargar_compromiso($id, array $u): array {
    $c = uno('SELECT * FROM compromisos WHERE id = ?', $id);
    if (!$c) falla(404, 'Compromiso no encontrado');
    return [$c, cargar_mecanismo($c['mecanismo_id'], $u, responsable_de($c, $u))]; // quien es responsable del compromiso lo ve
}
function editable_acta(?array $a): void { if ($a['estado'] !== 'Abierta') falla(400, 'El acta está ' . mb_strtolower($a['estado']) . ': reábrela para modificarla'); }

// ---------- Compromisos: estado, días y avance ----------
const SELECT_COMP = "SELECT c.*, a.codigo acta_codigo, a.fecha acta_fecha, m.nombre mecanismo, m.tipo mecanismo_tipo,
    (SELECT GROUP_CONCAT(u.nombre ORDER BY r.usuario_id SEPARATOR ', ') FROM compromiso_responsables r JOIN usuarios u ON u.id = r.usuario_id WHERE r.compromiso_id = c.id) responsables,
    (SELECT GROUP_CONCAT(r.usuario_id ORDER BY r.usuario_id) FROM compromiso_responsables r WHERE r.compromiso_id = c.id) responsables_ids,
    (SELECT COUNT(*) FROM compromiso_seguimientos s WHERE s.compromiso_id = c.id) n_seguimientos
  FROM compromisos c JOIN actas a ON a.id = c.acta_id JOIN mecanismos m ON m.id = c.mecanismo_id";
function con_estado(array $c): array {
    $estado = $c['fecha_terminacion'] ? 'Terminada' : ($c['n_seguimientos'] ? 'Ejecución' : 'Planeación');
    // Días: terminado → días de adelanto (+) o atraso (−) frente a la fecha fin; abierto y vencido → días de atraso (−)
    $d = $c['fecha_terminacion'] ? dias_entre($c['fecha_fin'], $c['fecha_terminacion']) : (hoy_mec() > $c['fecha_fin'] ? -dias_entre(hoy_mec(), $c['fecha_fin']) : 0);
    return array_merge($c, ['estado' => $estado, 'dias' => $d, 'vencido' => !$c['fecha_terminacion'] && hoy_mec() > $c['fecha_fin'],
        'responsables_ids' => array_map('intval', array_values(array_filter(explode(',', (string)($c['responsables_ids'] ?? '')), fn($x) => $x !== '')))]);
}
// Compromisos que muestra un acta: los suyos y, si el mecanismo arrastra, los abiertos de actas anteriores
function compromisos_de_acta(array $a, array $m): array {
    $propios = array_map('con_estado', todos(SELECT_COMP . ' WHERE c.acta_id = ? ORDER BY c.numero', $a['id']));
    $arrastrados = $m['arrastrar_compromisos'] ? array_map(fn($c) => con_estado($c) + ['arrastrado' => true], todos(SELECT_COMP . " WHERE c.mecanismo_id = ? AND a.estado != 'Anulada'
      AND (a.fecha < ? OR (a.fecha = ? AND a.id < ?)) AND (c.fecha_terminacion IS NULL OR c.fecha_terminacion >= ?) ORDER BY a.fecha, c.numero", $m['id'], $a['fecha'], $a['fecha'], $a['id'], $a['fecha'])) : [];
    $lista = array_merge($propios, $arrastrados);
    return [$lista, prom_lista(array_column($lista, 'avance'))];
}
// Estadísticas de un mecanismo
function estadisticas_mec(int $mecanismoId): array {
    $actas = todos("SELECT id FROM actas WHERE mecanismo_id = ? AND estado != 'Anulada'", $mecanismoId);
    $comp = todos("SELECT c.fecha_fin, c.fecha_terminacion FROM compromisos c JOIN actas a ON a.id = c.acta_id WHERE c.mecanismo_id = ? AND a.estado != 'Anulada'", $mecanismoId);
    $asis = uno("SELECT COUNT(*) invitados, CAST(COALESCE(SUM(asiste), 0) AS SIGNED) asistentes FROM acta_asistentes s JOIN actas a ON a.id = s.acta_id
      WHERE a.mecanismo_id = ? AND a.estado != 'Anulada'", $mecanismoId);
    $cerradas = count(array_filter($comp, fn($c) => $c['fecha_terminacion']));
    $aTiempo = count(array_filter($comp, fn($c) => $c['fecha_terminacion'] && $c['fecha_terminacion'] <= $c['fecha_fin']));
    return ['actas' => count($actas), 'actividades' => count($comp), 'cerradas' => $cerradas, 'a_tiempo' => $aTiempo,
        'cumplimiento' => $comp ? $cerradas / count($comp) * 100 : null,
        'invitados' => $asis['invitados'], 'asistentes' => $asis['asistentes'], 'asistencia' => $asis['invitados'] ? $asis['asistentes'] / $asis['invitados'] * 100 : null];
}
function resumen_acta(array $a): array {
    $comp = todos('SELECT avance, fecha_terminacion FROM compromisos WHERE acta_id = ?', $a['id']);
    $asis = uno('SELECT COUNT(*) invitados, CAST(COALESCE(SUM(asiste), 0) AS SIGNED) asistentes FROM acta_asistentes WHERE acta_id = ?', $a['id']);
    return array_merge($a, ['compromisos' => count($comp), 'asistencia' => $asis['invitados'] ? $asis['asistentes'] / $asis['invitados'] * 100 : null,
        'cumplimiento' => $comp ? count(array_filter($comp, fn($c) => $c['fecha_terminacion'])) / count($comp) * 100 : null]);
}

// ---------- Mecanismos ----------
const SELECT_MEC = "SELECT m.*, u.nombre coordinador, u.cargo coordinador_cargo,
    (SELECT COUNT(*) FROM actas a WHERE a.mecanismo_id = m.id AND a.estado != 'Anulada') n_actas FROM mecanismos m LEFT JOIN usuarios u ON u.id = m.coordinador_id";
function integrantes_de(int $id): array {
    return todos('SELECT i.*, u.nombre, u.cargo, u.usuario FROM mecanismo_integrantes i JOIN usuarios u ON u.id = i.usuario_id WHERE i.mecanismo_id = ? ORDER BY i.calidad, u.nombre', $id);
}

$R->get('/api/mecanismos', function (Peticion $req) {
    $w = ['m.empresa_id = ?']; $p = [$req->u['empresa_id']];
    $tipos = lista($req->q('tipo'));
    if ($tipos) { $w[] = 'm.tipo IN (' . marcas($tipos) . ')'; array_push($p, ...$tipos); }
    if ($req->q('estado') === 'activo') $w[] = 'm.activo = 1'; elseif ($req->q('estado') === 'inactivo') $w[] = 'm.activo = 0';
    if ($req->q('mios') === '1') { $w[] = '(m.coordinador_id = ? OR EXISTS (SELECT 1 FROM mecanismo_integrantes i WHERE i.mecanismo_id = m.id AND i.usuario_id = ?))'; array_push($p, $req->u['id'], $req->u['id']); }
    $out = [];
    foreach (todos(SELECT_MEC . ' WHERE ' . implode(' AND ', $w) . " ORDER BY CASE m.tipo WHEN 'Comité' THEN 0 WHEN 'Comité Primario' THEN 1 ELSE 2 END, m.nombre", ...$p) as $m)
        if (ve_mecanismo($m, $req->u)) $out[] = $m + ['integrantes' => integrantes_de($m['id']), 'estadisticas' => estadisticas_mec($m['id']), 'administra' => administra($m, $req->u)];
    return $out;
});

$R->get('/api/mecanismos/:id', function (Peticion $req) {
    $m = cargar_mecanismo($req->p('id'), $req->u);
    $anio = $req->q('anio');
    $actas = array_map('resumen_acta', todos('SELECT a.*, u.usuario autor_usuario, u.nombre autor FROM actas a LEFT JOIN usuarios u ON u.id = a.autor_id
      WHERE a.mecanismo_id = ? ' . ($anio ? 'AND substr(a.fecha, 1, 4) = ?' : '') . ' ORDER BY a.fecha DESC, a.id DESC', ...($anio ? [$m['id'], $anio] : [$m['id']])));
    $anios = array_column(todos('SELECT DISTINCT substr(fecha, 1, 4) anio FROM actas WHERE mecanismo_id = ? ORDER BY anio DESC', $m['id']), 'anio');
    // Estadísticas por sesión, para las gráficas de la pestaña Estadísticas
    $sesiones = array_map(fn($a) => ['codigo' => $a['codigo'], 'fecha' => $a['fecha'], 'asistencia' => $a['asistencia'], 'cumplimiento' => $a['cumplimiento'], 'compromisos' => $a['compromisos']],
        array_map('resumen_acta', todos("SELECT * FROM actas WHERE mecanismo_id = ? AND estado != 'Anulada' ORDER BY fecha", $m['id'])));
    return $m + ['integrantes' => integrantes_de($m['id']), 'actas' => $actas, 'anios' => $anios, 'sesiones' => $sesiones, 'estadisticas' => estadisticas_mec($m['id']),
        'permisos' => ['administra' => administra($m, $req->u), 'actas' => puede_actas($m, $req->u), 'compromisos' => puede_compromisos($m, $req->u)]];
});

function guardar_mecanismo(Peticion $req, ?int $id = null): array {
    $b = $req->body; $actual = null;
    if ($id) { $actual = cargar_mecanismo($id, $req->u); if (!administra($actual, $req->u)) falla(403, 'Solo los administradores del mecanismo lo modifican'); }
    elseif (!es_calidad($req->u)) falla(403, 'Solo Calidad crea mecanismos de integración');
    if (!in_array($b['tipo'] ?? null, TIPOS_MEC, true)) falla(400, 'Tipo no válido');
    if (txt($b['nombre'] ?? '') === '') falla(400, 'El nombre es obligatorio');
    if (!empty($b['periodicidad']) && !in_array($b['periodicidad'], PERIODICIDADES, true)) falla(400, 'Periodicidad no válida');
    $campos = ['tipo', 'nombre', 'coordinador_id', 'periodicidad', 'objetivo', 'miembros', 'funciones', 'codificacion', 'patron', 'padding', 'dias_recordatorio'];
    $vals = [$b['tipo'], txt($b['nombre']), $b['coordinador_id'] ?? null, $b['periodicidad'] ?? null, $b['objetivo'] ?? null, $b['miembros'] ?? null, $b['funciones'] ?? null,
        ($b['codificacion'] ?? null) === 'Manual' ? 'Manual' : 'Auto', ($b['patron'] ?? null) ?: '%C', (int)($b['padding'] ?? 3), (int)($b['dias_recordatorio'] ?? 1)];
    // Una opción que no llega conserva su valor (o el de por defecto, 1, al crear)
    $ops = array_map(fn($o) => !array_key_exists($o, $b) ? ($actual ? $actual[$o] : 1) : (js_verdad($b[$o]) ? 1 : 0), OPCIONES_MEC);
    $activo = !array_key_exists('activo', $b) ? ($actual ? $actual['activo'] : 1) : (js_verdad($b['activo']) ? 1 : 0);
    $todasCols = array_merge($campos, OPCIONES_MEC, ['activo']);
    return transaccion(function () use ($id, $b, $vals, $ops, $activo, $todasCols, $req) {
        if ($id) ejecutar('UPDATE mecanismos SET ' . implode(', ', array_map(fn($c) => "$c = ?", $todasCols)) . ' WHERE id = ?', ...array_merge($vals, $ops, [$activo, $id]));
        else $id = ejecutar('INSERT INTO mecanismos (empresa_id, ' . implode(', ', $todasCols) . ') VALUES (?' . str_repeat(', ?', count($todasCols)) . ')', $req->u['empresa_id'], ...array_merge($vals, $ops, [$activo]));
        if (isset($b['integrantes']) && is_array($b['integrantes'])) {
            ejecutar('DELETE FROM mecanismo_integrantes WHERE mecanismo_id = ?', $id);
            foreach ($b['integrantes'] as $i) {
                if (!uno('SELECT 1 FROM usuarios WHERE id = ? AND empresa_id = ?', $i['usuario_id'] ?? null, $req->u['empresa_id'])) continue;
                ejecutar('REPLACE INTO mecanismo_integrantes (mecanismo_id, usuario_id, calidad, privilegio, adiciona_actas) VALUES (?,?,?,?,?)',
                    $id, $i['usuario_id'], ($i['calidad'] ?? null) === 'Suplente' ? 'Suplente' : 'Principal',
                    in_array($i['privilegio'] ?? null, ['Administrador', 'Administrador - Miembro'], true) ? $i['privilegio'] : 'Miembro', js_verdad($i['adiciona_actas'] ?? null) ? 1 : 0);
            }
        }
        return ['id' => (int)$id];
    });
}
$R->post('/api/mecanismos', fn(Peticion $req) => guardar_mecanismo($req));
$R->put('/api/mecanismos/:id', fn(Peticion $req) => guardar_mecanismo($req, (int)$req->p('id')));

// ---------- Actas ----------
function reemplazar_primero(string $de, string $a, string $texto): string { $i = strpos($texto, $de); return $i === false ? $texto : substr_replace($texto, $a, $i, strlen($de)); }
function codigo_acta(array $m, int $consecutivo, string $fecha): string {
    [$y, $mes] = explode('-', $fecha);
    $c = reemplazar_primero('%C', str_pad((string)$consecutivo, (int)($m['padding'] ?: 0), '0', STR_PAD_LEFT), $m['patron'] ?: '%C');
    return reemplazar_primero('%M', MESES_LARGOS[(int)$mes - 1], reemplazar_primero('%Y', $y, $c));
}
function validar_acta(array $b, array $m): void {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['fecha'] ?? ''))) falla(400, 'La fecha del acta es obligatoria');
    if (!empty($b['hora_inicio']) && !empty($b['hora_fin']) && $b['hora_fin'] < $b['hora_inicio']) falla(400, 'La hora de fin es anterior a la de inicio');
    if ($m['codificacion'] === 'Manual' && txt($b['codigo'] ?? '') === '') falla(400, 'Este mecanismo usa codificación manual: escribe el código del acta');
}
function guardar_asistentes(int $actaId, $lista, int $empresaId): void {
    ejecutar('DELETE FROM acta_asistentes WHERE acta_id = ?', $actaId);
    foreach ((array)($lista ?? []) as $s) {
        $u = !empty($s['usuario_id']) ? uno('SELECT nombre, cargo FROM usuarios WHERE id = ? AND empresa_id = ?', $s['usuario_id'], $empresaId) : null;
        $nombre = txt(($s['nombre'] ?? null) ?: ($u['nombre'] ?? ''));
        if ($nombre === '') continue;
        $asiste = $s['asiste'] ?? null;
        ejecutar('INSERT INTO acta_asistentes (acta_id, usuario_id, nombre, cargo, area, asiste) VALUES (?,?,?,?,?,?)',
            $actaId, $u ? $s['usuario_id'] : null, $nombre, $s['cargo'] ?? ($u['cargo'] ?? null), $s['area'] ?? null, ($asiste === false || $asiste === 0) ? 0 : 1);
    }
}

$R->post('/api/mecanismos/:id/actas', function (Peticion $req) {
    $m = cargar_mecanismo($req->p('id'), $req->u); $b = $req->body;
    if (!puede_actas($m, $req->u)) falla(403, 'No tienes permiso para adicionar actas en este mecanismo');
    if (!$m['activo']) falla(400, 'El mecanismo está inactivo');
    validar_acta($b, $m);
    return transaccion(function () use ($m, $b, $req) {
        $consecutivo = $m['consecutivo'] + 1;
        $codigo = $m['codificacion'] === 'Manual' ? txt($b['codigo']) : codigo_acta($m, $consecutivo, $b['fecha']);
        ejecutar('UPDATE mecanismos SET consecutivo = ? WHERE id = ?', $consecutivo, $m['id']);
        $id = ejecutar('INSERT INTO actas (mecanismo_id, consecutivo, codigo, fecha, hora_inicio, hora_fin, lugar, tipo_reunion, agenda, desarrollo, autor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            $m['id'], $consecutivo, $codigo, $b['fecha'], $b['hora_inicio'] ?? null, $b['hora_fin'] ?? null, $b['lugar'] ?? null,
            ($b['tipo_reunion'] ?? null) === 'Extraordinaria' ? 'Extraordinaria' : 'Ordinaria', $b['agenda'] ?? null, $b['desarrollo'] ?? null, $req->u['id']);
        // Si no mandan asistentes, se convocan los integrantes del mecanismo
        $lista = isset($b['asistentes']) && is_array($b['asistentes']) ? $b['asistentes'] : array_map(fn($i) => ['usuario_id' => $i['usuario_id'], 'asiste' => 1], integrantes_de($m['id']));
        guardar_asistentes($id, $lista, $req->u['empresa_id']);
        return ['id' => $id, 'codigo' => $codigo];
    });
});

$R->get('/api/actas/:id', function (Peticion $req) {
    [$acta, $m] = cargar_acta($req->p('id'), $req->u);
    $autor = uno('SELECT nombre, usuario FROM usuarios WHERE id = ?', $acta['autor_id']);
    [$lista, $avance] = compromisos_de_acta($acta, $m);
    return array_merge(resumen_acta($acta), [
        'autor' => $autor['nombre'] ?? null, 'autor_usuario' => $autor['usuario'] ?? null,
        'mecanismo' => ['id' => $m['id'], 'nombre' => $m['nombre'], 'tipo' => $m['tipo'], 'indicar_lugar' => $m['indicar_lugar'], 'mostrar_tipo' => $m['mostrar_tipo'],
            'indicar_asistentes' => $m['indicar_asistentes'], 'control_asistencia' => $m['control_asistencia'], 'tiene_compromisos' => $m['tiene_compromisos']],
        'asistentes' => todos('SELECT * FROM acta_asistentes WHERE acta_id = ? ORDER BY id', $acta['id']),
        'archivos' => todos('SELECT f.id, f.nombre, f.tamano, f.parte, f.fecha, u.nombre usuario FROM acta_archivos f LEFT JOIN usuarios u ON u.id = f.usuario_id WHERE f.acta_id = ? ORDER BY f.id', $acta['id']),
        'compromisos_lista' => $lista, 'avance_ponderado' => $avance, 'otras_actas' => todos('SELECT id, codigo, fecha FROM actas WHERE mecanismo_id = ? ORDER BY fecha DESC, id DESC', $m['id']),
        'permisos' => ['administra' => administra($m, $req->u), 'editar' => $acta['estado'] === 'Abierta' && (administra($m, $req->u) || $acta['autor_id'] === $req->u['id']),
            'compromisos' => $acta['estado'] === 'Abierta' && puede_compromisos($m, $req->u), 'actas' => puede_actas($m, $req->u)],
    ]);
});

$R->put('/api/actas/:id', function (Peticion $req) {
    [$acta, $m] = cargar_acta($req->p('id'), $req->u); $b = $req->body;
    editable_acta($acta);
    if (!administra($m, $req->u) && $acta['autor_id'] !== $req->u['id']) falla(403, 'Solo el autor o un administrador edita el acta');
    validar_acta(['codigo' => $b['codigo'] ?? $acta['codigo']] + $b, $m);
    transaccion(function () use ($acta, $m, $b, $req) {
        ejecutar('UPDATE actas SET codigo = ?, fecha = ?, hora_inicio = ?, hora_fin = ?, lugar = ?, tipo_reunion = ?, agenda = ?, desarrollo = ? WHERE id = ?',
            $m['codificacion'] === 'Manual' && !empty($b['codigo']) ? txt($b['codigo']) : $acta['codigo'], $b['fecha'], $b['hora_inicio'] ?? null, $b['hora_fin'] ?? null, $b['lugar'] ?? null,
            ($b['tipo_reunion'] ?? null) === 'Extraordinaria' ? 'Extraordinaria' : 'Ordinaria', $b['agenda'] ?? null, $b['desarrollo'] ?? null, $acta['id']);
        if (isset($b['asistentes']) && is_array($b['asistentes'])) guardar_asistentes($acta['id'], $b['asistentes'], $req->u['empresa_id']);
    });
    return ['ok' => true];
});

// Cerrar, anular o reabrir (solo administradores del mecanismo)
$R->post('/api/actas/:id/estado', function (Peticion $req) {
    [$acta, $m] = cargar_acta($req->p('id'), $req->u);
    if (!administra($m, $req->u)) falla(403, 'Solo los administradores del mecanismo cierran, anulan o reabren actas');
    $destino = ['cerrar' => 'Cerrada', 'anular' => 'Anulada', 'reabrir' => 'Abierta'][$req->b('accion')] ?? null;
    if (!$destino) falla(400, 'Acción no válida');
    if ($destino === 'Abierta' && $acta['estado'] === 'Abierta') falla(400, 'El acta ya está abierta');
    if ($destino !== 'Abierta' && $acta['estado'] !== 'Abierta') falla(400, 'El acta ya está ' . mb_strtolower($acta['estado']));
    ejecutar('UPDATE actas SET estado = ?, cerrada = ? WHERE id = ?', $destino, $destino === 'Cerrada' ? ahora() : null, $acta['id']);
    return ['ok' => true, 'estado' => $destino];
});

$R->post('/api/actas/:id/archivos', function (Peticion $req) {
    $f = guardar_subida($req->files);
    if (!$f) falla(400, 'No llegó ningún archivo');
    try {
        [$acta, $m] = cargar_acta($req->p('id'), $req->u);
        editable_acta($acta);
        if (!puede_actas($m, $req->u) && $acta['autor_id'] !== $req->u['id']) falla(403, 'No puedes adjuntar archivos a esta acta');
        ejecutar('INSERT INTO acta_archivos (acta_id, archivo, nombre, tamano, parte, usuario_id, fecha) VALUES (?,?,?,?,?,?,?)', $acta['id'],
            $f[0], $f[1], $f[2], $req->b('parte') === 'Desarrollo' ? 'Desarrollo' : 'Planeación', $req->u['id'], ahora());
        return ['ok' => true];
    } catch (Throwable $e) { @unlink(dir_archivos() . '/' . $f[0]); throw $e; }
});
$R->get('/api/actas/:id/archivos/:fid', function (Peticion $req) {
    [$acta] = cargar_acta($req->p('id'), $req->u);
    $f = uno('SELECT * FROM acta_archivos WHERE id = ? AND acta_id = ?', $req->p('fid'), $acta['id']);
    if (!$f) falla(404, 'Archivo no encontrado');
    descargar(dir_archivos() . '/' . $f['archivo'], (string)$f['nombre']);
    return null;
});
$R->delete('/api/actas/:id/archivos/:fid', function (Peticion $req) {
    [$acta, $m] = cargar_acta($req->p('id'), $req->u);
    editable_acta($acta);
    if (!administra($m, $req->u) && $acta['autor_id'] !== $req->u['id']) falla(403, 'Solo el autor o un administrador quita archivos');
    $f = uno('SELECT * FROM acta_archivos WHERE id = ? AND acta_id = ?', $req->p('fid'), $acta['id']);
    if ($f) { ejecutar('DELETE FROM acta_archivos WHERE id = ?', $f['id']); @unlink(dir_archivos() . '/' . $f['archivo']); }
    return ['ok' => true];
});

// Listado global de actas (pestaña «Actas» de la administración) y su exportación
function actas_global(Peticion $req): array {
    $w = ['m.empresa_id = ?']; $p = [$req->u['empresa_id']];
    if ($req->q('desde')) { $w[] = 'a.fecha >= ?'; $p[] = $req->q('desde'); }
    if ($req->q('hasta')) { $w[] = 'a.fecha <= ?'; $p[] = $req->q('hasta'); }
    if ($req->q('mecanismo')) { $w[] = 'a.mecanismo_id = ?'; $p[] = $req->q('mecanismo'); }
    $out = [];
    foreach (todos("SELECT a.*, m.nombre mecanismo, m.tipo, u.usuario autor_usuario,
        (SELECT COUNT(*) FROM acta_asistentes s WHERE s.acta_id = a.id) invitados,
        (SELECT CAST(COALESCE(SUM(asiste), 0) AS SIGNED) FROM acta_asistentes s WHERE s.acta_id = a.id) asistentes,
        (SELECT GROUP_CONCAT(nombre ORDER BY s.id SEPARATOR ', ') FROM acta_asistentes s WHERE s.acta_id = a.id) invitados_nombres,
        (SELECT GROUP_CONCAT(nombre ORDER BY s.id SEPARATOR ', ') FROM acta_asistentes s WHERE s.acta_id = a.id AND s.asiste = 1) asistentes_nombres,
        (SELECT COUNT(*) FROM acta_archivos f WHERE f.acta_id = a.id) n_archivos
      FROM actas a JOIN mecanismos m ON m.id = a.mecanismo_id LEFT JOIN usuarios u ON u.id = a.autor_id
      WHERE " . implode(' AND ', $w) . ' ORDER BY a.fecha DESC, a.id DESC', ...$p) as $a)
        if (ve_mecanismo(['id' => $a['mecanismo_id']], $req->u) || asistente_de($a, $req->u))
            $out[] = $a + ['asistencia' => $a['invitados'] ? $a['asistentes'] / $a['invitados'] * 100 : null];
    return $out;
}
$R->get('/api/actas', fn(Peticion $req) => actas_global($req));
$R->get('/api/actas-exportar', function (Peticion $req) {
    $filas = [['Tipo', 'Mecanismo', 'ID', 'Acta/Consecutivo', 'Fecha', 'Hora inicio', 'Hora fin', 'Estado', 'Usuario', 'Lugar',
        'Invitados', '# Invitados', 'Asistentes', '# Asistentes', '% Asistencia', '# Archivos']];
    foreach (actas_global($req) as $a)
        $filas[] = [$a['tipo'], $a['mecanismo'], $a['id'], $a['codigo'], $a['fecha'], $a['hora_inicio'], $a['hora_fin'], $a['estado'], $a['autor_usuario'], $a['lugar'],
            $a['invitados_nombres'], $a['invitados'], $a['asistentes_nombres'], $a['asistentes'], $a['asistencia'] === null ? null : floor($a['asistencia'] * 10 + 0.5) / 10, $a['n_archivos']];
    $formato = $req->q('formato') === 'csv' ? 'csv' : 'xlsx';
    if ($formato === 'csv') enviar_archivo(csv($filas), "actas.$formato", 'text/csv; charset=utf-8');
    else enviar_archivo(xlsx('Actas', $filas, [14, 30, 6, 26, 11, 9, 9, 9, 14, 18, 40, 10, 40, 11, 11, 10]), "actas.$formato", 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return null;
});

// ---------- Compromisos ----------
function validar_compromiso(array $b): array {
    if (txt($b['nombre'] ?? '') === '') falla(400, 'El nombre del compromiso es obligatorio');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['fecha_fin'] ?? ''))) falla(400, 'La fecha fin es obligatoria');
    $resp = array_values(array_filter(array_map('intval', (array)($b['responsables'] ?? []))));
    if (!$resp) falla(400, 'Indica al menos un responsable');
    return $resp;
}
function guardar_responsables(int $id, array $resp, int $empresaId): void {
    ejecutar('DELETE FROM compromiso_responsables WHERE compromiso_id = ?', $id);
    foreach ($resp as $u) if (uno('SELECT 1 FROM usuarios WHERE id = ? AND empresa_id = ?', $u, $empresaId))
        ejecutar('INSERT IGNORE INTO compromiso_responsables (compromiso_id, usuario_id) VALUES (?,?)', $id, $u);
}
$R->post('/api/actas/:id/compromisos', function (Peticion $req) {
    [$acta, $m] = cargar_acta($req->p('id'), $req->u); $b = $req->body;
    editable_acta($acta);
    if (!$m['tiene_compromisos']) falla(400, 'Este mecanismo no maneja compromisos');
    if (!puede_compromisos($m, $req->u)) falla(403, 'No puedes adicionar compromisos en este mecanismo');
    $resp = validar_compromiso($b);
    return transaccion(function () use ($acta, $m, $b, $resp, $req) {
        $numero = (int)uno('SELECT COALESCE(MAX(numero), 0) + 1 n FROM compromisos WHERE acta_id = ?', $acta['id'])['n'];
        $id = ejecutar('INSERT INTO compromisos (acta_id, mecanismo_id, numero, nombre, descripcion, fecha_fin, fecha_fin_inicial) VALUES (?,?,?,?,?,?,?)',
            $acta['id'], $m['id'], $numero, txt($b['nombre']), $b['descripcion'] ?? null, $b['fecha_fin'], $b['fecha_fin']);
        guardar_responsables($id, $resp, $req->u['empresa_id']);
        return ['id' => $id, 'numero' => $numero];
    });
});
$R->put('/api/compromisos/:id', function (Peticion $req) {
    [$c, $m] = cargar_compromiso($req->p('id'), $req->u); $b = $req->body;
    editable_acta(uno('SELECT * FROM actas WHERE id = ?', $c['acta_id']));
    if (!puede_compromisos($m, $req->u)) falla(403, 'No puedes modificar compromisos en este mecanismo');
    $resp = validar_compromiso(['fecha_fin' => ($b['fecha_fin'] ?? null) ?: $c['fecha_fin']] + $b);
    transaccion(function () use ($c, $b, $resp, $req) {
        // La fecha fin solo cambia aquí mientras no haya seguimientos; después se reprograma
        $fecha = ($c['fecha_terminacion'] || uno('SELECT 1 FROM compromiso_seguimientos WHERE compromiso_id = ?', $c['id'])) ? $c['fecha_fin'] : (($b['fecha_fin'] ?? null) ?: $c['fecha_fin']);
        ejecutar('UPDATE compromisos SET nombre = ?, descripcion = ?, fecha_fin = ?, fecha_fin_inicial = ? WHERE id = ?',
            txt($b['nombre']), $b['descripcion'] ?? null, $fecha, $fecha === $c['fecha_fin'] ? $c['fecha_fin_inicial'] : $fecha, $c['id']);
        guardar_responsables($c['id'], $resp, $req->u['empresa_id']);
    });
    return ['ok' => true];
});
$R->delete('/api/compromisos/:id', function (Peticion $req) {
    [$c, $m] = cargar_compromiso($req->p('id'), $req->u);
    editable_acta(uno('SELECT * FROM actas WHERE id = ?', $c['acta_id']));
    if (!administra($m, $req->u)) falla(403, 'Solo los administradores del mecanismo eliminan compromisos');
    if (uno('SELECT 1 FROM compromiso_seguimientos WHERE compromiso_id = ?', $c['id'])) falla(400, 'El compromiso ya tiene seguimientos; no se puede eliminar');
    ejecutar('DELETE FROM compromisos WHERE id = ?', $c['id']);
    return ['ok' => true];
});

function acta_abierta(array $c): bool { return (uno('SELECT estado FROM actas WHERE id = ?', $c['acta_id'])['estado'] ?? null) === 'Abierta'; }
function puede_seguir(array $c, array $m, array $u): bool { return responsable_de($c, $u) || administra($m, $u); }

$R->get('/api/compromisos/:id', function (Peticion $req) {
    [$c, $m] = cargar_compromiso($req->p('id'), $req->u);
    $comp = con_estado(uno(SELECT_COMP . ' WHERE c.id = ?', $c['id']));
    return $comp + [
        'ultimo_seguimiento' => uno('SELECT s.*, u.nombre usuario, u.cargo FROM compromiso_seguimientos s LEFT JOIN usuarios u ON u.id = s.usuario_id WHERE s.compromiso_id = ? ORDER BY s.fecha DESC, s.id DESC', $c['id']),
        'seguimientos' => todos('SELECT s.id, s.fecha, s.avance, s.descripcion, s.archivo_nombre, s.registrado, u.nombre usuario, u.cargo
          FROM compromiso_seguimientos s LEFT JOIN usuarios u ON u.id = s.usuario_id WHERE s.compromiso_id = ? ORDER BY s.fecha DESC, s.id DESC', $c['id']),
        'reprogramaciones' => todos('SELECT r.*, u.nombre usuario FROM compromiso_reprogramaciones r LEFT JOIN usuarios u ON u.id = r.usuario_id WHERE r.compromiso_id = ? ORDER BY r.id DESC', $c['id']),
        'permisos' => ['seguimiento' => !$c['fecha_terminacion'] && puede_seguir($c, $m, $req->u), 'reprogramar' => !$c['fecha_terminacion'] && puede_seguir($c, $m, $req->u),
            'editar' => acta_abierta($c) && puede_compromisos($m, $req->u), 'eliminar' => acta_abierta($c) && administra($m, $req->u) && !$comp['n_seguimientos']],
    ];
});

// Seguimiento: porcentaje de avance acumulado (0–100). Con 100 % el compromiso queda terminado.
$R->post('/api/compromisos/:id/seguimientos', function (Peticion $req) {
    $f = guardar_subida($req->files);
    try {
        [$c, $m] = cargar_compromiso($req->p('id'), $req->u); $b = $req->body;
        if ($c['fecha_terminacion']) falla(400, 'La actividad ya fue registrada como terminada');
        if (!puede_seguir($c, $m, $req->u)) falla(403, 'Solo los responsables del compromiso o los administradores registran seguimientos');
        $texto = str_replace(',', '.', (string)($b['avance'] ?? ''));
        if (trim((string)($b['avance'] ?? '')) === '' || !is_numeric(trim($texto))) falla(400, 'Porcentaje es requerido');
        $avance = trim($texto) + 0;
        if ($avance < 0 || $avance > 100) falla(400, 'El campo porcentaje debe ser un valor entre 0 y 100');
        if (txt($b['descripcion'] ?? '') === '') falla(400, 'Describe el avance');
        $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['fecha'] ?? '')) ? $b['fecha'] : hoy_mec();
        if ($fecha > hoy_mec()) falla(400, 'La fecha del seguimiento no puede ser futura');
        transaccion(function () use ($c, $fecha, $avance, $b, $f, $req) {
            ejecutar('INSERT INTO compromiso_seguimientos (compromiso_id, fecha, avance, descripcion, archivo, archivo_nombre, usuario_id, registrado) VALUES (?,?,?,?,?,?,?,?)',
                $c['id'], $fecha, $avance, txt($b['descripcion']), $f[0] ?? null, $f[1] ?? null, $req->u['id'], ahora());
            ejecutar('UPDATE compromisos SET avance = ?, fecha_terminacion = ? WHERE id = ?', $avance, $avance == 100 ? $fecha : null, $c['id']);
        });
        return ['ok' => true, 'terminado' => $avance == 100];
    } catch (Throwable $e) { if ($f) @unlink(dir_archivos() . '/' . $f[0]); throw $e; }
});
$R->get('/api/compromisos/:id/seguimientos/:sid/archivo', function (Peticion $req) {
    [$c] = cargar_compromiso($req->p('id'), $req->u);
    $s = uno('SELECT * FROM compromiso_seguimientos WHERE id = ? AND compromiso_id = ?', $req->p('sid'), $c['id']);
    if (!($s['archivo'] ?? null)) falla(404, 'Archivo no encontrado');
    descargar(dir_archivos() . '/' . $s['archivo'], (string)$s['archivo_nombre']);
    return null;
});

$R->post('/api/compromisos/:id/reprogramar', function (Peticion $req) {
    [$c, $m] = cargar_compromiso($req->p('id'), $req->u); $b = $req->body;
    if ($c['fecha_terminacion']) falla(400, 'La actividad ya fue registrada como terminada');
    if (!puede_seguir($c, $m, $req->u)) falla(403, 'Solo los responsables del compromiso o los administradores lo reprograman');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['fecha_nueva'] ?? ''))) falla(400, 'Indica la nueva fecha de terminación planeada');
    if (txt($b['causa'] ?? '') === '') falla(400, 'Indica la causa de la reprogramación');
    if ($b['fecha_nueva'] === $c['fecha_fin']) falla(400, 'La nueva fecha es igual a la actual');
    transaccion(function () use ($c, $b, $req) {
        ejecutar('INSERT INTO compromiso_reprogramaciones (compromiso_id, fecha_anterior, fecha_nueva, causa, usuario_id, registrado) VALUES (?,?,?,?,?,?)',
            $c['id'], $c['fecha_fin'], $b['fecha_nueva'], txt($b['causa']), $req->u['id'], ahora());
        ejecutar('UPDATE compromisos SET fecha_fin = ? WHERE id = ?', $b['fecha_nueva'], $c['id']);
    });
    return ['ok' => true];
});

// Seguimiento de compromisos: por mecanismo, estado, fecha, acta o responsable
$R->get('/api/compromisos', function (Peticion $req) {
    $w = ['m.empresa_id = ?', "a.estado != 'Anulada'"]; $p = [$req->u['empresa_id']];
    if ($req->q('mecanismo')) { $w[] = 'c.mecanismo_id = ?'; $p[] = $req->q('mecanismo'); }
    if ($req->q('acta')) { $w[] = 'c.acta_id = ?'; $p[] = $req->q('acta'); }
    if ($req->q('mios') === '1') { $w[] = 'EXISTS (SELECT 1 FROM compromiso_responsables r WHERE r.compromiso_id = c.id AND r.usuario_id = ?)'; $p[] = $req->u['id']; }
    $op = $req->q('op'); $f1 = $req->q('fecha1'); $f2 = $req->q('fecha2');
    if ($op && $f1) {
        if ($op === '>') { $w[] = 'c.fecha_fin >= ?'; $p[] = $f1; }
        elseif ($op === '<') { $w[] = 'c.fecha_fin <= ?'; $p[] = $f1; }
        elseif ($op === 'entre' && $f2) { $w[] = 'c.fecha_fin BETWEEN ? AND ?'; array_push($p, $f1, $f2); }
    }
    $lista = [];
    foreach (todos(SELECT_COMP . ' WHERE ' . implode(' AND ', $w) . ' ORDER BY c.fecha_fin, c.id', ...$p) as $c) {
        $c = con_estado($c);
        if ($req->q('mios') === '1' || ve_mecanismo(['id' => $c['mecanismo_id']], $req->u) || responsable_de($c, $req->u)) $lista[] = $c;
    }
    $estados = lista($req->q('estado'));
    if ($estados) $lista = array_values(array_filter($lista, fn($c) => in_array($c['estado'], $estados, true)));
    return $lista;
});

// Para «Mi plan de trabajo»: mis mecanismos (árbol) y mis compromisos abiertos
$R->get('/api/mecanismos-pendientes', function (Peticion $req) {
    $cal = es_calidad($req->u);
    return [
        'mecanismos' => todos('SELECT m.id, m.tipo, m.nombre FROM mecanismos m WHERE m.empresa_id = ? AND m.activo = 1 '
            . ($cal ? '' : 'AND (m.coordinador_id = ? OR EXISTS (SELECT 1 FROM mecanismo_integrantes i WHERE i.mecanismo_id = m.id AND i.usuario_id = ?))') . ' ORDER BY m.tipo, m.nombre',
            ...($cal ? [$req->u['empresa_id']] : [$req->u['empresa_id'], $req->u['id'], $req->u['id']])),
        'compromisos' => array_map('con_estado', todos(SELECT_COMP . " WHERE m.empresa_id = ? AND a.estado != 'Anulada' AND c.fecha_terminacion IS NULL
          AND EXISTS (SELECT 1 FROM compromiso_responsables r WHERE r.compromiso_id = c.id AND r.usuario_id = ?) ORDER BY c.fecha_fin", $req->u['empresa_id'], $req->u['id'])),
    ];
});
