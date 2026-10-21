// Mi cuenta: perfil del usuario (correo, contactos), preferencias, foto y firma.
// Las imágenes viven en archivos/usuarios/ (dentro de DATA_DIR, así entran en los respaldos); la base guarda solo el nombre del archivo.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { DATA_DIR } = require('./db');

const DIR = path.join(DATA_DIR, 'archivos', 'usuarios');
const TIPOS_CONTACTO = ['Celular', 'Teléfono', 'WhatsApp'];
// Páginas que un usuario puede fijar como inicio (coinciden con las rutas del menú)
const PAGINAS_INICIO = ['inicio', 'mapa', 'documentos', 'solicitudes', 'tablero', 'indicadores', 'riesgos', 'auditorias', 'acciones'];
const LIMITES_MB = { foto: 2, firma: 1 };

// Se reconoce la imagen por sus primeros bytes, no por el nombre ni el tipo que declare el navegador.
// Solo PNG, JPEG y WebP: un SVG podría llevar scripts.
function tipoDeImagen(b) {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

module.exports = function (app, { uno, todos, ejecutar, r, falla, esCalidad }) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
  // multer lanza sus errores por next(err): aquí se convierten en el mismo JSON que el resto de la API
  const recibir = tipo => (req, res, next) => upload.single('archivo')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `La imagen supera ${LIMITES_MB[tipo]} MB` : 'No se pudo leer el archivo' });
    next();
  });
  const rutaSegura = nombre => path.join(DIR, path.basename(String(nombre)));
  const borrar = nombre => { if (nombre) fs.rmSync(rutaSegura(nombre), { force: true }); };

  const perfil = id => {
    const u = uno(`SELECT u.id, u.usuario, u.nombre, u.cargo, u.rol, u.correo, p.nombre proceso, e.nombre empresa,
        (u.foto IS NOT NULL) tiene_foto, u.foto_v, (u.firma IS NOT NULL) tiene_firma, u.firma_v,
        u.pref_notif_atraso, u.pref_dias_atraso, u.pref_notif_proximas, u.pref_dias_proximas, u.pref_alerta_dias, u.pref_inicio
      FROM usuarios u LEFT JOIN procesos p ON p.id = u.proceso_id LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.id = ?`, id);
    return {
      ...u, pref_notif_atraso: !!u.pref_notif_atraso, pref_notif_proximas: !!u.pref_notif_proximas,
      tiene_foto: !!u.tiene_foto, tiene_firma: !!u.tiene_firma,
      contactos: todos('SELECT id, tipo, numero FROM usuario_contactos WHERE usuario_id = ? ORDER BY id', id),
      paginas_inicio: PAGINAS_INICIO, tipos_contacto: TIPOS_CONTACTO,
    };
  };

  app.get('/api/cuenta', r(req => perfil(req.u.id)));

  app.put('/api/cuenta', r(req => {
    const b = req.body || {};
    const entero = (v, min, max, campo) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) falla(400, `${campo} debe ser un número entero entre ${min} y ${max}`);
      return n;
    };
    const correo = String(b.correo ?? '').trim();
    if (correo && (correo.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) falla(400, 'El correo no tiene un formato válido');
    if (!PAGINAS_INICIO.includes(b.pref_inicio)) falla(400, 'La página de inicio no es válida');
    ejecutar(`UPDATE usuarios SET correo = ?, pref_notif_atraso = ?, pref_dias_atraso = ?, pref_notif_proximas = ?, pref_dias_proximas = ?,
        pref_alerta_dias = ?, pref_inicio = ? WHERE id = ?`,
      correo || null, b.pref_notif_atraso ? 1 : 0, entero(b.pref_dias_atraso, 1, 60, 'Los días de aviso por atraso'),
      b.pref_notif_proximas ? 1 : 0, entero(b.pref_dias_proximas, 1, 60, 'Los días de aviso por terminar'),
      entero(b.pref_alerta_dias, 1, 365, 'La alerta temprana'), b.pref_inicio, req.u.id);
    return perfil(req.u.id);
  }));

  // ---------- Foto y firma ----------
  const guardar = tipo => (req, res) => r(() => {
    if (!req.file) falla(400, 'Elige una imagen');
    if (req.file.size > LIMITES_MB[tipo] * 1024 * 1024) falla(400, `La imagen supera ${LIMITES_MB[tipo]} MB`);
    const img = tipoDeImagen(req.file.buffer);
    if (!img) falla(400, 'El archivo no es una imagen PNG, JPG o WebP');
    const anterior = uno(`SELECT ${tipo} f FROM usuarios WHERE id = ?`, req.u.id).f;
    const nombre = `u${req.u.id}-${tipo}-${crypto.randomBytes(6).toString('hex')}.${img.ext}`;
    fs.mkdirSync(DIR, { recursive: true });   // la carpeta nace con la primera imagen, no al arrancar
    fs.writeFileSync(path.join(DIR, nombre), req.file.buffer);
    ejecutar(`UPDATE usuarios SET ${tipo} = ?, ${tipo}_v = ${tipo}_v + 1 WHERE id = ?`, nombre, req.u.id);
    borrar(anterior);
    return perfil(req.u.id);
  })(req, res);
  const quitar = tipo => r(req => {
    const anterior = uno(`SELECT ${tipo} f FROM usuarios WHERE id = ?`, req.u.id).f;
    ejecutar(`UPDATE usuarios SET ${tipo} = NULL, ${tipo}_v = ${tipo}_v + 1 WHERE id = ?`, req.u.id);
    borrar(anterior);
    return perfil(req.u.id);
  });
  app.post('/api/cuenta/foto', recibir('foto'), guardar('foto'));
  app.post('/api/cuenta/firma', recibir('firma'), guardar('firma'));
  app.delete('/api/cuenta/foto', quitar('foto'));
  app.delete('/api/cuenta/firma', quitar('firma'));

  // ---------- Números de contacto ----------
  app.post('/api/cuenta/contactos', r(req => {
    const tipo = String(req.body?.tipo || ''), numero = String(req.body?.numero || '').trim();
    if (!TIPOS_CONTACTO.includes(tipo)) falla(400, 'Elige el tipo de número');
    if (!/^[0-9+()\-\s]{6,20}$/.test(numero) || (numero.match(/\d/g) || []).length < 6) falla(400, 'El número solo puede llevar dígitos, +, -, paréntesis y espacios (mínimo 6 dígitos)');
    if (uno('SELECT COUNT(*) n FROM usuario_contactos WHERE usuario_id = ?', req.u.id).n >= 5) falla(400, 'Puedes guardar hasta 5 números');
    ejecutar('INSERT INTO usuario_contactos (usuario_id, tipo, numero) VALUES (?,?,?)', req.u.id, tipo, numero);
    return perfil(req.u.id);
  }));
  app.delete('/api/cuenta/contactos/:id', r(req => {
    ejecutar('DELETE FROM usuario_contactos WHERE id = ? AND usuario_id = ?', req.params.id, req.u.id);
    return perfil(req.u.id);
  }));

  // ---------- Servir las imágenes ----------
  // Foto: la ve cualquier usuario de la misma empresa (sale en menús y fichas). Firma: solo su dueño y Calidad/administración.
  const servir = (tipo, permitido) => (req, res) => {
    const u = uno(`SELECT id, ${tipo} f FROM usuarios WHERE id = ? AND empresa_id = ?`, req.params.id, req.u.empresa_id);
    if (!u || !u.f || !permitido(req, u)) return res.status(404).json({ error: 'No hay imagen' });
    const ext = path.extname(u.f).slice(1);
    const archivo = rutaSegura(u.f);
    if (!MIME[ext] || !fs.existsSync(archivo)) return res.status(404).json({ error: 'No hay imagen' });
    res.setHeader('Content-Type', MIME[ext]);
    // La URL lleva ?v=<versión>: al cambiar la imagen cambia la URL, así que la foto puede guardarse en caché; la firma nunca
    res.setHeader('Cache-Control', tipo === 'foto' ? 'private, max-age=86400' : 'private, no-store');
    res.sendFile(archivo);
  };
  app.get('/api/usuarios/:id/foto', servir('foto', () => true));
  app.get('/api/usuarios/:id/firma', servir('firma', (req, u) => u.id === req.u.id || esCalidad(req.u)));
};

module.exports.PAGINAS_INICIO = PAGINAS_INICIO;
