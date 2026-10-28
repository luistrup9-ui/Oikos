// Mecanismos de integración (comités, comités primarios y reuniones), como en Almera:
// configuración e integrantes, actas (planeación, desarrollo, compromisos), compromisos con
// seguimientos y reprogramaciones, arrastre de compromisos abiertos y estadísticas.
const path = require('node:path');
const fs = require('node:fs');
const { db } = require('./db');
const { xlsx, csv } = require('./xlsx');

db.exec(`
CREATE TABLE IF NOT EXISTS mecanismos (
  id INTEGER PRIMARY KEY, empresa_id INTEGER, tipo TEXT NOT NULL CHECK (tipo IN ('Comité','Comité Primario','Reunión')),
  nombre TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1, coordinador_id INTEGER REFERENCES usuarios(id),
  periodicidad TEXT CHECK (periodicidad IN ('Anual','Bimestral','Eventual','Mensual','Quincenal','Semanal','Semestral','Trimestral')),
  objetivo TEXT, miembros TEXT, funciones TEXT,
  indicar_lugar INTEGER DEFAULT 1, mostrar_tipo INTEGER DEFAULT 1, indicar_asistentes INTEGER DEFAULT 1, control_asistencia INTEGER DEFAULT 1,
  tiene_compromisos INTEGER DEFAULT 1, control_compromisos INTEGER DEFAULT 1, arrastrar_compromisos INTEGER DEFAULT 1,
  miembros_compromisos INTEGER DEFAULT 1, notificar_cierre INTEGER DEFAULT 1, dias_recordatorio INTEGER DEFAULT 1,
  codificacion TEXT NOT NULL DEFAULT 'Auto' CHECK (codificacion IN ('Auto','Manual')),
  patron TEXT DEFAULT '%C', padding INTEGER DEFAULT 3, consecutivo INTEGER NOT NULL DEFAULT 0,
  creado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS mecanismo_integrantes (
  id INTEGER PRIMARY KEY, mecanismo_id INTEGER REFERENCES mecanismos(id) ON DELETE CASCADE, usuario_id INTEGER REFERENCES usuarios(id),
  calidad TEXT NOT NULL DEFAULT 'Principal' CHECK (calidad IN ('Principal','Suplente')),
  privilegio TEXT NOT NULL DEFAULT 'Miembro' CHECK (privilegio IN ('Administrador','Administrador - Miembro','Miembro')),
  adiciona_actas INTEGER DEFAULT 0, UNIQUE (mecanismo_id, usuario_id));
CREATE TABLE IF NOT EXISTS actas (
  id INTEGER PRIMARY KEY, mecanismo_id INTEGER REFERENCES mecanismos(id) ON DELETE CASCADE, consecutivo INTEGER, codigo TEXT,
  fecha TEXT NOT NULL, hora_inicio TEXT, hora_fin TEXT, lugar TEXT,
  tipo_reunion TEXT DEFAULT 'Ordinaria' CHECK (tipo_reunion IN ('Ordinaria','Extraordinaria')),
  agenda TEXT, desarrollo TEXT, estado TEXT NOT NULL DEFAULT 'Abierta' CHECK (estado IN ('Abierta','Cerrada','Anulada')),
  autor_id INTEGER REFERENCES usuarios(id), creado TEXT DEFAULT CURRENT_TIMESTAMP, cerrada TEXT);
CREATE TABLE IF NOT EXISTS acta_asistentes (
  id INTEGER PRIMARY KEY, acta_id INTEGER REFERENCES actas(id) ON DELETE CASCADE, usuario_id INTEGER REFERENCES usuarios(id),
  nombre TEXT NOT NULL, cargo TEXT, area TEXT, asiste INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS acta_archivos (
  id INTEGER PRIMARY KEY, acta_id INTEGER REFERENCES actas(id) ON DELETE CASCADE, archivo TEXT, nombre TEXT, tamano INTEGER,
  parte TEXT DEFAULT 'Planeación', usuario_id INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS compromisos (
  id INTEGER PRIMARY KEY, acta_id INTEGER REFERENCES actas(id) ON DELETE CASCADE, mecanismo_id INTEGER REFERENCES mecanismos(id) ON DELETE CASCADE,
  numero INTEGER, nombre TEXT NOT NULL, descripcion TEXT, fecha_fin TEXT NOT NULL, fecha_fin_inicial TEXT,
  avance REAL NOT NULL DEFAULT 0, fecha_terminacion TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS compromiso_responsables (
  compromiso_id INTEGER REFERENCES compromisos(id) ON DELETE CASCADE, usuario_id INTEGER REFERENCES usuarios(id), PRIMARY KEY (compromiso_id, usuario_id));
CREATE TABLE IF NOT EXISTS compromiso_seguimientos (
  id INTEGER PRIMARY KEY, compromiso_id INTEGER REFERENCES compromisos(id) ON DELETE CASCADE, fecha TEXT NOT NULL,
  avance REAL NOT NULL, descripcion TEXT NOT NULL, archivo TEXT, archivo_nombre TEXT, usuario_id INTEGER, registrado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS compromiso_reprogramaciones (
  id INTEGER PRIMARY KEY, compromiso_id INTEGER REFERENCES compromisos(id) ON DELETE CASCADE, fecha_anterior TEXT, fecha_nueva TEXT NOT NULL,
  causa TEXT NOT NULL, usuario_id INTEGER, registrado TEXT DEFAULT CURRENT_TIMESTAMP);
`);

// Referencia al registro de origen en Almera (para importar sin duplicar)
for (const tabla of ['actas', 'compromisos', 'compromiso_seguimientos'])
  if (!db.prepare(`PRAGMA table_info(${tabla})`).all().some(c => c.name === 'almera_id')) db.exec(`ALTER TABLE ${tabla} ADD COLUMN almera_id INTEGER`);

const TIPOS = ['Comité', 'Comité Primario', 'Reunión'];
const PERIODICIDADES = ['Anual', 'Bimestral', 'Eventual', 'Mensual', 'Quincenal', 'Semanal', 'Semestral', 'Trimestral'];
const OPCIONES = ['indicar_lugar', 'mostrar_tipo', 'indicar_asistentes', 'control_asistencia', 'tiene_compromisos', 'control_compromisos',
  'arrastrar_compromisos', 'miembros_compromisos', 'notificar_cierre'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Mecanismos que Metalcof tiene hoy en Almera (sin actas: esas se registran en la réplica)
function sembrar() {
  if (db.prepare('SELECT COUNT(*) n FROM mecanismos').get().n) return;
  const ins = db.prepare('INSERT INTO mecanismos (empresa_id, tipo, nombre, periodicidad, objetivo, miembros, patron) VALUES (1,?,?,?,?,?,?)');
  [['Comité', 'Brigada de Emergencia', 'Eventual', null, null, 'BRIGADA-%C'],
   ['Comité', 'Comité Copasst', 'Mensual', 'Promover y vigilar el cumplimiento de las actividades de Seguridad y Salud en el Trabajo, identificando riesgos y proponiendo acciones preventivas.',
     '- Eder Garzón - Operarios\n- Maura Gómez - Aux. Logística y despachos\n- Laura Rivera - Tesorería\n- Adriana Bermeo - Contadora', 'COPASST%C'],
   ['Comité', 'Comité de Convivencia Laboral', 'Trimestral', null, null, 'CCL-%C'],
   ['Comité', 'Comité de Innovación', 'Mensual', null, null, 'INNOVACION-%C'],
   ['Comité', 'Comité de Mejoramiento Continuo', 'Mensual', null, null, 'CMC-%C'],
   ['Comité', 'Comité Gerencial', 'Mensual', 'Revisar el desempeño estratégico de la organización, analizar indicadores, tomar decisiones y hacer seguimiento a los planes de acción.',
     '- Nelson Rojas - Gerente General\n- Alexander Rojas - Gerente comercial\n- Marcela Lozano - Coordinador SIG', 'GERENCIAL-%C'],
   ['Comité', 'Plan de Acción 2026', 'Eventual', null, null, 'PA2026-%C'],
   ...['Comercial', 'Compras, Almacen y Activos Fijos', 'Contabilidad', 'Diseño Industrial', 'Gestión Documental y Archivo', 'Identidad Corporativa',
     'Mantenimiento e Infraestructura', 'Producción', 'Talento Humano y SST', 'Tesorería'].map(n => ['Comité Primario', n, 'Mensual', null, null, '%C']),
   ['Reunión', 'Comité de Convivencia Laboral (Informe)', 'Eventual', null, null, '%C'],
  ].forEach(m => ins.run(...m));
}
sembrar();

module.exports = function (app, { uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora, subida, DIR_ARCHIVOS }) {
  const hoy = () => ahora().slice(0, 10);
  const dias = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

  // ---------- Permisos ----------
  const integrante = (m, u) => uno('SELECT * FROM mecanismo_integrantes WHERE mecanismo_id = ? AND usuario_id = ?', m.id, u.id);
  const administra = (m, u) => esCalidad(u) || m.coordinador_id === u.id || /Administrador/.test(integrante(m, u)?.privilegio || '');
  const puedeActas = (m, u) => administra(m, u) || !!integrante(m, u)?.adiciona_actas;
  const puedeCompromisos = (m, u) => administra(m, u) || (!!m.miembros_compromisos && !!integrante(m, u));
  // Solo ve los mecanismos de los que hace parte (o que coordina); Calidad y administración ven todos
  const veMecanismo = (m, u) => esCalidad(u) || !!integrante(m, u) ||
    (m.coordinador_id ?? uno('SELECT coordinador_id FROM mecanismos WHERE id = ?', m.id)?.coordinador_id) === u.id;
  const asistenteDe = (acta, u) => !!uno('SELECT 1 FROM acta_asistentes WHERE acta_id = ? AND usuario_id = ?', acta.id, u.id);
  const responsableDe = (c, u) => !!uno('SELECT 1 FROM compromiso_responsables WHERE compromiso_id = ? AND usuario_id = ?', c.id, u.id);

  function cargarMecanismo(id, u, tieneAcceso = false) {
    const m = uno('SELECT * FROM mecanismos WHERE id = ? AND empresa_id = ?', id, u.empresa_id);
    if (!m) falla(404, 'Mecanismo no encontrado');
    if (!tieneAcceso && !veMecanismo(m, u)) falla(403, 'No haces parte de este mecanismo');
    return m;
  }
  function cargarActa(id, u) {
    const a = uno('SELECT * FROM actas WHERE id = ?', id);
    if (!a) falla(404, 'Acta no encontrada');
    return { acta: a, m: cargarMecanismo(a.mecanismo_id, u, asistenteDe(a, u)) }; // quien está convocado al acta la ve
  }
  function cargarCompromiso(id, u) {
    const c = uno('SELECT * FROM compromisos WHERE id = ?', id);
    if (!c) falla(404, 'Compromiso no encontrado');
    return { c, m: cargarMecanismo(c.mecanismo_id, u, responsableDe(c, u)) }; // quien es responsable del compromiso lo ve
  }
  const editable = a => { if (a.estado !== 'Abierta') falla(400, `El acta está ${a.estado.toLowerCase()}: reábrela para modificarla`); };

  // ---------- Compromisos: estado, días y avance ----------
  const SELECT_COMP = `SELECT c.*, a.codigo acta_codigo, a.fecha acta_fecha, m.nombre mecanismo, m.tipo mecanismo_tipo,
      (SELECT group_concat(u.nombre, ', ') FROM compromiso_responsables r JOIN usuarios u ON u.id = r.usuario_id WHERE r.compromiso_id = c.id) responsables,
      (SELECT group_concat(r.usuario_id) FROM compromiso_responsables r WHERE r.compromiso_id = c.id) responsables_ids,
      (SELECT COUNT(*) FROM compromiso_seguimientos s WHERE s.compromiso_id = c.id) n_seguimientos
    FROM compromisos c JOIN actas a ON a.id = c.acta_id JOIN mecanismos m ON m.id = c.mecanismo_id`;
  function conEstado(c) {
    const estado = c.fecha_terminacion ? 'Terminada' : c.n_seguimientos ? 'Ejecución' : 'Planeación';
    // Días: terminado → días de adelanto (+) o atraso (−) frente a la fecha fin; abierto y vencido → días de atraso (−)
    const d = c.fecha_terminacion ? dias(c.fecha_fin, c.fecha_terminacion) : hoy() > c.fecha_fin ? -dias(hoy(), c.fecha_fin) : 0;
    return { ...c, estado, dias: d, vencido: !c.fecha_terminacion && hoy() > c.fecha_fin,
      responsables_ids: String(c.responsables_ids || '').split(',').filter(Boolean).map(Number) };
  }
  const promedio = l => l.length ? l.reduce((s, x) => s + x, 0) / l.length : null;

  // Compromisos que muestra un acta: los suyos y, si el mecanismo arrastra, los abiertos de actas anteriores
  function compromisosDeActa(a, m) {
    const propios = todos(`${SELECT_COMP} WHERE c.acta_id = ? ORDER BY c.numero`, a.id).map(conEstado);
    const arrastrados = m.arrastrar_compromisos ? todos(`${SELECT_COMP} WHERE c.mecanismo_id = ? AND a.estado != 'Anulada'
      AND (a.fecha < ? OR (a.fecha = ? AND a.id < ?)) AND (c.fecha_terminacion IS NULL OR c.fecha_terminacion >= ?)
      ORDER BY a.fecha, c.numero`, m.id, a.fecha, a.fecha, a.id, a.fecha).map(c => ({ ...conEstado(c), arrastrado: true })) : [];
    const lista = [...propios, ...arrastrados];
    return { lista, avance_ponderado: promedio(lista.map(c => c.avance)) };
  }

  // Estadísticas de un mecanismo (o de un conjunto de actas)
  function estadisticas(mecanismoId) {
    const actas = todos("SELECT id FROM actas WHERE mecanismo_id = ? AND estado != 'Anulada'", mecanismoId).map(a => a.id);
    const comp = todos(`SELECT c.fecha_fin, c.fecha_terminacion FROM compromisos c JOIN actas a ON a.id = c.acta_id
      WHERE c.mecanismo_id = ? AND a.estado != 'Anulada'`, mecanismoId);
    const asis = uno(`SELECT COUNT(*) invitados, COALESCE(SUM(asiste), 0) asistentes FROM acta_asistentes s JOIN actas a ON a.id = s.acta_id
      WHERE a.mecanismo_id = ? AND a.estado != 'Anulada'`, mecanismoId);
    const cerradas = comp.filter(c => c.fecha_terminacion).length;
    const aTiempo = comp.filter(c => c.fecha_terminacion && c.fecha_terminacion <= c.fecha_fin).length;
    return { actas: actas.length, actividades: comp.length, cerradas, a_tiempo: aTiempo,
      cumplimiento: comp.length ? cerradas / comp.length * 100 : null,
      invitados: asis.invitados, asistentes: asis.asistentes, asistencia: asis.invitados ? asis.asistentes / asis.invitados * 100 : null };
  }
  function resumenActa(a) {
    const comp = todos('SELECT avance, fecha_terminacion FROM compromisos WHERE acta_id = ?', a.id);
    const asis = uno('SELECT COUNT(*) invitados, COALESCE(SUM(asiste), 0) asistentes FROM acta_asistentes WHERE acta_id = ?', a.id);
    return { ...a, compromisos: comp.length, asistencia: asis.invitados ? asis.asistentes / asis.invitados * 100 : null,
      cumplimiento: comp.length ? comp.filter(c => c.fecha_terminacion).length / comp.length * 100 : null };
  }

  // ---------- Mecanismos ----------
  const SELECT_MEC = `SELECT m.*, u.nombre coordinador, u.cargo coordinador_cargo,
      (SELECT COUNT(*) FROM actas a WHERE a.mecanismo_id = m.id AND a.estado != 'Anulada') n_actas FROM mecanismos m
    LEFT JOIN usuarios u ON u.id = m.coordinador_id`;
  const integrantesDe = id => todos(`SELECT i.*, u.nombre, u.cargo, u.usuario FROM mecanismo_integrantes i JOIN usuarios u ON u.id = i.usuario_id
    WHERE i.mecanismo_id = ? ORDER BY i.calidad, u.nombre`, id);

  app.get('/api/mecanismos', r(req => {
    const w = ['m.empresa_id = ?'], p = [req.u.empresa_id];
    const tipos = [].concat(req.query.tipo || []).filter(Boolean);
    if (tipos.length) { w.push(`m.tipo IN (${tipos.map(() => '?').join(',')})`); p.push(...tipos); }
    if (req.query.estado === 'activo') w.push('m.activo = 1'); else if (req.query.estado === 'inactivo') w.push('m.activo = 0');
    if (req.query.mios === '1') { w.push('(m.coordinador_id = ? OR EXISTS (SELECT 1 FROM mecanismo_integrantes i WHERE i.mecanismo_id = m.id AND i.usuario_id = ?))'); p.push(req.u.id, req.u.id); }
    return todos(`${SELECT_MEC} WHERE ${w.join(' AND ')} ORDER BY CASE m.tipo WHEN 'Comité' THEN 0 WHEN 'Comité Primario' THEN 1 ELSE 2 END, m.nombre`, ...p)
      .filter(m => veMecanismo(m, req.u))
      .map(m => ({ ...m, integrantes: integrantesDe(m.id), estadisticas: estadisticas(m.id), administra: administra(m, req.u) }));
  }));

  app.get('/api/mecanismos/:id', r(req => {
    const m = cargarMecanismo(req.params.id, req.u);
    const anio = req.query.anio;
    const actas = todos(`SELECT a.*, u.usuario autor_usuario, u.nombre autor FROM actas a LEFT JOIN usuarios u ON u.id = a.autor_id
      WHERE a.mecanismo_id = ? ${anio ? "AND substr(a.fecha, 1, 4) = ?" : ''} ORDER BY a.fecha DESC, a.id DESC`, ...(anio ? [m.id, anio] : [m.id])).map(resumenActa);
    const anios = todos("SELECT DISTINCT substr(fecha, 1, 4) anio FROM actas WHERE mecanismo_id = ? ORDER BY anio DESC", m.id).map(x => x.anio);
    // Estadísticas por sesión, para las gráficas de la pestaña Estadísticas
    const sesiones = todos("SELECT * FROM actas WHERE mecanismo_id = ? AND estado != 'Anulada' ORDER BY fecha", m.id).map(resumenActa)
      .map(a => ({ codigo: a.codigo, fecha: a.fecha, asistencia: a.asistencia, cumplimiento: a.cumplimiento, compromisos: a.compromisos }));
    return { ...m, integrantes: integrantesDe(m.id), actas, anios, sesiones, estadisticas: estadisticas(m.id),
      permisos: { administra: administra(m, req.u), actas: puedeActas(m, req.u), compromisos: puedeCompromisos(m, req.u) } };
  }));

  function guardarMecanismo(req, id) {
    const b = req.body;
    let actual = null;
    if (id) { actual = cargarMecanismo(id, req.u); if (!administra(actual, req.u)) falla(403, 'Solo los administradores del mecanismo lo modifican'); }
    else if (!esCalidad(req.u)) falla(403, 'Solo Calidad crea mecanismos de integración');
    if (!TIPOS.includes(b.tipo)) falla(400, 'Tipo no válido');
    if (!String(b.nombre || '').trim()) falla(400, 'El nombre es obligatorio');
    if (b.periodicidad && !PERIODICIDADES.includes(b.periodicidad)) falla(400, 'Periodicidad no válida');
    const campos = ['tipo', 'nombre', 'coordinador_id', 'periodicidad', 'objetivo', 'miembros', 'funciones', 'codificacion', 'patron', 'padding', 'dias_recordatorio'];
    const vals = [b.tipo, b.nombre.trim(), b.coordinador_id, b.periodicidad, b.objetivo, b.miembros, b.funciones,
      b.codificacion === 'Manual' ? 'Manual' : 'Auto', b.patron || '%C', Number(b.padding ?? 3), Number(b.dias_recordatorio ?? 1)];
    // Una opción que no llega conserva su valor (o el de por defecto, 1, al crear)
    const ops = OPCIONES.map(o => b[o] === undefined ? (actual ? actual[o] : 1) : b[o] ? 1 : 0);
    const activo = b.activo === undefined ? (actual ? actual.activo : 1) : b.activo ? 1 : 0;
    return transaccion(() => {
      if (id) ejecutar(`UPDATE mecanismos SET ${[...campos, ...OPCIONES, 'activo'].map(c => c + ' = ?').join(', ')} WHERE id = ?`, ...vals, ...ops, activo, id);
      else id = Number(ejecutar(`INSERT INTO mecanismos (empresa_id, ${[...campos, ...OPCIONES, 'activo'].join(', ')})
        VALUES (?${', ?'.repeat(campos.length + OPCIONES.length + 1)})`, req.u.empresa_id, ...vals, ...ops, activo).lastInsertRowid);
      if (Array.isArray(b.integrantes)) {
        ejecutar('DELETE FROM mecanismo_integrantes WHERE mecanismo_id = ?', id);
        for (const i of b.integrantes) {
          if (!uno('SELECT 1 FROM usuarios WHERE id = ? AND empresa_id = ?', i.usuario_id, req.u.empresa_id)) continue;
          ejecutar(`INSERT OR REPLACE INTO mecanismo_integrantes (mecanismo_id, usuario_id, calidad, privilegio, adiciona_actas) VALUES (?,?,?,?,?)`,
            id, i.usuario_id, i.calidad === 'Suplente' ? 'Suplente' : 'Principal',
            ['Administrador', 'Administrador - Miembro'].includes(i.privilegio) ? i.privilegio : 'Miembro', i.adiciona_actas ? 1 : 0);
        }
      }
      return { id: Number(id) };
    });
  }
  app.post('/api/mecanismos', r(req => guardarMecanismo(req)));
  app.put('/api/mecanismos/:id', r(req => guardarMecanismo(req, Number(req.params.id))));

  // ---------- Actas ----------
  function codigoActa(m, consecutivo, fecha) {
    const [y, mes] = fecha.split('-');
    return (m.patron || '%C').replace('%C', String(consecutivo).padStart(m.padding || 0, '0'))
      .replace('%Y', y).replace('%M', MESES[Number(mes) - 1]);
  }
  function validarActa(b, m) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) falla(400, 'La fecha del acta es obligatoria');
    if (b.hora_inicio && b.hora_fin && b.hora_fin < b.hora_inicio) falla(400, 'La hora de fin es anterior a la de inicio');
    if (m.codificacion === 'Manual' && !String(b.codigo || '').trim()) falla(400, 'Este mecanismo usa codificación manual: escribe el código del acta');
  }
  function guardarAsistentes(actaId, lista, empresaId) {
    ejecutar('DELETE FROM acta_asistentes WHERE acta_id = ?', actaId);
    for (const s of lista || []) {
      const u = s.usuario_id ? uno('SELECT nombre, cargo FROM usuarios WHERE id = ? AND empresa_id = ?', s.usuario_id, empresaId) : null;
      const nombre = String(s.nombre || u?.nombre || '').trim();
      if (!nombre) continue;
      ejecutar('INSERT INTO acta_asistentes (acta_id, usuario_id, nombre, cargo, area, asiste) VALUES (?,?,?,?,?,?)',
        actaId, u ? s.usuario_id : null, nombre, s.cargo ?? u?.cargo, s.area, s.asiste === false || s.asiste === 0 ? 0 : 1);
    }
  }

  app.post('/api/mecanismos/:id/actas', r(req => {
    const m = cargarMecanismo(req.params.id, req.u), b = req.body;
    if (!puedeActas(m, req.u)) falla(403, 'No tienes permiso para adicionar actas en este mecanismo');
    if (!m.activo) falla(400, 'El mecanismo está inactivo');
    validarActa(b, m);
    return transaccion(() => {
      const consecutivo = m.consecutivo + 1;
      const codigo = m.codificacion === 'Manual' ? b.codigo.trim() : codigoActa(m, consecutivo, b.fecha);
      ejecutar('UPDATE mecanismos SET consecutivo = ? WHERE id = ?', consecutivo, m.id);
      const id = Number(ejecutar(`INSERT INTO actas (mecanismo_id, consecutivo, codigo, fecha, hora_inicio, hora_fin, lugar, tipo_reunion, agenda, desarrollo, autor_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, m.id, consecutivo, codigo, b.fecha, b.hora_inicio, b.hora_fin, b.lugar,
        b.tipo_reunion === 'Extraordinaria' ? 'Extraordinaria' : 'Ordinaria', b.agenda, b.desarrollo, req.u.id).lastInsertRowid);
      // Si no mandan asistentes, se convocan los integrantes del mecanismo
      const lista = Array.isArray(b.asistentes) ? b.asistentes : integrantesDe(m.id).map(i => ({ usuario_id: i.usuario_id, asiste: 1 }));
      guardarAsistentes(id, lista, req.u.empresa_id);
      return { id, codigo };
    });
  }));

  app.get('/api/actas/:id', r(req => {
    const { acta, m } = cargarActa(req.params.id, req.u);
    const autor = uno('SELECT nombre, usuario FROM usuarios WHERE id = ?', acta.autor_id);
    const { lista, avance_ponderado } = compromisosDeActa(acta, m);
    const otras = todos('SELECT id, codigo, fecha FROM actas WHERE mecanismo_id = ? ORDER BY fecha DESC, id DESC', m.id);
    return { ...resumenActa(acta), autor: autor?.nombre, autor_usuario: autor?.usuario,
      mecanismo: { id: m.id, nombre: m.nombre, tipo: m.tipo, indicar_lugar: m.indicar_lugar, mostrar_tipo: m.mostrar_tipo,
        indicar_asistentes: m.indicar_asistentes, control_asistencia: m.control_asistencia, tiene_compromisos: m.tiene_compromisos },
      asistentes: todos('SELECT * FROM acta_asistentes WHERE acta_id = ? ORDER BY id', acta.id),
      archivos: todos(`SELECT f.id, f.nombre, f.tamano, f.parte, f.fecha, u.nombre usuario FROM acta_archivos f LEFT JOIN usuarios u ON u.id = f.usuario_id
        WHERE f.acta_id = ? ORDER BY f.id`, acta.id),
      compromisos_lista: lista, avance_ponderado, otras_actas: otras,
      permisos: { administra: administra(m, req.u), editar: acta.estado === 'Abierta' && (administra(m, req.u) || acta.autor_id === req.u.id),
        compromisos: acta.estado === 'Abierta' && puedeCompromisos(m, req.u), actas: puedeActas(m, req.u) } };
  }));

  app.put('/api/actas/:id', r(req => {
    const { acta, m } = cargarActa(req.params.id, req.u), b = req.body;
    editable(acta);
    if (!administra(m, req.u) && acta.autor_id !== req.u.id) falla(403, 'Solo el autor o un administrador edita el acta');
    validarActa({ ...b, codigo: b.codigo ?? acta.codigo }, m);
    transaccion(() => {
      ejecutar(`UPDATE actas SET codigo = ?, fecha = ?, hora_inicio = ?, hora_fin = ?, lugar = ?, tipo_reunion = ?, agenda = ?, desarrollo = ? WHERE id = ?`,
        m.codificacion === 'Manual' && b.codigo ? b.codigo.trim() : acta.codigo, b.fecha, b.hora_inicio, b.hora_fin, b.lugar,
        b.tipo_reunion === 'Extraordinaria' ? 'Extraordinaria' : 'Ordinaria', b.agenda, b.desarrollo, acta.id);
      if (Array.isArray(b.asistentes)) guardarAsistentes(acta.id, b.asistentes, req.u.empresa_id);
    });
    return { ok: true };
  }));

  // Cerrar, anular o reabrir (solo administradores del mecanismo)
  app.post('/api/actas/:id/estado', r(req => {
    const { acta, m } = cargarActa(req.params.id, req.u);
    if (!administra(m, req.u)) falla(403, 'Solo los administradores del mecanismo cierran, anulan o reabren actas');
    const destino = { cerrar: 'Cerrada', anular: 'Anulada', reabrir: 'Abierta' }[req.body.accion];
    if (!destino) falla(400, 'Acción no válida');
    if (destino === 'Abierta' && acta.estado === 'Abierta') falla(400, 'El acta ya está abierta');
    if (destino !== 'Abierta' && acta.estado !== 'Abierta') falla(400, `El acta ya está ${acta.estado.toLowerCase()}`);
    ejecutar('UPDATE actas SET estado = ?, cerrada = ? WHERE id = ?', destino, destino === 'Cerrada' ? ahora() : null, acta.id);
    return { ok: true, estado: destino };
  }));

  app.post('/api/actas/:id/archivos', subida.single('archivo'), r(req => {
    if (!req.file) falla(400, 'No llegó ningún archivo');
    try {
      const { acta, m } = cargarActa(req.params.id, req.u);
      editable(acta);
      if (!puedeActas(m, req.u) && acta.autor_id !== req.u.id) falla(403, 'No puedes adjuntar archivos a esta acta');
      ejecutar('INSERT INTO acta_archivos (acta_id, archivo, nombre, tamano, parte, usuario_id, fecha) VALUES (?,?,?,?,?,?,?)', acta.id,
        req.file.filename, req.file.originalname, req.file.size, req.body.parte === 'Desarrollo' ? 'Desarrollo' : 'Planeación', req.u.id, ahora());
      return { ok: true };
    } catch (e) { fs.unlink(req.file.path, () => {}); throw e; }
  }));
  app.get('/api/actas/:id/archivos/:fid', (req, res) => r(() => {
    const { acta } = cargarActa(req.params.id, req.u);
    const f = uno('SELECT * FROM acta_archivos WHERE id = ? AND acta_id = ?', req.params.fid, acta.id);
    if (!f) falla(404, 'Archivo no encontrado');
    res.download(path.join(DIR_ARCHIVOS, f.archivo), f.nombre);
  })(req, res));
  app.delete('/api/actas/:id/archivos/:fid', r(req => {
    const { acta, m } = cargarActa(req.params.id, req.u);
    editable(acta);
    if (!administra(m, req.u) && acta.autor_id !== req.u.id) falla(403, 'Solo el autor o un administrador quita archivos');
    const f = uno('SELECT * FROM acta_archivos WHERE id = ? AND acta_id = ?', req.params.fid, acta.id);
    if (f) { ejecutar('DELETE FROM acta_archivos WHERE id = ?', f.id); fs.unlink(path.join(DIR_ARCHIVOS, f.archivo), () => {}); }
    return { ok: true };
  }));

  // Listado global de actas (pestaña "Actas" de la administración) y su exportación
  function actasGlobal(req) {
    const w = ['m.empresa_id = ?'], p = [req.u.empresa_id];
    if (req.query.desde) { w.push('a.fecha >= ?'); p.push(req.query.desde); }
    if (req.query.hasta) { w.push('a.fecha <= ?'); p.push(req.query.hasta); }
    if (req.query.mecanismo) { w.push('a.mecanismo_id = ?'); p.push(req.query.mecanismo); }
    return todos(`SELECT a.*, m.nombre mecanismo, m.tipo, u.usuario autor_usuario,
        (SELECT COUNT(*) FROM acta_asistentes s WHERE s.acta_id = a.id) invitados,
        (SELECT COALESCE(SUM(asiste), 0) FROM acta_asistentes s WHERE s.acta_id = a.id) asistentes,
        (SELECT group_concat(nombre, ', ') FROM acta_asistentes s WHERE s.acta_id = a.id) invitados_nombres,
        (SELECT group_concat(nombre, ', ') FROM acta_asistentes s WHERE s.acta_id = a.id AND s.asiste = 1) asistentes_nombres,
        (SELECT COUNT(*) FROM acta_archivos f WHERE f.acta_id = a.id) n_archivos
      FROM actas a JOIN mecanismos m ON m.id = a.mecanismo_id LEFT JOIN usuarios u ON u.id = a.autor_id
      WHERE ${w.join(' AND ')} ORDER BY a.fecha DESC, a.id DESC`, ...p)
      .filter(a => veMecanismo({ id: a.mecanismo_id }, req.u) || asistenteDe(a, req.u))
      .map(a => ({ ...a, asistencia: a.invitados ? a.asistentes / a.invitados * 100 : null }));
  }
  app.get('/api/actas', r(req => actasGlobal(req)));
  app.get('/api/actas-exportar', (req, res) => r(() => {
    const lista = actasGlobal(req);
    const filas = [['Tipo', 'Mecanismo', 'ID', 'Acta/Consecutivo', 'Fecha', 'Hora inicio', 'Hora fin', 'Estado', 'Usuario', 'Lugar',
      'Invitados', '# Invitados', 'Asistentes', '# Asistentes', '% Asistencia', '# Archivos'],
      ...lista.map(a => [a.tipo, a.mecanismo, a.id, a.codigo, a.fecha, a.hora_inicio, a.hora_fin, a.estado, a.autor_usuario, a.lugar,
        a.invitados_nombres, a.invitados, a.asistentes_nombres, a.asistentes, a.asistencia == null ? null : Math.round(a.asistencia * 10) / 10, a.n_archivos])];
    const formato = req.query.formato === 'csv' ? 'csv' : 'xlsx';
    res.setHeader('Content-Disposition', `attachment; filename="actas.${formato}"`);
    if (formato === 'csv') res.type('text/csv; charset=utf-8').send(csv(filas));
    else res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(xlsx('Actas', filas, [14, 30, 6, 26, 11, 9, 9, 9, 14, 18, 40, 10, 40, 11, 11, 10]));
  })(req, res));

  // ---------- Compromisos ----------
  function validarCompromiso(b) {
    if (!String(b.nombre || '').trim()) falla(400, 'El nombre del compromiso es obligatorio');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_fin || '')) falla(400, 'La fecha fin es obligatoria');
    const resp = [].concat(b.responsables || []).map(Number).filter(Boolean);
    if (!resp.length) falla(400, 'Indica al menos un responsable');
    return resp;
  }
  function guardarResponsables(id, resp, empresaId) {
    ejecutar('DELETE FROM compromiso_responsables WHERE compromiso_id = ?', id);
    for (const u of resp) if (uno('SELECT 1 FROM usuarios WHERE id = ? AND empresa_id = ?', u, empresaId))
      ejecutar('INSERT OR IGNORE INTO compromiso_responsables (compromiso_id, usuario_id) VALUES (?,?)', id, u);
  }
  app.post('/api/actas/:id/compromisos', r(req => {
    const { acta, m } = cargarActa(req.params.id, req.u), b = req.body;
    editable(acta);
    if (!m.tiene_compromisos) falla(400, 'Este mecanismo no maneja compromisos');
    if (!puedeCompromisos(m, req.u)) falla(403, 'No puedes adicionar compromisos en este mecanismo');
    const resp = validarCompromiso(b);
    return transaccion(() => {
      const numero = uno('SELECT COALESCE(MAX(numero), 0) + 1 n FROM compromisos WHERE acta_id = ?', acta.id).n;
      const id = Number(ejecutar(`INSERT INTO compromisos (acta_id, mecanismo_id, numero, nombre, descripcion, fecha_fin, fecha_fin_inicial)
        VALUES (?,?,?,?,?,?,?)`, acta.id, m.id, numero, b.nombre.trim(), b.descripcion, b.fecha_fin, b.fecha_fin).lastInsertRowid);
      guardarResponsables(id, resp, req.u.empresa_id);
      return { id, numero };
    });
  }));
  app.put('/api/compromisos/:id', r(req => {
    const { c, m } = cargarCompromiso(req.params.id, req.u), b = req.body;
    editable(uno('SELECT * FROM actas WHERE id = ?', c.acta_id));
    if (!puedeCompromisos(m, req.u)) falla(403, 'No puedes modificar compromisos en este mecanismo');
    const resp = validarCompromiso({ ...b, fecha_fin: b.fecha_fin || c.fecha_fin });
    transaccion(() => {
      // La fecha fin solo cambia aquí mientras no haya seguimientos; después se reprograma
      const fecha = c.fecha_terminacion || uno('SELECT 1 FROM compromiso_seguimientos WHERE compromiso_id = ?', c.id) ? c.fecha_fin : b.fecha_fin || c.fecha_fin;
      ejecutar('UPDATE compromisos SET nombre = ?, descripcion = ?, fecha_fin = ?, fecha_fin_inicial = ? WHERE id = ?',
        b.nombre.trim(), b.descripcion, fecha, fecha === c.fecha_fin ? c.fecha_fin_inicial : fecha, c.id);
      guardarResponsables(c.id, resp, req.u.empresa_id);
    });
    return { ok: true };
  }));
  app.delete('/api/compromisos/:id', r(req => {
    const { c, m } = cargarCompromiso(req.params.id, req.u);
    editable(uno('SELECT * FROM actas WHERE id = ?', c.acta_id));
    if (!administra(m, req.u)) falla(403, 'Solo los administradores del mecanismo eliminan compromisos');
    if (uno('SELECT 1 FROM compromiso_seguimientos WHERE compromiso_id = ?', c.id)) falla(400, 'El compromiso ya tiene seguimientos; no se puede eliminar');
    ejecutar('DELETE FROM compromisos WHERE id = ?', c.id);
    return { ok: true };
  }));

  const actaAbierta = c => uno('SELECT estado FROM actas WHERE id = ?', c.acta_id)?.estado === 'Abierta';
  const esResponsable = (c, u) => !!uno('SELECT 1 FROM compromiso_responsables WHERE compromiso_id = ? AND usuario_id = ?', c.id, u.id);
  const puedeSeguir = (c, m, u) => esResponsable(c, u) || administra(m, u);

  app.get('/api/compromisos/:id', r(req => {
    const { c, m } = cargarCompromiso(req.params.id, req.u);
    const comp = conEstado(uno(`${SELECT_COMP} WHERE c.id = ?`, c.id));
    const ultimo = uno(`SELECT s.*, u.nombre usuario, u.cargo FROM compromiso_seguimientos s LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.compromiso_id = ? ORDER BY s.fecha DESC, s.id DESC`, c.id);
    return { ...comp, ultimo_seguimiento: ultimo,
      seguimientos: todos(`SELECT s.id, s.fecha, s.avance, s.descripcion, s.archivo_nombre, s.registrado, u.nombre usuario, u.cargo
        FROM compromiso_seguimientos s LEFT JOIN usuarios u ON u.id = s.usuario_id WHERE s.compromiso_id = ? ORDER BY s.fecha DESC, s.id DESC`, c.id),
      reprogramaciones: todos(`SELECT r.*, u.nombre usuario FROM compromiso_reprogramaciones r LEFT JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.compromiso_id = ? ORDER BY r.id DESC`, c.id),
      permisos: { seguimiento: !c.fecha_terminacion && puedeSeguir(c, m, req.u), reprogramar: !c.fecha_terminacion && puedeSeguir(c, m, req.u),
        editar: actaAbierta(c) && puedeCompromisos(m, req.u), eliminar: actaAbierta(c) && administra(m, req.u) && !comp.n_seguimientos } };
  }));

  // Seguimiento: porcentaje de avance acumulado (0–100). Con 100 % el compromiso queda terminado.
  app.post('/api/compromisos/:id/seguimientos', subida.single('archivo'), r(req => {
    try {
      const { c, m } = cargarCompromiso(req.params.id, req.u), b = req.body;
      if (c.fecha_terminacion) falla(400, 'La actividad ya fue registrada como terminada');
      if (!puedeSeguir(c, m, req.u)) falla(403, 'Solo los responsables del compromiso o los administradores registran seguimientos');
      const avance = Number(String(b.avance ?? '').replace(',', '.'));
      if (String(b.avance ?? '').trim() === '' || isNaN(avance)) falla(400, 'Porcentaje es requerido');
      if (avance < 0 || avance > 100) falla(400, 'El campo porcentaje debe ser un valor entre 0 y 100');
      if (!String(b.descripcion || '').trim()) falla(400, 'Describe el avance');
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : hoy();
      if (fecha > hoy()) falla(400, 'La fecha del seguimiento no puede ser futura');
      transaccion(() => {
        ejecutar(`INSERT INTO compromiso_seguimientos (compromiso_id, fecha, avance, descripcion, archivo, archivo_nombre, usuario_id) VALUES (?,?,?,?,?,?,?)`,
          c.id, fecha, avance, b.descripcion.trim(), req.file?.filename, req.file?.originalname, req.u.id);
        ejecutar('UPDATE compromisos SET avance = ?, fecha_terminacion = ? WHERE id = ?', avance, avance === 100 ? fecha : null, c.id);
      });
      return { ok: true, terminado: avance === 100 };
    } catch (e) { if (req.file) fs.unlink(req.file.path, () => {}); throw e; }
  }));
  app.get('/api/compromisos/:id/seguimientos/:sid/archivo', (req, res) => r(() => {
    const { c } = cargarCompromiso(req.params.id, req.u);
    const s = uno('SELECT * FROM compromiso_seguimientos WHERE id = ? AND compromiso_id = ?', req.params.sid, c.id);
    if (!s?.archivo) falla(404, 'Archivo no encontrado');
    res.download(path.join(DIR_ARCHIVOS, s.archivo), s.archivo_nombre);
  })(req, res));

  app.post('/api/compromisos/:id/reprogramar', r(req => {
    const { c, m } = cargarCompromiso(req.params.id, req.u), b = req.body;
    if (c.fecha_terminacion) falla(400, 'La actividad ya fue registrada como terminada');
    if (!puedeSeguir(c, m, req.u)) falla(403, 'Solo los responsables del compromiso o los administradores lo reprograman');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_nueva || '')) falla(400, 'Indica la nueva fecha de terminación planeada');
    if (!String(b.causa || '').trim()) falla(400, 'Indica la causa de la reprogramación');
    if (b.fecha_nueva === c.fecha_fin) falla(400, 'La nueva fecha es igual a la actual');
    transaccion(() => {
      ejecutar('INSERT INTO compromiso_reprogramaciones (compromiso_id, fecha_anterior, fecha_nueva, causa, usuario_id) VALUES (?,?,?,?,?)',
        c.id, c.fecha_fin, b.fecha_nueva, b.causa.trim(), req.u.id);
      ejecutar('UPDATE compromisos SET fecha_fin = ? WHERE id = ?', b.fecha_nueva, c.id);
    });
    return { ok: true };
  }));

  // Seguimiento de compromisos: por mecanismo, estado, fecha, acta o responsable
  app.get('/api/compromisos', r(req => {
    const w = ['m.empresa_id = ?', "a.estado != 'Anulada'"], p = [req.u.empresa_id];
    if (req.query.mecanismo) { w.push('c.mecanismo_id = ?'); p.push(req.query.mecanismo); }
    if (req.query.acta) { w.push('c.acta_id = ?'); p.push(req.query.acta); }
    if (req.query.mios === '1') { w.push('EXISTS (SELECT 1 FROM compromiso_responsables r WHERE r.compromiso_id = c.id AND r.usuario_id = ?)'); p.push(req.u.id); }
    if (req.query.op && req.query.fecha1) {
      if (req.query.op === '>') { w.push('c.fecha_fin >= ?'); p.push(req.query.fecha1); }
      else if (req.query.op === '<') { w.push('c.fecha_fin <= ?'); p.push(req.query.fecha1); }
      else if (req.query.op === 'entre' && req.query.fecha2) { w.push('c.fecha_fin BETWEEN ? AND ?'); p.push(req.query.fecha1, req.query.fecha2); }
    }
    let lista = todos(`${SELECT_COMP} WHERE ${w.join(' AND ')} ORDER BY c.fecha_fin, c.id`, ...p).map(conEstado)
      .filter(c => req.query.mios === '1' || veMecanismo({ id: c.mecanismo_id }, req.u) || responsableDe(c, req.u));
    const estados = [].concat(req.query.estado || []).filter(Boolean);
    if (estados.length) lista = lista.filter(c => estados.includes(c.estado));
    return lista;
  }));

  // Para "Mi plan de trabajo": mis mecanismos (árbol) y mis compromisos abiertos
  app.get('/api/mecanismos-pendientes', r(req => ({
    mecanismos: todos(`SELECT m.id, m.tipo, m.nombre FROM mecanismos m WHERE m.empresa_id = ? AND m.activo = 1
      ${esCalidad(req.u) ? '' : 'AND (m.coordinador_id = ? OR EXISTS (SELECT 1 FROM mecanismo_integrantes i WHERE i.mecanismo_id = m.id AND i.usuario_id = ?))'}
      ORDER BY m.tipo, m.nombre`, ...(esCalidad(req.u) ? [req.u.empresa_id] : [req.u.empresa_id, req.u.id, req.u.id])),
    compromisos: todos(`${SELECT_COMP} WHERE m.empresa_id = ? AND a.estado != 'Anulada' AND c.fecha_terminacion IS NULL
      AND EXISTS (SELECT 1 FROM compromiso_responsables r WHERE r.compromiso_id = c.id AND r.usuario_id = ?) ORDER BY c.fecha_fin`,
      req.u.empresa_id, req.u.id).map(conEstado),
  })));
};
module.exports.TIPOS = TIPOS;
module.exports.PERIODICIDADES = PERIODICIDADES;
