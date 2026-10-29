// Estructura de cargos (como «Cargos» de Almera, adaptada a OIKOS): cada cargo tiene área, número, jefe (otro cargo) y personas.
// Código visible: CAR-<sigla del área>-<número de dos cifras>, p. ej. CAR-GPR-27 (Operario de Gerencia de Producción).
// Si cambia la persona en un cargo, se reasigna el cargo y el resto (jefe, área) sigue igual.
const { db } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS cargos (
  id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas(id), area_sigla TEXT NOT NULL, area TEXT NOT NULL,
  numero INTEGER NOT NULL, nombre TEXT NOT NULL, jefe_id INTEGER REFERENCES cargos(id), activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, area_sigla, numero))`);
if (!db.prepare('PRAGMA table_info(usuarios)').all().some(c => c.name === 'cargo_id')) db.exec('ALTER TABLE usuarios ADD COLUMN cargo_id INTEGER REFERENCES cargos(id)');

const codigoDe = c => `CAR-${c.area_sigla}-${String(c.numero).padStart(2, '0')}`;
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Los 48 cargos de Metalcof tal como están en Almera: [sigla, área, número, cargo, jefe, personas]
const AREAS = { GAF: 'Gerencia Administrativa y Financiera', GC: 'Gerencia Comercial', GCAL: 'Gestión de Calidad', GG: 'Gerencia General',
  GPR: 'Gerencia de Producción', MTC: 'Metalcof' };
const CARGOS = [
  ['GG', 1, 'Gerente General', null, 'Nelson Rojas'],
  ['GG', 36, 'Asesor de Proyectos', 'Gerente General', 'Alfonso Andrade'],
  ['GG', 37, 'Asesor de Apoyo', 'Gerente General', 'Edwin Cortes'],
  ['GG', 41, 'Asesor Jurídico', 'Gerente General', 'Ferney Ramirez'],
  ['GG', 44, 'Revisor Fiscal', 'Gerente General', 'Omar Aponte'],
  ['GC', 2, 'Gerente Comercial', 'Gerente General', 'Alexander Rojas'],
  ['GC', 4, 'Líder Comercial y Marketing Digital', 'Gerente Comercial', 'Emmanuel Rojas'],
  ['GC', 5, 'Asistente Comercial', 'Líder Comercial y Marketing Digital', 'Ana Maria Pérez; Ibon Viviana Oliveros Cardozo'],
  ['GC', 6, 'Asesor Comercial', 'Líder Comercial y Marketing Digital', 'Gerardo Chavarro Avendaño; Laura Sofia Aros Escobar; Yonatan Alexis Suarez'],
  ['GC', 7, 'Líder de Identidad Corporativa', 'Gerente Comercial', 'Santiago Rojas'],
  ['GC', 8, 'Diseñador Gráfico', 'Líder de Identidad Corporativa', 'Daniel Rojas; Yiby Escobar'],
  ['GC', 9, 'Líder de Logística y Distribución', 'Gerente Comercial', ''],
  ['GC', 10, 'Operador de Logística y Distribución', 'Líder de Logística y Distribución', ''],
  ['GC', 11, 'Operario de Transporte', 'Líder de Logística y Distribución', ''],
  ['GC', 40, 'Asesor de Marketing Digital', 'Gerente Comercial', 'Jessica'],
  ['GCAL', 3, 'Coordinador de Calidad', 'Gerente General', ''],
  ['GCAL', 35, 'Coordinador Sistema Integral de Gestión', 'Gerente General', 'Lina Marcela Lozano Cortes'],
  ['GCAL', 48, 'Gestor de Calidad', 'Coordinador Sistema Integral de Gestión', ''],
  ['GAF', 12, 'Líder de Gestión Documental', null, 'Luis Fernando Pobre Trujillo'],
  ['GAF', 14, 'Coordinador de Talento Humano', 'Gerente General', 'María Paula Rojas Marquez'],
  ['GAF', 13, 'Líder de Seguridad y Salud en el Trabajo', 'Coordinador de Talento Humano', 'Tatiana Andrea Cardenas Fuentes'],
  ['GAF', 15, 'Asistente de Talento Humano', 'Coordinador de Talento Humano', 'Aura Yueidy Motta Yosa'],
  ['GAF', 16, 'Auxiliar Documental', 'Coordinador de Talento Humano', ''],
  ['GAF', 17, 'Analista de Formación, Desarrollo y Calidad de Vida', 'Coordinador de Talento Humano', ''],
  ['GAF', 18, 'Psicólogo', 'Coordinador de Talento Humano', ''],
  ['GAF', 19, 'Auxiliar de Contratación', 'Coordinador de Talento Humano', ''],
  ['GAF', 20, 'Analista de Nómina', 'Coordinador de Talento Humano', ''],
  ['GAF', 33, 'Auxiliar de Servicios Generales', 'Coordinador de Talento Humano', 'Diana Marcela Cordoba Rivas'],
  ['GAF', 34, 'Tesorera', 'Gerente General', 'Laura Rivera'],
  ['GAF', 35, 'Auxiliar de Tesorería', 'Tesorera', ''],
  ['GAF', 36, 'Contadora', 'Gerente General', 'Adriana Bermeo'],
  ['GAF', 37, 'Auxiliar Contable', 'Contadora', ''],
  ['GPR', 38, 'Gerente de Producción', 'Gerente General', ''],
  ['GPR', 21, 'Jefe de Mantenimiento', 'Gerente de Producción', ''],
  ['GPR', 22, 'Auxiliar de Mantenimiento', 'Jefe de Mantenimiento', 'Julian Dussan'],
  ['GPR', 23, 'Operario de Maquinaria y Mantenimiento', 'Jefe de Mantenimiento', ''],
  ['GPR', 24, 'Jefe de Producción', 'Gerente de Producción', 'Luis Nuñez'],
  ['GPR', 25, 'Supervisor de Alistamiento y Calidad', 'Jefe de Producción', ''],
  ['GPR', 26, 'Operario Soldador', 'Jefe de Producción', ''],
  ['GPR', 27, 'Operario', 'Jefe de Producción', 'Anderson Campos; Anderson Santamaria; Brayan Cabrera; Brhanndon Rojas; Carlos Calle; Eder Garzón; Francisco Marchan; John Alver Polania Galvis; Juan Pablo Perdomo; Nancy Arredondo; Nicolas Barragan; Oliver Toro; Sebastian Nomelin; Yohan Jose Castillo Sucre'],
  ['GPR', 28, 'Líder de Almacén, Compras y Activos Fijos', 'Gerente de Producción', 'Cindy Johana Patiño Vanegas'],
  ['GPR', 29, 'Auxiliar de Almacén', 'Líder de Almacén, Compras y Activos Fijos', 'Angel Ignacio Martinez Navarro'],
  ['GPR', 30, 'Auxiliar de Compras y Activos Fijos', 'Líder de Almacén, Compras y Activos Fijos', ''],
  ['GPR', 31, 'Líder de Diseño y Desarrollo de Producto', 'Gerente de Producción', ''],
  ['GPR', 32, 'Líder de Desarrollo e Innovación de Proyectos', 'Gerente de Producción', 'Alex Ceron'],
  ['GPR', 42, 'Auxiliar de Logística y Distribución', 'Jefe de Producción', 'Maura Gomez'],
  ['GPR', 46, 'Diseñador Industrial', 'Gerente de Producción', 'Yulitza Suarez'],
  ['MTC', 47, 'Responsable del proceso de servicios generales', null, ''], // en Almera no tenía número de cargo: se le dio el 47, que estaba libre
];

// Primera carga: crea los cargos y asigna a las personas que ya existen como usuarios (por nombre; las que no coinciden se asignan a mano)
(function sembrar() {
  if (db.prepare('SELECT COUNT(*) n FROM cargos').get().n) return;
  const empresa = db.prepare('SELECT id FROM empresas ORDER BY id LIMIT 1').get();
  if (!empresa) return;
  const ins = db.prepare('INSERT INTO cargos (empresa_id, area_sigla, area, numero, nombre) VALUES (?,?,?,?,?)');
  const ids = {};
  db.exec('BEGIN');
  try {
    for (const [s, n, nombre] of CARGOS) ids[nombre] = Number(ins.run(empresa.id, s, AREAS[s], n, nombre).lastInsertRowid);
    for (const [, , nombre, jefe] of CARGOS) if (jefe) db.prepare('UPDATE cargos SET jefe_id = ? WHERE id = ?').run(ids[jefe], ids[nombre]);
    const usuarios = db.prepare('SELECT id, nombre FROM usuarios WHERE empresa_id = ? AND cargo_id IS NULL').all(empresa.id);
    for (const [, , nombre, , personas] of CARGOS)
      for (const p of String(personas || '').split(';').map(norm).filter(Boolean)) {
        const partes = p.split(' ');
        const u = usuarios.find(x => norm(x.nombre) === p) || usuarios.find(x => partes.every(w => norm(x.nombre).split(' ').includes(w)));
        if (u) db.prepare('UPDATE usuarios SET cargo_id = ?, cargo = ? WHERE id = ?').run(ids[nombre], nombre, u.id);
      }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
})();

module.exports = function (app, { uno, todos, ejecutar, r, falla, transaccion }) {
  const soloAdmin = u => { if (u.rol !== 'admin') falla(403, 'Solo el administrador gestiona los cargos'); };
  const cargar = (id, u) => uno('SELECT * FROM cargos WHERE id = ? AND empresa_id = ?', id, u.empresa_id) || falla(404, 'Cargo no encontrado');

  // Lista para la pestaña y para elegir el cargo de una persona (cualquier usuario con sesión puede leerla)
  app.get('/api/cargos', r(req => {
    const cargos = todos(`SELECT c.*, j.nombre jefe FROM cargos c LEFT JOIN cargos j ON j.id = c.jefe_id WHERE c.empresa_id = ?
      ORDER BY c.area_sigla, c.numero`, req.u.empresa_id);
    const personas = todos('SELECT id, nombre, correo, usuario, cargo_id, activo FROM usuarios WHERE empresa_id = ? AND cargo_id IS NOT NULL ORDER BY nombre', req.u.empresa_id);
    return cargos.map(c => ({ ...c, codigo: codigoDe(c), personas: personas.filter(p => p.cargo_id === c.id && p.activo).map(({ id, nombre, correo, usuario }) => ({ id, nombre, correo, usuario })) }));
  }));

  function validar(b, u, id = 0) {
    const area_sigla = String(b.area_sigla || '').trim().toUpperCase(), area = String(b.area || '').trim(), nombre = String(b.nombre || '').trim();
    if (!/^[A-Z]{2,6}$/.test(area_sigla)) falla(400, 'La sigla del área va de 2 a 6 letras (ej. GPR)');
    if (!area) falla(400, 'El nombre del área es obligatorio');
    if (!nombre) falla(400, 'El nombre del cargo es obligatorio');
    let numero = Number(b.numero);
    if (!b.numero) numero = uno('SELECT COALESCE(MAX(numero), 0) + 1 n FROM cargos WHERE empresa_id = ?', u.empresa_id).n; // el siguiente libre de la empresa
    if (!Number.isInteger(numero) || numero < 1 || numero > 999) falla(400, 'El número del cargo va de 1 a 999');
    if (uno('SELECT 1 FROM cargos WHERE empresa_id = ? AND area_sigla = ? AND numero = ? AND id != ?', u.empresa_id, area_sigla, numero, id))
      falla(400, `Ya existe el código ${codigoDe({ area_sigla, numero })}`);
    const jefe_id = Number(b.jefe_id) || null;
    if (jefe_id) {
      if (jefe_id === id) falla(400, 'Un cargo no puede ser su propio jefe');
      cargar(jefe_id, u);
      for (let j = jefe_id, n = 0; j && n < 100; n++) { // sin ciclos: el jefe no puede depender de este cargo
        if (j === id) falla(400, 'Ese jefe depende de este cargo: se formaría un ciclo');
        j = uno('SELECT jefe_id FROM cargos WHERE id = ?', j)?.jefe_id;
      }
    }
    const activo = b.activo === 0 || b.activo === '0' || b.activo === false ? 0 : 1;
    return { area_sigla, area, numero, nombre, jefe_id, activo };
  }

  app.post('/api/cargos', r(req => {
    soloAdmin(req.u);
    const d = validar(req.body, req.u);
    const id = Number(ejecutar('INSERT INTO cargos (empresa_id, area_sigla, area, numero, nombre, jefe_id, activo) VALUES (?,?,?,?,?,?,?)',
      req.u.empresa_id, d.area_sigla, d.area, d.numero, d.nombre, d.jefe_id, d.activo).lastInsertRowid);
    return { id, codigo: codigoDe(d) };
  }));

  app.put('/api/cargos/:id', r(req => {
    soloAdmin(req.u);
    const c = cargar(req.params.id, req.u), d = validar(req.body, req.u, c.id);
    transaccion(() => {
      ejecutar('UPDATE cargos SET area_sigla = ?, area = ?, numero = ?, nombre = ?, jefe_id = ?, activo = ? WHERE id = ?', d.area_sigla, d.area, d.numero, d.nombre, d.jefe_id, d.activo, c.id);
      ejecutar('UPDATE usuarios SET cargo = ? WHERE cargo_id = ?', d.nombre, c.id); // el nombre del cargo se ve en el perfil de cada persona
    });
    return { ok: true, codigo: codigoDe(d) };
  }));

  // Quiénes ocupan el cargo: se marcan las personas; si alguna tenía otro cargo, pasa a este
  app.put('/api/cargos/:id/personas', r(req => {
    soloAdmin(req.u);
    const c = cargar(req.params.id, req.u);
    const ids = [...new Set([].concat(req.body.usuarios ?? []).flatMap(x => String(x).split(',')).map(Number).filter(n => n > 0))];
    for (const id of ids) if (!uno('SELECT 1 FROM usuarios WHERE id = ? AND empresa_id = ?', id, req.u.empresa_id)) falla(400, 'Usuario inválido');
    transaccion(() => {
      ejecutar('UPDATE usuarios SET cargo_id = NULL, cargo = NULL WHERE cargo_id = ?', c.id); // quien sale del cargo queda sin cargo
      for (const id of ids) ejecutar('UPDATE usuarios SET cargo_id = ?, cargo = ? WHERE id = ?', c.id, c.nombre, id);
    });
    return { ok: true, personas: ids.length };
  }));
};
module.exports.codigoDe = codigoDe;
