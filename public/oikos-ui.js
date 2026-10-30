// OIKOS · detalle de movimiento de la nueva piel (oikos-ui.css): las cifras suben de 0 al valor cuando aparecen.
// Solo lee y reescribe el texto de las cifras (.kpi, .cifra, .pct); no toca datos ni lógica. Sin el archivo todo funciona igual.
// La X cierra la ventana igual que «Cancelar»
document.querySelector('.dlg-cerrar')?.addEventListener('click', () => document.getElementById('modal').close('cancelar'));

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
