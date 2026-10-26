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

const TIPOS = ['Proceso', 'Subproceso', 'Procedimiento'];
const CICLOS = ['P', 'H', 'V', 'A'];

module.exports = function (app, { uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora }) {
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
      indicadores: todos('SELECT id, codigo, nombre, frecuencia, meta, unidad FROM indicadores WHERE proceso_id = ? AND activo = 1 ORDER BY codigo', p.id),
      puede_editar: esCalidad(req.u),
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
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad edita la caracterización de los procesos');
    const p = cargar(req.params.id, req.u), b = req.body;
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
};
module.exports.TIPOS = TIPOS;
