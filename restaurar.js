// Restaura un respaldo. Uso (con el sistema APAGADO):  node restaurar.js ruta/sgi-2026-10-20_020000.tar.gz
// Antes de reemplazar nada, guarda los datos actuales en DATA_DIR/antes-de-restaurar-<fecha>/
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const archivo = process.argv[2] && path.resolve(process.argv[2]);

function salir(msg) { console.error('Error: ' + msg); process.exit(1); }
if (!archivo) salir('indica el respaldo: node restaurar.js ruta/sgi-AAAA-MM-DD_HHMMSS.tar.gz');
if (!fs.existsSync(archivo)) salir('no existe ' + archivo);

const gnu = (() => { try { return /GNU tar/.test(execFileSync('tar', ['--version']).toString()); } catch { return salir('no se encontró "tar"'); } })();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sgi-restaurar-'));
try {
  execFileSync('tar', [...(gnu ? ['--force-local'] : []), '-xzf', archivo, '-C', tmp], { stdio: 'pipe' });
  const dbNueva = path.join(tmp, 'sgi.db');
  if (!fs.existsSync(dbNueva)) salir('el respaldo no contiene sgi.db');

  // Comprueba que la base del respaldo esté sana antes de tocar nada
  const prueba = new DatabaseSync(dbNueva, { readOnly: true });
  const sano = prueba.prepare('PRAGMA integrity_check').get().integrity_check === 'ok';
  const usuarios = prueba.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
  const documentos = prueba.prepare('SELECT COUNT(*) n FROM documentos').get().n;
  prueba.close();
  if (!sano) salir('la base del respaldo está dañada; no se restauró nada');

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const actual = path.join(DATA_DIR, 'sgi.db');
  if (fs.existsSync(actual)) {
    const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const guardado = path.join(DATA_DIR, 'antes-de-restaurar-' + sello);
    fs.mkdirSync(guardado);
    for (const f of ['sgi.db', 'sgi.db-wal', 'sgi.db-shm', 'archivos'])
      if (fs.existsSync(path.join(DATA_DIR, f))) fs.renameSync(path.join(DATA_DIR, f), path.join(guardado, f));
    console.log('Datos anteriores guardados en ' + guardado);
  }
  fs.copyFileSync(dbNueva, actual);
  if (fs.existsSync(path.join(tmp, 'archivos'))) fs.cpSync(path.join(tmp, 'archivos'), path.join(DATA_DIR, 'archivos'), { recursive: true });
  else fs.mkdirSync(path.join(DATA_DIR, 'archivos'), { recursive: true });
  console.log(`Restauración lista: ${usuarios} usuarios, ${documentos} documentos. Ya puedes encender el sistema.`);
} catch (e) {
  salir(e.message);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
