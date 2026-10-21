// Prueba de «Mi cuenta» (perfil, preferencias, contactos, foto y firma): node prueba-cuenta.js (con el servidor corriendo y la base limpia)
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
// Descarga binaria (imágenes): estado, tipo, caché y bytes
async function bajar(quien, ruta) {
  const r = await fetch(B + ruta, { headers: { cookie: sesiones[quien] || '' } });
  return { status: r.status, tipo: r.headers.get('content-type'), cache: r.headers.get('cache-control'), bytes: Buffer.from(await r.arrayBuffer()) };
}
const subir = (quien, ruta, bytes, nombre, tipo) => {
  const fd = new FormData(); fd.append('archivo', new Blob([bytes], { type: tipo }), nombre);
  return llamar(quien, ruta, fd);
};
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', detalle); } };

// PNG válido de 1×1 px
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

(async () => {
  for (const u of ['admin', 'calidad', 'produccion', 'consulta']) await llamar(u, '/login', { usuario: u, clave: u + '123' });

  // ---- Perfil y valores por defecto ----
  let c = await llamar('produccion', '/cuenta');
  esperar('El perfil trae nombre, cargo, rol, proceso y empresa', c.usuario === 'produccion' && c.rol === 'lider_proceso' && c.proceso && c.empresa === 'Metalcof', c);
  esperar('Valores por defecto: alerta 30 días, inicio «inicio», avisos activos', c.pref_alerta_dias === 30 && c.pref_inicio === 'inicio' && c.pref_notif_atraso === true && c.pref_dias_atraso === 1, c);
  esperar('Sin foto, firma ni contactos', !c.tiene_foto && !c.tiene_firma && c.contactos.length === 0, c);
  esperar('No revela el nombre del archivo de foto/firma ni la clave', !('foto' in c) && !('firma' in c) && !('clave' in c), Object.keys(c));
  let y = await llamar('produccion', '/yo');
  esperar('/yo trae lo necesario para el menú: foto, versión y alerta', y.tiene_foto === 0 && y.foto_v === 0 && y.pref_alerta_dias === 30 && y.pref_inicio === 'inicio' && !('clave' in y), y);
  const sin = await fetch(B + '/cuenta');
  esperar('Sin sesión no se ve el perfil', sin.status === 401, sin.status);

  // ---- Preferencias ----
  const base = { correo: 'luis@metalcof.co', pref_notif_atraso: true, pref_dias_atraso: 2, pref_notif_proximas: false, pref_dias_proximas: 3, pref_alerta_dias: 45, pref_inicio: 'documentos' };
  let r = await llamar('produccion', '/cuenta', { ...base, correo: 'esto no es un correo' }, 'PUT');
  esperar('Rechaza un correo con mal formato', r.status === 400 && /correo/i.test(r.error), r);
  r = await llamar('produccion', '/cuenta', { ...base, pref_alerta_dias: 0 }, 'PUT');
  esperar('Rechaza una alerta temprana de 0 días', r.status === 400, r);
  r = await llamar('produccion', '/cuenta', { ...base, pref_alerta_dias: 400 }, 'PUT');
  esperar('Rechaza una alerta temprana de más de 365 días', r.status === 400, r);
  r = await llamar('produccion', '/cuenta', { ...base, pref_dias_atraso: 'abc' }, 'PUT');
  esperar('Rechaza días que no son un número', r.status === 400, r);
  r = await llamar('produccion', '/cuenta', { ...base, pref_inicio: 'https://malo.example' }, 'PUT');
  esperar('Solo acepta páginas de inicio conocidas', r.status === 400, r);
  r = await llamar('produccion', '/cuenta', base, 'PUT');
  esperar('Guarda las preferencias', r.correo === 'luis@metalcof.co' && r.pref_alerta_dias === 45 && r.pref_inicio === 'documentos' && r.pref_notif_proximas === false && r.pref_dias_proximas === 3, r);
  y = await llamar('produccion', '/yo');
  esperar('/yo refleja la página de inicio y la alerta guardadas', y.pref_inicio === 'documentos' && y.pref_alerta_dias === 45 && y.correo === 'luis@metalcof.co', y);
  r = await llamar('produccion', '/pendientes');
  esperar('La alerta temprana del usuario fija la ventana de «por vencer»', r.dias_alerta === 45, r);
  r = await llamar('calidad', '/pendientes');
  esperar('Otro usuario conserva su propia ventana (30 días)', r.dias_alerta === 30, r);
  r = await llamar('produccion', '/cuenta', { ...base, correo: '' }, 'PUT');
  esperar('El correo se puede borrar', r.correo === null, r);

  // ---- Contactos ----
  r = await llamar('produccion', '/cuenta/contactos', { tipo: 'Fax', numero: '3001234567' });
  esperar('Rechaza un tipo de número desconocido', r.status === 400, r);
  r = await llamar('produccion', '/cuenta/contactos', { tipo: 'Celular', numero: 'llámame' });
  esperar('Rechaza un número con letras', r.status === 400, r);
  r = await llamar('produccion', '/cuenta/contactos', { tipo: 'Celular', numero: '123' });
  esperar('Rechaza un número demasiado corto', r.status === 400, r);
  r = await llamar('produccion', '/cuenta/contactos', { tipo: 'Celular', numero: '+57 300 123 4567' });
  esperar('Agrega un celular', r.contactos?.length === 1 && r.contactos[0].numero === '+57 300 123 4567', r);
  const idContacto = r.contactos?.[0]?.id;
  for (const n of ['3101111111', '3102222222', '3103333333', '3104444444']) r = await llamar('produccion', '/cuenta/contactos', { tipo: 'WhatsApp', numero: n });
  esperar('Permite hasta 5 números', r.contactos?.length === 5, r);
  r = await llamar('produccion', '/cuenta/contactos', { tipo: 'Teléfono', numero: '8123456' });
  esperar('El sexto número se rechaza', r.status === 400, r);
  r = await llamar('consulta', `/cuenta/contactos/${idContacto}`, null, 'DELETE');
  esperar('Otro usuario no puede borrar mis contactos (no cambia nada)', (await llamar('produccion', '/cuenta')).contactos.length === 5, r);
  r = await llamar('produccion', `/cuenta/contactos/${idContacto}`, null, 'DELETE');
  esperar('Borra un contacto propio', r.contactos?.length === 4, r);

  // ---- Foto ----
  r = await subir('produccion', '/cuenta/foto', Buffer.from('esto es texto, no una imagen'), 'foto.png', 'image/png');
  esperar('Rechaza un archivo que dice ser PNG pero no lo es', r.status === 400 && /PNG, JPG o WebP/.test(r.error), r);
  r = await subir('produccion', '/cuenta/foto', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'foto.svg', 'image/svg+xml');
  esperar('Rechaza un SVG (puede llevar scripts)', r.status === 400, r);
  r = await subir('produccion', '/cuenta/foto', Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]), 'enorme.png', 'image/png');
  esperar('Rechaza una foto de más de 2 MB con un mensaje claro', r.status === 400 && /2 MB/.test(r.error), r);
  const vacio = await llamar('produccion', '/cuenta/foto', new FormData());
  esperar('Pide elegir una imagen si no llega ninguna', vacio.status === 400, vacio);
  r = await subir('produccion', '/cuenta/foto', PNG, 'mi-foto.png', 'image/png');
  esperar('Sube una foto PNG', r.tiene_foto === true && r.foto_v === 1, r);
  let img = await bajar('consulta', `/usuarios/${c.id}/foto`);
  esperar('Cualquier usuario de la empresa ve la foto (menús y fichas), con tipo y caché correctos', img.status === 200 && img.tipo === 'image/png' && /max-age/.test(img.cache) && img.bytes.equals(PNG), { s: img.status, t: img.tipo, c: img.cache });
  r = await subir('produccion', '/cuenta/foto', JPG, 'otra.jpg', 'image/jpeg');
  esperar('Reemplazar la foto sube la versión (y cambia el tipo a JPEG)', r.foto_v === 2, r);
  img = await bajar('produccion', `/usuarios/${c.id}/foto`);
  esperar('Y se sirve la nueva imagen, no la anterior', img.status === 200 && img.tipo === 'image/jpeg', img.tipo);
  y = await llamar('produccion', '/yo');
  esperar('/yo avisa que hay foto y su versión (para la URL con ?v=)', y.tiene_foto === 1 && y.foto_v === 2, y);
  const anonima = await fetch(B + `/usuarios/${c.id}/foto`);
  esperar('Sin sesión no se descarga la foto', anonima.status === 401, anonima.status);
  r = await llamar('produccion', '/cuenta/foto', null, 'DELETE');
  esperar('Quita la foto', r.tiene_foto === false && r.foto_v === 3, r);
  img = await bajar('produccion', `/usuarios/${c.id}/foto`);
  esperar('Sin foto, la descarga da 404', img.status === 404, img.status);

  // ---- Firma: solo su dueño y Calidad ----
  r = await subir('produccion', '/cuenta/firma', Buffer.concat([PNG, Buffer.alloc(1.5 * 1024 * 1024)]), 'firma.png', 'image/png');
  esperar('La firma tiene un límite menor: 1 MB', r.status === 400 && /1 MB/.test(r.error), r);
  r = await subir('produccion', '/cuenta/firma', PNG, 'firma.png', 'image/png');
  esperar('Sube la firma', r.tiene_firma === true && r.firma_v === 1, r);
  img = await bajar('produccion', `/usuarios/${c.id}/firma`);
  esperar('El dueño ve su firma, sin caché', img.status === 200 && img.bytes.equals(PNG) && /no-store/.test(img.cache), { s: img.status, c: img.cache });
  img = await bajar('consulta', `/usuarios/${c.id}/firma`);
  esperar('Un usuario de consulta NO ve la firma de otro', img.status === 404, img.status);
  img = await bajar('calidad', `/usuarios/${c.id}/firma`);
  esperar('Calidad sí puede verla (para los flujos de aprobación)', img.status === 200, img.status);
  img = await bajar('admin', `/usuarios/${c.id}/firma`);
  esperar('El administrador también', img.status === 200, img.status);
  r = await llamar('produccion', '/cuenta/firma', null, 'DELETE');
  esperar('Quita la firma', r.tiene_firma === false, r);
  img = await bajar('calidad', `/usuarios/${c.id}/firma`);
  esperar('Sin firma, la descarga da 404', img.status === 404, img.status);

  // ---- La foto de un usuario no se mezcla con la de otro ----
  r = await subir('calidad', '/cuenta/foto', PNG, 'calidad.png', 'image/png');
  const idCalidad = (await llamar('calidad', '/cuenta')).id;
  esperar('Cada usuario tiene su propia foto', r.tiene_foto === true && (await llamar('produccion', '/cuenta')).tiene_foto === false && (await bajar('consulta', `/usuarios/${idCalidad}/foto`)).status === 200, r);
  img = await bajar('consulta', '/usuarios/99999/foto');
  esperar('Un usuario que no existe da 404', img.status === 404, img.status);

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo el módulo «Mi cuenta» funciona');
  process.exit(fallos ? 1 : 0);
})();
