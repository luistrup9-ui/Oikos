// Ficha de caracterización de procesos y subprocesos, como en Almera: código, versión, secciones
// configurables (objetivo, dueño, alcance, recursos…), entradas y salidas con ciclo PHVA,
// documentación relacionada e historial de versiones.
const { db } = require('./db');

// Columnas nuevas de la tabla procesos (la tabla original solo tenía nombre, sigla, categoría y orden)
for (const [col, def] of [['padre_id', 'INTEGER REFERENCES procesos(id)'], ['tipo', "TEXT NOT NULL DEFAULT 'Proceso'"], ['codigo', 'TEXT'],
  ['version', 'INTEGER NOT NULL DEFAULT 1'], ['fecha', 'TEXT'], ['almera_id', 'INTEGER'], ['modificado', 'TEXT']])
  if (!db.prepare('PRAGMA table_info(procesos)').all().some(c => c.name === col)) db.exec(`ALTER TABLE procesos ADD COLUMN ${col} ${def}`);

db.exec(`
CREATE TABLE IF NOT EXISTS proceso_secciones (
  id INTEGER PRIMARY KEY, proceso_id INTEGER REFERENCES procesos(id) ON DELETE CASCADE, orden INTEGER, titulo TEXT NOT NULL, texto TEXT);
CREATE TABLE IF NOT EXISTS proceso_es (
  id INTEGER PRIMARY KEY, proceso_id INTEGER REFERENCES procesos(id) ON DELETE CASCADE, orden INTEGER,
  actividad TEXT NOT NULL, ciclo TEXT CHECK (ciclo IN ('P','H','V','A')), subproceso_id INTEGER REFERENCES procesos(id),
  entradas TEXT NOT NULL DEFAULT '[]', salidas TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS proceso_documentacion (
  id INTEGER PRIMARY KEY, proceso_id INTEGER REFERENCES procesos(id) ON DELETE CASCADE, clase TEXT, nombre TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS proceso_versiones (
  id INTEGER PRIMARY KEY, proceso_id INTEGER REFERENCES procesos(id) ON DELETE CASCADE, version INTEGER, fecha TEXT,
  usuario_id INTEGER REFERENCES usuarios(id), comentario TEXT, contenido TEXT);
`);

// (Aquí y no en db.js porque necesita padre_id) Un Líder sin lista (base anterior o recién sembrada) conserva lo que veía: su proceso y los subprocesos de ese proceso
db.exec(`INSERT OR IGNORE INTO usuario_procesos (usuario_id, proceso_id)
  SELECT u.id, p.id FROM usuarios u JOIN procesos p ON p.id = u.proceso_id OR p.padre_id = u.proceso_id
  WHERE u.rol = 'lider_proceso' AND u.proceso_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuario_procesos x WHERE x.usuario_id = u.id)`);

const TIPOS = ['Proceso', 'Subproceso', 'Procedimiento'];
const CICLOS = ['P', 'H', 'V', 'A'];

module.exports = function (app, { alcance, uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora }) {
  const cargar = (id, u) => {
    const p = uno('SELECT * FROM procesos WHERE id = ? AND empresa_id = ?', id, u.empresa_id);
    if (!p) falla(404, 'Proceso no encontrado');
    return p;
  };
  const leerEs = id => todos(`SELECT e.*, s.nombre subproceso FROM proceso_es e LEFT JOIN procesos s ON s.id = e.subproceso_id
    WHERE e.proceso_id = ? ORDER BY e.orden, e.id`, id).map(e => ({ ...e, entradas: JSON.parse(e.entradas), salidas: JSON.parse(e.salidas) }));
  // Lo que se guarda en cada versión del historial
  const contenido = p => ({ nombre: p.nombre, codigo: p.codigo, categoria: p.categoria, tipo: p.tipo, fecha: p.fecha,
    secciones: todos('SELECT titulo, texto FROM proceso_secciones WHERE proceso_id = ? ORDER BY orden, id', p.id),
    entradas_salidas: leerEs(p.id).map(({ actividad, ciclo, subproceso_id, entradas, salidas }) => ({ actividad, ciclo, subproceso_id, entradas, salidas })) });

  app.get('/api/procesos/:id', r(req => {
    const p = cargar(req.params.id, req.u);
    const ruta = [];
    for (let x = p; x?.padre_id; x = uno('SELECT id, nombre, padre_id FROM procesos WHERE id = ?', x.padre_id)) {
      const padre = uno('SELECT id, nombre, padre_id FROM procesos WHERE id = ?', x.padre_id);
      if (padre) ruta.unshift(padre);
    }
    return {
      ...p, ruta,
      secciones: todos('SELECT id, titulo, texto FROM proceso_secciones WHERE proceso_id = ? ORDER BY orden, id', p.id),
      hijos: todos('SELECT id, codigo, nombre, tipo FROM procesos WHERE padre_id = ? ORDER BY orden, nombre', p.id),
      entradas_salidas: leerEs(p.id),
      documentacion: todos('SELECT clase, nombre FROM proceso_documentacion WHERE proceso_id = ? ORDER BY clase, nombre', p.id),
      documentos: todos(`SELECT d.id, d.codigo, d.nombre, d.version, d.estado, c.nombre clase FROM documentos d LEFT JOIN clases_documento c ON c.id = d.clase_id
        WHERE d.proceso_id = ? AND d.estado = 'VIGENTE' ORDER BY c.nombre, d.codigo`, p.id),
      // Quien lidera un proceso ve la ficha y los documentos vigentes de todos, pero los indicadores solo los de su proceso
      indicadores: alcance.ve(p.id, req.u) ? todos('SELECT id, codigo, nombre, frecuencia, meta, unidad FROM indicadores WHERE proceso_id = ? AND activo = 1 ORDER BY codigo', p.id) : [],
      propio: alcance.ve(p.id, req.u),
      puede_editar: esCalidad(req.u) || alcance.lidera(p.id, req.u),
    };
  }));

  app.get('/api/procesos/:id/historial', r(req => {
    const p = cargar(req.params.id, req.u);
    return todos(`SELECT v.id, v.version, v.fecha, v.comentario, u.nombre usuario FROM proceso_versiones v LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.proceso_id = ? ORDER BY v.version DESC, v.id DESC`, p.id).map(v => ({ ...v, actual: v.version === p.version }));
  }));
  app.get('/api/procesos/:id/historial/:vid', r(req => {
    const p = cargar(req.params.id, req.u);
    const v = uno('SELECT * FROM proceso_versiones WHERE id = ? AND proceso_id = ?', req.params.vid, p.id);
    if (!v) falla(404, 'Versión no encontrada');
    return { ...v, contenido: JSON.parse(v.contenido) };
  }));

  // Editar la ficha (solo Calidad): cada guardado genera una nueva versión en el historial
  app.put('/api/procesos/:id', r(req => {
    const p = cargar(req.params.id, req.u), b = { ...req.body };
    if (!esCalidad(req.u) && !alcance.lidera(p.id, req.u)) falla(403, 'Solo Calidad o el líder del proceso editan su caracterización');
    // El líder edita el contenido de su proceso; el nombre, el código y el tipo (su identidad) los define Calidad
    if (!esCalidad(req.u)) { b.nombre = p.nombre; b.codigo = p.codigo; b.tipo = p.tipo; }
    if (!String(b.nombre || '').trim()) falla(400, 'El nombre es obligatorio');
    if (b.tipo && !TIPOS.includes(b.tipo)) falla(400, 'Tipo no válido');
    if (!String(b.comentario || '').trim()) falla(400, 'Describe la modificación para el historial');
    const secciones = (b.secciones || []).filter(s => String(s.titulo || '').trim());
    const es = (b.entradas_salidas || []).filter(e => String(e.actividad || '').trim());
    for (const e of es) if (e.ciclo && !CICLOS.includes(e.ciclo)) falla(400, 'El ciclo debe ser P, H, V o A');
    return transaccion(() => {
      const version = p.version + 1;
      ejecutar('UPDATE procesos SET nombre = ?, codigo = ?, tipo = ?, fecha = ?, version = ?, modificado = ? WHERE id = ?',
        b.nombre.trim(), b.codigo || null, b.tipo || p.tipo, b.fecha || p.fecha, version, ahora(), p.id);
      ejecutar('DELETE FROM proceso_secciones WHERE proceso_id = ?', p.id);
      secciones.forEach((s, i) => ejecutar('INSERT INTO proceso_secciones (proceso_id, orden, titulo, texto) VALUES (?,?,?,?)', p.id, i, s.titulo.trim(), s.texto || null));
      ejecutar('DELETE FROM proceso_es WHERE proceso_id = ?', p.id);
      es.forEach((e, i) => ejecutar('INSERT INTO proceso_es (proceso_id, orden, actividad, ciclo, subproceso_id, entradas, salidas) VALUES (?,?,?,?,?,?,?)',
        p.id, i, e.actividad.trim(), e.ciclo || null, e.subproceso_id || null,
        JSON.stringify((e.entradas || []).filter(x => x.proveedor || x.entrada)), JSON.stringify((e.salidas || []).filter(x => x.salida || x.cliente))));
      ejecutar('INSERT INTO proceso_versiones (proceso_id, version, fecha, usuario_id, comentario, contenido) VALUES (?,?,?,?,?,?)',
        p.id, version, ahora(), req.u.id, b.comentario.trim(), JSON.stringify(contenido({ ...p, ...b, id: p.id })));
      return { ok: true, version };
    });
  }));
  // ---------- Administración de procesos: crear procesos y asignar sus líderes (solo el administrador) ----------
  const soloAdmin = u => { if (u.rol !== 'admin') falla(403, 'Solo el administrador crea procesos y asigna a sus líderes'); };
  const CATEGORIAS = ['Estratégico', 'Misional', 'Apoyo'];
  const siglaDe = nombre => String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(w => w.length > 3).map(w => w[0]).join('').slice(0, 4).toUpperCase() || 'PRO';
  // Un Líder puede liderar varios procesos y subprocesos, y un proceso puede tener varios líderes
  const lideresDe = id => todos(`SELECT u.id, u.usuario, u.correo, u.nombre, u.cargo FROM usuarios u JOIN usuario_procesos up ON up.usuario_id = u.id
    WHERE up.proceso_id = ? AND u.rol = 'lider_proceso' AND u.activo = 1 ORDER BY u.nombre`, id);

  app.get('/api/procesos-lideres', r(req => {
    soloAdmin(req.u);
    return todos(`SELECT id, nombre, sigla, codigo, categoria, tipo, padre_id FROM procesos WHERE empresa_id = ?
        ORDER BY CASE categoria WHEN 'Estratégico' THEN 0 WHEN 'Misional' THEN 1 ELSE 2 END, orden, nombre`, req.u.empresa_id)
      .map(p => ({ ...p, lideres: lideresDe(p.id) }));
  }));

  app.post('/api/procesos', r(req => {
    soloAdmin(req.u);
    const b = req.body, nombre = String(b.nombre || '').trim();
    if (!nombre) falla(400, 'El nombre es obligatorio');
    const padre = b.padre_id ? cargar(b.padre_id, req.u) : null;
    const categoria = padre ? padre.categoria : b.categoria; // un subproceso hereda la categoría de su proceso
    if (!CATEGORIAS.includes(categoria)) falla(400, 'La categoría debe ser Estratégico, Misional o Apoyo');
    const tipo = padre ? (TIPOS.includes(b.tipo) && b.tipo !== 'Proceso' ? b.tipo : 'Subproceso') : 'Proceso';
    const codigo = String(b.codigo || '').trim() || null;
    if (codigo && uno('SELECT 1 FROM procesos WHERE empresa_id = ? AND codigo = ?', req.u.empresa_id, codigo)) falla(400, `Ya existe un proceso con el código ${codigo}`);
    if (uno('SELECT 1 FROM procesos WHERE empresa_id = ? AND padre_id IS ? AND lower(nombre) = lower(?)', req.u.empresa_id, padre?.id ?? null, nombre)) falla(400, 'Ya existe un proceso con ese nombre en ese lugar');
    return transaccion(() => {
      const orden = (uno('SELECT COALESCE(MAX(orden), 0) + 1 n FROM procesos WHERE empresa_id = ? AND padre_id IS ?', req.u.empresa_id, padre?.id ?? null)).n;
      const id = Number(ejecutar(`INSERT INTO procesos (empresa_id, nombre, sigla, categoria, orden, padre_id, tipo, codigo, version, fecha, modificado)
        VALUES (?,?,?,?,?,?,?,?,1,?,?)`, req.u.empresa_id, nombre, String(b.sigla || '').trim().toUpperCase() || siglaDe(nombre), categoria, orden, padre?.id ?? null, tipo, codigo,
        ahora().slice(0, 10), ahora()).lastInsertRowid);
      ejecutar('INSERT INTO proceso_versiones (proceso_id, version, fecha, usuario_id, comentario, contenido) VALUES (?,?,?,?,?,?)',
        id, 1, ahora(), req.u.id, 'Creación del proceso', JSON.stringify(contenido(cargar(id, req.u))));
      return { id };
    });
  }));

  // Agrega este proceso a los que lidera la persona (si es un proceso principal, también sus subprocesos)
  app.post('/api/procesos/:id/lideres', r(req => {
    soloAdmin(req.u);
    const p = cargar(req.params.id, req.u);
    const u = uno('SELECT * FROM usuarios WHERE id = ? AND empresa_id = ? AND activo = 1', req.body.usuario_id, req.u.empresa_id);
    if (!u) falla(404, 'Usuario no encontrado o inactivo');
    if (u.rol === 'admin' || u.rol === 'lider_calidad') falla(400, 'El administrador y el Gestor de Calidad ya ven todo: no necesitan ser líderes de un proceso');
    const ids = req.body.con_subprocesos === false ? [p.id] : todos('SELECT id FROM procesos WHERE id = ? OR padre_id = ?', p.id, p.id).map(x => x.id);
    transaccion(() => {
      for (const id of ids) ejecutar('INSERT OR IGNORE INTO usuario_procesos (usuario_id, proceso_id) VALUES (?,?)', u.id, id);
      if (u.rol !== 'lider_proceso' || !u.proceso_id) {
        ejecutar("UPDATE usuarios SET rol = 'lider_proceso', proceso_id = COALESCE(proceso_id, ?) WHERE id = ?", p.padre_id || p.id, u.id);
        ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', u.id); // al cambiar de rol se cierran sus sesiones para que tome los permisos nuevos
      }
    });
    return { ok: true, agregados: ids.length };
  }));

  // Quita solo este proceso; si ya no lidera ninguno, queda como Colaborador
  app.delete('/api/procesos/:id/lideres/:usuario', r(req => {
    soloAdmin(req.u);
    const p = cargar(req.params.id, req.u);
    const u = uno(`SELECT u.* FROM usuarios u JOIN usuario_procesos up ON up.usuario_id = u.id WHERE u.id = ? AND u.empresa_id = ? AND up.proceso_id = ?`, req.params.usuario, req.u.empresa_id, p.id);
    if (!u) falla(404, 'Esa persona no es líder de este proceso');
    let quedan = 0;
    transaccion(() => {
      ejecutar('DELETE FROM usuario_procesos WHERE usuario_id = ? AND proceso_id = ?', u.id, p.id);
      const resto = todos('SELECT up.proceso_id, pr.padre_id FROM usuario_procesos up JOIN procesos pr ON pr.id = up.proceso_id WHERE up.usuario_id = ?', u.id);
      quedan = resto.length;
      if (!quedan) {
        ejecutar("UPDATE usuarios SET rol = 'consulta', proceso_id = NULL WHERE id = ?", u.id);
        ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', u.id);
      } else if (u.proceso_id === p.id) ejecutar('UPDATE usuarios SET proceso_id = ? WHERE id = ?', (resto.find(x => !x.padre_id) || resto[0]).proceso_id, u.id);
    });
    return { ok: true, quedan };
  }));
};
module.exports.TIPOS = TIPOS;
