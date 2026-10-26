// Importa a la réplica la caracterización de procesos y subprocesos exportada de Almera.
//   node importar-almera-procesos.js <archivo.json>            → solo muestra lo que haría
//   node importar-almera-procesos.js <archivo.json> --aplicar  → lo guarda
// Un proceso que ya se editó en la réplica (versión > 1) no se sobrescribe, salvo con --forzar.
const fs = require('node:fs');
const { db } = require('./db');
require('./procesos'); // asegura las columnas y tablas nuevas

const [archivo, ...banderas] = process.argv.slice(2);
if (!archivo) { console.error('Uso: node importar-almera-procesos.js <archivo.json> [--aplicar] [--forzar]'); process.exit(1); }
const aplicar = banderas.includes('--aplicar'), forzar = banderas.includes('--forzar');
const { procesos } = JSON.parse(fs.readFileSync(archivo, 'utf8'));

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const uno = (sql, ...p) => db.prepare(sql).get(...p), todos = (sql, ...p) => db.prepare(sql).all(...p), run = (sql, ...p) => db.prepare(sql).run(...p);
const ahora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const res = { emparejados: 0, creados: [], omitidos: [], secciones: 0, es: 0, docs: 0, indicadores: [], avisos: [] };

const siglaDe = (p) => (String(p.codigo || '').split('-')[1] || norm(p.nombre).split(' ').filter(w => w.length > 3).map(w => w[0]).join('').slice(0, 4) || 'SUB').toUpperCase();
const version = v => Number(String(v || '').match(/\d+/)?.[0]) || 1;
const fecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '') ? f : null;

db.exec('BEGIN');
try {
  const mapa = {}; // id de Almera → id en la réplica
  // 1) Procesos raíz (se emparejan por nombre) y luego subprocesos (se crean bajo su proceso)
  const ordenados = [...procesos.filter(p => !p.padre_almera), ...procesos.filter(p => p.padre_almera)];
  for (const a of ordenados) {
    let p = uno('SELECT * FROM procesos WHERE almera_id = ?', a.almera_id);
    if (!p && !a.padre_almera) p = todos('SELECT * FROM procesos WHERE empresa_id = 1 AND padre_id IS NULL').find(x => norm(x.nombre) === norm(a.nombre));
    if (!p && a.padre_almera) {
      const padre = mapa[a.padre_almera];
      p = padre && todos('SELECT * FROM procesos WHERE padre_id = ?', padre).find(x => norm(x.nombre) === norm(a.nombre));
      if (!p) {
        if (!padre) { res.avisos.push(`Subproceso sin proceso padre en la réplica: ${a.nombre}`); continue; }
        const cat = uno('SELECT categoria FROM procesos WHERE id = ?', padre).categoria;
        const id = aplicar ? Number(run(`INSERT INTO procesos (empresa_id, nombre, sigla, categoria, orden, padre_id, tipo) VALUES (1,?,?,?,?,?,?)`,
          a.nombre, siglaDe(a), cat, 0, padre, a.tipo).lastInsertRowid) : -(res.creados.length + 1);
        res.creados.push(`${a.tipo}: ${a.nombre} (${a.codigo || 'sin código'})`);
        p = { id, version: 1 };
      }
    } else if (p) res.emparejados++;
    if (!p) { res.avisos.push(`Proceso sin pareja en la réplica: ${a.nombre}`); continue; }
    mapa[a.almera_id] = p.id;
    if (p.version > 1 && !forzar) { res.omitidos.push(`${a.nombre} (ya tiene versión ${p.version} editada en la réplica)`); a.__omitir = true; continue; }
    if (!aplicar) { res.secciones += a.secciones.length; res.es += a.entradas_salidas.length; res.docs += a.documentacion.length; continue; }
    run('UPDATE procesos SET codigo = ?, fecha = ?, version = 1, almera_id = ?, tipo = ?, modificado = ? WHERE id = ?',
      a.codigo, fecha(a.fecha), a.almera_id, a.tipo, ahora(), p.id);
    run('DELETE FROM proceso_secciones WHERE proceso_id = ?', p.id);
    a.secciones.forEach((s, i) => { run('INSERT INTO proceso_secciones (proceso_id, orden, titulo, texto) VALUES (?,?,?,?)', p.id, i, s.titulo, s.texto || null); res.secciones++; });
    run('DELETE FROM proceso_documentacion WHERE proceso_id = ?', p.id);
    for (const d of a.documentacion) { run('INSERT INTO proceso_documentacion (proceso_id, clase, nombre) VALUES (?,?,?)', p.id, d.clase, d.nombre); res.docs++; }
  }
  // 2) Entradas y salidas (después, para poder enlazar los subprocesos ya creados)
  for (const a of procesos) {
    const pid = mapa[a.almera_id];
    if (!pid || a.__omitir) continue;
    if (aplicar) run('DELETE FROM proceso_es WHERE proceso_id = ?', pid);
    a.entradas_salidas.forEach((e, i) => {
      if (aplicar) run('INSERT INTO proceso_es (proceso_id, orden, actividad, ciclo, subproceso_id, entradas, salidas) VALUES (?,?,?,?,?,?,?)',
        pid, i, e.actividad, e.ciclo, e.subproceso_almera ? mapa[e.subproceso_almera] ?? null : null, JSON.stringify(e.entradas), JSON.stringify(e.salidas));
      if (aplicar) res.es++;
    });
  }
  // 3) Orden: cada proceso en su lugar y sus subprocesos justo después
  if (aplicar) {
    todos('SELECT id FROM procesos WHERE empresa_id = 1 AND padre_id IS NULL ORDER BY orden, id').forEach((p, i) => {
      run('UPDATE procesos SET orden = ? WHERE id = ?', (i + 1) * 100, p.id);
      todos('SELECT id FROM procesos WHERE padre_id = ? ORDER BY id', p.id).forEach((h, k) => run('UPDATE procesos SET orden = ? WHERE id = ?', (i + 1) * 100 + k + 1, h.id));
    });
    // Versión inicial en el historial
    for (const pid of Object.values(mapa)) if (!uno('SELECT 1 FROM proceso_versiones WHERE proceso_id = ?', pid))
      run('INSERT INTO proceso_versiones (proceso_id, version, fecha, comentario, contenido) VALUES (?, 1, ?, ?, ?)', pid, ahora(), 'Versión inicial importada de Almera',
        JSON.stringify({ secciones: todos('SELECT titulo, texto FROM proceso_secciones WHERE proceso_id = ? ORDER BY orden', pid) }));
  }
  // 4) Indicadores: se les pone el código real de Almera cuando coinciden por nombre
  //    y quedan en el proceso al que pertenecen en Almera
  const inds = todos('SELECT i.id, i.codigo, i.nombre, i.proceso_id, p.nombre proceso FROM indicadores i LEFT JOIN procesos p ON p.id = i.proceso_id WHERE i.empresa_id = 1');
  for (const a of procesos) for (const ai of a.indicadores) {
    const i = inds.find(x => norm(x.nombre) === norm(ai.nombre));
    if (!i) { res.avisos.push(`Indicador de Almera sin pareja en la réplica: ${ai.codigo} ${ai.nombre} (${a.nombre})`); continue; }
    const pid = mapa[a.almera_id];
    const mover = pid > 0 && i.proceso_id !== pid;
    if (i.codigo !== ai.codigo || mover) {
      if (aplicar) run('UPDATE indicadores SET codigo = ?, proceso_id = ? WHERE id = ?', ai.codigo, mover ? pid : i.proceso_id, i.id);
      res.indicadores.push(`${i.codigo} → ${ai.codigo} ${ai.nombre}${mover ? ` (pasa de ${i.proceso} a ${a.nombre})` : ''}`);
    }
  }
  db.exec(aplicar ? 'COMMIT' : 'ROLLBACK');
} catch (e) { db.exec('ROLLBACK'); throw e; }

console.log(aplicar ? 'IMPORTACIÓN APLICADA' : 'SIMULACIÓN (nada se guardó; agrega --aplicar para importar)');
console.log(`Procesos emparejados: ${res.emparejados} · subprocesos creados: ${res.creados.length} · secciones: ${res.secciones} · filas de entradas y salidas: ${res.es} · documentos de referencia: ${res.docs}`);
res.creados.forEach(c => console.log('  + ' + c));
if (res.omitidos.length) { console.log('Omitidos (usa --forzar para sobrescribir):'); res.omitidos.forEach(o => console.log('  = ' + o)); }
if (res.indicadores.length) { console.log('Códigos de indicadores actualizados:'); res.indicadores.forEach(x => console.log('  ~ ' + x)); }
if (res.avisos.length) { console.log('Avisos:'); res.avisos.forEach(a => console.log('  ! ' + a)); }
