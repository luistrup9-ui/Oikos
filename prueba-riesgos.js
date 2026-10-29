// Prueba del módulo de riesgos y controles: node prueba-riesgos.js (con el servidor corriendo y la base limpia)
const B = 'http://localhost:3100/api';
const CUENTA = { produccion: 'lider', calidad: 'gestor', consulta: 'colaborador' }; // etiqueta de la prueba → cuenta sembrada por rol
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

(async () => {
  for (const [u, c] of [['produccion', 'lider123'], ['calidad', 'gestor123'], ['consulta', 'colaborador123']])
    await llamar(u, '/login', { usuario: CUENTA[u] || u, clave: c });
  const cat = await llamar('calidad', '/catalogos');
  const pid = s => cat.procesos.find(p => p.sigla === s).id;

  let lista = await llamar('consulta', '/riesgos');
  esperar('Carga los 3 riesgos de ejemplo', lista.length === 3, lista.length);
  const sold = lista.find(x => x.codigo === 'R-PRO-01');
  esperar('Soldadura: 4×4 Extrema → con un control fuerte y uno moderado en probabilidad queda 1×4 Baja',
    sold.zona === 'Extrema' && sold.probabilidad_residual === 1 && sold.impacto_residual === 4 && sold.zona_residual === 'Baja', sold);
  const lam = lista.find(x => x.codigo === 'R-ALM-01');
  esperar('Lámina: 3×5 Extrema → control moderado en impacto → 3×4 Alta', lam.zona_residual === 'Alta' && lam.impacto_residual === 4, lam);

  let r = await llamar('consulta', '/riesgos', { nombre: 'x', proceso_id: pid('PRO'), tipo: 'Calidad', probabilidad: 2, impacto: 2 });
  esperar('Consulta no crea riesgos', r.status === 403, r);
  r = await llamar('produccion', '/riesgos', { nombre: 'Riesgo de facturación', proceso_id: pid('FAC'), tipo: 'Financieros y continuidad', probabilidad: 2, impacto: 2 });
  esperar('Líder de Producción NO crea riesgos de otro proceso', r.status === 403, r);
  r = await llamar('produccion', '/riesgos', { nombre: 'Atrapamiento en la prensa', proceso_id: pid('PRO'), tipo: 'Seguridad y Salud en el Trabajo', probabilidad: 6, impacto: 5 });
  esperar('Valida la escala 1 a 5', r.status === 400, r);
  r = await llamar('produccion', '/riesgos', { nombre: 'Atrapamiento en la prensa', proceso_id: pid('PRO'), tipo: 'Seguridad y Salud en el Trabajo', probabilidad: 5, impacto: 5 });
  esperar('Líder de Producción crea riesgo de su proceso', r.id, r);
  const id = r.id;
  let x = await llamar('produccion', `/riesgos/${id}`);
  esperar('Código R-PRO-02, 5×5 Extrema, residual igual sin controles', x.codigo === 'R-PRO-02' && x.zona === 'Extrema' && x.puntaje_residual === 25, x);

  r = await llamar('produccion', '/controles', { riesgo_id: id, descripcion: 'Guarda', clasificacion: 'Preventivo', efectividad: 'Fuerte' });
  esperar('El control debe mitigar algo', r.status === 400, r);
  r = await llamar('produccion', '/controles', { riesgo_id: id, descripcion: 'Guarda de seguridad con sensor', clasificacion: 'Preventivo',
    efectividad: 'Fuerte', mitiga_probabilidad: '1', responsable_gestion_id: x.responsable_id });
  esperar('Agrega control fuerte (C-PRO-03)', r.id, r);
  const ctl = r.id;
  r = await llamar('produccion', '/controles', { riesgo_id: id, descripcion: 'Brigada de primeros auxilios', clasificacion: 'Correctivo',
    efectividad: 'Moderado', mitiga_impacto: '1' });
  x = await llamar('produccion', `/riesgos/${id}`);
  esperar('Residual 3×4 = 12 Alta', x.probabilidad_residual === 3 && x.impacto_residual === 4 && x.zona_residual === 'Alta', x);
  esperar('Códigos de control consecutivos', x.controles.map(c => c.codigo).join() === 'C-PRO-03,C-PRO-04', x.controles.map(c => c.codigo));

  r = await llamar('produccion', `/controles/${ctl}`, { descripcion: 'Guarda de seguridad con sensor', clasificacion: 'Preventivo',
    efectividad: 'Débil', mitiga_probabilidad: 1 }, 'PUT');
  x = await llamar('produccion', `/riesgos/${id}`);
  esperar('Si el control pasa a débil, la probabilidad vuelve a 5', x.probabilidad_residual === 5, x.probabilidad_residual);

  r = await llamar('produccion', `/controles/${ctl}/monitoreo`, { ejecutado: '0' });
  esperar('No ejecutado exige observación', r.status === 400, r);
  r = await llamar('produccion', `/controles/${ctl}/monitoreo`, { ejecutado: '0', observacion: 'Sensor dañado' });
  r = await llamar('produccion', `/controles/${ctl}/monitoreo`, { ejecutado: '1' });
  x = await llamar('produccion', `/riesgos/${id}`);
  esperar('Reporte del mes se corrige (1 registro, ejecutado)', x.monitoreos.length === 1 && x.controles.find(c => c.id === ctl).ejecutado_mes === 1, x.monitoreos);

  r = await llamar('produccion', '/planes-accion', { nombre: 'Cambiar sensor de la guarda', riesgo_id: id, avance: 0 });
  x = await llamar('produccion', `/riesgos/${id}`);
  esperar('Plan de acción asociado al riesgo', x.planes.length === 1 && x.planes[0].estado === 'Abierto', x.planes);

  const ctrls = await llamar('consulta', `/controles?clasificacion=Correctivo`);
  esperar('Listado de controles filtra por clasificación', ctrls.length === 1 && ctrls[0].codigo === 'C-PRO-04', ctrls.map(c => c.codigo));
  const ext = await llamar('consulta', '/riesgos?zona=Extrema&matriz=residual');
  esperar('Filtro por zona residual Extrema (R-PRO-02, con su control ya débil)', ext.length === 1 && ext[0].codigo === 'R-PRO-02', ext.map(e => e.codigo));
  const alt = await llamar('consulta', '/riesgos?zona=Alta&matriz=residual');
  esperar('Filtro por zona residual Alta (2)', alt.length === 2, alt.map(e => e.codigo));

  r = await llamar('produccion', `/riesgos/${id}`, null, 'DELETE');
  esperar('Solo Calidad retira riesgos', r.status === 403, r);
  r = await llamar('calidad', `/riesgos/${id}`, null, 'DELETE');
  lista = await llamar('calidad', '/riesgos');
  esperar('Riesgo retirado sale de la matriz', lista.length === 3, lista.length);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo el módulo de riesgos funciona');
  process.exit(fallos ? 1 : 0);
})();
