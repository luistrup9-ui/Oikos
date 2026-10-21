// Administración: usuarios, claves e importación de datos desde CSV (exportado de Excel o de Almera).
const crypto = require('node:crypto');
const { hash, verificar } = require('./db');
const { TIPOS: TIPOS_RIESGO } = require('./riesgos');

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const ROLES = ['admin', 'lider_calidad', 'lider_proceso', 'consulta'];
const FRECUENCIAS = { Mensual: 12, Bimestral: 6, Trimestral: 4, Semestral: 2, Anual: 1 };

function generarClave() {
  const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do c = Array.from(crypto.randomBytes(10), b => a[b % a.length]).join('');
  while (!/[a-zA-Z]/.test(c) || !/\d/.test(c));
  return c;
}

// ---------- CSV ----------
function parsearCSV(texto) {
  texto = String(texto || '').replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/, 1)[0];
  const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], campo = '', comillas = false;
  const cerrarFila = () => { fila.push(campo); campo = ''; if (fila.some(x => x.trim())) filas.push(fila); fila = []; };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; cerrarFila(); }
    else campo += c;
  }
  cerrarFila();
  const [cab, ...datos] = filas;
  if (!cab) return { columnas: [], filas: [] };
  const columnas = cab.map(c => norm(c).replace(/\s+/g, '_'));
  return { columnas, filas: datos.map(f => Object.fromEntries(columnas.map((c, i) => [c, (f[i] ?? '').trim()]))) };
}
const celdaCSV = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const aCSV = (cols, filas) => '﻿' + [cols, ...filas].map(f => f.map(celdaCSV).join(';')).join('\r\n');

// ---------- Conversión de valores ----------
function numero(v, campo) {
  if (v === '' || v == null) return null;
  let t = String(v).replace('%', '').replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${campo}: “${v}” no es un número`);
  return n;
}
function entero(v, campo, min, max) {
  const n = numero(v, campo);
  if (n == null || !Number.isInteger(n) || n < min || n > max) throw new Error(`${campo} debe ser un entero entre ${min} y ${max}`);
  return n;
}
function fechaISO(v, campo) {
  if (!v) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v), y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) { d = m[1].padStart(2, '0'); mo = m[2].padStart(2, '0'); y = m[3]; }
  else throw new Error(`${campo}: “${v}” no es una fecha (usa AAAA-MM-DD o DD/MM/AAAA)`);
  const f = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (isNaN(f) || f.getUTCDate() !== Number(d)) throw new Error(`${campo}: “${v}” no es una fecha válida`);
  return `${y}-${mo}-${d}`;
}
const siNo = v => ['si', 'sí', 's', '1', 'x', 'true', 'yes'].includes(norm(v));

module.exports = function (app, { uno, todos, ejecutar, r, falla, transaccion, esCalidad, ahora }) {
  const soloAdmin = u => { if (u.rol !== 'admin') falla(403, 'Solo el administrador gestiona usuarios'); };
  const claveValida = (clave, usuario) => {
    clave = String(clave || '');
    if (clave.length < 8) falla(400, 'La clave debe tener al menos 8 caracteres');
    if (!/[a-zA-Z]/.test(clave) || !/\d/.test(clave)) falla(400, 'La clave debe mezclar letras y números');
    if (norm(clave) === norm(usuario)) falla(400, 'La clave no puede ser igual al usuario');
  };
  const otrosAdmins = id => uno("SELECT COUNT(*) n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id != ?", id).n;
  const tokenDe = req => (/(?:^|;\s*)sgi=([a-f0-9]+)/.exec(req.headers.cookie || '') || [])[1];

  // ---------- Usuarios ----------
  app.get('/api/usuarios', r(req => {
    soloAdmin(req.u);
    return todos(`SELECT u.id, u.usuario, u.nombre, u.cargo, u.rol, u.proceso_id, u.activo, u.debe_cambiar, p.nombre proceso
      FROM usuarios u LEFT JOIN procesos p ON p.id = u.proceso_id WHERE u.empresa_id = ? ORDER BY u.activo DESC, u.nombre`, req.u.empresa_id);
  }));

  function validarPerfil(b, empresaId) {
    if (!String(b.nombre || '').trim()) falla(400, 'El nombre es obligatorio');
    if (!ROLES.includes(b.rol)) falla(400, 'Rol inválido');
    if (b.rol === 'lider_proceso' && !b.proceso_id) falla(400, 'El líder de proceso necesita un proceso');
    if (b.proceso_id && !uno('SELECT 1 FROM procesos WHERE id = ? AND empresa_id = ?', b.proceso_id, empresaId)) falla(400, 'Proceso inválido');
  }

  app.post('/api/usuarios', r(req => {
    soloAdmin(req.u);
    const b = req.body, usuario = String(b.usuario || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) falla(400, 'El usuario va de 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo');
    if (uno('SELECT 1 FROM usuarios WHERE usuario = ?', usuario)) falla(400, 'Ese usuario ya existe');
    validarPerfil(b, req.u.empresa_id);
    if (b.clave) claveValida(b.clave, usuario);
    const clave = b.clave ? String(b.clave) : generarClave();
    const id = Number(ejecutar(`INSERT INTO usuarios (empresa_id, usuario, nombre, cargo, rol, proceso_id, clave, activo, debe_cambiar)
      VALUES (?,?,?,?,?,?,?,1,1)`, req.u.empresa_id, usuario, b.nombre.trim(), b.cargo, b.rol, b.proceso_id, hash(clave)).lastInsertRowid);
    return { id, clave_temporal: b.clave ? null : clave };
  }));

  app.put('/api/usuarios/:id', r(req => {
    soloAdmin(req.u);
    const t = uno('SELECT * FROM usuarios WHERE id = ? AND empresa_id = ?', req.params.id, req.u.empresa_id);
    if (!t) falla(404, 'Usuario no encontrado');
    const b = { rol: t.rol, activo: t.activo, ...req.body };
    validarPerfil(b, req.u.empresa_id);
    const activo = b.activo === 0 || b.activo === '0' || b.activo === false ? 0 : 1;
    if (t.id === req.u.id && !activo) falla(400, 'No puedes desactivar tu propia cuenta');
    if (t.activo && t.rol === 'admin' && (!activo || b.rol !== 'admin') && !otrosAdmins(t.id))
      falla(400, 'Debe quedar al menos un administrador activo');
    ejecutar('UPDATE usuarios SET nombre = ?, cargo = ?, rol = ?, proceso_id = ?, activo = ? WHERE id = ?',
      b.nombre.trim(), b.cargo, b.rol, b.proceso_id, activo, t.id);
    if (!activo || b.rol !== t.rol) ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', t.id);
    return { ok: true };
  }));

  app.post('/api/usuarios/:id/clave', r(req => {
    soloAdmin(req.u);
    const t = uno('SELECT * FROM usuarios WHERE id = ? AND empresa_id = ?', req.params.id, req.u.empresa_id);
    if (!t) falla(404, 'Usuario no encontrado');
    if (req.body.clave) claveValida(req.body.clave, t.usuario);
    const clave = req.body.clave ? String(req.body.clave) : generarClave();
    ejecutar('UPDATE usuarios SET clave = ?, debe_cambiar = 1 WHERE id = ?', hash(clave), t.id);
    ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', t.id);
    return { clave_temporal: req.body.clave ? null : clave };
  }));

  // Cambiar mi propia clave
  app.post('/api/yo/clave', r(req => {
    const u = uno('SELECT * FROM usuarios WHERE id = ?', req.u.id);
    if (!verificar(String(req.body.actual || ''), u.clave)) falla(400, 'La clave actual no es correcta');
    claveValida(req.body.nueva, u.usuario);
    if (req.body.nueva === req.body.actual) falla(400, 'La clave nueva debe ser distinta de la actual');
    ejecutar('UPDATE usuarios SET clave = ?, debe_cambiar = 0 WHERE id = ?', hash(String(req.body.nueva)), u.id);
    ejecutar('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?', u.id, tokenDe(req));
    return { ok: true };
  }));

  // ---------- Respaldos (solo administrador) ----------
  const respaldo = require('./backup');
  app.get('/api/respaldos', r(req => {
    soloAdmin(req.u);
    return { automatico: process.env.BACKUP_AUTO !== '0', hora: Number(process.env.BACKUP_HORA ?? 2),
      conservar: Math.max(1, Number(process.env.BACKUP_KEEP) || 30), archivos: respaldo.listar() };
  }));
  app.post('/api/respaldos', r(req => { soloAdmin(req.u); return respaldo.crearRespaldo(); }));
  app.get('/api/respaldos/:nombre', (req, res) => {
    try {
      soloAdmin(req.u);
      if (!respaldo.PATRON.test(req.params.nombre)) falla(400, 'Nombre de respaldo inválido');
      res.download(require('node:path').join(respaldo.BACKUP_DIR, req.params.nombre));
    } catch (e) { res.status(e.estado || 404).json({ error: e.message }); }
  });

  // ---------- Importación ----------
  const buscar = (lista, valor, campos) => { const v = norm(valor); return v && lista.find(x => campos.some(c => norm(x[c]) === v)); };
  const codigoLibre = (tabla, prefijo) => {
    let n = uno(`SELECT COUNT(*) n FROM ${tabla} WHERE codigo LIKE ?`, prefijo + '%').n + 1, c;
    do c = prefijo + String(n++).padStart(2, '0'); while (uno(`SELECT 1 FROM ${tabla} WHERE codigo = ?`, c));
    return c;
  };
  const persona = (ctx, v, campo) => {
    if (!v) return null;
    const x = buscar(ctx.usuarios, v, ['usuario', 'nombre']);
    if (!x) throw new Error(`${campo}: no existe el usuario “${v}”`);
    return x.id;
  };
  const elegir = (valor, opciones, campo) => {
    const x = opciones.find(o => norm(o) === norm(valor));
    if (!x) throw new Error(`${campo}: “${valor}” no es válido (${opciones.join(', ')})`);
    return x;
  };

  const IMPORTADORES = {
    usuarios: {
      titulo: 'Usuarios', soloAdmin: true,
      columnas: ['usuario', 'nombre', 'cargo', 'rol', 'proceso'], requeridas: ['usuario', 'nombre', 'rol'],
      ejemplo: ['jperez', 'Juan Pérez', 'Jefe de Producción', 'lider_proceso', 'Producción'],
      ayuda: 'rol: admin, lider_calidad, lider_proceso o consulta. El líder de proceso necesita proceso. A cada usuario se le genera una clave temporal.',
      preparar(f, ctx) {
        const usuario = f.usuario.toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw new Error('usuario: 3 a 30 caracteres (minúsculas, números, . - _)');
        if (uno('SELECT 1 FROM usuarios WHERE usuario = ?', usuario)) throw new Error(`el usuario “${usuario}” ya existe`);
        if (ctx.vistos.has(usuario)) throw new Error(`“${usuario}” está repetido en el archivo`);
        ctx.vistos.add(usuario);
        const alias = { administrador: 'admin', 'lider de calidad': 'lider_calidad', 'lider de proceso': 'lider_proceso' };
        const rol = alias[norm(f.rol)] || elegir(f.rol, ROLES, 'rol');
        const proceso = f.proceso ? buscar(ctx.procesos, f.proceso, ['nombre', 'sigla']) : null;
        if (f.proceso && !proceso) throw new Error(`proceso: no existe “${f.proceso}”`);
        if (rol === 'lider_proceso' && !proceso) throw new Error('el líder de proceso necesita proceso');
        return { usuario, nombre: f.nombre, cargo: f.cargo || null, rol, proceso_id: proceso?.id ?? null, resumen: `${usuario} · ${rol}` };
      },
      aplicar(d, ctx) {
        const clave = generarClave();
        ejecutar(`INSERT INTO usuarios (empresa_id, usuario, nombre, cargo, rol, proceso_id, clave, activo, debe_cambiar) VALUES (?,?,?,?,?,?,?,1,1)`,
          ctx.u.empresa_id, d.usuario, d.nombre, d.cargo, d.rol, d.proceso_id, hash(clave));
        ctx.claves.push({ usuario: d.usuario, nombre: d.nombre, clave_temporal: clave });
      },
    },

    documentos: {
      titulo: 'Listado maestro de documentos',
      columnas: ['codigo', 'nombre', 'tipo', 'clase', 'proceso', 'origen', 'version', 'fecha_documento', 'fecha_vencimiento', 'responsable', 'descripcion'],
      requeridas: ['nombre', 'tipo', 'clase', 'proceso'],
      ejemplo: ['PRO-PRO-01', 'Procedimiento de soldadura', 'Procedimiento', 'Procedimientos', 'Producción', 'Interno', '1', '2025-03-10', '2027-03-10', 'produccion', ''],
      ayuda: 'Los documentos entran como Vigentes (sin archivo: se adjunta al modificarlos). Si dejas el código vacío se genera. tipo, clase y proceso aceptan el nombre o la sigla.',
      preparar(f, ctx) {
        const tipo = buscar(ctx.tipos, f.tipo, ['nombre', 'sigla']); if (!tipo) throw new Error(`tipo: no existe “${f.tipo}”`);
        const clase = buscar(ctx.clases, f.clase, ['nombre', 'sigla']); if (!clase) throw new Error(`clase: no existe “${f.clase}”`);
        const proceso = buscar(ctx.procesos, f.proceso, ['nombre', 'sigla']); if (!proceso) throw new Error(`proceso: no existe “${f.proceso}”`);
        if (f.codigo) {
          if (uno('SELECT 1 FROM documentos WHERE codigo = ?', f.codigo)) throw new Error(`el código ${f.codigo} ya existe`);
          if (ctx.vistos.has(f.codigo)) throw new Error(`el código ${f.codigo} está repetido en el archivo`);
          ctx.vistos.add(f.codigo);
        }
        return { codigo: f.codigo || null, nombre: f.nombre, tipo_id: tipo.id, clase_id: clase.id, proceso, clase,
          origen: f.origen ? elegir(f.origen, ['Interno', 'Externo'], 'origen') : 'Interno',
          version: f.version ? entero(f.version, 'version', 1, 99) : 1,
          fecha_documento: fechaISO(f.fecha_documento, 'fecha_documento'), fecha_vencimiento: fechaISO(f.fecha_vencimiento, 'fecha_vencimiento'),
          responsable_id: persona(ctx, f.responsable, 'responsable'), descripcion: f.descripcion || null,
          resumen: `${f.codigo || '(código automático)'} · ${f.nombre}` };
      },
      aplicar(d, ctx) {
        const codigo = d.codigo || codigoLibre('documentos', `${d.proceso.sigla}-${d.clase.sigla}-`);
        const id = Number(ejecutar(`INSERT INTO documentos (empresa_id, codigo, nombre, tipo_id, clase_id, proceso_id, origen, descripcion, responsable_id,
            estado, version, fecha_documento, fecha_vencimiento, creado, modificado) VALUES (?,?,?,?,?,?,?,?,?,'VIGENTE',?,?,?,?,?)`,
          ctx.u.empresa_id, codigo, d.nombre, d.tipo_id, d.clase_id, d.proceso.id, d.origen, d.descripcion, d.responsable_id ?? ctx.u.id,
          d.version, d.fecha_documento ?? ahora().slice(0, 10), d.fecha_vencimiento, ahora(), ahora()).lastInsertRowid);
        ejecutar(`INSERT INTO bitacora (documento_id, version, transicion_id, estado_inicial, estado_final, usuario_id, comentario, fecha)
          VALUES (?,?,'importar',NULL,'VIGENTE',?,'Importado desde archivo',?)`, id, d.version, ctx.u.id, ahora());
      },
    },

    riesgos: {
      titulo: 'Matriz de riesgos',
      columnas: ['proceso', 'tipo', 'nombre', 'causas', 'consecuencias', 'probabilidad', 'impacto', 'tratamiento', 'responsable', 'descripcion'],
      requeridas: ['proceso', 'tipo', 'nombre', 'probabilidad', 'impacto'],
      ejemplo: ['Producción', 'Calidad', 'Producto no conforme por fallas en soldadura', 'Equipos sin mantenimiento', 'Reprocesos y quejas', '4', '4', 'Reducir', 'produccion', ''],
      ayuda: 'probabilidad e impacto de 1 a 5. tratamiento: Reducir, Aceptar, Evitar o Compartir. El código R-PROCESO-nn se genera solo.',
      preparar(f, ctx) {
        const proceso = buscar(ctx.procesos, f.proceso, ['nombre', 'sigla']); if (!proceso) throw new Error(`proceso: no existe “${f.proceso}”`);
        return { proceso, tipo: elegir(f.tipo, TIPOS_RIESGO, 'tipo'), nombre: f.nombre, causas: f.causas || null, consecuencias: f.consecuencias || null,
          probabilidad: entero(f.probabilidad, 'probabilidad', 1, 5), impacto: entero(f.impacto, 'impacto', 1, 5),
          tratamiento: f.tratamiento ? elegir(f.tratamiento, ['Reducir', 'Aceptar', 'Evitar', 'Compartir'], 'tratamiento') : 'Reducir',
          responsable_id: persona(ctx, f.responsable, 'responsable'), descripcion: f.descripcion || null,
          resumen: `${f.nombre} (${f.probabilidad}×${f.impacto})` };
      },
      aplicar(d, ctx) {
        ejecutar(`INSERT INTO riesgos (empresa_id, codigo, proceso_id, tipo, nombre, descripcion, causas, consecuencias, probabilidad, impacto,
            tratamiento, responsable_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, ctx.u.empresa_id, codigoLibre('riesgos', `R-${d.proceso.sigla}-`),
          d.proceso.id, d.tipo, d.nombre, d.descripcion, d.causas, d.consecuencias, d.probabilidad, d.impacto, d.tratamiento, d.responsable_id ?? ctx.u.id);
      },
    },

    controles: {
      titulo: 'Controles de riesgos',
      columnas: ['riesgo_codigo', 'descripcion', 'clasificacion', 'efectividad', 'mitiga_probabilidad', 'mitiga_impacto', 'frecuencia', 'documentado', 'responsable_gestion', 'responsable_revision'],
      requeridas: ['riesgo_codigo', 'descripcion', 'clasificacion'],
      ejemplo: ['R-PRO-01', 'Inspección de soldadura en cada lote', 'Detectivo', 'Fuerte', 'si', 'no', 'Por lote', 'si', 'produccion', 'calidad'],
      ayuda: 'El riesgo debe existir (importa primero la matriz). clasificacion: Preventivo, Detectivo o Correctivo. efectividad: Fuerte, Moderado o Débil. mitiga_*: si/no (al menos uno).',
      preparar(f, ctx) {
        const riesgo = uno('SELECT r.*, p.sigla FROM riesgos r JOIN procesos p ON p.id = r.proceso_id WHERE r.codigo = ? AND r.empresa_id = ? AND r.activo = 1', f.riesgo_codigo, ctx.u.empresa_id);
        if (!riesgo) throw new Error(`no existe el riesgo ${f.riesgo_codigo}`);
        const mp = siNo(f.mitiga_probabilidad), mi = siNo(f.mitiga_impacto);
        if (!mp && !mi) throw new Error('debe mitigar la probabilidad, el impacto o ambos (si/no)');
        return { riesgo, descripcion: f.descripcion, clasificacion: elegir(f.clasificacion, ['Preventivo', 'Detectivo', 'Correctivo'], 'clasificacion'),
          efectividad: f.efectividad ? elegir(f.efectividad, ['Fuerte', 'Moderado', 'Débil'], 'efectividad') : 'Moderado',
          mp: mp ? 1 : 0, mi: mi ? 1 : 0, frecuencia: f.frecuencia || null, documentado: siNo(f.documentado) ? 1 : 0,
          gestion: persona(ctx, f.responsable_gestion, 'responsable_gestion'), revision: persona(ctx, f.responsable_revision, 'responsable_revision'),
          resumen: `${f.riesgo_codigo} · ${f.descripcion.slice(0, 60)}` };
      },
      aplicar(d) {
        ejecutar(`INSERT INTO controles (riesgo_id, codigo, descripcion, clasificacion, mitiga_probabilidad, mitiga_impacto, efectividad, frecuencia,
            documentado, responsable_gestion_id, responsable_revision_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          d.riesgo.id, codigoLibre('controles', `C-${d.riesgo.sigla}-`), d.descripcion, d.clasificacion, d.mp, d.mi, d.efectividad, d.frecuencia,
          d.documentado, d.gestion, d.revision);
      },
    },

    mediciones: {
      titulo: 'Mediciones históricas de indicadores',
      columnas: ['indicador_codigo', 'anio', 'periodo', 'valor', 'numerador', 'denominador', 'analisis'],
      requeridas: ['indicador_codigo', 'anio', 'periodo'],
      ejemplo: ['IND-CCA-01', '2025', '3', '', '196', '200', ''],
      ayuda: 'periodo según la frecuencia (mensual 1-12, trimestral 1-4…). Da el valor, o numerador y denominador si el indicador es una razón. Si el periodo ya existe se reemplaza.',
      preparar(f, ctx) {
        const ind = uno('SELECT * FROM indicadores WHERE codigo = ? AND empresa_id = ?', f.indicador_codigo, ctx.u.empresa_id);
        if (!ind) throw new Error(`no existe el indicador ${f.indicador_codigo}`);
        const anio = entero(f.anio, 'anio', 2000, 2100), periodo = entero(f.periodo, 'periodo', 1, FRECUENCIAS[ind.frecuencia]);
        const clave = `${ind.id}/${anio}/${periodo}`;
        if (ctx.vistos.has(clave)) throw new Error('ese periodo está repetido en el archivo');
        ctx.vistos.add(clave);
        const num = numero(f.numerador, 'numerador'), den = numero(f.denominador, 'denominador'), val = numero(f.valor, 'valor');
        let valor;
        if (num != null && den != null) {
          if (!den) throw new Error('el denominador no puede ser cero');
          valor = Math.round(num / den * (ind.unidad === '%' ? 100 : 1) * 100) / 100;
        } else if (val != null) valor = val;
        else throw new Error('falta el valor (o numerador y denominador)');
        const previa = uno('SELECT valor FROM mediciones WHERE indicador_id = ? AND anio = ? AND periodo = ?', ind.id, anio, periodo);
        return { ind, anio, periodo, valor, num, den, analisis: f.analisis || null,
          resumen: `${f.indicador_codigo} ${anio}-${periodo}: ${valor}${previa ? ` (reemplaza ${previa.valor})` : ''}` };
      },
      aplicar(d, ctx) {
        ejecutar(`INSERT INTO mediciones (indicador_id, anio, periodo, numerador, denominador, valor, meta, analisis, usuario_id, fecha)
          VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (indicador_id, anio, periodo) DO UPDATE SET numerador = excluded.numerador,
          denominador = excluded.denominador, valor = excluded.valor, meta = excluded.meta, analisis = excluded.analisis,
          usuario_id = excluded.usuario_id, fecha = excluded.fecha`,
          d.ind.id, d.anio, d.periodo, d.num, d.den, d.valor, d.ind.meta, d.analisis, ctx.u.id, ahora());
      },
    },
  };

  app.get('/api/importar', r(req => {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad o el administrador importan datos');
    return Object.entries(IMPORTADORES).filter(([, i]) => !i.soloAdmin || req.u.rol === 'admin')
      .map(([id, i]) => ({ id, titulo: i.titulo, columnas: i.columnas, requeridas: i.requeridas, ayuda: i.ayuda }));
  }));

  function importador(req) {
    if (!esCalidad(req.u)) falla(403, 'Solo Calidad o el administrador importan datos');
    const i = IMPORTADORES[req.params.tipo];
    if (!i) falla(404, 'Tipo de importación desconocido');
    if (i.soloAdmin) soloAdmin(req.u);
    return i;
  }

  app.get('/api/importar/:tipo/plantilla', (req, res) => {
    try {
      const i = importador(req);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="plantilla-${req.params.tipo}.csv"`);
      res.send(aCSV(i.columnas, [i.ejemplo]));
    } catch (e) { res.status(e.estado || 500).json({ error: e.message }); }
  });

  // Revisa el archivo fila por fila; solo aplica si no hay ningún error (todo o nada)
  app.post('/api/importar/:tipo', r(req => {
    const imp = importador(req);
    const { columnas, filas } = parsearCSV(req.body.csv);
    if (!columnas.length) falla(400, 'El archivo está vacío');
    const faltantes = imp.requeridas.filter(c => !columnas.includes(c));
    if (faltantes.length) falla(400, `Faltan columnas obligatorias: ${faltantes.join(', ')}. Descarga la plantilla para ver el formato.`);
    if (!filas.length) falla(400, 'El archivo no tiene filas de datos');
    if (filas.length > 5000) falla(400, 'Máximo 5000 filas por archivo');

    const ctx = { u: req.u, vistos: new Set(), claves: [],
      procesos: todos('SELECT * FROM procesos WHERE empresa_id = ?', req.u.empresa_id), tipos: todos('SELECT * FROM tipos_documento'),
      clases: todos('SELECT * FROM clases_documento'), usuarios: todos('SELECT id, usuario, nombre FROM usuarios WHERE empresa_id = ? AND activo = 1', req.u.empresa_id) };
    const revisadas = filas.map((f, k) => {
      try {
        const vacio = imp.requeridas.find(c => !f[c]);
        if (vacio) throw new Error(`falta ${vacio}`);
        const d = imp.preparar(f, ctx);
        return { n: k + 2, ok: true, resumen: d.resumen, datos: d };
      } catch (e) { return { n: k + 2, ok: false, error: e.message }; }
    });
    const errores = revisadas.filter(x => !x.ok).length;
    const out = { total: filas.length, validas: filas.length - errores, errores, aplicado: false,
      filas: revisadas.map(({ n, ok, error, resumen }) => ({ n, ok, error, resumen })).slice(0, 500) };
    if (req.body.aplicar && !errores) {
      transaccion(() => revisadas.forEach(x => imp.aplicar(x.datos, ctx)));
      out.aplicado = true;
      if (ctx.claves.length) out.claves = ctx.claves;
    }
    return out;
  }));
};
