// Prueba de mecanismos de integración: node prueba-mecanismos.js (con el servidor corriendo).
// Crea su propio comité de prueba, así que funciona también con una base usada.
const B = 'http://localhost:3100/api';
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo instanceof FormData) o.body = cuerpo;
  else if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { texto: t }; }
  return Array.isArray(j) ? Object.assign(j, { status: r.status }) : { status: r.status, ...j };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle)?.slice(0, 400)); } };
const dia = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  for (const u of ['calidad', 'produccion', 'consulta']) await llamar(u, '/login', { usuario: u, clave: u + '123' });
  const cat = await llamar('calidad', '/catalogos');
  const id = u => cat.usuarios.find(x => x.rol === u).id;
  const [calidad, produccion, consulta] = [id('lider_calidad'), id('lider_proceso'), id('consulta')];

  let r = await llamar('produccion', '/mecanismos', { tipo: 'Comité', nombre: 'X' });
  esperar('Un líder de proceso no crea mecanismos', r.status === 403, r);

  const nombre = 'Comité de prueba ' + Date.now();
  r = await llamar('calidad', '/mecanismos', { tipo: 'Comité', nombre, periodicidad: 'Mensual', objetivo: 'Probar', patron: 'PRUEBA-%M-%Y-%C', padding: 3,
    coordinador_id: calidad, arrastrar_compromisos: true, tiene_compromisos: true, control_asistencia: true, indicar_asistentes: true, mostrar_tipo: true,
    integrantes: [{ usuario_id: calidad, privilegio: 'Administrador - Miembro', calidad: 'Principal' }, { usuario_id: produccion, privilegio: 'Miembro', calidad: 'Principal' }] });
  esperar('Calidad crea un comité con integrantes', r.id, r);
  const mid = r.id;

  r = await llamar('consulta', `/mecanismos/${mid}`);
  esperar('Usuario de consulta que no es integrante no ve el comité', r.status === 403, r);

  r = await llamar('produccion', `/mecanismos/${mid}/actas`, { fecha: dia(-10) });
  esperar('Un miembro sin "Puede adicionar actas" no crea actas', r.status === 403, r);

  r = await llamar('calidad', `/mecanismos/${mid}/actas`, { fecha: '2026-08-27', hora_inicio: '10:00', hora_fin: '11:00', lugar: 'Oficina SST', agenda: '1. Quórum\n2. Varios' });
  esperar('Código automático con patrón PRUEBA-Agosto-2026-001', r.codigo === 'PRUEBA-Agosto-2026-001', r);
  const acta1 = r.id;

  let a = await llamar('produccion', `/actas/${acta1}`);
  esperar('Los integrantes quedan convocados como asistentes', a.asistentes?.length === 2, a.asistentes);

  r = await llamar('calidad', `/actas/${acta1}`, { ...a, asistentes: [{ usuario_id: calidad, asiste: true }, { usuario_id: produccion, asiste: false }, { nombre: 'Asesor ARL', cargo: 'Externo', asiste: true }] }, 'PUT');
  a = await llamar('calidad', `/actas/${acta1}`);
  esperar('Asistencia 2 de 3 = 66,7 %', Math.round(a.asistencia * 10) === 667, a.asistencia);

  r = await llamar('calidad', `/actas/${acta1}/compromisos`, { nombre: 'Uso seguro de la tronzadora', fecha_fin: dia(30) });
  esperar('Un compromiso exige responsable', r.status === 400, r);
  r = await llamar('produccion', `/actas/${acta1}/compromisos`, { nombre: 'Uso seguro de la tronzadora', fecha_fin: dia(30), responsables: [produccion] });
  esperar('Un miembro adiciona compromisos (opción activa)', r.id && r.numero === 1, r);
  const c1 = r.id;
  r = await llamar('calidad', `/actas/${acta1}/compromisos`, { nombre: 'Adquisición de troqueladora', fecha_fin: dia(-3), responsables: [calidad, produccion] });
  const c2 = r.id;

  let c = await llamar('calidad', `/compromisos/${c1}`);
  esperar('Sin seguimientos el compromiso está en Planeación', c.estado === 'Planeación', c);

  r = await llamar('consulta', `/compromisos/${c1}/seguimientos`, { avance: 50, descripcion: 'x' });
  esperar('Quien no es responsable no registra seguimientos', r.status === 403, r);
  r = await llamar('produccion', `/compromisos/${c1}/seguimientos`, { avance: 130, descripcion: 'x' });
  esperar('El porcentaje debe estar entre 0 y 100', r.status === 400, r);
  r = await llamar('produccion', `/compromisos/${c1}/seguimientos`, { avance: '', descripcion: 'x' });
  esperar('El porcentaje es requerido', r.status === 400, r);

  const fd = new FormData();
  fd.append('avance', '50'); fd.append('descripcion', 'Socialización con el personal'); fd.append('archivo', new Blob(['lista de asistencia']), 'asistencia.txt');
  r = await llamar('produccion', `/compromisos/${c1}/seguimientos`, fd);
  c = await llamar('produccion', `/compromisos/${c1}`);
  esperar('Con un seguimiento al 50 % pasa a Ejecución', c.estado === 'Ejecución' && c.avance === 50 && c.seguimientos[0].archivo_nombre === 'asistencia.txt', c);

  r = await llamar('produccion', `/compromisos/${c2}/reprogramar`, { fecha_nueva: dia(20) });
  esperar('Reprogramar exige la causa', r.status === 400, r);
  r = await llamar('produccion', `/compromisos/${c2}/reprogramar`, { fecha_nueva: dia(20), causa: 'Se investiga la mejor opción' });
  c = await llamar('produccion', `/compromisos/${c2}`);
  esperar('Reprogramado: nueva fecha y queda el historial', c.fecha_fin === dia(20) && c.reprogramaciones.length === 1 && c.fecha_fin_inicial === dia(-3), c);

  r = await llamar('produccion', `/compromisos/${c1}/seguimientos`, { avance: 100, descripcion: 'Terminado', fecha: dia(0) });
  c = await llamar('produccion', `/compromisos/${c1}`);
  esperar('Con 100 % queda Terminada y cuenta días de adelanto (+30)', c.estado === 'Terminada' && c.dias === 30, { estado: c.estado, dias: c.dias });
  r = await llamar('produccion', `/compromisos/${c1}/seguimientos`, { avance: 100, descripcion: 'otra vez' });
  esperar('Un compromiso terminado no recibe más seguimientos', r.status === 400, r);

  a = await llamar('calidad', `/actas/${acta1}`);
  esperar('Avance ponderado del acta = (100 + 0) / 2 = 50 %', a.avance_ponderado === 50, a.avance_ponderado);

  r = await llamar('calidad', `/mecanismos/${mid}/actas`, { fecha: '2026-09-25' });
  const acta2 = r.id;
  a = await llamar('calidad', `/actas/${acta2}`);
  esperar('El acta siguiente arrastra el compromiso abierto del acta anterior', a.compromisos_lista.some(x => x.id === c2 && x.arrastrado) && a.codigo === 'PRUEBA-Septiembre-2026-002', a.compromisos_lista);

  r = await llamar('produccion', `/actas/${acta1}/estado`, { accion: 'cerrar' });
  esperar('Un miembro no cierra actas', r.status === 403, r);
  r = await llamar('calidad', `/actas/${acta1}/estado`, { accion: 'cerrar' });
  r = await llamar('calidad', `/actas/${acta1}/compromisos`, { nombre: 'tarde', fecha_fin: dia(5), responsables: [calidad] });
  esperar('Un acta cerrada no se modifica', r.status === 400, r);
  r = await llamar('calidad', `/actas/${acta1}/estado`, { accion: 'reabrir' });
  esperar('El administrador la reabre', r.estado === 'Abierta', r);

  r = await llamar('calidad', `/actas/${acta2}/estado`, { accion: 'anular' });
  const m = await llamar('calidad', `/mecanismos/${mid}`);
  esperar('Estadísticas: 1 acta válida, 2 compromisos, 1 cerrado, 50 % cumplimiento', m.estadisticas.actas === 1 && m.estadisticas.actividades === 2
    && m.estadisticas.cerradas === 1 && m.estadisticas.cumplimiento === 50, m.estadisticas);

  r = await llamar('produccion', '/mecanismos-pendientes');
  esperar('Mi plan de trabajo: el comité y el compromiso abierto del responsable', r.mecanismos.some(x => x.id === mid) && r.compromisos.some(x => x.id === c2), r);

  r = await llamar('calidad', `/compromisos?mecanismo=${mid}&estado=Terminada`);
  esperar('Seguimiento filtra por estado', r.length === 1 && r[0].id === c1, r);

  const x = await fetch(`${B}/actas-exportar?mecanismo=${mid}&formato=xlsx`, { headers: { cookie: sesiones.calidad } });
  esperar('Exporta las actas a XLSX', x.status === 200 && x.headers.get('content-type').includes('spreadsheetml'), x.status);

  // Limpieza: el comité de prueba queda inactivo para no ensuciar el árbol
  await llamar('calidad', `/mecanismos/${mid}`, { ...m, activo: false, integrantes: undefined }, 'PUT');

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo bien');
  process.exit(fallos ? 1 : 0);
})();
