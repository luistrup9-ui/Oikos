// Prueba de evaluaciones, hallazgos y acciones: node prueba-auditorias.js (con el servidor corriendo y la base limpia)
const B = 'http://localhost:3100/api';
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
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle).slice(0, 400)); } };

(async () => {
  for (const [u, c] of [['produccion', 'produccion123'], ['calidad', 'calidad123'], ['consulta', 'consulta123'], ['admin', 'admin123']])
    await llamar(u, '/login', { usuario: u, clave: c });
  const cat = await llamar('calidad', '/catalogos');
  const pid = s => cat.procesos.find(p => p.sigla === s).id;
  const uid = u => cat.usuarios.find(x => x.nombre.includes(u)).id;
  const anio = new Date().getFullYear();

  // ---- Evaluación ----
  let r = await llamar('produccion', '/evaluaciones', { nombre: 'X', anio, tipo: 'Auditoría interna' });
  esperar('Solo Calidad programa evaluaciones', r.status === 403, r);
  r = await llamar('calidad', '/evaluaciones', { nombre: 'Auditoría interna de calidad', anio, tipo: 'Auditoría interna',
    evaluador: 'Coordinador de Calidad', auditor_id: uid('Calidad'), procesos: [pid('PRO'), pid('ALM')] });
  esperar('Calidad programa la auditoría', r.id, r);
  const ev = r.id;
  let e = await llamar('calidad', `/evaluaciones/${ev}`);
  esperar(`Código EV-${anio}-01 en Planeación con 2 procesos`, e.codigo === `EV-${anio}-01` && e.estado === 'Planeación' && e.lista_procesos.length === 2, e);

  r = await llamar('calidad', `/evaluaciones/${ev}/estado`, { estado: 'Ejecución' });
  esperar('No pasa a ejecución sin lista de verificación', r.status === 400, r);
  await llamar('calidad', `/evaluaciones/${ev}/items`, { plantilla: 'iso9001' });
  await llamar('calidad', `/evaluaciones/${ev}/items`, { plantilla: 'iso9001' });
  r = await llamar('calidad', `/evaluaciones/${ev}/items`, { proceso_id: pid('PRO'), requisito: '8.6', pregunta: '¿Se libera el producto con inspección final?' });
  e = await llamar('calidad', `/evaluaciones/${ev}`);
  esperar('Plantilla ISO sin duplicar (10×2) + 1 pregunta propia = 21', e.items.length === 21, e.items.length);
  r = await llamar('calidad', `/evaluaciones/${ev}/estado`, { estado: 'Evaluación' });
  esperar('No salta etapas', r.status === 400, r);
  r = await llamar('calidad', `/evaluaciones/${ev}/estado`, { estado: 'Ejecución' });
  esperar('Pasa a ejecución', r.ok, r);

  const it = e.items.filter(i => i.proceso_id === pid('PRO'));
  r = await llamar('calidad', `/evaluaciones/${ev}/items/${it[0].id}`, { resultado: 'Conforme' });
  esperar('Exige evidencia', r.status === 400, r);
  r = await llamar('consulta', `/evaluaciones/${ev}/items/${it[0].id}`, { resultado: 'Conforme', evidencia: 'x' });
  esperar('Consulta no responde la lista', r.status === 403, r);
  r = await llamar('calidad', `/evaluaciones/${ev}/items/${it[6].id}`, { resultado: 'No conforme', evidencia: 'Se usa la versión 1 del instructivo de soldadura' });
  esperar('No conforme genera hallazgo', r.hallazgo_id, r);
  const hNC = r.hallazgo_id;
  r = await llamar('calidad', `/evaluaciones/${ev}/items/${it[4].id}`, { resultado: 'Observación', evidencia: 'Calibrador próximo a vencer' });
  const hObs = r.hallazgo_id;
  r = await llamar('calidad', `/evaluaciones/${ev}/items/${it[4].id}`, { resultado: 'Conforme', evidencia: 'Ya se calibró' });
  esperar('Cambiar a conforme borra la observación sin acciones', r.hallazgo_id === null, r);
  for (const i of (await llamar('calidad', `/evaluaciones/${ev}`)).items.filter(i => !i.resultado))
    await llamar('calidad', `/evaluaciones/${ev}/items/${i.id}`, { resultado: 'Conforme', evidencia: 'Verificado en sitio' });
  r = await llamar('calidad', `/evaluaciones/${ev}/estado`, { estado: 'Evaluación' });
  esperar('Pasa a evaluación con todo respondido', r.ok, r);
  r = await llamar('calidad', `/evaluaciones/${ev}/estado`, { estado: 'Terminada' });
  esperar('Terminar exige conclusiones', r.status === 400, r);
  r = await llamar('calidad', `/evaluaciones/${ev}/estado`, { estado: 'Terminada', conclusiones: 'El sistema es conforme salvo control documental en Producción.' });
  e = await llamar('calidad', `/evaluaciones/${ev}`);
  esperar('Evaluación terminada con 1 hallazgo', e.estado === 'Terminada' && e.hallazgos.length === 1 && e.hallazgos[0].codigo === 'H-PRO-01', e.hallazgos);

  // ---- Acción correctiva ----
  r = await llamar('produccion', '/acciones', { hallazgo_id: hNC, tipo: 'Acción de mejora', fecha_compromiso: `${anio}-12-15` });
  esperar('Una NC no admite "acción de mejora"', r.status === 400, r);
  r = await llamar('produccion', '/acciones', { hallazgo_id: hNC, tipo: 'Acción correctiva', fecha_compromiso: `${anio}-12-15`,
    correccion: 'Se retiró la versión 1 de la planta' });
  esperar('Líder de Producción abre acción correctiva', r.id, r);
  const ac = r.id;
  r = await llamar('produccion', `/acciones/${ac}/avanzar`, {});
  esperar('No ejecuta sin causa raíz', r.status === 400 && /causa raíz/.test(r.error), r);
  await llamar('produccion', `/acciones/${ac}`, { metodo_causa: '5 porqués', analisis_causa: '¿Por qué? No se recogieron copias…',
    causa_raiz: 'No hay control de copias impresas en planta' }, 'PUT');
  r = await llamar('produccion', `/acciones/${ac}/avanzar`, {});
  esperar('No ejecuta sin actividades', r.status === 400 && /actividad/.test(r.error), r);
  r = await llamar('produccion', `/acciones/${ac}/actividades`, { descripcion: 'Crear listado de copias controladas', fecha: `${anio}-11-30` });
  const t1 = r.id;
  r = await llamar('produccion', `/acciones/${ac}/actividades`, { descripcion: 'Capacitar a supervisores', fecha: `${anio}-12-10` });
  const t2 = r.id;
  r = await llamar('produccion', `/acciones/${ac}/avanzar`, { comentario: 'Plan listo' });
  esperar('Pasa a ejecución', r.ok, r);
  r = await llamar('produccion', `/acciones/${ac}`, { causa_raiz: 'Otra causa' }, 'PUT');
  esperar('La causa raíz ya no se cambia en ejecución', r.status === 400, r);
  r = await llamar('produccion', `/acciones/${ac}/actividades/${t1}`, { cumplida: true });
  esperar('Cumplir actividad exige evidencia', r.status === 400, r);
  await llamar('produccion', `/acciones/${ac}/actividades/${t1}`, { cumplida: true, evidencia: 'Formato PRO-FOR-05' });
  r = await llamar('produccion', `/acciones/${ac}/avanzar`, {});
  esperar('No pasa a verificación con actividades pendientes', r.status === 400, r);
  await llamar('produccion', `/acciones/${ac}/actividades/${t2}`, { cumplida: true, evidencia: 'Lista de asistencia' });
  r = await llamar('produccion', `/acciones/${ac}/avanzar`, {});
  esperar('Pasa a verificación', r.ok, r);
  r = await llamar('produccion', `/acciones/${ac}/avanzar`, { eficaz: true, verificacion: 'ok' });
  esperar('Producción no verifica eficacia', r.status === 403, r);
  r = await llamar('calidad', `/acciones/${ac}/avanzar`, { eficaz: false, verificacion: 'En la auditoría de seguimiento aún había copias viejas' });
  let a = await llamar('calidad', `/acciones/${ac}`);
  esperar('No eficaz: vuelve a ejecución con 1 reapertura', a.estado === 'Ejecución' && a.reaperturas === 1, a);
  await llamar('produccion', `/acciones/${ac}/avanzar`, {});
  await llamar('calidad', `/acciones/${ac}/avanzar`, { eficaz: true, verificacion: 'Seguimiento a 30 días sin copias obsoletas' });
  a = await llamar('calidad', `/acciones/${ac}`);
  esperar('Cerrada y eficaz, con trazabilidad', a.estado === 'Cerrada' && a.eficaz === 1 && a.bitacora.length >= 8, a.bitacora.map(b => b.evento));

  // ---- Hallazgo de otra fuente y acción vencida ----
  r = await llamar('produccion', '/hallazgos', { origen: 'Queja o reclamo de cliente', tipo: 'No conformidad menor', proceso_id: pid('COM'), descripcion: 'x' });
  esperar('Líder de Producción no registra hallazgos de otro proceso', r.status === 403, r);
  r = await llamar('calidad', '/hallazgos', { origen: 'Queja o reclamo de cliente', tipo: 'No conformidad menor', proceso_id: pid('COM'),
    descripcion: 'Cliente recibió estufa con pintura rayada' });
  const hq = r.id;
  r = await llamar('calidad', '/acciones', { hallazgo_id: hq, tipo: 'Corrección', fecha_compromiso: '2020-01-01', responsable_id: uid('Producción') });
  const vencidas = await llamar('calidad', '/acciones?vencidas=1');
  esperar('Detecta la acción vencida', vencidas.length === 1 && vencidas[0].id === r.id, vencidas.map(v => v.codigo));
  const pend = await llamar('produccion', '/auditorias-pendientes');
  esperar('Aparece en Mi plan de trabajo del responsable', pend.acciones.some(x => x.id === r.id), pend.acciones.map(x => x.codigo));
  const sinAccion = await llamar('consulta', '/hallazgos?sin_accion=1');
  esperar('Filtro de hallazgos sin acción', sinAccion.length === 0, sinAccion.map(x => x.codigo));

  const s = await llamar('consulta', '/acciones-estadisticas');
  esperar('Estadísticas: 2 acciones, 1 eficaz, 50 % de eficacia, 1 reapertura', s.total === 2 && s.eficaces === 1 && s.eficacia === 50 && s.reaperturas === 1, s);
  esperar('La observación borrada no dejó rastro', !(await llamar('consulta', '/hallazgos')).some(x => x.tipo === 'Observación'), hObs);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo el módulo de auditorías y acciones funciona');
  process.exit(fallos ? 1 : 0);
})();
