// Importa a la réplica las actas, asistentes, compromisos y seguimientos exportados de Almera.
//   node importar-almera-mecanismos.js <archivo.json>            → solo muestra lo que haría
//   node importar-almera-mecanismos.js <archivo.json> --aplicar  → lo guarda
// Se puede ejecutar varias veces: lo que ya está importado (por su ID de Almera) no se duplica.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { db, hash } = require('./db');
require('./mecanismos'); // asegura las tablas y las columnas almera_id

const [archivo, bandera] = process.argv.slice(2);
if (!archivo) { console.error('Uso: node importar-almera-mecanismos.js <archivo.json> [--aplicar]'); process.exit(1); }
const aplicar = bandera === '--aplicar';
const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const q = (sql, ...p) => db.prepare(sql).all(...p), uno = (sql, ...p) => db.prepare(sql).get(...p), run = (sql, ...p) => db.prepare(sql).run(...p);
const resumen = { personasNuevas: [], actas: 0, actasYa: 0, asistentes: 0, compromisos: 0, compromisosYa: 0, seguimientos: 0, integrantes: 0, avisos: [] };

// ---------- Personas: se buscan por nombre; las que no existen se crean sin clave utilizable ----------
const usuarios = q('SELECT id, usuario, nombre FROM usuarios WHERE empresa_id = 1');
const porNombre = new Map(usuarios.map(u => [norm(u.nombre), u.id]));
const usados = new Set(usuarios.map(u => u.usuario));
function usuarioDe(nombre) {
  const base = norm(nombre).split(' ').filter(Boolean);
  let u = (base[0] + '.' + (base[1] || '')).replace(/[^a-z.]/g, '').replace(/\.$/, '');
  for (let i = 2; usados.has(u); i++) u = u.replace(/\d*$/, '') + i;
  usados.add(u);
  return u;
}
function persona(nombre) {
  const k = norm(nombre);
  if (!k) return null;
  if (porNombre.has(k)) return porNombre.get(k);
  const info = datos.personas[nombre] || {};
  const usuario = usuarioDe(nombre);
  let id = -(resumen.personasNuevas.length + 1);
  if (aplicar) id = Number(run(`INSERT INTO usuarios (empresa_id, usuario, nombre, cargo, rol, clave, debe_cambiar) VALUES (1, ?, ?, ?, 'consulta', ?, 1)`,
    usuario, nombre.trim(), info.cargo || null, hash(crypto.randomBytes(24).toString('hex'))).lastInsertRowid);
  resumen.personasNuevas.push(`${nombre.trim()} (${usuario}${info.cargo ? ', ' + info.cargo : ''})`);
  porNombre.set(k, id);
  return id;
}

// ---------- Mecanismos: se asocian por nombre con los sembrados en la réplica ----------
const mecanismos = new Map(q('SELECT id, nombre, patron, padding, consecutivo FROM mecanismos WHERE empresa_id = 1').map(m => [norm(m.nombre), m]));
const mecDe = {};
for (const [almeraId, nombre] of Object.entries(datos.mecanismos)) {
  if (!nombre) continue;
  const m = mecanismos.get(norm(nombre));
  if (m) mecDe[almeraId] = m; else resumen.avisos.push(`Mecanismo sin pareja en la réplica: ${nombre}`);
}

const compromisos = new Map(datos.compromisos.map(c => [c.almera_id, c]));
const asignado = new Set();

db.exec('BEGIN');
try {
  // Las actas se cargan de la más antigua a la más reciente para que el consecutivo siga el orden real
  for (const a of [...datos.actas].sort((x, y) => (x.fecha + x.almera_id).localeCompare(y.fecha + y.almera_id))) {
    const m = mecDe[a.mecanismo_id];
    if (!m) { resumen.avisos.push(`Acta ${a.codigo}: su mecanismo no está en la réplica`); continue; }
    let actaId = uno('SELECT id FROM actas WHERE almera_id = ?', a.almera_id)?.id;
    if (actaId) resumen.actasYa++;
    else {
      const notas = [a.desarrollo, [...a.archivos_planeacion, ...a.archivos_desarrollo].length
        ? 'Archivos adjuntos en Almera: ' + [...a.archivos_planeacion, ...a.archivos_desarrollo].join('; ') : null].filter(Boolean).join('\n\n');
      m.consecutivo++;
      if (aplicar) {
        actaId = Number(run(`INSERT INTO actas (mecanismo_id, consecutivo, codigo, fecha, hora_inicio, hora_fin, lugar, tipo_reunion, agenda, desarrollo, estado, cerrada, almera_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, m.id, m.consecutivo, a.codigo, a.fecha, a.hora_inicio, a.hora_fin, a.lugar,
          a.tipo_reunion === 'Extraordinaria' ? 'Extraordinaria' : 'Ordinaria', a.agenda, notas || null,
          a.estado === 'Cerrada' || a.estado === 'Anulada' ? a.estado : 'Abierta', a.estado === 'Cerrada' ? a.fecha + ' 00:00:00' : null, a.almera_id).lastInsertRowid);
        run('UPDATE mecanismos SET consecutivo = ? WHERE id = ?', m.consecutivo, m.id);
      }
      resumen.actas++;
      for (const s of a.asistentes) {
        const uid = persona(s.n);
        if (aplicar) run('INSERT INTO acta_asistentes (acta_id, usuario_id, nombre, cargo, area, asiste) VALUES (?,?,?,?,?,?)', actaId, uid, s.n.trim(), s.c || null, s.a || null, s.s ? 1 : 0);
        resumen.asistentes++;
        // Quien asiste a las actas del mecanismo queda como integrante (miembro principal)
        if (aplicar && !uno('SELECT 1 FROM mecanismo_integrantes WHERE mecanismo_id = ? AND usuario_id = ?', m.id, uid)) {
          run(`INSERT INTO mecanismo_integrantes (mecanismo_id, usuario_id, calidad, privilegio) VALUES (?, ?, 'Principal', 'Miembro')`, m.id, uid);
          resumen.integrantes++;
        }
      }
    }
    // Compromisos: cada uno va al acta que Almera indica como su origen (los "arrastrados" no se repiten)
    for (const cid of a.compromisos) {
      const c = compromisos.get(cid);
      if (!c || asignado.has(cid)) continue;
      if (c.acta && norm(c.acta) !== norm(a.codigo)) continue;
      asignado.add(cid);
      if (uno('SELECT 1 FROM compromisos WHERE almera_id = ?', cid)) { resumen.compromisosYa++; continue; }
      const segs = [...c.seguimientos].sort((x, y) => (x.fecha || '').localeCompare(y.fecha || ''));
      // Almera admite seguimientos sin porcentaje: toman el último porcentaje conocido (o 0)
      let previo = 0;
      for (const s of segs) {
        if (s.avance == null || isNaN(s.avance)) { s.avance = previo; resumen.avisos.push(`Seguimiento sin porcentaje en Almera (se toma ${previo}%): ${a.codigo} · ${c.nombre} · ${s.fecha}`); }
        previo = s.avance;
      }
      const avance = segs.length ? segs[segs.length - 1].avance : 0;
      const terminacion = c.terminada ? (c.fecha_real || segs.find(s => s.avance === 100)?.fecha || c.fecha_fin) : null;
      let compId = -1;
      if (aplicar) compId = Number(run(`INSERT INTO compromisos (acta_id, mecanismo_id, numero, nombre, descripcion, fecha_fin, fecha_fin_inicial, avance, fecha_terminacion, almera_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, actaId, m.id, c.numero, c.nombre || '(sin nombre)', c.descripcion, c.fecha_fin || a.fecha, c.fecha_fin || a.fecha,
        c.terminada ? 100 : avance, terminacion, cid).lastInsertRowid);
      resumen.compromisos++;
      for (const n of c.responsables) { const uid = persona(n); if (aplicar) run('INSERT OR IGNORE INTO compromiso_responsables (compromiso_id, usuario_id) VALUES (?,?)', compId, uid); }
      if (!c.responsables.length) resumen.avisos.push(`Compromiso sin responsables: ${a.codigo} · ${c.nombre}`);
      for (const s of segs) {
        if (aplicar) run('INSERT INTO compromiso_seguimientos (compromiso_id, fecha, avance, descripcion, usuario_id) VALUES (?,?,?,?,?)',
          compId, s.fecha || a.fecha, s.avance, s.texto || '(sin descripción)', persona(s.usuario));
        resumen.seguimientos++;
      }
    }
  }
  // Compromisos que ninguna acta reclamó (su acta de origen no está en la exportación)
  for (const c of datos.compromisos) if (!asignado.has(c.almera_id)) resumen.avisos.push(`Compromiso sin acta de origen exportada: ${c.acta} · ${c.nombre}`);
  db.exec(aplicar ? 'COMMIT' : 'ROLLBACK');
} catch (e) { db.exec('ROLLBACK'); throw e; }

console.log(aplicar ? 'IMPORTACIÓN APLICADA' : 'SIMULACIÓN (nada se guardó; agrega --aplicar para importar)');
console.log(`Actas nuevas: ${resumen.actas} (ya estaban: ${resumen.actasYa}) · asistentes: ${resumen.asistentes}`);
console.log(`Compromisos nuevos: ${resumen.compromisos} (ya estaban: ${resumen.compromisosYa}) · seguimientos: ${resumen.seguimientos}`);
console.log(`Integrantes agregados: ${resumen.integrantes}`);
console.log(`Personas nuevas (${resumen.personasNuevas.length}, rol consulta, sin clave utilizable hasta que un administrador la asigne):`);
resumen.personasNuevas.forEach(p => console.log('  - ' + p));
if (resumen.avisos.length) { console.log('Avisos:'); resumen.avisos.forEach(a => console.log('  ! ' + a)); }
