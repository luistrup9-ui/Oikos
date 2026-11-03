// Prueba de las evaluaciones completas (módulo 1 del encargo de Almera): catálogos de parametrización, escala de 4 niveles con porcentaje y semáforo,
// informe por unidad, historial de transiciones, plan de mejoramiento y reporte de puntos de atención. Uso: node herramientas/correr-pruebas.mjs evaluaciones
const B = 'http://localhost:3100/api';
const CUENTA = { produccion: 'lider', calidad: 'gestor', consulta: 'colaborador' }; // etiqueta de la prueba → cuenta sembrada por rol
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? (/\/(items|actividades)\/\d+$/.test(ruta) ? 'PUT' : 'POST') : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  const txt = await r.text(); let d; try { d = JSON.parse(txt); } catch { throw new Error(`${o.method} ${ruta} → ${r.status}: ${txt.slice(0, 200)}`); }
  return Array.isArray(d) ? Object.assign(d, { status: r.status }) : { status: r.status, ...d };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle)?.slice(0, 400)); } };

(async () => {
  for (const [u, c] of [['produccion', 'lider123'], ['calidad', 'gestor123'], ['consulta', 'colaborador123'], ['admin', 'admin123']])
    await llamar(u, '/login', { usuario: CUENTA[u] || u, clave: c });
  const cat = await llamar('calidad', '/catalogos');
  const pid = s => cat.procesos.find(p => p.sigla === s).id;
  const uid = u => cat.usuarios.find(x => x.nombre.includes(u)).id;
  const anio = new Date().getFullYear();

  // ---- Catálogos que usa quien programa evaluaciones ----
  let ca = await llamar('calidad', '/evaluaciones/catalogos');
  esperar('Emisores CAL, MC y EXT con los nombres de siempre', ca.emisores.map(e => `${e.sigla}:${e.nombre}`).join('|') === 'CAL:Coordinador de Calidad|MC:Dueños de proceso|EXT:Externo', ca.emisores);
  esperar('Los 4 tipos de siempre y «Auditoría interna» por defecto', ca.tipos.join('|') === 'Auditoría interna|Auditoría externa|Autoevaluación|Inspección' && ca.tipo_defecto === 'Auditoría interna', ca);
  esperar('La escala tiene 4 niveles con su color', ca.niveles.map(n => `${n.nombre}:${n.color}`).join('|') === 'Cumple:verde|Cumple parcialmente:amarillo|No cumple:rojo|No aplica:gris', ca.niveles);
  esperar('Semáforo por defecto: verde desde 80 %, amarillo desde 60 %', ca.cortes.verde === 80 && ca.cortes.amarillo === 60, ca.cortes);
  esperar('Los ciclos empiezan vacíos', ca.ciclos.length === 0 && ca.clasificaciones.map(c => c.nombre).join() === 'Hallazgo', ca);

  // ---- Permisos de la parametrización ----
  esperar('Solo Calidad y el administrador ven la parametrización',
    (await llamar('produccion', '/eval-param')).status === 403 && (await llamar('consulta', '/eval-param')).status === 403
    && (await llamar('calidad', '/eval-param')).status === 200 && (await llamar('admin', '/eval-param')).status === 200, null);
  esperar('Y solo ellos la cambian', (await llamar('produccion', '/eval-param/ciclos', { nombre: 'X' })).status === 403
    && (await llamar('produccion', '/eval-param/semaforo', { verde: 90, amarillo: 70 }, 'PUT')).status === 403, null);

  // ---- Emisores ----
  let p = await llamar('calidad', '/eval-param');
  const mc = p.emisores.find(e => e.sigla === 'MC');
  esperar('Dueños de proceso (MC) trae Riesgos, Indicadores y Trámites por defecto; los otros no',
    mc.riesgos_defecto === 1 && mc.indicadores_defecto === 1 && mc.tramites_defecto === 1 && p.emisores.filter(e => e.sigla !== 'MC').every(e => !e.riesgos_defecto && !e.indicadores_defecto && !e.tramites_defecto), p.emisores);
  let r = await llamar('calidad', `/eval-param/emisores/${mc.id}`, { tramites_defecto: 0 }, 'PUT');
  p = await llamar('calidad', '/eval-param');
  esperar('Se puede desmarcar una opción y las demás se conservan', r.ok && p.emisores.find(e => e.sigla === 'MC').tramites_defecto === 0 && p.emisores.find(e => e.sigla === 'MC').riesgos_defecto === 1, p.emisores);
  esperar('Un emisor que no existe da 404', (await llamar('calidad', '/eval-param/emisores/99999', {}, 'PUT')).status === 404, null);

  // ---- Tipos ----
  const externa = p.tipos.find(t => t.nombre === 'Auditoría externa'), interna = p.tipos.find(t => t.nombre === 'Auditoría interna');
  r = await llamar('calidad', `/eval-param/tipos/${externa.id}`, {}, 'PUT');
  p = await llamar('calidad', '/eval-param');
  esperar('Un solo tipo queda por defecto', r.ok && p.tipos.filter(t => t.por_defecto).map(t => t.nombre).join() === 'Auditoría externa', p.tipos);
  esperar('Todos los tipos nacen en Planeación y cuentan evaluaciones y cronogramas', p.tipos.every(t => t.estado_inicial === 'Planeación' && t.evaluaciones === 0 && t.cronogramas === 0), p.tipos);
  await llamar('calidad', `/eval-param/tipos/${interna.id}`, {}, 'PUT');
  esperar('El catálogo de evaluaciones refleja el tipo por defecto', (await llamar('calidad', '/evaluaciones/catalogos')).tipo_defecto === 'Auditoría interna', null);

  // ---- Ciclos ----
  r = await llamar('calidad', '/eval-param/ciclos', { nombre: 'Ciclo anual' });
  const ciclo = r.id; esperar('Calidad crea un ciclo', !!ciclo, r);
  esperar('No repite el nombre ni acepta uno vacío', (await llamar('calidad', '/eval-param/ciclos', { nombre: 'Ciclo anual' })).status === 400 && (await llamar('calidad', '/eval-param/ciclos', { nombre: '  ' })).status === 400, null);
  r = await llamar('calidad', `/eval-param/ciclos/${ciclo}`, { nombre: 'Ciclo semestral', orden: 5 }, 'PUT');
  p = await llamar('calidad', '/eval-param');
  esperar('Se renombra y se ordena', r.ok && p.ciclos[0].nombre === 'Ciclo semestral' && p.ciclos[0].orden === 5, p.ciclos);
  esperar('Un ciclo activo aparece al programar evaluaciones', (await llamar('calidad', '/evaluaciones/catalogos')).ciclos.map(c => c.nombre).join() === 'Ciclo semestral', null);
  await llamar('calidad', `/eval-param/ciclos/${ciclo}`, { activo: 0 }, 'PUT');
  esperar('Uno inactivo ya no se ofrece', (await llamar('calidad', '/evaluaciones/catalogos')).ciclos.length === 0, null);
  await llamar('calidad', `/eval-param/ciclos/${ciclo}`, { activo: 1 }, 'PUT');
  const sinUso = (await llamar('calidad', '/eval-param/ciclos', { nombre: 'Sin uso' })).id;
  esperar('Un ciclo sin uso se borra', (await llamar('calidad', `/eval-param/ciclos/${sinUso}`, undefined, 'DELETE')).ok === true, null);

  // ---- Semáforo ----
  esperar('El corte amarillo debe ser menor que el verde', (await llamar('calidad', '/eval-param/semaforo', { verde: 60, amarillo: 70 }, 'PUT')).status === 400
    && (await llamar('calidad', '/eval-param/semaforo', { verde: 120, amarillo: 50 }, 'PUT')).status === 400 && (await llamar('calidad', '/eval-param/semaforo', { verde: 'a', amarillo: 50 }, 'PUT')).status === 400, null);

  // ---- Una evaluación con ciclo, informe y cuestionarios por unidad ----
  r = await llamar('calidad', '/evaluaciones', { nombre: 'Evaluación completa', anio, tipo: 'Auditoría interna', evaluador: 'Coordinador de Calidad', auditor_id: uid('Calidad'),
    procesos: [pid('PRO'), pid('ALM')], ciclo_id: ciclo, fortalezas: 'Equipo comprometido', recomendaciones: 'Reforzar los registros' });
  const ev = r.id; esperar('Se programa con ciclo, fortalezas y recomendaciones', !!ev, r);
  let e = await llamar('calidad', `/evaluaciones/${ev}`);
  esperar('La ficha trae ciclo, fortalezas, recomendaciones y el emisor CAL', e.ciclo === 'Ciclo semestral' && e.fortalezas === 'Equipo comprometido' && e.recomendaciones === 'Reforzar los registros' && e.emisor.sigla === 'CAL', e);
  r = await llamar('calidad', `/evaluaciones/${ev}`, { nombre: 'Evaluación completa', anio, tipo: 'Auditoría interna', evaluador: 'Coordinador de Calidad', auditor_id: uid('Calidad') }, 'PUT');
  e = await llamar('calidad', `/evaluaciones/${ev}`);
  esperar('Al editar sin esos campos se conservan', r.id && e.ciclo === 'Ciclo semestral' && e.fortalezas === 'Equipo comprometido', e);
  esperar('Un ciclo en uso no se puede borrar', (await llamar('calidad', `/eval-param/ciclos/${ciclo}`, undefined, 'DELETE')).status === 400, null);
  esperar('Un ciclo inexistente se rechaza', (await llamar('calidad', '/evaluaciones', { nombre: 'X', anio, tipo: 'Auditoría interna', evaluador: 'Externo', auditor_externo: 'ONAC', ciclo_id: 99999 })).status === 400, null);
  let inf = await llamar('calidad', `/evaluaciones/${ev}/informe`);
  esperar('El historial empieza con «Evaluación programada»', inf.historial.length === 1 && inf.historial[0].estado_inicial === null && inf.historial[0].estado_final === 'Planeación' && inf.historial[0].observaciones === 'Evaluación programada', inf.historial);

  // preguntas: dos cuestionarios en Producción y la plantilla ISO en Almacén
  const q = (c, t) => llamar('calidad', `/evaluaciones/${ev}/items`, { proceso_id: pid('PRO'), cuestionario: c, requisito: '1', pregunta: t });
  await q('Elementos de protección personal', '¿Usan casco?'); await q('Elementos de protección personal', '¿Usan guantes?'); await q('Elementos de protección personal', '¿Hay registro de entrega?');
  await q('Gestión de residuos', '¿Se clasifican los residuos?'); await q('Gestión de residuos', '¿Hay gestor autorizado?');
  await llamar('calidad', `/evaluaciones/${ev}/items`, { plantilla: 'iso9001', proceso_id: pid('ALM') });
  e = await llamar('calidad', `/evaluaciones/${ev}`);
  esperar('La plantilla ISO queda en el cuestionario «ISO 9001:2015» y las preguntas propias en el suyo',
    e.items.filter(i => i.cuestionario === 'ISO 9001:2015').length === 10 && e.items.filter(i => i.cuestionario === 'Elementos de protección personal').length === 3 && e.items.filter(i => i.cuestionario === 'Gestión de residuos').length === 2, e.items.map(i => i.cuestionario));
  r = await llamar('calidad', `/evaluaciones/${ev}/estado`, { estado: 'Ejecución', observaciones: 'Se inicia el trabajo de campo' });
  esperar('Pasa a ejecución con observaciones', r.ok, r);

  const pro = e.items.filter(i => i.proceso_id === pid('PRO'));
  const resp = (i, resultado) => llamar('calidad', `/evaluaciones/${ev}/items/${i.id}`, { resultado, evidencia: resultado === 'No aplica' ? '' : 'Evidencia de prueba', tipo_hallazgo: 'No conformidad menor' });
  await resp(pro[0], 'Conforme'); await resp(pro[1], 'Observación'); await resp(pro[2], 'No conforme'); await resp(pro[3], 'Conforme'); await resp(pro[4], 'No aplica');

  // ---- Estadísticas por nivel, resultados y semáforo ----
  inf = await llamar('calidad', `/evaluaciones/${ev}/informe`);
  const est = Object.fromEntries(inf.estadisticas.map(x => [x.nombre, x]));
  esperar('Estadísticas: 2 cumple, 1 parcial, 1 no cumple, 1 no aplica y 10 sin responder (15 preguntas)',
    est['Cumple'].n === 2 && est['Cumple parcialmente'].n === 1 && est['No cumple'].n === 1 && est['No aplica'].n === 1 && est['Sin responder'].n === 10, inf.estadisticas);
  esperar('Cada nivel trae su % sobre todas las preguntas y su color', est['Cumple'].pct === 13.33 && est['No cumple'].pct === 6.67 && est['Sin responder'].pct === 66.67 && est['Cumple'].color === 'verde' && est['No cumple'].color === 'rojo', inf.estadisticas);
  const epp = inf.resultados.find(x => x.cuestionario === 'Elementos de protección personal'), res = inf.resultados.find(x => x.cuestionario === 'Gestión de residuos'), iso = inf.resultados.find(x => x.cuestionario === 'ISO 9001:2015');
  esperar('Cuestionario de EPP: 1 cumple, 1 parcial, 1 no cumple = 50 % (Cumplimiento Bajo, rojo)', epp.cumple === 1 && epp.parcial === 1 && epp.no_cumple === 1 && epp.pct === 50 && epp.nivel.color === 'rojo' && epp.nivel.texto === 'Cumplimiento Bajo', epp);
  esperar('Residuos: 1 cumple y 1 no aplica = 100 % (verde); «No aplica» no cuenta', res.cumple === 1 && res.no_aplica === 1 && res.pct === 100 && res.nivel.color === 'verde', res);
  esperar('ISO de Almacén sin responder: sin porcentaje y sin evaluar (gris)', iso.sin_responder === 10 && iso.pct === null && iso.nivel.color === 'gris', iso);
  const uPro = inf.unidades.find(x => x.proceso_id === pid('PRO'));
  esperar('Por unidad Producción: (1 + 0,5 + 0 + 1) / 4 = 62,5 % → amarillo', uPro.pct === 62.5 && uPro.nivel.color === 'amarillo' && uPro.nivel.texto === 'Cumplimiento Medio', uPro);
  esperar('El total del informe es el de las preguntas respondidas', inf.total.pct === 62.5 && inf.total.total === 15 && inf.total.sin_responder === 10, inf.total);
  esperar('Mantiene el orden: unidades por proceso y cuestionarios dentro de cada una', inf.resultados.length === 3, inf.resultados.map(x => `${x.unidad}/${x.cuestionario}`));

  r = await llamar('calidad', '/eval-param/semaforo', { verde: 60, amarillo: 40 }, 'PUT');
  inf = await llamar('calidad', `/evaluaciones/${ev}/informe`);
  esperar('Al cambiar los cortes (60/40) cambian los colores: la unidad pasa a verde y EPP a amarillo',
    r.ok && inf.unidades.find(x => x.proceso_id === pid('PRO')).nivel.color === 'verde' && inf.resultados.find(x => x.cuestionario === 'Elementos de protección personal').nivel.color === 'amarillo', inf.cortes);
  await llamar('calidad', '/eval-param/semaforo', { verde: 80, amarillo: 60 }, 'PUT');

  // ---- Quien lidera un proceso ve solo lo suyo; quien no participa, nada ----
  const infLider = await llamar('produccion', `/evaluaciones/${ev}/informe`);
  esperar('El líder de Producción ve solo los cuestionarios de su proceso (5 preguntas)', infLider.total.total === 5 && infLider.resultados.every(x => x.proceso_id === pid('PRO')) && infLider.resultados.length === 2, infLider.total);
  const infConsulta = await llamar('consulta', `/evaluaciones/${ev}/informe`);
  esperar('Un colaborador consulta el informe (solo lectura, como la ficha de la evaluación)', infConsulta.status === 200 && infConsulta.total.total === 15, infConsulta.total);

  // ---- Plan de mejoramiento: hallazgos numerados y sus puntos de atención ----
  inf = await llamar('calidad', `/evaluaciones/${ev}/informe`);
  esperar('Dos hallazgos, numerados, con la clasificación «Hallazgo» y su unidad', inf.plan.length === 2 && inf.plan.map(h => h.numero).join() === '1,2' && inf.plan.every(h => h.clasificacion === 'Hallazgo' && h.unidad === 'Producción'), inf.plan);
  esperar('Uno es observación (cumple parcialmente) y el otro no conformidad (no cumple)', inf.plan[0].tipo === 'Observación' && inf.plan[1].tipo.startsWith('No conformidad'), inf.plan.map(h => h.tipo));
  esperar('Todavía sin puntos de atención', inf.plan.every(h => h.puntos.length === 0), inf.plan);
  const nc = inf.plan[1];
  r = await llamar('calidad', '/acciones', { hallazgo_id: nc.id, tipo: 'Acción correctiva', fecha_compromiso: '2099-12-31', correccion: 'Entregar y registrar los EPP' });
  await llamar('calidad', `/acciones/${r.id}/actividades`, { descripcion: 'Comprar guantes', fecha: '2099-06-30' });
  inf = await llamar('calidad', `/evaluaciones/${ev}/informe`);
  const punto = inf.plan[1].puntos[0];
  esperar('Una acción abierta aparece como punto de atención: tipo, estado, responsable, fecha y avance',
    inf.plan[1].puntos.length === 1 && punto.tipo === 'Acción correctiva' && punto.estado === 'Análisis' && punto.fecha_compromiso === '2099-12-31' && punto.actividades === 1 && punto.cumplidas === 0 && punto.avance === 0 && punto.vencida === 0, punto);

  // ---- Reporte de puntos de atención ----
  esperar('El reporte es solo para Calidad y el administrador', (await llamar('produccion', '/eval-param/atenciones')).status === 403 && (await llamar('admin', '/eval-param/atenciones')).status === 200, null);
  let rep = await llamar('calidad', '/eval-param/atenciones');
  const fila = rep.filas.find(f => f.id === r.id);
  esperar('Trae el punto con su evaluación, hallazgo, unidad, responsable, avance y seguimientos',
    rep.total === 1 && fila.evaluacion_codigo === e.codigo && fila.hallazgo_codigo === nc.codigo && fila.unidad === 'Producción' && fila.estado === 'Análisis' && fila.tipo === 'Acción correctiva'
    && fila.avance === 0 && fila.seguimientos >= 1 && fila.vencida === 0 && fila.estado_informe === 'Ejecución' && fila.evaluador === 'Coordinador de Calidad', rep);
  esperar('Resume por estado', rep.por_estado.find(x => x.estado === 'Análisis').n === 1 && rep.por_estado.find(x => x.estado === 'Cerrada').n === 0, rep.por_estado);
  const n = async q => (await llamar('calidad', '/eval-param/atenciones?' + q)).total;
  esperar('Filtra por estado, tipo, unidad, año, estado del informe, evaluador y evaluación',
    await n('estado=Análisis') === 1 && await n('estado=Cerrada') === 0 && await n('tipo=Acción correctiva') === 1 && await n('tipo=Corrección') === 0 && await n(`unidad=${pid('PRO')}`) === 1 && await n(`unidad=${pid('ALM')}`) === 0
    && await n(`anio=${anio}`) === 1 && await n(`anio=${anio - 1}`) === 0 && await n('estado_informe=Ejecución') === 1 && await n('estado_informe=Terminada') === 0
    && await n('evaluador=Externo') === 0 && await n(`evaluacion=${ev}`) === 1 && await n('texto=EPP') === 0 && await n(`texto=${nc.codigo}`) === 1, null);
  esperar('Acepta ordenar por fecha límite, código o estado (y descendente)', await n('orden_por=fecha_compromiso&orden=desc') === 1 && await n('orden_por=codigo') === 1 && await n('orden_por=cualquiera') === 1, null);

  // ---- Historial de transiciones con observaciones y usuarios de la ruta ----
  r = await llamar('calidad', '/evaluaciones', { nombre: 'Evaluación con historial', anio, tipo: 'Inspección', evaluador: 'Coordinador de Calidad', auditor_id: uid('Calidad'), procesos: [pid('FIN')] });
  const ev2 = r.id;
  await llamar('calidad', `/evaluaciones/${ev2}/procesos/${pid('FIN')}`, { fecha: `${anio}-12-01`, auditado_id: uid('Producción') }, 'PUT');
  const q2 = (await llamar('calidad', `/evaluaciones/${ev2}/items`, { proceso_id: pid('FIN'), cuestionario: 'Cierre contable', requisito: '1', pregunta: '¿Se concilian las cuentas?' })).id;
  await llamar('calidad', `/evaluaciones/${ev2}/estado`, { estado: 'Ejecución', observaciones: 'Inicio de la inspección' });
  await llamar('calidad', `/evaluaciones/${ev2}/items/${q2}`, { resultado: 'Conforme', evidencia: 'Conciliación firmada' });
  await llamar('calidad', `/evaluaciones/${ev2}/estado`, { estado: 'Evaluación', observaciones: 'Todo respondido' });
  await llamar('calidad', `/evaluaciones/${ev2}/estado`, { estado: 'Ejecución', observaciones: 'Falta una evidencia' });
  await llamar('calidad', `/evaluaciones/${ev2}/estado`, { estado: 'Evaluación' });
  r = await llamar('calidad', `/evaluaciones/${ev2}/estado`, { estado: 'Terminada', conclusiones: 'Sin hallazgos', observaciones: 'Cierre del informe' });
  const h2 = (await llamar('calidad', `/evaluaciones/${ev2}/informe`)).historial;
  esperar('El historial guarda cada transición en orden, con estado inicial y final', r.ok && h2.map(x => `${x.estado_inicial || '—'}>${x.estado_final}`).join(' ')
    === '—>Planeación Planeación>Ejecución Ejecución>Evaluación Evaluación>Ejecución Ejecución>Evaluación Evaluación>Terminada', h2.map(x => `${x.estado_inicial}>${x.estado_final}`));
  esperar('Con las observaciones, el usuario y quién fue al final de la ruta (auditor y auditado)', h2[1].observaciones === 'Inicio de la inspección' && h2[2].observaciones === 'Todo respondido' && h2[3].observaciones === 'Falta una evidencia' && h2[5].observaciones === 'Cierre del informe'
    && h2.every(x => x.usuario) && /Calidad/.test(h2[1].usuarios_ruta) && /Producción/.test(h2[1].usuarios_ruta), h2[1]);
  esperar('Una evaluación terminada ya no cambia de estado', (await llamar('calidad', `/evaluaciones/${ev2}/estado`, { estado: 'Evaluación' })).status === 400, null);
  esperar('Un colaborador no cambia el estado', (await llamar('consulta', `/evaluaciones/${ev}/estado`, { estado: 'Evaluación' })).status === 404 || (await llamar('consulta', `/evaluaciones/${ev}/estado`, { estado: 'Evaluación' })).status === 403, null);

  // ---- Clasificación de hallazgos ----
  r = await llamar('calidad', '/eval-param/clasificaciones', { nombre: 'Fortaleza' });
  const fortaleza = r.id; esperar('Calidad crea una clasificación', !!fortaleza, r);
  esperar('No repite el nombre', (await llamar('calidad', '/eval-param/clasificaciones', { nombre: 'Fortaleza' })).status === 400, null);
  r = await llamar('calidad', '/hallazgos', { origen: 'Otro', tipo: 'Observación', proceso_id: pid('PRO'), descripcion: 'Buena práctica de orden y aseo', clasificacion_id: fortaleza });
  const manual = (await llamar('calidad', '/hallazgos?texto=orden')).find(h => h.id === r.id);
  esperar('Un hallazgo manual lleva la clasificación elegida', manual.clasificacion === 'Fortaleza', manual);
  esperar('Una clasificación inexistente se rechaza', (await llamar('calidad', '/hallazgos', { origen: 'Otro', tipo: 'Observación', proceso_id: pid('PRO'), descripcion: 'X', clasificacion_id: 99999 })).status === 400, null);
  esperar('Una clasificación en uso no se borra', (await llamar('calidad', `/eval-param/clasificaciones/${fortaleza}`, undefined, 'DELETE')).status === 400, null);
  p = await llamar('calidad', '/eval-param');
  esperar('Cada clasificación cuenta sus hallazgos', p.clasificaciones.find(c => c.nombre === 'Fortaleza').hallazgos === 1 && p.clasificaciones.find(c => c.nombre === 'Hallazgo').hallazgos >= 2, p.clasificaciones);
  esperar('Se renombra', (await llamar('calidad', `/eval-param/clasificaciones/${fortaleza}`, { nombre: 'Buena práctica' }, 'PUT')).ok === true, null);

  // ---- Unidades auditables: una por proceso ----
  const un = await llamar('calidad', '/eval-param/unidades');
  esperar('Hay una unidad auditable por proceso, con su código y quién la lidera', un.length === cat.procesos.length && un.every(x => x.nombre) && un.find(x => x.id === pid('PRO')).evaluaciones >= 1, un.length);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo el módulo de evaluaciones completas funciona');
  process.exit(fallos ? 1 : 0);
})();
