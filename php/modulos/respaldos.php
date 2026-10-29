<?php
// Copias de seguridad desde Administración → Respaldos (solo administrador). La copia diaria la hace el Cron de cPanel
// con herramientas/respaldar.php (ver DESPLIEGUE.md).
declare(strict_types=1);
require_once __DIR__ . '/../respaldo.php';

$R->get('/api/respaldos', function (Peticion $req) {
    solo_admin($req->u);
    return ['automatico' => (bool)config('respaldo_automatico'), 'hora' => (int)(config('respaldo_hora') ?? 2), 'conservar' => conservar_respaldos(), 'archivos' => listar_respaldos()];
});
$R->post('/api/respaldos', function (Peticion $req) { solo_admin($req->u); return crear_respaldo(); });
$R->get('/api/respaldos/:nombre', function (Peticion $req) {
    solo_admin($req->u);
    if (!preg_match(PATRON_RESPALDO, $req->p('nombre'))) falla(400, 'Nombre de respaldo inválido');
    descargar(dir_respaldos() . '/' . $req->p('nombre'), $req->p('nombre'));
    return null;
});
