// SGI — Gestión documental. API REST + archivos estáticos.
const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { db, verificar, DATA_DIR } = require('./db');

const app = express();
const DIR_ARCHIVOS = path.join(DATA_DIR, 'archivos');
fs.mkdirSync(DIR_ARCHIVOS, { recursive: true });
const subida = multer({ dest: DIR_ARCHIVOS, limits: { fileSize: 25 * 1024 * 1024 } });

app.disable('x-powered-by');
// Detrás de Caddy/Nginx: confía en X-Forwarded-Proto para saber si la conexión llegó por HTTPS
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Chequeo de salud para Docker y monitoreo (sin sesión)
app.get('/healthz', (req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ ok: true }); } catch { res.status(500).json({ ok: false }); }
});

// node:sqlite no acepta undefined: se convierte a NULL
const nulos = p => p.map(v => v === undefined || v === '' ? null : v);
const uno = (sql, ...p) => db.prepare(sql).get(...nulos(p));
const todos = (sql, ...p) => db.prepare(sql).all(...nulos(p));
const ejecutar = (sql, ...p) => db.prepare(sql).run(...nulos(p));
const ahora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

class ErrorHttp extends Error { constructor(estado, msg) { super(msg); this.estado = estado; } }
const falla = (estado, msg) => { throw new ErrorHttp(estado, msg); };
// Envuelve handlers para que los errores lleguen como JSON
const r = fn => (req, res) => {
  try { const out = fn(req, res); if (out !== undefined) res.json(out); }
  catch (e) { res.status(e.estado || 500).json({ error: e.message }); if (!e.estado) console.error(e); }
};
function transaccion(fn) {
  db.exec('BEGIN');
  try { const v = fn(); db.exec('COMMIT'); return v; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- Autenticación ----------
const SESION_SEGUNDOS = Math.max(2, Math.round((Number(process.env.SESSION_HORAS) || 12) * 3600));
const cookieSesion = (req, valor, vida) => `sgi=${valor}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${vida}${req.secure ? '; Secure' : ''}`;
function token(req) {
  const m = /(?:^|;\s*)sgi=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return m && m[1];
}
app.use('/api', (req, res, next) => {
  if (['/login', '/olvide', '/restablecer'].includes(req.path)) return next(); // lo único que se usa sin sesión: entrar y recuperar la clave
  const t = token(req);
  const u = t && uno(`SELECT u.id, u.usuario, u.correo, u.nombre, u.cargo, u.rol, u.proceso_id, u.empresa_id, u.debe_cambiar
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND u.activo = 1
      AND s.creada > datetime('now', ?)`, t, `-${SESION_SEGUNDOS} seconds`);
  if (!u) return res.status(401).json({ error: 'Sesión no válida' });
  req.u = u; next();
});
const esCalidad = u => u.rol === 'admin' || u.rol === 'lider_calidad';
const alcance = require('./alcance')({ todos });

const intentos = new Map(); // usuario -> { n, hasta }: bloqueo tras 5 fallos
app.post('/api/login', r((req, res) => {
  // Se ingresa con el correo corporativo (o con el usuario de siempre); el campo del formulario se sigue llamando «usuario»
  const nombre = String(req.body.usuario || req.body.correo || '').trim().toLowerCase();
  const reg = intentos.get(nombre), vigente = reg && Date.now() < reg.hasta;
  if (vigente && reg.n >= 5) falla(429, 'Demasiados intentos fallidos. Espera 15 minutos.');
  const u = uno(nombre.includes('@') ? 'SELECT * FROM usuarios WHERE correo = ?' : 'SELECT * FROM usuarios WHERE usuario = ?', nombre);
  if (!u || !u.activo || !verificar(String(req.body.clave || ''), u.clave)) {
    intentos.set(nombre, { n: (vigente ? reg.n : 0) + 1, hasta: Date.now() + 15 * 60 * 1000 });
    falla(401, 'Correo o clave incorrectos');
  }
  intentos.delete(nombre);
  const t = crypto.randomBytes(24).toString('hex');
  ejecutar('INSERT INTO sesiones (token, usuario_id) VALUES (?,?)', t, u.id);
  res.setHeader('Set-Cookie', cookieSesion(req, t, SESION_SEGUNDOS));
  return { ok: true };
}));
app.post('/api/logout', r((req, res) => {
  ejecutar('DELETE FROM sesiones WHERE token = ?', token(req));
  res.setHeader('Set-Cookie', cookieSesion(req, '', 0));
  return { ok: true };
}));
// procesos_propios: los procesos que lidera (con sus subprocesos); null si no tiene restricción
app.get('/api/yo', r(req => ({ ...req.u, empresa: uno('SELECT nombre FROM empresas WHERE id = ?', req.u.empresa_id)?.nombre,
  procesos_propios: alcance.propios(req.u) })));

app.get('/api/catalogos', r(req => ({
  procesos: todos('SELECT * FROM procesos WHERE empresa_id = ? ORDER BY orden', req.u.empresa_id),
  tipos: todos('SELECT * FROM tipos_documento ORDER BY id'),
  clases: todos('SELECT * FROM clases_documento ORDER BY nombre'),
  estados: todos('SELECT * FROM estados ORDER BY orden'),
  transiciones: todos('SELECT id, nombre FROM transiciones'),
  usuarios: todos('SELECT id, nombre, cargo, rol FROM usuarios WHERE empresa_id = ? AND activo = 1 ORDER BY nombre', req.u.empresa_id),
})));

// ---------- Motor de flujo ----------
function transicionesDisponibles(doc, u) {
  return todos('SELECT * FROM transiciones').filter(t => {
    if (t.desde ? t.desde !== doc.estado : doc.estado === 'ELIMINADO') return false;
    if (!t.roles.split(',').includes(u.rol)) return false;
    // El líder de proceso solo mueve documentos de su proceso o de los que es responsable
    if (u.rol === 'lider_proceso') return doc.responsable_id === u.id || alcance.lidera(doc.proceso_id, u);
    return true;
  });
}

function aplicarTransicion(doc, transicionId, u, comentario) {
  const t = transicionesDisponibles(doc, u).find(x => x.id === transicionId);
  if (!t) falla(403, 'Transición no permitida para este documento o rol');
  if (t.id === 'devolver' && !String(comentario || '').trim()) falla(400, 'Para devolver hay que explicar el motivo');
  if (t.id === 'enviar_revision' &&
      !uno('SELECT 1 FROM documento_versiones WHERE documento_id = ? AND version = ? AND archivo IS NOT NULL', doc.id, doc.version))
    falla(400, `Adjunta el archivo de la versión ${doc.version} antes de enviarlo a revisión`);

  const version = t.nueva_version ? doc.version + 1 : doc.version;
  ejecutar('UPDATE documentos SET estado = ?, version = ?, modificado = ? WHERE id = ?', t.hacia, version, ahora(), doc.id);
  ejecutar(`INSERT INTO bitacora (documento_id, version, transicion_id, estado_inicial, estado_final, usuario_id, comentario, fecha)
    VALUES (?,?,?,?,?,?,?,?)`, doc.id, version, t.id, doc.estado, t.hacia, u.id, comentario || null, ahora());
  if (t.id === 'publicar' && !doc.fecha_documento)
    ejecutar('UPDATE documentos SET fecha_documento = ? WHERE id = ?', ahora().slice(0, 10), doc.id);
}

function nuevoCodigo(procesoId, claseId) {
  const p = uno('SELECT sigla FROM procesos WHERE id = ?', procesoId);
  const c = uno('SELECT sigla FROM clases_documento WHERE id = ?', claseId);
  if (!p || !c) falla(400, 'Proceso o clase inválidos');
  const prefijo = `${p.sigla}-${c.sigla}-`;
  const n = uno("SELECT COUNT(*) n FROM documentos WHERE codigo LIKE ? || '%'", prefijo).n + 1;
  return prefijo + String(n).padStart(2, '0');
}

function crearDocumento(datos, u) {
  if (!String(datos.nombre || '').trim()) falla(400, 'El nombre es obligatorio');
  const codigo = nuevoCodigo(datos.proceso_id, datos.clase_id);
  const id = ejecutar(`INSERT INTO documentos (empresa_id, codigo, nombre, tipo_id, clase_id, proceso_id, origen, descripcion,
      responsable_id, estado, fecha_vencimiento) VALUES (?,?,?,?,?,?,?,?,?, 'ELABORACION', ?)`,
    u.empresa_id, codigo, datos.nombre.trim(), datos.tipo_id, datos.clase_id, datos.proceso_id, datos.origen || 'Interno',
    datos.descripcion || null, datos.responsable_id || u.id, datos.fecha_vencimiento || null).lastInsertRowid;
  ejecutar(`INSERT INTO bitacora (documento_id, version, transicion_id, estado_inicial, estado_final, usuario_id, comentario, fecha)
    VALUES (?,1,'crear',NULL,'ELABORACION',?,?,?)`, id, u.id, 'Documento creado', ahora());
  return Number(id);
}

// ---------- Documentos ----------
const SELECT_DOC = `SELECT d.*, t.nombre tipo, c.nombre clase, p.nombre proceso, p.categoria, e.nombre estado_nombre,
    u.nombre responsable FROM documentos d
  JOIN tipos_documento t ON t.id = d.tipo_id JOIN clases_documento c ON c.id = d.clase_id
  JOIN procesos p ON p.id = d.proceso_id JOIN estados e ON e.id = d.estado
  LEFT JOIN usuarios u ON u.id = d.responsable_id`;

app.get('/api/documentos', r(req => {
  const q = req.query, w = ['d.empresa_id = ?'], p = [req.u.empresa_id];
  const lista = v => [].concat(v || []).filter(Boolean);
  const enLista = (col, v) => { const l = lista(v); if (l.length) { w.push(`${col} IN (${l.map(() => '?').join(',')})`); p.push(...l); } };
  enLista('d.tipo_id', q.tipo); enLista('d.proceso_id', q.proceso); enLista('d.clase_id', q.clase);
  enLista('d.origen', q.origen); enLista('d.estado', q.estado);
  if (!lista(q.estado).length) w.push("d.estado != 'ELIMINADO'");
  // Usuarios de consulta solo ven documentos vigentes
  if (req.u.rol === 'consulta') w.push("d.estado = 'VIGENTE'");
  // El líder de proceso lee los vigentes de todos los procesos, pero el trabajo en curso solo ve el de su proceso
  if (req.u.rol === 'lider_proceso') { const ids = alcance.propios(req.u); w.push(`(d.estado = 'VIGENTE' OR d.responsable_id = ?${ids.length ? ` OR d.proceso_id IN (${ids.map(() => '?').join(',')})` : ''})`); p.push(req.u.id, ...ids); }
  if (q.texto) { w.push('(d.codigo LIKE ? OR d.nombre LIKE ? OR d.descripcion LIKE ?)'); p.push(...Array(3).fill(`%${q.texto}%`)); }
  const campoFecha = { creado: 'd.creado', documento: 'd.fecha_documento', vencimiento: 'd.fecha_vencimiento' }[q.campo_fecha] || 'd.modificado';
  if (q.op === '>' && q.fecha1) { w.push(`${campoFecha} >= ?`); p.push(q.fecha1); }
  if (q.op === '<' && q.fecha1) { w.push(`${campoFecha} <= ?`); p.push(q.fecha1 + ' 23:59:59'); }
  if (q.op === 'entre' && q.fecha1 && q.fecha2) { w.push(`${campoFecha} BETWEEN ? AND ?`); p.push(q.fecha1, q.fecha2 + ' 23:59:59'); }
  return todos(`${SELECT_DOC} WHERE ${w.join(' AND ')} ORDER BY p.orden, d.codigo`, ...p);
}));

function cargarDoc(req) {
  const d = uno(`${SELECT_DOC} WHERE d.id = ? AND d.empresa_id = ?`, req.params.id, req.u.empresa_id);
  if (!d || (req.u.rol === 'consulta' && d.estado !== 'VIGENTE') ||
      (req.u.rol === 'lider_proceso' && d.estado !== 'VIGENTE' && d.responsable_id !== req.u.id && !alcance.lidera(d.proceso_id, req.u))) falla(404, 'Documento no encontrado');
  return d;
}
const puedeEditar = (d, u) => d.estado === 'ELABORACION' &&
  (esCalidad(u) || (u.rol === 'lider_proceso' && (d.responsable_id === u.id || alcance.lidera(d.proceso_id, u))));

app.get('/api/documentos/:id', r(req => {
  const d = cargarDoc(req);
  return {
    ...d,
    puede_editar: puedeEditar(d, req.u),
    transiciones: transicionesDisponibles(d, req.u).map(t => ({ id: t.id, nombre: t.nombre })),
    versiones: todos(`SELECT v.id, v.version, v.archivo_nombre, v.cambios, v.fecha, u.nombre usuario FROM documento_versiones v
      LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE documento_id = ? ORDER BY v.version DESC, v.id DESC`, d.id),
    bitacora: todos(`SELECT b.*, u.nombre usuario, t.nombre transicion FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
      LEFT JOIN transiciones t ON t.id = b.transicion_id WHERE documento_id = ? ORDER BY b.id DESC`, d.id),
    registros: todos('SELECT * FROM registros WHERE documento_id = ?', d.id),
  };
}));

app.post('/api/documentos', r(req => {
  if (!esCalidad(req.u)) falla(403, 'Solo Calidad crea documentos directamente; los demás deben radicar una solicitud');
  return { id: transaccion(() => crearDocumento(req.body, req.u)) };
}));

app.put('/api/documentos/:id', r(req => {
  const d = cargarDoc(req);
  if (!puedeEditar(d, req.u)) falla(403, 'Solo se edita en estado de Elaboración, por su responsable o por Calidad');
  const b = req.body;
  ejecutar(`UPDATE documentos SET nombre = ?, tipo_id = ?, clase_id = ?, origen = ?, descripcion = ?, responsable_id = ?,
    fecha_vencimiento = ?, modificado = ? WHERE id = ?`,
    b.nombre || d.nombre, b.tipo_id || d.tipo_id, b.clase_id || d.clase_id, b.origen || d.origen, b.descripcion ?? d.descripcion,
    b.responsable_id || d.responsable_id, b.fecha_vencimiento || null, ahora(), d.id);
  return { ok: true };
}));

app.post('/api/documentos/:id/archivo', subida.single('archivo'), r(req => {
  const d = cargarDoc(req);
  if (!req.file) falla(400, 'No llegó ningún archivo');
  if (!puedeEditar(d, req.u)) { fs.unlinkSync(req.file.path); falla(403, 'Solo se adjuntan archivos en estado de Elaboración'); }
  ejecutar(`INSERT INTO documento_versiones (documento_id, version, archivo, archivo_nombre, cambios, usuario_id, fecha)
    VALUES (?,?,?,?,?,?,?)`, d.id, d.version, req.file.filename, req.file.originalname, req.body.cambios || null, req.u.id, ahora());
  ejecutar('UPDATE documentos SET modificado = ? WHERE id = ?', ahora(), d.id);
  return { ok: true };
}));

app.get('/api/documentos/:id/versiones/:vid', (req, res) => {
  try {
    const d = cargarDoc(req);
    const v = uno('SELECT * FROM documento_versiones WHERE id = ? AND documento_id = ?', req.params.vid, d.id);
    if (!v) return res.status(404).json({ error: 'Archivo no encontrado' });
    res.download(path.join(DIR_ARCHIVOS, v.archivo), v.archivo_nombre);
  } catch (e) { res.status(e.estado || 500).json({ error: e.message }); }
});

app.post('/api/documentos/:id/transicion', r(req => {
  const d = cargarDoc(req);
  transaccion(() => aplicarTransicion(d, req.body.transicion, req.u, req.body.comentario));
  return { ok: true };
}));

// ---------- Solicitudes ----------
const SELECT_SOL = `SELECT s.*, u.nombre solicitante, r.nombre revisor, p.nombre proceso, c.nombre clase, t.nombre tipo,
    d.codigo documento_codigo FROM solicitudes s
  LEFT JOIN usuarios u ON u.id = s.solicitante_id LEFT JOIN usuarios r ON r.id = s.revisor_id
  LEFT JOIN procesos p ON p.id = s.proceso_id LEFT JOIN clases_documento c ON c.id = s.clase_id
  LEFT JOIN tipos_documento t ON t.id = s.tipo_id LEFT JOIN documentos d ON d.id = s.documento_id`;

app.get('/api/solicitudes', r(req => {
  const u = req.u;
  const propias = 's.solicitante_id = ?';
  if (req.query.vista === 'pendientes') // las que debo resolver yo
    return esCalidad(u) ? todos(`${SELECT_SOL} WHERE s.empresa_id = ? AND s.estado = 'Pendiente' ORDER BY s.id`, u.empresa_id) : [];
  if (req.query.vista === 'tramite')
    return todos(`${SELECT_SOL} WHERE ${propias} AND s.estado = 'Pendiente' ORDER BY s.id DESC`, u.id);
  return todos(`${SELECT_SOL} WHERE ${esCalidad(u) ? 's.empresa_id = ?' : propias} AND s.estado != 'Pendiente' ORDER BY s.id DESC`,
    esCalidad(u) ? u.empresa_id : u.id);
}));

app.post('/api/solicitudes', r(req => {
  const b = req.body, u = req.u;
  if (u.rol === 'consulta') falla(403, 'Los usuarios de consulta no radican solicitudes');
  if (!['Creación', 'Modificación', 'Eliminación'].includes(b.tipo_solicitud)) falla(400, 'Tipo de solicitud inválido');
  if (!String(b.justificacion || '').trim()) falla(400, 'La justificación es obligatoria');
  let datos = b;
  if (b.tipo_solicitud !== 'Creación') {
    const d = uno('SELECT * FROM documentos WHERE id = ? AND empresa_id = ?', b.documento_id, u.empresa_id);
    if (!d || d.estado !== 'VIGENTE') falla(400, 'Solo se puede pedir modificar o eliminar un documento vigente');
    datos = { ...d, documento_id: d.id };
  } else if (!String(b.nombre || '').trim() || !b.proceso_id || !b.clase_id || !b.tipo_id) {
    falla(400, 'Tipo, proceso, clase y nombre son obligatorios');
  }
  const id = ejecutar(`INSERT INTO solicitudes (empresa_id, tipo_solicitud, documento_id, tipo_id, clase_id, proceso_id, nombre,
      justificacion, descripcion, solicitante_id, creada) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    u.empresa_id, b.tipo_solicitud, datos.documento_id || null, datos.tipo_id, datos.clase_id, datos.proceso_id, datos.nombre,
    b.justificacion.trim(), b.descripcion || null, u.id, ahora()).lastInsertRowid;
  return { id: Number(id) };
}));

app.post('/api/solicitudes/:id/resolver', r(req => {
  const u = req.u;
  if (!esCalidad(u)) falla(403, 'Solo Calidad resuelve solicitudes');
  const s = uno("SELECT * FROM solicitudes WHERE id = ? AND empresa_id = ? AND estado = 'Pendiente'", req.params.id, u.empresa_id);
  if (!s) falla(404, 'Solicitud no encontrada o ya resuelta');
  const aprobar = !!req.body.aprobar;
  if (!aprobar && !String(req.body.respuesta || '').trim()) falla(400, 'Explica por qué se rechaza');
  return transaccion(() => {
    let documentoId = s.documento_id;
    if (aprobar) {
      const solicitante = uno('SELECT * FROM usuarios WHERE id = ?', s.solicitante_id);
      if (s.tipo_solicitud === 'Creación')
        documentoId = crearDocumento({ ...s, responsable_id: s.solicitante_id }, u);
      else {
        const d = uno('SELECT * FROM documentos WHERE id = ?', s.documento_id);
        const comentario = `Solicitud #${s.id}: ${s.justificacion}`;
        aplicarTransicion(d, s.tipo_solicitud === 'Modificación' ? 'modificar' : 'eliminar', u, comentario);
        if (s.tipo_solicitud === 'Modificación') ejecutar('UPDATE documentos SET responsable_id = ? WHERE id = ?', solicitante.id, d.id);
      }
    }
    ejecutar(`UPDATE solicitudes SET estado = ?, revisor_id = ?, respuesta = ?, resuelta = ?, documento_id = ? WHERE id = ?`,
      aprobar ? 'Aprobada' : 'Rechazada', u.id, req.body.respuesta || null, ahora(), documentoId, s.id);
    return { ok: true, documento_id: documentoId };
  });
}));

// ---------- Mis pendientes ----------
app.get('/api/pendientes', r(req => {
  const docs = todos(`${SELECT_DOC} WHERE d.empresa_id = ? AND d.estado IN ('ELABORACION','REVISION','PUBLICACION')`, req.u.empresa_id)
    .map(d => ({ ...d, transiciones: transicionesDisponibles(d, req.u).filter(t => t.id !== 'eliminar').map(t => t.nombre) }))
    .filter(d => d.transiciones.length);
  const solicitudes = esCalidad(req.u) ? uno("SELECT COUNT(*) n FROM solicitudes WHERE empresa_id = ? AND estado = 'Pendiente'", req.u.empresa_id).n : 0;
  const fv = alcance.filtro(req.u, 'd.proceso_id');
  const porVencer = todos(`${SELECT_DOC} WHERE d.empresa_id = ? AND d.estado = 'VIGENTE' AND d.fecha_vencimiento IS NOT NULL
    AND d.fecha_vencimiento <= date('now', '+30 days')${fv.sql} ORDER BY d.fecha_vencimiento`, req.u.empresa_id, ...fv.params);
  return { documentos: docs, solicitudes, por_vencer: porVencer };
}));

// ---------- Estadísticas ----------
app.get('/api/estadisticas', r(req => {
  const q = req.query, w = ['d.empresa_id = ?'], p = [req.u.empresa_id];
  const lista = v => [].concat(v || []).filter(Boolean);
  for (const [col, v] of [['d.tipo_id', q.tipo], ['b.transicion_id', q.transicion], ['b.estado_inicial', q.estado_inicial], ['b.estado_final', q.estado_final], ['b.usuario_id', q.usuario]]) {
    const l = lista(v); if (l.length) { w.push(`${col} IN (${l.map(() => '?').join(',')})`); p.push(...l); }
  }
  if (q.texto) { w.push('(d.codigo LIKE ? OR d.nombre LIKE ?)'); p.push(`%${q.texto}%`, `%${q.texto}%`); }
  const fe = alcance.filtro(req.u, 'd.proceso_id');
  return {
    por_estado: todos(`SELECT e.nombre, e.id, COUNT(d.id) n FROM estados e LEFT JOIN documentos d ON d.estado = e.id AND d.empresa_id = ?${fe.sql}
      GROUP BY e.id ORDER BY e.orden`, req.u.empresa_id, ...fe.params),
    por_proceso: todos(`SELECT p.nombre, p.categoria, COUNT(d.id) n FROM procesos p LEFT JOIN documentos d ON d.proceso_id = p.id
      AND d.estado = 'VIGENTE' WHERE p.empresa_id = ? GROUP BY p.id ORDER BY p.orden`, req.u.empresa_id),
    transiciones: todos(`SELECT b.*, d.codigo, d.nombre, t.nombre tipo, u.nombre usuario, tr.nombre transicion,
        ei.nombre estado_inicial_nombre, ef.nombre estado_final_nombre
      FROM bitacora b JOIN documentos d ON d.id = b.documento_id JOIN tipos_documento t ON t.id = d.tipo_id
      LEFT JOIN usuarios u ON u.id = b.usuario_id LEFT JOIN transiciones tr ON tr.id = b.transicion_id
      LEFT JOIN estados ei ON ei.id = b.estado_inicial LEFT JOIN estados ef ON ef.id = b.estado_final
      WHERE ${w.join(' AND ')}${fe.sql} ORDER BY b.id DESC LIMIT 500`, ...p, ...fe.params),
  };
}));

// ---------- Listado maestro de registros ----------
const CAMPOS_REG = ['nombre', 'documento_id', 'proceso_id', 'responsable_cargo', 'responsable_area', 'medio', 'ubicacion',
  'tiempo_retencion', 'disposicion_final', 'recuperacion'];
app.get('/api/registros', r(req => {
  const w = ['r.empresa_id = ?'], p = [req.u.empresa_id];
  if (req.query.texto) { w.push('r.nombre LIKE ?'); p.push(`%${req.query.texto}%`); }
  const procs = [].concat(req.query.proceso || []).filter(Boolean);
  if (procs.length) { w.push(`r.proceso_id IN (${procs.map(() => '?').join(',')})`); p.push(...procs); }
  return todos(`SELECT r.*, p.nombre proceso, d.codigo documento_codigo FROM registros r
    LEFT JOIN procesos p ON p.id = r.proceso_id LEFT JOIN documentos d ON d.id = r.documento_id
    WHERE ${w.join(' AND ')} ORDER BY p.orden, r.nombre`, ...p);
}));
function guardarRegistro(req, id) {
  if (!esCalidad(req.u)) falla(403, 'Solo Calidad administra el listado de registros');
  if (!String(req.body.nombre || '').trim()) falla(400, 'El nombre es obligatorio');
  const vals = CAMPOS_REG.map(c => req.body[c] || null);
  if (id) ejecutar(`UPDATE registros SET ${CAMPOS_REG.map(c => c + ' = ?').join(', ')} WHERE id = ? AND empresa_id = ?`, ...vals, id, req.u.empresa_id);
  else id = Number(ejecutar(`INSERT INTO registros (empresa_id, ${CAMPOS_REG.join(', ')}) VALUES (?${', ?'.repeat(CAMPOS_REG.length)})`,
    req.u.empresa_id, ...vals).lastInsertRowid);
  return { id };
}
app.post('/api/registros', r(req => guardarRegistro(req)));
app.put('/api/registros/:id', r(req => guardarRegistro(req, req.params.id)));
app.delete('/api/registros/:id', r(req => {
  if (!esCalidad(req.u)) falla(403, 'Solo Calidad administra el listado de registros');
  ejecutar('DELETE FROM registros WHERE id = ? AND empresa_id = ?', req.params.id, req.u.empresa_id);
  return { ok: true };
}));

require('./indicadores')(app, { alcance, uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora });
require('./riesgos')(app, { alcance, uno, todos, ejecutar, r, falla, esCalidad, ahora });
require('./auditorias')(app, { alcance, uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora });
require('./admin')(app, { alcance, uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora });
require('./glosario')(app, { alcance, uno, todos, ejecutar, r, falla, esCalidad, ahora });
require('./procesos')(app, { alcance, uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora });
require('./mecanismos')(app, { alcance, uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora, subida, DIR_ARCHIVOS });
require('./calendario')(app, { alcance, todos, falla, r });
require('./cargos')(app, { uno, todos, ejecutar, r, falla, transaccion });

const PUERTO = process.env.PORT || 3100;
const servidor = app.listen(PUERTO, process.env.HOST, () => console.log(`SGI listo en http://localhost:${PUERTO}`));

// Mantenimiento: limpia sesiones vencidas y programa el respaldo diario
const limpiarSesiones = () => ejecutar("DELETE FROM sesiones WHERE creada < datetime('now', ?)", `-${SESION_SEGUNDOS} seconds`);
limpiarSesiones(); setInterval(limpiarSesiones, 60 * 60 * 1000).unref();
require('./backup').programar();

// Apagado ordenado (docker stop / Ctrl+C): termina las peticiones y cierra la base
function cerrar() {
  servidor.close(() => { try { db.close(); } catch { /* ya cerrada */ } process.exit(0); });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
