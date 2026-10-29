<?php
// Importación de datos desde CSV (exportado de Excel o de Almera): revisa fila por fila y solo aplica si no hay errores (antes en admin.js)
declare(strict_types=1);

final class ErrorFila extends Exception {}
function fila_mal(string $msg): never { throw new ErrorFila($msg); }

// ---------- CSV ----------
function parsear_csv($texto): array {
    $texto = preg_replace('/^\x{FEFF}/u', '', (string)($texto ?? ''));
    $primera = preg_split('/\r?\n/', $texto, 2)[0];
    $sep = substr_count($primera, ';') >= substr_count($primera, ',') ? ';' : ',';
    $filas = []; $fila = []; $campo = ''; $comillas = false; $n = strlen($texto);
    $cerrar = function () use (&$fila, &$campo, &$filas) { $fila[] = $campo; $campo = ''; if (array_filter($fila, fn($x) => trim($x) !== '')) $filas[] = $fila; $fila = []; };
    for ($i = 0; $i < $n; $i++) {
        $c = $texto[$i];
        if ($comillas) {
            if ($c === '"') { if (($texto[$i + 1] ?? '') === '"') { $campo .= '"'; $i++; } else $comillas = false; }
            else $campo .= $c;
        } elseif ($c === '"') $comillas = true;
        elseif ($c === $sep) { $fila[] = $campo; $campo = ''; }
        elseif ($c === "\n" || $c === "\r") { if ($c === "\r" && ($texto[$i + 1] ?? '') === "\n") $i++; $cerrar(); }
        else $campo .= $c;
    }
    $cerrar();
    $cab = array_shift($filas);
    if (!$cab) return ['columnas' => [], 'filas' => []];
    $columnas = array_map(fn($c) => preg_replace('/\s+/', '_', norm($c)), $cab);
    return ['columnas' => $columnas, 'filas' => array_map(fn($f) => array_combine($columnas, array_map(fn($i) => trim($f[$i] ?? ''), array_keys($columnas))), $filas)];
}
function a_csv(array $cols, array $filas): string {
    return "\u{FEFF}" . implode("\r\n", array_map(fn($f) => implode(';', array_map(fn($v) => '"' . str_replace('"', '""', (string)($v ?? '')) . '"', $f)), array_merge([$cols], $filas)));
}

// ---------- Conversión de valores ----------
function numero_csv($v, string $campo) {
    if ($v === '' || $v === null) return null;
    $t = preg_replace('/\s/', '', str_replace('%', '', (string)$v));
    if (str_contains($t, ',') && str_contains($t, '.')) $t = str_replace(',', '.', str_replace('.', '', $t));
    elseif (str_contains($t, ',')) $t = str_replace(',', '.', $t);
    if (!is_numeric($t)) fila_mal("$campo: “{$v}” no es un número");
    return $t + 0;
}
function entero_csv($v, string $campo, int $min, int $max): int {
    $n = numero_csv($v, $campo);
    if ($n === null || floor($n) != $n || $n < $min || $n > $max) fila_mal("$campo debe ser un entero entre $min y $max");
    return (int)$n;
}
function fecha_iso_csv($v, string $campo): ?string {
    if (!$v) return null;
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $v, $m)) [, $y, $mo, $d] = $m;
    elseif (preg_match('/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/', $v, $m)) { $d = str_pad($m[1], 2, '0', STR_PAD_LEFT); $mo = str_pad($m[2], 2, '0', STR_PAD_LEFT); $y = $m[3]; }
    else fila_mal("$campo: “{$v}” no es una fecha (usa AAAA-MM-DD o DD/MM/AAAA)");
    if (!checkdate((int)$mo, (int)$d, (int)$y)) fila_mal("$campo: “{$v}” no es una fecha válida");
    return "$y-$mo-$d";
}
function si_no($v): bool { return in_array(norm($v), ['si', 'sí', 's', '1', 'x', 'true', 'yes'], true); }
function buscar_en(array $lista, $valor, array $campos): ?array {
    $v = norm($valor); if ($v === '') return null;
    foreach ($lista as $x) foreach ($campos as $c) if (norm($x[$c] ?? '') === $v) return $x;
    return null;
}
function codigo_libre(string $tabla, string $prefijo): string {
    $n = (int)uno("SELECT COUNT(*) n FROM $tabla WHERE codigo LIKE ?", $prefijo . '%')['n'] + 1;
    do $c = $prefijo . str_pad((string)$n++, 2, '0', STR_PAD_LEFT); while (uno("SELECT 1 FROM $tabla WHERE codigo = ?", $c));
    return $c;
}
function persona_csv(array $ctx, $v, string $campo): ?int {
    if (!$v) return null;
    $x = buscar_en($ctx['usuarios'], $v, ['usuario', 'nombre', 'correo']);
    if (!$x) fila_mal("$campo: no existe el usuario “{$v}”");
    return $x['id'];
}
function elegir(string $valor, array $opciones, string $campo): string {
    foreach ($opciones as $o) if (norm($o) === norm($valor)) return $o;
    fila_mal("$campo: “{$valor}” no es válido (" . implode(', ', $opciones) . ')');
}

// ---------- Importadores ----------
function importadores(): array {
    return [
        'usuarios' => [
            'titulo' => 'Usuarios', 'soloAdmin' => true,
            'columnas' => ['correo', 'nombre', 'cargo', 'rol', 'proceso'], 'requeridas' => ['correo', 'nombre', 'rol'],
            'ejemplo' => ['jperez@metalcof.co', 'Juan Pérez', 'Jefe de Producción', 'Líder', 'Producción'],
            'ayuda' => 'rol: Administrador, Gestor de Calidad, Líder o Colaborador. El Líder necesita proceso. La persona ingresa con su correo; a cada usuario se le genera una clave temporal.',
            'preparar' => function (array $f, array &$ctx) {
                $correo = limpiar_correo($f['correo']);
                if (!preg_match(CORREO_RE, $correo)) fila_mal("correo: “{$f['correo']}” no es válido");
                if (uno('SELECT 1 FROM usuarios WHERE correo = ?', $correo)) fila_mal("el correo $correo ya existe");
                if (isset($ctx['vistos'][$correo])) fila_mal("“{$correo}” está repetido en el archivo");
                $ctx['vistos'][$correo] = true;
                $alias = ['administrador' => 'admin', 'gestor de calidad' => 'lider_calidad', 'gestor' => 'lider_calidad', 'lider de calidad' => 'lider_calidad',
                    'lider' => 'lider_proceso', 'lider de proceso' => 'lider_proceso', 'colaborador' => 'consulta'];
                $rol = $alias[norm($f['rol'])] ?? elegir($f['rol'], ROLES, 'rol');
                $proceso = !empty($f['proceso']) ? buscar_en($ctx['procesos'], $f['proceso'], ['nombre', 'sigla']) : null;
                if (!empty($f['proceso']) && !$proceso) fila_mal("proceso: no existe “{$f['proceso']}”");
                if ($rol === 'lider_proceso' && !$proceso) fila_mal('el Líder necesita proceso');
                return ['correo' => $correo, 'nombre' => $f['nombre'], 'cargo' => ($f['cargo'] ?? '') ?: null, 'rol' => $rol, 'proceso_id' => $proceso['id'] ?? null, 'resumen' => "$correo · " . ROL_ETIQUETA[$rol]];
            },
            'aplicar' => function (array $d, array &$ctx) {
                $clave = generar_clave(); $usuario = usuario_desde($d['correo']);
                $id = ejecutar('INSERT INTO usuarios (empresa_id, usuario, correo, nombre, cargo, rol, proceso_id, clave, activo, debe_cambiar) VALUES (?,?,?,?,?,?,?,?,1,1)',
                    $ctx['u']['empresa_id'], $usuario, $d['correo'], $d['nombre'], $d['cargo'], $d['rol'], $d['proceso_id'], hash_clave($clave));
                if ($d['rol'] === 'lider_proceso') guardar_procesos($id, con_subprocesos((int)$d['proceso_id'])); // el proceso con sus subprocesos
                $ctx['claves'][] = ['usuario' => $d['correo'], 'nombre' => $d['nombre'], 'clave_temporal' => $clave];
            },
        ],
        'correos' => [
            'titulo' => 'Correos de usuarios que ya existen', 'soloAdmin' => true,
            'columnas' => ['usuario', 'correo'], 'requeridas' => ['usuario', 'correo'],
            'ejemplo' => ['juan.perez', 'juan.perez@metalcof.co'],
            'ayuda' => 'Asigna o cambia el correo de usuarios ya creados (se identifican por su usuario, o por su nombre completo). No cambia claves ni roles.',
            'preparar' => function (array $f, array &$ctx) {
                $u = buscar_en($ctx['usuarios'], $f['usuario'], ['usuario', 'nombre']);
                if (!$u) fila_mal("usuario: no existe “{$f['usuario']}”");
                $correo = limpiar_correo($f['correo']);
                if (!preg_match(CORREO_RE, $correo)) fila_mal("correo: “{$f['correo']}” no es válido");
                if (uno('SELECT 1 FROM usuarios WHERE correo = ? AND id != ?', $correo, $u['id'])) fila_mal("el correo $correo ya es de otro usuario");
                if (isset($ctx['vistos'][$correo])) fila_mal("“{$correo}” está repetido en el archivo");
                $ctx['vistos'][$correo] = true;
                return ['id' => $u['id'], 'correo' => $correo, 'resumen' => "{$u['usuario']} → $correo"];
            },
            'aplicar' => function (array $d) { ejecutar('UPDATE usuarios SET correo = ? WHERE id = ?', $d['correo'], $d['id']); },
        ],
        'documentos' => [
            'titulo' => 'Listado maestro de documentos',
            'columnas' => ['codigo', 'nombre', 'tipo', 'clase', 'proceso', 'origen', 'version', 'fecha_documento', 'fecha_vencimiento', 'responsable', 'descripcion'],
            'requeridas' => ['nombre', 'tipo', 'clase', 'proceso'],
            'ejemplo' => ['PRO-PRO-01', 'Procedimiento de soldadura', 'Procedimiento', 'Procedimientos', 'Producción', 'Interno', '1', '2025-03-10', '2027-03-10', 'jperez@metalcof.co', ''],
            'ayuda' => 'Los documentos entran como Vigentes (sin archivo: se adjunta al modificarlos). Si dejas el código vacío se genera. tipo, clase y proceso aceptan el nombre o la sigla.',
            'preparar' => function (array $f, array &$ctx) {
                $tipo = buscar_en($ctx['tipos'], $f['tipo'], ['nombre', 'sigla']); if (!$tipo) fila_mal("tipo: no existe “{$f['tipo']}”");
                $clase = buscar_en($ctx['clases'], $f['clase'], ['nombre', 'sigla']); if (!$clase) fila_mal("clase: no existe “{$f['clase']}”");
                $proceso = buscar_en($ctx['procesos'], $f['proceso'], ['nombre', 'sigla']); if (!$proceso) fila_mal("proceso: no existe “{$f['proceso']}”");
                $codigo = $f['codigo'] ?? '';
                if ($codigo !== '') {
                    if (uno('SELECT 1 FROM documentos WHERE codigo = ?', $codigo)) fila_mal("el código $codigo ya existe");
                    if (isset($ctx['vistos'][$codigo])) fila_mal("el código $codigo está repetido en el archivo");
                    $ctx['vistos'][$codigo] = true;
                }
                return ['codigo' => $codigo ?: null, 'nombre' => $f['nombre'], 'tipo_id' => $tipo['id'], 'clase_id' => $clase['id'], 'proceso' => $proceso, 'clase' => $clase,
                    'origen' => !empty($f['origen']) ? elegir($f['origen'], ['Interno', 'Externo'], 'origen') : 'Interno',
                    'version' => !empty($f['version']) ? entero_csv($f['version'], 'version', 1, 99) : 1,
                    'fecha_documento' => fecha_iso_csv($f['fecha_documento'] ?? '', 'fecha_documento'), 'fecha_vencimiento' => fecha_iso_csv($f['fecha_vencimiento'] ?? '', 'fecha_vencimiento'),
                    'responsable_id' => persona_csv($ctx, $f['responsable'] ?? '', 'responsable'), 'descripcion' => ($f['descripcion'] ?? '') ?: null,
                    'resumen' => ($codigo ?: '(código automático)') . " · {$f['nombre']}"];
            },
            'aplicar' => function (array $d, array &$ctx) {
                $codigo = $d['codigo'] ?: codigo_libre('documentos', "{$d['proceso']['sigla']}-{$d['clase']['sigla']}-");
                $id = ejecutar("INSERT INTO documentos (empresa_id, codigo, nombre, tipo_id, clase_id, proceso_id, origen, descripcion, responsable_id, estado, version, fecha_documento, fecha_vencimiento, creado, modificado)
                  VALUES (?,?,?,?,?,?,?,?,?,'VIGENTE',?,?,?,?,?)", $ctx['u']['empresa_id'], $codigo, $d['nombre'], $d['tipo_id'], $d['clase_id'], $d['proceso']['id'], $d['origen'], $d['descripcion'],
                    $d['responsable_id'] ?? $ctx['u']['id'], $d['version'], $d['fecha_documento'] ?? substr(ahora(), 0, 10), $d['fecha_vencimiento'], ahora(), ahora());
                ejecutar("INSERT INTO bitacora (documento_id, version, transicion_id, estado_inicial, estado_final, usuario_id, comentario, fecha) VALUES (?,?,'importar',NULL,'VIGENTE',?,'Importado desde archivo',?)",
                    $id, $d['version'], $ctx['u']['id'], ahora());
            },
        ],
        'riesgos' => [
            'titulo' => 'Matriz de riesgos',
            'columnas' => ['proceso', 'tipo', 'nombre', 'causas', 'consecuencias', 'probabilidad', 'impacto', 'tratamiento', 'responsable', 'descripcion'],
            'requeridas' => ['proceso', 'tipo', 'nombre', 'probabilidad', 'impacto'],
            'ejemplo' => ['Producción', 'Calidad', 'Producto no conforme por fallas en soldadura', 'Equipos sin mantenimiento', 'Reprocesos y quejas', '4', '4', 'Reducir', 'jperez@metalcof.co', ''],
            'ayuda' => 'probabilidad e impacto de 1 a 5. tratamiento: Reducir, Aceptar, Evitar o Compartir. El código R-PROCESO-nn se genera solo.',
            'preparar' => function (array $f, array &$ctx) {
                $proceso = buscar_en($ctx['procesos'], $f['proceso'], ['nombre', 'sigla']); if (!$proceso) fila_mal("proceso: no existe “{$f['proceso']}”");
                return ['proceso' => $proceso, 'tipo' => elegir($f['tipo'], TIPOS_RIESGO, 'tipo'), 'nombre' => $f['nombre'], 'causas' => ($f['causas'] ?? '') ?: null, 'consecuencias' => ($f['consecuencias'] ?? '') ?: null,
                    'probabilidad' => entero_csv($f['probabilidad'], 'probabilidad', 1, 5), 'impacto' => entero_csv($f['impacto'], 'impacto', 1, 5),
                    'tratamiento' => !empty($f['tratamiento']) ? elegir($f['tratamiento'], ['Reducir', 'Aceptar', 'Evitar', 'Compartir'], 'tratamiento') : 'Reducir',
                    'responsable_id' => persona_csv($ctx, $f['responsable'] ?? '', 'responsable'), 'descripcion' => ($f['descripcion'] ?? '') ?: null,
                    'resumen' => "{$f['nombre']} ({$f['probabilidad']}×{$f['impacto']})"];
            },
            'aplicar' => function (array $d, array &$ctx) {
                ejecutar('INSERT INTO riesgos (empresa_id, codigo, proceso_id, tipo, nombre, descripcion, causas, consecuencias, probabilidad, impacto, tratamiento, responsable_id, creado, modificado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    $ctx['u']['empresa_id'], codigo_libre('riesgos', "R-{$d['proceso']['sigla']}-"), $d['proceso']['id'], $d['tipo'], $d['nombre'], $d['descripcion'], $d['causas'], $d['consecuencias'],
                    $d['probabilidad'], $d['impacto'], $d['tratamiento'], $d['responsable_id'] ?? $ctx['u']['id'], ahora(), ahora());
            },
        ],
        'controles' => [
            'titulo' => 'Controles de riesgos',
            'columnas' => ['riesgo_codigo', 'descripcion', 'clasificacion', 'efectividad', 'mitiga_probabilidad', 'mitiga_impacto', 'frecuencia', 'documentado', 'responsable_gestion', 'responsable_revision'],
            'requeridas' => ['riesgo_codigo', 'descripcion', 'clasificacion'],
            'ejemplo' => ['R-PRO-01', 'Inspección de soldadura en cada lote', 'Detectivo', 'Fuerte', 'si', 'no', 'Por lote', 'si', 'jperez@metalcof.co', 'mramirez@metalcof.co'],
            'ayuda' => 'El riesgo debe existir (importa primero la matriz). clasificacion: Preventivo, Detectivo o Correctivo. efectividad: Fuerte, Moderado o Débil. mitiga_*: si/no (al menos uno).',
            'preparar' => function (array $f, array &$ctx) {
                $riesgo = uno('SELECT r.*, p.sigla FROM riesgos r JOIN procesos p ON p.id = r.proceso_id WHERE r.codigo = ? AND r.empresa_id = ? AND r.activo = 1', $f['riesgo_codigo'], $ctx['u']['empresa_id']);
                if (!$riesgo) fila_mal("no existe el riesgo {$f['riesgo_codigo']}");
                $mp = si_no($f['mitiga_probabilidad'] ?? ''); $mi = si_no($f['mitiga_impacto'] ?? '');
                if (!$mp && !$mi) fila_mal('debe mitigar la probabilidad, el impacto o ambos (si/no)');
                return ['riesgo' => $riesgo, 'descripcion' => $f['descripcion'], 'clasificacion' => elegir($f['clasificacion'], ['Preventivo', 'Detectivo', 'Correctivo'], 'clasificacion'),
                    'efectividad' => !empty($f['efectividad']) ? elegir($f['efectividad'], ['Fuerte', 'Moderado', 'Débil'], 'efectividad') : 'Moderado',
                    'mp' => $mp ? 1 : 0, 'mi' => $mi ? 1 : 0, 'frecuencia' => ($f['frecuencia'] ?? '') ?: null, 'documentado' => si_no($f['documentado'] ?? '') ? 1 : 0,
                    'gestion' => persona_csv($ctx, $f['responsable_gestion'] ?? '', 'responsable_gestion'), 'revision' => persona_csv($ctx, $f['responsable_revision'] ?? '', 'responsable_revision'),
                    'resumen' => "{$f['riesgo_codigo']} · " . mb_substr($f['descripcion'], 0, 60)];
            },
            'aplicar' => function (array $d) {
                ejecutar('INSERT INTO controles (riesgo_id, codigo, descripcion, clasificacion, mitiga_probabilidad, mitiga_impacto, efectividad, frecuencia, documentado, responsable_gestion_id, responsable_revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    $d['riesgo']['id'], codigo_libre('controles', "C-{$d['riesgo']['sigla']}-"), $d['descripcion'], $d['clasificacion'], $d['mp'], $d['mi'], $d['efectividad'], $d['frecuencia'], $d['documentado'], $d['gestion'], $d['revision']);
            },
        ],
        'mediciones' => [
            'titulo' => 'Mediciones históricas de indicadores',
            'columnas' => ['indicador_codigo', 'anio', 'periodo', 'valor', 'numerador', 'denominador', 'analisis'],
            'requeridas' => ['indicador_codigo', 'anio', 'periodo'],
            'ejemplo' => ['IND-CCA-01', '2025', '3', '', '196', '200', ''],
            'ayuda' => 'periodo según la frecuencia (mensual 1-12, trimestral 1-4…). Da el valor, o numerador y denominador si el indicador es una razón. Si el periodo ya existe se reemplaza.',
            'preparar' => function (array $f, array &$ctx) {
                $ind = uno('SELECT * FROM indicadores WHERE codigo = ? AND empresa_id = ?', $f['indicador_codigo'], $ctx['u']['empresa_id']);
                if (!$ind) fila_mal("no existe el indicador {$f['indicador_codigo']}");
                $anio = entero_csv($f['anio'], 'anio', 2000, 2100); $periodo = entero_csv($f['periodo'], 'periodo', 1, PERIODOS[$ind['frecuencia']]);
                $clave = "{$ind['id']}/$anio/$periodo";
                if (isset($ctx['vistos'][$clave])) fila_mal('ese periodo está repetido en el archivo');
                $ctx['vistos'][$clave] = true;
                $num = numero_csv($f['numerador'] ?? '', 'numerador'); $den = numero_csv($f['denominador'] ?? '', 'denominador'); $val = numero_csv($f['valor'] ?? '', 'valor');
                if ($num !== null && $den !== null) {
                    if (!$den) fila_mal('el denominador no puede ser cero');
                    $valor = redondear2($num / $den * ($ind['unidad'] === '%' ? 100 : 1));
                } elseif ($val !== null) $valor = $val;
                else fila_mal('falta el valor (o numerador y denominador)');
                $previa = uno('SELECT valor FROM mediciones WHERE indicador_id = ? AND anio = ? AND periodo = ?', $ind['id'], $anio, $periodo);
                return ['ind' => $ind, 'anio' => $anio, 'periodo' => $periodo, 'valor' => $valor, 'num' => $num, 'den' => $den, 'analisis' => ($f['analisis'] ?? '') ?: null,
                    'resumen' => "{$f['indicador_codigo']} $anio-$periodo: " . numero_js($valor) . ($previa ? ' (reemplaza ' . numero_js($previa['valor']) . ')' : '')];
            },
            'aplicar' => function (array $d, array &$ctx) {
                ejecutar('INSERT INTO mediciones (indicador_id, anio, periodo, numerador, denominador, valor, meta, analisis, usuario_id, fecha) VALUES (?,?,?,?,?,?,?,?,?,?)
                  ON DUPLICATE KEY UPDATE numerador = VALUES(numerador), denominador = VALUES(denominador), valor = VALUES(valor), meta = VALUES(meta),
                  analisis = VALUES(analisis), usuario_id = VALUES(usuario_id), fecha = VALUES(fecha)',
                    $d['ind']['id'], $d['anio'], $d['periodo'], $d['num'], $d['den'], $d['valor'], $d['ind']['meta'], $d['analisis'], $ctx['u']['id'], ahora());
            },
        ],
    ];
}

$R->get('/api/importar', function (Peticion $req) {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad o el administrador importan datos');
    $out = [];
    foreach (importadores() as $id => $i) if (empty($i['soloAdmin']) || $req->u['rol'] === 'admin')
        $out[] = ['id' => $id, 'titulo' => $i['titulo'], 'columnas' => $i['columnas'], 'requeridas' => $i['requeridas'], 'ayuda' => $i['ayuda']];
    return $out;
});

function importador(Peticion $req): array {
    if (!es_calidad($req->u)) falla(403, 'Solo Calidad o el administrador importan datos');
    $i = importadores()[$req->p('tipo')] ?? null;
    if (!$i) falla(404, 'Tipo de importación desconocido');
    if (!empty($i['soloAdmin'])) solo_admin($req->u);
    return $i;
}

$R->get('/api/importar/:tipo/plantilla', function (Peticion $req) {
    $i = importador($req);
    enviar_archivo(a_csv($i['columnas'], [$i['ejemplo']]), "plantilla-{$req->p('tipo')}.csv", 'text/csv; charset=utf-8');
    return null;
});

// Revisa el archivo fila por fila; solo aplica si no hay ningún error (todo o nada)
$R->post('/api/importar/:tipo', function (Peticion $req) {
    $imp = importador($req);
    ['columnas' => $columnas, 'filas' => $filas] = parsear_csv($req->b('csv'));
    if (!$columnas) falla(400, 'El archivo está vacío');
    $faltantes = array_values(array_diff($imp['requeridas'], $columnas));
    if ($faltantes) falla(400, 'Faltan columnas obligatorias: ' . implode(', ', $faltantes) . '. Descarga la plantilla para ver el formato.');
    if (!$filas) falla(400, 'El archivo no tiene filas de datos');
    if (count($filas) > 5000) falla(400, 'Máximo 5000 filas por archivo');
    $ctx = ['u' => $req->u, 'vistos' => [], 'claves' => [],
        'procesos' => todos('SELECT * FROM procesos WHERE empresa_id = ?', $req->u['empresa_id']), 'tipos' => todos('SELECT * FROM tipos_documento'),
        'clases' => todos('SELECT * FROM clases_documento'), 'usuarios' => todos('SELECT id, usuario, correo, nombre FROM usuarios WHERE empresa_id = ? AND activo = 1', $req->u['empresa_id'])];
    $revisadas = [];
    foreach ($filas as $k => $f) {
        try {
            foreach ($imp['requeridas'] as $c) if (($f[$c] ?? '') === '') fila_mal("falta $c");
            $d = $imp['preparar']($f, $ctx);
            $revisadas[] = ['n' => $k + 2, 'ok' => true, 'resumen' => $d['resumen'], 'datos' => $d];
        } catch (ErrorFila $e) { $revisadas[] = ['n' => $k + 2, 'ok' => false, 'error' => $e->getMessage()]; }
    }
    $errores = count(array_filter($revisadas, fn($x) => !$x['ok']));
    $out = ['total' => count($filas), 'validas' => count($filas) - $errores, 'errores' => $errores, 'aplicado' => false,
        'filas' => array_slice(array_map(fn($x) => array_diff_key($x, ['datos' => 1]), $revisadas), 0, 500)];
    if ($req->b('aplicar') && !$errores) {
        transaccion(function () use ($revisadas, $imp, &$ctx) { foreach ($revisadas as $x) $imp['aplicar']($x['datos'], $ctx); });
        $out['aplicado'] = true;
        if ($ctx['claves']) $out['claves'] = $ctx['claves'];
    }
    return $out;
});
