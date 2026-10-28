// Calendario de actividades de "Personal": reúne lo que tiene fecha y le corresponde a la persona,
// ya sea porque se lo asignaron a ella (responsable, integrante, asistente, auditor) o porque es de su proceso
// (indicadores y vencimiento de documentos). No guarda nada: se arma al consultar, así que se llena solo
// cuando se asigna algo y se vacía cuando se cierra.
const PERIODOS = { Mensual: 12, Bimestral: 6, Trimestral: 4, Semestral: 2, Anual: 1 };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const etiquetaPeriodo = (frecuencia, p) => frecuencia === 'Mensual' ? MESES[p - 1] : frecuencia === 'Anual' ? 'Año'
  : ({ Bimestral: 'B', Trimestral: 'T', Semestral: 'S' }[frecuencia] || 'P') + p;
const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(new Date(v + 'T12:00'));
const iso = d => d.toISOString().slice(0, 10);
const MAX_DIAS = 100; // un mes visible cabe de sobra; evita consultas gigantes

module.exports = function (app, { alcance, todos, falla, r }) {
  app.get('/api/calendario', r(req => {
    const { desde, hasta } = req.query, u = req.u;
    if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) falla(400, 'El rango de fechas no es válido');
    if ((new Date(hasta) - new Date(desde)) / 864e5 > MAX_DIAS) falla(400, `El rango no puede pasar de ${MAX_DIAS} días`);
    const hoy = iso(new Date()), eventos = [];
    const agregar = e => eventos.push({ hora_inicio: null, hora_fin: null, detalle: '', ...e, vencida: !e.terminada && e.fecha < hoy && e.tipo !== 'reunion' }); // una reunión pasada no está 'vencida'
    const procs = alcance.asignados(u), P = procs.length ? procs : [-1], M = P.map(() => '?').join(','); // -1 no coincide con ningún proceso: sin proceso no se recibe lo "de su proceso"

    // 1) Reuniones de los mecanismos de integración donde la persona es integrante o asistente
    todos(`SELECT a.id, a.codigo, a.fecha, a.hora_inicio, a.hora_fin, a.estado, m.nombre mecanismo
        FROM actas a JOIN mecanismos m ON m.id = a.mecanismo_id
       WHERE m.empresa_id = ? AND a.fecha BETWEEN ? AND ? AND a.estado <> 'Anulada'
         AND (EXISTS (SELECT 1 FROM mecanismo_integrantes i WHERE i.mecanismo_id = m.id AND i.usuario_id = ?)
           OR EXISTS (SELECT 1 FROM acta_asistentes s WHERE s.acta_id = a.id AND s.usuario_id = ?))`,
      u.empresa_id, desde, hasta, u.id, u.id).forEach(a => agregar({ tipo: 'reunion', titulo: a.mecanismo, detalle: a.codigo,
        fecha: a.fecha, hora_inicio: a.hora_inicio, hora_fin: a.hora_fin, terminada: a.estado === 'Cerrada', enlace: `#/acta/${a.id}` }));

    // 2) Compromisos de las actas de los que la persona es responsable
    todos(`SELECT c.id, c.nombre, c.fecha_fin fecha, c.avance, c.fecha_terminacion, a.codigo acta, m.nombre mecanismo
        FROM compromisos c JOIN compromiso_responsables cr ON cr.compromiso_id = c.id AND cr.usuario_id = ?
        LEFT JOIN actas a ON a.id = c.acta_id LEFT JOIN mecanismos m ON m.id = c.mecanismo_id
       WHERE c.fecha_fin BETWEEN ? AND ?`, u.id, desde, hasta)
      .forEach(c => agregar({ tipo: 'compromiso', titulo: c.nombre, detalle: [c.mecanismo, c.acta].filter(Boolean).join(' · '),
        fecha: c.fecha, terminada: c.avance >= 100 || !!c.fecha_terminacion, enlace: `#/compromiso/${c.id}` }));

    // 3) Actividades de las acciones correctivas y de mejora asignadas a la persona
    todos(`SELECT t.id, t.descripcion, t.fecha, t.cumplida, t.accion_id, ac.codigo
        FROM actividades t JOIN acciones ac ON ac.id = t.accion_id
       WHERE ac.empresa_id = ? AND t.responsable_id = ? AND t.fecha BETWEEN ? AND ?`, u.empresa_id, u.id, desde, hasta)
      .forEach(t => agregar({ tipo: 'actividad', titulo: t.descripcion, detalle: t.codigo, fecha: t.fecha, terminada: !!t.cumplida, enlace: `#/accion/${t.accion_id}` }));

    // 4) Fecha compromiso de las acciones de las que la persona es responsable o verificadora
    todos(`SELECT id, codigo, correccion, fecha_compromiso fecha, estado FROM acciones
       WHERE empresa_id = ? AND (responsable_id = ? OR verificador_id = ?) AND fecha_compromiso BETWEEN ? AND ?`, u.empresa_id, u.id, u.id, desde, hasta)
      .forEach(a => agregar({ tipo: 'accion', titulo: `Fecha compromiso de ${a.codigo}`, detalle: a.correccion || '', fecha: a.fecha,
        terminada: a.estado === 'Cerrada', enlace: `#/accion/${a.id}` }));

    // 5) Planes de acción: fin del plan
    todos(`SELECT id, nombre, fecha_fin fecha, avance, indicador_id FROM planes_accion
       WHERE empresa_id = ? AND responsable_id = ? AND fecha_fin BETWEEN ? AND ?`, u.empresa_id, u.id, desde, hasta)
      .forEach(p => agregar({ tipo: 'plan', titulo: `Plan de acción: ${p.nombre}`, fecha: p.fecha, terminada: p.avance >= 100,
        enlace: p.indicador_id ? `#/indicador/${p.indicador_id}` : '#/tablero' }));

    // 6) Evaluaciones: como auditor (inicio y fin) o por la agenda de los procesos que audita o que le toca atender
    const evaluaciones = todos(`SELECT id, codigo, nombre, fecha_inicio, fecha_fin, estado FROM evaluaciones
       WHERE empresa_id = ? AND auditor_id = ? AND (fecha_inicio BETWEEN ? AND ? OR fecha_fin BETWEEN ? AND ?)`, u.empresa_id, u.id, desde, hasta, desde, hasta);
    for (const e of evaluaciones) {
      const base = { tipo: 'evaluacion', detalle: e.codigo, terminada: e.estado === 'Terminada', enlace: `#/auditoria/${e.id}` };
      if (e.fecha_inicio >= desde && e.fecha_inicio <= hasta) agregar({ ...base, titulo: `Inicia: ${e.nombre}`, fecha: e.fecha_inicio });
      if (e.fecha_fin >= desde && e.fecha_fin <= hasta) agregar({ ...base, titulo: `Termina: ${e.nombre}`, fecha: e.fecha_fin });
    }
    todos(`SELECT ep.fecha, e.id, e.codigo, e.nombre, e.estado, p.nombre proceso
        FROM evaluacion_procesos ep JOIN evaluaciones e ON e.id = ep.evaluacion_id JOIN procesos p ON p.id = ep.proceso_id
       WHERE e.empresa_id = ? AND ep.fecha BETWEEN ? AND ? AND (ep.auditado_id = ? OR ep.proceso_id IN (${M}) OR e.auditor_id = ?)`,
      u.empresa_id, desde, hasta, u.id, ...P, u.id)
      .forEach(x => agregar({ tipo: 'evaluacion', titulo: `${x.nombre}: ${x.proceso}`, detalle: x.codigo, fecha: x.fecha, terminada: x.estado === 'Terminada', enlace: `#/auditoria/${x.id}` }));

    // 7) Vencimiento de los documentos vigentes que son de la persona o de su proceso
    todos(`SELECT id, codigo, nombre, fecha_vencimiento fecha FROM documentos
       WHERE empresa_id = ? AND estado = 'VIGENTE' AND fecha_vencimiento BETWEEN ? AND ? AND (responsable_id = ? OR proceso_id IN (${M}))`, u.empresa_id, desde, hasta, u.id, ...P)
      .forEach(d => agregar({ tipo: 'vencimiento', titulo: `Vence: ${d.nombre}`, detalle: d.codigo, fecha: d.fecha, terminada: false, enlace: `#/documento/${d.id}` }));

    // 8) Mediciones de indicadores: cada periodo se ubica en el último día del mes en que cierra
    const anios = [], a0 = +desde.slice(0, 4), a1 = +hasta.slice(0, 4);
    for (let a = a0; a <= a1; a++) anios.push(a);
    for (const i of todos(`SELECT id, codigo, nombre, frecuencia FROM indicadores WHERE empresa_id = ? AND activo = 1 AND (responsable_id = ? OR proceso_id IN (${M}))`, u.empresa_id, u.id, ...P)) {
      const n = PERIODOS[i.frecuencia]; if (!n) continue;
      for (const anio of anios) {
        const medidos = new Set(todos('SELECT periodo FROM mediciones WHERE indicador_id = ? AND anio = ? AND valor IS NOT NULL', i.id, anio).map(m => m.periodo));
        for (let p = 1; p <= n; p++) {
          const fecha = iso(new Date(Date.UTC(anio, p * 12 / n, 0)));
          if (fecha >= desde && fecha <= hasta) agregar({ tipo: 'medicion', titulo: `Medir: ${i.nombre} (${etiquetaPeriodo(i.frecuencia, p)})`, detalle: i.codigo, fecha, terminada: medidos.has(p), enlace: `#/indicador/${i.id}` });
        }
      }
    }
    return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99') || a.titulo.localeCompare(b.titulo));
  }));
};
