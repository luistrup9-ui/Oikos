// SGI — indicadores, cuadro de mando y reporte de seguimiento (usa los utilitarios de app.js)
const FRECUENCIAS = ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'];
const UNIDADES = ['%', '#', '$', 'días', 'horas'];
const anioHoy = new Date().getFullYear();
const fmt = (v, u = '') => v == null ? '—' :
  (u === '$' ? '$ ' : '') + Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + (u === '%' ? ' %' : u && u !== '$' ? ' ' + u : '');
const sem = s => `<span class="sem ${esc(s)}" title="${{ verde: 'Cumple', amarillo: 'En alerta', rojo: 'No cumple', sin_dato: 'Sin dato' }[s] || ''}"></span>`;
const selAnio = (sel, desde = anioHoy - 3) => Array.from({ length: anioHoy - desde + 2 }, (_, i) => desde + i)
  .map(a => `<option ${a === sel ? 'selected' : ''}>${a}</option>`).join('');

// Gráfica SVG: barras por periodo coloreadas por semáforo y línea de meta
function grafica(serie, unidad, { alto = 220, mini = false } = {}) {
  const ancho = mini ? 120 : 720, m = mini ? { t: 2, r: 2, b: 2, l: 2 } : { t: 16, r: 12, b: 26, l: 48 };
  const vals = serie.flatMap(s => [s.valor, s.meta]).filter(v => v != null);
  if (!vals.length) return mini ? '<span class="sub">—</span>' : '<p class="vacio">Sin mediciones en este año.</p>';
  let min = Math.min(0, ...vals), max = Math.max(...vals);
  if (max === min) max = min + 1;
  const h = mini ? 28 : alto, iw = ancho - m.l - m.r, ih = h - m.t - m.b, paso = iw / serie.length;
  const y = v => m.t + ih - (v - min) / (max - min) * ih;
  const color = { verde: 'var(--verde)', amarillo: 'var(--amarillo)', rojo: 'var(--rojo)' };
  const barras = serie.map((s, i) => s.valor == null ? '' : `<rect x="${m.l + i * paso + paso * .2}" width="${paso * .6}"
    y="${Math.min(y(s.valor), y(0))}" height="${Math.max(1, Math.abs(y(s.valor) - y(0)))}" rx="2" fill="${color[s.semaforo] || 'var(--sin)'}">
    <title>${esc(s.etiqueta)}: ${fmt(s.valor, unidad)} (meta ${fmt(s.meta, unidad)})</title></rect>`).join('');
  const meta = serie.map((s, i) => `${i ? 'L' : 'M'}${m.l + i * paso + paso * .1},${y(s.meta)} L${m.l + (i + 1) * paso - paso * .1},${y(s.meta)}`).join(' ');
  const ejes = mini ? '' : [min, (min + max) / 2, max].map(v => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(Math.round(v * 10) / 10)}</text>
      <line x1="${m.l}" x2="${ancho - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--borde)"/>`).join('') +
    serie.map((s, i) => `<text x="${m.l + i * paso + paso / 2}" y="${h - 8}" text-anchor="middle">${esc(s.etiqueta)}</text>`).join('') +
    `<line x1="${m.l}" x2="${ancho - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--suave)"/>`;
  return `<svg class="grafica" viewBox="0 0 ${ancho} ${h}" ${mini ? `width="${ancho}" height="${h}"` : ''} role="img" aria-label="Serie del indicador">
    ${ejes}${barras}<path d="${meta}" fill="none" stroke="var(--texto)" stroke-width="${mini ? 1 : 2}" stroke-dasharray="${mini ? '2 2' : '6 4'}"/></svg>`;
}

// ---------- Cuadro de mando ----------
rutas.tablero = async function () {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  const b = await api('/bsc?' + p);
  if (!b.plan) {
    vista.innerHTML = `<div class="encabezado"><h2>Cuadro de mando</h2></div><p class="vacio">No hay planes estratégicos.</p>`;
    return;
  }
  const pct = v => v == null ? '—' : Math.round(v) + ' %';
  const barra = (v, s) => `<div class="progreso ${s}"><i style="width:${v ?? 0}%"></i></div>`;
  vista.innerHTML = `
    <div class="encabezado"><div><h2>${esc(b.plan.nombre)}</h2><p class="sub" style="margin:0">Mapa de objetivos · cumplimiento promedio de sus indicadores</p></div>
      <div class="acciones">
        <select id="plan">${opciones(b.planes, b.plan.id)}</select>
        <select id="anio">${Array.from({ length: b.plan.anio_fin - b.plan.anio_inicio + 1 }, (_, i) => b.plan.anio_inicio + i)
          .map(a => `<option ${a === b.anio ? 'selected' : ''}>${a}</option>`).join('')}</select>
        ${esCalidad() ? '<button class="btn" id="nuevoPlan">Nuevo plan</button><button class="btn primario" id="nuevoObj">Nuevo objetivo</button>' : ''}
      </div></div>
    <div class="kpis"><div class="kpi"><b>${pct(b.cumplimiento)}</b><span>Cumplimiento global ${b.anio}</span></div>
      ${b.perspectivas.map(p => `<div class="kpi"><b>${pct(p.cumplimiento)}</b><span>${sem(p.semaforo)} ${esc(p.nombre)}</span></div>`).join('')}</div>
    <div class="bsc">${b.perspectivas.map(p => `
      <section class="perspectiva"><header><h3>${esc(p.nombre)}</h3>${barra(p.cumplimiento, p.semaforo)}<span class="sub">${pct(p.cumplimiento)}</span></header>
        <div class="objetivos">${p.objetivos.map(o => `
          <div class="objetivo ${o.semaforo}">
            <div class="encabezado" style="margin:0"><b>${esc(o.codigo)} · ${esc(o.nombre)}</b>
              ${esCalidad() ? `<button class="btn chico texto" data-obj="${o.id}" title="Editar objetivo">✎</button>` : ''}</div>
            ${barra(o.cumplimiento, o.semaforo)}<small class="sub">Cumplimiento ${pct(o.cumplimiento)} · ${esc(o.responsable || 'Sin responsable')}</small>
            <ul>${o.indicadores.map(i => `<li>${sem(i.semaforo)}<a href="#/indicador/${i.id}?anio=${b.anio}">${esc(i.nombre)}</a>
              <span class="num">${fmt(i.ultimo?.valor, i.unidad)}</span></li>`).join('') || '<li class="sub">Sin indicadores asociados</li>'}</ul>
            ${o.planes.length ? `<p class="sub" style="margin:8px 0 0">Planes de acción: ${o.planes.length} · avance ${pct(o.avance_planes)}</p>` : ''}
            ${yo.rol !== 'consulta' ? `<button class="btn chico" style="margin-top:8px" data-plan="${o.id}">+ Plan de acción</button>` : ''}
          </div>`).join('') || '<p class="sub">Sin objetivos.</p>'}</div>
      </section>`).join('')}</div>`;

  const ir = () => location.hash = `#/tablero?plan=${$('#plan').value}&anio=${$('#anio').value}`;
  $('#plan').onchange = () => location.hash = `#/tablero?plan=${$('#plan').value}`;
  $('#anio').onchange = ir;
  const todosObj = b.perspectivas.flatMap(p => p.objetivos);
  const editarObj = intentar(async o => {
    const v = await modal(o ? 'Editar objetivo' : 'Nuevo objetivo', `<div class="form">
      <label>Perspectiva<select name="perspectiva_id">${opciones(b.perspectivas, o?.perspectiva_id)}</select></label>
      <label>Código<input name="codigo" value="${esc(o?.codigo)}" placeholder="OE7"></label>
      <label class="ancho">Nombre<input name="nombre" required value="${esc(o?.nombre)}"></label>
      <label class="ancho">Responsable<select name="responsable_id">${opciones(cat.usuarios, o?.responsable_id, '—')}</select></label>
      <label class="ancho">Descripción<textarea name="descripcion">${esc(o?.descripcion)}</textarea></label></div>`);
    if (!v) return;
    await api('/objetivos', { method: 'POST', body: { ...v, id: o?.id } }); aviso('Objetivo guardado'); rutas.tablero();
  });
  $('#nuevoObj')?.addEventListener('click', () => editarObj(null));
  vista.querySelectorAll('[data-obj]').forEach(x => x.onclick = () => editarObj(todosObj.find(o => o.id == x.dataset.obj)));
  vista.querySelectorAll('[data-plan]').forEach(x => x.onclick = () => editarPlanAccion({ objetivo_id: Number(x.dataset.plan) }, rutas.tablero));
  $('#nuevoPlan')?.addEventListener('click', intentar(async () => {
    const v = await modal('Nuevo plan estratégico', `<p class="sub">Se crea con las 4 perspectivas del BSC.</p><div class="form">
      <label class="ancho">Nombre<input name="nombre" required placeholder="Plan Estratégico 2027-2029"></label>
      <label>Año inicial<input type="number" name="anio_inicio" required value="${anioHoy + 1}"></label>
      <label>Año final<input type="number" name="anio_fin" value="${anioHoy + 1}"></label></div>`, { aceptar: 'Crear' });
    if (!v) return;
    const { id } = await api('/planes-estrategicos', { method: 'POST', body: v });
    location.hash = '#/tablero?plan=' + id;
  }));
};

async function editarPlanAccion(a, alTerminar) {
  const v = await modal(a.id ? 'Actualizar plan de acción' : 'Nuevo plan de acción', `<div class="form">
    <label class="ancho">Acción<input name="nombre" required value="${esc(a.nombre)}"></label>
    <label>Responsable<select name="responsable_id">${opciones(cat.usuarios.filter(u => u.rol !== 'consulta'), a.responsable_id ?? yo.id)}</select></label>
    <label>Avance (%)<input type="number" name="avance" min="0" max="100" value="${a.avance ?? 0}"></label>
    <label>Inicio<input type="date" name="fecha_inicio" value="${esc(a.fecha_inicio)}"></label>
    <label>Fin<input type="date" name="fecha_fin" value="${esc(a.fecha_fin)}"></label>
    <label class="ancho">Observaciones<textarea name="observaciones">${esc(a.observaciones)}</textarea></label></div>`);
  if (!v) return;
  try {
    await api('/planes-accion', { method: 'POST', body: { ...v, id: a.id, objetivo_id: a.objetivo_id, indicador_id: a.indicador_id, riesgo_id: a.riesgo_id } });
    aviso('Plan de acción guardado'); alTerminar();
  } catch (e) { aviso(e.message, true); }
}

// ---------- Listado de indicadores ----------
rutas.indicadores = async function () {
  vista.innerHTML = `
    <div class="encabezado"><h2>Indicadores</h2>
      <div class="acciones"><button class="btn" id="exportar">Exportar CSV</button>
        ${esCalidad() ? '<button class="btn primario" id="nuevo">Nuevo indicador</button>' : ''}</div></div>
    <form class="tarjeta filtros" id="filtros">
      <label>Buscar<input name="texto" placeholder="Código o nombre"></label>
      <label>Proceso<select name="proceso" multiple>${opciones(cat.procesos)}</select></label>
      <label>Semáforo<select name="semaforo" multiple><option value="verde">Cumple</option><option value="amarillo">En alerta</option>
        <option value="rojo">No cumple</option><option value="sin_dato">Sin dato</option></select></label>
      <label>Año<select name="anio">${selAnio(anioHoy)}</select></label>
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form>
    <div id="resultado"></div>`;
  let lista = [];
  const cargar = intentar(async () => {
    const f = valoresForm($('#filtros'));
    lista = await api('/indicadores?' + qs(f));
    $('#resultado').innerHTML = lista.length ? `<div class="tabla-wrap"><table><thead><tr><th></th><th>Código</th><th>Indicador</th>
      <th>Proceso</th><th>Frecuencia</th><th>Tendencia ${esc(f.anio)}</th><th class="num">Previo</th><th class="num">Último</th>
      <th class="num">Meta</th><th>Pendiente</th></tr></thead><tbody>
      ${lista.map(i => `<tr class="click" onclick="location.hash='#/indicador/${i.id}?anio=${esc(f.anio)}'"><td>${sem(i.semaforo)}</td>
        <td class="mono">${esc(i.codigo)}</td><td>${esc(i.nombre)}</td><td>${esc(i.proceso)}</td><td>${esc(i.frecuencia)}</td>
        <td>${grafica(i.serie, i.unidad, { mini: true })}</td><td class="num">${fmt(i.previo?.valor, i.unidad)}</td>
        <td class="num"><b>${fmt(i.ultimo?.valor, i.unidad)}</b><br><small class="sub">${esc(i.ultimo ? i.ultimo.etiqueta + ' ' + i.ultimo.anio : '')}</small></td>
        <td class="num">${i.sentido === 'Descendente' ? '≤ ' : '≥ '}${fmt(i.meta, i.unidad)}</td>
        <td>${i.faltantes.length ? `<span class="faltan">Falta: ${esc(i.faltantes.join(', '))}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="vacio">No hay indicadores con estos criterios.</p>';
  });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); cargar(); });
  $('#nuevo')?.addEventListener('click', () => editarIndicador({}));
  $('#exportar').onclick = () => exportarCSV('indicadores.csv', lista.map(i => ({ ...i, ultimo_valor: i.ultimo?.valor, previo_valor: i.previo?.valor })),
    [['codigo', 'Código'], ['nombre', 'Indicador'], ['proceso', 'Proceso'], ['formula', 'Fórmula'], ['frecuencia', 'Frecuencia'],
     ['sentido', 'Sentido'], ['meta', 'Meta'], ['unidad', 'Unidad'], ['previo_valor', 'Medición previa'], ['ultimo_valor', 'Último valor'],
     ['semaforo', 'Semáforo'], ['responsable', 'Responsable']]);
  cargar();
};

async function editarIndicador(i) {
  const objetivos = (await api('/bsc')).perspectivas.flatMap(p => p.objetivos);
  const sel = (n, lista, v) => `<select name="${n}">${lista.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  const v = await modal(i.id ? 'Editar indicador' : 'Nuevo indicador', `<div class="form">
    <label class="ancho">Nombre<input name="nombre" required value="${esc(i.nombre)}"></label>
    <label>Proceso<select name="proceso_id" required>${opciones(cat.procesos, i.proceso_id ?? yo.proceso_id)}</select></label>
    <label>Código<input name="codigo" value="${esc(i.codigo)}" placeholder="Automático"></label>
    <label class="ancho">Objetivo estratégico<select name="objetivo_id">${opciones(objetivos.map(o => ({ id: o.id, nombre: `${o.codigo} · ${o.nombre}` })), i.objetivo_id, '— Ninguno —')}</select></label>
    <label class="ancho">Propósito<input name="proposito" value="${esc(i.proposito)}"></label>
    <label class="ancho">Fórmula<input name="formula" value="${esc(i.formula)}" placeholder="Ej: unidades conformes / unidades inspeccionadas × 100"></label>
    <label>Cálculo<select name="calculo"><option value="razon" ${i.calculo === 'razon' ? 'selected' : ''}>Numerador / denominador</option>
      <option value="directo" ${i.calculo === 'directo' ? 'selected' : ''}>Valor directo</option></select></label>
    <label>Unidad${sel('unidad', UNIDADES, i.unidad)}</label>
    <label>Frecuencia${sel('frecuencia', FRECUENCIAS, i.frecuencia)}</label>
    <label>Sentido${sel('sentido', ['Ascendente', 'Descendente'], i.sentido)}</label>
    <label>Meta<input type="number" step="any" name="meta" required value="${esc(i.meta)}"></label>
    <label>Tolerancia de alerta (%)<input type="number" step="any" name="tolerancia" value="${esc(i.tolerancia ?? 10)}"></label>
    <label>Responsable de medir<select name="responsable_id">${opciones(cat.usuarios.filter(u => u.rol !== 'consulta'), i.responsable_id ?? yo.id)}</select></label>
    <label>Fuente de datos<input name="fuente" value="${esc(i.fuente)}"></label>
    ${i.id ? `<label>Estado<select name="activo"><option value="1">Activo</option><option value="0" ${i.activo === 0 ? 'selected' : ''}>Inactivo</option></select></label>` : ''}
    </div><p class="sub" style="margin:0">Semáforo: verde si cumple la meta, amarillo si queda dentro de la tolerancia, rojo si no.</p>`);
  if (!v) return;
  try {
    const { id } = await api('/indicadores' + (i.id ? '/' + i.id : ''), { method: i.id ? 'PUT' : 'POST', body: v });
    aviso('Indicador guardado');
    if (location.hash.startsWith('#/indicador/')) rutas.indicador(); else location.hash = '#/indicador/' + id;
  } catch (e) { aviso(e.message, true); }
}

// ---------- Ficha del indicador ----------
rutas.indicador = async function () {
  const [ruta, query = ''] = location.hash.split('?');
  const id = ruta.split('/')[2], anio = Number(new URLSearchParams(query).get('anio')) || anioHoy;
  const i = await api(`/indicadores/${id}?anio=${anio}`);
  const medicion = p => i.mediciones.find(m => m.periodo === p);
  vista.innerHTML = `
    <div class="encabezado"><div><a href="#/indicadores">← Indicadores</a>
      <h2 style="margin-top:6px">${sem(i.semaforo)} <span class="mono">${esc(i.codigo)}</span> · ${esc(i.nombre)}</h2></div>
      <div class="acciones"><select id="anio">${selAnio(anio, Math.min(anioHoy - 3, ...i.anios))}</select>
        ${i.puede_editar ? '<button class="btn" id="editar">Editar</button>' : ''}</div></div>
    <div class="kpis">
      <div class="kpi"><b>${fmt(i.ultimo?.valor, i.unidad)}</b><span>Último valor ${esc(i.ultimo ? `(${i.ultimo.etiqueta} ${i.ultimo.anio})` : '')}</span></div>
      <div class="kpi"><b>${fmt(i.previo?.valor, i.unidad)}</b><span>Medición previa ${esc(i.previo ? `(${i.previo.etiqueta} ${i.previo.anio})` : '')}</span></div>
      <div class="kpi"><b>${i.sentido === 'Descendente' ? '≤' : '≥'} ${fmt(i.meta, i.unidad)}</b><span>Meta</span></div>
      <div class="kpi"><b>${i.cumplimiento == null ? '—' : Math.round(i.cumplimiento) + ' %'}</b><span>Cumplimiento</span></div>
    </div>
    <div class="ficha">
      <div>
        <div class="tarjeta"><h3>Comportamiento ${anio}</h3>${grafica(i.serie, i.unidad)}
          <p class="sub" style="margin:6px 0 0">Barras: resultado del periodo · línea punteada: meta</p></div>
        <div class="tarjeta"><h3>Mediciones ${anio}</h3><div class="tabla-wrap"><table><thead><tr><th>Periodo</th>
          ${i.calculo === 'razon' ? '<th class="num">Numerador</th><th class="num">Denominador</th>' : ''}<th class="num">Resultado</th>
          <th class="num">Meta</th><th></th><th>Análisis</th><th>Registró</th><th></th></tr></thead><tbody>
          ${i.serie.map(s => { const m = medicion(s.periodo); return `<tr><td>${esc(s.etiqueta)}</td>
            ${i.calculo === 'razon' ? `<td class="num">${fmt(m?.numerador)}</td><td class="num">${fmt(m?.denominador)}</td>` : ''}
            <td class="num"><b>${fmt(s.valor, i.unidad)}</b></td><td class="num">${fmt(s.meta, i.unidad)}</td><td>${sem(s.semaforo)}</td>
            <td>${esc(m?.analisis)}</td><td><small>${esc(m?.usuario)}<br>${fecha(m?.fecha)}</small></td>
            <td>${i.puede_medir ? `<button class="btn chico ${m ? '' : 'primario'}" data-p="${s.periodo}">${m ? 'Corregir' : 'Registrar'}</button>` : ''}</td></tr>`; }).join('')}
          </tbody></table></div></div>
      </div>
      <div>
        <div class="tarjeta"><h3>Hoja de vida</h3><dl class="datos">
          <dt>Proceso</dt><dd>${esc(i.proceso)}</dd><dt>Objetivo</dt><dd>${esc(i.objetivo ? i.objetivo_codigo + ' · ' + i.objetivo : '—')}</dd>
          <dt>Propósito</dt><dd>${esc(i.proposito) || '—'}</dd><dt>Fórmula</dt><dd>${esc(i.formula) || '—'}</dd>
          <dt>Frecuencia</dt><dd>${esc(i.frecuencia)}</dd><dt>Sentido</dt><dd>${esc(i.sentido)}</dd>
          <dt>Tolerancia</dt><dd>${fmt(i.tolerancia)} %</dd><dt>Responsable</dt><dd>${esc(i.responsable)}</dd>
          <dt>Fuente</dt><dd>${esc(i.fuente) || '—'}</dd><dt>Estado</dt><dd>${i.activo ? 'Activo' : 'Inactivo'}</dd></dl></div>
        <div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Planes de acción</h3>
          ${yo.rol !== 'consulta' ? '<button class="btn chico" id="nuevoPlanA">+ Nuevo</button>' : ''}</div>
          ${i.planes.map((a, k) => `<div style="margin-bottom:10px"><b>${esc(a.nombre)}</b> <span class="chip">${esc(a.estado)}</span>
            <div class="progreso"><i style="width:${a.avance}%"></i></div>
            <small class="sub">${Math.round(a.avance)} % · ${esc(a.responsable)} · vence ${fecha(a.fecha_fin)}</small>
            ${esCalidad() || a.responsable_id === yo.id ? ` <button class="btn chico texto" data-a="${k}">Actualizar</button>` : ''}</div>`).join('')
            || '<p class="sub">Sin planes. Si el indicador no cumple, registra aquí las acciones.</p>'}</div>
      </div>
    </div>`;

  $('#anio').onchange = () => location.hash = `#/indicador/${id}?anio=${$('#anio').value}`;
  $('#editar')?.addEventListener('click', () => editarIndicador(i));
  $('#nuevoPlanA')?.addEventListener('click', () => editarPlanAccion({ indicador_id: i.id }, rutas.indicador));
  vista.querySelectorAll('[data-a]').forEach(x => x.onclick = () => editarPlanAccion(i.planes[x.dataset.a], rutas.indicador));
  vista.querySelectorAll('[data-p]').forEach(x => x.onclick = intentar(async () => {
    const p = Number(x.dataset.p), m = medicion(p) || {};
    const v = await modal(`${i.nombre} · ${i.serie[p - 1].etiqueta} ${anio}`, `
      ${i.formula ? `<p class="sub" style="margin:0">Fórmula: ${esc(i.formula)}</p>` : ''}
      <div class="form">${i.calculo === 'razon'
        ? `<label>Numerador<input type="number" step="any" name="numerador" required value="${esc(m.numerador)}"></label>
           <label>Denominador<input type="number" step="any" name="denominador" required value="${esc(m.denominador)}"></label>`
        : `<label class="ancho">Resultado (${esc(i.unidad)})<input type="number" step="any" name="valor" required value="${esc(m.valor)}"></label>`}
      <label class="ancho">Análisis del resultado <small>(obligatorio si no cumple la meta)</small><textarea name="analisis">${esc(m.analisis)}</textarea></label></div>`,
      { aceptar: 'Guardar medición' });
    if (!v) return;
    const res = await api(`/indicadores/${i.id}/mediciones`, { method: 'POST', body: { ...v, anio, periodo: p } });
    aviso(`Guardado: ${fmt(res.valor, i.unidad)}`); rutas.indicador();
  }));
};

// ---------- Seguimiento al MOP (reporte en árbol, como Almera) ----------
const tendencia = i => {
  if (i.ultimo?.valor == null || i.previo?.valor == null) return null;
  const d = i.ultimo.valor - i.previo.valor;
  return !d ? 'Igual' : (i.sentido === 'Descendente' ? d < 0 : d > 0) ? 'Mejor' : 'Peor';
};
const flecha = t => t ? `<span class="tend ${t}" title="${t}">${{ Mejor: '⇈', Peor: '⇊', Igual: '=' }[t]}</span>` : '';
const chispa = serie => { // mini línea de tendencia (sparkline) con los valores del año
  const v = serie.map(s => s.valor).filter(x => x != null);
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), y = x => 13 - (x - min) / ((max - min) || 1) * 12;
  return `<svg class="chispa" viewBox="0 0 70 14" width="70" height="14"><polyline fill="none" stroke="#00f" stroke-width="1"
    points="${v.map((x, i) => `${(i / (v.length - 1) * 68 + 1).toFixed(1)},${y(x).toFixed(1)}`).join(' ')}"/></svg>`;
};
const abiertosMop = new Set();
rutas.seguimiento = async function () {
  const anio = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('anio')) || anioHoy;
  const lista = await api('/indicadores?anio=' + anio);
  const color = { verde: '#008000', amarillo: '#c99700', rojo: '#f00', sin_dato: '#808080' };
  const nombreSem = { verde: 'Cumple', amarillo: 'En alerta', rojo: 'No cumple', sin_dato: 'Sin dato' };
  let filas = '';
  for (const c of ['Estratégico', 'Misional', 'Apoyo']) {
    filas += `<tr class="mop-cat" data-nodo="${c}"><td colspan="7"><span class="expansor"></span>${c}</td></tr>`;
    // Procesos raíz siempre; subprocesos solo si tienen indicadores propios
    for (const p of cat.procesos.filter(p => p.categoria === c && (!p.padre_id || lista.some(i => i.proceso_id === p.id)))) {
      const inds = lista.filter(i => i.proceso_id === p.id), id = 'p' + p.id;
      filas += `<tr class="mop-proc${inds.length ? '' : ' sin-hijos'}" data-nodo="${id}" data-padre="${c}"><td colspan="7"><span class="expansor"></span>${esc(p.nombre)}</td></tr>` +
        inds.map(i => `<tr class="mop-ind" data-padre="${id}"><td><a href="#/indicador/${i.id}?anio=${anio}" title="${esc(i.nombre)}">${esc(i.nombre)}</a></td>
          <td>${chispa(i.serie)}</td><td class="num">${fmt(i.previo?.valor, i.unidad)}</td><td>${flecha(tendencia(i))}</td>
          <td class="num" style="color:${color[i.semaforo]}">${fmt(i.ultimo?.valor, i.unidad)}</td><td class="num">${fmt(i.meta, i.unidad)}</td>
          <td><i class="punto" style="background:${color[i.semaforo]};box-shadow:0 0 5px ${color[i.semaforo]}" title="${nombreSem[i.semaforo]}"></i></td></tr>`).join('');
    }
  }
  vista.innerHTML = `
    <h2 class="titulo-form">Seguimiento al MOP</h2>
    <div class="controles"><label class="en-linea">Año <select id="anio">${selAnio(anio)}</select></label>
      <span class="espacio"></span><button class="btn" id="exportar"><i class="ic ic-excel"></i> Exportar</button>
      <button class="btn icono-solo" title="Imprimir" onclick="window.print()"><i class="ic ic-imprimir"></i></button></div>
    <div class="etiquetas"><span class="sgitag" id="expandir" role="button">+ Expandir</span><span class="sgitag" id="colapsar" role="button">- Colapsar</span></div>
    <div class="tabla-wrap"><table class="arbol mop"><thead><tr><th>Nombre</th><th></th><th>Medición previa</th><th></th><th>Último valor</th><th>Meta</th><th></th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;
  const tabla = vista.querySelector('table.mop');
  // Una fila se ve solo si todos sus ancestros están abiertos
  const pintar = () => tabla.querySelectorAll('tbody tr').forEach(tr => {
    let padre = tr.dataset.padre, visible = true;
    while (padre) { if (!abiertosMop.has(padre)) { visible = false; break; } padre = tabla.querySelector(`tr[data-nodo="${padre}"]`)?.dataset.padre; }
    tr.hidden = !visible;
    if (tr.dataset.nodo) tr.classList.toggle('abierto', abiertosMop.has(tr.dataset.nodo));
  });
  tabla.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-nodo]');
    if (!tr) return;
    const n = tr.dataset.nodo; abiertosMop.has(n) ? abiertosMop.delete(n) : abiertosMop.add(n); pintar();
  });
  $('#expandir').onclick = () => { tabla.querySelectorAll('tr[data-nodo]').forEach(tr => abiertosMop.add(tr.dataset.nodo)); pintar(); };
  $('#colapsar').onclick = () => { abiertosMop.clear(); pintar(); };
  pintar();
  $('#anio').onchange = () => location.hash = '#/seguimiento?anio=' + $('#anio').value;
  $('#exportar').onclick = intentar(async () => {
    const v = await modal('Exportar', `<table class="tblform"><tr><th>Formato</th><td><select name="formato">
      <option value="xlsx">XLSX</option><option value="csv">CSV</option></select></td></tr></table>`, { aceptar: 'Exportar' });
    if (!v) return;
    const a = document.createElement('a');
    a.href = '/api/mop/exportar?' + qs({ anio, formato: v.formato }); a.download = ''; a.click();
  });
};

// ---------- Mediciones pendientes en "Mi plan de trabajo" ----------
const inicioDocumental = rutas.inicio;
rutas.inicio = async function () {
  await inicioDocumental();
  const pend = await api('/indicadores-pendientes');
  if (!pend.length) return;
  vista.insertAdjacentHTML('beforeend', `<div class="tarjeta"><h3>Mediciones de indicadores atrasadas</h3>
    <div class="tabla-wrap"><table><thead><tr><th>Indicador</th><th>Proceso</th><th>Periodos sin medir</th></tr></thead><tbody>
    ${pend.map(i => `<tr class="click" onclick="location.hash='#/indicador/${i.id}'"><td>${esc(i.nombre)}</td><td>${esc(i.proceso)}</td>
      <td class="faltan">${esc(i.faltantes.join(', '))}</td></tr>`).join('')}</tbody></table></div></div>`);
};
