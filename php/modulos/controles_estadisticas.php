<?php
// Estadísticas de controles: cuántos controles hay por proceso o por clase (Actual / Propuesto), con los mismos filtros del listado (filtro_controles en riesgos.php)
declare(strict_types=1);

// Atributos por los que se agrupa: columna que agrupa y columna que se muestra
const ATRIBUTOS_CONTROL = ['proceso' => ['pr.id', 'pr.nombre'], 'clase' => ['c.clase', 'c.clase']];

$R->get('/api/controles-estadisticas', function (Peticion $req) {
    $atributo = txt($req->q('atributo'));
    if ($atributo !== '' && !isset(ATRIBUTOS_CONTROL[$atributo])) falla(400, 'El atributo es Proceso o Clase');
    $f = filtro_controles($req);
    $desde = 'FROM controles c JOIN riesgos r ON r.id = c.riesgo_id JOIN procesos pr ON pr.id = r.proceso_id WHERE ' . $f['sql'];
    $total = (int)uno('SELECT COUNT(*) n ' . $desde, ...$f['params'])['n'];
    $filas = [];
    if ($atributo !== '') {
        [$agrupa, $muestra] = ATRIBUTOS_CONTROL[$atributo];
        // De mayor a menor; a igual cantidad, por nombre
        foreach (todos("SELECT $agrupa clave, $muestra etiqueta, COUNT(*) cantidad $desde GROUP BY $agrupa, $muestra ORDER BY cantidad DESC, etiqueta", ...$f['params']) as $x)
            $filas[] = ['clave' => $x['clave'], 'nombre' => $x['etiqueta'], 'total' => (int)$x['cantidad'], 'porcentaje' => round((int)$x['cantidad'] * 100 / $total, 2)];
    }
    return ['atributo' => $atributo, 'total' => $total, 'filas' => $filas];
});
