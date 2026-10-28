// Glosario de términos y buscador global (busca en todos los módulos a la vez).
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS glosario (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, glosario TEXT NOT NULL DEFAULT 'General',
  termino TEXT NOT NULL, descripcion TEXT NOT NULL, fuente TEXT,
  creado TEXT DEFAULT CURRENT_TIMESTAMP, modificado TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (empresa_id, glosario, termino));
`);

// Cada fuente del buscador: qué tabla, qué columnas se comparan y a qué pantalla lleva el resultado
const FUENTES = [
  { tipo: 'Documento', ruta: 'documento', sql: `SELECT d.id, d.codigo, d.nombre titulo, p.nombre proceso, d.estado detalle FROM documentos d
      LEFT JOIN procesos p ON p.id = d.proceso_id WHERE d.empresa_id = ? AND d.estado != 'ELIMINADO' AND (d.codigo LIKE ? OR d.nombre LIKE ?)`, n: 2 },
  { tipo: 'Registro', ruta: 'registros', sql: `SELECT r.id, NULL codigo, r.nombre titulo, p.nombre proceso, r.medio detalle FROM registros r
      LEFT JOIN procesos p ON p.id = r.proceso_id WHERE r.empresa_id = ? AND (r.nombre LIKE ? OR r.ubicacion LIKE ?)`, n: 2 },
  { tipo: 'Término', ruta: 'glosario', sql: `SELECT g.id, NULL codigo, g.termino titulo, g.glosario proceso, g.descripcion detalle FROM glosario g
      WHERE g.empresa_id = ? AND (g.termino LIKE ? OR g.descripcion LIKE ?)`, n: 2 },
  { tipo: 'Riesgo', ruta: 'riesgo', sql: `SELECT r.id, r.codigo, r.nombre titulo, p.nombre proceso, r.tipo detalle FROM riesgos r
      LEFT JOIN procesos p ON p.id = r.proceso_id WHERE r.empresa_id = ? AND r.activo = 1 AND (r.codigo LIKE ? OR r.nombre LIKE ? OR r.descripcion LIKE ?)`, n: 3 },
  { tipo: 'Control', ruta: 'riesgo', sql: `SELECT r.id, c.codigo, c.descripcion titulo, p.nombre proceso, c.clasificacion detalle FROM controles c
      JOIN riesgos r ON r.id = c.riesgo_id LEFT JOIN procesos p ON p.id = r.proceso_id
      WHERE r.empresa_id = ? AND (c.codigo LIKE ? OR c.descripcion LIKE ?)`, n: 2 },
  { tipo: 'Indicador', ruta: 'indicador', sql: `SELECT i.id, i.codigo, i.nombre titulo, p.nombre proceso, i.frecuencia detalle FROM indicadores i
      LEFT JOIN procesos p ON p.id = i.proceso_id WHERE i.empresa_id = ? AND (i.codigo LIKE ? OR i.nombre LIKE ? OR i.proposito LIKE ?)`, n: 3 },
  { tipo: 'Evaluación', ruta: 'auditoria', sql: `SELECT e.id, e.codigo, e.nombre titulo, NULL proceso, e.estado detalle FROM evaluaciones e
      WHERE e.empresa_id = ? AND (e.codigo LIKE ? OR e.nombre LIKE ? OR e.objetivo LIKE ?)`, n: 3 },
  { tipo: 'Acción de mejora', ruta: 'accion', sql: `SELECT a.id, a.codigo, COALESCE(a.correccion, a.causa_raiz, a.tipo) titulo, NULL proceso, a.estado detalle
      FROM acciones a WHERE a.empresa_id = ? AND (a.codigo LIKE ? OR a.correccion LIKE ? OR a.causa_raiz LIKE ?)`, n: 3 },
];

// Restricción de cada tipo para quien lidera un proceso (ids = sus procesos). Los documentos vigentes, registros y términos son de todos.
const marcas = ids => ids.map(() => '?').join(',');
const RESTRICCION = {
  Documento: (ids, u) => ({ sql: ` AND (d.estado = 'VIGENTE' OR d.responsable_id = ?${ids.length ? ` OR d.proceso_id IN (${marcas(ids)})` : ''})`, params: [u.id, ...ids] }),
  Riesgo: ids => ({ sql: ` AND r.proceso_id IN (${marcas(ids.length ? ids : [-1])})`, params: ids.length ? ids : [-1] }),
  Control: ids => ({ sql: ` AND r.proceso_id IN (${marcas(ids.length ? ids : [-1])})`, params: ids.length ? ids : [-1] }),
  Indicador: ids => ({ sql: ` AND i.proceso_id IN (${marcas(ids.length ? ids : [-1])})`, params: ids.length ? ids : [-1] }),
  'Evaluación': (ids, u) => ({ sql: ` AND (e.auditor_id = ?${ids.length ? ` OR e.id IN (SELECT evaluacion_id FROM evaluacion_procesos WHERE proceso_id IN (${marcas(ids)}))` : ''})`, params: [u.id, ...ids] }),
  'Acción de mejora': (ids, u) => ({ sql: ` AND (a.responsable_id = ?${ids.length ? ` OR a.hallazgo_id IN (SELECT id FROM hallazgos WHERE proceso_id IN (${marcas(ids)}))` : ''})`, params: [u.id, ...ids] }),
};

// Se busca sin distinguir tildes ni mayúsculas: "accion" encuentra "Acción"
const sinTildes = v => v == null ? null : String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
db.function('sin_tildes', { deterministic: true }, sinTildes);
for (const f of FUENTES) f.sql = f.sql.replace(/([\w.]+) LIKE \?/g, 'sin_tildes($1) LIKE ?');

module.exports = function (app, { alcance, uno, todos, ejecutar, r, falla, esCalidad, ahora }) {
  // ---------- Glosario ----------
  app.get('/api/glosario', r(req => {
    const w = ['empresa_id = ?'], p = [req.u.empresa_id];
    if (req.query.glosario) { w.push('glosario = ?'); p.push(req.query.glosario); }
    if (req.query.texto) { const t = `%${sinTildes(req.query.texto)}%`; w.push('(sin_tildes(termino) LIKE ? OR sin_tildes(descripcion) LIKE ?)'); p.push(t, t); }
    if (req.query.letra) { w.push('termino LIKE ?'); p.push(`${req.query.letra}%`); }
    return {
      terminos: todos(`SELECT * FROM glosario WHERE ${w.join(' AND ')} ORDER BY termino COLLATE NOCASE`, ...p),
      glosarios: todos('SELECT DISTINCT glosario FROM glosario WHERE empresa_id = ? ORDER BY glosario', req.u.empresa_id).map(g => g.glosario),
    };
  }));
  function guardarTermino(req, id) {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad administra el glosario');
    const b = req.body, termino = String(b.termino || '').trim(), descripcion = String(b.descripcion || '').trim();
    if (!termino || !descripcion) falla(400, 'El término y la descripción son obligatorios');
    const glosario = String(b.glosario || '').trim() || 'General';
    const repetido = uno('SELECT id FROM glosario WHERE empresa_id = ? AND glosario = ? AND termino = ? COLLATE NOCASE AND id != ?',
      req.u.empresa_id, glosario, termino, id || 0);
    if (repetido) falla(400, `"${termino}" ya está en el glosario ${glosario}`);
    if (id) ejecutar('UPDATE glosario SET glosario = ?, termino = ?, descripcion = ?, fuente = ?, modificado = ? WHERE id = ? AND empresa_id = ?',
      glosario, termino, descripcion, b.fuente || null, ahora(), id, req.u.empresa_id);
    else id = Number(ejecutar('INSERT INTO glosario (empresa_id, glosario, termino, descripcion, fuente) VALUES (?, ?, ?, ?, ?)',
      req.u.empresa_id, glosario, termino, descripcion, b.fuente || null).lastInsertRowid);
    return { id };
  }
  app.post('/api/glosario', r(req => guardarTermino(req)));
  app.put('/api/glosario/:id', r(req => guardarTermino(req, Number(req.params.id))));
  app.delete('/api/glosario/:id', r(req => {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad administra el glosario');
    ejecutar('DELETE FROM glosario WHERE id = ? AND empresa_id = ?', req.params.id, req.u.empresa_id);
    return { ok: true };
  }));

  // ---------- Buscador global ----------
  app.get('/api/buscar', r(req => {
    const texto = String(req.query.q || '').trim();
    if (texto.length < 2) falla(400, 'Escribe al menos 2 caracteres');
    const tipos = [].concat(req.query.tipo || []).filter(Boolean);
    const like = `%${sinTildes(texto)}%`;
    const resultados = [], ids = alcance.propios(req.u);
    for (const f of FUENTES) {
      if (tipos.length && !tipos.includes(f.tipo)) continue;
      const rs = ids !== null && RESTRICCION[f.tipo] ? RESTRICCION[f.tipo](ids, req.u) : { sql: '', params: [] };
      for (const fila of todos(f.sql + rs.sql + ' LIMIT 50', req.u.empresa_id, ...Array(f.n).fill(like), ...rs.params))
        resultados.push({ ...fila, tipo: f.tipo, ruta: f.ruta });
    }
    return { texto, tipos: FUENTES.map(f => f.tipo), resultados };
  }));
};
module.exports.FUENTES = FUENTES;
