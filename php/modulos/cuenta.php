<?php
// Página individual: la cuenta de cada persona (avisos, alerta temprana, página con la que abre, firma mecánica y números de contacto)
// y la lista de los mecanismos de integración en los que participa, con su última y su próxima sesión («Mi SGI»).
declare(strict_types=1);

const PAGINAS_INICIO = ['bienvenida' => 'Página de inicio', 'personal' => 'Página personal', 'mapa' => 'Mapa de procesos', 'tablero' => 'Tablero de Mando'];
// Prefijos de país que se ofrecen en los números de contacto
const PREFIJOS = ['+57' => 'Colombia', '+54' => 'Argentina', '+591' => 'Bolivia', '+55' => 'Brasil', '+56' => 'Chile', '+506' => 'Costa Rica', '+593' => 'Ecuador', '+503' => 'El Salvador',
    '+34' => 'España', '+1' => 'EE. UU. y Canadá', '+502' => 'Guatemala', '+504' => 'Honduras', '+52' => 'México', '+505' => 'Nicaragua', '+507' => 'Panamá', '+595' => 'Paraguay',
    '+51' => 'Perú', '+598' => 'Uruguay', '+58' => 'Venezuela', '+49' => 'Alemania', '+33' => 'Francia', '+39' => 'Italia', '+44' => 'Reino Unido', '+86' => 'China'];
const PREFERENCIAS_BASE = ['notif_atraso' => 0, 'dias_atraso' => 1, 'notif_por_terminar' => 0, 'dias_por_terminar' => 3, 'alerta_dias' => 14, 'pagina_inicio' => 'bienvenida'];
const FIRMA_MAXIMO = 1024 * 1024;   // 1 MB
const MAX_TELEFONOS = 10;

// Lo que la persona eligió; lo que no ha elegido queda como siempre
function preferencias_de(int $usuarioId): array {
    $f = uno('SELECT * FROM usuario_preferencias WHERE usuario_id = ?', $usuarioId);
    $p = PREFERENCIAS_BASE;
    if ($f) foreach ($p as $k => $_) $p[$k] = $k === 'pagina_inicio' ? (isset(PAGINAS_INICIO[$f[$k]]) ? $f[$k] : 'bienvenida') : (int)$f[$k];
    return $p;
}
function dias_validos($v, string $campo): int {
    if (!is_numeric($v) || (int)$v != $v || $v < 1 || $v > 90) falla(400, "$campo: los días van de 1 a 90");
    return (int)$v;
}

$R->get('/api/cuenta', function (Peticion $req) {
    $f = uno('SELECT firma_archivo FROM usuario_preferencias WHERE usuario_id = ?', $req->u['id']);
    return ['preferencias' => preferencias_de($req->u['id']),
        'telefonos' => todos('SELECT id, nombre, prefijo, numero FROM usuario_telefonos WHERE usuario_id = ? ORDER BY orden, id', $req->u['id']),
        'tiene_firma' => !empty($f['firma_archivo']),
        'prefijos' => array_map(fn($p, $n) => ['prefijo' => $p, 'pais' => $n], array_keys(PREFIJOS), PREFIJOS),
        'paginas' => array_map(fn($k, $n) => ['id' => $k, 'nombre' => $n], array_keys(PAGINAS_INICIO), PAGINAS_INICIO)];
});

// Guarda las preferencias y, si vienen, los números de contacto (que reemplazan a los anteriores). La firma tiene sus propias rutas.
$R->put('/api/cuenta', function (Peticion $req) {
    $b = $req->body; $id = (int)$req->u['id']; $p = preferencias_de($id);
    foreach (['notif_atraso', 'notif_por_terminar'] as $k) if (esta($b, $k)) $p[$k] = ($b[$k] === true || $b[$k] === 1 || $b[$k] === '1') ? 1 : 0;
    if (esta($b, 'dias_atraso')) $p['dias_atraso'] = dias_validos($b['dias_atraso'], 'Avisar por atraso');
    if (esta($b, 'dias_por_terminar')) $p['dias_por_terminar'] = dias_validos($b['dias_por_terminar'], 'Avisar por terminar');
    if (esta($b, 'alerta_dias')) $p['alerta_dias'] = dias_validos($b['alerta_dias'], 'Alerta temprana');
    if (esta($b, 'pagina_inicio')) { if (!isset(PAGINAS_INICIO[$b['pagina_inicio']])) falla(400, 'La página de inicio no es válida'); $p['pagina_inicio'] = $b['pagina_inicio']; }
    $telefonos = null;
    if (esta($b, 'telefonos')) {
        if (!is_array($b['telefonos']) || count($b['telefonos']) > MAX_TELEFONOS) falla(400, 'Puedes guardar hasta ' . MAX_TELEFONOS . ' números');
        $telefonos = []; $vistos = [];
        foreach ($b['telefonos'] as $t) {
            $nombre = txt($t['nombre'] ?? ''); $prefijo = (string)($t['prefijo'] ?? ''); $numero = preg_replace('/[\s().\-]/', '', (string)($t['numero'] ?? ''));
            if ($nombre === '' || mb_strlen($nombre) > 60) falla(400, 'Cada número lleva un nombre (por ejemplo «Celular») de hasta 60 letras');
            if (!isset(PREFIJOS[$prefijo])) falla(400, 'El prefijo del país no es válido');
            if (!preg_match('/^\d{6,14}$/', $numero)) falla(400, "El número de «$nombre» debe tener entre 6 y 14 dígitos");
            if (isset($vistos["$prefijo$numero"])) falla(400, "El número $prefijo $numero está repetido");
            $vistos["$prefijo$numero"] = true; $telefonos[] = [$nombre, $prefijo, $numero];
        }
    }
    transaccion(function () use ($id, $p, $telefonos) {
        ejecutar('INSERT INTO usuario_preferencias (usuario_id, notif_atraso, dias_atraso, notif_por_terminar, dias_por_terminar, alerta_dias, pagina_inicio) VALUES (?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE notif_atraso = VALUES(notif_atraso), dias_atraso = VALUES(dias_atraso), notif_por_terminar = VALUES(notif_por_terminar),
          dias_por_terminar = VALUES(dias_por_terminar), alerta_dias = VALUES(alerta_dias), pagina_inicio = VALUES(pagina_inicio)',
            $id, $p['notif_atraso'], $p['dias_atraso'], $p['notif_por_terminar'], $p['dias_por_terminar'], $p['alerta_dias'], $p['pagina_inicio']);
        if ($telefonos !== null) {
            ejecutar('DELETE FROM usuario_telefonos WHERE usuario_id = ?', $id);
            foreach ($telefonos as $i => [$nombre, $prefijo, $numero]) ejecutar('INSERT INTO usuario_telefonos (usuario_id, orden, nombre, prefijo, numero) VALUES (?,?,?,?,?)', $id, $i, $nombre, $prefijo, $numero);
        }
    });
    return ['ok' => true, 'preferencias' => $p];
});

// ---------- Firma mecánica: una imagen PNG o JPG por persona, guardada con las demás cargas (fuera de la parte pública) y solo visible para ella ----------
$R->post('/api/cuenta/firma', function (Peticion $req) {
    $f = $req->files['archivo'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) falla(400, 'No llegó ninguna imagen');
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || $f['size'] > FIRMA_MAXIMO) falla(413, 'La imagen de la firma no puede pasar de 1 MB');
    if ($f['error'] !== UPLOAD_ERR_OK) falla(400, 'No se pudo recibir la imagen');
    $info = @getimagesize($f['tmp_name']);   // se mira el contenido, no el nombre ni lo que diga el navegador
    $tipo = [IMAGETYPE_PNG => 'image/png', IMAGETYPE_JPEG => 'image/jpeg'][$info[2] ?? 0] ?? null;
    if (!$tipo) falla(415, 'La firma debe ser una imagen PNG o JPG');
    if ($info[0] > 4000 || $info[1] > 4000) falla(400, 'La imagen es demasiado grande (máximo 4000 × 4000 píxeles)');
    $nombre = bin2hex(random_bytes(16)); $destino = dir_archivos() . '/' . $nombre;
    if (!move_uploaded_file($f['tmp_name'], $destino) && !rename($f['tmp_name'], $destino)) falla(500, 'No se pudo guardar la imagen');
    $antes = uno('SELECT firma_archivo FROM usuario_preferencias WHERE usuario_id = ?', $req->u['id'])['firma_archivo'] ?? null;
    ejecutar('INSERT INTO usuario_preferencias (usuario_id, firma_archivo, firma_tipo) VALUES (?,?,?) ON DUPLICATE KEY UPDATE firma_archivo = VALUES(firma_archivo), firma_tipo = VALUES(firma_tipo)', $req->u['id'], $nombre, $tipo);
    if ($antes && preg_match('/^[a-f0-9]{32}$/', $antes)) @unlink(dir_archivos() . '/' . $antes);
    return ['ok' => true];
});
$R->get('/api/cuenta/firma', function (Peticion $req) {
    $f = uno('SELECT firma_archivo, firma_tipo FROM usuario_preferencias WHERE usuario_id = ?', $req->u['id']);
    $ruta = !empty($f['firma_archivo']) && preg_match('/^[a-f0-9]{32}$/', $f['firma_archivo']) ? dir_archivos() . '/' . $f['firma_archivo'] : null;
    if (!$ruta || !is_file($ruta)) falla(404, 'Todavía no has subido tu firma');
    header('Content-Type: ' . $f['firma_tipo']); header('X-Content-Type-Options: nosniff'); header('Cache-Control: private, no-store'); header('Content-Length: ' . filesize($ruta));
    readfile($ruta);
    return null;
});
$R->delete('/api/cuenta/firma', function (Peticion $req) {
    $antes = uno('SELECT firma_archivo FROM usuario_preferencias WHERE usuario_id = ?', $req->u['id'])['firma_archivo'] ?? null;
    ejecutar('UPDATE usuario_preferencias SET firma_archivo = NULL, firma_tipo = NULL WHERE usuario_id = ?', $req->u['id']);
    if ($antes && preg_match('/^[a-f0-9]{32}$/', $antes)) @unlink(dir_archivos() . '/' . $antes);
    return ['ok' => true];
});

// ---------- Mi SGI: los mecanismos de integración de la persona (coordina o es integrante), con su última sesión y su próxima sesión ----------
// Última = la más reciente antes de hoy; próxima = la primera desde hoy (una reunión de hoy cuenta como próxima). Las actas anuladas no cuentan.
$R->get('/api/mis-mecanismos', function (Peticion $req) {
    $hoy = gmdate('Y-m-d'); $u = $req->u;
    return todos("SELECT m.id, m.tipo, m.nombre,
        (SELECT MAX(a.fecha) FROM actas a WHERE a.mecanismo_id = m.id AND a.estado <> 'Anulada' AND a.fecha < ?) ultima,
        (SELECT MIN(a.fecha) FROM actas a WHERE a.mecanismo_id = m.id AND a.estado <> 'Anulada' AND a.fecha >= ?) proxima
      FROM mecanismos m WHERE m.empresa_id = ? AND m.activo = 1
        AND (m.coordinador_id = ? OR EXISTS (SELECT 1 FROM mecanismo_integrantes i WHERE i.mecanismo_id = m.id AND i.usuario_id = ?))
      ORDER BY m.tipo, m.nombre", $hoy, $hoy, $u['empresa_id'], $u['id'], $u['id']);
});
