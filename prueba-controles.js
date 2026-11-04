// Prueba de la clase de los controles (Actual / Propuesto) y de sus estadísticas: node prueba-controles.js (con el servidor corriendo y la base limpia)
// Estado inicial de la base de prueba: 3 controles de ejemplo, todos «Actual»: C-PRO-01 (Detectivo) y C-PRO-02 (Preventivo) del riesgo R-PRO-01 (proceso Producción)
// y C-ALM-01 (Preventivo) del riesgo R-ALM-01 (proceso Almacén y Compras). El Líder de prueba solo lidera Producción.
const B = 'http://localhost:3100/api';
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  const d = await r.json();
  return Array.isArray(d) ? Object.assign(d, { status: r.status }) : { status: r.status, ...d };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle).slice(0, 400)); } };
const resumen = d => (d.filas || []).map(f => `${f.nombre}=${f.total}`).join(', ');
const casi = (a, b) => Math.abs(a - b) < 0.005;

(async () => {
  for (const [u, usuario, clave] of [['lider', 'lider', 'lider123'], ['calidad', 'gestor', 'gestor123'], ['consulta', 'colaborador', 'colaborador123']])
    await llamar(u, '/login', { usuario, clave });
  const cat = await llamar('calidad', '/catalogos');
  const nombre = id => cat.procesos.find(p => p.id == id).nombre;
  const PRODUCCION = nombre(9), ALMACEN = nombre(11);

  // ---- La clase de los controles ----
  let lista = await llamar('consulta', '/controles');
  esperar('Los controles de ejemplo traen su clase y todos son «Actual»', lista.length === 3 && lista.every(c => c.clase === 'Actual'), lista.map(c => c.codigo + ':' + c.clase));

  // ---- Estadísticas sobre los controles de ejemplo ----
  let e = await llamar('consulta', '/controles-estadisticas?atributo=proceso');
  esperar('Por proceso: Producción 2 y Almacén 1, de mayor a menor', e.status === 200 && e.total === 3 && e.atributo === 'proceso' && e.filas.length === 2
    && e.filas[0].nombre === PRODUCCION && e.filas[0].total === 2 && e.filas[1].nombre === ALMACEN && e.filas[1].total === 1, e);
  esperar('Por proceso: el porcentaje de cada fila (66,67 y 33,33) y la suma da 100', casi(e.filas[0].porcentaje, 66.67) && casi(e.filas[1].porcentaje, 33.33)
    && casi(e.filas.reduce((s, f) => s + f.porcentaje, 0), 100), e.filas);
  esperar('Cada fila trae su clave (id del proceso)', e.filas[0].clave == 9 && e.filas[1].clave == 11, e.filas);
  e = await llamar('consulta', '/controles-estadisticas?atributo=clase');
  esperar('Por clase: los 3 son «Actual» (100 %)', e.total === 3 && e.filas.length === 1 && e.filas[0].nombre === 'Actual' && e.filas[0].total === 3 && casi(e.filas[0].porcentaje, 100), e);
  e = await llamar('consulta', '/controles-estadisticas');
  esperar('Sin atributo da el total y ninguna fila (el selector queda vacío)', e.status === 200 && e.atributo === '' && e.total === 3 && e.filas.length === 0, e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=cargo');
  esperar('Un atributo desconocido se rechaza', e.status === 400 && /Proceso o Clase/.test(e.error), e);
  e = await llamar('anonimo', '/controles-estadisticas?atributo=clase');
  esperar('Sin sesión no se ven las estadísticas', e.status === 401, e);

  // ---- Crear controles con y sin clase ----
  let r = await llamar('lider', '/controles', { riesgo_id: 1, descripcion: 'Doble verificación de la soldadura por un segundo inspector', clasificacion: 'Preventivo', clase: 'Propuesto',
    efectividad: 'Moderado', mitiga_probabilidad: '1', responsable_gestion_id: 3 });
  esperar('El Líder crea un control «Propuesto» en su proceso (C-PRO-03)', r.id, r);
  const propuesto = r.id;
  r = await llamar('lider', '/controles', { riesgo_id: 1, descripcion: 'Registro fotográfico del primer cordón de cada lote', clasificacion: 'Correctivo', efectividad: 'Débil', mitiga_impacto: '1' });
  esperar('Sin clase, el control nuevo queda «Actual» (C-PRO-04)', r.id, r);
  const sinClase = r.id;
  r = await llamar('lider', '/controles', { riesgo_id: 1, descripcion: 'Control con una clase inventada', clasificacion: 'Preventivo', clase: 'Futuro', efectividad: 'Fuerte', mitiga_probabilidad: '1' });
  esperar('Una clase que no es Actual ni Propuesto se rechaza', r.status === 400 && /Actual o Propuesto/.test(r.error), r);
  lista = await llamar('consulta', '/controles');
  const claseDe = cod => lista.find(c => c.codigo === cod)?.clase;
  esperar('El listado muestra la clase de cada control', lista.length === 5 && claseDe('C-PRO-03') === 'Propuesto' && claseDe('C-PRO-04') === 'Actual' && claseDe('C-PRO-01') === 'Actual', lista.map(c => c.codigo + ':' + c.clase));

  e = await llamar('consulta', '/controles-estadisticas?atributo=clase');
  esperar('Por clase: Actual 4 (80 %) y Propuesto 1 (20 %)', e.total === 5 && e.filas.length === 2 && e.filas[0].nombre === 'Actual' && e.filas[0].total === 4 && casi(e.filas[0].porcentaje, 80)
    && e.filas[1].nombre === 'Propuesto' && e.filas[1].total === 1 && casi(e.filas[1].porcentaje, 20), e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=proceso');
  esperar('Por proceso: Producción 4 (80 %) y Almacén 1 (20 %)', e.total === 5 && e.filas[0].nombre === PRODUCCION && e.filas[0].total === 4 && casi(e.filas[0].porcentaje, 80)
    && e.filas[1].total === 1 && casi(e.filas[1].porcentaje, 20), e);

  // ---- Editar: la clase se conserva si no se envía, y se puede cambiar ----
  r = await llamar('lider', `/controles/${propuesto}`, { descripcion: 'Doble verificación de la soldadura por un segundo inspector', clasificacion: 'Preventivo', efectividad: 'Fuerte', mitiga_probabilidad: '1' }, 'PUT');
  lista = await llamar('consulta', '/controles');
  esperar('Editar sin mandar la clase no la borra: sigue «Propuesto»', r.id && claseDe('C-PRO-03') === 'Propuesto', lista.find(c => c.codigo === 'C-PRO-03'));
  r = await llamar('lider', `/controles/${propuesto}`, { descripcion: 'Doble verificación de la soldadura por un segundo inspector', clasificacion: 'Preventivo', clase: 'Actual', efectividad: 'Fuerte', mitiga_probabilidad: '1' }, 'PUT');
  e = await llamar('consulta', '/controles-estadisticas?atributo=clase');
  esperar('Al pasar el control a «Actual» ya no hay propuestos', e.filas.length === 1 && e.filas[0].nombre === 'Actual' && e.filas[0].total === 5, e);
  r = await llamar('lider', `/controles/${propuesto}`, { descripcion: 'Doble verificación de la soldadura por un segundo inspector', clasificacion: 'Preventivo', clase: 'Propuesto', efectividad: 'Moderado', mitiga_probabilidad: '1', responsable_gestion_id: 3 }, 'PUT');
  r = await llamar('lider', `/controles/${propuesto}`, { descripcion: 'x', clasificacion: 'Preventivo', clase: 'Otra', mitiga_probabilidad: '1' }, 'PUT');
  esperar('Editar con una clase inválida se rechaza', r.status === 400, r);

  // ---- Los filtros del listado valen para las estadísticas ----
  e = await llamar('consulta', '/controles-estadisticas?atributo=proceso&clasificacion=Detectivo');
  esperar('Filtro por clasificación Detectivo: solo C-PRO-01', e.total === 1 && e.filas.length === 1 && e.filas[0].nombre === PRODUCCION, e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=clase&clasificacion=Preventivo');
  esperar('Filtro Preventivo por clase: 2 actuales y 1 propuesto', e.total === 3 && e.filas[0].nombre === 'Actual' && e.filas[0].total === 2 && casi(e.filas[0].porcentaje, 66.67)
    && e.filas[1].nombre === 'Propuesto' && e.filas[1].total === 1 && casi(e.filas[1].porcentaje, 33.33), e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=proceso&proceso=11');
  esperar('Filtro por proceso (Almacén): 1 control', e.total === 1 && e.filas.length === 1 && e.filas[0].nombre === ALMACEN && casi(e.filas[0].porcentaje, 100), e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=proceso&proceso=9&proceso=11');
  esperar('Dos procesos a la vez: 5 controles', e.total === 5 && e.filas.length === 2, e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=clase&responsable=3&rol=gestion');
  esperar('Responsable de gestión 3: C-PRO-01, C-PRO-02 y el propuesto', e.total === 3 && resumen(e) === 'Actual=2, Propuesto=1', e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=clase&responsable=2&rol=revision');
  esperar('Responsable de revisión 2: los 3 controles de ejemplo', e.total === 3 && resumen(e) === 'Actual=3', e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=clase&texto=soldadura');
  esperar('Búsqueda de texto (también por el nombre del riesgo): los 4 controles del riesgo de soldadura', e.total === 4 && resumen(e) === 'Actual=3, Propuesto=1', e);
  e = await llamar('consulta', '/controles-estadisticas?atributo=clase&texto=zzz-no-existe');
  esperar('Sin coincidencias: total 0 y sin filas', e.status === 200 && e.total === 0 && e.filas.length === 0, e);

  // ---- Alcance: el Líder solo cuenta lo de sus procesos ----
  e = await llamar('lider', '/controles-estadisticas?atributo=proceso');
  esperar('El Líder de Producción solo ve su proceso (4 controles, no los de Almacén)', e.total === 4 && e.filas.length === 1 && e.filas[0].nombre === PRODUCCION && casi(e.filas[0].porcentaje, 100), e);
  e = await llamar('lider', '/controles-estadisticas?atributo=proceso&proceso=11');
  esperar('Aunque pida otro proceso, el Líder no ve controles ajenos', e.total === 0 && e.filas.length === 0, e);
  e = await llamar('calidad', '/controles-estadisticas?atributo=clase');
  esperar('Calidad ve todo: Actual 4 y Propuesto 1', e.total === 5 && resumen(e) === 'Actual=4, Propuesto=1', e);

  // ---- Importar controles con la columna «clase» (opcional) ----
  const csv = 'riesgo_codigo;descripcion;clasificacion;efectividad;mitiga_probabilidad;mitiga_impacto;clase\n' +
    'R-ALM-01;Segundo proveedor homologado de lámina;Preventivo;Fuerte;si;no;Propuesto\n' +
    'R-ALM-01;Revisión mensual del inventario;Detectivo;Moderado;no;si;\n' +
    'R-ALM-01;Control con una clase inventada;Preventivo;Fuerte;si;no;Futuro';
  r = await llamar('calidad', '/importar/controles', { csv });
  esperar('Importar controles: acepta Propuesto o vacía y rechaza una clase inventada', r.validas === 2 && r.errores === 1 && /clase/.test(r.filas[2].error), r.filas);
  r = await llamar('calidad', '/importar/controles', { csv: csv.split('\n').slice(0, 3).join('\n'), aplicar: true });
  esperar('Se importan los 2 controles válidos', r.aplicado, r);
  e = await llamar('calidad', '/controles-estadisticas?atributo=clase');
  esperar('Por clase queda: Actual 5 (71,43 %) y Propuesto 2 (28,57 %)', e.total === 7 && resumen(e) === 'Actual=5, Propuesto=2' && casi(e.filas[0].porcentaje, 71.43) && casi(e.filas[1].porcentaje, 28.57), e);
  e = await llamar('calidad', '/controles-estadisticas?atributo=proceso');
  esperar('Por proceso queda: Producción 4 y Almacén 3', e.total === 7 && e.filas[0].nombre === PRODUCCION && e.filas[0].total === 4 && e.filas[1].nombre === ALMACEN && e.filas[1].total === 3, e);
  const plantilla = await fetch(B + '/importar/controles/plantilla', { headers: { cookie: sesiones.calidad } });
  esperar('La plantilla de importación incluye la columna clase', /clase/.test(await plantilla.text()), plantilla.status);

  // ---- El riesgo residual solo cuenta los controles «Actual»: un «Propuesto» todavía no baja el riesgo ----
  let rg = await llamar('consulta', '/riesgos/1');
  esperar('R-PRO-01: tiene 4 controles pero solo 3 actuales cuentan (C-PRO-03 es propuesto)', rg.total_controles === 4 && rg.controles_actuales === 3 && rg.controles.some(c => c.clase === 'Propuesto'), rg.controles && rg.controles.map(c => c.codigo + ':' + c.clase));
  const alm = (await llamar('consulta', '/riesgos')).find(x => x.codigo === 'R-ALM-01');
  rg = await llamar('consulta', '/riesgos/' + alm.id);
  esperar('R-ALM-01 (3×5): 3 controles, 2 actuales; el propuesto «Fuerte» sobre la probabilidad NO la baja (sigue en 3)',
    rg.total_controles === 3 && rg.controles_actuales === 2 && rg.probabilidad_residual === 3 && rg.impacto_residual === 3 && rg.puntaje_residual === 9 && rg.zona_residual === 'Moderada',
    { total: rg.total_controles, actuales: rg.controles_actuales, p: rg.probabilidad_residual, i: rg.impacto_residual, zona: rg.zona_residual });
  esperar('La lista de la matriz da el mismo residual que la ficha', (await llamar('consulta', '/riesgos')).find(x => x.id === alm.id).puntaje_residual === 9, null);
  const prop = rg.controles.find(c => c.clase === 'Propuesto');
  r = await llamar('calidad', `/controles/${prop.id}`, { descripcion: prop.descripcion, clasificacion: prop.clasificacion, clase: 'Actual', efectividad: prop.efectividad, mitiga_probabilidad: '1' }, 'PUT');
  rg = await llamar('consulta', '/riesgos/' + alm.id);
  esperar('Al pasar el control a «Actual» sí cuenta: la probabilidad residual baja de 3 a 1 (3 actuales)', r.status === 200 && rg.controles_actuales === 3 && rg.probabilidad_residual === 1 && rg.puntaje_residual === 3 && rg.zona_residual === 'Baja',
    { r, actuales: rg.controles_actuales, p: rg.probabilidad_residual, zona: rg.zona_residual });
  r = await llamar('calidad', `/controles/${prop.id}`, { descripcion: prop.descripcion, clasificacion: prop.clasificacion, clase: 'Propuesto', efectividad: prop.efectividad, mitiga_probabilidad: '1' }, 'PUT');
  rg = await llamar('consulta', '/riesgos/' + alm.id);
  esperar('Y al volver a «Propuesto» deja de contar: residual otra vez 3×3', r.status === 200 && rg.controles_actuales === 2 && rg.probabilidad_residual === 3 && rg.puntaje_residual === 9, { p: rg.probabilidad_residual, puntaje: rg.puntaje_residual });

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nLas estadísticas de controles funcionan');
  process.exit(fallos ? 1 : 0);
})();
