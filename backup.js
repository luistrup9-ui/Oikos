// Respaldos: instantánea consistente de la base (VACUUM INTO) + archivos adjuntos, en un .tar.gz.
// Uso manual: node backup.js        Automático: lo programa el servidor (ver BACKUP_* en .env.example)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { db, DATA_DIR, PRODUCCION } = require('./db');

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups'));
const CONSERVAR = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);
const PATRON = /^sgi-\d{4}-\d{2}-\d{2}_\d{6}\.tar\.gz$/;
const pad = n => String(n).padStart(2, '0');

const nombreDe = (d = new Date()) =>
  `sgi-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.tar.gz`;

// GNU tar confunde "C:\..." con un equipo remoto; --force-local lo evita (bsdtar de Windows no lo necesita)
function opcionesTar() {
  try { return /GNU tar/.test(execFileSync('tar', ['--version']).toString()) ? ['--force-local'] : []; }
  catch { throw new Error('No se encontró el programa "tar" en el sistema'); }
}

function info(ruta) {
  const s = fs.statSync(ruta);
  return { nombre: path.basename(ruta), bytes: s.size, fecha: s.mtime.toISOString() };
}

function listar() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(n => PATRON.test(n)).sort().reverse().map(n => info(path.join(BACKUP_DIR, n)));
}

function podar() {
  listar().slice(CONSERVAR).forEach(x => fs.rmSync(path.join(BACKUP_DIR, x.nombre), { force: true }));
}

function crearRespaldo() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const destino = path.join(BACKUP_DIR, nombreDe());
  if (fs.existsSync(destino)) throw new Error('Ya existe un respaldo de este mismo segundo');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sgi-respaldo-'));
  try {
    // VACUUM INTO genera una copia íntegra aunque el sistema esté en uso
    db.exec(`VACUUM INTO '${path.join(tmp, 'sgi.db').replace(/'/g, "''")}'`);
    const args = [...opcionesTar(), '-czf', destino + '.parcial', '-C', tmp, 'sgi.db'];
    if (fs.existsSync(path.join(DATA_DIR, 'archivos'))) args.push('-C', DATA_DIR, 'archivos');
    execFileSync('tar', args, { stdio: 'pipe' });
    fs.renameSync(destino + '.parcial', destino);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(destino + '.parcial', { force: true });
  }
  podar();
  return info(destino);
}

// Un respaldo diario: pasada la hora BACKUP_HORA (por defecto las 2:00), si hoy aún no hay uno
function programar() {
  // Automático en producción; en desarrollo solo si BACKUP_AUTO=1
  if (process.env.BACKUP_AUTO === '0' || (!PRODUCCION && process.env.BACKUP_AUTO !== '1')) return;
  const hora = Number(process.env.BACKUP_HORA ?? 2);
  const revisar = () => {
    const ahora = new Date();
    if (ahora.getHours() < hora) return;
    if (listar().some(x => x.nombre.startsWith(nombreDe(ahora).slice(0, 14)))) return;
    try { console.log('Respaldo creado:', crearRespaldo().nombre); }
    catch (e) { console.error('FALLÓ EL RESPALDO AUTOMÁTICO:', e.message); }
  };
  setTimeout(revisar, 30_000).unref();
  setInterval(revisar, 30 * 60 * 1000).unref();
}

module.exports = { BACKUP_DIR, PATRON, listar, crearRespaldo, programar };

if (require.main === module) {
  try { const x = crearRespaldo(); console.log(`Respaldo creado: ${path.join(BACKUP_DIR, x.nombre)} (${(x.bytes / 1024).toFixed(0)} KB)`); }
  catch (e) { console.error('Error:', e.message); process.exit(1); }
}
