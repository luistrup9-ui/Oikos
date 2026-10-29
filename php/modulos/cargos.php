<?php
// Estructura de cargos: código OIKOS CAR-<área>-<NN>, área, jefe (otro cargo) y personas (antes en cargos.js)
declare(strict_types=1);

function codigo_cargo(array $c): string { return 'CAR-' . $c['area_sigla'] . '-' . str_pad((string)$c['numero'], 2, '0', STR_PAD_LEFT); }
function cargar_cargo($id, array $u): array {
    return uno('SELECT * FROM cargos WHERE id = ? AND empresa_id = ?', $id, $u['empresa_id']) ?? falla(404, 'Cargo no encontrado');
}

// Lista para la pestaña y para elegir el cargo de una persona (cualquier usuario con sesión puede leerla)
$R->get('/api/cargos', function (Peticion $req) {
    $cargos = todos('SELECT c.*, j.nombre jefe FROM cargos c LEFT JOIN cargos j ON j.id = c.jefe_id WHERE c.empresa_id = ? ORDER BY c.area_sigla, c.numero', $req->u['empresa_id']);
    $personas = todos('SELECT id, nombre, correo, usuario, cargo_id, activo FROM usuarios WHERE empresa_id = ? AND cargo_id IS NOT NULL ORDER BY nombre', $req->u['empresa_id']);
    return array_map(fn($c) => $c + ['codigo' => codigo_cargo($c), 'personas' => array_values(array_map(
        fn($p) => ['id' => $p['id'], 'nombre' => $p['nombre'], 'correo' => $p['correo'], 'usuario' => $p['usuario']],
        array_filter($personas, fn($p) => $p['cargo_id'] === $c['id'] && $p['activo'])))], $cargos);
});

function validar_cargo(array $b, array $u, int $id = 0): array {
    $area_sigla = strtoupper(txt($b['area_sigla'] ?? '')); $area = txt($b['area'] ?? ''); $nombre = txt($b['nombre'] ?? '');
    if (!preg_match('/^[A-Z]{2,6}$/', $area_sigla)) falla(400, 'La sigla del área va de 2 a 6 letras (ej. GPR)');
    if ($area === '') falla(400, 'El nombre del área es obligatorio');
    if ($nombre === '') falla(400, 'El nombre del cargo es obligatorio');
    $numero = empty($b['numero']) ? (int)uno('SELECT COALESCE(MAX(numero), 0) + 1 n FROM cargos WHERE empresa_id = ?', $u['empresa_id'])['n'] : $b['numero'];
    if (!is_numeric($numero) || (int)$numero != $numero || $numero < 1 || $numero > 999) falla(400, 'El número del cargo va de 1 a 999');
    $numero = (int)$numero;
    if (uno('SELECT 1 FROM cargos WHERE empresa_id = ? AND area_sigla = ? AND numero = ? AND id != ?', $u['empresa_id'], $area_sigla, $numero, $id))
        falla(400, 'Ya existe el código ' . codigo_cargo(['area_sigla' => $area_sigla, 'numero' => $numero]));
    $jefe_id = (int)($b['jefe_id'] ?? 0) ?: null;
    if ($jefe_id) {
        if ($jefe_id === $id) falla(400, 'Un cargo no puede ser su propio jefe');
        cargar_cargo($jefe_id, $u);
        for ($j = $jefe_id, $n = 0; $j && $n < 100; $n++) { // sin ciclos: el jefe no puede depender de este cargo
            if ($j === $id) falla(400, 'Ese jefe depende de este cargo: se formaría un ciclo');
            $j = uno('SELECT jefe_id FROM cargos WHERE id = ?', $j)['jefe_id'] ?? null;
        }
    }
    $a = $b['activo'] ?? 1;
    $activo = ($a === 0 || $a === '0' || $a === false) ? 0 : 1;
    return compact('area_sigla', 'area', 'numero', 'nombre', 'jefe_id', 'activo');
}

$R->post('/api/cargos', function (Peticion $req) {
    solo_admin($req->u, 'Solo el administrador gestiona los cargos');
    $d = validar_cargo($req->body, $req->u);
    $id = ejecutar('INSERT INTO cargos (empresa_id, area_sigla, area, numero, nombre, jefe_id, activo) VALUES (?,?,?,?,?,?,?)',
        $req->u['empresa_id'], $d['area_sigla'], $d['area'], $d['numero'], $d['nombre'], $d['jefe_id'], $d['activo']);
    return ['id' => $id, 'codigo' => codigo_cargo($d)];
});

$R->put('/api/cargos/:id', function (Peticion $req) {
    solo_admin($req->u, 'Solo el administrador gestiona los cargos');
    $c = cargar_cargo($req->p('id'), $req->u); $d = validar_cargo($req->body, $req->u, $c['id']);
    transaccion(function () use ($c, $d) {
        ejecutar('UPDATE cargos SET area_sigla = ?, area = ?, numero = ?, nombre = ?, jefe_id = ?, activo = ? WHERE id = ?', $d['area_sigla'], $d['area'], $d['numero'], $d['nombre'], $d['jefe_id'], $d['activo'], $c['id']);
        ejecutar('UPDATE usuarios SET cargo = ? WHERE cargo_id = ?', $d['nombre'], $c['id']); // el nombre del cargo se ve en el perfil de cada persona
    });
    return ['ok' => true, 'codigo' => codigo_cargo($d)];
});

// Quiénes ocupan el cargo: se marcan las personas; si alguna tenía otro cargo, pasa a este
$R->put('/api/cargos/:id/personas', function (Peticion $req) {
    solo_admin($req->u, 'Solo el administrador gestiona los cargos');
    $c = cargar_cargo($req->p('id'), $req->u);
    $ids = lista_ids($req->b('usuarios'));
    foreach ($ids as $id) if (!uno('SELECT 1 FROM usuarios WHERE id = ? AND empresa_id = ?', $id, $req->u['empresa_id'])) falla(400, 'Usuario inválido');
    transaccion(function () use ($c, $ids) {
        ejecutar('UPDATE usuarios SET cargo_id = NULL, cargo = NULL WHERE cargo_id = ?', $c['id']); // quien sale del cargo queda sin cargo
        foreach ($ids as $id) ejecutar('UPDATE usuarios SET cargo_id = ?, cargo = ? WHERE id = ?', $c['id'], $c['nombre'], $id);
    });
    return ['ok' => true, 'personas' => count($ids)];
});
