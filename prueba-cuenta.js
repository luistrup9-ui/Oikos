// Prueba de la Página individual: node prueba-cuenta.js (con el servidor corriendo y la base limpia)
// Parte A: preferencias de la cuenta. Parte B: números de contacto. Parte C: firma mecánica. Parte D: «Mi SGI» (mis mecanismos con su última y próxima sesión).
const B = 'http://localhost:3100/api';
const CUENTA = { lider: ['lider', 'lider123'], calidad: ['gestor', 'gestor123'], consulta: ['colaborador', 'colaborador123'], admin: ['admin', 'admin123'] };
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo instanceof FormData) o.body = cuerpo;
  else if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  if (tipo.startsWith('image/')) return { status: r.status, tipo, bytes: Buffer.from(await r.arrayBuffer()), cabeceras: r.headers };
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { texto: t }; }
  return Array.isArray(j) ? Object.assign(j, { status: r.status }) : { status: r.status, ...j };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle)?.slice(0, 500)); } };
const dia = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);       // el servidor cuenta los días en UTC, igual que esto
// Imágenes mínimas válidas (1×1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const subir = (quien, bytes, nombre, tipo) => { const f = new FormData(); f.append('archivo', new Blob([bytes], { type: tipo }), nombre); return llamar(quien, '/cuenta/firma', f); };
// PNG que dice medir 5000×1 (solo la cabecera: basta para que se vea su tamaño)
const PNG_GRANDE = (() => { const c = Buffer.alloc(8 + 25); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(c); c.writeUInt32BE(13, 8); c.write('IHDR', 12); c.writeUInt32BE(5000, 16); c.writeUInt32BE(1, 20); c[24] = 8; c[25] = 2; return c; })();

(async () => {
  for (const [q, [u, c]] of Object.entries(CUENTA)) await llamar(q, '/login', { usuario: u, clave: c });

  // ================= A. Preferencias =================
  let r = await llamar('anonimo', '/cuenta');
  esperar('Sin sesión no se ve la cuenta', r.status === 401, r);
  r = await llamar('consulta', '/cuenta');
  const base = { notif_atraso: 0, dias_atraso: 1, notif_por_terminar: 0, dias_por_terminar: 3, alerta_dias: 14, pagina_inicio: 'bienvenida' };
  esperar('Quien nunca ha guardado nada tiene los valores de siempre (sin avisos, alerta de 14 días, abre en la página de inicio)', JSON.stringify(r.preferencias) === JSON.stringify(base) && r.telefonos.length === 0 && r.tiene_firma === false, r);
  esperar('La cuenta ofrece las 4 páginas de inicio y los prefijos de país (Colombia +57 incluido)', r.paginas.map(p => p.id).join() === 'bienvenida,personal,mapa,tablero' && r.paginas.find(p => p.id === 'personal').nombre === 'Página personal'
    && r.prefijos.some(p => p.prefijo === '+57' && p.pais === 'Colombia'), [r.paginas, r.prefijos.length]);
  let yo = await llamar('consulta', '/yo');
  esperar('/yo trae la página de inicio, la alerta temprana y la dependencia (sin cargo: vacía)', yo.pagina_inicio === 'bienvenida' && yo.alerta_dias === 14 && yo.dependencia === null && !('clave' in yo), yo);
  const cargos = await llamar('admin', '/cargos'), gaf = cargos.find(c => c.area_sigla === 'GAF');
  const todosU = await llamar('admin', '/usuarios'), colab = todosU.find(u => u.usuario === 'colaborador');
  r = await llamar('admin', `/usuarios/${colab.id}`, { nombre: colab.nombre, correo: colab.correo, rol: colab.rol, cargo_id: gaf.id }, 'PUT');
  yo = await llamar('consulta', '/yo');
  esperar('La dependencia es el área de su cargo', r.ok && yo.dependencia === gaf.area && /Administrativa/.test(yo.dependencia), [r, yo.dependencia]);

  r = await llamar('consulta', '/cuenta', { notif_atraso: true, dias_atraso: 5, notif_por_terminar: 1, dias_por_terminar: 2, alerta_dias: 30, pagina_inicio: 'mapa' }, 'PUT');
  esperar('Se guardan los avisos, la alerta temprana y la página de inicio', r.ok && r.preferencias.alerta_dias === 30, r);
  r = await llamar('consulta', '/cuenta');
  esperar('Y al volver a abrir la cuenta se ven igual', JSON.stringify(r.preferencias) === JSON.stringify({ notif_atraso: 1, dias_atraso: 5, notif_por_terminar: 1, dias_por_terminar: 2, alerta_dias: 30, pagina_inicio: 'mapa' }), r.preferencias);
  yo = await llamar('consulta', '/yo');
  esperar('/yo ya trae lo nuevo (para que la aplicación abra donde se eligió y use la alerta)', yo.pagina_inicio === 'mapa' && yo.alerta_dias === 30, yo);
  r = await llamar('consulta', '/cuenta', { alerta_dias: 20 }, 'PUT');
  esperar('Guardar solo un campo no borra los demás', r.ok && r.preferencias.pagina_inicio === 'mapa' && r.preferencias.dias_atraso === 5 && r.preferencias.alerta_dias === 20, r);
  r = await llamar('consulta', '/cuenta', { notif_atraso: false }, 'PUT');
  esperar('Se puede apagar un aviso (los días quedan guardados)', r.ok && r.preferencias.notif_atraso === 0 && r.preferencias.dias_atraso === 5, r);
  for (const [nombre, cuerpo] of [['días en 0', { dias_atraso: 0 }], ['días en 91', { alerta_dias: 91 }], ['días con letras', { dias_por_terminar: 'abc' }], ['días con decimales', { dias_atraso: 2.5 }], ['página inexistente', { pagina_inicio: 'otra' }]]) {
    r = await llamar('consulta', '/cuenta', cuerpo, 'PUT');
    esperar(`Se rechaza ${nombre}`, r.status === 400 && r.error, r);
  }
  r = await llamar('consulta', '/cuenta');
  esperar('Y lo rechazado no cambió nada', r.preferencias.alerta_dias === 20 && r.preferencias.pagina_inicio === 'mapa' && r.preferencias.dias_atraso === 5, r.preferencias);
  r = await llamar('lider', '/cuenta');
  esperar('Cada persona tiene lo suyo: la cuenta del Líder sigue con los valores de siempre', JSON.stringify(r.preferencias) === JSON.stringify(base), r.preferencias);

  // ================= B. Números de contacto =================
  r = await llamar('consulta', '/cuenta', { telefonos: [{ nombre: 'Celular', prefijo: '+57', numero: '300 123-4567' }, { nombre: 'Casa', prefijo: '+57', numero: '(601) 2345678' }] }, 'PUT');
  const tel = (await llamar('consulta', '/cuenta')).telefonos;
  esperar('Se guardan los números, en el orden dado y sin espacios, guiones ni paréntesis', r.ok && tel.length === 2 && tel[0].numero === '3001234567' && tel[1].numero === '6012345678' && tel[0].nombre === 'Celular' && tel[1].prefijo === '+57', tel);
  for (const [nombre, t] of [['sin nombre', { nombre: ' ', prefijo: '+57', numero: '3001234567' }], ['con prefijo que no existe', { nombre: 'X', prefijo: '+999', numero: '3001234567' }],
    ['demasiado corto', { nombre: 'X', prefijo: '+57', numero: '123' }], ['con letras', { nombre: 'X', prefijo: '+57', numero: 'abc12345' }], ['demasiado largo', { nombre: 'X', prefijo: '+57', numero: '1234567890123456' }],
    ['con el nombre larguísimo', { nombre: 'x'.repeat(61), prefijo: '+57', numero: '3001234567' }]]) {
    r = await llamar('consulta', '/cuenta', { telefonos: [t] }, 'PUT');
    esperar(`Se rechaza un número ${nombre}`, r.status === 400 && r.error, r);
  }
  r = await llamar('consulta', '/cuenta', { telefonos: [{ nombre: 'A', prefijo: '+57', numero: '3001234567' }, { nombre: 'B', prefijo: '+57', numero: '300-123-4567' }] }, 'PUT');
  esperar('Se rechaza el mismo número repetido (aunque venga escrito distinto)', r.status === 400 && /repetido/.test(r.error), r);
  r = await llamar('consulta', '/cuenta', { telefonos: Array.from({ length: 11 }, (_, i) => ({ nombre: 'N' + i, prefijo: '+57', numero: '30012345' + String(i).padStart(2, '0') })) }, 'PUT');
  esperar('Máximo 10 números', r.status === 400 && /hasta 10/.test(r.error), r);
  esperar('Lo rechazado no tocó los números guardados', (await llamar('consulta', '/cuenta')).telefonos.length === 2, null);
  r = await llamar('consulta', '/cuenta', { alerta_dias: 25 }, 'PUT');
  esperar('Guardar sin mandar números los conserva', r.ok && (await llamar('consulta', '/cuenta')).telefonos.length === 2, r);
  r = await llamar('consulta', '/cuenta', { telefonos: [{ nombre: 'Trabajo', prefijo: '+1', numero: '2025550123' }] }, 'PUT');
  esperar('Mandar la lista nueva reemplaza a la anterior (un número con prefijo +1)', r.ok && JSON.stringify((await llamar('consulta', '/cuenta')).telefonos.map(t => [t.nombre, t.prefijo, t.numero])) === JSON.stringify([['Trabajo', '+1', '2025550123']]), r);
  esperar('Los números son de cada persona (el Líder no ve los de Colaborador)', (await llamar('lider', '/cuenta')).telefonos.length === 0, null);
  r = await llamar('consulta', '/cuenta', { telefonos: [] }, 'PUT');
  esperar('Mandar la lista vacía los borra todos', r.ok && (await llamar('consulta', '/cuenta')).telefonos.length === 0, r);

  // ================= C. Firma mecánica =================
  r = await llamar('consulta', '/cuenta/firma');
  esperar('Sin firma subida, pedirla da 404', r.status === 404, r);
  r = await subir('consulta', PNG, 'firma.png', 'image/png');
  esperar('Se sube una firma PNG', r.status === 200 && r.ok, r);
  let f = await llamar('consulta', '/cuenta/firma');
  esperar('Se puede ver: imagen PNG con los mismos bytes, sin que el navegador adivine su tipo y sin guardarse en caché', f.status === 200 && f.tipo.startsWith('image/png') && f.bytes.equals(PNG)
    && f.cabeceras.get('x-content-type-options') === 'nosniff' && /no-store/.test(f.cabeceras.get('cache-control')), [f.status, f.tipo]);
  esperar('La cuenta avisa que ya hay firma', (await llamar('consulta', '/cuenta')).tiene_firma === true, null);
  r = await subir('consulta', JPG, 'otra.jpg', 'image/jpeg');
  f = await llamar('consulta', '/cuenta/firma');
  esperar('Subir otra firma reemplaza la anterior (ahora JPG)', r.ok && f.tipo.startsWith('image/jpeg') && f.bytes.equals(JPG), [r, f.tipo]);
  r = await subir('consulta', Buffer.from('esto no es una imagen, solo texto'), 'firma.png', 'image/png');
  esperar('Un archivo que dice ser PNG pero no lo es se rechaza (se mira el contenido)', r.status === 415 && /PNG o JPG/.test(r.error), r);
  r = await subir('consulta', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'firma.svg', 'image/svg+xml');
  esperar('Un SVG tampoco se acepta (podría llevar código)', r.status === 415, r);
  r = await subir('consulta', Buffer.concat([PNG, Buffer.alloc(1100 * 1024, 1)]), 'grande.png', 'image/png');
  esperar('Más de 1 MB se rechaza', r.status === 413 && /1 MB/.test(r.error), r);
  r = await subir('consulta', PNG_GRANDE, 'ancha.png', 'image/png');
  esperar('Una imagen de más de 4000 píxeles se rechaza', r.status === 400 && /demasiado grande/.test(r.error), r);
  r = await llamar('consulta', '/cuenta/firma', new FormData());
  esperar('Sin imagen avisa que no llegó nada', r.status === 400 && /ninguna imagen/.test(r.error), r);
  f = await llamar('consulta', '/cuenta/firma');
  esperar('Lo rechazado no cambió la firma guardada (sigue la JPG)', f.status === 200 && f.bytes.equals(JPG), f.status);
  r = await llamar('lider', '/cuenta/firma');
  esperar('La firma es solo de su dueña: el Líder no puede verla ni por casualidad', r.status === 404, r);
  r = await llamar('anonimo', '/cuenta/firma');
  esperar('Y sin sesión tampoco', r.status === 401, r);
  r = await llamar('consulta', '/cuenta/firma', null, 'DELETE');
  esperar('Se puede quitar la firma', r.ok && (await llamar('consulta', '/cuenta/firma')).status === 404 && (await llamar('consulta', '/cuenta')).tiene_firma === false, r);
  r = await llamar('consulta', '/cuenta/firma', null, 'DELETE');
  esperar('Quitarla otra vez no da error', r.ok, r);
  esperar('Subir la firma no borró las preferencias', (await llamar('consulta', '/cuenta')).preferencias.pagina_inicio === 'mapa', null);

  // ================= D. Mi SGI: mis mecanismos con su última y próxima sesión =================
  const cat = await llamar('calidad', '/catalogos');
  const ids = Object.fromEntries(cat.usuarios.map(u => [u.rol, u.id]));
  const nombre = 'Comité de prueba ' + Date.now();
  r = await llamar('calidad', '/mecanismos', { tipo: 'Comité', nombre, periodicidad: 'Mensual', objetivo: 'Probar', coordinador_id: ids.lider_calidad,
    integrantes: [{ usuario_id: ids.lider_calidad, privilegio: 'Administrador - Miembro', calidad: 'Principal' }, { usuario_id: ids.lider_proceso, privilegio: 'Miembro', calidad: 'Principal' }] });
  const mid = r.id;
  const acta = async fecha => (await llamar('calidad', `/mecanismos/${mid}/actas`, { fecha })).id;
  const [a1, a2, a3, a4, a5, a6] = [await acta(dia(-30)), await acta(dia(-10)), await acta(dia(0)), await acta(dia(20)), await acta(dia(40)), await acta(dia(5))];
  await llamar('calidad', `/actas/${a6}/estado`, { accion: 'anular' });                          // una futura que se anuló no cuenta
  await llamar('calidad', `/actas/${a2}/estado`, { accion: 'cerrar' });                          // cerrada o abierta, la sesión de antes de hoy cuenta igual
  r = await llamar('lider', '/mis-mecanismos');
  let m = r.find(x => x.id === mid);
  esperar('El Líder (integrante) ve el comité en «Mi SGI»', r.status === 200 && !!m && m.nombre === nombre && m.tipo === 'Comité', r);
  esperar('Última sesión = la más reciente antes de hoy', m.ultima === dia(-10), m);
  esperar('Próxima sesión = la primera desde hoy (una de hoy cuenta como próxima; la anulada del día 5 no cuenta)', m.proxima === dia(0), m);
  r = await llamar('consulta', '/mis-mecanismos');
  esperar('Un Colaborador que no integra el comité no lo ve', !r.some(x => x.id === mid), r.map(x => x.nombre));
  r = await llamar('calidad', '/mis-mecanismos');
  esperar('Quien coordina el comité también lo ve', r.some(x => x.id === mid), r.map(x => x.nombre));
  await llamar('calidad', `/actas/${a3}/estado`, { accion: 'anular' });
  m = (await llamar('lider', '/mis-mecanismos')).find(x => x.id === mid);
  esperar('Si se anula la de hoy, la próxima pasa a ser la siguiente (día 20)', m.proxima === dia(20) && m.ultima === dia(-10), m);
  for (const a of [a4, a5]) await llamar('calidad', `/actas/${a}/estado`, { accion: 'anular' });
  m = (await llamar('lider', '/mis-mecanismos')).find(x => x.id === mid);
  esperar('Sin sesiones futuras, la próxima queda vacía', m.proxima === null && m.ultima === dia(-10), m);
  r = await llamar('calidad', '/mecanismos', { tipo: 'Reunión', nombre: 'Reunión sin sesiones ' + Date.now(), periodicidad: 'Eventual', coordinador_id: ids.lider_calidad,
    integrantes: [{ usuario_id: ids.lider_proceso, privilegio: 'Miembro', calidad: 'Principal' }] });
  const lista = await llamar('lider', '/mis-mecanismos'), sin = lista.find(x => x.id === r.id);
  esperar('Un mecanismo todavía sin sesiones sale con última y próxima vacías', sin && sin.ultima === null && sin.proxima === null, sin);
  esperar('La lista va ordenada por tipo y nombre', lista.every((x, i) => !i || (lista[i - 1].tipo + ' ' + lista[i - 1].nombre).localeCompare(x.tipo + ' ' + x.nombre, 'es') <= 0), lista.map(x => x.tipo + ' ' + x.nombre));
  esperar('Las fechas vienen como AAAA-MM-DD', lista.every(x => [x.ultima, x.proxima].every(v => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v))), lista);
  r = await llamar('anonimo', '/mis-mecanismos');
  esperar('Sin sesión no se ve la lista', r.status === 401, r);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nLa cuenta y Mi SGI funcionan');
  process.exit(fallos ? 1 : 0);
})();
