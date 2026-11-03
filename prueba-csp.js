// Prueba de la política de seguridad del navegador (Content-Security-Policy de public/.htaccess).
// La política NO admite código escrito dentro del HTML ('unsafe-inline' en script-src): un atributo onclick/onerror/onfocus..., un
// <script> sin src o un enlace javascript: «no hace nada» y sin avisar. Esta prueba lo atrapa antes de subir.
// Para navegar o imprimir desde un botón o una fila se usa data-ir="#/ruta" y data-imprimir (los atiende app.js); para lo demás, addEventListener.
const fs = require('node:fs');
const path = require('node:path');

const PUBLICO = path.join(__dirname, 'public');
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle)?.slice(0, 600)); } };

const leer = f => fs.readFileSync(path.join(PUBLICO, f), 'utf8');
const archivos = fs.readdirSync(PUBLICO).filter(f => /\.(html|js)$/.test(f));
const lineasCon = (texto, regex) => texto.split('\n').map((l, i) => regex.test(l) ? `${i + 1}: ${l.trim().slice(0, 110)}` : null).filter(Boolean);

// ---- La política misma ----
const htaccess = leer('.htaccess');
const csp = (/Content-Security-Policy\s+"([^"]+)"/.exec(htaccess) || [])[1] || '';
const directiva = nombre => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(nombre + ' ')) || '').split(/\s+/).slice(1);
esperar('Hay una política de seguridad en public/.htaccess', csp.length > 0, htaccess.slice(0, 200));
esperar('script-src solo admite scripts propios (sin unsafe-inline ni unsafe-eval)',
  directiva('script-src').join(' ') === "'self'", directiva('script-src'));
esperar('default-src, object-src, frame-ancestors, form-action y base-uri siguen cerrados',
  directiva('default-src').join() === "'self'" && directiva('object-src').join() === "'none'" && directiva('frame-ancestors').join() === "'none'"
  && directiva('form-action').join() === "'self'" && directiva('base-uri').join() === "'self'", csp);

// ---- El código no depende de lo que la política bloquea ----
const mal = (cuando, regex, soloHtml = false) => {
  const hallazgos = {};
  for (const f of archivos) if (!soloHtml || f.endsWith('.html')) { const l = lineasCon(leer(f), regex); if (l.length) hallazgos[f] = l.slice(0, 4); }
  esperar(cuando, Object.keys(hallazgos).length === 0, hallazgos);
};
mal('Ningún atributo de evento escrito en HTML (onclick=, onerror=, onfocus=...)', /[\s"'`]on[a-z]{3,}\s*=\s*["'\\]/i);
mal('Ningún <script> con el código dentro del HTML', /<script(?![^>]*\bsrc\s*=)[^>]*>/i, true);
mal('Ningún enlace javascript:', /javascript\s*:/i);
mal('Nada de eval ni de new Function', /\beval\s*\(|new\s+Function\s*\(/);
mal('Ningún setTimeout/setInterval con texto en vez de función', /set(Timeout|Interval)\s*\(\s*["'`]/);
mal("Ningún setAttribute('on...')", /setAttribute\(\s*["']on/i);

// ---- Lo que sustituye a los onclick sí está atendido ----
const app = leer('app.js');
esperar('app.js atiende data-ir y data-imprimir con un solo manejador', /data-ir/.test(app) && /data-imprimir/.test(app) && /addEventListener\('click'/.test(app), null);
// data-ir, data-imprimir y data-seleccionar son de app.js: ningún otro archivo los lee ni los usa como «dato» propio (ya pasó con los botones de
// estado de la evaluación, que guardaban ahí «Ejecución» y terminaron navegando a #Ejecución). Para datos propios se usa otro nombre (data-estado...).
const ajenos = [];
for (const f of archivos.filter(f => f.endsWith('.js') && f !== 'app.js'))
  for (const l of lineasCon(leer(f), /dataset\.(ir|imprimir|seleccionar)\b|\[data-(ir|imprimir|seleccionar)[\]=]/)) ajenos.push(`${f} ${l}`);
esperar('Ningún otro archivo lee data-ir, data-imprimir ni data-seleccionar (son de app.js)', ajenos.length === 0, ajenos);
esperar('El manejador de app.js solo navega a rutas internas (#/...)', /\/\^#\\\/\/\.test\(el\.getAttribute\('data-ir'\)\)/.test(app), null);
// Todo data-ir que arme una plantilla debe empezar por «#/» o ser una expresión (el manejador solo cambia el hash)
const raros = [];
for (const f of archivos) for (const m of leer(f).matchAll(/data-ir="([^"]*)"/g)) if (!/^(#\/|\$\{)/.test(m[1])) raros.push(`${f}: ${m[1]}`);
esperar('Todo data-ir lleva a una ruta interna (#/...)', raros.length === 0, raros);

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nLa política de seguridad y el código concuerdan');
process.exit(fallos ? 1 : 0);
