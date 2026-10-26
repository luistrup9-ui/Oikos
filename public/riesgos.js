// SGI — matriz de riesgos, mapa de calor y controles (usa los utilitarios de app.js e indicadores.js)
const ZONAS = ['Baja', 'Moderada', 'Alta', 'Extrema'];
const COLOR_ZONA = { Baja: 'var(--z-Baja)', Moderada: 'var(--z-Moderada)', Alta: 'var(--z-Alta)', Extrema: 'var(--z-Extrema)' };
const zonaDe = (p, i) => { const s = p * i; return s >= 15 ? 'Extrema' : s >= 10 ? 'Alta' : s >= 5 ? 'Moderada' : 'Baja'; };
const zonaTag = z => `<span class="zona ${esc(z)}">${esc(z)}</span>`;
let catR = null;
const catalogosRiesgo = async () => catR || (catR = await api('/riesgos/catalogos'));
const puedeCrearRiesgo = () => esCalidad() || yo.rol === 'lider_proceso';

// ---------- Matriz de riesgos ----------
rutas.riesgos = async function () {
  const cr = await catalogosRiesgo();
  const estado = { matriz: 'absoluto', agrupar: 'proceso', apilar: false, celda: null };
  vista.innerHTML = `
    <div class="encabezado"><h2>Matriz de riesgos</h2>
      <div class="acciones"><button class="btn" id="exportar">Exportar CSV</button>
        ${puedeCrearRiesgo() ? '<button class="btn primario" id="nuevo">Nuevo riesgo</button>' : ''}</div></div>
    <form class="tarjeta filtros" id="filtros">
      <label>Buscar<input name="texto" placeholder="Código o nombre"></label>
      <label>Proceso<select name="proceso" multiple>${opciones(cat.procesos)}</select></label>
      <label>Tipo de riesgo<select name="tipo" multiple>${cr.tipos.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label>Zona<select name="zona" multiple>${ZONAS.map(z => `<option>${z}</option>`).join('')}</select></label>
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form>
    <div class="kpis" id="kpis"></div>
    <div class="ficha">
      <div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Mapa de calor</h3>
        <div class="tabs" style="margin:0;border:none"><button type="button" data-m="absoluto" class="activo">Riesgo absoluto</button>
          <button type="button" data-m="residual">Riesgo residual</button></div></div><div id="calor"></div></div>
      <div class="tarjeta dist"><div class="encabezado"><h3 style="margin:0">Distribución</h3>
        <div class="acciones"><select id="agrupar"><option value="proceso">Por proceso</option><option value="tipo">Por tipo de riesgo</option></select>
          <label style="flex-direction:row;align-items:center"><input type="checkbox" id="apilar"> Apilar 100 %</label></div></div>
        <div id="distribucion"></div></div>
    </div>
    <div class="tarjeta"><div class="encabezado"><h3 style="margin:0" id="tituloLista">Riesgos</h3>
      <button class="btn chico" id="quitarCelda" hidden>Ver todos</button></div><div id="lista"></div></div>`;

  let riesgos = [];
  const campo = x => estado.matriz === 'residual'
    ? { p: x.probabilidad_residual, i: x.impacto_residual, z: x.zona_residual } : { p: x.probabilidad, i: x.impacto, z: x.zona };

  function pintar() {
    const visibles = estado.celda ? riesgos.filter(x => { const c = campo(x); return c.p === estado.celda[0] && c.i === estado.celda[1]; }) : riesgos;
    $('#kpis').innerHTML = `<div class="kpi"><b>${riesgos.length}</b><span>Riesgos activos</span></div>` +
      ZONAS.slice().reverse().map(z => `<div class="kpi"><b>${riesgos.filter(x => campo(x).z === z).length}</b><span>${zonaTag(z)} ${estado.matriz}</span></div>`).join('');

    // Mapa de calor: filas = probabilidad (5 arriba), columnas = impacto
    let html = '';
    for (let p = 5; p >= 1; p--) {
      html += `<div class="eje">${p} · ${esc(cr.probabilidad[p - 1])}</div>`;
      for (let i = 1; i <= 5; i++) {
        const aqui = riesgos.filter(x => { const c = campo(x); return c.p === p && c.i === i; });
        const sel = estado.celda && estado.celda[0] === p && estado.celda[1] === i;
        html += `<div class="celda ${zonaDe(p, i)} ${aqui.length ? '' : 'vacia'} ${sel ? 'sel' : ''}" data-c="${p},${i}"
          title="Probabilidad ${p} × Impacto ${i} = ${p * i}">${aqui.length ? `<b>${aqui.length}</b><small>${aqui.map(x => esc(x.codigo)).join(', ')}</small>` : ''}</div>`;
      }
    }
    html += '<div></div>' + cr.impacto.map((n, k) => `<div class="eje">${k + 1} · ${esc(n)}</div>`).join('');
    $('#calor').innerHTML = `<div class="calor">${html}</div><p class="sub" style="margin:8px 0 0">Filas: probabilidad · columnas: impacto. Haz clic en una casilla para filtrar.</p>`;
    $('#calor').querySelectorAll('[data-c]').forEach(c => c.onclick = () => {
      const [p, i] = c.dataset.c.split(',').map(Number);
      estado.celda = estado.celda && estado.celda[0] === p && estado.celda[1] === i ? null : [p, i]; pintar();
    });

    // Distribución por proceso o tipo, barras apiladas por zona
    const grupos = {};
    riesgos.forEach(x => { const g = estado.agrupar === 'tipo' ? x.tipo : x.proceso; (grupos[g] = grupos[g] || []).push(x); });
    const max = Math.max(1, ...Object.values(grupos).map(g => g.length));
    $('#distribucion').innerHTML = Object.entries(grupos).map(([g, xs]) => {
      const base = estado.apilar ? xs.length : max;
      return `<div class="fila"><span>${esc(g)}</span><div class="apilada">${ZONAS.map(z => {
        const n = xs.filter(x => campo(x).z === z).length;
        return n ? `<i style="width:${n / base * 100}%;background:${COLOR_ZONA[z]}" title="${z}: ${n}"></i>` : '';
      }).join('')}</div><b>${xs.length}</b></div>`;
    }).join('') || '<p class="vacio">Sin datos.</p>';

    $('#tituloLista').textContent = estado.celda ? `Riesgos en probabilidad ${estado.celda[0]} × impacto ${estado.celda[1]}` : `Riesgos (${visibles.length})`;
    $('#quitarCelda').hidden = !estado.celda;
    $('#lista').innerHTML = visibles.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Riesgo</th><th>Proceso</th><th>Tipo</th>
      <th class="num">P×I</th><th>Absoluto</th><th class="num">Controles</th><th class="num">P×I</th><th>Residual</th><th>Tratamiento</th><th>Responsable</th></tr></thead><tbody>
      ${visibles.map(x => `<tr class="click" onclick="location.hash='#/riesgo/${x.id}'"><td class="mono">${esc(x.codigo)}</td><td>${esc(x.nombre)}</td>
        <td>${esc(x.proceso)}</td><td>${esc(x.tipo)}</td><td class="num">${x.probabilidad}×${x.impacto}</td><td>${zonaTag(x.zona)}</td>
        <td class="num">${x.total_controles}</td><td class="num">${x.probabilidad_residual}×${x.impacto_residual}</td><td>${zonaTag(x.zona_residual)}</td>
        <td>${esc(x.tratamiento)}</td><td>${esc(x.responsable)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">No hay riesgos con estos criterios.</p>';
  }

  const cargar = intentar(async () => { riesgos = await api('/riesgos?' + qs({ ...valoresForm($('#filtros')), matriz: estado.matriz })); estado.celda = null; pintar(); });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); cargar(); });
  vista.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    estado.matriz = b.dataset.m; vista.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('activo', x === b));
    if (valoresForm($('#filtros')).zona) cargar(); else pintar();
  });
  $('#agrupar').onchange = e => { estado.agrupar = e.target.value; pintar(); };
  $('#apilar').onchange = e => { estado.apilar = e.target.checked; pintar(); };
  $('#quitarCelda').onclick = () => { estado.celda = null; pintar(); };
  $('#nuevo')?.addEventListener('click', () => editarRiesgo({}));
  $('#exportar').onclick = () => exportarCSV('matriz-riesgos.csv', riesgos,
    [['codigo', 'Código'], ['proceso', 'Proceso'], ['tipo', 'Tipo'], ['nombre', 'Riesgo'], ['causas', 'Causas'], ['consecuencias', 'Consecuencias'],
     ['probabilidad', 'Probabilidad'], ['impacto', 'Impacto'], ['zona', 'Zona absoluta'], ['total_controles', 'Controles'],
     ['probabilidad_residual', 'Probabilidad residual'], ['impacto_residual', 'Impacto residual'], ['zona_residual', 'Zona residual'],
     ['tratamiento', 'Tratamiento'], ['responsable', 'Responsable']]);
  cargar();
};

async function editarRiesgo(x) {
  const cr = await catalogosRiesgo();
  const procesos = esCalidad() ? cat.procesos : cat.procesos.filter(p => p.id === yo.proceso_id);
  const escala = (n, lista, v) => `<select name="${n}" required>${lista.map((t, k) => `<option value="${k + 1}" ${Number(v) === k + 1 ? 'selected' : ''}>${k + 1} · ${esc(t)}</option>`).join('')}</select>`;
  const v = await modal(x.id ? 'Editar riesgo' : 'Nuevo riesgo', `<div class="form">
    <label class="ancho">Riesgo<input name="nombre" required value="${esc(x.nombre)}" placeholder="Posibilidad de… debido a… que genera…"></label>
    <label>Proceso<select name="proceso_id" required>${opciones(procesos, x.proceso_id ?? yo.proceso_id)}</select></label>
    <label>Tipo de riesgo<select name="tipo" required>${cr.tipos.map(t => `<option ${t === x.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="ancho">Causas<textarea name="causas">${esc(x.causas)}</textarea></label>
    <label class="ancho">Consecuencias<textarea name="consecuencias">${esc(x.consecuencias)}</textarea></label>
    <label>Probabilidad (sin controles)${escala('probabilidad', cr.probabilidad, x.probabilidad ?? 3)}</label>
    <label>Impacto (sin controles)${escala('impacto', cr.impacto, x.impacto ?? 3)}</label>
    <label>Tratamiento<select name="tratamiento">${['Reducir', 'Aceptar', 'Evitar', 'Compartir'].map(t => `<option ${t === x.tratamiento ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Responsable<select name="responsable_id">${opciones(cat.usuarios.filter(u => u.rol !== 'consulta'), x.responsable_id ?? yo.id)}</select></label>
    <label class="ancho">Descripción<textarea name="descripcion">${esc(x.descripcion)}</textarea></label></div>`);
  if (!v) return;
  try {
    const { id } = await api('/riesgos' + (x.id ? '/' + x.id : ''), { method: x.id ? 'PUT' : 'POST', body: v });
    aviso('Riesgo guardado');
    if (location.hash.startsWith('#/riesgo/')) rutas.riesgo(); else location.hash = '#/riesgo/' + id;
  } catch (e) { aviso(e.message, true); }
}

// ---------- Ficha del riesgo ----------
rutas.riesgo = async function () {
  const id = location.hash.split('?')[0].split('/')[2];
  const x = await api('/riesgos/' + id);
  const cr = await catalogosRiesgo();
  const mes = new Date().toISOString().slice(0, 7);
  const puedeMonitorear = c => x.puede_editar || c.responsable_gestion_id === yo.id;
  vista.innerHTML = `
    <div class="encabezado"><div><a href="#/riesgos">← Matriz de riesgos</a>
      <h2 style="margin-top:6px"><span class="mono">${esc(x.codigo)}</span> · ${esc(x.nombre)}</h2></div>
      <div class="acciones">${x.puede_editar ? '<button class="btn" id="editar">Editar</button>' : ''}
        ${esCalidad() ? '<button class="btn peligro" id="retirar">Retirar de la matriz</button>' : ''}</div></div>
    <div class="tarjeta flecha">
      <div class="caja"><span class="sub">Riesgo absoluto</span><b>${x.probabilidad} × ${x.impacto} = ${x.puntaje}</b>${zonaTag(x.zona)}</div>
      <span style="font-size:22px">→</span>
      <div class="caja"><span class="sub">${x.total_controles} control(es)</span><b>−${x.puntaje - x.puntaje_residual}</b><span class="sub">puntos</span></div>
      <span style="font-size:22px">→</span>
      <div class="caja"><span class="sub">Riesgo residual</span><b>${x.probabilidad_residual} × ${x.impacto_residual} = ${x.puntaje_residual}</b>${zonaTag(x.zona_residual)}</div>
      <p class="sub" style="flex:1;min-width:220px;margin:0">Cada control baja 2 niveles si es fuerte y 1 si es moderado; un control débil no baja nada.
        Baja la probabilidad, el impacto o ambos, según lo que mitigue.</p>
    </div>
    <div class="ficha">
      <div>
        <div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Controles</h3>
          ${x.puede_editar ? '<button class="btn chico primario" id="nuevoControl">+ Control</button>' : ''}</div>
          ${x.controles.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Control</th><th>Clase</th><th>Mitiga</th>
            <th>Efectividad</th><th>Responsables</th><th>Ejecutado ${mes}</th><th></th></tr></thead><tbody>
            ${x.controles.map((c, k) => `<tr><td class="mono">${esc(c.codigo)}</td><td>${esc(c.descripcion)}
                <br><small class="sub">${esc(c.frecuencia || '')}${c.documentado ? ' · documentado' : ''}${c.evidencia ? ' · evidencia: ' + esc(c.evidencia) : ''}</small></td>
              <td>${esc(c.clasificacion)}</td><td>${[c.mitiga_probabilidad ? 'Probabilidad' : '', c.mitiga_impacto ? 'Impacto' : ''].filter(Boolean).join(' y ')}</td>
              <td>${esc(c.efectividad)}</td><td><small>Gestión: ${esc(c.responsable_gestion || '—')}<br>Revisión: ${esc(c.responsable_revision || '—')}</small></td>
              <td>${c.ejecutado_mes == null ? '<span class="sub">Sin reporte</span>' : c.ejecutado_mes ? '✅ Sí' : '❌ No'}</td>
              <td><div class="acciones">${puedeMonitorear(c) ? `<button class="btn chico" data-mon="${k}">Reportar</button>` : ''}
                ${x.puede_editar ? `<button class="btn chico" data-ed="${k}">Editar</button><button class="btn chico peligro" data-del="${c.id}">Quitar</button>` : ''}</div></td></tr>`).join('')}
            </tbody></table></div>` : '<p class="vacio">Sin controles: el riesgo residual es igual al absoluto.</p>'}</div>
        <div class="tarjeta"><h3>Monitoreo de controles</h3>${x.monitoreos.length ? `<table><thead><tr><th>Periodo</th><th>Control</th><th>Ejecutado</th>
          <th>Observación</th><th>Reportó</th></tr></thead><tbody>${x.monitoreos.map(m => `<tr><td>${esc(m.periodo)}</td><td class="mono">${esc(m.control)}</td>
          <td>${m.ejecutado ? '✅ Sí' : '❌ No'}</td><td>${esc(m.observacion)}</td><td><small>${esc(m.usuario)} · ${fecha(m.fecha)}</small></td></tr>`).join('')}
          </tbody></table>` : '<p class="sub">Aún no hay reportes de ejecución.</p>'}</div>
      </div>
      <div>
        <div class="tarjeta"><h3>Identificación</h3><dl class="datos">
          <dt>Proceso</dt><dd>${esc(x.proceso)}</dd><dt>Tipo</dt><dd>${esc(x.tipo)}</dd>
          <dt>Causas</dt><dd>${esc(x.causas) || '—'}</dd><dt>Consecuencias</dt><dd>${esc(x.consecuencias) || '—'}</dd>
          <dt>Probabilidad</dt><dd>${x.probabilidad} · ${esc(cr.probabilidad[x.probabilidad - 1])}</dd>
          <dt>Impacto</dt><dd>${x.impacto} · ${esc(cr.impacto[x.impacto - 1])}</dd>
          <dt>Tratamiento</dt><dd>${esc(x.tratamiento)}</dd><dt>Responsable</dt><dd>${esc(x.responsable)}</dd>
          <dt>Descripción</dt><dd>${esc(x.descripcion) || '—'}</dd><dt>Modificado</dt><dd>${fecha(x.modificado)}</dd></dl></div>
        <div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Plan de acción</h3>
          ${yo.rol !== 'consulta' ? '<button class="btn chico" id="nuevoPlanR">+ Nuevo</button>' : ''}</div>
          ${x.planes.map((a, k) => `<div style="margin-bottom:10px"><b>${esc(a.nombre)}</b> <span class="chip">${esc(a.estado)}</span>
            <div class="progreso"><i style="width:${a.avance}%"></i></div>
            <small class="sub">${Math.round(a.avance)} % · ${esc(a.responsable)} · vence ${fecha(a.fecha_fin)}</small>
            ${esCalidad() || a.responsable_id === yo.id ? ` <button class="btn chico texto" data-a="${k}">Actualizar</button>` : ''}</div>`).join('')
            || `<p class="sub">${['Alta', 'Extrema'].includes(x.zona_residual) ? 'El riesgo residual sigue alto: define acciones de tratamiento.' : 'Sin planes.'}</p>`}</div>
      </div>
    </div>`;

  $('#editar')?.addEventListener('click', () => editarRiesgo(x));
  $('#retirar')?.addEventListener('click', intentar(async () => {
    if (!await modal('Retirar riesgo', '<p>El riesgo deja de aparecer en la matriz. ¿Continuar?</p>', { aceptar: 'Retirar', peligro: true })) return;
    await api('/riesgos/' + x.id, { method: 'DELETE' }); location.hash = '#/riesgos';
  }));
  $('#nuevoControl')?.addEventListener('click', () => editarControl({ riesgo_id: x.id }));
  vista.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editarControl(x.controles[b.dataset.ed]));
  vista.querySelectorAll('[data-del]').forEach(b => b.onclick = intentar(async () => {
    if (!await modal('Quitar control', '<p>El riesgo residual se recalculará sin este control. ¿Continuar?</p>', { aceptar: 'Quitar', peligro: true })) return;
    await api('/controles/' + b.dataset.del, { method: 'DELETE' }); aviso('Control quitado'); rutas.riesgo();
  }));
  vista.querySelectorAll('[data-mon]').forEach(b => b.onclick = intentar(async () => {
    const c = x.controles[b.dataset.mon];
    const v = await modal(`Ejecución de ${c.codigo}`, `<div class="form">
      <label>Periodo<input type="month" name="periodo" value="${mes}" required></label>
      <label>¿Se ejecutó?<select name="ejecutado"><option value="1">Sí</option><option value="0">No</option></select></label>
      <label class="ancho">Observación / evidencia <small>(obligatoria si no se ejecutó)</small><textarea name="observacion"></textarea></label></div>`,
      { aceptar: 'Reportar' });
    if (!v) return;
    await api(`/controles/${c.id}/monitoreo`, { method: 'POST', body: v }); aviso('Ejecución reportada'); rutas.riesgo();
  }));
  $('#nuevoPlanR')?.addEventListener('click', () => editarPlanAccion({ riesgo_id: x.id }, rutas.riesgo));
  vista.querySelectorAll('[data-a]').forEach(b => b.onclick = () => editarPlanAccion(x.planes[b.dataset.a], rutas.riesgo));
};

async function editarControl(c) {
  const usuarios = cat.usuarios.filter(u => u.rol !== 'consulta');
  const v = await modal(c.id ? `Editar control ${c.codigo}` : 'Nuevo control', `<div class="form">
    <label class="ancho">Control<textarea name="descripcion" required placeholder="Quién hace qué, cada cuánto y cómo queda la evidencia">${esc(c.descripcion)}</textarea></label>
    <label>Clasificación<select name="clasificacion">${['Preventivo', 'Detectivo', 'Correctivo'].map(t => `<option ${t === c.clasificacion ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Efectividad<select name="efectividad">${['Fuerte', 'Moderado', 'Débil'].map(t => `<option ${t === (c.efectividad || 'Moderado') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="mitiga_probabilidad" value="1" ${c.id ? (c.mitiga_probabilidad ? 'checked' : '') : 'checked'}> Mitiga la probabilidad</label>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="mitiga_impacto" value="1" ${c.mitiga_impacto ? 'checked' : ''}> Mitiga el impacto</label>
    <label>Frecuencia<input name="frecuencia" value="${esc(c.frecuencia)}" placeholder="Diaria, por lote, mensual…"></label>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="documentado" value="1" ${c.documentado ? 'checked' : ''}> Está documentado</label>
    <label>Responsable de gestión<select name="responsable_gestion_id">${opciones(usuarios, c.responsable_gestion_id ?? yo.id)}</select></label>
    <label>Responsable de revisión<select name="responsable_revision_id">${opciones(usuarios, c.responsable_revision_id, '—')}</select></label>
    <label class="ancho">Evidencia<input name="evidencia" value="${esc(c.evidencia)}" placeholder="Formato, registro o sistema donde queda"></label></div>`);
  if (!v) return;
  try {
    await api('/controles' + (c.id ? '/' + c.id : ''), { method: c.id ? 'PUT' : 'POST', body: { riesgo_id: c.riesgo_id, ...v } });
    aviso('Control guardado'); rutas.riesgo();
  } catch (e) { aviso(e.message, true); }
}

// ---------- Listado de controles ----------
rutas.controles = async function () {
  vista.innerHTML = `
    <div class="encabezado"><h2>Controles</h2><button class="btn" id="exportar">Exportar CSV</button></div>
    <form class="tarjeta filtros" id="filtros">
      <label>Buscar<input name="texto" placeholder="Control o riesgo"></label>
      <label>Proceso<select name="proceso" multiple>${opciones(cat.procesos)}</select></label>
      <label>Clasificación<select name="clasificacion" multiple><option>Preventivo</option><option>Detectivo</option><option>Correctivo</option></select></label>
      <label>Responsable<select name="responsable">${opciones(cat.usuarios, '', 'Todos')}</select></label>
      <label>Como<select name="rol"><option value="gestion">Responsable de gestión</option><option value="revision">Responsable de revisión</option></select></label>
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form>
    <div id="resultado"></div>`;
  let lista = [];
  const cargar = intentar(async () => {
    lista = await api('/controles?' + qs(valoresForm($('#filtros'))));
    const clases = ['Preventivo', 'Detectivo', 'Correctivo'];
    $('#resultado').innerHTML = `<div class="kpis"><div class="kpi"><b>${lista.length}</b><span>Controles</span></div>
      ${clases.map(c => `<div class="kpi"><b>${lista.filter(x => x.clasificacion === c).length}</b><span>${c}s</span></div>`).join('')}
      <div class="kpi"><b>${lista.filter(x => x.efectividad === 'Fuerte').length}</b><span>Fuertes</span></div></div>
      ${lista.length ? `<div class="tabla-wrap"><table><thead><tr><th>Proceso</th><th>Cód. riesgo</th><th>Riesgo</th><th>Cód. control</th><th>Control</th>
      <th>Clasificación</th><th>Mitiga P</th><th>Mitiga I</th><th>Efectividad</th><th>Resp. gestión</th><th>Resp. revisión</th></tr></thead><tbody>
      ${lista.map(c => `<tr class="click" onclick="location.hash='#/riesgo/${c.riesgo_id}'"><td>${esc(c.proceso)}</td><td class="mono">${esc(c.riesgo_codigo)}</td>
        <td>${esc(c.riesgo)}</td><td class="mono">${esc(c.codigo)}</td><td>${esc(c.descripcion)}</td><td>${esc(c.clasificacion)}</td>
        <td>${c.mitiga_probabilidad ? 'Sí' : 'No'}</td><td>${c.mitiga_impacto ? 'Sí' : 'No'}</td><td>${esc(c.efectividad)}</td>
        <td>${esc(c.responsable_gestion)}</td><td>${esc(c.responsable_revision)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">No hay controles con estos criterios.</p>'}`;
  });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); cargar(); });
  $('#exportar').onclick = () => exportarCSV('controles.csv', lista,
    [['proceso', 'Proceso'], ['riesgo_codigo', 'Cód. riesgo'], ['riesgo', 'Riesgo'], ['codigo', 'Cód. control'], ['descripcion', 'Control'],
     ['clasificacion', 'Clasificación'], ['mitiga_probabilidad', 'Mitiga probabilidad'], ['mitiga_impacto', 'Mitiga impacto'],
     ['efectividad', 'Efectividad'], ['responsable_gestion', 'Responsable gestión'], ['responsable_revision', 'Responsable revisión']]);
  cargar();
};
