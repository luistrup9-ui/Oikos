// Prueba de la ficha de procesos: node prueba-procesos.js (servidor corriendo, después de importar desde Almera).
// Solo lee y prueba validaciones: no modifica ninguna ficha.
const B = 'http://localhost:3100/api';
const CUENTA = { produccion: 'lider', calidad: 'gestor', consulta: 'colaborador' }; // etiqueta de la prueba → cuenta sembrada por rol
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  const j = await r.json();
  return Array.isArray(j) ? Object.assign(j, { status: r.status }) : { status: r.status, ...j };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle)?.slice(0, 300)); } };

(async () => {
  for (const u of ['calidad', 'consulta']) await llamar(u, '/login', { usuario: CUENTA[u], clave: CUENTA[u] + '123' });
  const cat = await llamar('consulta', '/catalogos');
  const p = n => cat.procesos.find(x => x.nombre === n);

  esperar('Los 16 procesos raíz siguen en el catálogo', cat.procesos.filter(x => !x.padre_id).length === 16, cat.procesos.length);
  esperar('Los subprocesos cuelgan de su proceso (Gestión Documental → Gestión Administrativa)',
    p('Gestión Documental')?.padre_id === p('Gestión Administrativa')?.id, p('Gestión Documental'));

  const sig = await llamar('consulta', `/procesos/${p('Sistema Integrado de Gestión').id}`);
  esperar('SIG: código ES-SGI-DAR-01 y versión 1', sig.codigo === 'ES-SGI-DAR-01' && sig.version >= 1, sig.codigo);
  esperar('SIG: secciones en el orden de Almera', sig.secciones.map(s => s.titulo).slice(0, 3).join(',') === 'Objetivo,Dueño,Alcance', sig.secciones.map(s => s.titulo));
  esperar('SIG: 11 actividades de entradas y salidas, la primera con ciclo P',
    sig.entradas_salidas.length === 11 && sig.entradas_salidas[0].ciclo === 'P' && sig.entradas_salidas[0].entradas[0].proveedor === 'Todos los procesos', sig.entradas_salidas[0]);
  esperar('SIG: indicadores con el código real de Almera', sig.indicadores.some(i => i.codigo === 'ES-SIG-FTE-04'), sig.indicadores);
  esperar('SIG: 17 documentos de referencia de Almera', sig.documentacion.length === 17, sig.documentacion.length);

  const adm = await llamar('consulta', `/procesos/${p('Gestión Administrativa').id}`);
  esperar('Gestión Administrativa: 2 subprocesos y su E/S enlaza a ellos', adm.hijos.length === 2 && adm.entradas_salidas.every(e => e.subproceso_id), adm.entradas_salidas);

  const gd = await llamar('consulta', `/procesos/${p('Gestión Documental').id}`);
  esperar('Gestión Documental: ruta Gestión Administrativa » Gestión Documental', gd.ruta.map(x => x.nombre).join('>') === 'Gestión Administrativa' && gd.codigo === 'ES-GDO-DAR-01', gd.ruta);

  const h = await llamar('consulta', `/procesos/${sig.id}/historial`);
  esperar('Historial con la versión inicial importada', h.some(v => /Almera/.test(v.comentario)), h);

  let r = await llamar('consulta', `/procesos/${sig.id}`, { nombre: 'x', comentario: 'x' }, 'PUT');
  esperar('Consulta no edita fichas', r.status === 403, r);
  r = await llamar('calidad', `/procesos/${sig.id}`, { nombre: sig.nombre, secciones: [] }, 'PUT');
  esperar('Editar exige describir la modificación', r.status === 400, r);
  r = await llamar('calidad', `/procesos/${sig.id}`, { nombre: sig.nombre, comentario: 'x', entradas_salidas: [{ actividad: 'a', ciclo: 'Z' }] }, 'PUT');
  esperar('El ciclo solo admite P, H, V o A', r.status === 400, r);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo bien');
  process.exit(fallos ? 1 : 0);
})();
