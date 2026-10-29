// Prueba de «Olvidé mi clave» con correo: levanta su propio servidor y un SMTP falso que guarda lo que recibe.
// No toca tus datos ni envía correos reales. Uso: node prueba-recuperar-clave.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'sgi-prueba-clave-'));
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle)?.slice(0, 500)); } };
const dormir = ms => new Promise(r => setTimeout(r, ms));

// SMTP mínimo: acepta todo y guarda cada mensaje (destinatario y texto ya decodificado)
const correos = [];
const smtp = net.createServer(s => {
  s.write('220 prueba ESMTP\r\n');
  let buf = '', enDatos = false, texto = '', para = '';
  s.on('data', d => {
    buf += d;
    for (let i; (i = buf.indexOf('\r\n')) >= 0;) {
      const l = buf.slice(0, i); buf = buf.slice(i + 2);
      if (enDatos) {
        if (l === '.') {
          enDatos = false; s.write('250 OK\r\n');
          correos.push({ para, texto: texto.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) });
          texto = '';
        } else texto += l.replace(/^\./, '') + '\n';
        continue;
      }
      const c = l.slice(0, 4).toUpperCase();
      if (c === 'EHLO' || c === 'HELO') s.write('250-prueba\r\n250 8BITMIME\r\n');
      else if (c === 'RCPT') { para = (/<(.+)>/.exec(l) || [])[1]; s.write('250 OK\r\n'); }
      else if (c === 'DATA') { enDatos = true; s.write('354 Termina con un punto\r\n'); }
      else if (c === 'QUIT') { s.write('221 Adiós\r\n'); s.end(); }
      else s.write('250 OK\r\n');
    }
  });
  s.on('error', () => {});
});

function arrancar(puerto, extra) {
  const log = [];
  const p = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(puerto), BACKUP_AUTO: '0', DATA_DIR: datos, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => log.push(String(d))); p.stderr.on('data', d => log.push(String(d)));
  return { p, log, base: `http://127.0.0.1:${puerto}`,
    listo: async () => { for (let i = 0; i < 100; i++) { if (log.join('').includes('listo')) return true; await dormir(100); } return false; },
    parar: () => new Promise(r => { p.once('exit', r); p.kill('SIGTERM'); setTimeout(() => { p.kill(); r(); }, 3000).unref(); }) };
}
async function http(srv, ruta, cuerpo, cookie) {
  const r = await fetch(srv.base + '/api' + ruta, { method: cuerpo ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) }, body: cuerpo && JSON.stringify(cuerpo) });
  let json = {}; try { json = await r.json(); } catch { /* vacío */ }
  return { status: r.status, ...json, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const esperarCorreos = async n => { for (let i = 0; i < 50 && correos.length < n; i++) await dormir(100); return correos.length >= n; };
const tokenDe = c => (/#\/restablecer\?t=([a-f0-9]{64})/.exec(c?.texto || '') || [])[1];

(async () => {
  await new Promise(r => smtp.listen(0, '127.0.0.1', r));
  const S = arrancar(3197, { ADMIN_CLAVE_INICIAL: 'Inicial2026ab', ADMIN_CORREO: 'Jefe@Empresa.test',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_FROM: 'oikos@empresa.test', APP_URL: 'http://oikos.test/OIKOS/' });
  try {
    esperar('El servidor arranca', await S.listo(), S.log.join(''));
    esperar('El primer arranque muestra el correo del administrador', /Usuario: jefe@empresa\.test/.test(S.log.join('')), S.log.join(''));
    let r = await http(S, '/login', { usuario: 'jefe@empresa.test', clave: 'Inicial2026ab' });
    esperar('El administrador inicial entra con ADMIN_CORREO', r.ok, r);
    const admin = r.cookie;
    for (const [correo, nombre] of [['ana@empresa.test', 'Ana Ruiz'], ['beto@empresa.test', 'Beto Gil']])
      await http(S, '/usuarios', { correo, nombre, rol: 'consulta', clave: 'ClaveVieja2026' }, admin);

    r = await http(S, '/olvide', { correo: 'ANA@empresa.test' });
    esperar('Con SMTP configurado, la respuesta dice que va por correo', r.ok && r.por_correo === true, r);
    esperar('Llega un correo', await esperarCorreos(1), correos);
    const c1 = correos[0], t1 = tokenDe(c1);
    esperar('Al correo de la persona', c1?.para === 'ana@empresa.test', c1?.para);
    esperar('Con el enlace a APP_URL', t1 && c1.texto.includes('http://oikos.test/OIKOS/#/restablecer?t=' + t1), c1?.texto);

    r = await http(S, '/olvide', { correo: 'nadie@empresa.test' });
    await dormir(800);
    esperar('Un correo que no existe responde igual y no envía nada', r.ok && r.por_correo === true && correos.length === 1, { r, n: correos.length });

    const sesionAna = (await http(S, '/login', { usuario: 'ana@empresa.test', clave: 'ClaveVieja2026' })).cookie;
    r = await http(S, '/restablecer', { token: t1, nueva: 'corta' });
    esperar('Exige una clave válida', r.status === 400 && /clave/.test(r.error), r);
    r = await http(S, '/restablecer', { token: t1, nueva: 'ClaveNueva2026' });
    esperar('El enlace restablece la clave', r.ok, r);
    esperar('Y cierra las sesiones abiertas', (await http(S, '/yo', null, sesionAna)).status === 401);
    esperar('La clave anterior ya no sirve', (await http(S, '/login', { usuario: 'ana@empresa.test', clave: 'ClaveVieja2026' })).status === 401);
    esperar('La nueva sí', (await http(S, '/login', { usuario: 'ana@empresa.test', clave: 'ClaveNueva2026' })).ok);
    r = await http(S, '/restablecer', { token: t1, nueva: 'OtraClave2026' });
    esperar('El enlace se usa una sola vez', r.status === 400 && /venció/.test(r.error), r);

    await http(S, '/olvide', { correo: 'ana@empresa.test' });
    await http(S, '/olvide', { correo: 'ana@empresa.test' });
    await esperarCorreos(3);
    r = await http(S, '/restablecer', { token: tokenDe(correos[1]), nueva: 'OtraClave2026' });
    esperar('Pedir otro enlace anula el anterior', r.status === 400, r);
    r = await http(S, '/restablecer', { token: tokenDe(correos[2]), nueva: 'OtraClave2026' });
    esperar('El último sí sirve', r.ok, r);

    await http(S, '/olvide', { correo: 'beto@empresa.test' });
    await esperarCorreos(4);
    const db = new DatabaseSync(path.join(datos, 'sgi.db'));
    db.exec("UPDATE reinicios_clave SET vence = '2000-01-01 00:00:00' WHERE usado IS NULL");
    db.close();
    r = await http(S, '/restablecer', { token: tokenDe(correos[3]), nueva: 'ClaveBeto2026' });
    esperar('Un enlace vencido no sirve', r.status === 400, r);

    const lista = async () => Object.values(await http(S, '/usuarios', null, admin)).filter(u => u?.correo); // la respuesta es un arreglo
    let us = await lista();
    esperar('Con correo no queda aviso para el administrador', us.length === 3 && !us.some(u => u.reinicio_solicitado), us);

    // Si el servidor de correo falla, la petición le llega al administrador
    await new Promise(r => smtp.close(r));
    r = await http(S, '/olvide', { correo: 'beto@empresa.test' });
    esperar('Si el correo falla, igual responde bien', r.ok, r);
    let avisado = false;
    for (let i = 0; i < 60 && !avisado; i++) { await dormir(250); us = await lista(); avisado = us.some(u => u.correo === 'beto@empresa.test' && u.reinicio_solicitado); }
    esperar('Y el administrador ve el aviso', avisado, us);
  } finally {
    await S.parar();
    fs.rmSync(datos, { recursive: true, force: true });
  }
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nLa recuperación de clave por correo funciona');
  process.exit(fallos ? 1 : 0);
})();
