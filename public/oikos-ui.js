// OIKOS · detalle de movimiento de la nueva piel (oikos-ui.css): las cifras suben de 0 al valor cuando aparecen.
// Solo lee y reescribe el texto de las cifras (.kpi, .cifra, .pct); no toca datos ni lógica. Sin el archivo todo funciona igual.
// La X cierra la ventana igual que «Cancelar»
document.querySelector('.dlg-cerrar')?.addEventListener('click', () => document.getElementById('modal').close('cancelar'));

// Ojo para ver la clave: a todo campo de clave (ingreso, cambio de clave, ventanas) se le agrega un botón que alterna ver/ocultar
(() => {
  const OJO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_TACHADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function ponerOjo(input) {
    input.dataset.ojo = '1';
    const caja = document.createElement('span');
    caja.className = 'clave-ojo';
    input.replaceWith(caja);
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'ojo';
    const pintar = visible => {
      boton.innerHTML = visible ? OJO_TACHADO : OJO;
      boton.title = visible ? 'Ocultar clave' : 'Mostrar clave';
      boton.setAttribute('aria-label', boton.title);
      boton.setAttribute('aria-pressed', String(visible));
    };
    pintar(false);
    boton.addEventListener('click', () => {
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      pintar(ver);
      input.focus();
    });
    caja.append(input, boton);
  }
  const barrer = () => document.querySelectorAll('input[type="password"]:not([data-ojo])').forEach(ponerOjo);
  barrer();
  new MutationObserver(barrer).observe(document.body, { childList: true, subtree: true });
})();

(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const vista = document.getElementById('vista');
  if (!vista) return;
  const CIFRAS = '.kpi > b, .cifra > b, .pct';
  const FORMATO = /^(\s*)(\d+(?:[.,]\d+)?)(\s*%?\s*)$/; // «2», «75 %», «45,5»: nada con signos ni miles

  function subir(el) {
    const texto = el.textContent, m = FORMATO.exec(texto);
    if (!m || el.dataset.uiFin === texto || el.childNodes.length !== 1 || el.firstChild.nodeType !== 3) return;
    el.dataset.uiFin = texto;
    const decimales = (m[2].split(/[.,]/)[1] || '').length, fin = parseFloat(m[2].replace(',', '.')), coma = m[2].includes(',');
    if (decimales > 2 || !(fin > 0)) return;
    const nodo = el.firstChild, t0 = performance.now(), duracion = 900;
    const paso = ahora => {
      const p = Math.min(1, (ahora - t0) / duracion);
      const v = (fin * (1 - Math.pow(1 - p, 3))).toFixed(decimales);
      nodo.nodeValue = p < 1 ? m[1] + (coma ? v.replace('.', ',') : v) + m[3] : texto;
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  const barrer = () => vista.querySelectorAll(CIFRAS).forEach(subir);
  // childList (no characterData): lo que escribe este archivo no vuelve a disparar el observador
  new MutationObserver(() => requestAnimationFrame(barrer)).observe(vista, { childList: true, subtree: true });
})();
