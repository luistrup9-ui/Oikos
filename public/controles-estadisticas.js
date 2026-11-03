// SGI — estadísticas de controles (como Almera): cuántos controles hay por proceso o por clase, en barras y en tabla Total / %,
// con los mismos filtros del listado de controles (la pantalla es riesgos.js → rutas.controles; usa los utilitarios de app.js)
const ATRIBUTOS_CONTROL = [['', ''], ['proceso', 'Proceso'], ['clase', 'Clase']];
let atributoControles = 'proceso';
const pctControl = v => `${Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;
const sinTildes = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const num1 = v => Math.round(v * 10) / 10;
// Etiqueta corta para el eje: si no cabe, se corta en el límite de una palabra y sin dejar «de», «y»… colgando (el nombre completo está en la tabla y al pasar el puntero)
const CONECTORES_CTL = /\s+(?:de|del|la|las|el|los|y|e|en|a|con|para|por)$/i;
function cortoControl(s, n = 30) {
  if (s.length <= n) return s;
  let c = s.slice(0, n - 1); const i = c.lastIndexOf(' ');
  if (i >= n * .55) c = c.slice(0, i);
  while (CONECTORES_CTL.test(c)) c = c.replace(CONECTORES_CTL, '');
  return c.trimEnd() + '…';
}
const anchoEtiqueta = s => [...s].reduce((a, c) => a + (c === ' ' ? 3.4 : /[A-ZÁÉÍÓÚÑ]/.test(c) ? 8.2 : 6.2), 0);   // ancho aproximado en px a 11,5 px de letra

// Paso «redondo» del eje vertical (1, 2, 5, 10, 20, 50…) para tener unas cinco líneas
function pasoEjeControles(max) {
  const bruto = Math.max(max, 1) / 5, magnitud = 10 ** Math.floor(Math.log10(bruto)), f = bruto / magnitud;
  return Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * magnitud);
}

// Barras verticales de mayor a menor (el servidor ya las manda así), con el eje «Controles», el valor sobre cada barra y su detalle al pasar el puntero
// disponible: el ancho (px) de la caja donde va el dibujo. Se calcula para ese ancho: con pocas barras cabe sin desplazarse (también en el teléfono);
// con muchas, cada barra conserva un mínimo legible y el dibujo se desliza de lado dentro de su caja.
function graficoBarrasControles(filas, titulo, disponible = 760) {
  const n = filas.length, max = Math.max(...filas.map(f => f.total)), paso = pasoEjeControles(max), tope = Math.ceil(max / paso) * paso;
  const inclinar = n > 6 || filas.some(f => f.nombre.length > 14);                          // etiquetas largas o muchas barras: se inclinan
  const largos = filas.map(f => anchoEtiqueta(cortoControl(f.nombre))), COS = Math.cos(40 * Math.PI / 180), SEN = Math.sin(40 * Math.PI / 180);
  const der = 18, arriba = 30;
  // la etiqueta inclinada termina bajo su barra y se extiende hacia la izquierda: el margen izquierdo deja sitio a la que más sobresale
  // (y ese margen le quita ancho a las barras, que a su vez cambian lo que sobresale: se repite hasta que se estabiliza)
  let izq = 62, ranura = 46;
  for (let k = 0; k < 5; k++) {
    ranura = Math.max(46, Math.min(220, (disponible - izq - der) / n));
    const nuevo = inclinar ? Math.max(62, ...largos.map((l, i) => Math.ceil(l * COS - ranura * (i + .5) + 10))) : 62;
    if (nuevo === izq) break;
    izq = nuevo;
  }
  const barra = Math.min(84, ranura * .62), abajo = inclinar ? Math.ceil(Math.max(...largos) * SEN + 34) : 46;
  const areaH = 250, alto = arriba + areaH + abajo, ancho = Math.round(izq + der + ranura * n), base = arriba + areaH;
  const lineas = []; for (let v = 0; v <= tope; v += paso) lineas.push(v);
  const yDe = v => num1(base - v / tope * areaH);
  // --ancho: el tamaño natural del dibujo; el CSS lo reduce si no cabe y solo lo agranda un poco (con pocas barras quedaría enorme)
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" style="--ancho:${ancho}px" role="img" aria-label="${esc(titulo)}">
    <defs><linearGradient id="gradBarraCtl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27d2cb"/><stop offset="1" stop-color="#007b78"/></linearGradient>
      <filter id="sombraBarraCtl" x="-30%" y="-10%" width="160%" height="130%"><feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#006e6a" flood-opacity=".28"/></filter></defs>
    ${lineas.map(v => `<line class="${v ? 'rejilla' : 'eje-base'}" x1="${izq}" x2="${ancho - der}" y1="${yDe(v)}" y2="${yDe(v)}"/><text class="marca" x="${izq - 10}" y="${yDe(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    <text class="titulo-eje" transform="rotate(-90)" x="${-(arriba + areaH / 2)}" y="16" text-anchor="middle">Controles</text>
    ${filas.map((f, i) => {
      const cx = izq + ranura * (i + .5), x = cx - barra / 2, h = f.total ? Math.max(3, f.total / tope * areaH) : 0, cima = base - h, r = Math.min(9, barra / 2, h);
      const d = `M${num1(x)},${base} V${num1(cima + r)} Q${num1(x)},${num1(cima)} ${num1(x + r)},${num1(cima)} H${num1(x + barra - r)} Q${num1(x + barra)},${num1(cima)} ${num1(x + barra)},${num1(cima + r)} V${base} Z`;
      const etiqueta = inclinar
        ? `<text class="etq" transform="translate(${num1(cx + 4)} ${base + 14}) rotate(-40)" text-anchor="end">${esc(cortoControl(f.nombre))}</text>`
        : `<text class="etq" x="${num1(cx)}" y="${base + 22}" text-anchor="middle">${esc(cortoControl(f.nombre, 18))}</text>`;
      return `<g class="barra"><title>${esc(f.nombre)}: ${f.total} (${pctControl(f.porcentaje)})</title>
        <path d="${d}" fill="url(#gradBarraCtl)" filter="url(#sombraBarraCtl)"/><text class="valor" x="${num1(cx)}" y="${num1(cima - 9)}" text-anchor="middle">${f.total}</text>${etiqueta}</g>`;
    }).join('')}
  </svg>`;
}

// Tabla Atributo | Total | % con la fila Total aparte (así no se pagina ni se ordena con las demás); la ordenación y el «Mostrar N registros» los pone armazon.js
function tablaEstadisticaControles(d, nombreAtributo, texto) {
  const q = sinTildes(texto.trim()), filas = d.filas.filter(f => sinTildes(f.nombre).includes(q));
  return `<div class="tabla-wrap"><table><thead><tr><th>${esc(nombreAtributo)}</th><th class="num">Total</th><th class="num">%</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td>${esc(f.nombre)}</td><td class="num">${f.total}</td><td class="num">${pctControl(f.porcentaje)}</td></tr>`).join('')
      || '<tr><td colspan="3" class="sub">Ninguna fila coincide con la búsqueda.</td></tr>'}
    </tbody><tfoot><tr class="total"><td><b>Total</b></td><td class="num"><b>${d.total}</b></td><td class="num"><b>100 %</b></td></tr></tfoot></table></div>`;
}

// f: valores del formulario de filtros de la pantalla de controles
async function estadisticasControles(f) {
  $('#resultado').innerHTML = `<div class="controles"><label class="en-linea">Atributo
      <select id="atributoCtl">${ATRIBUTOS_CONTROL.map(([k, n]) => `<option value="${k}" ${k === atributoControles ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div id="estadisticaCtl"></div>`;
  let pedido = 0;
  const cargar = intentar(async () => {
    const mio = ++pedido, atributo = atributoControles;
    const d = await api('/controles-estadisticas?' + qs({ ...f, atributo }));
    if (mio !== pedido) return;                                                              // llegó tarde: ya se pidió otro atributo
    const nombre = ATRIBUTOS_CONTROL.find(a => a[0] === atributo)[1], dest = $('#estadisticaCtl');
    if (!d.total) { dest.innerHTML = '<p class="vacio">No hay controles con estos criterios.</p>'; return; }
    if (!atributo) { dest.innerHTML = `<p class="vacio">Elige un atributo para ver cómo se reparten los ${d.total} controles.</p>`; return; }
    dest.innerHTML = `<div class="tarjeta"><div class="encabezado"><h3>Controles por ${esc(nombre.toLowerCase())}</h3><span class="cuenta-ctl">${d.total} controles</span></div>
        <div class="grafico-ctl"></div></div>
      <div class="tarjeta"><div class="encabezado"><h3>Detalle</h3>
          <input type="search" id="buscarCtl" class="buscar-tabla" placeholder="Buscar" aria-label="Buscar en la tabla" autocomplete="off"></div>
        <div id="tablaCtl">${tablaEstadisticaControles(d, nombre, '')}</div></div>`;
    const caja = dest.querySelector('.grafico-ctl');                                         // el dibujo se calcula para el ancho real de su caja
    caja.innerHTML = graficoBarrasControles(d.filas, 'Controles por ' + nombre.toLowerCase(), caja.clientWidth || 760);
    $('#buscarCtl').addEventListener('input', e => { $('#tablaCtl').innerHTML = tablaEstadisticaControles(d, nombre, e.target.value); });
  });
  $('#atributoCtl').addEventListener('change', e => { atributoControles = e.target.value; cargar(); });
  await cargar();
}
