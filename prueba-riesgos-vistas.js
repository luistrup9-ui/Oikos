// Prueba de las vistas de la matriz de riesgos: node prueba-riesgos-vistas.js (con el servidor corriendo y la base limpia)
// Parte A: el plan de acción de la matriz (/api/riesgos-planes) y las fechas ejecutadas de los planes. Parte B: las funciones de conteo de
// public/riesgos-vistas.js (torta por zona, distribución, exposición), que se ejecutan aquí en Node con los riesgos reales que devuelve la API.
// Base de prueba: R-PRO-01 (Producción, 4×4 Extrema → residual 1×4 Baja), R-ALM-01 (Almacén, 3×5 Extrema → residual 3×4 Alta) y R-GTH-01 (Talento Humano, 3×4 Alta).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
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
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle).slice(0, 500)); } };
const codigos = filas => filas.map(f => f.riesgo_codigo + ':' + f.actividad.split(' ')[0]).join(', ');
const hoy = new Date().toISOString().slice(0, 10);                                                   // el servidor cuenta los días en UTC, igual que esto
const dia = n => new Date(Date.parse(hoy + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

(async () => {
  for (const [u, usuario, clave] of [['lider', 'lider', 'lider123'], ['calidad', 'gestor', 'gestor123'], ['consulta', 'colaborador', 'colaborador123']])
    await llamar(u, '/login', { usuario, clave });
  const cat = await llamar('calidad', '/catalogos');
  const proc = s => cat.procesos.find(p => p.sigla === s);
  const PRO = proc('PRO'), ALM = proc('ALM'), GTH = proc('GTH');

  // ================= A. Plan de acción de la matriz =================
  let planes = await llamar('consulta', '/riesgos-planes');
  esperar('Sin planes todavía: la lista viene vacía', planes.status === 200 && planes.length === 0, planes);
  planes = await llamar('anonimo', '/riesgos-planes');
  esperar('Sin sesión no se ve el plan de acción', planes.status === 401, planes);

  // A: va a mitad de camino y lleva 30 %; B: ya venció y está cerrado, con fechas ejecutadas; C: sin fechas; D: todavía no empieza
  const a = await llamar('lider', '/planes-accion', { riesgo_id: 1, nombre: 'Capacitar a los operarios en soldadura', avance: 30, fecha_inicio: dia(-10), fecha_fin: dia(10) });
  const b = await llamar('lider', '/planes-accion', { riesgo_id: 1, nombre: 'Recalibrar las soldadoras', avance: 100, fecha_inicio: dia(-30), fecha_fin: dia(-10), fecha_inicio_real: dia(-28), fecha_fin_real: dia(-12) });
  const c = await llamar('calidad', '/planes-accion', { riesgo_id: 2, nombre: 'Homologar un segundo proveedor', avance: 10 });
  const d = await llamar('calidad', '/planes-accion', { riesgo_id: 2, nombre: 'Negociar stock de seguridad', avance: 20, fecha_inicio: dia(5), fecha_fin: dia(15) });
  esperar('Se crean los 4 planes de prueba (dos por riesgo)', a.id && b.id && c.id && d.id, { a, b, c, d });

  planes = await llamar('consulta', '/riesgos-planes');
  const fila = id => planes.find(p => p.id === id);
  esperar('La lista trae los 4 planes', planes.status === 200 && planes.length === 4, planes.length);
  const lista = await llamar('calidad', '/riesgos');
  const posicion = p => lista.findIndex(r => r.id === p.riesgo_id) * 1e6 + p.id;
  esperar('Van en el orden de la matriz (proceso y código del riesgo) y, dentro del riesgo, por antigüedad', planes.every((p, i) => !i || posicion(planes[i - 1]) < posicion(p)), codigos(planes));
  const A = fila(a.id), Bp = fila(b.id), C = fila(c.id), D = fila(d.id);
  esperar('Cada fila trae proceso, código y nombre del riesgo, actividad, responsable y estado', A.proceso === PRO.nombre && A.riesgo_codigo === 'R-PRO-01' && /soldadura/.test(A.riesgo)
    && A.actividad === 'Capacitar a los operarios en soldadura' && /Líder/.test(A.responsable) && A.estado === 'En curso' && A.avance === 30 && A.riesgo_id === 1, A);
  esperar('Planeado: las fechas planeadas del plan', A.planeado_inicio === dia(-10) && A.planeado_fin === dia(10) && A.ejecutado_inicio === null && A.ejecutado_fin === null, A);
  esperar('Ejecutado: las fechas reales del plan cerrado', Bp.ejecutado_inicio === dia(-28) && Bp.ejecutado_fin === dia(-12) && Bp.estado === 'Cerrado', Bp);
  esperar('Balance de A: a mitad del plazo debería llevar 50 % y lleva 30 % → −20', A.avance_planeado === 50 && A.balance === -20, A);
  esperar('Balance de B: el plazo ya pasó (100 %) y está al 100 % → 0', Bp.avance_planeado === 100 && Bp.balance === 0, Bp);
  esperar('Balance de D: aún no empieza (0 %) y lleva 20 % → +20 (adelantado)', D.avance_planeado === 0 && D.balance === 20, D);
  esperar('Un plan sin fechas planeadas no tiene balance (no se inventa)', C.avance_planeado === null && C.balance === null && C.planeado_inicio === null && C.planeado_fin === null, C);

  // ---- Fechas ejecutadas al guardar ----
  let r = await llamar('lider', '/planes-accion', { id: a.id, riesgo_id: 1, nombre: 'x', avance: 30, fecha_inicio_real: '2026-13-45' });
  esperar('Una fecha ejecutada imposible se rechaza', r.status === 400 && /fecha válida/.test(r.error), r);
  r = await llamar('lider', '/planes-accion', { id: a.id, riesgo_id: 1, nombre: 'x', avance: 30, fecha_inicio_real: 'ayer' });
  esperar('Un texto que no es fecha se rechaza', r.status === 400, r);
  r = await llamar('lider', '/planes-accion', { id: a.id, riesgo_id: 1, nombre: 'x', avance: 30, fecha_inicio_real: dia(-5), fecha_fin_real: dia(-6) });
  esperar('El fin ejecutado no puede ser anterior al inicio ejecutado', r.status === 400 && /anterior/.test(r.error), r);
  r = await llamar('lider', '/planes-accion', { riesgo_id: 1, nombre: 'Plan nuevo con fechas malas', fecha_fin_real: '31/12/2026' });
  esperar('Al crear también se validan', r.status === 400, r);
  planes = await llamar('consulta', '/riesgos-planes');
  esperar('Lo rechazado no cambió nada (siguen 4 planes y A sin fechas ejecutadas)', planes.length === 4 && fila(a.id).ejecutado_inicio === null, planes.length);

  // Como la pantalla real, quien guarda manda también el responsable (si no, el plan queda sin responsable y el Líder ya no podría editarlo)
  const yoLider = (await llamar('lider', '/yo')).id;
  const plan = (extra = {}) => ({ id: a.id, riesgo_id: 1, nombre: 'Capacitar a los operarios en soldadura', responsable_id: yoLider, avance: 60, fecha_inicio: dia(-10), fecha_fin: dia(10), ...extra });
  r = await llamar('lider', '/planes-accion', plan({ fecha_inicio_real: dia(-9) }));
  planes = await llamar('consulta', '/riesgos-planes');
  esperar('Se guarda el inicio ejecutado y el avance nuevo sube el balance (60 − 50 = +10)', r.status === 200 && fila(a.id).ejecutado_inicio === dia(-9) && fila(a.id).ejecutado_fin === null && fila(a.id).balance === 10, [r, fila(a.id)]);
  r = await llamar('lider', '/planes-accion', plan());
  planes = await llamar('consulta', '/riesgos-planes');
  esperar('Si quien guarda no manda las fechas ejecutadas (pantalla vieja), se conservan', r.status === 200 && fila(a.id).ejecutado_inicio === dia(-9), [r, fila(a.id)]);
  r = await llamar('lider', '/planes-accion', plan({ fecha_inicio_real: '', fecha_fin_real: '' }));
  planes = await llamar('consulta', '/riesgos-planes');
  esperar('Mandarlas vacías las borra', r.status === 200 && fila(a.id).ejecutado_inicio === null && fila(a.id).ejecutado_fin === null, [r, fila(a.id)]);
  r = await llamar('lider', '/planes-accion', plan({ fecha_inicio_real: dia(-9), fecha_fin_real: dia(-9) }));
  planes = await llamar('consulta', '/riesgos-planes');
  esperar('Inicio y fin ejecutados en el mismo día es válido', r.status === 200 && fila(a.id).ejecutado_inicio === dia(-9) && fila(a.id).ejecutado_fin === dia(-9), [r, fila(a.id)]);
  r = await llamar('consulta', '/planes-accion', { id: a.id, riesgo_id: 1, nombre: 'Intento ajeno', fecha_inicio_real: dia(-1) });
  planes = await llamar('consulta', '/riesgos-planes');
  esperar('Solo el responsable o Calidad cambian las fechas de un plan (Colaborador no)', r.status === 403 && fila(a.id).ejecutado_inicio === dia(-9), [r, fila(a.id)]);
  const ficha = await llamar('consulta', '/riesgos/1');
  esperar('La ficha del riesgo también trae las fechas ejecutadas de sus planes (para editarlas)', ficha.planes.length === 2 && 'fecha_inicio_real' in ficha.planes[0] && ficha.planes.some(p => p.fecha_fin_real === dia(-12)), ficha.planes);
  r = await llamar('consulta', '/planes-accion', { riesgo_id: 1, nombre: 'Intento de Colaborador' });
  esperar('Colaborador sigue sin crear planes', r.status === 403, r);

  // ---- Los mismos filtros de la matriz ----
  const procesoDe = f => [...new Set(f.map(p => p.riesgo_codigo))].join();
  planes = await llamar('consulta', `/riesgos-planes?proceso=${PRO.id}`);
  esperar('Filtro por proceso (Producción): solo los planes de R-PRO-01', planes.length === 2 && procesoDe(planes) === 'R-PRO-01', codigos(planes));
  planes = await llamar('consulta', `/riesgos-planes?proceso=${PRO.id}&proceso=${ALM.id}`);
  esperar('Dos procesos a la vez: los 4 planes', planes.length === 4, codigos(planes));
  planes = await llamar('consulta', '/riesgos-planes?tipo=' + encodeURIComponent('Compras y proveedores'));
  esperar('Filtro por tipo de riesgo (Compras y proveedores): solo los de R-ALM-01', planes.length === 2 && procesoDe(planes) === 'R-ALM-01', codigos(planes));
  planes = await llamar('consulta', '/riesgos-planes?texto=soldadura');
  esperar('Búsqueda de texto (en el nombre del riesgo): los de R-PRO-01', planes.length === 2 && procesoDe(planes) === 'R-PRO-01', codigos(planes));
  planes = await llamar('consulta', '/riesgos-planes?zona=Extrema');
  esperar('Zona absoluta Extrema: R-PRO-01 (4×4) y R-ALM-01 (3×5) → los 4 planes', planes.length === 4, codigos(planes));
  planes = await llamar('consulta', '/riesgos-planes?zona=Alta');
  esperar('Zona absoluta Alta: solo R-GTH-01, que no tiene planes → vacío', planes.status === 200 && planes.length === 0, planes);
  planes = await llamar('consulta', '/riesgos-planes?zona=Baja&matriz=residual');
  esperar('Zona residual Baja: R-PRO-01 queda en 1×4 tras sus controles → sus 2 planes', planes.length === 2 && procesoDe(planes) === 'R-PRO-01', codigos(planes));
  planes = await llamar('consulta', '/riesgos-planes?zona=Alta&matriz=residual');
  esperar('Zona residual Alta: R-ALM-01 (3×4) → sus 2 planes', planes.length === 2 && procesoDe(planes) === 'R-ALM-01', codigos(planes));
  planes = await llamar('consulta', '/riesgos-planes?texto=zzz-no-existe');
  esperar('Sin coincidencias: lista vacía', planes.status === 200 && planes.length === 0, planes);

  // ---- Alcance: el Líder solo ve lo de sus procesos ----
  planes = await llamar('lider', '/riesgos-planes');
  esperar('El Líder de Producción solo ve los planes de su proceso (2 de 4)', planes.length === 2 && procesoDe(planes) === 'R-PRO-01', codigos(planes));
  planes = await llamar('lider', `/riesgos-planes?proceso=${ALM.id}`);
  esperar('Aunque pida otro proceso, no ve planes ajenos', planes.status === 200 && planes.length === 0, planes);
  planes = await llamar('calidad', '/riesgos-planes');
  esperar('Calidad ve los 4', planes.length === 4, planes.length);

  // ================= B. Funciones de conteo de la pantalla (public/riesgos-vistas.js) =================
  // Se agregan tres riesgos para que haya riesgos en las cuatro zonas
  await llamar('lider', '/riesgos', { nombre: 'Multa por incumplimiento legal', proceso_id: PRO.id, tipo: 'Legales', probabilidad: 1, impacto: 2 });                    // 1×2 = 2 Baja
  await llamar('calidad', '/riesgos', { nombre: 'Demanda de un proveedor', proceso_id: ALM.id, tipo: 'Legales', probabilidad: 2, impacto: 3 });                         // 2×3 = 6 Moderada
  await llamar('calidad', '/riesgos', { nombre: 'Falta de caja para la nómina', proceso_id: GTH.id, tipo: 'Financieros y continuidad', probabilidad: 5, impacto: 5 });   // 5×5 = 25 Extrema
  const riesgos = await llamar('calidad', '/riesgos');
  const tipos = (await llamar('calidad', '/riesgos/catalogos')).tipos;
  const ctx = vm.createContext({ ZONAS: ['Baja', 'Moderada', 'Alta', 'Extrema'], esc: v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    zonaTag: z => `<span class="zona ${z}">${z}</span>` });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'public', 'riesgos-vistas.js'), 'utf8'), ctx);
  const pctZona = vm.runInContext('pctZona', ctx), balancePlan = vm.runInContext('balancePlan', ctx);          // las const no quedan como propiedades del contexto; las function sí
  const resumen = c => c.map(x => `${x.zona}=${x.cantidad}`).join(', ');
  esperar('Hay 6 riesgos para contar', riesgos.length === 6, riesgos.length);

  let z = ctx.contarZonas(riesgos, 'absoluto');
  esperar('Torta absoluta: Baja 1, Moderada 1, Alta 1, Extrema 3 (siempre las cuatro zonas, en ese orden)', resumen(z) === 'Baja=1, Moderada=1, Alta=1, Extrema=3', resumen(z));
  esperar('Los porcentajes son la parte del total (16,7 · 16,7 · 16,7 · 50) y suman 100', Math.abs(z[0].porcentaje - 16.667) < .01 && z[3].porcentaje === 50 && Math.abs(z.reduce((s, x) => s + x.porcentaje, 0) - 100) < 1e-9, z);
  z = ctx.contarZonas(riesgos, 'residual');
  esperar('Torta residual: Baja 2, Moderada 1, Alta 2, Extrema 1 (los controles bajaron R-PRO-01)', resumen(z) === 'Baja=2, Moderada=1, Alta=2, Extrema=1', resumen(z));
  z = ctx.contarZonas([], 'absoluto');
  esperar('Sin riesgos: las cuatro zonas en 0 y 0 % (sin dividir entre cero)', resumen(z) === 'Baja=0, Moderada=0, Alta=0, Extrema=0' && z.every(x => x.porcentaje === 0), z);
  const naive = (m, zona) => riesgos.filter(x => (m === 'residual' ? x.zona_residual : x.zona) === zona).length;
  esperar('Coincide con contar a mano zona por zona, absoluta y residual', ['Baja', 'Moderada', 'Alta', 'Extrema'].every(zn => ctx.contarZonas(riesgos, 'absoluto').find(x => x.zona === zn).cantidad === naive('absoluto', zn)
    && ctx.contarZonas(riesgos, 'residual').find(x => x.zona === zn).cantidad === naive('residual', zn)), null);

  let e = ctx.agruparExposicion(riesgos, 'absoluto', 'proceso');
  esperar('Exposición por proceso: un grupo por proceso con riesgos y sus totales suman 6', e.length === 3 && e.reduce((s, g) => s + g.total, 0) === 6 && e.every(g => Object.values(g.zonas).reduce((s, n) => s + n, 0) === g.total), e);
  esperar('Exposición por proceso: Producción tiene 2 riesgos (1 Extrema y 1 Baja)', (g => g.total === 2 && g.zonas.Extrema === 1 && g.zonas.Baja === 1)(e.find(g => g.nombre === PRO.nombre)), e);
  esperar('Los procesos salen en el orden del mapa de procesos (el mismo de la lista)', JSON.stringify(e.map(g => g.nombre)) === JSON.stringify([...new Set(riesgos.map(r => r.proceso))]), e.map(g => g.nombre));
  e = ctx.agruparExposicion(riesgos, 'residual', 'proceso');
  esperar('Exposición residual por proceso: Producción queda con 2 Baja', (g => g.zonas.Baja === 2 && g.zonas.Extrema === 0)(e.find(g => g.nombre === PRO.nombre)), e);
  e = ctx.agruparExposicion(riesgos, 'absoluto', 'tipo', tipos);
  esperar('Exposición por tipo: Calidad 1, Compras y proveedores 1, Legales 2, SST 1, Financieros 1', JSON.stringify(e.map(g => [g.nombre, g.total])) === JSON.stringify(
    tipos.filter(t => riesgos.some(r => r.tipo === t)).map(t => [t, riesgos.filter(r => r.tipo === t).length])), e.map(g => [g.nombre, g.total]));
  esperar('Los tipos salen en el orden del catálogo, no en el de aparición', e.map(g => g.nombre).join() === tipos.filter(t => e.some(g => g.nombre === t)).join(), e.map(g => g.nombre));
  esperar('Exposición por tipo: Legales tiene 1 Baja y 1 Moderada', (g => g.zonas.Baja === 1 && g.zonas.Moderada === 1 && g.total === 2)(e.find(g => g.nombre === 'Legales')), e);
  esperar('Sin riesgos no hay grupos', ctx.agruparExposicion([], 'absoluto', 'proceso').length === 0, null);

  // Torta (SVG): un trozo por zona con riesgos, un círculo entero si todo cae en una zona y un círculo vacío si no hay nada
  const torta = (lista, m) => ctx.tortaZonas(ctx.contarZonas(lista, m), 'prueba');
  let svg = torta(riesgos, 'absoluto');
  esperar('Torta con 4 zonas: 4 trozos, con su detalle (cantidad y %) al pasar el puntero', (svg.match(/<path /g) || []).length === 4 && /<title>Extrema: 3 \(50 %\)<\/title>/.test(svg) && /<title>Baja: 1 \(16,7 %\)<\/title>/.test(svg), svg.slice(0, 300));
  esperar('Los trozos grandes llevan su porcentaje escrito', /<text class="Extrema"[^>]*>50 %<\/text>/.test(svg), svg.slice(-300));
  svg = torta(riesgos.filter(x => x.zona === 'Extrema'), 'absoluto');
  esperar('Si todos están en una zona, la torta es un círculo entero (no un trozo degenerado)', /<circle class="Extrema"/.test(svg) && !/<path /.test(svg) && /100 %/.test(svg), svg.slice(0, 200));
  svg = torta([], 'absoluto');
  esperar('Sin riesgos, la torta es un círculo vacío', /class="vacia"/.test(svg) && !/<path /.test(svg), svg);
  svg = torta(riesgos, 'residual');
  esperar('La torta residual dibuja las 4 zonas con riesgos (Baja 2, Moderada 1, Alta 2, Extrema 1)', (svg.match(/<path /g) || []).length === 4 && /<title>Alta: 2 \(33,3 %\)<\/title>/.test(svg), svg.slice(0, 300));
  svg = ctx.tortaZonas([{ zona: 'Baja', cantidad: 1, porcentaje: 100 / 30 }, { zona: 'Moderada', cantidad: 0, porcentaje: 0 }, { zona: 'Extrema', cantidad: 29, porcentaje: 2900 / 30 }], 'prueba');
  esperar('Un trozo muy delgado (3,3 %) no lleva el porcentaje escrito encima (queda en el detalle) y la zona en 0 no dibuja trozo',
    (svg.match(/<path /g) || []).length === 2 && !/<text class="Baja"/.test(svg) && /<text class="Extrema"[^>]*>96,7 %<\/text>/.test(svg) && /<title>Baja: 1 \(3,3 %\)<\/title>/.test(svg), svg);
  const tabla = ctx.tablaZonas(ctx.contarZonas(riesgos, 'absoluto'), riesgos.length);
  esperar('La tabla trae las 4 zonas y la fila Total (6 y 100 %)', ['Baja', 'Moderada', 'Alta', 'Extrema'].every(zn => tabla.includes(`class="zona ${zn}"`)) && /<tr class="total"><td><b>Total<\/b><\/td><td class="num"><b>6<\/b><\/td><td class="num"><b>100 %<\/b><\/td>/.test(tabla), tabla.slice(-250));
  esperar('La tabla vacía muestra el total en 0 y sin porcentaje', /<b>0<\/b><\/td><td class="num"><b>—<\/b>/.test(ctx.tablaZonas(ctx.contarZonas([], 'absoluto'), 0)), null);
  const dist = ctx.vistaDistribucion(riesgos);
  esperar('La distribución muestra dos tablas lado a lado: absoluto y residual', (dist.match(/<table class="sin-dt">/g) || []).length === 2 && dist.indexOf('Riesgo absoluto') < dist.indexOf('Riesgo residual'), dist.slice(0, 200));
  esperar('Los porcentajes se escriben con coma decimal y un decimal', [pctZona(1.527), pctZona(62.6), pctZona(100), pctZona(0)].join('|') === '1,5 %|62,6 %|100 %|0 %', null);
  esperar('El balance del plan: en rojo si hay atraso, en verde si no, y un guion si no hay fechas', /balance-plan atraso">[-−]20 %/.test(balancePlan(-20)) && /balance-plan adelanto">\+10 %/.test(balancePlan(10))
    && /balance-plan adelanto">0 %/.test(balancePlan(0)) && /—/.test(balancePlan(null)), [balancePlan(-20), balancePlan(10), balancePlan(null)]);

  // ---- Casos límite del balance: planes de un solo día, fechas con hora y fechas al revés ----
  const unPlan = async (nombre, extra) => (await llamar('lider', '/planes-accion', { riesgo_id: 1, nombre, responsable_id: yoLider, ...extra })).id;
  const e1 = await unPlan('Auditar el taller hoy', { avance: 40, fecha_inicio: dia(0), fecha_fin: dia(0) });
  const e2 = await unPlan('Auditar el taller en tres días', { avance: 0, fecha_inicio: dia(3), fecha_fin: dia(3) });
  const e3 = await unPlan('Auditar el taller hace tres días', { avance: 100, fecha_inicio: dia(-3), fecha_fin: dia(-3) });
  const e4 = await unPlan('Plan con las fechas al revés', { avance: 50, fecha_inicio: dia(5), fecha_fin: dia(-5) });
  const e5 = await unPlan('Plan con fechas guardadas con hora', { avance: 50, fecha_inicio: dia(-10) + 'T08:00:00', fecha_fin: dia(10) + 'T18:30:00' });
  planes = await llamar('calidad', '/riesgos-planes');
  esperar('Plan de un solo día: el día que llega ya debería estar completo (100 %), antes de ese día va en 0 % y después, en 100 %',
    fila(e1).avance_planeado === 100 && fila(e1).balance === -60 && fila(e2).avance_planeado === 0 && fila(e2).balance === 0 && fila(e3).avance_planeado === 100 && fila(e3).balance === 0, [fila(e1), fila(e2), fila(e3)]);
  esperar('Fechas planeadas al revés (el fin antes del inicio): no se calcula balance', fila(e4).avance_planeado === null && fila(e4).balance === null, fila(e4));
  esperar('Las fechas planeadas guardadas con hora cuentan por el día (50 % a mitad del plazo) y se muestran solo como día', fila(e5).avance_planeado === 50 && fila(e5).balance === 0 && fila(e5).planeado_inicio === dia(-10) && fila(e5).planeado_fin === dia(10), fila(e5));

  // ---- Un riesgo retirado deja de aparecer en el plan de acción de la matriz ----
  r = await llamar('calidad', '/riesgos/2', null, 'DELETE');
  planes = await llamar('calidad', '/riesgos-planes');
  esperar('Al retirar R-ALM-01 de la matriz, sus planes salen de la lista (quedan los 7 de Producción)', r.ok && planes.length === 7 && procesoDe(planes) === 'R-PRO-01', codigos(planes));

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nLas vistas de la matriz de riesgos funcionan');
  process.exit(fallos ? 1 : 0);
})();
