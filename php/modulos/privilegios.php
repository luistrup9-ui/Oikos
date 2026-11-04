<?php
// Privilegios: permisos sueltos que el administrador (super usuario) da a una persona o a un grupo, ADEMÁS de lo que ya permite su rol.
// Solo suman: nadie pierde nada por no tener un privilegio, y los roles de siempre (Administrador, Gestor de Calidad, Líder, Colaborador) no cambian.
// El catálogo se arma con funciones que OIKOS ya tiene y que hasta ahora solo hacía el administrador. Lo que es delicado (usuarios, claves,
// copias de seguridad, quién es líder de un proceso y los propios privilegios) queda solo para el super usuario y no se puede delegar.
declare(strict_types=1);

const PRIVILEGIOS = [
    'gestionar_estructura' => ['nombre' => 'Gestionar la estructura organizacional', 'delegable' => true,
        'descripcion' => 'Crear, editar y retirar áreas y tipos de área.'],
    'gestionar_cargos' => ['nombre' => 'Gestionar cargos y su perfil', 'delegable' => true,
        'descripcion' => 'Crear y editar cargos, asignar las personas que los ocupan, llenar el perfil del cargo y definir sus campos adicionales.'],
    'gestionar_grupos' => ['nombre' => 'Gestionar grupos de usuarios', 'delegable' => true,
        'descripcion' => 'Crear y editar grupos de usuarios y cambiar sus miembros.'],
    'gestionar_procesos' => ['nombre' => 'Gestionar procesos', 'delegable' => true,
        'descripcion' => 'Crear y editar procesos, subprocesos y procedimientos, y publicarlos o retirarlos. Asignar líderes sigue siendo del super usuario.'],
    'gestionar_usuarios' => ['nombre' => 'Gestionar usuarios', 'delegable' => false,
        'descripcion' => 'Crear personas, cambiar su rol, restablecer claves y desactivarlas.'],
    'asignar_lideres' => ['nombre' => 'Asignar líderes de proceso', 'delegable' => false,
        'descripcion' => 'Dar o quitar a una persona el liderazgo de un proceso (cambia su rol y lo que puede ver).'],
    'otorgar_privilegios' => ['nombre' => 'Otorgar privilegios', 'delegable' => false,
        'descripcion' => 'Dar y quitar los privilegios de esta pantalla a personas y grupos.'],
    'respaldos' => ['nombre' => 'Copias de seguridad', 'delegable' => false,
        'descripcion' => 'Crear, descargar y restaurar las copias de seguridad.'],
];
const MENSAJE_PRIVILEGIO = 'No tienes el privilegio «%s». Pídele al administrador que te lo otorgue.';

// Privilegios que tiene la persona ahora mismo, leídos de la base en cada petición (si se le quita uno, deja de valer al instante):
// el super usuario (rol administrador) los tiene todos; los demás, los que se les dio a ellos o a un grupo al que pertenecen.
function privilegios_de(array $u): array {
    static $memo = [];
    $id = (int)$u['id'];
    if (isset($memo[$id]) && $memo[$id][0] === $u['rol']) return $memo[$id][1];
    if ($u['rol'] === 'admin') $claves = array_keys(PRIVILEGIOS);
    else {
        try {
            $claves = array_map(fn($f) => $f['privilegio'], todos("SELECT DISTINCT p.privilegio FROM privilegios_otorgados p
              WHERE (p.tipo = 'usuario' AND p.ref_id = ?) OR (p.tipo = 'grupo' AND p.ref_id IN (SELECT m.grupo_id FROM grupo_miembros m WHERE m.usuario_id = ?))", $id, $id));
        } catch (PDOException $e) { error_log('OIKOS: no se pudieron leer los privilegios: ' . $e->getMessage()); $claves = []; }   // que ingresar no dependa de estas tablas
        $claves = array_values(array_filter($claves, fn($k) => (PRIVILEGIOS[$k]['delegable'] ?? false) === true));   // lo no delegable nunca vale por una fila suelta
    }
    $memo[$id] = [$u['rol'], $claves];
    return $claves;
}
function tiene_privilegio(array $u, string $clave): bool { return in_array($clave, privilegios_de($u), true); }
function exigir_privilegio(array $u, string $clave, ?string $mensaje = null): void {
    if (!tiene_privilegio($u, $clave)) falla(403, $mensaje ?? sprintf(MENSAJE_PRIVILEGIO, PRIVILEGIOS[$clave]['nombre']));
}
// ¿Puede entrar a la pantalla de Administración? Calidad (como siempre) o alguien con algún privilegio delegable
function puede_administrar(array $u): bool {
    return es_calidad($u) || array_intersect(privilegios_de($u), array_keys(array_filter(PRIVILEGIOS, fn($p) => $p['delegable']))) !== [];
}

// El catálogo con a quién se le dio cada privilegio (solo el super usuario lo ve)
$R->get('/api/privilegios', function (Peticion $req) {
    solo_admin($req->u, 'Solo el administrador ve y otorga los privilegios');
    $e = $req->u['empresa_id'];
    $dados = todos('SELECT privilegio, tipo, ref_id FROM privilegios_otorgados');
    $usuarios = array_column(todos('SELECT id, nombre, usuario, activo FROM usuarios WHERE empresa_id = ?', $e), null, 'id');
    $grupos = array_column(todos('SELECT id, nombre FROM grupos WHERE empresa_id = ?', $e), null, 'id');
    $out = [];
    foreach (PRIVILEGIOS as $clave => $p) {
        $mios = array_filter($dados, fn($d) => $d['privilegio'] === $clave);
        $out[] = ['clave' => $clave, 'nombre' => $p['nombre'], 'descripcion' => $p['descripcion'], 'delegable' => $p['delegable'], 'super_usuario' => true,
            'usuarios' => array_values(array_map(fn($d) => ['id' => $d['ref_id'], 'nombre' => $usuarios[$d['ref_id']]['nombre'], 'activo' => $usuarios[$d['ref_id']]['activo']],
                array_filter($mios, fn($d) => $d['tipo'] === 'usuario' && isset($usuarios[$d['ref_id']])))),
            'grupos' => array_values(array_map(fn($d) => ['id' => $d['ref_id'], 'nombre' => $grupos[$d['ref_id']]['nombre']],
                array_filter($mios, fn($d) => $d['tipo'] === 'grupo' && isset($grupos[$d['ref_id']]))))];
    }
    return $out;
});

// Reemplaza a quiénes se les da un privilegio: {usuarios: [ids], grupos: [ids]}. Los administradores ya los tienen todos y no se anotan.
$R->put('/api/privilegios/:clave', function (Peticion $req) {
    solo_admin($req->u, 'Solo el administrador ve y otorga los privilegios');
    $clave = $req->p('clave');
    if (!isset(PRIVILEGIOS[$clave])) falla(404, 'Privilegio no encontrado');
    if (!PRIVILEGIOS[$clave]['delegable']) falla(400, 'Este privilegio es solo del super usuario (el administrador) y no se puede otorgar');
    $e = $req->u['empresa_id'];
    $usuarios = lista_ids($req->b('usuarios')); $grupos = lista_ids($req->b('grupos'));
    foreach ($usuarios as $id) {
        $f = uno('SELECT rol, activo FROM usuarios WHERE id = ? AND empresa_id = ?', $id, $e);
        if (!$f || !$f['activo']) falla(400, 'Una de las personas no existe o está desactivada');
        if ($f['rol'] === 'admin') falla(400, 'El administrador ya tiene todos los privilegios: no hace falta otorgárselos');
    }
    foreach ($grupos as $id) if (!uno('SELECT 1 FROM grupos WHERE id = ? AND empresa_id = ?', $id, $e)) falla(400, 'Uno de los grupos no existe');
    transaccion(function () use ($clave, $usuarios, $grupos, $req) {
        // se conserva quién lo otorgó y cuándo en lo que ya estaba dado; solo se agrega y se quita lo que cambió
        $antes = todos('SELECT tipo, ref_id FROM privilegios_otorgados WHERE privilegio = ?', $clave);
        $quedan = array_merge(array_map(fn($i) => "usuario:$i", $usuarios), array_map(fn($i) => "grupo:$i", $grupos));
        foreach ($antes as $a) if (!in_array("{$a['tipo']}:{$a['ref_id']}", $quedan, true)) ejecutar('DELETE FROM privilegios_otorgados WHERE privilegio = ? AND tipo = ? AND ref_id = ?', $clave, $a['tipo'], $a['ref_id']);
        foreach ($usuarios as $i) ejecutar("INSERT IGNORE INTO privilegios_otorgados (privilegio, tipo, ref_id, otorgado_por, fecha) VALUES (?, 'usuario', ?, ?, ?)", $clave, $i, $req->u['id'], ahora());
        foreach ($grupos as $i) ejecutar("INSERT IGNORE INTO privilegios_otorgados (privilegio, tipo, ref_id, otorgado_por, fecha) VALUES (?, 'grupo', ?, ?, ?)", $clave, $i, $req->u['id'], ahora());
    });
    return ['ok' => true, 'usuarios' => count($usuarios), 'grupos' => count($grupos)];
});
