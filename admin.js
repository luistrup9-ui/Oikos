// Administración: usuarios, claves e importación de datos desde CSV (exportado de Excel o de Almera).
const crypto = require('node:crypto');
const { hash, verificar } = require('./db');
const { TIPOS: TIPOS_RIESGO } = require('./riesgos');
const mail = require('./correo');

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const ROLES = ['admin', 'lider_calidad', 'lider_proceso', 'consulta'];
// Las claves internas no cambian (la base las exige); estos son los nombres que ve la gente
const ROL_ETIQUETA = { admin: 'Administrador', lider_calidad: 'Gestor de Calidad', lider_proceso: 'Líder', consulta: 'Colaborador' };
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
  // Se ingresa con el correo corporativo; `usuario` es un nombre corto interno que se deduce del correo y que también sirve para ingresar
  const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const limpiarCorreo = c => String(c ?? '').trim().toLowerCase();
  const correoLibre = (correo, idPropio = 0) => {
    if (!CORREO.test(correo) || correo.length > 120) falla(400, 'El correo no es válido (ejemplo: nombre@empresa.com)');
    if (uno('SELECT 1 FROM usuarios WHERE correo = ? AND id != ?', correo, idPropio)) falla(400, 'Ese correo ya pertenece a otro usuario');
  };
  const usuarioDesde = correo => {
    const base = norm(correo.split('@')[0]).replace(/[^a-z0-9._-]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 26).padEnd(3, 'x');
    let u = base, n = 2;
    while (uno('SELECT 1 FROM usuarios WHERE usuario = ?', u)) u = base + n++; // si ya existe se le agrega un número
    return u;
  };

  app.get('/api/usuarios', r(req => {
    soloAdmin(req.u);
    const marcados = {};
    for (const x of todos('SELECT up.usuario_id, up.proceso_id FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id WHERE u.empresa_id = ?', req.u.empresa_id))
      (marcados[x.usuario_id] ||= []).push(x.proceso_id);
    return todos(`SELECT u.id, u.usuario, u.correo, u.nombre, u.cargo, u.cargo_id, u.rol, u.proceso_id, u.activo, u.debe_cambiar, u.reinicio_solicitado, p.nombre proceso
      FROM usuarios u LEFT JOIN procesos p ON p.id = u.proceso_id WHERE u.empresa_id = ? ORDER BY u.activo DESC, u.nombre`, req.u.empresa_id)
      .map(u => ({ ...u, procesos: u.rol === 'lider_proceso' ? marcados[u.id] || [] : [] }));
  }));

  // El Líder lidera los procesos y subprocesos que el administrador le marque (usuario_procesos); los demás roles pueden tener un proceso de referencia
  const listaIds = v => [...new Set([].concat(v ?? []).flatMap(x => String(x).split(',')).map(Number).filter(n => n > 0))];
  const conSubprocesos = id => todos('SELECT id FROM procesos WHERE id = ? OR padre_id = ?', id, id).map(p => p.id);
  function validarPerfil(b, empresaId) {
    if (!String(b.nombre || '').trim()) falla(400, 'El nombre es obligatorio');
    if (!ROLES.includes(b.rol)) falla(400, 'Rol inválido');
    b.procesos = b.rol !== 'lider_proceso' ? [] : b.procesos !== undefined ? listaIds(b.procesos) : b.proceso_id ? conSubprocesos(Number(b.proceso_id)) : [];
    if (b.rol === 'lider_proceso' && !b.procesos.length) falla(400, 'Marca al menos un proceso que lidere');
    for (const id of [...b.procesos, ...(b.proceso_id ? [b.proceso_id] : [])])
      if (!uno('SELECT 1 FROM procesos WHERE id = ? AND empresa_id = ?', id, empresaId)) falla(400, 'Proceso inválido');
    // proceso principal (agenda, perfil): el primero marcado que no sea subproceso, o el primero
    if (b.rol === 'lider_proceso') b.proceso_id = (b.procesos.map(id => uno('SELECT id, padre_id FROM procesos WHERE id = ?', id)).find(p => !p.padre_id) || { id: b.procesos[0] }).id;
  }
  // Cargo: si viene cargo_id, el nombre del cargo sale de la tabla de cargos
  function resolverCargo(b, empresaId, actual = {}) {
    if (b.cargo_id === undefined) return { cargo_id: actual.cargo_id ?? null, cargo: b.cargo ?? actual.cargo ?? null };
    const id = Number(b.cargo_id) || null;
    if (!id) return { cargo_id: null, cargo: null };
    const c = uno('SELECT nombre FROM cargos WHERE id = ? AND empresa_id = ?', id, empresaId);
    if (!c) falla(400, 'Cargo inválido');
    return { cargo_id: id, cargo: c.nombre };
  }
  const guardarProcesos = (id, lista) => {
    ejecutar('DELETE FROM usuario_procesos WHERE usuario_id = ?', id);
    for (const p of lista) ejecutar('INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (?,?)', id, p);
  };

  app.post('/api/usuarios', r(req => {
    soloAdmin(req.u);
    const b = req.body, correo = limpiarCorreo(b.correo);
    correoLibre(correo);
    let usuario = String(b.usuario || '').trim().toLowerCase();
    if (usuario) {
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) falla(400, 'El usuario va de 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo');
      if (uno('SELECT 1 FROM usuarios WHERE usuario = ?', usuario)) falla(400, 'Ese usuario ya existe');
    } else usuario = usuarioDesde(correo);
    validarPerfil(b, req.u.empresa_id);
    if (b.clave) claveValida(b.clave, usuario);
    const clave = b.clave ? String(b.clave) : generarClave();
    const cg = resolverCargo(b, req.u.empresa_id);
    const id = Number(ejecutar(`INSERT INTO usuarios (empresa_id, usuario, correo, nombre, cargo, cargo_id, rol, proceso_id, clave, activo, debe_cambiar)
      VALUES (?,?,?,?,?,?,?,?,?,1,1)`, req.u.empresa_id, usuario, correo, b.nombre.trim(), cg.cargo, cg.cargo_id, b.rol, b.proceso_id || null, hash(clave)).lastInsertRowid);
    guardarProcesos(id, b.procesos);
    return { id, usuario, clave_temporal: b.clave ? null : clave };
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
    // Correo: sin tocar si no viene; quien ya tiene uno no puede quedar sin él
    let correo = t.correo;
    if (b.correo !== undefined) {
      const nuevo = limpiarCorreo(b.correo);
      if (!nuevo && t.correo) falla(400, 'El correo no se puede dejar vacío: es con el que ingresa');
      if (nuevo) { correoLibre(nuevo, t.id); correo = nuevo; }
    }
    const cg = resolverCargo(b, req.u.empresa_id, t);
    ejecutar('UPDATE usuarios SET nombre = ?, cargo = ?, cargo_id = ?, rol = ?, proceso_id = ?, activo = ?, correo = ? WHERE id = ?',
      b.nombre.trim(), cg.cargo, cg.cargo_id, b.rol, b.proceso_id || null, activo, correo, t.id);
    guardarProcesos(t.id, b.procesos);
    if (!activo || b.rol !== t.rol) ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', t.id);
    return { ok: true };
  }));

  // Atajo para la primera carga: a quien no tiene correo se le asigna usuario@dominio (el administrador corrige los que no coincidan)
  app.post('/api/usuarios/completar-correos', r(req => {
    soloAdmin(req.u);
    const dominio = String(req.body.dominio || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) falla(400, 'Escribe el dominio de la empresa, por ejemplo metalcof.co');
    const sin = todos('SELECT id, usuario FROM usuarios WHERE empresa_id = ? AND activo = 1 AND correo IS NULL', req.u.empresa_id);
    const omitidos = []; let actualizados = 0;
    transaccion(() => sin.forEach(u => {
      const correo = `${u.usuario}@${dominio}`;
      if (!CORREO.test(correo) || uno('SELECT 1 FROM usuarios WHERE correo = ?', correo)) { omitidos.push(u.usuario); return; }
      ejecutar('UPDATE usuarios SET correo = ? WHERE id = ?', correo, u.id); actualizados++;
    }));
    return { actualizados, omitidos };
  }));

  app.post('/api/usuarios/:id/clave', r(req => {
    soloAdmin(req.u);
    const t = uno('SELECT * FROM usuarios WHERE id = ? AND empresa_id = ?', req.params.id, req.u.empresa_id);
    if (!t) falla(404, 'Usuario no encontrado');
    if (req.body.clave) claveValida(req.body.clave, t.usuario);
    const clave = req.body.clave ? String(req.body.clave) : generarClave();
    ejecutar('UPDATE usuarios SET clave = ?, debe_cambiar = 1, reinicio_solicitado = NULL WHERE id = ?', hash(clave), t.id);
    ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', t.id);
    return { clave_temporal: req.body.clave ? null : clave };
  }));

  // Cambiar mi propia clave
  app.post('/api/yo/clave', r(req => {
    const u = uno('SELECT * FROM usuarios WHERE id = ?', req.u.id);
    if (!verificar(String(req.body.actual || ''), u.clave)) falla(400, 'La clave actual no es correcta');
    claveValida(req.body.nueva, u.usuario);
    if (req.body.nueva === req.body.actual) falla(400, 'La clave nueva debe ser distinta de la actual');
    ejecutar('UPDATE usuarios SET clave = ?, debe_cambiar = 0, reinicio_solicitado = NULL WHERE id = ?', hash(String(req.body.nueva)), u.id);
    ejecutar('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?', u.id, tokenDe(req));
    return { ok: true };
  }));

  // ---------- Olvidé mi clave (sin sesión) ----------
  // Con correo configurado (correo.js) se envía un enlace de un solo uso; sin él, la petición queda como aviso al administrador.
  // La respuesta es la misma exista o no el correo: no se revela quién tiene cuenta.
  const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
  const hace = ms => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
  const pedidos = new Map();
  const permitido = (clave, max) => { // como mucho `max` pedidos por hora para esa clave
    const desde = Date.now() - 3600e3, p = (pedidos.get(clave) || []).filter(x => x > desde);
    if (p.length >= max) return false;
    p.push(Date.now()); pedidos.set(clave, p); return true;
  };
  const avisarAlAdmin = id => ejecutar('UPDATE usuarios SET reinicio_solicitado = ? WHERE id = ?', ahora(), id);
  app.post('/api/olvide', r(req => {
    const correo = limpiarCorreo(req.body.correo);
    if (!CORREO.test(correo)) falla(400, 'Escribe tu correo');
    const respuesta = { ok: true, por_correo: mail.configurado() };
    if (!permitido('ip:' + req.ip, 20) || !permitido('correo:' + correo, 3)) return respuesta;
    const u = uno('SELECT * FROM usuarios WHERE correo = ? AND activo = 1', correo);
    if (!u) return respuesta;
    if (!mail.configurado()) { avisarAlAdmin(u.id); return respuesta; }
    const token = crypto.randomBytes(32).toString('hex');
    transaccion(() => {
      ejecutar('UPDATE reinicios_clave SET usado = ? WHERE usuario_id = ? AND usado IS NULL', ahora(), u.id); // el enlace nuevo anula los anteriores
      ejecutar('INSERT INTO reinicios_clave (usuario_id, token_hash, creado, vence) VALUES (?,?,?,?)', u.id, sha256(token), ahora(), hace(60 * 60e3));
    });
    // Sin esperar el envío: así la respuesta tarda lo mismo exista o no la cuenta. Si el correo falla, se avisa al administrador.
    mail.enviar({ a: correo, asunto: 'Restablece tu clave de OIKOS',
      texto: `Hola ${u.nombre},\n\nPediste restablecer tu clave de OIKOS. Entra a este enlace y elige una nueva (vale 60 minutos y se usa una sola vez):\n\n${mail.enlaceRestablecer(token)}\n\nSi no lo pediste tú, ignora este mensaje: tu clave sigue igual.\n` })
      .catch(e => { console.error('No se pudo enviar el correo de recuperación:', e.message); avisarAlAdmin(u.id); });
    return respuesta;
  }));

  app.post('/api/restablecer', r(req => {
    const malo = () => falla(400, 'El enlace no es válido o ya venció. Pide uno nuevo desde «¿Olvidaste tu clave?».');
    const token = String(req.body.token || '');
    if (!/^[a-f0-9]{64}$/.test(token)) malo();
    const f = uno('SELECT * FROM reinicios_clave WHERE token_hash = ?', sha256(token));
    if (!f || f.usado || f.vence < ahora()) malo();
    const u = uno('SELECT * FROM usuarios WHERE id = ? AND activo = 1', f.usuario_id);
    if (!u) malo();
    claveValida(req.body.nueva, u.usuario);
    transaccion(() => {
      ejecutar('UPDATE usuarios SET clave = ?, debe_cambiar = 0, reinicio_solicitado = NULL WHERE id = ?', hash(String(req.body.nueva)), u.id);
      ejecutar('UPDATE reinicios_clave SET usado = ? WHERE id = ?', ahora(), f.id);
      ejecutar('DELETE FROM sesiones WHERE usuario_id = ?', u.id);
    });
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
    const x = buscar(ctx.usuarios, v, ['usuario', 'nombre', 'correo']);
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
      columnas: ['correo', 'nombre', 'cargo', 'rol', 'proceso'], requeridas: ['correo', 'nombre', 'rol'],
      ejemplo: ['jperez@metalcof.co', 'Juan Pérez', 'Jefe de Producción', 'Líder', 'Producción'],
      ayuda: 'rol: Administrador, Gestor de Calidad, Líder o Colaborador. El Líder necesita proceso. La persona ingresa con su correo; a cada usuario se le genera una clave temporal.',
      preparar(f, ctx) {
        const correo = limpiarCorreo(f.correo);
        if (!CORREO.test(correo)) throw new Error(`correo: “${f.correo}” no es válido`);
        if (uno('SELECT 1 FROM usuarios WHERE correo = ?', correo)) throw new Error(`el correo ${correo} ya existe`);
        if (ctx.vistos.has(correo)) throw new Error(`“${correo}” está repetido en el archivo`);
        ctx.vistos.add(correo);
        const alias = { administrador: 'admin', 'gestor de calidad': 'lider_calidad', gestor: 'lider_calidad', 'lider de calidad': 'lider_calidad',
          lider: 'lider_proceso', 'lider de proceso': 'lider_proceso', colaborador: 'consulta' };
        const rol = alias[norm(f.rol)] || elegir(f.rol, ROLES, 'rol');
        const proceso = f.proceso ? buscar(ctx.procesos, f.proceso, ['nombre', 'sigla']) : null;
        if (f.proceso && !proceso) throw new Error(`proceso: no existe “${f.proceso}”`);
        if (rol === 'lider_proceso' && !proceso) throw new Error('el Líder necesita proceso');
        return { correo, nombre: f.nombre, cargo: f.cargo || null, rol, proceso_id: proceso?.id ?? null, resumen: `${correo} · ${ROL_ETIQUETA[rol]}` };
      },
      aplicar(d, ctx) {
        const clave = generarClave(), usuario = usuarioDesde(d.correo);
        ejecutar(`INSERT INTO usuarios (empresa_id, usuario, correo, nombre, cargo, rol, proceso_id, clave, activo, debe_cambiar) VALUES (?,?,?,?,?,?,?,?,1,1)`,
          ctx.u.empresa_id, usuario, d.correo, d.nombre, d.cargo, d.rol, d.proceso_id, hash(clave));
        if (d.rol === 'lider_proceso') guardarProcesos(uno('SELECT id FROM usuarios WHERE usuario = ?', usuario).id, conSubprocesos(d.proceso_id)); // el proceso con sus subprocesos
        ctx.claves.push({ usuario: d.correo, nombre: d.nombre, clave_temporal: clave });
      },
    },

    correos: {
      titulo: 'Correos de usuarios que ya existen', soloAdmin: true,
      columnas: ['usuario', 'correo'], requeridas: ['usuario', 'correo'],
      ejemplo: ['juan.perez', 'juan.perez@metalcof.co'],
      ayuda: 'Asigna o cambia el correo de usuarios ya creados (se identifican por su usuario, o por su nombre completo). No cambia claves ni roles.',
      preparar(f, ctx) {
        const u = buscar(ctx.usuarios, f.usuario, ['usuario', 'nombre']);
        if (!u) throw new Error(`usuario: no existe “${f.usuario}”`);
        const correo = limpiarCorreo(f.correo);
        if (!CORREO.test(correo)) throw new Error(`correo: “${f.correo}” no es válido`);
        if (uno('SELECT 1 FROM usuarios WHERE correo = ? AND id != ?', correo, u.id)) throw new Error(`el correo ${correo} ya es de otro usuario`);
        if (ctx.vistos.has(correo)) throw new Error(`“${correo}” está repetido en el archivo`);
        ctx.vistos.add(correo);
        return { id: u.id, correo, resumen: `${u.usuario} → ${correo}` };
      },
      aplicar(d) { ejecutar('UPDATE usuarios SET correo = ? WHERE id = ?', d.correo, d.id); },
    },

    documentos: {
      titulo: 'Listado maestro de documentos',
      columnas: ['codigo', 'nombre', 'tipo', 'clase', 'proceso', 'origen', 'version', 'fecha_documento', 'fecha_vencimiento', 'responsable', 'descripcion'],
      requeridas: ['nombre', 'tipo', 'clase', 'proceso'],
      ejemplo: ['PRO-PRO-01', 'Procedimiento de soldadura', 'Procedimiento', 'Procedimientos', 'Producción', 'Interno', '1', '2025-03-10', '2027-03-10', 'jperez@metalcof.co', ''],
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
      ejemplo: ['Producción', 'Calidad', 'Producto no conforme por fallas en soldadura', 'Equipos sin mantenimiento', 'Reprocesos y quejas', '4', '4', 'Reducir', 'jperez@metalcof.co', ''],
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
      ejemplo: ['R-PRO-01', 'Inspección de soldadura en cada lote', 'Detectivo', 'Fuerte', 'si', 'no', 'Por lote', 'si', 'jperez@metalcof.co', 'mramirez@metalcof.co'],
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
      clases: todos('SELECT * FROM clases_documento'), usuarios: todos('SELECT id, usuario, correo, nombre FROM usuarios WHERE empresa_id = ? AND activo = 1', req.u.empresa_id) };
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
