// SGI — vistas de la matriz de riesgos (como Almera): resumen por zona con torta, exposición apilada, distribución de escenarios y plan de acción.
// Las arma riesgos.js (rutas.riesgos) con la misma lista de /api/riesgos; solo el plan de acción pide datos propios (/api/riesgos-planes).
// Las funciones que cuentan (contarZonas y agruparExposicion) no tocan la pantalla: prueba-riesgos-vistas.js las ejecuta en Node.
const NOMBRE_MATRIZ = { absoluto: 'Riesgo absoluto', residual: 'Riesgo residual' };
const pctZona = v => `${Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
const campoZona = matriz => matriz === 'residual' ? 'zona_residual' : 'zona';

// Cuántos riesgos hay en cada zona (siempre las cuatro, aunque alguna quede en 0) y qué parte del total es
function contarZonas(riesgos, matriz) {
  const total = riesgos.length, c = campoZona(matriz);
  return ZONAS.map(zona => { const cantidad = riesgos.filter(x => x[c] === zona).length; return { zona, cantidad, porcentaje: total ? cantidad * 100 / total : 0 }; });
}

// Riesgos de cada proceso (en el orden del mapa de procesos) o de cada tipo (en el orden del catálogo), repartidos por zona
function agruparExposicion(riesgos, matriz, atributo, tipos = []) {
  const c = campoZona(matriz), grupos = new Map();
  for (const x of riesgos) { const g = atributo === 'tipo' ? x.tipo : x.proceso; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(x); }
  const filas = [...grupos].map(([nombre, xs]) => ({ nombre, total: xs.length, zonas: Object.fromEntries(ZONAS.map(z => [z, xs.filter(x => x[c] === z).length])) }));
  if (atributo === 'tipo') { const orden = n => tipos.includes(n) ? tipos.indexOf(n) : tipos.length; filas.sort((a, b) => orden(a.nombre) - orden(b.nombre)); }
  return filas;
}

// Torta de riesgos por zona (SVG): las zonas sin riesgos no dibujan trozo; el porcentaje va dentro de los trozos que lo admiten
function tortaZonas(conteos, titulo) {
  const total = conteos.reduce((s, c) => s + c.cantidad, 0), C = 100, R = 92;
  const punto = (ang, r = R) => `${(C + r * Math.cos(ang)).toFixed(2)},${(C + r * Math.sin(ang)).toFixed(2)}`;
  let ini = -Math.PI / 2;                                                                       // se empieza arriba y se gira a la derecha
  const trozos = total ? conteos.filter(c => c.cantidad).map(c => {
    const barrido = c.cantidad / total * 2 * Math.PI, fin = ini + barrido, medio = ini + barrido / 2, detalle = `<title>${esc(c.zona)}: ${c.cantidad} (${pctZona(c.porcentaje)})</title>`;
    const forma = c.cantidad === total ? `<circle class="${c.zona}" cx="${C}" cy="${C}" r="${R}">${detalle}</circle>`
      : `<path class="${c.zona}" d="M${C},${C} L${punto(ini)} A${R},${R} 0 ${barrido > Math.PI ? 1 : 0} 1 ${punto(fin)} Z">${detalle}</path>`;
    const etiqueta = c.porcentaje >= 7 ? `<text class="${c.zona}" x="${(C + R * .62 * Math.cos(medio)).toFixed(1)}" y="${(C + R * .62 * Math.sin(medio)).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${pctZona(c.porcentaje)}</text>` : '';
    ini = fin;
    return forma + etiqueta;
  }).join('') : `<circle class="vacia" cx="${C}" cy="${C}" r="${R}"><title>Sin riesgos</title></circle>`;
  return `<svg class="torta" viewBox="0 0 200 200" role="img" aria-label="${esc(titulo)}">${trozos}</svg>`;
}

// Tabla Zona | Cantidad | % con la fila Total (sin paginar ni ordenar: son cuatro filas fijas)
function tablaZonas(conteos, total) {
  return `<table class="sin-dt"><thead><tr><th>Zona</th><th class="num">Cantidad</th><th class="num">%</th></tr></thead><tbody>
    ${conteos.map(c => `<tr><td>${zonaTag(c.zona)}</td><td class="num">${c.cantidad}</td><td class="num">${pctZona(c.porcentaje)}</td></tr>`).join('')}
    </tbody><tfoot><tr class="total"><td><b>Total</b></td><td class="num"><b>${total}</b></td><td class="num"><b>${total ? '100 %' : '—'}</b></td></tr></tfoot></table>`;
}

// Resumen por zona de una matriz: la torta y, al lado, su tabla
function resumenZonas(riesgos, matriz) {
  const conteos = contarZonas(riesgos, matriz);
  return `<div class="resumen-zonas">${tortaZonas(conteos, 'Riesgos por zona · ' + NOMBRE_MATRIZ[matriz])}${tablaZonas(conteos, riesgos.length)}</div>`;
}

// Distribución de escenarios: la tabla del riesgo absoluto y la del residual, lado a lado
function vistaDistribucion(riesgos) {
  return `<div class="dist-doble">${['absoluto', 'residual'].map(m => `<div class="tarjeta"><div class="encabezado"><h3>${NOMBRE_MATRIZ[m]}</h3>
    <span class="cuenta-ctl">${riesgos.length} escenarios</span></div>${tablaZonas(contarZonas(riesgos, m), riesgos.length)}</div>`).join('')}</div>`;
}

// Exposición: barras apiladas por zona para cada proceso o tipo de riesgo, con la cantidad dentro de cada tramo.
// e = { matriz, atributo, apilar }; alCambiar recibe lo que cambió ({ matriz } | { atributo } | { apilar }) y vuelve a llamar a esta función.
function vistaExposicion(destino, riesgos, e, tipos, alCambiar) {
  const filas = agruparExposicion(riesgos, e.matriz, e.atributo, tipos), maximo = Math.max(1, ...filas.map(f => f.total));
  destino.innerHTML = `<div class="controles">
      <label class="en-linea">Matriz <select id="expMatriz">${Object.entries(NOMBRE_MATRIZ).map(([k, n]) => `<option value="${k}" ${k === e.matriz ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="en-linea">Atributo <select id="expAtributo"><option value="proceso" ${e.atributo === 'proceso' ? 'selected' : ''}>Proceso</option>
        <option value="tipo" ${e.atributo === 'tipo' ? 'selected' : ''}>Tipo de riesgo</option></select></label>
      <label class="en-linea"><input type="checkbox" id="expApilar" ${e.apilar ? 'checked' : ''}> Apilar 100 %</label></div>
    <div class="tarjeta"><div class="encabezado"><h3>Exposición por ${e.atributo === 'tipo' ? 'tipo de riesgo' : 'proceso'} · ${NOMBRE_MATRIZ[e.matriz]}</h3><span class="cuenta-ctl">${riesgos.length} riesgos</span></div>
      <div class="leyenda">${ZONAS.map(z => `<span class="${z}">${z}</span>`).join('')}</div>
      ${filas.length ? `<div class="expo">${filas.map(f => `<div class="expo-fila"><span class="expo-nombre">${esc(f.nombre)}</span>
        <div class="expo-pista"><div class="expo-barra" style="width:${e.apilar ? 100 : f.total / maximo * 100}%">${ZONAS.filter(z => f.zonas[z]).map(z =>
          `<i class="${z}" style="flex:${f.zonas[z]} 1 0" title="${z}: ${f.zonas[z]}"><b>${f.zonas[z]}</b></i>`).join('')}</div></div>
        <b class="expo-total">${f.total}</b></div>`).join('')}</div>` : '<p class="vacio">No hay riesgos con estos criterios.</p>'}</div>`;
  // el número de un tramo muy angosto no cabe: se oculta (el valor sigue en el detalle al pasar el puntero)
  destino.querySelectorAll('.expo-barra i').forEach(i => { if (i.firstElementChild.scrollWidth > i.clientWidth) i.firstElementChild.style.visibility = 'hidden'; });
  $('#expMatriz').onchange = ev => alCambiar({ matriz: ev.target.value });
  $('#expAtributo').onchange = ev => alCambiar({ atributo: ev.target.value });
  $('#expApilar').onchange = ev => alCambiar({ apilar: ev.target.checked });
}

// Balance del plan: avance real menos el avance que debería llevar hoy según sus fechas planeadas (en rojo, atraso; en verde, al día o adelantado)
const balancePlan = v => v == null ? '<span class="sub">—</span>'
  : `<span class="balance-plan ${v < 0 ? 'atraso' : 'adelanto'}">${v > 0 ? '+' : ''}${Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %</span>`;

// Plan de acción: las actividades de los riesgos de la consulta, con lo planeado y lo ejecutado. vigente() dice si la pestaña sigue abierta al llegar los datos.
async function vistaPlanes(destino, consulta, vigente) {
  destino.innerHTML = '<p class="sub">Cargando…</p>';
  let planes;
  try { planes = await api('/riesgos-planes?' + qs(consulta)); }
  catch (e) { if (vigente()) destino.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }           // si falla, la pestaña lo dice en vez de quedarse «Cargando…»
  if (!vigente()) return;
  // Planeado y Ejecutado son una columna cada uno, con la fecha inicial sobre la final (así la tabla cabe sin desplazarla de lado)
  const fechas = (inicio, fin) => inicio || fin ? `<span class="fechas"><span>${inicio ? esc(inicio) : '—'}</span><span>${fin ? esc(fin) : '—'}</span></span>` : '<span class="sub">—</span>';
  destino.innerHTML = `<div class="tarjeta"><div class="encabezado"><h3>Plan de acción</h3><span class="cuenta-ctl">${planes.length} actividad${planes.length === 1 ? '' : 'es'}</span></div>
    ${planes.length ? `<div class="tabla-wrap"><table class="tabla-plan"><thead><tr><th>Proceso</th><th>Código</th><th>Riesgo</th><th>Actividad</th><th>Responsable</th><th>Estado</th><th>Avance</th><th>Balance</th>
      <th>Planeado<span class="sub-th">inicial · final</span></th><th>Ejecutado<span class="sub-th">inicial · final</span></th></tr></thead><tbody>
      ${planes.map(p => `<tr class="click" data-ir="#/riesgo/${p.riesgo_id}"><td>${esc(p.proceso)}</td><td class="mono">${esc(p.riesgo_codigo)}</td><td>${esc(p.riesgo)}</td><td>${esc(p.actividad)}</td>
        <td>${esc(p.responsable)}</td><td><span class="chip">${esc(p.estado)}</span></td><td class="num">${barraAvance(p.avance)}</td>
        <td class="num" title="${p.avance_planeado == null ? 'Sin fechas planeadas completas: no se puede calcular' : `Debería llevar ${pctZona(p.avance_planeado)} según sus fechas planeadas`}">${balancePlan(p.balance)}</td>
        <td>${fechas(p.planeado_inicio, p.planeado_fin)}</td><td>${fechas(p.ejecutado_inicio, p.ejecutado_fin)}</td></tr>`).join('')}</tbody></table></div>
      <p class="sub" style="margin:12px 4px 0">Balance: avance real menos el avance que debería llevar hoy según las fechas planeadas. En rojo, el plan va atrasado.</p>`
      : '<p class="vacio">Ningún riesgo de la matriz tiene planes de acción con estos criterios. Se crean desde la ficha de cada riesgo.</p>'}</div>`;
}
