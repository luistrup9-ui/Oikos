// Base de datos SQLite (node:sqlite, incluido en Node 22+) con esquema y datos iniciales.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

// En producción (Docker) los datos viven en un volumen aparte: DATA_DIR
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const PRODUCCION = process.env.NODE_ENV === 'production';
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'sgi.db'));
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');   // lecturas y escrituras sin bloquearse; copias consistentes
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS empresas (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, empresa_id INTEGER REFERENCES empresas(id),
  usuario TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, cargo TEXT,
  rol TEXT NOT NULL CHECK (rol IN ('admin','lider_calidad','lider_proceso','consulta')),
  proceso_id INTEGER, clave TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id), creada TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS procesos (
  id INTEGER PRIMARY KEY, empresa_id INTEGER REFERENCES empresas(id),
  nombre TEXT NOT NULL, sigla TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('Estratégico','Misional','Apoyo')), orden INTEGER);
CREATE TABLE IF NOT EXISTS tipos_documento (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, sigla TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clases_documento (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, sigla TEXT NOT NULL);

-- Motor de flujo configurable: estados y transiciones permitidas por rol
CREATE TABLE IF NOT EXISTS estados (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, orden INTEGER);
CREATE TABLE IF NOT EXISTS transiciones (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, desde TEXT, hacia TEXT NOT NULL REFERENCES estados(id),
  roles TEXT NOT NULL, nueva_version INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY, empresa_id INTEGER REFERENCES empresas(id),
  codigo TEXT UNIQUE, nombre TEXT NOT NULL,
  tipo_id INTEGER REFERENCES tipos_documento(id), clase_id INTEGER REFERENCES clases_documento(id),
  proceso_id INTEGER REFERENCES procesos(id), origen TEXT DEFAULT 'Interno',
  descripcion TEXT, responsable_id INTEGER REFERENCES usuarios(id),
  estado TEXT NOT NULL REFERENCES estados(id), version INTEGER DEFAULT 1,
  fecha_documento TEXT, fecha_vencimiento TEXT,
  creado TEXT DEFAULT CURRENT_TIMESTAMP, modificado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS documento_versiones (
  id INTEGER PRIMARY KEY, documento_id INTEGER REFERENCES documentos(id), version INTEGER,
  archivo TEXT, archivo_nombre TEXT, cambios TEXT, usuario_id INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bitacora (
  id INTEGER PRIMARY KEY, documento_id INTEGER REFERENCES documentos(id), version INTEGER,
  transicion_id TEXT, estado_inicial TEXT, estado_final TEXT, usuario_id INTEGER,
  comentario TEXT, fecha TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, tipo_solicitud TEXT NOT NULL CHECK (tipo_solicitud IN ('Creación','Modificación','Eliminación')),
  documento_id INTEGER REFERENCES documentos(id), tipo_id INTEGER, clase_id INTEGER, proceso_id INTEGER,
  nombre TEXT NOT NULL, justificacion TEXT NOT NULL, descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Aprobada','Rechazada')),
  solicitante_id INTEGER REFERENCES usuarios(id), revisor_id INTEGER, respuesta TEXT,
  creada TEXT DEFAULT CURRENT_TIMESTAMP, resuelta TEXT);

CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, documento_id INTEGER REFERENCES documentos(id),
  nombre TEXT NOT NULL, proceso_id INTEGER REFERENCES procesos(id),
  responsable_cargo TEXT, responsable_area TEXT, medio TEXT, ubicacion TEXT,
  tiempo_retencion TEXT, disposicion_final TEXT, recuperacion TEXT);
`);

// Columnas añadidas después de la primera versión. Las de «Mi cuenta»: correo, foto y firma (solo el nombre del archivo, que vive en
// archivos/usuarios/; *_v cambia con cada subida para que el navegador no use una copia vieja) y preferencias del usuario.
for (const [col, def] of [['activo', 'INTEGER NOT NULL DEFAULT 1'], ['debe_cambiar', 'INTEGER NOT NULL DEFAULT 0'],
  ['correo', 'TEXT'], ['foto', 'TEXT'], ['foto_v', 'INTEGER NOT NULL DEFAULT 0'], ['firma', 'TEXT'], ['firma_v', 'INTEGER NOT NULL DEFAULT 0'],
  ['pref_notif_atraso', 'INTEGER NOT NULL DEFAULT 1'], ['pref_dias_atraso', 'INTEGER NOT NULL DEFAULT 1'],
  ['pref_notif_proximas', 'INTEGER NOT NULL DEFAULT 1'], ['pref_dias_proximas', 'INTEGER NOT NULL DEFAULT 1'],
  ['pref_alerta_dias', 'INTEGER NOT NULL DEFAULT 30'], ['pref_inicio', "TEXT NOT NULL DEFAULT 'inicio'"]])
  if (!db.prepare('PRAGMA table_info(usuarios)').all().some(c => c.name === col)) db.exec(`ALTER TABLE usuarios ADD COLUMN ${col} ${def}`);
db.exec(`CREATE TABLE IF NOT EXISTS usuario_contactos (
  id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('Celular','Teléfono','WhatsApp')), numero TEXT NOT NULL)`);

function hash(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  return sal + ':' + crypto.scryptSync(clave, sal, 32).toString('hex');
}
function verificar(clave, guardada) {
  const [sal, h] = guardada.split(':');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(clave, sal, 32));
}

function sembrar() {
  if (db.prepare('SELECT COUNT(*) n FROM empresas').get().n) return;
  db.prepare('INSERT INTO empresas (id, nombre) VALUES (1, ?)').run('Metalcof');

  const procesos = [
    ['Estratégico', 'Gestión Gerencial', 'GER'], ['Estratégico', 'Gestión Comercial', 'COM'],
    ['Estratégico', 'Gestión Financiera', 'FIN'], ['Estratégico', 'Sistema Integrado de Gestión', 'SIG'],
    ['Misional', 'Control de Calidad', 'CCA'], ['Misional', 'Comercialización y Captación Digital', 'CCD'],
    ['Misional', 'Diseño y Desarrollo del Producto', 'DDP'], ['Misional', 'Servicio Post Venta', 'SPV'],
    ['Misional', 'Producción', 'PRO'], ['Misional', 'Logística y Distribución', 'LOG'],
    ['Misional', 'Gestión de Almacén y Compras', 'ALM'],
    ['Apoyo', 'Gestión de Talento Humano', 'GTH'], ['Apoyo', 'Gestión Administrativa', 'ADM'],
    ['Apoyo', 'Gestión de Activos Fijos', 'ACT'], ['Apoyo', 'Gestión de Facturación', 'FAC'],
    ['Apoyo', 'Gestión de Infraestructura y Mantenimiento', 'MAN'],
  ];
  const insP = db.prepare('INSERT INTO procesos (empresa_id, categoria, nombre, sigla, orden) VALUES (1,?,?,?,?)');
  procesos.forEach((p, i) => insP.run(p[0], p[1], p[2], i));

  const insT = db.prepare('INSERT INTO tipos_documento (nombre, sigla) VALUES (?,?)');
  [['Proceso', 'PRC'], ['Subproceso', 'SUB'], ['Procedimiento', 'PR'], ['Documento específico', 'DES'], ['Instructivo', 'IN']]
    .forEach(t => insT.run(...t));
  const insC = db.prepare('INSERT INTO clases_documento (nombre, sigla) VALUES (?,?)');
  [['Formatos', 'FOR'], ['Guías', 'GUI'], ['Instructivos', 'INS'], ['Manuales', 'MAN'], ['Caracterización', 'CAR'],
   ['Documentos de área', 'DOC'], ['Matrices', 'MAT'], ['Programas', 'PRG'], ['Políticas', 'POL'],
   ['Procedimientos', 'PRO'], ['Protocolo', 'PRT'], ['Registro', 'REG'], ['Planes', 'PLA']]
    .forEach(c => insC.run(...c));

  const insE = db.prepare('INSERT INTO estados (id, nombre, orden) VALUES (?,?,?)');
  [['ELABORACION', 'Elaboración / Modificación (Líder de proceso)', 1], ['REVISION', 'Revisión por Líder de Calidad', 2],
   ['PUBLICACION', 'Publicación', 3], ['VIGENTE', 'Vigente', 4], ['ELIMINADO', 'Eliminado', 5]]
    .forEach(e => insE.run(...e));
  const insTr = db.prepare('INSERT INTO transiciones (id, nombre, desde, hacia, roles, nueva_version) VALUES (?,?,?,?,?,?)');
  [['enviar_revision', 'Enviar a revisión', 'ELABORACION', 'REVISION', 'lider_proceso,admin', 0],
   ['aprobar', 'Aprobar', 'REVISION', 'PUBLICACION', 'lider_calidad,admin', 0],
   ['devolver', 'Devolver', 'REVISION', 'ELABORACION', 'lider_calidad,admin', 0],
   ['publicar', 'Publicar', 'PUBLICACION', 'VIGENTE', 'lider_calidad,admin', 0],
   ['modificar', 'Iniciar modificación', 'VIGENTE', 'ELABORACION', 'lider_calidad,admin', 1],
   ['eliminar', 'Eliminar', null, 'ELIMINADO', 'lider_calidad,admin', 0]]
    .forEach(t => insTr.run(...t));

  const pid = s => db.prepare('SELECT id FROM procesos WHERE sigla=?').get(s).id;
  const insU = db.prepare('INSERT INTO usuarios (empresa_id, usuario, nombre, cargo, rol, proceso_id, clave) VALUES (1,?,?,?,?,?,?)');
  if (PRODUCCION) {
    // Sin usuarios de prueba: un solo administrador con clave temporal (la de ADMIN_CLAVE_INICIAL o una al azar en el log)
    const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let clave = process.env.ADMIN_CLAVE_INICIAL, generada = false;
    if (!clave) {
      generada = true;
      do clave = Array.from(crypto.randomBytes(14), b => a[b % a.length]).join('');
      while (!/[a-zA-Z]/.test(clave) || !/d/.test(clave));
    }
    insU.run('admin', 'Administrador', 'Administrador del sistema', 'admin', null, hash(clave));
    db.exec('UPDATE usuarios SET debe_cambiar = 1');
    console.log('==================================================');
    console.log(' Primer arranque: usuario administrador creado.');
    console.log(' Usuario: admin');
    console.log(generada ? ' Clave temporal: ' + clave + '   (guárdala; se pide cambiarla al entrar)' : ' Clave: la de ADMIN_CLAVE_INICIAL (se pide cambiarla al entrar)');
    console.log('==================================================');
    return;
  }
  insU.run('admin', 'Administrador', 'Administrador del sistema', 'admin', null, hash('admin123'));
  insU.run('calidad', 'Líder de Calidad', 'Coordinador de Calidad', 'lider_calidad', pid('SIG'), hash('calidad123'));
  insU.run('produccion', 'Líder de Producción', 'Jefe de Producción', 'lider_proceso', pid('PRO'), hash('produccion123'));
  insU.run('consulta', 'Usuario de consulta', 'Auxiliar', 'consulta', null, hash('consulta123'));
  db.exec('UPDATE usuarios SET debe_cambiar = 1'); // las claves de prueba se cambian al entrar
}
sembrar();

module.exports = { db, hash, verificar, DATA_DIR, PRODUCCION };
