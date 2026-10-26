// Módulo de indicadores y cuadro de mando (BSC): esquema, datos iniciales y API.
const { db } = require('./db');
const { xlsx, csv } = require('./xlsx');

db.exec(`
CREATE TABLE IF NOT EXISTS planes_estrategicos (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, nombre TEXT NOT NULL, anio_inicio INTEGER, anio_fin INTEGER);
CREATE TABLE IF NOT EXISTS perspectivas (
  id INTEGER PRIMARY KEY, plan_id INTEGER REFERENCES planes_estrategicos(id) ON DELETE CASCADE, nombre TEXT NOT NULL, orden INTEGER);
CREATE TABLE IF NOT EXISTS objetivos (
  id INTEGER PRIMARY KEY, perspectiva_id INTEGER REFERENCES perspectivas(id) ON DELETE CASCADE,
  codigo TEXT, nombre TEXT NOT NULL, descripcion TEXT, responsable_id INTEGER REFERENCES usuarios(id));
CREATE TABLE IF NOT EXISTS indicadores (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, proceso_id INTEGER REFERENCES procesos(id),
  objetivo_id INTEGER REFERENCES objetivos(id) ON DELETE SET NULL,
  codigo TEXT, nombre TEXT NOT NULL, proposito TEXT, formula TEXT,
  calculo TEXT NOT NULL DEFAULT 'directo' CHECK (calculo IN ('directo','razon')),
  unidad TEXT NOT NULL DEFAULT '%' CHECK (unidad IN ('%','#','$','días','horas')),
  frecuencia TEXT NOT NULL DEFAULT 'Mensual' CHECK (frecuencia IN ('Mensual','Bimestral','Trimestral','Semestral','Anual')),
  sentido TEXT NOT NULL DEFAULT 'Ascendente' CHECK (sentido IN ('Ascendente','Descendente')),
  meta REAL NOT NULL, tolerancia REAL NOT NULL DEFAULT 10,
  responsable_id INTEGER REFERENCES usuarios(id), fuente TEXT, activo INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS mediciones (
  id INTEGER PRIMARY KEY, indicador_id INTEGER REFERENCES indicadores(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL, periodo INTEGER NOT NULL, numerador REAL, denominador REAL, valor REAL NOT NULL,
  meta REAL, analisis TEXT, usuario_id INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (indicador_id, anio, periodo));
CREATE TABLE IF NOT EXISTS planes_accion (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, objetivo_id INTEGER REFERENCES objetivos(id) ON DELETE CASCADE,
  indicador_id INTEGER REFERENCES indicadores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, responsable_id INTEGER REFERENCES usuarios(id), fecha_inicio TEXT, fecha_fin TEXT,
  avance REAL DEFAULT 0, estado TEXT DEFAULT 'Abierto' CHECK (estado IN ('Abierto','En curso','Cerrado')), observaciones TEXT);
`);

const PERIODOS = { Mensual: 12, Bimestral: 6, Trimestral: 4, Semestral: 2, Anual: 1 };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function etiquetaPeriodo(frecuencia, p) {
  if (frecuencia === 'Mensual') return MESES[p - 1];
  if (frecuencia === 'Anual') return 'Año';
  return { Bimestral: 'B', Trimestral: 'T', Semestral: 'S' }[frecuencia] + p;
}
// Último periodo ya cerrado del año (para saber qué mediciones están atrasadas)
function periodoVencido(frecuencia, anio, hoy = new Date()) {
  if (anio < hoy.getFullYear()) return PERIODOS[frecuencia];
  if (anio > hoy.getFullYear()) return 0;
  const mesesPorPeriodo = 12 / PERIODOS[frecuencia];
  return Math.floor(hoy.getMonth() / mesesPorPeriodo); // meses completos transcurridos
}

// Semáforo y cumplimiento según el sentido del indicador
function evaluar(valor, meta, sentido, tolerancia) {
  if (valor == null || meta == null) return { semaforo: 'sin_dato', cumplimiento: null };
  const t = (tolerancia ?? 10) / 100;
  let semaforo, cumplimiento;
  if (sentido === 'Descendente') {
    semaforo = valor <= meta ? 'verde' : valor <= meta * (1 + t) ? 'amarillo' : 'rojo';
    cumplimiento = valor <= 0 ? 100 : meta / valor * 100;
  } else {
    semaforo = valor >= meta ? 'verde' : valor >= meta * (1 - t) ? 'amarillo' : 'rojo';
    cumplimiento = meta === 0 ? (valor >= 0 ? 100 : 0) : valor / meta * 100;
  }
  return { semaforo, cumplimiento: Math.max(0, Math.min(100, cumplimiento)) };
}

// Mejor / Peor / Igual: el último valor frente a la medición previa, según el sentido del indicador
function tendencia(ind) {
  if (ind.ultimo?.valor == null || ind.previo?.valor == null) return null;
  const d = ind.ultimo.valor - ind.previo.valor;
  if (!d) return 'Igual';
  return (ind.sentido === 'Descendente' ? d < 0 : d > 0) ? 'Mejor' : 'Peor';
}

function sembrar() {
  if (db.prepare('SELECT COUNT(*) n FROM planes_estrategicos').get().n) return;
  const pid = s => db.prepare('SELECT id FROM procesos WHERE sigla = ?').get(s).id;
  const uid = u => db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(u)?.id ?? null; // en producción no hay usuarios de prueba
  const plan = db.prepare("INSERT INTO planes_estrategicos (empresa_id, nombre, anio_inicio, anio_fin) VALUES (1, 'Plan Estratégico 2026', 2026, 2026)").run().lastInsertRowid;
  const insPer = db.prepare('INSERT INTO perspectivas (plan_id, nombre, orden) VALUES (?,?,?)');
  const insObj = db.prepare('INSERT INTO objetivos (perspectiva_id, codigo, nombre, responsable_id) VALUES (?,?,?,?)');
  const obj = {};
  [['Financiera', [['OE1', 'Crecer en ventas de forma sostenida']]],
   ['Cliente', [['OE2', 'Aumentar la satisfacción del cliente']]],
   ['Procesos internos', [['OE3', 'Asegurar la conformidad del producto'], ['OE4', 'Usar eficientemente los recursos'], ['OE5', 'Gestionar los riesgos del negocio']]],
   ['Aprendizaje y crecimiento', [['OE6', 'Desarrollar las competencias del personal']]]]
    .forEach(([per, objs], i) => {
      const p = insPer.run(plan, per, i).lastInsertRowid;
      objs.forEach(([c, n]) => { obj[c] = insObj.run(p, c, n, uid('calidad')).lastInsertRowid; });
    });

  const ins = db.prepare(`INSERT INTO indicadores (empresa_id, proceso_id, objetivo_id, codigo, nombre, proposito, formula, calculo, unidad,
    frecuencia, sentido, meta, tolerancia, responsable_id) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // Indicadores que Metalcof tiene hoy en Almera (fórmulas de referencia, ajustables)
  const defs = [
    ['GER', 'OE1', 'IND-GER-01', 'Metas alcanzadas', 'Metas cumplidas / metas programadas × 100', 'razon', '%', 'Anual', 'Ascendente', 90],
    ['COM', 'OE1', 'IND-COM-01', 'Comportamiento de ventas anual', 'Variación de ventas frente al año anterior', 'directo', '%', 'Anual', 'Ascendente', 10],
    ['COM', 'OE1', 'IND-COM-02', 'Comportamiento comparativo mensual de ventas', 'Ventas del mes / ventas del mismo mes del año anterior × 100', 'razon', '%', 'Mensual', 'Ascendente', 100],
    ['COM', 'OE2', 'IND-COM-03', 'Respuesta oportuna a quejas y reclamos', 'PQR respondidas a tiempo / PQR recibidas × 100', 'razon', '%', 'Mensual', 'Ascendente', 90],
    ['COM', 'OE2', 'IND-COM-04', 'Satisfacción del cliente', 'Clientes satisfechos / clientes encuestados × 100', 'razon', '%', 'Semestral', 'Ascendente', 90],
    ['SIG', 'OE5', 'IND-SIG-01', 'Administración del riesgo (monitoreo)', 'Controles ejecutados / controles programados × 100', 'razon', '%', 'Trimestral', 'Ascendente', 90],
    ['SIG', 'OE3', 'IND-SIG-02', 'Acciones correctivas', 'Acciones cerradas eficazmente / acciones abiertas × 100', 'razon', '%', 'Trimestral', 'Ascendente', 90],
    // Agua y energía según su ficha técnica en Almera (ES-SIG-FTE-03 y -04): agua maximiza, energía minimiza
    ['SIG', 'OE4', 'IND-SIG-03', 'Uso eficiente del agua', '(Consumo m³ periodo actual − consumo m³ periodo anterior) / consumo m³ periodo anterior × 100', 'directo', '%', 'Mensual', 'Ascendente', 90],
    ['SIG', 'OE4', 'IND-SIG-04', 'Uso eficiente de energía', '(Consumo kWh periodo actual − consumo kWh periodo anterior) / consumo kWh periodo anterior × 100', 'directo', '%', 'Mensual', 'Descendente', 90],
    ['SIG', 'OE4', 'IND-SIG-05', 'Porcentaje de residuos aprovechables', 'Kg aprovechables / kg generados × 100', 'razon', '%', 'Mensual', 'Ascendente', 60],
    ['CCA', 'OE3', 'IND-CCA-01', 'Conformidad de producto', 'Unidades conformes / unidades inspeccionadas × 100', 'razon', '%', 'Mensual', 'Ascendente', 98],
    ['PRO', 'OE3', 'IND-PRO-01', 'Conformidad de producto - dispositivo', 'Dispositivos conformes / dispositivos producidos × 100', 'razon', '%', 'Mensual', 'Ascendente', 98],
    ['ALM', 'OE3', 'IND-ALM-01', 'Desempeño de proveedores', 'Promedio de la evaluación de proveedores', 'directo', '%', 'Semestral', 'Ascendente', 80],
    ['GTH', 'OE6', 'IND-GTH-01', 'Evaluación de desempeño', 'Promedio de la evaluación de desempeño', 'directo', '%', 'Anual', 'Ascendente', 85],
    ['GTH', 'OE6', 'IND-GTH-02', 'Programa de capacitación', 'Capacitaciones ejecutadas / programadas × 100', 'razon', '%', 'Trimestral', 'Ascendente', 90],
  ];
  // Semáforo de Almera: agua amarillo desde 70 % (90 × (1 − 22,22 %)); energía sin franja amarilla (> 90 % ya es rojo)
  const TOLERANCIAS = { 'IND-SIG-03': 22.22, 'IND-SIG-04': 0 };
  const ids = {};
  for (const [proc, o, cod, nombre, formula, calculo, unidad, frec, sentido, meta] of defs)
    ids[cod] = ins.run(pid(proc), obj[o], cod, nombre, null, formula, calculo, unidad, frec, sentido, meta, TOLERANCIAS[cod] ?? 10,
      uid(proc === 'PRO' ? 'produccion' : 'calidad')).lastInsertRowid;

  // Mediciones 2026 tomadas de Almera (reporte Seguimiento MOP)
  const med = db.prepare('INSERT INTO mediciones (indicador_id, anio, periodo, valor, meta, usuario_id) VALUES (?, 2026, ?, ?, ?, ?)');
  [-40.26, -29.87, 4.84, -7.32, -18.92].forEach((v, i) => med.run(ids['IND-SIG-03'], i + 1, v, 90, uid('calidad')));
  [74.10, 59.97, 137.88, 30.30, 115.07, 16.91].forEach((v, i) => med.run(ids['IND-SIG-04'], i + 1, v, 90, uid('calidad')));
}
sembrar();

module.exports = function (app, { uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora }) {
  const anioActual = () => new Date().getFullYear();

  // Enriquecer un indicador con su serie del año, último valor, previo y semáforo
  function conDatos(ind, anio) {
    const meds = todos('SELECT * FROM mediciones WHERE indicador_id = ? ORDER BY anio, periodo', ind.id);
    const delAnio = meds.filter(m => m.anio === anio);
    const n = PERIODOS[ind.frecuencia];
    const serie = Array.from({ length: n }, (_, i) => {
      const m = delAnio.find(x => x.periodo === i + 1);
      return { periodo: i + 1, etiqueta: etiquetaPeriodo(ind.frecuencia, i + 1), valor: m ? m.valor : null,
        meta: m?.meta ?? ind.meta, ...evaluar(m?.valor, m?.meta ?? ind.meta, ind.sentido, ind.tolerancia) };
    });
    const conValor = meds.filter(m => m.anio <= anio);
    const ultima = conValor[conValor.length - 1], previa = conValor[conValor.length - 2];
    const vencido = periodoVencido(ind.frecuencia, anio);
    const faltantes = serie.filter(s => s.periodo <= vencido && s.valor == null).map(s => s.etiqueta);
    return {
      ...ind, serie, faltantes,
      ultimo: ultima ? { valor: ultima.valor, anio: ultima.anio, etiqueta: etiquetaPeriodo(ind.frecuencia, ultima.periodo) } : null,
      previo: previa ? { valor: previa.valor, anio: previa.anio, etiqueta: etiquetaPeriodo(ind.frecuencia, previa.periodo) } : null,
      ...evaluar(ultima?.valor, ultima?.meta ?? ind.meta, ind.sentido, ind.tolerancia),
    };
  }

  const SELECT_IND = `SELECT i.*, p.nombre proceso, p.categoria, p.orden proceso_orden, u.nombre responsable,
      o.codigo objetivo_codigo, o.nombre objetivo FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id LEFT JOIN usuarios u ON u.id = i.responsable_id
    LEFT JOIN objetivos o ON o.id = i.objetivo_id`;
  const puedeMedir = (ind, u) => esCalidad(u) || ind.responsable_id === u.id ||
    (u.rol === 'lider_proceso' && ind.proceso_id === u.proceso_id);

  app.get('/api/indicadores', r(req => {
    const anio = Number(req.query.anio) || anioActual();
    const w = ['i.empresa_id = ?'], p = [req.u.empresa_id];
    if (req.query.inactivos !== '1') w.push('i.activo = 1');
    const procs = [].concat(req.query.proceso || []).filter(Boolean);
    if (procs.length) { w.push(`i.proceso_id IN (${procs.map(() => '?').join(',')})`); p.push(...procs); }
    if (req.query.texto) { w.push('(i.nombre LIKE ? OR i.codigo LIKE ?)'); p.push(`%${req.query.texto}%`, `%${req.query.texto}%`); }
    let lista = todos(`${SELECT_IND} WHERE ${w.join(' AND ')} ORDER BY p.orden, i.codigo`, ...p).map(i => conDatos(i, anio));
    const sem = [].concat(req.query.semaforo || []).filter(Boolean);
    if (sem.length) lista = lista.filter(i => sem.includes(i.semaforo));
    return lista.map(i => ({ ...i, puede_medir: puedeMedir(i, req.u) }));
  }));

  app.get('/api/indicadores/:id', r(req => {
    const ind = uno(`${SELECT_IND} WHERE i.id = ? AND i.empresa_id = ?`, req.params.id, req.u.empresa_id);
    if (!ind) falla(404, 'Indicador no encontrado');
    const anio = Number(req.query.anio) || anioActual();
    return {
      ...conDatos(ind, anio), anio,
      puede_medir: puedeMedir(ind, req.u), puede_editar: esCalidad(req.u),
      anios: todos('SELECT DISTINCT anio FROM mediciones WHERE indicador_id = ? ORDER BY anio', ind.id).map(x => x.anio),
      mediciones: todos(`SELECT m.*, u.nombre usuario FROM mediciones m LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE indicador_id = ? AND anio = ? ORDER BY periodo`, ind.id, anio),
      planes: todos(`SELECT a.*, u.nombre responsable FROM planes_accion a LEFT JOIN usuarios u ON u.id = a.responsable_id
        WHERE a.indicador_id = ? ORDER BY a.id DESC`, ind.id),
    };
  }));

  const CAMPOS_IND = ['proceso_id', 'objetivo_id', 'codigo', 'nombre', 'proposito', 'formula', 'calculo', 'unidad', 'frecuencia',
    'sentido', 'meta', 'tolerancia', 'responsable_id', 'fuente', 'activo'];
  function guardarIndicador(req, id) {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad administra los indicadores');
    const b = { activo: 1, tolerancia: 10, ...req.body };
    if (!String(b.nombre || '').trim() || !b.proceso_id) falla(400, 'Nombre y proceso son obligatorios');
    if (b.meta === '' || b.meta == null || isNaN(Number(b.meta))) falla(400, 'La meta debe ser un número');
    if (!PERIODOS[b.frecuencia]) falla(400, 'Frecuencia inválida');
    if (!b.codigo) {
      const sigla = uno('SELECT sigla FROM procesos WHERE id = ?', b.proceso_id).sigla;
      const n = uno("SELECT COUNT(*) n FROM indicadores WHERE codigo LIKE ?", `IND-${sigla}-%`).n + 1;
      b.codigo = `IND-${sigla}-${String(n).padStart(2, '0')}`;
    }
    const vals = CAMPOS_IND.map(c => b[c]);
    if (id) {
      const actual = uno('SELECT frecuencia FROM indicadores WHERE id = ? AND empresa_id = ?', id, req.u.empresa_id);
      if (!actual) falla(404, 'Indicador no encontrado');
      if (actual.frecuencia !== b.frecuencia && uno('SELECT 1 FROM mediciones WHERE indicador_id = ?', id))
        falla(400, 'No se puede cambiar la frecuencia de un indicador que ya tiene mediciones');
      ejecutar(`UPDATE indicadores SET ${CAMPOS_IND.map(c => c + ' = ?').join(', ')} WHERE id = ?`, ...vals, id);
      return { id: Number(id) };
    }
    return { id: Number(ejecutar(`INSERT INTO indicadores (empresa_id, ${CAMPOS_IND.join(', ')}) VALUES (?${', ?'.repeat(CAMPOS_IND.length)})`,
      req.u.empresa_id, ...vals).lastInsertRowid) };
  }
  app.post('/api/indicadores', r(req => guardarIndicador(req)));
  app.put('/api/indicadores/:id', r(req => guardarIndicador(req, req.params.id)));

  // Registrar o corregir la medición de un periodo
  app.post('/api/indicadores/:id/mediciones', r(req => {
    const ind = uno('SELECT * FROM indicadores WHERE id = ? AND empresa_id = ?', req.params.id, req.u.empresa_id);
    if (!ind) falla(404, 'Indicador no encontrado');
    if (!puedeMedir(ind, req.u)) falla(403, 'Solo el responsable, el líder del proceso o Calidad registran mediciones');
    const b = req.body, anio = Number(b.anio), periodo = Number(b.periodo);
    if (!anio || !(periodo >= 1 && periodo <= PERIODOS[ind.frecuencia])) falla(400, 'Periodo inválido para la frecuencia del indicador');
    if (periodo > periodoVencido(ind.frecuencia, anio) + 1) falla(400, 'Ese periodo todavía no ha transcurrido');
    let valor;
    const num = b.numerador === '' || b.numerador == null ? null : Number(b.numerador);
    const den = b.denominador === '' || b.denominador == null ? null : Number(b.denominador);
    if (ind.calculo === 'razon') {
      if (num == null || !den) falla(400, 'Registra numerador y un denominador distinto de cero');
      valor = Math.round(num / den * (ind.unidad === '%' ? 100 : 1) * 100) / 100;
    } else {
      valor = Number(b.valor);
      if (b.valor === '' || b.valor == null || isNaN(valor)) falla(400, 'El valor debe ser un número');
    }
    const ev = evaluar(valor, ind.meta, ind.sentido, ind.tolerancia);
    if (ev.semaforo !== 'verde' && !String(b.analisis || '').trim())
      falla(400, 'El resultado no alcanza la meta: escribe el análisis de la causa');
    ejecutar(`INSERT INTO mediciones (indicador_id, anio, periodo, numerador, denominador, valor, meta, analisis, usuario_id, fecha)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (indicador_id, anio, periodo) DO UPDATE SET numerador = excluded.numerador,
      denominador = excluded.denominador, valor = excluded.valor, meta = excluded.meta, analisis = excluded.analisis,
      usuario_id = excluded.usuario_id, fecha = excluded.fecha`,
      ind.id, anio, periodo, num, den, valor, ind.meta, b.analisis || null, req.u.id, ahora());
    return { ok: true, valor, ...ev };
  }));

  app.delete('/api/indicadores/:id/mediciones/:mid', r(req => {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad elimina mediciones');
    ejecutar(`DELETE FROM mediciones WHERE id = ? AND indicador_id IN (SELECT id FROM indicadores WHERE id = ? AND empresa_id = ?)`,
      req.params.mid, req.params.id, req.u.empresa_id);
    return { ok: true };
  }));

  // ---------- Cuadro de mando ----------
  app.get('/api/bsc', r(req => {
    const planes = todos('SELECT * FROM planes_estrategicos WHERE empresa_id = ? ORDER BY anio_inicio DESC', req.u.empresa_id);
    const plan = planes.find(p => p.id === Number(req.query.plan)) || planes[0];
    if (!plan) return { planes, plan: null, perspectivas: [] };
    const anio = Number(req.query.anio) || Math.min(Math.max(anioActual(), plan.anio_inicio), plan.anio_fin);
    const promedio = l => { const v = l.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const perspectivas = todos('SELECT * FROM perspectivas WHERE plan_id = ? ORDER BY orden', plan.id).map(per => {
      const objetivos = todos(`SELECT o.*, u.nombre responsable FROM objetivos o LEFT JOIN usuarios u ON u.id = o.responsable_id
        WHERE perspectiva_id = ? ORDER BY codigo`, per.id).map(o => {
        const inds = todos(`${SELECT_IND} WHERE i.objetivo_id = ? AND i.activo = 1 ORDER BY i.codigo`, o.id).map(i => conDatos(i, anio));
        const planes = todos(`SELECT a.*, u.nombre responsable FROM planes_accion a LEFT JOIN usuarios u ON u.id = a.responsable_id
          WHERE a.objetivo_id = ? ORDER BY a.fecha_fin`, o.id);
        const cumplimiento = promedio(inds.map(i => i.cumplimiento));
        return { ...o, indicadores: inds, planes, cumplimiento,
          avance_planes: promedio(planes.map(a => a.avance)),
          ...(cumplimiento == null ? { semaforo: 'sin_dato' } : evaluar(cumplimiento, 100, 'Ascendente', 10)) };
      });
      const cumplimiento = promedio(objetivos.map(o => o.cumplimiento));
      return { ...per, objetivos, cumplimiento, semaforo: cumplimiento == null ? 'sin_dato' : evaluar(cumplimiento, 100, 'Ascendente', 10).semaforo };
    });
    return { planes, plan, anio, perspectivas, cumplimiento: promedio(perspectivas.map(p => p.cumplimiento)) };
  }));

  // Estructura del plan (solo Calidad)
  function soloCalidad(req) { if (!esCalidad(req.u)) falla(403, 'Solo Calidad administra el plan estratégico'); }
  app.post('/api/planes-estrategicos', r(req => {
    soloCalidad(req);
    const b = req.body;
    if (!String(b.nombre || '').trim() || !b.anio_inicio) falla(400, 'Nombre y año son obligatorios');
    return transaccion(() => {
      const id = Number(ejecutar('INSERT INTO planes_estrategicos (empresa_id, nombre, anio_inicio, anio_fin) VALUES (?,?,?,?)',
        req.u.empresa_id, b.nombre.trim(), Number(b.anio_inicio), Number(b.anio_fin || b.anio_inicio)).lastInsertRowid);
      ['Financiera', 'Cliente', 'Procesos internos', 'Aprendizaje y crecimiento']
        .forEach((n, i) => ejecutar('INSERT INTO perspectivas (plan_id, nombre, orden) VALUES (?,?,?)', id, n, i));
      return { id };
    });
  }));
  app.post('/api/objetivos', r(req => {
    soloCalidad(req);
    const b = req.body;
    if (!String(b.nombre || '').trim() || !b.perspectiva_id) falla(400, 'Nombre y perspectiva son obligatorios');
    if (b.id) {
      ejecutar('UPDATE objetivos SET perspectiva_id = ?, codigo = ?, nombre = ?, descripcion = ?, responsable_id = ? WHERE id = ?',
        b.perspectiva_id, b.codigo, b.nombre.trim(), b.descripcion, b.responsable_id, b.id);
      return { id: Number(b.id) };
    }
    return { id: Number(ejecutar('INSERT INTO objetivos (perspectiva_id, codigo, nombre, descripcion, responsable_id) VALUES (?,?,?,?,?)',
      b.perspectiva_id, b.codigo, b.nombre.trim(), b.descripcion, b.responsable_id).lastInsertRowid) };
  }));
  app.delete('/api/objetivos/:id', r(req => { soloCalidad(req); ejecutar('DELETE FROM objetivos WHERE id = ?', req.params.id); return { ok: true }; }));

  // Planes de acción (de un objetivo o de un indicador)
  app.post('/api/planes-accion', r(req => {
    const b = req.body;
    if (!String(b.nombre || '').trim()) falla(400, 'El nombre es obligatorio');
    if (!b.objetivo_id && !b.indicador_id && !b.riesgo_id) falla(400, 'El plan debe asociarse a un objetivo, un indicador o un riesgo');
    const avance = Math.max(0, Math.min(100, Number(b.avance) || 0));
    const estado = avance >= 100 ? 'Cerrado' : avance > 0 ? 'En curso' : 'Abierto';
    if (b.id) {
      const a = uno('SELECT * FROM planes_accion WHERE id = ? AND empresa_id = ?', b.id, req.u.empresa_id);
      if (!a) falla(404, 'Plan no encontrado');
      if (!esCalidad(req.u) && a.responsable_id !== req.u.id) falla(403, 'Solo el responsable o Calidad actualizan el plan');
      ejecutar(`UPDATE planes_accion SET nombre = ?, responsable_id = ?, fecha_inicio = ?, fecha_fin = ?, avance = ?, estado = ?,
        observaciones = ? WHERE id = ?`, b.nombre.trim(), b.responsable_id, b.fecha_inicio, b.fecha_fin, avance, estado, b.observaciones, b.id);
      return { id: Number(b.id) };
    }
    if (req.u.rol === 'consulta') falla(403, 'Los usuarios de consulta no crean planes');
    return { id: Number(ejecutar(`INSERT INTO planes_accion (empresa_id, objetivo_id, indicador_id, riesgo_id, nombre, responsable_id, fecha_inicio,
      fecha_fin, avance, estado, observaciones) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, req.u.empresa_id, b.objetivo_id, b.indicador_id, b.riesgo_id,
      b.nombre.trim(), b.responsable_id || req.u.id, b.fecha_inicio, b.fecha_fin, avance, estado, b.observaciones).lastInsertRowid) };
  }));

  // Mediciones atrasadas para "Mi plan de trabajo"
  // ---------- Reporte "Seguimiento al MOP": exportación XLSX / CSV ----------
  app.get('/api/mop/exportar', (req, res) => r(() => {
    const anio = Number(req.query.anio) || anioActual();
    const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
    const lista = todos(`${SELECT_IND} WHERE i.empresa_id = ? AND i.activo = 1 ORDER BY p.orden, i.codigo`, req.u.empresa_id).map(i => conDatos(i, anio));
    const SEM = { verde: 'Cumple', amarillo: 'En alerta', rojo: 'No cumple', sin_dato: 'Sin dato' };
    // Cada periodo se ubica en el mes en que cierra (T1 → Mar, S2 → Dic, Año → Dic)
    const mesDe = (frecuencia, p) => p * 12 / PERIODOS[frecuencia] - 1;
    const encabezado = ['Categoría', 'Proceso', 'Código', 'Indicador', 'Frecuencia', 'Unidad', 'Sentido', 'Meta',
      'Medición previa', 'Periodo previo', 'Último valor', 'Último periodo', 'Tendencia', 'Semáforo', 'Cumplimiento %', ...MESES.map(m => `${m} ${anio}`)];
    const filas = lista.map(i => {
      const meses = Array(12).fill(null);
      i.serie.forEach(s => { if (s.valor != null) meses[mesDe(i.frecuencia, s.periodo)] = s.valor; });
      return [i.categoria, i.proceso, i.codigo, i.nombre, i.frecuencia, i.unidad, i.sentido, i.meta,
        i.previo?.valor ?? null, i.previo ? `${i.previo.etiqueta} ${i.previo.anio}` : null,
        i.ultimo?.valor ?? null, i.ultimo ? `${i.ultimo.etiqueta} ${i.ultimo.anio}` : null,
        tendencia(i), SEM[i.semaforo], i.cumplimiento == null ? null : Math.round(i.cumplimiento * 10) / 10, ...meses];
    });
    const nombre = `seguimiento-mop-${anio}.${formato}`;
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    if (formato === 'csv') {
      res.type('text/csv; charset=utf-8');
      res.send(csv([encabezado, ...filas.map(f => f.map(v => typeof v === 'number' ? String(v).replace('.', ',') : v))]));
    } else {
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(xlsx('Seguimiento MOP', [encabezado, ...filas], [14, 30, 12, 42, 11, 8, 12, 8, 10, 11, 10, 11, 10, 11, 11, ...Array(12).fill(9)]));
    }
  })(req, res));

  app.get('/api/indicadores-pendientes', r(req => {
    const anio = anioActual();
    return todos(`${SELECT_IND} WHERE i.empresa_id = ? AND i.activo = 1`, req.u.empresa_id)
      .filter(i => puedeMedir(i, req.u) && (req.u.rol !== 'admin' && req.u.rol !== 'lider_calidad' ? true : i.responsable_id === req.u.id))
      .map(i => conDatos(i, anio)).filter(i => i.faltantes.length);
  }));
};
