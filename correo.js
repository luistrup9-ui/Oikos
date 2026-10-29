// Envío de correo para recuperar la clave. Se activa solo si hay servidor SMTP y dirección pública del sistema:
//   SMTP_HOST   servidor de salida (ej. smtp.office365.com, smtp.gmail.com)
//   SMTP_PORT   587 por defecto (465 usa conexión segura directa)
//   SMTP_USER / SMTP_PASS   cuenta que envía; para Gmail o Microsoft 365 suele ser una «contraseña de aplicación»
//   SMTP_FROM   remitente visible (por defecto SMTP_USER)
//   APP_URL     dirección con la que la gente abre OIKOS (ej. http://servidor/OIKOS); los enlaces del correo salen de aquí
// Sin esa configuración el sistema no envía nada: la petición de «Olvidé mi clave» le llega al administrador como aviso.
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* sin la librería (npm install) el correo queda desactivado */ }

const configurado = () => !!(nodemailer && process.env.SMTP_HOST && process.env.APP_URL);
if (process.env.SMTP_HOST && !configurado())
  console.warn('SMTP_HOST está definido pero falta APP_URL o la librería nodemailer (npm install): el correo de recuperación de clave queda desactivado.');

let transporte;
function enviar({ a, asunto, texto }) {
  if (!configurado()) return Promise.reject(new Error('El correo no está configurado'));
  transporte ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === '1' || Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
  return transporte.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: a, subject: asunto, text: texto });
}

const enlaceRestablecer = token => `${String(process.env.APP_URL).replace(/\/+$/, '')}/#/restablecer?t=${token}`;

module.exports = { configurado, enviar, enlaceRestablecer };
