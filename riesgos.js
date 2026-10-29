// Módulo de riesgos y controles: matriz 5×5, riesgo inherente (absoluto) y residual según los controles.
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS riesgos (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, proceso_id INTEGER REFERENCES procesos(id),
  tipo TEXT NOT NULL, nombre TEXT NOT NULL, descripcion TEXT, causas TEXT, consecuencias TEXT,
  probabilidad INTEGER NOT NULL CHECK (probabilidad BETWEEN 1 AND 5), impacto INTEGER NOT NULL CHECK (impacto BETWEEN 1 AND 5),
  tratamiento TEXT DEFAULT 'Reducir' CHECK (tratamiento IN ('Aceptar','Reducir','Evitar','Compartir')),
  responsable_id INTEGER REFERENCES usuarios(id), activo INTEGER DEFAULT 1,
  creado TEXT DEFAULT CURRENT_TIMESTAMP, modificado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS controles (
  id INTEGER PRIMARY KEY, riesgo_id INTEGER REFERENCES riesgos(id) ON DELETE CASCADE, codigo TEXT,
  descripcion TEXT NOT NULL, clasificacion TEXT NOT NULL CHECK (clasificacion IN ('Preventivo','Detectivo','Correctivo')),
  mitiga_probabilidad INTEGER DEFAULT 0, mitiga_impacto INTEGER DEFAULT 0,
  efectividad TEXT NOT NULL DEFAULT 'Moderado' CHECK (efectividad IN ('Fuerte','Moderado','Débil')),
  frecuencia TEXT, documentado INTEGER DEFAULT 0, evidencia TEXT,
  responsable_gestion_id INTEGER REFERENCES usuarios(id), responsable_revision_id INTEGER REFERENCES usuarios(id));
CREATE TABLE IF NOT EXISTS monitoreos (
  id INTEGER PRIMARY KEY, control_id INTEGER REFERENCES controles(id) ON DELETE CASCADE, periodo TEXT NOT NULL,
  ejecutado INTEGER NOT NULL, observacion TEXT, usuario_id INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (control_id, periodo));
`);
// Los planes de acción también pueden colgar de un riesgo
if (!db.prepare('PRAGMA table_info(planes_accion)').all().some(c => c.name === 'riesgo_id'))
  db.exec('ALTER TABLE planes_accion ADD COLUMN riesgo_id INTEGER REFERENCES riesgos(id) ON DELETE CASCADE');

const TIPOS = ['Calidad', 'Ambiental', 'Estratégicos', 'Operacionales', 'Seguridad y Salud en el Trabajo', 'Comerciales',
  'Compras y proveedores', 'Legales', 'Información y tecnología', 'Financieros y continuidad'];
const PROBABILIDAD = ['Rara vez', 'Improbable', 'Posible', 'Probable', 'Casi seguro'];
const IMPACTO = ['Insignificante', 'Menor', 'Moderado', 'Mayor', 'Catastrófico'];
const DESPLAZA = { Fuerte: 2, Moderado: 1, 'Débil': 0 }; // casillas que baja un control según su efectividad

function zona(p, i) {
  const s = p * i;
  return s >= 15 ? 'Extrema' : s >= 10 ? 'Alta' : s >= 5 ? 'Moderada' : 'Baja';
}
// Residual: cada control baja la probabilidad y/o el impacto según su efectividad (mínimo 1)
function residual(riesgo, controles) {
  let p = riesgo.probabilidad, i = riesgo.impacto;
  for (const c of controles) {
    const n = DESPLAZA[c.efectividad] || 0;
    if (c.mitiga_probabilidad) p -= n;
    if (c.mitiga_impacto) i -= n;
  }
  p = Math.max(1, p); i = Math.max(1, i);
  return { probabilidad_residual: p, impacto_residual: i, zona_residual: zona(p, i), puntaje_residual: p * i };
}

function sembrar() {
  if (require('./db').PRODUCCION) return; // los riesgos de ejemplo solo en desarrollo
  if (db.prepare('SELECT COUNT(*) n FROM riesgos').get().n) return;
  const pid = s => db.prepare('SELECT id FROM procesos WHERE sigla = ?').get(s).id;
  const uid = u => db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(u).id;
  const insR = db.prepare(`INSERT INTO riesgos (empresa_id, codigo, proceso_id, tipo, nombre, causas, consecuencias, probabilidad, impacto,
    responsable_id) VALUES (1,?,?,?,?,?,?,?,?,?)`);
  const insC = db.prepare(`INSERT INTO controles (riesgo_id, codigo, descripcion, clasificacion, mitiga_probabilidad, mitiga_impacto,
    efectividad, frecuencia, documentado, responsable_gestion_id, responsable_revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  // Ejemplos para ver la matriz funcionando; reemplázalos por la matriz ES-GER-MAT-05 real
  const r1 = insR.run('R-PRO-01', pid('PRO'), 'Calidad', '(Ejemplo) Producto no conforme por fallas en soldadura',
    'Equipos sin mantenimiento; operarios sin entrenamiento', 'Reprocesos, devoluciones y quejas', 4, 4, uid('lider')).lastInsertRowid;
  insC.run(r1, 'C-PRO-01', 'Inspección de soldadura en cada lote', 'Detectivo', 1, 0, 'Fuerte', 'Por lote', 1, uid('lider'), uid('gestor'));
  insC.run(r1, 'C-PRO-02', 'Plan de mantenimiento preventivo de soldadoras', 'Preventivo', 1, 0, 'Moderado', 'Mensual', 1, uid('lider'), uid('gestor'));
  const r2 = insR.run('R-ALM-01', pid('ALM'), 'Compras y proveedores', '(Ejemplo) Desabastecimiento de lámina de acero',
    'Dependencia de un solo proveedor', 'Paradas de producción', 3, 5, uid('gestor')).lastInsertRowid;
  insC.run(r2, 'C-ALM-01', 'Stock mínimo de seguridad', 'Preventivo', 0, 1, 'Moderado', 'Semanal', 0, uid('gestor'), uid('gestor'));
  insR.run('R-GTH-01', pid('GTH'), 'Seguridad y Salud en el Trabajo', '(Ejemplo) Quemaduras en el área de corte',
    'Falta de EPP', 'Incapacidades y sanciones', 3, 4, uid('gestor'));
}
sembrar();

module.exports = function (app, { alcance, uno, todos, ejecutar, r, falla, esCalidad, ahora }) {
  const SELECT_R = `SELECT r.*, p.nombre proceso, p.sigla proceso_sigla, p.orden proceso_orden, u.nombre responsable FROM riesgos r
    JOIN procesos p ON p.id = r.proceso_id LEFT JOIN usuarios u ON u.id = r.responsable_id`;
  const valorar = rg => {
    const controles = todos('SELECT * FROM controles WHERE riesgo_id = ?', rg.id);
    return { ...rg, zona: zona(rg.probabilidad, rg.impacto), puntaje: rg.probabilidad * rg.impacto,
      total_controles: controles.length, ...residual(rg, controles) };
  };
  // Calidad administra todo; el líder de proceso, los riesgos de su proceso
  const puedeEditar = (rg, u) => esCalidad(u) || alcance.lidera(rg.proceso_id, u);
  const lista = v => [].concat(v || []).filter(Boolean);

  app.get('/api/riesgos/catalogos', r(() => ({ tipos: TIPOS, probabilidad: PROBABILIDAD, impacto: IMPACTO,
    zonas: ['Baja', 'Moderada', 'Alta', 'Extrema'] })));

  app.get('/api/riesgos', r(req => {
    const q = req.query, w = ['r.empresa_id = ?', 'r.activo = 1'], p = [req.u.empresa_id];
    const procs = lista(q.proceso), tipos = lista(q.tipo);
    if (procs.length) { w.push(`r.proceso_id IN (${procs.map(() => '?').join(',')})`); p.push(...procs); }
    if (tipos.length) { w.push(`r.tipo IN (${tipos.map(() => '?').join(',')})`); p.push(...tipos); }
    if (q.texto) { w.push('(r.nombre LIKE ? OR r.codigo LIKE ?)'); p.push(`%${q.texto}%`, `%${q.texto}%`); }
    const fr = alcance.filtro(req.u, 'r.proceso_id'); // el líder de proceso solo ve los riesgos de su proceso
    let out = todos(`${SELECT_R} WHERE ${w.join(' AND ')}${fr.sql} ORDER BY p.orden, r.codigo`, ...p, ...fr.params).map(valorar);
    const zonas = lista(q.zona);
    if (zonas.length) out = out.filter(x => zonas.includes(q.matriz === 'residual' ? x.zona_residual : x.zona));
    return out.map(x => ({ ...x, puede_editar: puedeEditar(x, req.u) }));
  }));

  app.get('/api/riesgos/:id', r(req => {
    const rg = uno(`${SELECT_R} WHERE r.id = ? AND r.empresa_id = ?`, req.params.id, req.u.empresa_id);
    if (!rg || !alcance.ve(rg.proceso_id, req.u)) falla(404, 'Riesgo no encontrado');
    const mes = new Date().toISOString().slice(0, 7);
    return {
      ...valorar(rg), puede_editar: puedeEditar(rg, req.u),
      controles: todos(`SELECT c.*, g.nombre responsable_gestion, v.nombre responsable_revision,
          (SELECT ejecutado FROM monitoreos m WHERE m.control_id = c.id AND m.periodo = ?) ejecutado_mes
        FROM controles c LEFT JOIN usuarios g ON g.id = c.responsable_gestion_id LEFT JOIN usuarios v ON v.id = c.responsable_revision_id
        WHERE c.riesgo_id = ? ORDER BY c.codigo`, mes, rg.id),
      monitoreos: todos(`SELECT m.*, c.codigo control, u.nombre usuario FROM monitoreos m JOIN controles c ON c.id = m.control_id
        LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE c.riesgo_id = ? ORDER BY m.periodo DESC, c.codigo LIMIT 60`, rg.id),
      planes: todos(`SELECT a.*, u.nombre responsable FROM planes_accion a LEFT JOIN usuarios u ON u.id = a.responsable_id
        WHERE a.riesgo_id = ? ORDER BY a.id DESC`, rg.id),
    };
  }));

  const CAMPOS_R = ['proceso_id', 'tipo', 'nombre', 'descripcion', 'causas', 'consecuencias', 'probabilidad', 'impacto', 'tratamiento', 'responsable_id'];
  function guardarRiesgo(req, id) {
    const b = req.body;
    let actual = null;
    if (id) {
      actual = uno('SELECT * FROM riesgos WHERE id = ? AND empresa_id = ?', id, req.u.empresa_id);
      if (!actual) falla(404, 'Riesgo no encontrado');
      if (!puedeEditar(actual, req.u)) falla(403, 'Solo Calidad o el líder del proceso editan este riesgo');
    }
    if (!puedeEditar(b, req.u)) falla(403, 'Solo puedes registrar riesgos de tu proceso');
    if (!String(b.nombre || '').trim() || !b.proceso_id) falla(400, 'Nombre y proceso son obligatorios');
    if (!TIPOS.includes(b.tipo)) falla(400, 'Tipo de riesgo inválido');
    for (const c of ['probabilidad', 'impacto']) if (!(Number(b[c]) >= 1 && Number(b[c]) <= 5)) falla(400, `La ${c} va de 1 a 5`);
    const vals = CAMPOS_R.map(c => b[c]);
    if (id) {
      ejecutar(`UPDATE riesgos SET ${CAMPOS_R.map(c => c + ' = ?').join(', ')}, modificado = ? WHERE id = ?`, ...vals, ahora(), id);
      return { id: Number(id) };
    }
    const sigla = uno('SELECT sigla FROM procesos WHERE id = ?', b.proceso_id).sigla;
    const codigo = `R-${sigla}-` + String(uno('SELECT COUNT(*) n FROM riesgos WHERE codigo LIKE ?', `R-${sigla}-%`).n + 1).padStart(2, '0');
    return { id: Number(ejecutar(`INSERT INTO riesgos (empresa_id, codigo, ${CAMPOS_R.join(', ')}) VALUES (?, ?${', ?'.repeat(CAMPOS_R.length)})`,
      req.u.empresa_id, codigo, ...vals).lastInsertRowid) };
  }
  app.post('/api/riesgos', r(req => guardarRiesgo(req)));
  app.put('/api/riesgos/:id', r(req => guardarRiesgo(req, req.params.id)));
  app.delete('/api/riesgos/:id', r(req => {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad retira riesgos de la matriz');
    ejecutar('UPDATE riesgos SET activo = 0, modificado = ? WHERE id = ? AND empresa_id = ?', ahora(), req.params.id, req.u.empresa_id);
    return { ok: true };
  }));

  // ---------- Controles ----------
  app.get('/api/controles', r(req => {
    const q = req.query, w = ['r.empresa_id = ?', 'r.activo = 1'], p = [req.u.empresa_id];
    const procs = lista(q.proceso), clases = lista(q.clasificacion);
    if (procs.length) { w.push(`r.proceso_id IN (${procs.map(() => '?').join(',')})`); p.push(...procs); }
    if (clases.length) { w.push(`c.clasificacion IN (${clases.map(() => '?').join(',')})`); p.push(...clases); }
    if (q.texto) { w.push('(c.descripcion LIKE ? OR c.codigo LIKE ? OR r.nombre LIKE ?)'); p.push(...Array(3).fill(`%${q.texto}%`)); }
    if (q.responsable) { w.push(`c.${q.rol === 'revision' ? 'responsable_revision_id' : 'responsable_gestion_id'} = ?`); p.push(q.responsable); }
    const fc = alcance.filtro(req.u, 'r.proceso_id');
    return todos(`SELECT c.*, r.codigo riesgo_codigo, r.nombre riesgo, r.id riesgo_id, pr.nombre proceso,
        g.nombre responsable_gestion, v.nombre responsable_revision FROM controles c
      JOIN riesgos r ON r.id = c.riesgo_id JOIN procesos pr ON pr.id = r.proceso_id
      LEFT JOIN usuarios g ON g.id = c.responsable_gestion_id LEFT JOIN usuarios v ON v.id = c.responsable_revision_id
      WHERE ${w.join(' AND ')}${fc.sql} ORDER BY pr.orden, r.codigo, c.codigo`, ...p, ...fc.params);
  }));

  const CAMPOS_C = ['descripcion', 'clasificacion', 'mitiga_probabilidad', 'mitiga_impacto', 'efectividad', 'frecuencia', 'documentado',
    'evidencia', 'responsable_gestion_id', 'responsable_revision_id'];
  function guardarControl(req, id) {
    const b = { ...req.body };
    let riesgoId = b.riesgo_id;
    if (id) {
      const c = uno('SELECT * FROM controles WHERE id = ?', id);
      if (!c) falla(404, 'Control no encontrado');
      riesgoId = c.riesgo_id;
    }
    const rg = uno('SELECT * FROM riesgos WHERE id = ? AND empresa_id = ?', riesgoId, req.u.empresa_id);
    if (!rg) falla(404, 'Riesgo no encontrado');
    if (!puedeEditar(rg, req.u)) falla(403, 'Solo Calidad o el líder del proceso administran estos controles');
    if (!String(b.descripcion || '').trim()) falla(400, 'Describe el control');
    for (const k of ['mitiga_probabilidad', 'mitiga_impacto', 'documentado']) b[k] = b[k] === true || b[k] === 1 || b[k] === '1' ? 1 : 0;
    if (!b.mitiga_probabilidad && !b.mitiga_impacto) falla(400, 'El control debe mitigar la probabilidad, el impacto o ambos');
    const vals = CAMPOS_C.map(c => b[c]);
    if (id) {
      ejecutar(`UPDATE controles SET ${CAMPOS_C.map(c => c + ' = ?').join(', ')} WHERE id = ?`, ...vals, id);
    } else {
      const sigla = uno('SELECT sigla FROM procesos WHERE id = ?', rg.proceso_id).sigla;
      const codigo = `C-${sigla}-` + String(uno(`SELECT COUNT(*) n FROM controles WHERE codigo LIKE ?`, `C-${sigla}-%`).n + 1).padStart(2, '0');
      id = Number(ejecutar(`INSERT INTO controles (riesgo_id, codigo, ${CAMPOS_C.join(', ')}) VALUES (?, ?${', ?'.repeat(CAMPOS_C.length)})`,
        rg.id, codigo, ...vals).lastInsertRowid);
    }
    ejecutar('UPDATE riesgos SET modificado = ? WHERE id = ?', ahora(), rg.id);
    return { id: Number(id) };
  }
  app.post('/api/controles', r(req => guardarControl(req)));
  app.put('/api/controles/:id', r(req => guardarControl(req, req.params.id)));
  app.delete('/api/controles/:id', r(req => {
    const c = uno(`SELECT c.*, r.proceso_id FROM controles c JOIN riesgos r ON r.id = c.riesgo_id WHERE c.id = ? AND r.empresa_id = ?`,
      req.params.id, req.u.empresa_id);
    if (!c) falla(404, 'Control no encontrado');
    if (!puedeEditar(c, req.u)) falla(403, 'Solo Calidad o el líder del proceso eliminan este control');
    ejecutar('DELETE FROM controles WHERE id = ?', c.id);
    return { ok: true };
  }));

  // Monitoreo: el responsable de gestión reporta si ejecutó el control en el mes
  app.post('/api/controles/:id/monitoreo', r(req => {
    const c = uno(`SELECT c.*, r.proceso_id FROM controles c JOIN riesgos r ON r.id = c.riesgo_id WHERE c.id = ? AND r.empresa_id = ?`,
      req.params.id, req.u.empresa_id);
    if (!c) falla(404, 'Control no encontrado');
    if (!esCalidad(req.u) && c.responsable_gestion_id !== req.u.id && !puedeEditar(c, req.u))
      falla(403, 'Solo el responsable del control, el líder del proceso o Calidad reportan su ejecución');
    const periodo = String(req.body.periodo || new Date().toISOString().slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) falla(400, 'Periodo inválido (AAAA-MM)');
    const ejecutado = req.body.ejecutado === true || req.body.ejecutado === '1' || req.body.ejecutado === 1 ? 1 : 0;
    if (!ejecutado && !String(req.body.observacion || '').trim()) falla(400, 'Explica por qué no se ejecutó el control');
    ejecutar(`INSERT INTO monitoreos (control_id, periodo, ejecutado, observacion, usuario_id, fecha) VALUES (?,?,?,?,?,?)
      ON CONFLICT (control_id, periodo) DO UPDATE SET ejecutado = excluded.ejecutado, observacion = excluded.observacion,
      usuario_id = excluded.usuario_id, fecha = excluded.fecha`, c.id, periodo, ejecutado, req.body.observacion || null, req.u.id, ahora());
    return { ok: true };
  }));
};

module.exports.TIPOS = TIPOS;
