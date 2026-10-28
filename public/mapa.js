// SGI — mapa de procesos circular (usa $, api, esc, vista, cat y yo de app.js).
// Estratégicos al centro, misionales alrededor y de apoyo en el anillo exterior; en el centro va el logo de la empresa.
// Se dibuja en un lienzo SVG de 1000 × 1000 que escala con el espacio disponible. Los ángulos van en grados:
// 0 = derecha, -90 = arriba, y crecen en sentido horario.
(() => {
  const C = 500, MEDIA_BANDA = 38, HUECO = 9;
  const ANILLOS = [ // de adentro hacia afuera; r = [radio interno, radio externo]; fs = tamaño máximo de letra
    { c: 'Estratégico', clase: 'estrategico', rotulo: 'Procesos estratégicos', r: [126, 246], fs: 21 },
    { c: 'Misional', clase: 'misional', rotulo: 'Procesos misionales', r: [258, 372], fs: 22 },
    { c: 'Apoyo', clase: 'apoyo', rotulo: 'Procesos de apoyo', r: [384, 470], fs: 20 }];

  const rad = g => g * Math.PI / 180, deg = r => r * 180 / Math.PI, n2 = v => Math.round(v * 100) / 100;
  const xy = (r, g) => [C + r * Math.cos(rad(g)), C + r * Math.sin(rad(g))];
  const P = (r, g) => xy(r, g).map(n2).join(' ');
  const sector = (r0, r1, a0, a1) => {
    const l = a1 - a0 > 180 ? 1 : 0;
    return `M${P(r1, a0)}A${r1} ${r1} 0 ${l} 1 ${P(r1, a1)}L${P(r0, a1)}A${r0} ${r0} 0 ${l} 0 ${P(r0, a0)}Z`;
  };
  // Arco recorrido de izquierda a derecha: arriba va en sentido horario y abajo al revés, así el texto nunca queda de cabeza
  const arco = (r, a0, a1, arriba) =>
    `M${P(r, arriba ? a0 : a1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} ${arriba ? 1 : 0} ${P(r, arriba ? a1 : a0)}`;

  // Reparto angular de n sectores: arriba va una cantidad par (así el centro superior cae en una división y ahí se
  // apoya la pestaña del anillo) y el resto abajo. La banda central deja libre una franja a cada lado.
  function reparto(n, rm) {
    const ex = deg(Math.asin((MEDIA_BANDA + 12) / rm)), hueco = deg(HUECO / rm), arriba = Math.min(n, 2 * Math.round(n / 4));
    const grupo = (desde, hasta, k) => Array.from({ length: k }, (_, i) => {
      const w = (hasta - desde - (k - 1) * hueco) / k, a0 = desde + i * (w + hueco);
      return { a0, a1: a0 + w };
    });
    const izq = Math.ceil(arriba / 2);
    return [...grupo(-180 + ex, -90 - hueco / 2, izq), ...grupo(-90 + hueco / 2, -ex, arriba - izq), ...grupo(ex, 180 - ex, n - arriba)]
      .map((a, i) => ({ ...a, arriba: i < arriba }));
  }

  // Parte el nombre en líneas con el ancho estimado de la letra; "y", "e" y "a" quedan pegadas a la palabra siguiente
  const envolver = (txt, ancho, fs) => {
    const out = []; let l = '';
    for (const w of txt.split(/ +/)) {
      const t = l ? l + ' ' + w : w;
      if (!l || t.length * fs * .58 <= ancho) l = t; else { out.push(l); l = w; }
    }
    return out.concat(l);
  };
  // Busca la letra más grande con la que el nombre cabe en el sector
  function ajustar(nombre, a, r0, r1, fsMax) {
    const rm = (r0 + r1) / 2, alto = r1 - r0 - 22, txt = nombre.replace(/\b(y|e|a) /g, '$1 ');
    let res;
    for (let fs = fsMax; fs >= 12; fs--) {
      const lh = fs * 1.18, ancho = rad(a.a1 - a.a0) * (rm - lh) - 26; // arco útil a la altura de la línea más interna
      res = { fs, lh, lineas: envolver(txt, ancho, fs) };
      if (res.lineas.length * lh <= alto && res.lineas.every(l => l.length * fs * .58 <= ancho)) break;
    }
    return res;
  }
  // Una línea de texto por arco concéntrico. Arriba el texto crece hacia afuera (la primera línea queda en el arco
  // exterior); abajo crece hacia adentro (la primera queda en el arco interior).
  const lineasSvg = (idx, lineas, a, rm, fs, lh) => lineas.map((t, k) => {
    const r = a.arriba ? rm + ((lineas.length - 1) / 2 - k) * lh - .34 * fs : rm + (k - (lineas.length - 1) / 2) * lh + .34 * fs;
    return [`<path id="mp-t-${idx}-${k}" d="${arco(r, a.a0, a.a1, a.arriba)}"/>`,
      `<text text-anchor="middle" style="font-size:${fs}px"><textPath href="#mp-t-${idx}-${k}" startOffset="50%">${esc(t)}</textPath></text>`];
  });

  rutas.mapa = async function () {
    const vigentes = await api('/documentos?estado=VIGENTE');
    const cuenta = id => vigentes.filter(d => d.proceso_id === id).length;
    const plural = n => `${n} documento${n === 1 ? '' : 's'} vigente${n === 1 ? '' : 's'}`;
    const defs = [], cunas = [], grupos = [];
    let idx = 0;

    ANILLOS.forEach((an, k) => {
      const procesos = cat.procesos.filter(p => p.categoria === an.c && !p.padre_id), [r0, r1] = an.r, rm = (r0 + r1) / 2, items = [];
      reparto(procesos.length, rm).forEach((a, i) => {
        const p = procesos[i], n = cuenta(p.id), subs = cat.procesos.filter(h => h.padre_id === p.id).map(h => h.nombre);
        const am = (a.a0 + a.a1) / 2, dx = Math.cos(rad(am)) * 7, dy = Math.sin(rad(am)) * 7;
        const { fs, lh, lineas } = ajustar(p.nombre, a, r0, r1, an.fs), tx = lineasSvg(idx, lineas, a, rm, fs, lh);
        const d = deg(5 / rm); // el borde redondeado sale de trazar el sector encogido 5 unidades con un trazo de 10
        tx.forEach(t => defs.push(t[0]));
        cunas.push(`<a class="mp-cuna mp-${an.clase}" href="#/proceso/${p.id}" aria-label="${esc(p.nombre)}, ${plural(n)}" style="--d:${k * 110 + i * 35}ms">
          <g class="mp-cuerpo" style="--dx:${n2(dx)}px;--dy:${n2(dy)}px"><path class="mp-fondo" d="${sector(r0 + 5, r1 - 5, a.a0 + d, a.a1 - d)}"/>${tx.map(t => t[1]).join('')}</g></a>`);
        items.push(`<a class="mp-item" href="#/proceso/${p.id}"><span class="mp-tarjeta"><b>${esc(p.nombre)}</b><em class="mp-cuenta${n ? '' : ' vacio'}" title="${plural(n)}">${n}</em></span>
          <span class="mp-info"><strong>${esc(p.codigo || p.sigla)}</strong><span>${plural(n)}</span>${subs.map(s => `<span class="mp-sub">${esc(s)}</span>`).join('')}</span></a>`);
        idx++;
      });
      grupos.push(`<section class="mp-banda-lista mp-${an.clase}"><h3>${an.rotulo}</h3>${items.join('')}</section>`);
    });

    // Pestañas curvas: cada anillo tiene la suya, centrada arriba sobre su borde exterior
    const FS_TAB = 16, pestanas = ANILLOS.map(an => {
      const r = an.r[1], m = deg((an.rotulo.length * FS_TAB * .62 / 2 + 6) / r), id = `mp-tab-${an.clase}`;
      defs.push(`<path id="${id}" d="${arco(r - .34 * FS_TAB, -90 - m, -90 + m, true)}"/>`);
      return `<path class="mp-tab mp-tab-${an.clase}" d="${arco(r, -90 - m, -90 + m, true)}"/>
        <text class="mp-tab-texto" text-anchor="middle" style="font-size:${FS_TAB}px"><textPath href="#${id}" startOffset="50%">${an.rotulo}</textPath></text>`;
    }).join('');

    // Banda central: de las necesidades del cliente a su satisfacción, bajo el disco con el isotipo
    const x0 = C - 478, x1 = C + 462, y0 = C - MEDIA_BANDA, y1 = C + MEDIA_BANDA;
    const banda = `M${x0 + MEDIA_BANDA} ${y0}H${x1 - 26}L${x1 + 14} ${C}L${x1 - 26} ${y1}H${x0 + MEDIA_BANDA}A${MEDIA_BANDA} ${MEDIA_BANDA} 0 0 1 ${x0 + MEDIA_BANDA} ${y0}Z`;
    const dosLineas = (cls, x, a, b) => `<text class="mp-banda-texto ${cls}" text-anchor="middle" x="${x}" y="${C - 4}">${a}</text><text class="mp-banda-texto ${cls}" text-anchor="middle" x="${x}" y="${C + 18}">${b}</text>`;

    vista.innerHTML = `<div class="mp-pagina"><div class="mp-panel"><div class="mp-cont"><div class="mp-escena">
      <header class="mp-encabezado"><h2 class="mp-h"><span class="mp-h-1">Mapa <span class="mp-de">de</span></span> procesos</h2>
        <p>Los procesos estratégicos están al centro, los misionales los rodean y los de apoyo forman el anillo exterior.</p>
        <p class="mp-pista">Haz clic en un proceso para abrir su ficha.</p>
        <ul class="mp-leyenda"><li class="mp-estrategico">Estratégicos</li><li class="mp-misional">Misionales</li><li class="mp-apoyo">De apoyo</li></ul></header>
      <div class="mp-caja"><svg class="mp-svg" viewBox="0 0 1000 1000" role="group" aria-label="Mapa de procesos de ${esc(yo.empresa || 'la empresa')}">
        <defs>
          <radialGradient id="mp-g-halo" cx="50%" cy="38%" r="68%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#dcebec"/></radialGradient>
          <linearGradient id="mp-g-estrategico" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6256cf"/><stop offset="1" stop-color="#2a2180"/></linearGradient>
          <linearGradient id="mp-g-misional" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17a093"/><stop offset="1" stop-color="#0a5650"/></linearGradient>
          <linearGradient id="mp-g-apoyo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4ecf8"/><stop offset="1" stop-color="#7bc0e1"/></linearGradient>
          <linearGradient id="mp-g-banda" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a5650"/><stop offset=".5" stop-color="#0f766e"/><stop offset="1" stop-color="#19b3a5"/></linearGradient>
          <clipPath id="mp-clip-disco"><circle cx="${C}" cy="${C}" r="94"/></clipPath>
          <pattern id="mp-chev" width="46" height="76" patternUnits="userSpaceOnUse"><path d="M12 15L27 38L12 61" fill="none" stroke="#fff" stroke-opacity=".17" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></pattern>
          <filter id="mp-sombra" filterUnits="userSpaceOnUse" x="-30" y="-30" width="1060" height="1080"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#073b35" flood-opacity=".28"/></filter>
          <filter id="mp-sombra-alta" filterUnits="userSpaceOnUse" x="-30" y="-30" width="1060" height="1080"><feDropShadow dx="0" dy="11" stdDeviation="9" flood-color="#073b35" flood-opacity=".4"/></filter>
          <filter id="mp-sombra-plato" filterUnits="userSpaceOnUse" x="-30" y="-30" width="1060" height="1080"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#073b35" flood-opacity=".16"/></filter>
          ${defs.join('')}
        </defs>
        <circle class="mp-halo" cx="${C}" cy="${C}" r="494"/>
        <circle class="mp-plato" cx="${C}" cy="${C}" r="478"/><circle class="mp-plato mp-plato-2" cx="${C}" cy="${C}" r="378"/>
        <circle class="mp-plato" cx="${C}" cy="${C}" r="252"/><circle class="mp-plato mp-plato-3" cx="${C}" cy="${C}" r="119"/>
        ${cunas.join('')}
        <g aria-hidden="true"><path class="mp-banda" d="${banda}"/><path class="mp-banda-chev" d="${banda}"/>
          ${dosLineas('mp-banda-clara', C - 285, 'Necesidades y expectativas', 'de los clientes')}${dosLineas('mp-banda-clara', C + 281, 'Satisfacción', 'del cliente')}
          <circle class="mp-disco" cx="${C}" cy="${C}" r="100"/><image href="logo.png" x="${C - 103}" y="${C - 64}" width="206" height="128" preserveAspectRatio="xMidYMid meet" clip-path="url(#mp-clip-disco)"/></g>
        <g aria-hidden="true">${pestanas}</g>
      </svg></div>
      <div class="mp-lista">${grupos.join('')}</div>
    </div></div></div></div>`;
  };
})();
