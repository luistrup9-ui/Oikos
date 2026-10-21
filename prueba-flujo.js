// Prueba de punta a punta del flujo documental: node prueba-flujo.js (con el servidor corriendo)
const B = 'http://localhost:3100/api';
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo instanceof FormData) o.body = cuerpo;
  else if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  return { status: r.status, ...(await r.json()) };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', detalle); } };

(async () => {
  await llamar('produccion', '/login', { usuario: 'produccion', clave: 'produccion123' });
  await llamar('calidad', '/login', { usuario: 'calidad', clave: 'calidad123' });
  await llamar('consulta', '/login', { usuario: 'consulta', clave: 'consulta123' });

  let r = await llamar('produccion', '/solicitudes', { tipo_solicitud: 'Creación', tipo_id: 3, clase_id: 10, proceso_id: 9,
    nombre: 'Procedimiento de soldadura', justificacion: 'Nuevo proceso de soldadura MIG' });
  esperar('Líder de proceso radica solicitud de creación', r.id, r);
  const solId = r.id;

  r = await llamar('produccion', `/solicitudes/${solId}/resolver`, { aprobar: true });
  esperar('Líder de proceso NO puede aprobar solicitudes', r.status === 403, r);

  r = await llamar('calidad', `/solicitudes/${solId}/resolver`, { aprobar: true });
  esperar('Calidad aprueba y se crea el documento', r.documento_id, r);
  const id = r.documento_id;

  let d = await llamar('produccion', `/documentos/${id}`);
  esperar('Código automático PRO-PRO-01 en Elaboración', d.codigo === 'PRO-PRO-01' && d.estado === 'ELABORACION', d);

  r = await llamar('produccion', `/documentos/${id}/transicion`, { transicion: 'enviar_revision' });
  esperar('No deja enviar a revisión sin archivo', r.status === 400, r);

  const fd = new FormData();
  fd.append('archivo', new Blob(['contenido v1']), 'soldadura-v1.txt'); fd.append('cambios', 'Versión inicial');
  r = await llamar('produccion', `/documentos/${id}/archivo`, fd);
  esperar('Sube archivo v1', r.ok, r);

  r = await llamar('consulta', `/documentos/${id}`);
  esperar('Consulta no ve documentos en elaboración', r.status === 404, r);

  r = await llamar('produccion', `/documentos/${id}/transicion`, { transicion: 'enviar_revision' });
  esperar('Envía a revisión', r.ok, r);
  r = await llamar('produccion', `/documentos/${id}/transicion`, { transicion: 'aprobar' });
  esperar('Líder de proceso NO puede aprobar', r.status === 403, r);
  r = await llamar('calidad', `/documentos/${id}/transicion`, { transicion: 'devolver' });
  esperar('Devolver exige comentario', r.status === 400, r);
  r = await llamar('calidad', `/documentos/${id}/transicion`, { transicion: 'devolver', comentario: 'Falta el alcance' });
  esperar('Calidad devuelve con comentario', r.ok, r);
  await llamar('produccion', `/documentos/${id}/transicion`, { transicion: 'enviar_revision' });
  r = await llamar('calidad', `/documentos/${id}/transicion`, { transicion: 'aprobar' });
  esperar('Calidad aprueba', r.ok, r);
  r = await llamar('calidad', `/documentos/${id}/transicion`, { transicion: 'publicar' });
  esperar('Calidad publica', r.ok, r);

  r = await llamar('consulta', `/documentos?texto=soldadura`);
  esperar('Consulta ve el documento vigente en el listado', Array.isArray(r) || r[0], r);

  r = await llamar('produccion', '/solicitudes', { tipo_solicitud: 'Modificación', documento_id: id, justificacion: 'Cambio de norma' });
  const sol2 = r.id;
  r = await llamar('calidad', `/solicitudes/${sol2}/resolver`, { aprobar: true });
  d = await llamar('produccion', `/documentos/${id}`);
  esperar('Modificación aprobada abre la versión 2 en Elaboración', d.version === 2 && d.estado === 'ELABORACION', d);
  esperar('Bitácora completa (7 movimientos)', d.bitacora.length === 7, d.bitacora.map(b => b.transicion_id));

  r = await llamar('calidad', '/registros', { nombre: 'Registro de soldadura', proceso_id: 9, documento_id: id, medio: 'Digital', tiempo_retencion: '2 años' });
  esperar('Calidad crea un registro', r.id, r);

  const est = await llamar('calidad', '/estadisticas?transicion=publicar');
  esperar('Estadísticas filtran por transición', est.transiciones.length === 1, est.transiciones);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo el flujo funciona');
  process.exit(fallos ? 1 : 0);
})();
