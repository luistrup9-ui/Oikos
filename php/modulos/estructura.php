<?php
// Estructura organizacional: áreas en árbol y sus tipos, y el perfil de cada cargo (responsabilidad, procesos en los que participa y campos adicionales).
// Cualquier persona con sesión puede mirar; cambiar exige el privilegio correspondiente (o ser el administrador). Ver privilegios.php.
declare(strict_types=1);

const MAX_PERFIL_TEXTO = 5000;
const TIPOS_CAMPO_CARGO = ['texto' => 'Texto', 'seleccion' => 'Selección (una opción)'];

// ---------- Tipos de área ----------
$R->get('/api/tipos-area', fn(Peticion $req) => todos('SELECT t.id, t.nombre, t.orden, (SELECT COUNT(*) FROM areas a WHERE a.tipo_area_id = t.id) areas
    FROM tipos_area t WHERE t.empresa_id = ? ORDER BY t.orden, t.nombre', $req->u['empresa_id']));

function nombre_tipo_area(Peticion $req, int $id = 0): string {
    exigir_privilegio($req->u, 'gestionar_estructura');
    $n = txt($req->b('nombre'));
    if ($n === '' || mb_strlen($n) > 100) falla(400, 'El nombre del tipo va de 1 a 100 letras');
    if (uno('SELECT 1 FROM tipos_area WHERE empresa_id = ? AND nombre = ? AND id <> ?', $req->u['empresa_id'], $n, $id)) falla(400, "Ya existe el tipo de área «{$n}»");
    return $n;
}
$R->post('/api/tipos-area', function (Peticion $req) {
    $n = nombre_tipo_area($req);
    $orden = (int)uno('SELECT COALESCE(MAX(orden), 0) + 1 n FROM tipos_area WHERE empresa_id = ?', $req->u['empresa_id'])['n'];
    return ['id' => ejecutar('INSERT INTO tipos_area (empresa_id, nombre, orden) VALUES (?,?,?)', $req->u['empresa_id'], $n, $orden)];
});
$R->put('/api/tipos-area/:id', function (Peticion $req) {
    $t = uno('SELECT id FROM tipos_area WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Tipo de área no encontrado');
    ejecutar('UPDATE tipos_area SET nombre = ? WHERE id = ?', nombre_tipo_area($req, (int)$t['id']), $t['id']);
    return ['ok' => true];
});
$R->delete('/api/tipos-area/:id', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_estructura');
    $t = uno('SELECT id, nombre FROM tipos_area WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Tipo de área no encontrado');
    $n = (int)uno('SELECT COUNT(*) n FROM areas WHERE tipo_area_id = ?', $t['id'])['n'];
    if ($n) falla(400, "No se puede quitar «{$t['nombre']}»: lo usan $n área" . ($n > 1 ? 's' : '') . '. Cámbiales el tipo primero.');
    ejecutar('DELETE FROM tipos_area WHERE id = ?', $t['id']);
    return ['ok' => true];
});

// ---------- Áreas (árbol) ----------
function cargar_area($id, array $u): array {
    return uno('SELECT * FROM areas WHERE id = ? AND empresa_id = ?', $id, $u['empresa_id']) ?? falla(404, 'Área no encontrada');
}
$R->get('/api/areas', fn(Peticion $req) => todos('SELECT a.id, a.sigla, a.nombre, a.padre_id, a.tipo_area_id, a.orden, a.activo, t.nombre tipo,
      (SELECT COUNT(*) FROM cargos c WHERE c.area_id = a.id AND c.activo = 1) cargos,
      (SELECT COUNT(*) FROM usuarios u JOIN cargos c ON c.id = u.cargo_id WHERE c.area_id = a.id AND u.activo = 1) personas
    FROM areas a LEFT JOIN tipos_area t ON t.id = a.tipo_area_id WHERE a.empresa_id = ? ORDER BY a.orden, a.nombre', $req->u['empresa_id']));

function validar_area(array $b, array $u, ?array $actual = null): array {
    $id = (int)($actual['id'] ?? 0);
    $nombre = txt($b['nombre'] ?? ($actual['nombre'] ?? '')); $sigla = strtoupper(txt($b['sigla'] ?? ($actual['sigla'] ?? '')));
    if ($nombre === '' || mb_strlen($nombre) > 200) falla(400, 'El nombre del área es obligatorio (hasta 200 letras)');
    if (!preg_match('/^[A-Z]{2,6}$/', $sigla)) falla(400, 'La sigla del área va de 2 a 6 letras (ej. GPR): con ella se arma el código de sus cargos');
    if (uno('SELECT 1 FROM areas WHERE empresa_id = ? AND sigla = ? AND id <> ?', $u['empresa_id'], $sigla, $id)) falla(400, "Ya existe un área con la sigla $sigla");
    if ($actual && $sigla !== $actual['sigla'] && uno('SELECT 1 FROM cargos WHERE area_id = ?', $id))
        falla(400, 'La sigla no se puede cambiar mientras el área tenga cargos: el código de cada cargo (CAR-sigla-número) se arma con ella');
    $padre = esta($b, 'padre_id') ? ((int)$b['padre_id'] ?: null) : ($actual['padre_id'] ?? null);
    if ($padre) {
        cargar_area($padre, $u);
        for ($x = $padre, $n = 0; $x && $n < 100; $n++) {       // sin ciclos: el área no puede depender de sí misma ni de las suyas
            if ($id && $x === $id) falla(400, 'Un área no puede depender de sí misma ni de una de sus áreas internas');
            $x = (int)(uno('SELECT padre_id FROM areas WHERE id = ?', $x)['padre_id'] ?? 0);
        }
    }
    $tipo = esta($b, 'tipo_area_id') ? ((int)$b['tipo_area_id'] ?: null) : ($actual['tipo_area_id'] ?? null);
    if ($tipo && !uno('SELECT 1 FROM tipos_area WHERE id = ? AND empresa_id = ?', $tipo, $u['empresa_id'])) falla(400, 'El tipo de área no existe');
    $a = $b['activo'] ?? ($actual['activo'] ?? 1);
    return ['nombre' => $nombre, 'sigla' => $sigla, 'padre_id' => $padre, 'tipo_area_id' => $tipo, 'activo' => ($a === 0 || $a === '0' || $a === false) ? 0 : 1];
}
$R->post('/api/areas', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_estructura');
    $d = validar_area($req->body, $req->u);
    $orden = (int)uno('SELECT COALESCE(MAX(orden), 0) + 1 n FROM areas WHERE empresa_id = ? AND padre_id <=> ?', $req->u['empresa_id'], $d['padre_id'])['n'];
    return ['id' => ejecutar('INSERT INTO areas (empresa_id, sigla, nombre, padre_id, tipo_area_id, orden, activo) VALUES (?,?,?,?,?,?,?)',
        $req->u['empresa_id'], $d['sigla'], $d['nombre'], $d['padre_id'], $d['tipo_area_id'], $orden, $d['activo'])];
});
$R->put('/api/areas/:id', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_estructura');
    $a = cargar_area($req->p('id'), $req->u); $d = validar_area($req->body, $req->u, $a);
    transaccion(function () use ($a, $d) {
        $orden = $d['padre_id'] === ($a['padre_id'] ? (int)$a['padre_id'] : null) ? $a['orden'] : (int)uno('SELECT COALESCE(MAX(orden), 0) + 1 n FROM areas WHERE empresa_id = ? AND padre_id <=> ?', $a['empresa_id'], $d['padre_id'])['n'];
        ejecutar('UPDATE areas SET sigla = ?, nombre = ?, padre_id = ?, tipo_area_id = ?, orden = ?, activo = ? WHERE id = ?', $d['sigla'], $d['nombre'], $d['padre_id'], $d['tipo_area_id'], $orden, $d['activo'], $a['id']);
        ejecutar('UPDATE cargos SET area = ?, area_sigla = ? WHERE area_id = ?', $d['nombre'], $d['sigla'], $a['id']);   // los cargos muestran el nombre del área (y siguen con su sigla)
    });
    return ['ok' => true];
});
$R->delete('/api/areas/:id', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_estructura');
    $a = cargar_area($req->p('id'), $req->u);
    $c = (int)uno('SELECT COUNT(*) n FROM cargos WHERE area_id = ?', $a['id'])['n']; $h = (int)uno('SELECT COUNT(*) n FROM areas WHERE padre_id = ?', $a['id'])['n'];
    if ($c) falla(400, "No se puede borrar «{$a['nombre']}»: tiene $c cargo" . ($c > 1 ? 's' : '') . '. Pásalos a otra área o desactiva el área.');
    if ($h) falla(400, "No se puede borrar «{$a['nombre']}»: de ella dependen $h área" . ($h > 1 ? 's' : '') . '. Cámbiales el área de la que dependen primero.');
    ejecutar('DELETE FROM areas WHERE id = ?', $a['id']);
    return ['ok' => true];
});

// ---------- Campos adicionales del perfil del cargo (Parametrización cargos) ----------
function opciones_de_campo(?string $t): array { return array_values(array_filter(array_map('trim', preg_split('/\R/u', (string)$t)), fn($o) => $o !== '')); }

$R->get('/api/cargo-campos', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_cargos');
    return array_map(fn($c) => $c + ['opciones_lista' => opciones_de_campo($c['opciones'])],
        todos('SELECT k.*, (SELECT COUNT(*) FROM cargo_valores v WHERE v.campo_id = k.id AND v.valor IS NOT NULL AND v.valor <> \'\') usos
          FROM cargo_campos k WHERE k.empresa_id = ? ORDER BY k.agrupador, k.orden, k.nombre', $req->u['empresa_id']));
});
function validar_campo_cargo(array $b, array $u, ?array $actual = null): array {
    $id = (int)($actual['id'] ?? 0);
    $codigo = txt($b['codigo'] ?? ($actual['codigo'] ?? '')); $nombre = txt($b['nombre'] ?? ($actual['nombre'] ?? ''));
    $agrupador = txt($b['agrupador'] ?? ($actual['agrupador'] ?? '')); $alias = txt($b['alias'] ?? ($actual['alias'] ?? '')) ?: null;
    $tipo = $b['tipo'] ?? ($actual['tipo'] ?? 'texto');
    if (!preg_match('/^[A-Za-z0-9_\-]{2,40}$/', $codigo)) falla(400, 'El código del campo va de 2 a 40 caracteres: letras, números, guion y guion bajo');
    if (uno('SELECT 1 FROM cargo_campos WHERE empresa_id = ? AND codigo = ? AND id <> ?', $u['empresa_id'], $codigo, $id)) falla(400, "Ya existe un campo con el código $codigo");
    if ($nombre === '' || mb_strlen($nombre) > 200) falla(400, 'El nombre del campo es obligatorio (hasta 200 letras)');
    if (mb_strlen($agrupador) > 200 || ($alias !== null && mb_strlen($alias) > 60)) falla(400, 'El agrupador va hasta 200 letras y el alias hasta 60');
    if (!isset(TIPOS_CAMPO_CARGO[$tipo])) falla(400, 'El tipo del campo es Texto o Selección');
    $opciones = null;
    if ($tipo === 'seleccion') {
        $lista = opciones_de_campo((string)($b['opciones'] ?? ($actual['opciones'] ?? '')));
        if (count($lista) < 2 || count($lista) > 50 || count($lista) !== count(array_unique($lista))) falla(400, 'Un campo de selección necesita entre 2 y 50 opciones distintas, una por línea');
        $opciones = implode("\n", $lista);
    }
    $orden = esta($b, 'orden') ? (int)$b['orden'] : (int)($actual['orden'] ?? 0);
    $a = $b['activo'] ?? ($actual['activo'] ?? 1);
    return ['codigo' => $codigo, 'nombre' => $nombre, 'agrupador' => $agrupador, 'alias' => $alias, 'tipo' => $tipo, 'opciones' => $opciones, 'orden' => $orden, 'activo' => ($a === 0 || $a === '0' || $a === false) ? 0 : 1];
}
$R->post('/api/cargo-campos', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_cargos');
    $d = validar_campo_cargo($req->body, $req->u);
    return ['id' => ejecutar('INSERT INTO cargo_campos (empresa_id, agrupador, codigo, nombre, tipo, opciones, alias, orden, activo) VALUES (?,?,?,?,?,?,?,?,?)',
        $req->u['empresa_id'], $d['agrupador'], $d['codigo'], $d['nombre'], $d['tipo'], $d['opciones'], $d['alias'], $d['orden'], $d['activo'])];
});
$R->put('/api/cargo-campos/:id', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_cargos');
    $k = uno('SELECT * FROM cargo_campos WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Campo no encontrado');
    $d = validar_campo_cargo($req->body, $req->u, $k);
    if ($d['tipo'] !== $k['tipo'] && uno("SELECT 1 FROM cargo_valores WHERE campo_id = ? AND valor <> ''", $k['id'])) falla(400, 'Este campo ya tiene valores en algunos cargos: no se le puede cambiar el tipo');
    ejecutar('UPDATE cargo_campos SET codigo = ?, nombre = ?, agrupador = ?, alias = ?, tipo = ?, opciones = ?, orden = ?, activo = ? WHERE id = ?',
        $d['codigo'], $d['nombre'], $d['agrupador'], $d['alias'], $d['tipo'], $d['opciones'], $d['orden'], $d['activo'], $k['id']);
    return ['ok' => true];
});
$R->delete('/api/cargo-campos/:id', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_cargos');
    $k = uno('SELECT * FROM cargo_campos WHERE id = ? AND empresa_id = ?', $req->p('id'), $req->u['empresa_id']) ?? falla(404, 'Campo no encontrado');
    $n = (int)uno("SELECT COUNT(*) n FROM cargo_valores WHERE campo_id = ? AND valor <> ''", $k['id'])['n'];
    if ($n) falla(400, "El campo «{$k['nombre']}» ya tiene valores en $n cargo" . ($n > 1 ? 's' : '') . ': desactívalo en lugar de borrarlo (así no se pierde lo escrito).');
    ejecutar('DELETE FROM cargo_valores WHERE campo_id = ?', $k['id']);
    ejecutar('DELETE FROM cargo_campos WHERE id = ?', $k['id']);
    return ['ok' => true];
});

// ---------- Perfil del cargo (el «manual de responsabilidades») ----------
$R->get('/api/cargos/:id/perfil', function (Peticion $req) {
    $c = cargar_cargo($req->p('id'), $req->u); $u = $req->u;
    $jefe = $c['jefe_id'] ? uno('SELECT id, nombre, area_sigla, numero FROM cargos WHERE id = ?', $c['jefe_id']) : null;
    $campos = todos('SELECT k.id, k.agrupador, k.codigo, k.nombre, k.tipo, k.opciones, k.alias, v.valor FROM cargo_campos k
        LEFT JOIN cargo_valores v ON v.campo_id = k.id AND v.cargo_id = ? WHERE k.empresa_id = ? AND k.activo = 1 ORDER BY k.agrupador, k.orden, k.nombre', $c['id'], $u['empresa_id']);
    return [
        'cargo' => ['id' => $c['id'], 'codigo' => codigo_cargo($c), 'nombre' => $c['nombre'], 'area_id' => $c['area_id'], 'area' => $c['area'], 'activo' => (int)$c['activo'], 'responsabilidad' => $c['responsabilidad'],
            'jefe' => $jefe ? ['id' => $jefe['id'], 'nombre' => $jefe['nombre'], 'codigo' => codigo_cargo($jefe)] : null],
        'personas' => todos('SELECT id, nombre, correo, usuario FROM usuarios WHERE cargo_id = ? AND activo = 1 ORDER BY nombre', $c['id']),
        'reportan' => array_map(fn($x) => ['id' => $x['id'], 'nombre' => $x['nombre'], 'codigo' => codigo_cargo($x)],
            todos('SELECT id, nombre, area_sigla, numero FROM cargos WHERE jefe_id = ? AND activo = 1 ORDER BY area_sigla, numero', $c['id'])),
        // Participación en procesos: los procesos que lideran las personas que ocupan el cargo (solo los publicados)
        'procesos' => todos("SELECT DISTINCT p.id, p.codigo, p.nombre, p.tipo FROM usuarios u JOIN usuario_procesos up ON up.usuario_id = u.id JOIN procesos p ON p.id = up.proceso_id
            WHERE u.cargo_id = ? AND u.activo = 1 AND p.publicado = 1 ORDER BY p.nombre", $c['id']),
        'campos' => array_map(fn($k) => $k + ['opciones_lista' => opciones_de_campo($k['opciones'])], $campos),
        'puede_editar' => tiene_privilegio($u, 'gestionar_cargos'),
    ];
});
// Responsabilidad básica y valores de los campos adicionales: {responsabilidad, valores: {idCampo: valor}}
$R->put('/api/cargos/:id/perfil', function (Peticion $req) {
    exigir_privilegio($req->u, 'gestionar_cargos');
    $c = cargar_cargo($req->p('id'), $req->u); $b = $req->body;
    $resp = esta($b, 'responsabilidad') ? txt($b['responsabilidad']) : null;
    if ($resp !== null && mb_strlen($resp) > MAX_PERFIL_TEXTO) falla(400, 'La responsabilidad básica va hasta ' . MAX_PERFIL_TEXTO . ' letras');
    $valores = [];
    if (esta($b, 'valores')) {
        if (!is_array($b['valores'])) falla(400, 'Los valores del perfil no son válidos');
        foreach ($b['valores'] as $campoId => $valor) {
            $k = uno('SELECT * FROM cargo_campos WHERE id = ? AND empresa_id = ? AND activo = 1', (int)$campoId, $req->u['empresa_id']) ?? falla(400, 'Uno de los campos no existe o está desactivado');
            $valor = txt(is_scalar($valor) ? (string)$valor : '');
            if (mb_strlen($valor) > 2000) falla(400, "«{$k['nombre']}»: va hasta 2000 letras");
            if ($k['tipo'] === 'seleccion' && $valor !== '' && !in_array($valor, opciones_de_campo($k['opciones']), true)) falla(400, "«{$k['nombre']}»: elige una de las opciones");
            $valores[(int)$k['id']] = $valor;
        }
    }
    transaccion(function () use ($c, $resp, $valores) {
        if ($resp !== null) ejecutar('UPDATE cargos SET responsabilidad = ? WHERE id = ?', $resp === '' ? null : $resp, $c['id']);
        foreach ($valores as $campo => $valor) {
            if ($valor === '') ejecutar('DELETE FROM cargo_valores WHERE cargo_id = ? AND campo_id = ?', $c['id'], $campo);
            else ejecutar('INSERT INTO cargo_valores (cargo_id, campo_id, valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', $c['id'], $campo, $valor);
        }
    });
    return ['ok' => true];
});
