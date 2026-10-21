// Módulo de evaluaciones (auditorías), hallazgos y acciones correctivas / de mejora.
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS evaluaciones (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, anio INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Auditoría interna','Auditoría externa','Autoevaluación','Inspección')),
  nombre TEXT NOT NULL, objetivo TEXT, alcance TEXT, criterios TEXT DEFAULT 'ISO 9001:2015',
  evaluador TEXT NOT NULL DEFAULT 'Coordinador de Calidad' CHECK (evaluador IN ('Coordinador de Calidad','Dueños de proceso','Externo')),
  auditor_id INTEGER REFERENCES usuarios(id), auditor_externo TEXT, fecha_inicio TEXT, fecha_fin TEXT,
  estado TEXT NOT NULL DEFAULT 'Planeación' CHECK (estado IN ('Planeación','Ejecución','Evaluación','Terminada')),
  conclusiones TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS evaluacion_procesos (
  evaluacion_id INTEGER REFERENCES evaluaciones(id) ON DELETE CASCADE, proceso_id INTEGER REFERENCES procesos(id),
  fecha TEXT, auditado_id INTEGER REFERENCES usuarios(id), PRIMARY KEY (evaluacion_id, proceso_id));
CREATE TABLE IF NOT EXISTS verificacion_items (
  id INTEGER PRIMARY KEY, evaluacion_id INTEGER REFERENCES evaluaciones(id) ON DELETE CASCADE, proceso_id INTEGER REFERENCES procesos(id),
  requisito TEXT, pregunta TEXT NOT NULL,
  resultado TEXT CHECK (resultado IN ('Conforme','No conforme','Observación','No aplica')), evidencia TEXT);
CREATE TABLE IF NOT EXISTS hallazgos (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, evaluacion_id INTEGER REFERENCES evaluaciones(id) ON DELETE SET NULL,
  item_id INTEGER REFERENCES verificacion_items(id) ON DELETE SET NULL,
  origen TEXT NOT NULL, proceso_id INTEGER REFERENCES procesos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('No conformidad mayor','No conformidad menor','Observación','Oportunidad de mejora')),
  requisito TEXT, descripcion TEXT NOT NULL, evidencia TEXT, usuario_id INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS acciones (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, hallazgo_id INTEGER REFERENCES hallazgos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('Corrección','Acción correctiva','Acción de mejora')),
  correccion TEXT, metodo_causa TEXT, analisis_causa TEXT, causa_raiz TEXT,
  responsable_id INTEGER REFERENCES usuarios(id), fecha_compromiso TEXT,
  estado TEXT NOT NULL DEFAULT 'Análisis' CHECK (estado IN ('Análisis','Ejecución','Verificación','Cerrada')),
  eficaz INTEGER, verificacion TEXT, verificador_id INTEGER, fecha_cierre TEXT, reaperturas INTEGER DEFAULT 0,
  creado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS actividades (
  id INTEGER PRIMARY KEY, accion_id INTEGER REFERENCES acciones(id) ON DELETE CASCADE, descripcion TEXT NOT NULL,
  responsable_id INTEGER REFERENCES usuarios(id), fecha TEXT, cumplida INTEGER DEFAULT 0, evidencia TEXT, fecha_cumplida TEXT);
CREATE TABLE IF NOT EXISTS acciones_bitacora (
  id INTEGER PRIMARY KEY, accion_id INTEGER REFERENCES acciones(id) ON DELETE CASCADE, evento TEXT, comentario TEXT,
  usuario_id INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const ESTADOS_EVAL = ['Planeación', 'Ejecución', 'Evaluación', 'Terminada'];
const ORIGENES = ['Auditoría interna', 'Auditoría externa', 'Autoevaluación', 'Inspección', 'Queja o reclamo de cliente', 'Indicador',
  'Riesgo', 'Revisión por la dirección', 'Producto no conforme', 'Otro'];
// Preguntas base ISO 9001:2015 para cargar en la lista de verificación de cada proceso
const PREGUNTAS_ISO = [
  ['4.4', '¿El proceso tiene caracterización actualizada con entradas, salidas, responsables e indicadores?'],
  ['5.3', '¿Los roles, responsabilidades y autoridades del proceso están definidos y comunicados?'],
  ['6.1', '¿Se identificaron los riesgos del proceso y se implementan sus controles?'],
  ['6.2', '¿Los objetivos del proceso son medibles y se les hace seguimiento?'],
  ['7.1.5', '¿Los equipos de seguimiento y medición están calibrados o verificados?'],
  ['7.2', '¿El personal tiene la competencia requerida y hay evidencia de su formación?'],
  ['7.5', '¿Los documentos que se usan son la versión vigente y los registros se conservan según el listado maestro?'],
  ['8.5', '¿La operación se realiza en condiciones controladas, según los procedimientos?'],
  ['9.1', '¿Los indicadores se miden con la frecuencia definida y se analizan sus resultados?'],
  ['10.2', '¿Las no conformidades tienen análisis de causa y acciones correctivas eficaces?'],
];

module.exports = function (app, { uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora }) {
  const hoy = () => ahora().slice(0, 10);
  const lista = v => [].concat(v || []).filter(Boolean);
  const enLista = (w, p, col, v) => { const l = lista(v); if (l.length) { w.push(`${col} IN (${l.map(() => '?').join(',')})`); p.push(...l); } };
  const consecutivo = (tabla, prefijo) => prefijo + String(uno(`SELECT COUNT(*) n FROM ${tabla} WHERE codigo LIKE ?`, prefijo + '%').n + 1).padStart(2, '0');

  // ================= Evaluaciones =================
  const SELECT_EVAL = `SELECT e.*, u.nombre auditor,
      (SELECT GROUP_CONCAT(p.nombre, ', ') FROM evaluacion_procesos ep JOIN procesos p ON p.id = ep.proceso_id WHERE ep.evaluacion_id = e.id) procesos,
      (SELECT COUNT(*) FROM hallazgos h WHERE h.evaluacion_id = e.id) total_hallazgos
    FROM evaluaciones e LEFT JOIN usuarios u ON u.id = e.auditor_id`;
  const esAuditor = (e, u) => esCalidad(u) || e.auditor_id === u.id;

  app.get('/api/evaluaciones/catalogos', r(() => ({ estados: ESTADOS_EVAL, origenes: ORIGENES,
    tipos: ['Auditoría interna', 'Auditoría externa', 'Autoevaluación', 'Inspección'],
    evaluadores: ['Coordinador de Calidad', 'Dueños de proceso', 'Externo'] })));

  app.get('/api/evaluaciones', r(req => {
    const q = req.query, w = ['e.empresa_id = ?'], p = [req.u.empresa_id];
    enLista(w, p, 'e.tipo', q.tipo); enLista(w, p, 'e.anio', q.anio); enLista(w, p, 'e.evaluador', q.evaluador); enLista(w, p, 'e.estado', q.estado);
    const procs = lista(q.proceso);
    if (procs.length) { w.push(`e.id IN (SELECT evaluacion_id FROM evaluacion_procesos WHERE proceso_id IN (${procs.map(() => '?').join(',')}))`); p.push(...procs); }
    if (q.texto) { w.push('(e.nombre LIKE ? OR e.codigo LIKE ?)'); p.push(`%${q.texto}%`, `%${q.texto}%`); }
    return todos(`${SELECT_EVAL} WHERE ${w.join(' AND ')} ORDER BY e.anio DESC, e.fecha_inicio, e.id`, ...p);
  }));

  function cargarEval(req) {
    const e = uno(`${SELECT_EVAL} WHERE e.id = ? AND e.empresa_id = ?`, req.params.id, req.u.empresa_id);
    if (!e) falla(404, 'Evaluación no encontrada');
    return e;
  }

  app.get('/api/evaluaciones/:id', r(req => {
    const e = cargarEval(req);
    const items = todos('SELECT * FROM verificacion_items WHERE evaluacion_id = ? ORDER BY proceso_id, id', e.id);
    return {
      ...e, puede_editar: esCalidad(req.u), es_auditor: esAuditor(e, req.u),
      lista_procesos: todos(`SELECT ep.*, p.nombre, u.nombre auditado FROM evaluacion_procesos ep JOIN procesos p ON p.id = ep.proceso_id
        LEFT JOIN usuarios u ON u.id = ep.auditado_id WHERE ep.evaluacion_id = ? ORDER BY p.orden`, e.id),
      items,
      resumen: ['Conforme', 'No conforme', 'Observación', 'No aplica', null].map(x => ({ resultado: x, n: items.filter(i => i.resultado === x).length })),
      hallazgos: todos(`SELECT h.*, p.nombre proceso, (SELECT COUNT(*) FROM acciones a WHERE a.hallazgo_id = h.id) total_acciones
        FROM hallazgos h LEFT JOIN procesos p ON p.id = h.proceso_id WHERE h.evaluacion_id = ? ORDER BY h.id`, e.id),
    };
  }));

  const CAMPOS_EVAL = ['anio', 'tipo', 'nombre', 'objetivo', 'alcance', 'criterios', 'evaluador', 'auditor_id', 'auditor_externo', 'fecha_inicio', 'fecha_fin'];
  function guardarEval(req, id) {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad programa evaluaciones');
    const b = req.body;
    if (!String(b.nombre || '').trim() || !Number(b.anio)) falla(400, 'Nombre y año son obligatorios');
    if (b.fecha_inicio && b.fecha_fin && b.fecha_fin < b.fecha_inicio) falla(400, 'La fecha final no puede ser anterior a la inicial');
    if (b.evaluador === 'Externo' && !String(b.auditor_externo || '').trim()) falla(400, 'Indica el auditor u organismo externo');
    const procesos = lista(b.procesos).map(Number);
    return transaccion(() => {
      if (id) {
        const e = uno('SELECT * FROM evaluaciones WHERE id = ? AND empresa_id = ?', id, req.u.empresa_id);
        if (!e) falla(404, 'Evaluación no encontrada');
        if (e.estado === 'Terminada') falla(400, 'Una evaluación terminada no se modifica');
        ejecutar(`UPDATE evaluaciones SET ${CAMPOS_EVAL.map(c => c + ' = ?').join(', ')} WHERE id = ?`, ...CAMPOS_EVAL.map(c => b[c]), id);
      } else {
        id = Number(ejecutar(`INSERT INTO evaluaciones (empresa_id, codigo, ${CAMPOS_EVAL.join(', ')}) VALUES (?, ?${', ?'.repeat(CAMPOS_EVAL.length)})`,
          req.u.empresa_id, consecutivo('evaluaciones', `EV-${b.anio}-`), ...CAMPOS_EVAL.map(c => b[c])).lastInsertRowid);
      }
      if (b.procesos !== undefined) {
        const actuales = todos('SELECT proceso_id FROM evaluacion_procesos WHERE evaluacion_id = ?', id).map(x => x.proceso_id);
        actuales.filter(p => !procesos.includes(p)).forEach(p => {
          ejecutar('DELETE FROM evaluacion_procesos WHERE evaluacion_id = ? AND proceso_id = ?', id, p);
          ejecutar('DELETE FROM verificacion_items WHERE evaluacion_id = ? AND proceso_id = ?', id, p);
        });
        procesos.filter(p => !actuales.includes(p)).forEach(p => ejecutar('INSERT INTO evaluacion_procesos (evaluacion_id, proceso_id) VALUES (?,?)', id, p));
      }
      return { id };
    });
  }
  app.post('/api/evaluaciones', r(req => guardarEval(req)));
  app.put('/api/evaluaciones/:id', r(req => guardarEval(req, req.params.id)));
  app.delete('/api/evaluaciones/:id', r(req => {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad elimina evaluaciones');
    const e = cargarEval(req);
    if (e.estado !== 'Planeación') falla(400, 'Solo se eliminan evaluaciones en planeación');
    ejecutar('DELETE FROM evaluaciones WHERE id = ?', e.id);
    return { ok: true };
  }));

  // Fecha y auditado por proceso (agenda de la auditoría)
  app.put('/api/evaluaciones/:id/procesos/:pid', r(req => {
    const e = cargarEval(req);
    if (!esAuditor(e, req.u)) falla(403, 'Solo Calidad o el auditor ajustan la agenda');
    ejecutar('UPDATE evaluacion_procesos SET fecha = ?, auditado_id = ? WHERE evaluacion_id = ? AND proceso_id = ?',
      req.body.fecha, req.body.auditado_id, e.id, req.params.pid);
    return { ok: true };
  }));

  // Cambio de estado con sus reglas
  app.post('/api/evaluaciones/:id/estado', r(req => {
    const e = cargarEval(req);
    const destino = req.body.estado, i = ESTADOS_EVAL.indexOf(e.estado), j = ESTADOS_EVAL.indexOf(destino);
    if (j < 0 || Math.abs(j - i) !== 1) falla(400, 'Solo se avanza o retrocede un paso a la vez');
    if (!esAuditor(e, req.u)) falla(403, 'Solo Calidad o el auditor asignado cambian el estado');
    if (destino === 'Terminada' && !esCalidad(req.u)) falla(403, 'Solo Calidad cierra la evaluación');
    if (e.estado === 'Terminada') falla(400, 'La evaluación ya está terminada');
    if (j > i) {
      if (destino === 'Ejecución') {
        if (!uno('SELECT 1 FROM evaluacion_procesos WHERE evaluacion_id = ?', e.id)) falla(400, 'Agrega al menos un proceso a evaluar');
        if (!e.auditor_id && !e.auditor_externo) falla(400, 'Asigna el auditor');
        if (!uno('SELECT 1 FROM verificacion_items WHERE evaluacion_id = ?', e.id)) falla(400, 'Prepara la lista de verificación');
      }
      if (destino === 'Evaluación' && uno('SELECT 1 FROM verificacion_items WHERE evaluacion_id = ? AND resultado IS NULL', e.id))
        falla(400, 'Faltan preguntas de la lista de verificación por responder');
      if (destino === 'Terminada' && !String(req.body.conclusiones || e.conclusiones || '').trim())
        falla(400, 'Escribe las conclusiones del informe');
    }
    ejecutar('UPDATE evaluaciones SET estado = ?, conclusiones = COALESCE(?, conclusiones) WHERE id = ?', destino, req.body.conclusiones, e.id);
    return { ok: true };
  }));

  // Lista de verificación
  function editableLista(e, u) {
    if (!esAuditor(e, u)) falla(403, 'Solo Calidad o el auditor asignado editan la lista de verificación');
    if (!['Planeación', 'Ejecución'].includes(e.estado)) falla(400, 'La lista solo se edita en planeación o ejecución');
  }
  app.post('/api/evaluaciones/:id/items', r(req => {
    const e = cargarEval(req); editableLista(e, req.u);
    const procesos = todos('SELECT proceso_id FROM evaluacion_procesos WHERE evaluacion_id = ?', e.id).map(x => x.proceso_id);
    if (req.body.plantilla === 'iso9001') {
      const destino = req.body.proceso_id ? [Number(req.body.proceso_id)] : procesos;
      transaccion(() => destino.forEach(p => PREGUNTAS_ISO.forEach(([req_, preg]) => {
        if (!uno('SELECT 1 FROM verificacion_items WHERE evaluacion_id = ? AND proceso_id = ? AND requisito = ?', e.id, p, req_))
          ejecutar('INSERT INTO verificacion_items (evaluacion_id, proceso_id, requisito, pregunta) VALUES (?,?,?,?)', e.id, p, req_, preg);
      })));
      return { ok: true };
    }
    if (!procesos.includes(Number(req.body.proceso_id))) falla(400, 'El proceso no hace parte de esta evaluación');
    if (!String(req.body.pregunta || '').trim()) falla(400, 'Escribe la pregunta');
    return { id: Number(ejecutar('INSERT INTO verificacion_items (evaluacion_id, proceso_id, requisito, pregunta) VALUES (?,?,?,?)',
      e.id, req.body.proceso_id, req.body.requisito, req.body.pregunta.trim()).lastInsertRowid) };
  }));
  app.delete('/api/evaluaciones/:id/items/:iid', r(req => {
    const e = cargarEval(req); editableLista(e, req.u);
    ejecutar('DELETE FROM verificacion_items WHERE id = ? AND evaluacion_id = ?', req.params.iid, e.id);
    return { ok: true };
  }));

  function crearHallazgo(datos, u) {
    const sigla = datos.proceso_id ? uno('SELECT sigla FROM procesos WHERE id = ?', datos.proceso_id)?.sigla : 'GEN';
    if (!sigla) falla(400, 'Proceso inválido');
    return Number(ejecutar(`INSERT INTO hallazgos (empresa_id, codigo, evaluacion_id, item_id, origen, proceso_id, tipo, requisito, descripcion,
      evidencia, usuario_id, fecha) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, u.empresa_id, consecutivo('hallazgos', `H-${sigla}-`),
      datos.evaluacion_id, datos.item_id, datos.origen, datos.proceso_id, datos.tipo, datos.requisito, datos.descripcion,
      datos.evidencia, u.id, ahora()).lastInsertRowid);
  }

  // Responder una pregunta: si no es conforme u observación, se genera el hallazgo automáticamente
  app.put('/api/evaluaciones/:id/items/:iid', r(req => {
    const e = cargarEval(req);
    if (!esAuditor(e, req.u)) falla(403, 'Solo el auditor asignado o Calidad responden la lista');
    if (e.estado !== 'Ejecución') falla(400, 'Las preguntas se responden con la evaluación en ejecución');
    const it = uno('SELECT * FROM verificacion_items WHERE id = ? AND evaluacion_id = ?', req.params.iid, e.id);
    if (!it) falla(404, 'Pregunta no encontrada');
    const { resultado, evidencia } = req.body;
    if (!['Conforme', 'No conforme', 'Observación', 'No aplica'].includes(resultado)) falla(400, 'Resultado inválido');
    if (resultado !== 'No aplica' && !String(evidencia || '').trim()) falla(400, 'Registra la evidencia observada');
    return transaccion(() => {
      ejecutar('UPDATE verificacion_items SET resultado = ?, evidencia = ? WHERE id = ?', resultado, evidencia, it.id);
      const tipoH = { 'No conforme': req.body.tipo_hallazgo === 'No conformidad mayor' ? 'No conformidad mayor' : 'No conformidad menor',
        'Observación': 'Observación' }[resultado];
      const previo = uno('SELECT * FROM hallazgos WHERE item_id = ?', it.id);
      let hallazgo_id = previo?.id;
      if (tipoH && !previo)
        hallazgo_id = crearHallazgo({ evaluacion_id: e.id, item_id: it.id, origen: e.tipo, proceso_id: it.proceso_id, tipo: tipoH,
          requisito: it.requisito, descripcion: `${it.pregunta} — ${evidencia}`, evidencia }, req.u);
      else if (tipoH && previo) ejecutar('UPDATE hallazgos SET tipo = ?, evidencia = ? WHERE id = ?', tipoH, evidencia, previo.id);
      else if (!tipoH && previo) {
        if (uno('SELECT 1 FROM acciones WHERE hallazgo_id = ?', previo.id)) falla(400, 'Ese hallazgo ya tiene acciones; no se puede quitar');
        ejecutar('DELETE FROM hallazgos WHERE id = ?', previo.id); hallazgo_id = null;
      }
      return { ok: true, hallazgo_id };
    });
  }));

  // ================= Hallazgos y acciones =================
  const SELECT_ACC = `SELECT a.*, h.codigo hallazgo_codigo, h.tipo hallazgo_tipo, h.descripcion hallazgo, h.origen, h.proceso_id,
      p.nombre proceso, u.nombre responsable, v.nombre verificador,
      (SELECT COUNT(*) FROM actividades t WHERE t.accion_id = a.id) total_actividades,
      (SELECT COUNT(*) FROM actividades t WHERE t.accion_id = a.id AND t.cumplida = 1) actividades_cumplidas
    FROM acciones a JOIN hallazgos h ON h.id = a.hallazgo_id LEFT JOIN procesos p ON p.id = h.proceso_id
    LEFT JOIN usuarios u ON u.id = a.responsable_id LEFT JOIN usuarios v ON v.id = a.verificador_id`;
  const conVencida = a => ({ ...a, vencida: a.estado !== 'Cerrada' && a.fecha_compromiso && a.fecha_compromiso < hoy() ? 1 : 0 });
  const puedeGestionar = (a, u) => esCalidad(u) || a.responsable_id === u.id || (u.rol === 'lider_proceso' && a.proceso_id === u.proceso_id);
  const bitacora = (accionId, evento, comentario, u) =>
    ejecutar('INSERT INTO acciones_bitacora (accion_id, evento, comentario, usuario_id, fecha) VALUES (?,?,?,?,?)', accionId, evento, comentario || null, u.id, ahora());

  app.get('/api/hallazgos', r(req => {
    const q = req.query, w = ['h.empresa_id = ?'], p = [req.u.empresa_id];
    enLista(w, p, 'h.tipo', q.tipo); enLista(w, p, 'h.origen', q.origen); enLista(w, p, 'h.proceso_id', q.proceso);
    if (q.texto) { w.push('(h.descripcion LIKE ? OR h.codigo LIKE ?)'); p.push(`%${q.texto}%`, `%${q.texto}%`); }
    if (q.sin_accion === '1') w.push('NOT EXISTS (SELECT 1 FROM acciones a WHERE a.hallazgo_id = h.id)');
    return todos(`SELECT h.*, p.nombre proceso, e.codigo evaluacion_codigo, u.nombre registrado_por,
        (SELECT COUNT(*) FROM acciones a WHERE a.hallazgo_id = h.id) total_acciones,
        (SELECT COUNT(*) FROM acciones a WHERE a.hallazgo_id = h.id AND a.estado = 'Cerrada') acciones_cerradas
      FROM hallazgos h LEFT JOIN procesos p ON p.id = h.proceso_id LEFT JOIN evaluaciones e ON e.id = h.evaluacion_id
      LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE ${w.join(' AND ')} ORDER BY h.id DESC`, ...p);
  }));

  // Hallazgos de otras fuentes (quejas, indicadores, riesgos, producto no conforme…)
  app.post('/api/hallazgos', r(req => {
    const b = req.body, u = req.u;
    if (u.rol === 'consulta') falla(403, 'Los usuarios de consulta no registran hallazgos');
    if (!ORIGENES.includes(b.origen)) falla(400, 'Origen inválido');
    if (!['No conformidad mayor', 'No conformidad menor', 'Observación', 'Oportunidad de mejora'].includes(b.tipo)) falla(400, 'Tipo de hallazgo inválido');
    if (!String(b.descripcion || '').trim() || !b.proceso_id) falla(400, 'Proceso y descripción son obligatorios');
    if (u.rol === 'lider_proceso' && Number(b.proceso_id) !== u.proceso_id) falla(403, 'Solo registras hallazgos de tu proceso');
    return { id: crearHallazgo({ ...b, evaluacion_id: null, item_id: null }, u) };
  }));

  app.get('/api/acciones', r(req => {
    const q = req.query, w = ['a.empresa_id = ?'], p = [req.u.empresa_id];
    enLista(w, p, 'a.estado', q.estado); enLista(w, p, 'a.tipo', q.tipo); enLista(w, p, 'h.proceso_id', q.proceso); enLista(w, p, 'h.origen', q.origen);
    if (q.mias === '1') { w.push('a.responsable_id = ?'); p.push(req.u.id); }
    if (q.texto) { w.push('(a.codigo LIKE ? OR h.descripcion LIKE ? OR a.causa_raiz LIKE ?)'); p.push(...Array(3).fill(`%${q.texto}%`)); }
    let out = todos(`${SELECT_ACC} WHERE ${w.join(' AND ')} ORDER BY a.estado = 'Cerrada', a.fecha_compromiso`, ...p).map(conVencida);
    if (q.vencidas === '1') out = out.filter(a => a.vencida);
    return out;
  }));

  app.get('/api/acciones/:id', r(req => {
    const a = uno(`${SELECT_ACC} WHERE a.id = ? AND a.empresa_id = ?`, req.params.id, req.u.empresa_id);
    if (!a) falla(404, 'Acción no encontrada');
    return {
      ...conVencida(a), puede_gestionar: puedeGestionar(a, req.u), puede_verificar: esCalidad(req.u),
      hallazgo_completo: uno(`SELECT h.*, e.codigo evaluacion_codigo FROM hallazgos h LEFT JOIN evaluaciones e ON e.id = h.evaluacion_id WHERE h.id = ?`, a.hallazgo_id),
      actividades: todos(`SELECT t.*, u.nombre responsable FROM actividades t LEFT JOIN usuarios u ON u.id = t.responsable_id
        WHERE accion_id = ? ORDER BY t.fecha, t.id`, a.id),
      bitacora: todos(`SELECT b.*, u.nombre usuario FROM acciones_bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
        WHERE accion_id = ? ORDER BY b.id DESC`, a.id),
    };
  }));

  app.post('/api/acciones', r(req => {
    const b = req.body, u = req.u;
    const h = uno('SELECT * FROM hallazgos WHERE id = ? AND empresa_id = ?', b.hallazgo_id, u.empresa_id);
    if (!h) falla(404, 'Hallazgo no encontrado');
    if (!esCalidad(u) && !(u.rol === 'lider_proceso' && h.proceso_id === u.proceso_id)) falla(403, 'Solo Calidad o el líder del proceso abren acciones');
    if (!['Corrección', 'Acción correctiva', 'Acción de mejora'].includes(b.tipo)) falla(400, 'Tipo de acción inválido');
    if (h.tipo.startsWith('No conformidad') && b.tipo === 'Acción de mejora') falla(400, 'Una no conformidad requiere acción correctiva o corrección');
    if (!b.fecha_compromiso) falla(400, 'Define la fecha de compromiso');
    const sigla = h.proceso_id ? uno('SELECT sigla FROM procesos WHERE id = ?', h.proceso_id).sigla : 'GEN';
    return transaccion(() => {
      const id = Number(ejecutar(`INSERT INTO acciones (empresa_id, codigo, hallazgo_id, tipo, correccion, responsable_id, fecha_compromiso, creado)
        VALUES (?,?,?,?,?,?,?,?)`, u.empresa_id, consecutivo('acciones', `AC-${sigla}-`), h.id, b.tipo, b.correccion,
        b.responsable_id || u.id, b.fecha_compromiso, ahora()).lastInsertRowid);
      bitacora(id, 'Acción abierta', null, u);
      return { id };
    });
  }));

  function cargarAccion(req) {
    const a = uno(`${SELECT_ACC} WHERE a.id = ? AND a.empresa_id = ?`, req.params.id, req.u.empresa_id);
    if (!a) falla(404, 'Acción no encontrada');
    return a;
  }

  // Análisis de causa y datos generales (antes de cerrar)
  app.put('/api/acciones/:id', r(req => {
    const a = cargarAccion(req), b = req.body;
    if (!puedeGestionar(a, req.u)) falla(403, 'Solo el responsable, el líder del proceso o Calidad editan la acción');
    if (a.estado === 'Cerrada') falla(400, 'La acción está cerrada');
    if (a.estado !== 'Análisis' && (b.causa_raiz ?? a.causa_raiz) !== a.causa_raiz)
      falla(400, 'La causa raíz solo se cambia en la etapa de análisis');
    ejecutar(`UPDATE acciones SET correccion = ?, metodo_causa = ?, analisis_causa = ?, causa_raiz = ?, responsable_id = ?, fecha_compromiso = ? WHERE id = ?`,
      b.correccion ?? a.correccion, b.metodo_causa ?? a.metodo_causa, b.analisis_causa ?? a.analisis_causa, b.causa_raiz ?? a.causa_raiz,
      b.responsable_id || a.responsable_id, b.fecha_compromiso || a.fecha_compromiso, a.id);
    if (b.fecha_compromiso && b.fecha_compromiso !== a.fecha_compromiso)
      bitacora(a.id, 'Fecha de compromiso cambiada', `${a.fecha_compromiso} → ${b.fecha_compromiso}`, req.u);
    return { ok: true };
  }));

  // Actividades del plan
  app.post('/api/acciones/:id/actividades', r(req => {
    const a = cargarAccion(req);
    if (!puedeGestionar(a, req.u)) falla(403, 'Solo el responsable, el líder del proceso o Calidad planean actividades');
    if (!['Análisis', 'Ejecución'].includes(a.estado)) falla(400, 'Las actividades se planean en análisis o ejecución');
    if (!String(req.body.descripcion || '').trim() || !req.body.fecha) falla(400, 'Descripción y fecha son obligatorias');
    return { id: Number(ejecutar('INSERT INTO actividades (accion_id, descripcion, responsable_id, fecha) VALUES (?,?,?,?)',
      a.id, req.body.descripcion.trim(), req.body.responsable_id || a.responsable_id, req.body.fecha).lastInsertRowid) };
  }));
  app.put('/api/acciones/:id/actividades/:tid', r(req => {
    const a = cargarAccion(req);
    const t = uno('SELECT * FROM actividades WHERE id = ? AND accion_id = ?', req.params.tid, a.id);
    if (!t) falla(404, 'Actividad no encontrada');
    if (!puedeGestionar(a, req.u) && t.responsable_id !== req.u.id) falla(403, 'Solo el responsable de la actividad o de la acción la reportan');
    if (a.estado !== 'Ejecución') falla(400, 'Las actividades se reportan con la acción en ejecución');
    const cumplida = req.body.cumplida ? 1 : 0;
    if (cumplida && !String(req.body.evidencia || '').trim()) falla(400, 'Adjunta la evidencia de cumplimiento');
    ejecutar('UPDATE actividades SET cumplida = ?, evidencia = ?, fecha_cumplida = ? WHERE id = ?', cumplida, req.body.evidencia, cumplida ? hoy() : null, t.id);
    if (cumplida) bitacora(a.id, 'Actividad cumplida', t.descripcion, req.u);
    return { ok: true };
  }));
  app.delete('/api/acciones/:id/actividades/:tid', r(req => {
    const a = cargarAccion(req);
    if (!puedeGestionar(a, req.u)) falla(403, 'Sin permiso');
    if (a.estado !== 'Análisis') falla(400, 'Solo se eliminan actividades en análisis');
    ejecutar('DELETE FROM actividades WHERE id = ? AND accion_id = ?', req.params.tid, a.id);
    return { ok: true };
  }));

  // Flujo: Análisis → Ejecución → Verificación → Cerrada (o reabierta a Ejecución si no fue eficaz)
  app.post('/api/acciones/:id/avanzar', r(req => {
    const a = cargarAccion(req), u = req.u, b = req.body;
    return transaccion(() => {
      if (a.estado === 'Análisis') {
        if (!puedeGestionar(a, u)) falla(403, 'Sin permiso');
        if (a.tipo !== 'Corrección' && !String(a.causa_raiz || '').trim()) falla(400, 'Registra la causa raíz antes de ejecutar');
        if (!a.total_actividades) falla(400, 'Planea al menos una actividad');
        ejecutar("UPDATE acciones SET estado = 'Ejecución' WHERE id = ?", a.id);
        bitacora(a.id, 'Plan aprobado: pasa a ejecución', b.comentario, u);
      } else if (a.estado === 'Ejecución') {
        if (!puedeGestionar(a, u)) falla(403, 'Sin permiso');
        if (a.actividades_cumplidas < a.total_actividades) falla(400, 'Faltan actividades por cumplir');
        ejecutar("UPDATE acciones SET estado = 'Verificación' WHERE id = ?", a.id);
        bitacora(a.id, 'Enviada a verificación de eficacia', b.comentario, u);
      } else if (a.estado === 'Verificación') {
        if (!esCalidad(u)) falla(403, 'Solo Calidad verifica la eficacia');
        if (a.responsable_id === u.id) falla(403, 'El responsable de la acción no puede verificar su propia eficacia');
        if (!String(b.verificacion || '').trim()) falla(400, 'Describe cómo se verificó la eficacia');
        if (b.eficaz) {
          ejecutar("UPDATE acciones SET estado = 'Cerrada', eficaz = 1, verificacion = ?, verificador_id = ?, fecha_cierre = ? WHERE id = ?",
            b.verificacion, u.id, hoy(), a.id);
          bitacora(a.id, 'Cerrada: eficaz', b.verificacion, u);
        } else {
          ejecutar("UPDATE acciones SET estado = 'Ejecución', eficaz = 0, verificacion = ?, verificador_id = ?, reaperturas = reaperturas + 1 WHERE id = ?",
            b.verificacion, u.id, a.id);
          bitacora(a.id, 'No eficaz: reabierta a ejecución', b.verificacion, u);
        }
      } else falla(400, 'La acción ya está cerrada');
      return { ok: true };
    });
  }));

  // Estadísticas + valor sugerido para el indicador "Acciones correctivas"
  app.get('/api/acciones-estadisticas', r(req => {
    const e = req.u.empresa_id, anio = Number(req.query.anio) || new Date().getFullYear();
    const acc = todos(`${SELECT_ACC} WHERE a.empresa_id = ? AND substr(a.creado, 1, 4) = ?`, e, String(anio)).map(conVencida);
    const cerradas = acc.filter(a => a.estado === 'Cerrada');
    return {
      anio, total: acc.length, abiertas: acc.length - cerradas.length, cerradas: cerradas.length,
      eficaces: cerradas.filter(a => a.eficaz).length, vencidas: acc.filter(a => a.vencida).length,
      reaperturas: acc.reduce((s, a) => s + a.reaperturas, 0),
      eficacia: acc.length ? Math.round(cerradas.filter(a => a.eficaz).length / acc.length * 10000) / 100 : null,
      por_estado: ['Análisis', 'Ejecución', 'Verificación', 'Cerrada'].map(s => ({ estado: s, n: acc.filter(a => a.estado === s).length })),
      por_proceso: todos(`SELECT p.nombre, COUNT(h.id) hallazgos,
          SUM(h.tipo LIKE 'No conformidad%') nc FROM procesos p LEFT JOIN hallazgos h ON h.proceso_id = p.id AND substr(h.fecha, 1, 4) = ?
        WHERE p.empresa_id = ? GROUP BY p.id HAVING hallazgos > 0 ORDER BY hallazgos DESC`, String(anio), e),
    };
  }));

  // Pendientes para "Mi plan de trabajo"
  app.get('/api/auditorias-pendientes', r(req => {
    const u = req.u;
    return {
      acciones: todos(`${SELECT_ACC} WHERE a.empresa_id = ? AND a.estado != 'Cerrada'`, u.empresa_id).map(conVencida)
        .filter(a => a.responsable_id === u.id || (a.estado === 'Verificación' && esCalidad(u) && a.responsable_id !== u.id)),
      evaluaciones: todos(`${SELECT_EVAL} WHERE e.empresa_id = ? AND e.auditor_id = ? AND e.estado IN ('Planeación','Ejecución')`, u.empresa_id, u.id),
    };
  }));
};
