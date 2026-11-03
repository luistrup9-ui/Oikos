// SGI — Administración → Evaluaciones: emisores, ciclos, tipos de evaluación, unidades auditables, clasificación de hallazgos,
// semáforo del nivel de gestión y reporte de puntos de atención. Usa $, api, esc, modal, intentar, aviso, parametro, exportarCSV de los otros módulos.
const SUB_EVAL = [['emisores', 'Emisores'], ['ciclos', 'Ciclos'], ['tipos', 'Tipos de evaluación'], ['unidades', 'Unidades auditables'],
  ['clasificaciones', 'Clasificación de hallazgos'], ['semaforo', 'Semáforo'], ['atenciones', 'Reporte de puntos de atención']];

async function pestanaEvaluaciones() {
  const sub = SUB_EVAL.some(([k]) => k === parametro('s')) ? parametro('s') : 'emisores';
  $('#cuerpo').innerHTML = `<div class="tabs sub-tabs">${SUB_EVAL.map(([k, n]) => `<button class="${k === sub ? 'activo' : ''}" data-ir="#/admin?v=evaluaciones&s=${k}">${esc(n)}</button>`).join('')}</div>
    <div id="sub"></div>`;
  const dibujar = { emisores: subEmisores, ciclos: subCiclos, tipos: subTipos, unidades: subUnidades, clasificaciones: subClasificaciones, semaforo: subSemaforo, atenciones: subAtenciones }[sub];
  await dibujar($('#sub'));
}
const volver = () => pestanaEvaluaciones();
const si = v => v ? '✓' : '—';

// ---------- Emisores ----------
async function subEmisores(cont) {
  const { emisores } = await api('/eval-param');
  cont.innerHTML = `<div class="tarjeta"><h3>Emisores de las evaluaciones</h3>
    <p class="sub">Quién emite la evaluación. Los tres nombres son fijos; aquí se marca qué trae por defecto cada uno al programar.</p>
    <div class="tabla-wrap"><table><thead><tr><th>Sigla</th><th>Emisor</th><th>Riesgos por defecto</th><th>Indicadores por defecto</th><th>Trámites por defecto</th><th class="num">Evaluaciones</th></tr></thead><tbody>
    ${emisores.map(m => `<tr><td class="mono">${esc(m.sigla)}</td><td>${esc(m.nombre)}</td>
      ${['riesgos_defecto', 'indicadores_defecto', 'tramites_defecto'].map(c => `<td><input type="checkbox" data-emisor="${m.id}" data-campo="${c}" ${m[c] ? 'checked' : ''}></td>`).join('')}
      <td class="num">${m.evaluaciones}</td></tr>`).join('')}</tbody></table></div></div>`;
  cont.querySelectorAll('[data-emisor]').forEach(c => c.onchange = intentar(async () => {
    await api(`/eval-param/emisores/${c.dataset.emisor}`, { method: 'PUT', body: { [c.dataset.campo]: c.checked ? 1 : 0 } }); aviso('Guardado');
  }));
}

// ---------- Ciclos ----------
async function subCiclos(cont) {
  const { ciclos } = await api('/eval-param');
  cont.innerHTML = `<div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Ciclos de evaluación</h3><button class="btn primario" id="nuevo">Crear ciclo</button></div>
    ${ciclos.length ? `<div class="tabla-wrap"><table><thead><tr><th class="num">Orden</th><th>Ciclo</th><th class="num">Evaluaciones</th><th>Estado</th><th></th></tr></thead><tbody>
      ${ciclos.map(c => `<tr style="${c.activo ? '' : 'opacity:.55'}"><td class="num">${c.orden}</td><td>${esc(c.nombre)}</td><td class="num">${c.evaluaciones}</td><td>${c.activo ? 'Activo' : 'Inactivo'}</td>
        <td style="white-space:nowrap"><button class="btn chico" data-edita="${c.id}">Editar</button>
          <button class="btn chico" data-activo="${c.id}">${c.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn chico peligro" data-borra="${c.id}">Borrar</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">Aún no hay ciclos. Crea el primero con «Crear ciclo».</p>'}</div>`;
  const dialogo = async c => modal(c ? 'Editar ciclo' : 'Crear ciclo', `<div class="form"><label class="ancho">Nombre<input name="nombre" required value="${esc(c?.nombre)}"></label>
    <label>Orden<input type="number" name="orden" value="${c ? c.orden : ''}"></label></div>`, { aceptar: c ? 'Guardar' : 'Crear' });
  $('#nuevo').onclick = intentar(async () => { const v = await dialogo(); if (!v) return; await api('/eval-param/ciclos', { method: 'POST', body: v }); aviso('Ciclo creado'); volver(); });
  cont.querySelectorAll('[data-edita]').forEach(b => b.onclick = intentar(async () => {
    const v = await dialogo(ciclos.find(c => c.id == b.dataset.edita)); if (!v) return;
    await api(`/eval-param/ciclos/${b.dataset.edita}`, { method: 'PUT', body: v }); aviso('Guardado'); volver();
  }));
  cont.querySelectorAll('[data-activo]').forEach(b => b.onclick = intentar(async () => {
    const c = ciclos.find(x => x.id == b.dataset.activo); await api(`/eval-param/ciclos/${c.id}`, { method: 'PUT', body: { activo: c.activo ? 0 : 1 } }); volver();
  }));
  cont.querySelectorAll('[data-borra]').forEach(b => b.onclick = intentar(async () => {
    const c = ciclos.find(x => x.id == b.dataset.borra);
    if (!await modal('Borrar ciclo', `<p>Se borra el ciclo «${esc(c.nombre)}». ¿Continuar?</p>`, { aceptar: 'Borrar', peligro: true })) return;
    await api(`/eval-param/ciclos/${c.id}`, { method: 'DELETE' }); aviso('Ciclo borrado'); volver();
  }));
}

// ---------- Tipos de evaluación ----------
async function subTipos(cont) {
  const { tipos } = await api('/eval-param');
  cont.innerHTML = `<div class="tarjeta"><h3>Tipos de evaluación</h3>
    <p class="sub">El tipo «por defecto» es el que aparece preseleccionado al programar una evaluación. Toda evaluación nueva empieza en Planeación.</p>
    <div class="tabla-wrap"><table><thead><tr><th>Nombre</th><th>¿Tipo por defecto?</th><th class="num">Evaluaciones</th><th class="num">Cronogramas</th><th>Estado inicial</th></tr></thead><tbody>
    ${tipos.map(t => `<tr><td>${esc(t.nombre)}</td><td>${t.por_defecto ? '<span class="chip">Por defecto</span>' : `<button class="btn chico" data-defecto="${t.id}">Usar por defecto</button>`}</td>
      <td class="num">${t.evaluaciones}</td><td class="num">${t.cronogramas}</td><td>${esc(t.estado_inicial)}</td></tr>`).join('')}</tbody></table></div></div>`;
  cont.querySelectorAll('[data-defecto]').forEach(b => b.onclick = intentar(async () => { await api(`/eval-param/tipos/${b.dataset.defecto}`, { method: 'PUT', body: {} }); aviso('Tipo por defecto cambiado'); volver(); }));
}

// ---------- Unidades auditables ----------
async function subUnidades(cont) {
  const lista = await api('/eval-param/unidades');
  cont.innerHTML = `<div class="tarjeta"><h3>Unidades auditables</h3>
    <p class="sub">Hay una unidad por proceso: se crean solas al crear procesos o subprocesos (Administración → Procesos). El usuario es quien lidera el proceso.</p>
    <div class="tabla-wrap"><table><thead><tr><th>Unidad</th><th>Proceso o área</th><th>Usuario</th><th class="num">Evaluaciones</th></tr></thead><tbody>
    ${lista.map(u => `<tr><td><span class="mono">${esc(u.codigo || '—')}</span> ${esc(u.nombre)}</td><td>${esc(u.padre ? `${u.padre} ▸ ${u.tipo}` : `${u.categoria} · ${u.tipo}`)}</td>
      <td>${u.lideres ? esc(u.lideres) : '<span class="faltan">Sin líder</span>'}</td><td class="num">${u.evaluaciones}</td></tr>`).join('')}</tbody></table></div></div>`;
}

// ---------- Clasificación de hallazgos ----------
async function subClasificaciones(cont) {
  const { clasificaciones } = await api('/eval-param');
  cont.innerHTML = `<div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Clasificación de hallazgos</h3><button class="btn primario" id="nueva">Crear clasificación</button></div>
    <p class="sub">Los hallazgos que salen de una lista de verificación se clasifican como «Hallazgo»; al registrar uno a mano se elige entre estas.</p>
    <div class="tabla-wrap"><table><thead><tr><th>Clasificación</th><th class="num">Hallazgos</th><th></th></tr></thead><tbody>
    ${clasificaciones.map(c => `<tr><td>${esc(c.nombre)}</td><td class="num">${c.hallazgos}</td>
      <td style="white-space:nowrap"><button class="btn chico" data-edita="${c.id}">Editar</button> <button class="btn chico peligro" data-borra="${c.id}">Borrar</button></td></tr>`).join('')}</tbody></table></div></div>`;
  const dialogo = c => modal(c ? 'Editar clasificación' : 'Crear clasificación', `<label class="ancho">Nombre<input name="nombre" required value="${esc(c?.nombre)}"></label>`, { aceptar: c ? 'Guardar' : 'Crear' });
  $('#nueva').onclick = intentar(async () => { const v = await dialogo(); if (!v) return; await api('/eval-param/clasificaciones', { method: 'POST', body: v }); aviso('Clasificación creada'); volver(); });
  cont.querySelectorAll('[data-edita]').forEach(b => b.onclick = intentar(async () => {
    const v = await dialogo(clasificaciones.find(c => c.id == b.dataset.edita)); if (!v) return;
    await api(`/eval-param/clasificaciones/${b.dataset.edita}`, { method: 'PUT', body: v }); aviso('Guardado'); volver();
  }));
  cont.querySelectorAll('[data-borra]').forEach(b => b.onclick = intentar(async () => {
    const c = clasificaciones.find(x => x.id == b.dataset.borra);
    if (!await modal('Borrar clasificación', `<p>Se borra «${esc(c.nombre)}». ¿Continuar?</p>`, { aceptar: 'Borrar', peligro: true })) return;
    await api(`/eval-param/clasificaciones/${c.id}`, { method: 'DELETE' }); aviso('Clasificación borrada'); volver();
  }));
}

// ---------- Semáforo del nivel de gestión ----------
async function subSemaforo(cont) {
  const { cortes } = await api('/eval-param');
  cont.innerHTML = `<div class="tarjeta"><h3>Semáforo del nivel de gestión</h3>
    <p class="sub">Define desde qué porcentaje de cumplimiento un cuestionario o una unidad se considera de nivel alto, medio o bajo (Resultados de cada evaluación).</p>
    <form class="form" id="formSemaforo" style="max-width:520px">
      <label><span class="nivel verde">Cumplimiento Alto</span> desde (%)<input type="number" name="verde" min="1" max="100" step="0.5" required value="${cortes.verde}"></label>
      <label><span class="nivel amarillo">Cumplimiento Medio</span> desde (%)<input type="number" name="amarillo" min="0" max="99" step="0.5" required value="${cortes.amarillo}"></label>
      <p class="sub ancho" style="margin:0">Por debajo del corte amarillo el nivel es <span class="nivel rojo">Cumplimiento Bajo</span>.</p>
      <div class="acciones ancho"><button class="btn primario">Guardar</button></div></form></div>`;
  $('#formSemaforo').addEventListener('submit', intentar(async e => {
    e.preventDefault(); await api('/eval-param/semaforo', { method: 'PUT', body: valoresForm(e.target) }); aviso('Semáforo guardado');
  }));
}

// ---------- Reporte de puntos de atención ----------
async function subAtenciones(cont) {
  const [evals, p] = await Promise.all([api('/evaluaciones'), api('/evaluaciones/catalogos')]);
  const anios = [...new Set([...evals.map(e => e.anio), anioHoy])].sort((a, b) => b - a);
  const previa = parametro('evaluacion');
  const tiposAccion = ['Corrección', 'Acción correctiva', 'Acción de mejora'], estadosAccion = ['Análisis', 'Ejecución', 'Verificación', 'Cerrada'];
  const multi = (n, l, v = []) => `<select name="${n}" multiple>${l.map(x => { const [val, txt] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}" ${v.includes(String(val)) ? 'selected' : ''}>${esc(txt)}</option>`; }).join('')}</select>`;
  cont.innerHTML = `<form class="tarjeta filtros" id="filtros">
      <label>Años${multi('anio', anios)}</label>
      <label>Estado del informe${multi('estado_informe', p.estados)}</label>
      <label>Evaluador${multi('evaluador', p.evaluadores)}</label>
      <label>Informes${multi('evaluacion', evals.map(e => [e.id, `${e.codigo} · ${e.nombre}`]), previa ? [previa] : [])}</label>
      <label>Estado del punto${multi('estado', estadosAccion)}</label>
      <label>Tipo${multi('tipo', tiposAccion)}</label>
      <label>Unidades${multi('unidad', cat.procesos.map(x => [x.id, x.nombre]))}</label>
      <label>Responsable${multi('responsable', cat.usuarios.map(x => [x.id, x.nombre]))}</label>
      <label>Ordenar por<select name="orden_por"><option value="fecha_compromiso">Fecha límite de atención</option><option value="codigo">Código</option><option value="estado">Estado</option><option value="unidad">Unidad</option><option value="evaluacion">Evaluación</option></select></label>
      <label>Orden<select name="orden"><option value="asc">Ascendente</option><option value="desc">Descendente</option></select></label>
      <fieldset class="mostrar"><legend>Mostrar</legend>
        <label class="check"><input type="checkbox" id="vHallazgo" checked> Texto del hallazgo</label>
        <label class="check"><input type="checkbox" id="vAvance" checked> Avance ponderado</label>
        <label class="check"><input type="checkbox" id="vSeg" checked> Seguimientos</label></fieldset>
      <div class="acciones"><button class="btn primario">Generar reporte</button><button type="button" class="btn" id="csv">Exportar a Excel</button></div></form>
    <div id="resultado"></div>`;
  let filas = [];
  const pintar = () => {
    const h = $('#vHallazgo').checked, a = $('#vAvance').checked, s = $('#vSeg').checked;
    $('#resultado').innerHTML = filas.length ? `<div class="tabla-wrap"><table><thead><tr><th>Informe</th><th>Unidad</th><th>Hallazgo</th><th>Punto de atención</th><th>Tipo</th><th>Estado</th><th>Responsable</th><th>Fecha límite</th>
        ${a ? '<th class="num">Avance</th>' : ''}${s ? '<th class="num">Seguimientos</th>' : ''}</tr></thead><tbody>
      ${filas.map(f => `<tr class="click" data-ir="#/accion/${f.id}"><td><span class="mono">${esc(f.evaluacion_codigo)}</span><br><small class="sub">${esc(f.evaluacion)}</small></td><td>${esc(f.unidad || '—')}</td>
        <td><span class="mono">${esc(f.hallazgo_codigo)}</span>${h ? `<br><small>${esc(f.hallazgo)}</small>` : ''}</td><td class="mono">${esc(f.codigo)}</td><td>${esc(f.tipo)}</td>
        <td><span class="chip">${esc(f.estado)}</span></td><td>${esc(f.responsable || '—')}</td><td>${fecha(f.fecha_compromiso)}${f.vencida ? ' <span class="faltan">vencida</span>' : ''}</td>
        ${a ? `<td class="num">${f.avance == null ? '—' : f.avance.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' %'}</td>` : ''}${s ? `<td class="num">${f.seguimientos}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">No hay puntos de atención con estos criterios.</p>';
  };
  const generar = intentar(async () => {
    const r = await api('/eval-param/atenciones?' + qs(valoresForm($('#filtros')))); filas = r.filas;
    pintar(); $('#resultado').insertAdjacentHTML('afterbegin', `<p class="sub">${r.total} punto(s) de atención · ${r.por_estado.map(x => `${x.estado}: ${x.n}`).join(' · ')}</p>`);
  });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); generar(); });
  ['#vHallazgo', '#vAvance', '#vSeg'].forEach(i => $(i).addEventListener('change', () => { if (filas.length) pintar(); }));
  $('#csv').onclick = () => exportarCSV('puntos-de-atencion.csv', filas, [['evaluacion_codigo', 'Informe'], ['evaluacion', 'Evaluación'], ['unidad', 'Unidad'], ['hallazgo_codigo', 'Hallazgo'], ['hallazgo', 'Texto del hallazgo'],
    ['codigo', 'Punto de atención'], ['tipo', 'Tipo'], ['estado', 'Estado'], ['responsable', 'Responsable'], ['fecha_compromiso', 'Fecha límite'], ['avance', 'Avance (%)'], ['seguimientos', 'Seguimientos']]);
  if (previa) generar();
}
