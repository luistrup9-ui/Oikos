// Prueba de «Olvidé mi clave» con correo: el corredor (herramientas/correr-pruebas.mjs recuperar-clave) arranca el servidor PHP con el SMTP
// apuntando a 127.0.0.1:3197 y a esta prueba le toca levantar ahí un SMTP falso que guarda lo que recibe. No envía correos reales.
const net = require('node:net');
const { spawnSync } = require('node:child_process');

const B = 'http://localhost:3100/api';
const PUERTO_SMTP = 3197;
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle)?.slice(0, 500)); } };
const dormir = ms => new Promise(r => setTimeout(r, ms));

// SMTP mínimo: acepta todo y guarda cada mensaje (destinatario, remitente y texto)
const correos = [];
const conexiones = new Set();
const smtp = net.createServer(s => {
  conexiones.add(s); s.on('close', () => conexiones.delete(s));
  s.write('220 prueba ESMTP\r\n');
  let buf = '', enDatos = false, texto = '', para = '', de = '';
  s.on('data', d => {
    buf += d;
    for (let i; (i = buf.indexOf('\r\n')) >= 0;) {
      const l = buf.slice(0, i); buf = buf.slice(i + 2);
      if (enDatos) {
        if (l === '.') { enDatos = false; s.write('250 OK\r\n'); correos.push({ de, para, texto }); texto = ''; }
        else texto += l.replace(/^\./, '') + '\n';
        continue;
      }
      const c = l.slice(0, 4).toUpperCase();
      if (c === 'EHLO' || c === 'HELO') s.write('250-prueba\r\n250 8BITMIME\r\n');
      else if (c === 'MAIL') { de = (/<(.*)>/.exec(l) || [])[1]; s.write('250 OK\r\n'); }
      else if (c === 'RCPT') { para = (/<(.+)>/.exec(l) || [])[1]; s.write('250 OK\r\n'); }
      else if (c === 'DATA') { enDatos = true; s.write('354 Termina con un punto\r\n'); }
      else if (c === 'QUIT') { s.write('221 Adiós\r\n'); s.end(); }
      else s.write('250 OK\r\n');
    }
  });
  s.on('error', () => {});
});

async function http(ruta, cuerpo, cookie, metodo) {
  const r = await fetch(B + ruta, { method: metodo || (cuerpo ? 'POST' : 'GET'),
    headers: { ...(cookie ? { cookie } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) }, body: cuerpo && JSON.stringify(cuerpo) });
  const txt = await r.text(); let json = {}; try { json = JSON.parse(txt); } catch { json = { texto: txt }; }
  return Array.isArray(json) ? Object.assign(json, { status: r.status }) : { status: r.status, ...json, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const esperarCorreos = async n => { for (let i = 0; i < 80 && correos.length < n; i++) await dormir(100); return correos.length >= n; };
const tokenDe = c => (/#\/restablecer\?t=([a-f0-9]{64})/.exec(c?.texto || '') || [])[1];
// Para vencer un enlace se toca la base de prueba directamente (no hay otra forma de «esperar una hora»)
const sql = consulta => spawnSync(process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe', ['-u', process.env.MYSQL_USUARIO || 'root', ...(process.env.MYSQL_CLAVE ? [`-p${process.env.MYSQL_CLAVE}`] : []), 'oikos_prueba', '-e', consulta], { encoding: 'utf8' });

(async () => {
  await new Promise((ok, mal) => { smtp.once('error', mal); smtp.listen(PUERTO_SMTP, '127.0.0.1', ok); });
  try {
    let r = await http('/login', { usuario: 'admin@oikos.test', clave: 'admin123' });
    esperar('El administrador sembrado entra', r.ok, r);
    const admin = r.cookie;
    for (const [correo, nombre] of [['ana@empresa.test', 'Ana Ruiz'], ['beto@empresa.test', 'Beto Gil']]) {
      r = await http('/usuarios', { correo, nombre, rol: 'consulta', clave: 'ClaveVieja2026' }, admin);
      esperar(`Se crea ${correo} con clave conocida`, !!r.id, r);
    }

    r = await http('/olvide', { correo: 'ANA@empresa.test' });
    esperar('Con SMTP configurado, la respuesta dice que va por correo', r.ok && r.por_correo === true, r);
    esperar('Llega un correo', await esperarCorreos(1), correos);
    const c1 = correos[0], t1 = tokenDe(c1);
    esperar('Al correo de la persona (sin importar mayúsculas)', c1?.para === 'ana@empresa.test', c1?.para);
    esperar('Desde el remitente configurado', c1?.de === 'oikos@empresa.test', c1?.de);
    esperar('Con el enlace a la dirección de la aplicación', !!t1 && c1.texto.includes('http://oikos.test/OIKOS/#/restablecer?t=' + t1), c1?.texto);
    esperar('Saluda por el nombre y avisa que vale 60 minutos', /Hola Ana Ruiz/.test(c1?.texto) && /60 minutos/.test(c1?.texto), c1?.texto);

    r = await http('/olvide', { correo: 'nadie@empresa.test' });
    await dormir(800);
    esperar('Un correo que no existe responde igual y no envía nada', r.ok && r.por_correo === true && correos.length === 1, { r, n: correos.length });

    const sesionAna = (await http('/login', { usuario: 'ana@empresa.test', clave: 'ClaveVieja2026' })).cookie;
    r = await http('/restablecer', { token: t1, nueva: 'corta' });
    esperar('Exige una clave válida', r.status === 400 && /clave/i.test(r.error), r);
    r = await http('/restablecer', { token: t1, nueva: 'ClaveNueva2026' });
    esperar('El enlace restablece la clave', r.ok, r);
    esperar('Y cierra las sesiones abiertas', (await http('/yo', null, sesionAna)).status === 401);
    esperar('La clave anterior ya no sirve', (await http('/login', { usuario: 'ana@empresa.test', clave: 'ClaveVieja2026' })).status === 401);
    esperar('La nueva sí', (await http('/login', { usuario: 'ana@empresa.test', clave: 'ClaveNueva2026' })).ok);
    r = await http('/restablecer', { token: t1, nueva: 'OtraClave2026' });
    esperar('El enlace se usa una sola vez', r.status === 400 && /venció/.test(r.error), r);

    await http('/olvide', { correo: 'ana@empresa.test' });
    await http('/olvide', { correo: 'ana@empresa.test' });
    await esperarCorreos(3);
    r = await http('/restablecer', { token: tokenDe(correos[1]), nueva: 'OtraClave2026' });
    esperar('Pedir otro enlace anula el anterior', r.status === 400, r);
    r = await http('/restablecer', { token: tokenDe(correos[2]), nueva: 'OtraClave2026' });
    esperar('El último sí sirve', r.ok, r);

    await http('/olvide', { correo: 'beto@empresa.test' });
    await esperarCorreos(4);
    sql("UPDATE reinicios_clave SET vence = '2000-01-01 00:00:00' WHERE usado IS NULL");
    r = await http('/restablecer', { token: tokenDe(correos[3]), nueva: 'ClaveBeto2026' });
    esperar('Un enlace vencido no sirve', r.status === 400, r);

    const lista = async () => (await http('/usuarios', null, admin)).filter?.(u => u?.correo) || [];
    let us = await lista();
    esperar('Con correo no queda aviso para el administrador', us.length >= 2 && !us.some(u => u.reinicio_solicitado), us.filter(u => u.reinicio_solicitado));

    // Si el servidor de correo falla, la petición le llega al administrador
    await new Promise(res => { for (const s of conexiones) s.destroy(); smtp.close(res); });
    r = await http('/olvide', { correo: 'beto@empresa.test' });
    esperar('Si el correo falla, igual responde bien', r.ok, r);
    let avisado = false;
    for (let i = 0; i < 60 && !avisado; i++) { await dormir(250); us = await lista(); avisado = us.some(u => u.correo === 'beto@empresa.test' && u.reinicio_solicitado); }
    esperar('Y el administrador ve el aviso', avisado, us.filter(u => u.correo === 'beto@empresa.test'));
  } finally {
    try { smtp.close(); } catch { /* ya cerrado */ }
  }
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nLa recuperación de clave por correo funciona');
  process.exit(fallos ? 1 : 0);
})();
