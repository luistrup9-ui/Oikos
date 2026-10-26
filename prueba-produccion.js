// Prueba del modo producción, los respaldos y la restauración. No toca tus datos: usa carpetas temporales
// y sus propios servidores. Uso: node prueba-produccion.js
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sgi-prueba-prod-'));
const dir = n => { const d = path.join(raiz, n); fs.mkdirSync(d, { recursive: true }); return d; };
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle)?.slice(0, 500)); } };
const dormir = ms => new Promise(r => setTimeout(r, ms));

function arrancar(puerto, extra) {
  const log = [];
  const p = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(puerto), BACKUP_AUTO: '0', TRUST_PROXY: '1', ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => log.push(String(d))); p.stderr.on('data', d => log.push(String(d)));
  return { p, log, base: `http://127.0.0.1:${puerto}`,
    listo: async () => { for (let i = 0; i < 100; i++) { if (log.join('').includes('listo')) return true; await dormir(100); } return false; },
    parar: () => new Promise(r => { p.once('exit', r); p.kill('SIGTERM'); setTimeout(() => { p.kill(); r(); }, 3000).unref(); }) };
}
async function http(srv, ruta, { metodo, cuerpo, cookie, cabeceras } = {}) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { ...(cookie ? { cookie } : {}), ...cabeceras } };
  if (cuerpo instanceof FormData) o.body = cuerpo;
  else if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(srv.base + ruta, o);
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString()); } catch { /* binario */ }
  return { status: r.status, h: r.headers, buf, json: json || {} , cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  const datos = dir('datos'), copias = dir('copias');
  const A = arrancar(3199, { DATA_DIR: datos, BACKUP_DIR: copias, ADMIN_CLAVE_INICIAL: 'Inicial2026ab', BACKUP_KEEP: '2' });
  try {
    esperar('El servidor arranca en modo producción', await A.listo(), A.log.join(''));
    esperar('El primer arranque explica cómo entrar', /Usuario: admin/.test(A.log.join('')), A.log.join(''));

    let r = await http(A, '/healthz');
    esperar('/healthz responde sin sesión', r.status === 200 && r.json.ok, r.json);
    esperar('Cabeceras de seguridad (CSP, nosniff, frame) y sin x-powered-by', r.h.get('content-security-policy')?.includes("frame-ancestors 'none'") &&
      r.h.get('x-content-type-options') === 'nosniff' && r.h.get('x-frame-options') === 'DENY' && !r.h.get('x-powered-by'), [...r.h.keys()]);
    esperar('Sin HSTS por HTTP plano', !r.h.get('strict-transport-security'), r.h.get('strict-transport-security'));
    r = await http(A, '/healthz', { cabeceras: { 'X-Forwarded-Proto': 'https' } });
    esperar('Con HTTPS (vía proxy) envía HSTS', /max-age=31536000/.test(r.h.get('strict-transport-security') || ''), r.h.get('strict-transport-security'));

    r = await http(A, '/api/login', { cuerpo: { usuario: 'calidad', clave: 'calidad123' } });
    esperar('No existen los usuarios de prueba', r.status === 401, r.json);
    r = await http(A, '/api/login', { cuerpo: { usuario: 'admin', clave: 'admin123' } });
    esperar('Ni la clave de prueba de admin', r.status === 401, r.json);
    r = await http(A, '/api/login', { cuerpo: { usuario: 'admin', clave: 'Inicial2026ab' } });
    esperar('Admin entra con ADMIN_CLAVE_INICIAL', r.status === 200, r.json);
    const sc = r.h.get('set-cookie');
    esperar('Cookie HttpOnly, SameSite=Strict y con vencimiento, sin Secure por HTTP', /HttpOnly/.test(sc) && /SameSite=Strict/.test(sc) && /Max-Age=43200/.test(sc) && !/Secure/.test(sc), sc);
    const admin = r.cookie;
    r = await http(A, '/api/login', { cuerpo: { usuario: 'admin', clave: 'Inicial2026ab' }, cabeceras: { 'X-Forwarded-Proto': 'https' } });
    esperar('Por HTTPS la cookie lleva Secure', /Secure/.test(r.h.get('set-cookie')), r.h.get('set-cookie'));

    r = await http(A, '/api/yo', { cookie: admin });
    esperar('Debe cambiar la clave inicial', r.json.debe_cambiar === 1 && r.json.rol === 'admin', r.json);
    r = await http(A, '/api/usuarios', { cookie: admin });
    esperar('Solo existe el administrador', r.json.length === 1, r.json);
    r = await http(A, '/api/riesgos', { cookie: admin });
    esperar('Sin riesgos de ejemplo', r.json.length === 0, r.json.length);
    r = await http(A, '/api/indicadores', { cookie: admin });
    esperar('Pero sí los 15 indicadores de Metalcof, sin responsable', r.json.length === 15 && r.json.every(i => i.responsable_id === null), r.json.length);
    r = await http(A, '/api/catalogos', { cookie: admin });
    esperar('Y los 16 procesos', r.json.procesos.length === 16, r.json.procesos?.length);

    // ---- Datos que deben sobrevivir a la restauración ----
    r = await http(A, '/api/usuarios', { cookie: admin, cuerpo: { usuario: 'ana', nombre: 'Ana Ruiz', rol: 'consulta', clave: 'ClaveAna2026' } });
    const pid = (await http(A, '/api/catalogos', { cookie: admin })).json.procesos.find(p => p.sigla === 'PRO').id;
    r = await http(A, '/api/documentos', { cookie: admin, cuerpo: { nombre: 'Procedimiento de prueba', tipo_id: 3, clase_id: 10, proceso_id: pid } });
    const docId = r.json.id;
    const fd = new FormData(); fd.append('archivo', new Blob(['contenido original del documento']), 'doc-v1.txt');
    r = await http(A, `/api/documentos/${docId}/archivo`, { cookie: admin, cuerpo: fd });
    esperar('Crea un documento con archivo adjunto', r.json.ok, r.json);

    // ---- Respaldos ----
    const ana = (await http(A, '/api/login', { cuerpo: { usuario: 'ana', clave: 'ClaveAna2026' } })).cookie;
    r = await http(A, '/api/respaldos', { cookie: ana });
    esperar('Un usuario normal no ve los respaldos', r.status === 403, r.json);
    r = await http(A, '/api/respaldos', { cookie: admin, metodo: 'POST' });
    const nombre1 = r.json.nombre;
    esperar('Admin crea un respaldo (.tar.gz con segundos en el nombre)', /^sgi-\d{4}-\d{2}-\d{2}_\d{6}\.tar\.gz$/.test(nombre1) && r.json.bytes > 1000, r.json);
    r = await http(A, `/api/respaldos/${nombre1}`, { cookie: admin });
    esperar('Lo puede descargar (archivo gzip)', r.status === 200 && r.buf[0] === 0x1f && r.buf[1] === 0x8b, r.buf.length);
    r = await http(A, `/api/respaldos/${nombre1}`, { cookie: ana });
    esperar('Y un usuario normal no', r.status === 403, r.json);
    r = await http(A, '/api/respaldos/..%2F..%2Fsgi.db', { cookie: admin });
    esperar('No deja salir de la carpeta de copias', r.status === 400 || r.status === 404, r.status);

    // Cambios posteriores al respaldo: no deben aparecer al restaurar
    await http(A, '/api/usuarios', { cookie: admin, cuerpo: { usuario: 'despues', nombre: 'Creado después', rol: 'consulta', clave: 'ClaveDespues26' } });

    // Retención: BACKUP_KEEP=2, hacen falta nombres distintos (segundos)
    await dormir(1100); await http(A, '/api/respaldos', { cookie: admin, metodo: 'POST' });
    await dormir(1100); await http(A, '/api/respaldos', { cookie: admin, metodo: 'POST' });
    r = await http(A, '/api/respaldos', { cookie: admin });
    esperar('Conserva solo las últimas 2 copias', r.json.archivos.length === 2 && !r.json.archivos.some(x => x.nombre === nombre1), r.json.archivos.map(x => x.nombre));
    const ultima = path.join(copias, r.json.archivos[0].nombre);

    // ---- Restauración (en otra carpeta, sin tocar la base viva) ----
    const destino = dir('restaurado');
    let x = spawnSync(process.execPath, [path.join(__dirname, 'restaurar.js'), ultima], { env: { ...process.env, DATA_DIR: destino }, encoding: 'utf8' });
    esperar('La restauración termina bien', x.status === 0 && /Restauración lista/.test(x.stdout), x.stdout + x.stderr);
    const bd = new DatabaseSync(path.join(destino, 'sgi.db'), { readOnly: true });
    const nUsuarios = bd.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
    const doc = bd.prepare('SELECT nombre FROM documentos').get();
    esperar('La base restaurada está sana y trae todos los datos', bd.prepare('PRAGMA integrity_check').get().integrity_check === 'ok' && doc?.nombre === 'Procedimiento de prueba', doc);
    esperar('Incluye a los usuarios al momento del respaldo (admin, ana y despues)', nUsuarios === 3, nUsuarios);
    bd.close();
    const adj = fs.readdirSync(path.join(destino, 'archivos'));
    esperar('Y el archivo adjunto con su contenido', adj.length === 1 && fs.readFileSync(path.join(destino, 'archivos', adj[0]), 'utf8') === 'contenido original del documento', adj);

    // Restaurar el PRIMER respaldo no existe (ya podado): se usa el más antiguo disponible, que ya incluye a "despues".
    // Para probar que un respaldo previo no trae lo posterior, se crea otro en una base distinta:
    const B = arrancar(3198, { DATA_DIR: dir('datosB'), BACKUP_DIR: dir('copiasB'), ADMIN_CLAVE_INICIAL: 'Inicial2026ab' });
    await B.listo();
    const cb = (await http(B, '/api/login', { cuerpo: { usuario: 'admin', clave: 'Inicial2026ab' } })).cookie;
    const copiaB = (await http(B, '/api/respaldos', { cookie: cb, metodo: 'POST' })).json.nombre;
    await http(B, '/api/usuarios', { cookie: cb, cuerpo: { usuario: 'tarde', nombre: 'Tarde', rol: 'consulta', clave: 'ClaveTarde2026' } });
    await B.parar();
    const dB = dir('restauradoB');
    x = spawnSync(process.execPath, [path.join(__dirname, 'restaurar.js'), path.join(raiz, 'copiasB', copiaB)], { env: { ...process.env, DATA_DIR: dB }, encoding: 'utf8' });
    const bdB = new DatabaseSync(path.join(dB, 'sgi.db'), { readOnly: true });
    esperar('Un respaldo no trae lo creado después (1 usuario, sin "tarde")', bdB.prepare('SELECT COUNT(*) n FROM usuarios').get().n === 1, x.stdout);
    bdB.close();

    // Restaurar sobre datos existentes: guarda primero lo anterior
    x = spawnSync(process.execPath, [path.join(__dirname, 'restaurar.js'), path.join(raiz, 'copiasB', copiaB)], { env: { ...process.env, DATA_DIR: destino }, encoding: 'utf8' });
    const previas = fs.readdirSync(destino).filter(n => n.startsWith('antes-de-restaurar-'));
    esperar('Al restaurar sobre datos existentes los guarda en "antes-de-restaurar-…"', x.status === 0 && previas.length === 1 &&
      fs.existsSync(path.join(destino, previas[0], 'sgi.db')), [x.stdout, x.stderr, previas]);

    // Respaldo dañado: no toca nada
    const roto = path.join(raiz, 'sgi-2026-01-01_000000.tar.gz');
    fs.writeFileSync(roto, 'esto no es un respaldo');
    const antes = fs.statSync(path.join(destino, 'sgi.db')).size;
    x = spawnSync(process.execPath, [path.join(__dirname, 'restaurar.js'), roto], { env: { ...process.env, DATA_DIR: destino }, encoding: 'utf8' });
    esperar('Un respaldo dañado se rechaza sin tocar los datos', x.status === 1 && fs.statSync(path.join(destino, 'sgi.db')).size === antes, x.stderr);
    x = spawnSync(process.execPath, [path.join(__dirname, 'restaurar.js')], { env: { ...process.env, DATA_DIR: destino }, encoding: 'utf8' });
    esperar('Sin argumentos explica el uso', x.status === 1 && /indica el respaldo/.test(x.stderr), x.stderr);

    // ---- Cierre ordenado ----
    const code = await new Promise(res => { A.p.once('exit', c => res(c)); A.p.kill('SIGTERM'); });
    esperar('SIGTERM cierra el servidor limpiamente', code === 0 || code === null, code);
  } finally { try { A.p.kill(); } catch { /* ya cerrado */ } }

  // ---- Vencimiento de sesión ----
  const C = arrancar(3197, { DATA_DIR: dir('datosC'), ADMIN_CLAVE_INICIAL: 'Inicial2026ab', SESSION_HORAS: '0.0008' });
  await C.listo();
  let r = await http(C, '/api/login', { cuerpo: { usuario: 'admin', clave: 'Inicial2026ab' } });
  const ck = r.cookie;
  esperar('La sesión funciona al principio', (await http(C, '/api/yo', { cookie: ck })).status === 200, null);
  await dormir(4200);
  r = await http(C, '/api/yo', { cookie: ck });
  esperar('Y vence pasado su tiempo (SESSION_HORAS)', r.status === 401, r.json);
  await C.parar();

  fs.rmSync(raiz, { recursive: true, force: true });
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo el modo producción y los respaldos funcionan');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
