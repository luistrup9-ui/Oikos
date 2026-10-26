// SGI — evaluaciones (auditorías), hallazgos y acciones correctivas / de mejora
let catA = null;
const catalogosAud = async () => catA || (catA = await api('/evaluaciones/catalogos'));
const ESTADOS_ACC = ['Análisis', 'Ejecución', 'Verificación', 'Cerrada'];
const TIPOS_HALLAZGO = ['No conformidad mayor', 'No conformidad menor', 'Observación', 'Oportunidad de mejora'];
const etiquetaHallazgo = t => `<span class="chip" style="${t.startsWith('No conformidad') ? 'background:#fde7e5;color:var(--rojo)' : ''}">${esc(t)}</span>`;
const pasos = (lista, actual) => `<div class="flujo">${lista.map((e, i) => {
  const k = lista.indexOf(actual); return `<div class="paso ${i < k ? 'hecho' : i === k ? 'actual' : ''}">${esc(e)}</div>`; }).join('')}</div>`;
const RESULTADO_ICONO = { Conforme: '✅', 'No conforme': '❌', 'Observación': '⚠️', 'No aplica': '➖' };

// ---------- Programa de evaluaciones ----------
rutas.auditorias = async function () {
  const ca = await catalogosAud();
  vista.innerHTML = `
    <div class="encabezado"><h2>Evaluaciones</h2>
      <div class="acciones"><button class="btn" id="exportar">Exportar CSV</button>
        ${esCalidad() ? '<button class="btn primario" id="nueva">Programar evaluación</button>' : ''}</div></div>
    <form class="tarjeta filtros" id="filtros">
      <label>Buscar<input name="texto" placeholder="Código o nombre"></label>
      <label>Tipo<select name="tipo" multiple>${ca.tipos.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Plan (año)<select name="anio" multiple>${Array.from({ length: 6 }, (_, i) => anioHoy + 2 - i).map(a => `<option>${a}</option>`).join('')}</select></label>
      <label>Evaluador<select name="evaluador" multiple>${ca.evaluadores.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Proceso<select name="proceso" multiple>${opciones(cat.procesos)}</select></label>
      <label>Estado<select name="estado" multiple>${ca.estados.map(t => `<option>${t}</option>`).join('')}</select></label>
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form>
    <div id="resultado"></div>`;
  let lista = [];
  const cargar = intentar(async () => {
    lista = await api('/evaluaciones?' + qs(valoresForm($('#filtros'))));
    $('#resultado').innerHTML = `<div class="kpis">${ca.estados.map(s => `<div class="kpi"><b>${lista.filter(e => e.estado === s).length}</b><span>${s}</span></div>`).join('')}</div>
      ${lista.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Evaluación</th><th>Tipo</th><th>Plan</th><th>Procesos</th>
        <th>Evaluador</th><th>Fechas</th><th>Estado</th><th class="num">Hallazgos</th></tr></thead><tbody>
        ${lista.map(e => `<tr class="click" onclick="location.hash='#/auditoria/${e.id}'"><td class="mono">${esc(e.codigo)}</td><td>${esc(e.nombre)}</td>
          <td>${esc(e.tipo)}</td><td>${e.anio}</td><td><small>${esc(e.procesos || '—')}</small></td>
          <td>${esc(e.evaluador)}<br><small class="sub">${esc(e.auditor || e.auditor_externo || '')}</small></td>
          <td><small>${fecha(e.fecha_inicio)} → ${fecha(e.fecha_fin)}</small></td><td><span class="chip">${esc(e.estado)}</span></td>
          <td class="num">${e.total_hallazgos}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vacio">No hay evaluaciones con estos criterios.</p>'}`;
  });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); cargar(); });
  $('#nueva')?.addEventListener('click', () => editarEvaluacion({}));
  $('#exportar').onclick = () => exportarCSV('evaluaciones.csv', lista, [['codigo', 'Código'], ['nombre', 'Evaluación'], ['tipo', 'Tipo'],
    ['anio', 'Plan'], ['procesos', 'Procesos'], ['evaluador', 'Evaluador'], ['auditor', 'Auditor'], ['auditor_externo', 'Auditor externo'],
    ['fecha_inicio', 'Inicio'], ['fecha_fin', 'Fin'], ['estado', 'Estado'], ['total_hallazgos', 'Hallazgos']]);
  cargar();
};

async function editarEvaluacion(e) {
  const ca = await catalogosAud();
  const sel = (n, l, v) => `<select name="${n}">${l.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  const elegidos = (e.lista_procesos || []).map(p => p.proceso_id);
  const v = await modal(e.id ? `Editar ${e.codigo}` : 'Programar evaluación', `<div class="form">
    <label class="ancho">Nombre<input name="nombre" required value="${esc(e.nombre)}" placeholder="Auditoría interna de calidad 2026"></label>
    <label>Tipo${sel('tipo', ca.tipos, e.tipo)}</label>
    <label>Plan (año)<input type="number" name="anio" required value="${e.anio || anioHoy}"></label>
    <label>Evaluador${sel('evaluador', ca.evaluadores, e.evaluador)}</label>
    <label>Auditor interno<select name="auditor_id">${opciones(cat.usuarios.filter(u => u.rol !== 'consulta'), e.auditor_id, '— Ninguno —')}</select></label>
    <label class="ancho">Auditor u organismo externo<input name="auditor_externo" value="${esc(e.auditor_externo)}"></label>
    <label>Fecha inicio<input type="date" name="fecha_inicio" value="${esc(e.fecha_inicio)}"></label>
    <label>Fecha fin<input type="date" name="fecha_fin" value="${esc(e.fecha_fin)}"></label>
    <label class="ancho">Procesos a evaluar<select name="procesos" multiple style="min-height:150px">${cat.procesos.map(p =>
      `<option value="${p.id}" ${elegidos.includes(p.id) ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
    <label class="ancho">Objetivo<textarea name="objetivo">${esc(e.objetivo)}</textarea></label>
    <label class="ancho">Alcance<textarea name="alcance">${esc(e.alcance)}</textarea></label>
    <label class="ancho">Criterios / sistema de referencia<input name="criterios" value="${esc(e.criterios ?? 'ISO 9001:2015')}"></label></div>`);
  if (!v) return;
  try {
    const { id } = await api('/evaluaciones' + (e.id ? '/' + e.id : ''), { method: e.id ? 'PUT' : 'POST', body: { procesos: [], ...v } });
    aviso('Evaluación guardada');
    if (e.id) rutas.auditoria(); else location.hash = '#/auditoria/' + id;
  } catch (err) { aviso(err.message, true); }
}

// ---------- Ficha de la evaluación ----------
rutas.auditoria = async function () {
  const id = location.hash.split('?')[0].split('/')[2];
  const e = await api('/evaluaciones/' + id);
  const ca = await catalogosAud();
  const k = ca.estados.indexOf(e.estado);
  const editaLista = e.es_auditor && ['Planeación', 'Ejecución'].includes(e.estado);
  const responde = e.es_auditor && e.estado === 'Ejecución';
  const pendientes = e.items.filter(i => !i.resultado).length;
  vista.innerHTML = `
    <div class="encabezado"><div><a href="#/auditorias">← Evaluaciones</a>
      <h2 style="margin-top:6px"><span class="mono">${esc(e.codigo)}</span> · ${esc(e.nombre)}</h2></div>
      <div class="acciones">
        ${e.es_auditor && k > 0 && e.estado !== 'Terminada' ? `<button class="btn" data-ir="${ca.estados[k - 1]}">← Volver a ${ca.estados[k - 1]}</button>` : ''}
        ${e.es_auditor && k < 3 && (k < 2 || e.puede_editar) ? `<button class="btn primario" data-ir="${ca.estados[k + 1]}">Pasar a ${ca.estados[k + 1]} →</button>` : ''}
        ${e.puede_editar && e.estado !== 'Terminada' ? '<button class="btn" id="editar">Editar</button>' : ''}
        ${e.puede_editar && e.estado === 'Planeación' ? '<button class="btn peligro" id="eliminar">Eliminar</button>' : ''}
        <button class="btn" onclick="window.print()">Informe / PDF</button></div></div>
    ${pasos(ca.estados, e.estado)}
    <div class="ficha">
      <div>
        <div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Lista de verificación</h3>
          ${editaLista ? '<div class="acciones"><button class="btn chico" id="iso">Cargar preguntas ISO 9001</button><button class="btn chico primario" id="pregunta">+ Pregunta</button></div>' : ''}</div>
          <p class="sub">${e.items.length} preguntas · ${pendientes} sin responder ·
            ${e.resumen.filter(x => x.resultado && x.n).map(x => `${RESULTADO_ICONO[x.resultado]} ${x.n} ${x.resultado.toLowerCase()}`).join(' · ')}</p>
          ${e.lista_procesos.map(p => {
            const items = e.items.filter(i => i.proceso_id === p.proceso_id);
            return `<h3 style="margin-top:14px">${esc(p.nombre)} <small class="sub">${p.fecha ? '· ' + fecha(p.fecha) : ''} ${p.auditado ? '· auditado: ' + esc(p.auditado) : ''}</small>
              ${e.es_auditor && e.estado !== 'Terminada' ? `<button class="btn chico texto" data-agenda="${p.proceso_id}">Agenda</button>` : ''}</h3>
              ${items.length ? `<table><tbody>${items.map(i => `<tr><td class="mono" style="width:56px">${esc(i.requisito)}</td>
                <td>${esc(i.pregunta)}${i.evidencia ? `<br><small class="sub">Evidencia: ${esc(i.evidencia)}</small>` : ''}</td>
                <td style="white-space:nowrap">${i.resultado ? `${RESULTADO_ICONO[i.resultado]} ${esc(i.resultado)}` : '<span class="sub">Pendiente</span>'}</td>
                <td style="white-space:nowrap">${responde ? `<button class="btn chico ${i.resultado ? '' : 'primario'}" data-resp="${i.id}">${i.resultado ? 'Cambiar' : 'Responder'}</button>` : ''}
                  ${editaLista && !i.resultado ? `<button class="btn chico texto" data-qi="${i.id}" title="Quitar">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>`
                : '<p class="sub">Sin preguntas para este proceso.</p>'}`; }).join('') || '<p class="vacio">Agrega procesos a la evaluación.</p>'}
        </div>
        <div class="tarjeta"><h3>Hallazgos (${e.hallazgos.length})</h3>
          ${e.hallazgos.length ? `<table><thead><tr><th>Código</th><th>Tipo</th><th>Proceso</th><th>Requisito</th><th>Descripción</th><th class="num">Acciones</th></tr></thead><tbody>
            ${e.hallazgos.map(h => `<tr class="click" onclick="location.hash='#/hallazgo/${h.id}'"><td class="mono">${esc(h.codigo)}</td><td>${etiquetaHallazgo(h.tipo)}</td>
              <td>${esc(h.proceso)}</td><td class="mono">${esc(h.requisito)}</td><td>${esc(h.descripcion)}</td><td class="num">${h.total_acciones}</td></tr>`).join('')}</tbody></table>`
            : '<p class="sub">Los hallazgos se generan solos al marcar una pregunta como no conforme u observación.</p>'}</div>
      </div>
      <div>
        <div class="tarjeta"><h3>Plan de la evaluación</h3><dl class="datos">
          <dt>Tipo</dt><dd>${esc(e.tipo)}</dd><dt>Plan</dt><dd>${e.anio}</dd><dt>Evaluador</dt><dd>${esc(e.evaluador)}</dd>
          <dt>Auditor</dt><dd>${esc(e.auditor || e.auditor_externo || '—')}</dd><dt>Fechas</dt><dd>${fecha(e.fecha_inicio)} → ${fecha(e.fecha_fin)}</dd>
          <dt>Criterios</dt><dd>${esc(e.criterios) || '—'}</dd><dt>Objetivo</dt><dd>${esc(e.objetivo) || '—'}</dd>
          <dt>Alcance</dt><dd>${esc(e.alcance) || '—'}</dd></dl></div>
        <div class="tarjeta"><h3>Conclusiones</h3><p>${esc(e.conclusiones) || '<span class="sub">Se escriben al terminar la evaluación.</span>'}</p></div>
      </div>
    </div>`;

  vista.querySelectorAll('[data-ir]').forEach(b => b.onclick = intentar(async () => {
    const destino = b.dataset.ir;
    let body = { estado: destino };
    if (destino === 'Terminada') {
      const v = await modal('Terminar evaluación', `<label>Conclusiones del informe<textarea name="conclusiones" required style="min-height:140px">${esc(e.conclusiones)}</textarea></label>`, { aceptar: 'Terminar' });
      if (!v) return; body.conclusiones = v.conclusiones;
    }
    await api(`/evaluaciones/${e.id}/estado`, { method: 'POST', body }); aviso('Estado: ' + destino); rutas.auditoria();
  }));
  $('#editar')?.addEventListener('click', () => editarEvaluacion(e));
  $('#eliminar')?.addEventListener('click', intentar(async () => {
    if (!await modal('Eliminar evaluación', '<p>Se borra la evaluación y su lista de verificación. ¿Continuar?</p>', { aceptar: 'Eliminar', peligro: true })) return;
    await api('/evaluaciones/' + e.id, { method: 'DELETE' }); location.hash = '#/auditorias';
  }));
  $('#iso')?.addEventListener('click', intentar(async () => {
    await api(`/evaluaciones/${e.id}/items`, { method: 'POST', body: { plantilla: 'iso9001' } }); aviso('Preguntas cargadas'); rutas.auditoria();
  }));
  $('#pregunta')?.addEventListener('click', intentar(async () => {
    const v = await modal('Nueva pregunta', `<div class="form">
      <label>Proceso<select name="proceso_id">${opciones(e.lista_procesos.map(p => ({ id: p.proceso_id, nombre: p.nombre })))}</select></label>
      <label>Requisito / numeral<input name="requisito" placeholder="8.5.1"></label>
      <label class="ancho">Pregunta<textarea name="pregunta" required></textarea></label></div>`, { aceptar: 'Agregar' });
    if (!v) return;
    await api(`/evaluaciones/${e.id}/items`, { method: 'POST', body: v }); rutas.auditoria();
  }));
  vista.querySelectorAll('[data-qi]').forEach(b => b.onclick = intentar(async () => {
    await api(`/evaluaciones/${e.id}/items/${b.dataset.qi}`, { method: 'DELETE' }); rutas.auditoria();
  }));
  vista.querySelectorAll('[data-agenda]').forEach(b => b.onclick = intentar(async () => {
    const p = e.lista_procesos.find(x => x.proceso_id == b.dataset.agenda);
    const v = await modal(`Agenda · ${p.nombre}`, `<div class="form">
      <label>Fecha<input type="date" name="fecha" value="${esc(p.fecha)}"></label>
      <label>Auditado<select name="auditado_id">${opciones(cat.usuarios, p.auditado_id, '—')}</select></label></div>`);
    if (!v) return;
    await api(`/evaluaciones/${e.id}/procesos/${p.proceso_id}`, { method: 'PUT', body: v }); rutas.auditoria();
  }));
  vista.querySelectorAll('[data-resp]').forEach(b => b.onclick = intentar(async () => {
    const i = e.items.find(x => x.id == b.dataset.resp);
    const v = await modal(`${i.requisito || ''} ${i.pregunta}`, `<div class="form">
      <label>Resultado<select name="resultado">${['Conforme', 'No conforme', 'Observación', 'No aplica'].map(r => `<option ${r === i.resultado ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>Si es no conforme<select name="tipo_hallazgo"><option>No conformidad menor</option><option>No conformidad mayor</option></select></label>
      <label class="ancho">Evidencia observada<textarea name="evidencia">${esc(i.evidencia)}</textarea></label></div>
      <p class="sub" style="margin:0">Un “no conforme” o una “observación” genera el hallazgo automáticamente.</p>`, { aceptar: 'Guardar' });
    if (!v) return;
    const res = await api(`/evaluaciones/${e.id}/items/${i.id}`, { method: 'PUT', body: v });
    aviso(res.hallazgo_id ? 'Guardado · hallazgo registrado' : 'Guardado'); rutas.auditoria();
  }));
};

// ---------- Hallazgos y acciones ----------
rutas.acciones = async function () {
  const ca = await catalogosAud();
  const pestana = new URLSearchParams(location.hash.split('?')[1] || '').get('v') || 'acciones';
  const tabs = [['acciones', 'Acciones'], ['hallazgos', 'Hallazgos'], ['estadisticas', 'Estadísticas']];
  vista.innerHTML = `
    <div class="encabezado"><h2>Acciones correctivas y de mejora</h2>
      <div class="acciones">${pestana !== 'estadisticas' ? '<button class="btn" id="exportar">Exportar CSV</button>' : ''}
        ${yo.rol !== 'consulta' ? '<button class="btn primario" id="nuevoH">Registrar hallazgo</button>' : ''}</div></div>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="${k === pestana ? 'activo' : ''}" onclick="location.hash='#/acciones?v=${k}'">${n}</button>`).join('')}</div>
    <div id="cuerpo"></div>`;
  $('#nuevoH')?.addEventListener('click', () => nuevoHallazgo());
  const cuerpo = $('#cuerpo');

  if (pestana === 'estadisticas') {
    const s = await api('/acciones-estadisticas');
    const max = Math.max(1, ...s.por_proceso.map(p => p.hallazgos));
    cuerpo.innerHTML = `<div class="kpis">
      <div class="kpi"><b>${s.total}</b><span>Acciones ${s.anio}</span></div><div class="kpi"><b>${s.abiertas}</b><span>Abiertas</span></div>
      <div class="kpi"><b>${s.vencidas}</b><span>${sem(s.vencidas ? 'rojo' : 'verde')} Vencidas</span></div>
      <div class="kpi"><b>${s.eficaces}</b><span>Cerradas eficaces</span></div><div class="kpi"><b>${s.reaperturas}</b><span>Reaperturas (no eficaces)</span></div>
      <div class="kpi"><b>${s.eficacia == null ? '—' : fmt(s.eficacia, '%')}</b><span>Eficacia (eficaces / total)</span></div></div>
      <div class="ficha"><div class="tarjeta"><h3>Hallazgos por proceso</h3><div class="barras">
        ${s.por_proceso.map(p => `<div><span>${esc(p.nombre)} <small class="sub">(${p.nc} NC)</small></span><i style="width:${p.hallazgos / max * 100}%"></i><b>${p.hallazgos}</b></div>`).join('') || '<p class="vacio">Sin hallazgos este año.</p>'}</div></div>
      <div class="tarjeta"><h3>Acciones por estado</h3>${s.por_estado.map(x => `<p>${esc(x.estado)}: <b>${x.n}</b></p>`).join('')}
        <p class="sub">La eficacia alimenta el indicador “Acciones correctivas” (IND-SIG-02): regístrala allí en cada trimestre.</p></div></div>`;
    return;
  }

  if (pestana === 'hallazgos') {
    cuerpo.innerHTML = `<form class="tarjeta filtros" id="filtros">
      <label>Buscar<input name="texto"></label>
      <label>Tipo<select name="tipo" multiple>${TIPOS_HALLAZGO.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Origen<select name="origen" multiple>${ca.origenes.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Proceso<select name="proceso" multiple>${opciones(cat.procesos)}</select></label>
      <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="sin_accion" value="1"> Solo sin acción</label>
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form><div id="resultado"></div>`;
    let lista = [];
    const cargar = intentar(async () => {
      lista = await api('/hallazgos?' + qs(valoresForm($('#filtros'))));
      $('#resultado').innerHTML = lista.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Tipo</th><th>Origen</th><th>Proceso</th>
        <th>Requisito</th><th>Descripción</th><th>Fecha</th><th class="num">Acciones</th></tr></thead><tbody>
        ${lista.map(h => `<tr class="click" onclick="location.hash='#/hallazgo/${h.id}'"><td class="mono">${esc(h.codigo)}</td><td>${etiquetaHallazgo(h.tipo)}</td>
          <td>${esc(h.origen)}${h.evaluacion_codigo ? `<br><small class="mono">${esc(h.evaluacion_codigo)}</small>` : ''}</td><td>${esc(h.proceso)}</td>
          <td class="mono">${esc(h.requisito)}</td><td>${esc(h.descripcion)}</td><td>${fecha(h.fecha)}</td>
          <td class="num">${h.total_acciones ? `${h.acciones_cerradas}/${h.total_acciones}` : (h.tipo.startsWith('No conformidad') ? '<span class="faltan">Sin acción</span>' : '0')}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="vacio">No hay hallazgos con estos criterios.</p>';
    });
    $('#filtros').addEventListener('submit', ev => { ev.preventDefault(); cargar(); });
    $('#exportar').onclick = () => exportarCSV('hallazgos.csv', lista, [['codigo', 'Código'], ['tipo', 'Tipo'], ['origen', 'Origen'],
      ['evaluacion_codigo', 'Evaluación'], ['proceso', 'Proceso'], ['requisito', 'Requisito'], ['descripcion', 'Descripción'], ['fecha', 'Fecha'], ['total_acciones', 'Acciones']]);
    cargar();
    return;
  }

  cuerpo.innerHTML = `<form class="tarjeta filtros" id="filtros">
    <label>Buscar<input name="texto"></label>
    <label>Estado<select name="estado" multiple>${ESTADOS_ACC.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label>Tipo<select name="tipo" multiple><option>Corrección</option><option>Acción correctiva</option><option>Acción de mejora</option></select></label>
    <label>Proceso<select name="proceso" multiple>${opciones(cat.procesos)}</select></label>
    <label>Origen<select name="origen" multiple>${ca.origenes.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="mias" value="1"> Solo a mi cargo</label>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="vencidas" value="1"> Solo vencidas</label>
    <div class="acciones"><button class="btn primario">Filtrar</button></div></form><div id="resultado"></div>`;
  let lista = [];
  const cargar = intentar(async () => {
    lista = await api('/acciones?' + qs(valoresForm($('#filtros'))));
    $('#resultado').innerHTML = lista.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Tipo</th><th>Hallazgo</th><th>Proceso</th>
      <th>Responsable</th><th>Compromiso</th><th>Avance</th><th>Estado</th></tr></thead><tbody>
      ${lista.map(a => `<tr class="click" onclick="location.hash='#/accion/${a.id}'"><td class="mono">${esc(a.codigo)}</td><td>${esc(a.tipo)}</td>
        <td>${etiquetaHallazgo(a.hallazgo_tipo)}<br><small>${esc(a.hallazgo)}</small></td><td>${esc(a.proceso)}</td><td>${esc(a.responsable)}</td>
        <td>${fecha(a.fecha_compromiso)}${a.vencida ? '<br><span class="faltan">Vencida</span>' : ''}</td>
        <td>${a.actividades_cumplidas}/${a.total_actividades}</td>
        <td><span class="chip">${esc(a.estado)}</span>${a.estado === 'Cerrada' ? (a.eficaz ? ' ✅' : '') : ''}${a.reaperturas ? `<br><small class="faltan">${a.reaperturas} reapertura(s)</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="vacio">No hay acciones con estos criterios.</p>';
  });
  $('#filtros').addEventListener('submit', ev => { ev.preventDefault(); cargar(); });
  $('#exportar').onclick = () => exportarCSV('acciones.csv', lista, [['codigo', 'Código'], ['tipo', 'Tipo'], ['hallazgo_codigo', 'Hallazgo'],
    ['hallazgo', 'Descripción hallazgo'], ['proceso', 'Proceso'], ['causa_raiz', 'Causa raíz'], ['responsable', 'Responsable'],
    ['fecha_compromiso', 'Compromiso'], ['estado', 'Estado'], ['eficaz', 'Eficaz'], ['fecha_cierre', 'Cierre'], ['reaperturas', 'Reaperturas']]);
  cargar();
};

async function nuevoHallazgo() {
  const ca = await catalogosAud();
  const procesos = esCalidad() ? cat.procesos : cat.procesos.filter(p => p.id === yo.proceso_id);
  const v = await modal('Registrar hallazgo', `<div class="form">
    <label>Origen<select name="origen">${ca.origenes.filter(o => !['Auditoría interna', 'Autoevaluación'].includes(o)).map(o => `<option>${o}</option>`).join('')}</select></label>
    <label>Tipo<select name="tipo">${TIPOS_HALLAZGO.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label>Proceso<select name="proceso_id" required>${opciones(procesos, yo.proceso_id)}</select></label>
    <label>Requisito<input name="requisito" placeholder="Opcional"></label>
    <label class="ancho">Descripción<textarea name="descripcion" required></textarea></label>
    <label class="ancho">Evidencia<textarea name="evidencia"></textarea></label></div>`, { aceptar: 'Registrar' });
  if (!v) return;
  try { const { id } = await api('/hallazgos', { method: 'POST', body: v }); location.hash = '#/hallazgo/' + id; }
  catch (e) { aviso(e.message, true); }
}

// Ficha corta del hallazgo con sus acciones
rutas.hallazgo = async function () {
  const id = Number(location.hash.split('?')[0].split('/')[2]);
  const [h] = (await api('/hallazgos')).filter(x => x.id === id);
  if (!h) { vista.innerHTML = '<p class="error">Hallazgo no encontrado</p>'; return; }
  const acciones = (await api('/acciones')).filter(a => a.hallazgo_id === id);
  const puedeAbrir = esCalidad() || (yo.rol === 'lider_proceso' && yo.proceso_id === h.proceso_id);
  vista.innerHTML = `
    <div class="encabezado"><div><a href="#/acciones?v=hallazgos">← Hallazgos</a>
      <h2 style="margin-top:6px"><span class="mono">${esc(h.codigo)}</span> · ${etiquetaHallazgo(h.tipo)}</h2></div>
      ${puedeAbrir ? '<button class="btn primario" id="abrir">Abrir acción</button>' : ''}</div>
    <div class="tarjeta"><dl class="datos">
      <dt>Origen</dt><dd>${esc(h.origen)} ${h.evaluacion_id ? `<a class="mono" href="#/auditoria/${h.evaluacion_id}">${esc(h.evaluacion_codigo)}</a>` : ''}</dd>
      <dt>Proceso</dt><dd>${esc(h.proceso)}</dd><dt>Requisito</dt><dd>${esc(h.requisito) || '—'}</dd>
      <dt>Descripción</dt><dd>${esc(h.descripcion)}</dd><dt>Evidencia</dt><dd>${esc(h.evidencia) || '—'}</dd>
      <dt>Registrado</dt><dd>${esc(h.registrado_por)} · ${fecha(h.fecha)}</dd></dl></div>
    <div class="tarjeta"><h3>Acciones</h3>${acciones.length ? `<table><tbody>${acciones.map(a => `<tr class="click" onclick="location.hash='#/accion/${a.id}'">
      <td class="mono">${esc(a.codigo)}</td><td>${esc(a.tipo)}</td><td>${esc(a.responsable)}</td><td>${fecha(a.fecha_compromiso)}</td>
      <td><span class="chip">${esc(a.estado)}</span></td></tr>`).join('')}</tbody></table>`
      : `<p class="sub">${h.tipo.startsWith('No conformidad') ? 'Esta no conformidad necesita una acción correctiva.' : 'Sin acciones.'}</p>`}</div>`;
  $('#abrir')?.addEventListener('click', intentar(async () => {
    const tipos = h.tipo.startsWith('No conformidad') ? ['Acción correctiva', 'Corrección'] : ['Acción de mejora', 'Acción correctiva', 'Corrección'];
    const v = await modal('Abrir acción', `<div class="form">
      <label>Tipo<select name="tipo">${tipos.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Responsable<select name="responsable_id">${opciones(cat.usuarios.filter(u => u.rol !== 'consulta'), yo.id)}</select></label>
      <label>Fecha de compromiso<input type="date" name="fecha_compromiso" required></label>
      <label class="ancho">Corrección inmediata (si aplica)<textarea name="correccion"></textarea></label></div>`, { aceptar: 'Abrir' });
    if (!v) return;
    const { id: aid } = await api('/acciones', { method: 'POST', body: { ...v, hallazgo_id: h.id } });
    location.hash = '#/accion/' + aid;
  }));
};

// ---------- Ficha de la acción ----------
rutas.accion = async function () {
  const id = location.hash.split('?')[0].split('/')[2];
  const a = await api('/acciones/' + id);
  const h = a.hallazgo_completo;
  const g = a.puede_gestionar;
  const siguiente = { 'Análisis': 'Aprobar plan y ejecutar', 'Ejecución': 'Enviar a verificación' }[a.estado];
  vista.innerHTML = `
    <div class="encabezado"><div><a href="#/acciones">← Acciones</a>
      <h2 style="margin-top:6px"><span class="mono">${esc(a.codigo)}</span> · ${esc(a.tipo)}</h2></div>
      <div class="acciones">
        ${g && siguiente ? `<button class="btn primario" id="avanzar">${siguiente} →</button>` : ''}
        ${a.estado === 'Verificación' && a.puede_verificar && a.responsable_id !== yo.id ? '<button class="btn primario" id="verificar">Verificar eficacia</button>' : ''}
        ${g && a.estado !== 'Cerrada' ? '<button class="btn" id="editar">Editar</button>' : ''}</div></div>
    ${pasos(ESTADOS_ACC, a.estado)}
    ${a.vencida ? '<p class="faltan" style="font-size:14px">⚠️ La fecha de compromiso ya pasó.</p>' : ''}
    <div class="ficha">
      <div>
        <div class="tarjeta"><h3>Análisis de causa</h3><dl class="datos">
          <dt>Corrección inmediata</dt><dd>${esc(a.correccion) || '—'}</dd>
          <dt>Método</dt><dd>${esc(a.metodo_causa) || '—'}</dd>
          <dt>Análisis</dt><dd style="white-space:pre-wrap">${esc(a.analisis_causa) || '—'}</dd>
          <dt>Causa raíz</dt><dd><b>${esc(a.causa_raiz) || (a.tipo === 'Corrección' ? 'No requerida para una corrección' : '<span class="faltan">Pendiente</span>')}</b></dd></dl></div>
        <div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Plan de actividades (${a.actividades.filter(t => t.cumplida).length}/${a.actividades.length})</h3>
          ${g && ['Análisis', 'Ejecución'].includes(a.estado) ? '<button class="btn chico primario" id="actividad">+ Actividad</button>' : ''}</div>
          ${a.actividades.length ? `<table><thead><tr><th></th><th>Actividad</th><th>Responsable</th><th>Fecha</th><th>Evidencia</th><th></th></tr></thead><tbody>
            ${a.actividades.map(t => `<tr><td>${t.cumplida ? '✅' : '⬜'}</td><td>${esc(t.descripcion)}</td><td>${esc(t.responsable)}</td>
              <td>${fecha(t.fecha)}${!t.cumplida && t.fecha < new Date().toISOString().slice(0, 10) ? '<br><span class="faltan">Atrasada</span>' : ''}</td>
              <td>${esc(t.evidencia)}${t.fecha_cumplida ? `<br><small class="sub">${fecha(t.fecha_cumplida)}</small>` : ''}</td>
              <td>${a.estado === 'Ejecución' && (g || t.responsable_id === yo.id) ? `<button class="btn chico" data-t="${t.id}">${t.cumplida ? 'Desmarcar' : 'Cumplida'}</button>` : ''}
                ${a.estado === 'Análisis' && g ? `<button class="btn chico texto" data-qt="${t.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>`
            : '<p class="sub">Planea las actividades que eliminan la causa raíz.</p>'}</div>
        ${a.verificacion ? `<div class="tarjeta"><h3>Verificación de eficacia</h3><p>${a.eficaz ? '✅ Eficaz' : '❌ No eficaz'} · ${esc(a.verificador)} ${a.fecha_cierre ? '· ' + fecha(a.fecha_cierre) : ''}</p>
          <p>${esc(a.verificacion)}</p></div>` : ''}
      </div>
      <div>
        <div class="tarjeta"><h3>Hallazgo <a class="mono" href="#/hallazgo/${h.id}">${esc(h.codigo)}</a></h3><dl class="datos">
          <dt>Tipo</dt><dd>${etiquetaHallazgo(h.tipo)}</dd><dt>Origen</dt><dd>${esc(h.origen)} ${h.evaluacion_codigo ? `<span class="mono">${esc(h.evaluacion_codigo)}</span>` : ''}</dd>
          <dt>Proceso</dt><dd>${esc(a.proceso)}</dd><dt>Descripción</dt><dd>${esc(h.descripcion)}</dd>
          <dt>Responsable</dt><dd>${esc(a.responsable)}</dd><dt>Compromiso</dt><dd>${fecha(a.fecha_compromiso)}</dd></dl></div>
        <div class="tarjeta"><h3>Trazabilidad</h3><div class="linea">${a.bitacora.map(b => `<div><b>${esc(b.evento)}</b><br>
          <small>${esc(b.usuario)} · ${fecha(b.fecha)}</small>${b.comentario ? `<br>“${esc(b.comentario)}”` : ''}</div>`).join('')}</div></div>
      </div>
    </div>`;

  $('#editar')?.addEventListener('click', intentar(async () => {
    const enAnalisis = a.estado === 'Análisis';
    const v = await modal('Editar acción', `<div class="form">
      <label class="ancho">Corrección inmediata<textarea name="correccion">${esc(a.correccion)}</textarea></label>
      <label>Método de análisis<select name="metodo_causa" ${enAnalisis ? '' : 'disabled'}>${['', '5 porqués', 'Espina de pescado (Ishikawa)', 'Lluvia de ideas', 'Otro'].map(m => `<option ${m === a.metodo_causa ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>Responsable<select name="responsable_id">${opciones(cat.usuarios.filter(u => u.rol !== 'consulta'), a.responsable_id)}</select></label>
      <label class="ancho">Análisis <small>(¿por qué? ¿por qué? …)</small><textarea name="analisis_causa" style="min-height:120px" ${enAnalisis ? '' : 'readonly'}>${esc(a.analisis_causa)}</textarea></label>
      <label class="ancho">Causa raíz<input name="causa_raiz" value="${esc(a.causa_raiz)}" ${enAnalisis ? '' : 'readonly'}></label>
      <label>Fecha de compromiso<input type="date" name="fecha_compromiso" value="${esc(a.fecha_compromiso)}"></label></div>`);
    if (!v) return;
    await api('/acciones/' + a.id, { method: 'PUT', body: v }); aviso('Guardado'); rutas.accion();
  }));
  $('#avanzar')?.addEventListener('click', intentar(async () => {
    const v = await modal(siguiente, '<label>Comentario<textarea name="comentario"></textarea></label>', { aceptar: siguiente });
    if (!v) return;
    await api(`/acciones/${a.id}/avanzar`, { method: 'POST', body: v }); aviso('Listo'); rutas.accion();
  }));
  $('#verificar')?.addEventListener('click', intentar(async () => {
    const v = await modal('Verificación de eficacia', `<p class="sub">¿Se eliminó la causa? ¿El problema dejó de repetirse?</p>
      <label>Resultado<select name="eficaz"><option value="1">Eficaz: cerrar la acción</option><option value="">No eficaz: reabrir a ejecución</option></select></label>
      <label>Cómo se verificó<textarea name="verificacion" required></textarea></label>`, { aceptar: 'Registrar' });
    if (!v) return;
    await api(`/acciones/${a.id}/avanzar`, { method: 'POST', body: { eficaz: !!v.eficaz, verificacion: v.verificacion } });
    aviso(v.eficaz ? 'Acción cerrada' : 'Acción reabierta'); rutas.accion();
  }));
  $('#actividad')?.addEventListener('click', intentar(async () => {
    const v = await modal('Nueva actividad', `<div class="form">
      <label class="ancho">Actividad<textarea name="descripcion" required></textarea></label>
      <label>Responsable<select name="responsable_id">${opciones(cat.usuarios.filter(u => u.rol !== 'consulta'), a.responsable_id)}</select></label>
      <label>Fecha<input type="date" name="fecha" required value="${esc(a.fecha_compromiso)}"></label></div>`, { aceptar: 'Agregar' });
    if (!v) return;
    await api(`/acciones/${a.id}/actividades`, { method: 'POST', body: v }); rutas.accion();
  }));
  vista.querySelectorAll('[data-qt]').forEach(b => b.onclick = intentar(async () => {
    await api(`/acciones/${a.id}/actividades/${b.dataset.qt}`, { method: 'DELETE' }); rutas.accion();
  }));
  vista.querySelectorAll('[data-t]').forEach(b => b.onclick = intentar(async () => {
    const t = a.actividades.find(x => x.id == b.dataset.t);
    let body = { cumplida: !t.cumplida };
    if (!t.cumplida) {
      const v = await modal('Actividad cumplida', `<p>${esc(t.descripcion)}</p><label>Evidencia<textarea name="evidencia" required></textarea></label>`, { aceptar: 'Marcar cumplida' });
      if (!v) return; body.evidencia = v.evidencia;
    }
    await api(`/acciones/${a.id}/actividades/${t.id}`, { method: 'PUT', body }); rutas.accion();
  }));
};

// ---------- Pendientes en "Mi plan de trabajo" ----------
const inicioConIndicadores = rutas.inicio;
rutas.inicio = async function () {
  await inicioConIndicadores();
  const p = await api('/auditorias-pendientes');
  if (p.evaluaciones.length) vista.insertAdjacentHTML('beforeend', `<div class="tarjeta"><h3>Evaluaciones donde eres auditor</h3><table><tbody>
    ${p.evaluaciones.map(e => `<tr class="click" onclick="location.hash='#/auditoria/${e.id}'"><td class="mono">${esc(e.codigo)}</td><td>${esc(e.nombre)}</td>
      <td>${fecha(e.fecha_inicio)}</td><td><span class="chip">${esc(e.estado)}</span></td></tr>`).join('')}</tbody></table></div>`);
  if (p.acciones.length) vista.insertAdjacentHTML('beforeend', `<div class="tarjeta"><h3>Acciones correctivas y de mejora</h3><table><tbody>
    ${p.acciones.map(a => `<tr class="click" onclick="location.hash='#/accion/${a.id}'"><td class="mono">${esc(a.codigo)}</td><td>${esc(a.hallazgo)}</td>
      <td>${fecha(a.fecha_compromiso)}${a.vencida ? ' <span class="faltan">Vencida</span>' : ''}</td>
      <td><span class="chip">${a.estado === 'Verificación' && a.responsable_id !== yo.id ? 'Por verificar' : esc(a.estado)}</span></td></tr>`).join('')}</tbody></table></div>`);
};
