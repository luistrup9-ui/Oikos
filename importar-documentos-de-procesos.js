// Convierte en documentos reales (estado Vigente) las referencias que trajo la importación de
// procesos desde Almera (tabla proceso_documentacion, ya en la base: no vuelve a tocar Almera).
// Casi todas esas referencias solo traen el código (ej. "ES-PRO-FOR-01"); cuando no se pudo separar
// un código y un título se guardan como "(sin confirmar)" para que alguien los complete después.
//   node importar-documentos-de-procesos.js            → solo muestra lo que haría
//   node importar-documentos-de-procesos.js --aplicar  → lo guarda
const { db } = require('./db');

const [bandera] = process.argv.slice(2);
const aplicar = bandera === '--aplicar';
const uno = (sql, ...p) => db.prepare(sql).get(...p), todos = (sql, ...p) => db.prepare(sql).all(...p), run = (sql, ...p) => db.prepare(sql).run(...p);
const ahora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const clases = new Map(todos('SELECT id, nombre FROM clases_documento').map(c => [c.nombre, c.id]));
const tipoRef = uno("SELECT id FROM tipos_documento WHERE nombre = 'Documento específico'").id;
// Un código de Almera es un primer "token" que termina en guion + número (ej. ES-PRO-FOR-07,
// SIN-DC-F-001); lo que sigue, si lo hay, es el título del documento.
const RE_CODIGO = /^(\S+-\d{1,4})(?:\s+(.*))?$/;

const res = { creados: 0, yaExistian: 0, duplicadosOmitidos: 0, sinClase: [], sinTitulo: 0 };
const vistos = new Set(); // (proceso_id, codigo) ya usado en esta corrida, para no duplicar

db.exec('BEGIN');
try {
  const refs = todos(`SELECT pd.id, pd.proceso_id, pd.clase, pd.nombre, p.sigla proceso_sigla, p.empresa_id FROM proceso_documentacion pd
    JOIN procesos p ON p.id = pd.proceso_id ORDER BY pd.proceso_id, pd.id`);
  let consecutivo = {};
  for (const r of refs) {
    const claseId = clases.get(r.clase);
    if (!claseId) { res.sinClase.push(`${r.clase} (${r.nombre})`); continue; }
    const m = r.nombre.match(RE_CODIGO);
    let codigo, nombre;
    if (m) { codigo = m[1]; nombre = m[2] || `${m[1]} (sin confirmar)`; if (!m[2]) res.sinTitulo++; }
    else {
      // Sin un patrón de código reconocible (ej. nombres de materia prima en Almacén): se genera uno propio
      const k = r.proceso_id + ':' + claseId;
      consecutivo[k] = (consecutivo[k] || 0) + 1;
      codigo = `${r.proceso_sigla}-REF-${String(consecutivo[k]).padStart(2, '0')}`;
      nombre = r.nombre;
    }
    const llave = r.proceso_id + '|' + codigo;
    if (vistos.has(llave)) { res.duplicadosOmitidos++; continue; }
    vistos.add(llave);
    if (uno('SELECT 1 FROM documentos WHERE codigo = ?', codigo)) { res.yaExistian++; continue; }
    if (aplicar) run(`INSERT INTO documentos (empresa_id, codigo, nombre, tipo_id, clase_id, proceso_id, origen, estado, version, creado, modificado)
      VALUES (?,?,?,?,?,?, 'Interno', 'VIGENTE', 1, ?, ?)`, r.empresa_id, codigo, nombre.trim(), tipoRef, claseId, r.proceso_id, ahora(), ahora());
    res.creados++;
  }
  db.exec(aplicar ? 'COMMIT' : 'ROLLBACK');
} catch (e) { db.exec('ROLLBACK'); throw e; }

console.log(aplicar ? 'IMPORTACIÓN APLICADA' : 'SIMULACIÓN (nada se guardó; agrega --aplicar para importar)');
console.log(`Documentos creados: ${res.creados} · ya existían: ${res.yaExistian} · duplicados omitidos: ${res.duplicadosOmitidos} · sin título real (quedó "sin confirmar"): ${res.sinTitulo}`);
if (res.sinClase.length) { console.log('Sin clase reconocida (no se crearon):'); [...new Set(res.sinClase)].forEach(x => console.log('  ! ' + x)); }
