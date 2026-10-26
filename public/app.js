// SGI — interfaz de gestión documental (vanilla JS, rutas por hash)
const $ = (s, el = document) => el.querySelector(s);
const vista = $('#vista');
let yo = null, cat = null;

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = v => v ? esc(String(v).slice(0, 16)) : '—';
const estado = (id, nombre) => `<span class="estado ${esc(id)}" title="${esc(nombre)}">${esc(cat?.estados.find(e => e.id === id)?.nombre.split(' (')[0] || id)}</span>`;
const esCalidad = () => yo && (yo.rol === 'admin' || yo.rol === 'lider_calidad');
const ROLES = { admin: 'Administrador', lider_calidad: 'Líder de Calidad', lider_proceso: 'Líder de proceso', consulta: 'Consulta' };

async function api(url, opciones = {}) {
  const o = { ...opciones, headers: { ...(opciones.headers || {}) } };
  if (o.body && !(o.body instanceof FormData)) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.body); }
  const res = await fetch('/api' + url, o);
  const datos = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.status === 401 && url !== '/login') { mostrarLogin(); throw new Error('Sesión vencida'); }
  if (!res.ok) throw new Error(datos?.error || 'Error ' + res.status);
  return datos;
}
function aviso(msg, mal = false) {
  const a = $('#aviso'); a.textContent = msg; a.className = 'aviso' + (mal ? ' mal' : ''); a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, 3500);
}
const intentar = fn => async (...a) => { try { await fn(...a); } catch (e) { aviso(e.message, true); } };
const opciones = (lista, sel, vacio) => (vacio ? `<option value="">${vacio}</option>` : '') +
  lista.map(x => `<option value="${esc(x.id)}" ${String(sel) === String(x.id) ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
const valoresForm = form => {
  const o = {};
  for (const [k, v] of new FormData(form)) o[k] = k in o ? [].concat(o[k], v) : v;
  return o;
};
const qs = obj => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) [].concat(v).forEach(x => x !== '' && x != null && p.append(k, x));
  return p.toString();
};

// Modal genérico: devuelve los valores del formulario o null si se cancela
function modal(titulo, cuerpo, { aceptar = 'Guardar', peligro = false } = {}) {
  const dlg = $('#modal'), f = $('#modalForm');
  f.innerHTML = `<h3>${esc(titulo)}</h3>${cuerpo}<div class="acciones" style="justify-content:flex-end">
    <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
    <button class="btn ${peligro ? 'peligro' : 'primario'}" value="ok">${esc(aceptar)}</button></div>`;
  dlg.showModal();
  return new Promise(res => dlg.addEventListener('close', () => res(dlg.returnValue === 'ok' ? valoresForm(f) : null), { once: true }));
}

// ---------- Sesión ----------
function mostrarLogin() { $('#app').hidden = true; $('#login').hidden = false; }
$('#formLogin').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/login', { method: 'POST', body: valoresForm(e.target) }); $('#errLogin').textContent = ''; iniciar(); }
  catch (err) { $('#errLogin').textContent = err.message; }
});
$('#salir').onclick = async e => { e.preventDefault(); await api('/logout', { method: 'POST' }); mostrarLogin(); };

async function iniciar() {
  try { yo = await api('/yo'); } catch { return; }
  cat = await api('/catalogos');
  $('#usuario').textContent = yo.nombre;
  $('#usuario').title = ROLES[yo.rol];
  $('#usuarioCorto').textContent = '/ ' + yo.usuario;
  for (const id of ['empresa', 'logoTexto', 'pieEmpresa']) $('#' + id).textContent = yo.empresa || '';
  document.querySelectorAll('[data-solo]').forEach(el => el.hidden = !el.dataset.solo.split(',').includes(yo.rol));
  document.querySelectorAll('[data-no]').forEach(el => el.hidden = el.dataset.no.split(',').includes(yo.rol));
  $('#login').hidden = true; $('#app').hidden = false;
  document.dispatchEvent(new Event('sgi:sesion')); // armazon.js llena el panel lateral
  enrutar();
  if (yo.debe_cambiar && window.pedirCambioClave) pedirCambioClave(true);
}

// ---------- Rutas ----------
const rutas = { inicio, mapa, documentos, documento, solicitudes, registros, estadisticas };
async function enrutar() {
  if (!yo) return;
  const [, nombre = 'bienvenida', arg] = location.hash.split('?')[0].split('/');
  document.querySelectorAll('#menu a, #oeste a').forEach(a => a.classList.toggle('activo', a.getAttribute('href') === '#/' + nombre));
  vista.innerHTML = '<p class="sub">Cargando…</p>';
  try { await (rutas[nombre] || rutas.bienvenida)(arg); } catch (e) { vista.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', enrutar);

function tablaDocs(docs) {
  if (!docs.length) return '<p class="vacio">No hay documentos con estos criterios.</p>';
  return `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Clase</th><th>Proceso</th>
    <th>Origen</th><th>Versión</th><th>Estado</th><th>Vence</th><th>Modificado</th></tr></thead><tbody>
    ${docs.map(d => `<tr class="click" onclick="location.hash='#/documento/${d.id}'"><td class="mono">${esc(d.codigo)}</td>
      <td>${esc(d.nombre)}</td><td>${esc(d.tipo)}</td><td>${esc(d.clase)}</td><td>${esc(d.proceso)}</td><td>${esc(d.origen)}</td>
      <td>${d.version}</td><td>${estado(d.estado)}</td><td>${fecha(d.fecha_vencimiento)}</td><td>${fecha(d.modificado)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

// ---------- Mi plan de trabajo ----------
async function inicio() {
  const p = await api('/pendientes');
  vista.innerHTML = `
    <div class="encabezado"><h2>Mi plan de trabajo</h2>
      ${yo.rol !== 'consulta' ? '<button class="btn primario" id="nuevaSol">Nueva solicitud</button>' : ''}</div>
    <div class="kpis">
      <div class="kpi"><b>${p.documentos.length}</b><span>Documentos que esperan una acción tuya</span></div>
      ${esCalidad() ? `<div class="kpi"><b>${p.solicitudes}</b><span>Solicitudes por resolver</span></div>` : ''}
      <div class="kpi"><b>${p.por_vencer.length}</b><span>Documentos vigentes que vencen en 30 días</span></div>
    </div>
    <div class="tarjeta"><h3>Transiciones pendientes</h3>
      ${p.documentos.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Nombre</th><th>Proceso</th><th>Estado</th>
        <th>Acción pendiente</th><th>Modificado</th></tr></thead><tbody>
        ${p.documentos.map(d => `<tr class="click" onclick="location.hash='#/documento/${d.id}'"><td class="mono">${esc(d.codigo)}</td>
          <td>${esc(d.nombre)}</td><td>${esc(d.proceso)}</td><td>${estado(d.estado)}</td>
          <td>${d.transiciones.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</td><td>${fecha(d.modificado)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="vacio">No tienes pendientes. 🎉</p>'}
    </div>
    ${esCalidad() && p.solicitudes ? `<div class="tarjeta"><a href="#/solicitudes">Ver ${p.solicitudes} solicitud(es) por resolver →</a></div>` : ''}
    ${p.por_vencer.length ? `<div class="tarjeta"><h3>Próximos a vencer</h3>${tablaDocs(p.por_vencer)}</div>` : ''}`;
  $('#nuevaSol')?.addEventListener('click', intentar(() => nuevaSolicitud()));
}

// ---------- Mapa de procesos ----------
async function mapa() {
  const vigentes = await api('/documentos?estado=VIGENTE');
  const cuenta = id => vigentes.filter(d => d.proceso_id === id).length;
  vista.innerHTML = `<div class="encabezado"><h2>Mapa de procesos</h2></div>
    <div class="tarjeta mapa">${['Estratégico', 'Misional', 'Apoyo'].map(c => `
      <div class="f-${c} franja-titulo">${c.toUpperCase()}</div>
      <div class="f-${c} franja">${cat.procesos.filter(p => p.categoria === c && !p.padre_id).map(p => `
        <button class="proceso" onclick="location.hash='#/proceso/${p.id}'"><b>${esc(p.nombre)}</b>
        <small>${esc(p.codigo || p.sigla)} · ${cuenta(p.id)} documento(s) vigente(s)</small>
        ${cat.procesos.filter(h => h.padre_id === p.id).map(h => `<small class="sub-proc">↳ ${esc(h.nombre)}</small>`).join('')}</button>`).join('')}</div>`).join('')}
    </div>`;
}

// ---------- Listado maestro ----------
async function documentos(procesoId) {
  vista.innerHTML = `
    <div class="encabezado"><h2>Listado maestro de documentos</h2>
      <div class="acciones">
        <button class="btn" id="exportar">Exportar CSV</button>
        ${esCalidad() ? '<button class="btn primario" id="nuevoDoc">Nuevo documento</button>' : ''}
        ${yo.rol !== 'consulta' && !esCalidad() ? '<button class="btn primario" id="nuevaSol">Solicitar documento</button>' : ''}
      </div></div>
    <form class="tarjeta filtros" id="filtros">
      <label>Buscar<input name="texto" placeholder="Código, nombre o descripción"></label>
      <label>Tipo<select name="tipo" multiple>${opciones(cat.tipos)}</select></label>
      <label>Proceso<select name="proceso" multiple>${opciones(cat.procesos, procesoId)}</select></label>
      <label>Clase<select name="clase" multiple>${opciones(cat.clases)}</select></label>
      <label>Origen<select name="origen" multiple><option>Interno</option><option>Externo</option></select></label>
      ${yo.rol !== 'consulta' ? `<label>Estado<select name="estado" multiple>${opciones(cat.estados)}</select></label>` : ''}
      <label>Fecha<select name="campo_fecha"><option value="modificado">Modificación</option><option value="creado">Creación</option>
        <option value="documento">Del documento</option><option value="vencimiento">Vencimiento</option></select></label>
      <label>Condición<select name="op"><option value="">—</option><option value=">">Desde</option><option value="<">Hasta</option>
        <option value="entre">Entre</option></select></label>
      <label>Fecha 1<input type="date" name="fecha1"></label>
      <label>Fecha 2<input type="date" name="fecha2"></label>
      <div class="acciones"><button class="btn primario">Filtrar</button><button class="btn" type="reset">Limpiar</button></div>
    </form>
    <div id="resultado"></div>`;
  let ultimos = [];
  const cargar = intentar(async () => {
    ultimos = await api('/documentos?' + qs(valoresForm($('#filtros'))));
    $('#resultado').innerHTML = `<p class="sub">${ultimos.length} documento(s)</p>${tablaDocs(ultimos)}`;
  });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); cargar(); });
  $('#filtros').addEventListener('reset', () => setTimeout(cargar));
  $('#nuevoDoc')?.addEventListener('click', intentar(nuevoDocumento));
  $('#nuevaSol')?.addEventListener('click', intentar(() => nuevaSolicitud()));
  $('#exportar').onclick = () => exportarCSV('listado-maestro.csv', ultimos,
    [['codigo', 'Código'], ['nombre', 'Nombre'], ['tipo', 'Tipo'], ['clase', 'Clase'], ['proceso', 'Proceso'], ['origen', 'Origen'],
     ['version', 'Versión'], ['estado', 'Estado'], ['responsable', 'Responsable'], ['fecha_documento', 'Fecha documento'],
     ['fecha_vencimiento', 'Vencimiento'], ['creado', 'Creado'], ['modificado', 'Modificado']]);
  cargar();
}

function exportarCSV(nombre, filas, columnas) {
  const celda = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [columnas.map(c => celda(c[1])).join(';'), ...filas.map(f => columnas.map(c => celda(f[c[0]])).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = nombre; a.click();
}

const camposDoc = (d = {}) => `<div class="form">
  <label class="ancho">Nombre<input name="nombre" required value="${esc(d.nombre)}"></label>
  <label>Tipo<select name="tipo_id" required>${opciones(cat.tipos, d.tipo_id)}</select></label>
  <label>Clase<select name="clase_id" required ${d.id ? 'disabled' : ''}>${opciones(cat.clases, d.clase_id)}</select></label>
  <label>Proceso<select name="proceso_id" required ${d.id ? 'disabled' : ''}>${opciones(cat.procesos, d.proceso_id ?? yo.proceso_id)}</select></label>
  <label>Origen<select name="origen"><option ${d.origen === 'Interno' ? 'selected' : ''}>Interno</option>
    <option ${d.origen === 'Externo' ? 'selected' : ''}>Externo</option></select></label>
  <label>Responsable<select name="responsable_id">${opciones(cat.usuarios.filter(u => u.rol !== 'consulta'), d.responsable_id ?? yo.id)}</select></label>
  <label>Fecha de vencimiento<input type="date" name="fecha_vencimiento" value="${esc(d.fecha_vencimiento)}"></label>
  <label class="ancho">Descripción<textarea name="descripcion">${esc(d.descripcion)}</textarea></label></div>`;

async function nuevoDocumento() {
  const v = await modal('Nuevo documento', `<p class="sub">El código se genera solo (PROCESO-CLASE-consecutivo) y el documento arranca en Elaboración.</p>${camposDoc()}`, { aceptar: 'Crear' });
  if (!v) return;
  const { id } = await api('/documentos', { method: 'POST', body: v });
  location.hash = '#/documento/' + id;
}

// ---------- Ficha de documento ----------
async function documento(id) {
  const d = await api('/documentos/' + id);
  const flujo = ['ELABORACION', 'REVISION', 'PUBLICACION', 'VIGENTE'];
  const pos = flujo.indexOf(d.estado);
  const versionActual = d.versiones.filter(v => v.version === d.version);
  vista.innerHTML = `
    <div class="encabezado"><div><a href="#/documentos">← Listado maestro</a>
      <h2 style="margin-top:6px"><span class="mono">${esc(d.codigo)}</span> · ${esc(d.nombre)}</h2></div>
      <div class="acciones">
        ${d.transiciones.map(t => `<button class="btn ${t.id === 'eliminar' ? 'peligro' : 'primario'}" data-tr="${t.id}">${esc(t.nombre)}</button>`).join('')}
        ${d.estado === 'VIGENTE' && yo.rol !== 'consulta' && !esCalidad() ? '<button class="btn" id="solMod">Solicitar modificación</button><button class="btn peligro" id="solEli">Solicitar eliminación</button>' : ''}
      </div></div>
    ${d.estado === 'ELIMINADO' ? `<p>${estado('ELIMINADO')}</p>` : `<div class="flujo">${flujo.map((e, i) =>
      `<div class="paso ${i < pos ? 'hecho' : i === pos ? 'actual' : ''}">${esc(cat.estados.find(x => x.id === e).nombre)}</div>`).join('')}</div>`}
    <div class="ficha">
      <div>
        <div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Datos</h3>
          ${d.puede_editar ? '<button class="btn chico" id="editar">Editar</button>' : ''}</div>
          <dl class="datos">
            <dt>Tipo</dt><dd>${esc(d.tipo)}</dd><dt>Clase</dt><dd>${esc(d.clase)}</dd>
            <dt>Proceso</dt><dd>${esc(d.proceso)} <span class="chip">${esc(d.categoria)}</span></dd>
            <dt>Origen</dt><dd>${esc(d.origen)}</dd><dt>Versión</dt><dd>${d.version}</dd>
            <dt>Estado</dt><dd>${estado(d.estado)}</dd><dt>Responsable</dt><dd>${esc(d.responsable)}</dd>
            <dt>Fecha documento</dt><dd>${fecha(d.fecha_documento)}</dd><dt>Vencimiento</dt><dd>${fecha(d.fecha_vencimiento)}</dd>
            <dt>Creado</dt><dd>${fecha(d.creado)}</dd><dt>Modificado</dt><dd>${fecha(d.modificado)}</dd>
            <dt>Descripción</dt><dd>${esc(d.descripcion) || '—'}</dd>
          </dl></div>
        <div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Archivos y versiones</h3>
          ${d.puede_editar ? `<button class="btn chico primario" id="subir">${versionActual.length ? 'Reemplazar' : 'Adjuntar'} archivo v${d.version}</button>` : ''}</div>
          ${d.versiones.length ? `<table><thead><tr><th>Versión</th><th>Archivo</th><th>Cambios</th><th>Subido por</th><th>Fecha</th></tr></thead><tbody>
            ${d.versiones.map(v => `<tr><td>v${v.version}</td><td><a href="/api/documentos/${d.id}/versiones/${v.id}">${esc(v.archivo_nombre)}</a></td>
              <td>${esc(v.cambios) || '—'}</td><td>${esc(v.usuario)}</td><td>${fecha(v.fecha)}</td></tr>`).join('')}</tbody></table>`
            : '<p class="vacio">Aún no hay archivos.</p>'}</div>
      </div>
      <div class="tarjeta"><h3>Trazabilidad</h3><div class="linea">
        ${d.bitacora.map(b => `<div><b>${esc(b.transicion || b.transicion_id)}</b> · v${b.version}<br>
          <small>${esc(b.usuario)} · ${fecha(b.fecha)}</small>${b.comentario ? `<br>“${esc(b.comentario)}”` : ''}</div>`).join('')}
      </div></div>
    </div>`;

  vista.querySelectorAll('[data-tr]').forEach(b => b.onclick = intentar(async () => {
    const t = d.transiciones.find(x => x.id === b.dataset.tr);
    const v = await modal(`${t.nombre}: ${d.codigo}`, `<label>Comentario${t.id === 'devolver' ? ' (obligatorio)' : ''}
      <textarea name="comentario" ${t.id === 'devolver' ? 'required' : ''}></textarea></label>`,
      { aceptar: t.nombre, peligro: t.id === 'eliminar' });
    if (!v) return;
    await api(`/documentos/${d.id}/transicion`, { method: 'POST', body: { transicion: t.id, comentario: v.comentario } });
    aviso(`${t.nombre}: hecho`); documento(id);
  }));
  $('#editar')?.addEventListener('click', intentar(async () => {
    const v = await modal('Editar documento', camposDoc(d));
    if (!v) return;
    await api('/documentos/' + d.id, { method: 'PUT', body: v }); aviso('Guardado'); documento(id);
  }));
  $('#subir')?.addEventListener('click', intentar(async () => {
    const dlg = $('#modal'), f = $('#modalForm');
    f.innerHTML = `<h3>Archivo de la versión ${d.version}</h3>
      <label>Archivo<input type="file" name="archivo" required></label>
      <label>Descripción de los cambios<textarea name="cambios" placeholder="${d.version === 1 ? 'Versión inicial' : 'Qué cambió respecto a la versión anterior'}"></textarea></label>
      <div class="acciones" style="justify-content:flex-end"><button class="btn" value="cancelar" formnovalidate>Cancelar</button>
      <button class="btn primario" value="ok">Subir</button></div>`;
    dlg.showModal();
    dlg.addEventListener('close', intentar(async () => {
      if (dlg.returnValue !== 'ok') return;
      await api(`/documentos/${d.id}/archivo`, { method: 'POST', body: new FormData(f) });
      aviso('Archivo cargado'); documento(id);
    }), { once: true });
  }));
  $('#solMod')?.addEventListener('click', intentar(() => nuevaSolicitud('Modificación', d)));
  $('#solEli')?.addEventListener('click', intentar(() => nuevaSolicitud('Eliminación', d)));
}

// ---------- Solicitudes ----------
async function nuevaSolicitud(tipo = 'Creación', doc = null) {
  const cuerpo = doc
    ? `<p>Documento: <b class="mono">${esc(doc.codigo)}</b> ${esc(doc.nombre)}</p>
       <input type="hidden" name="documento_id" value="${doc.id}">`
    : `<div class="form">
        <label>Tipo de documento<select name="tipo_id" required>${opciones(cat.tipos)}</select></label>
        <label>Clase<select name="clase_id" required>${opciones(cat.clases)}</select></label>
        <label class="ancho">Proceso<select name="proceso_id" required>${opciones(cat.procesos, yo.proceso_id)}</select></label>
        <label class="ancho">Nombre<input name="nombre" required></label></div>`;
  const v = await modal(`Solicitud de ${tipo.toLowerCase()}`, `${cuerpo}
    <input type="hidden" name="tipo_solicitud" value="${tipo}">
    <label>Justificación<textarea name="justificacion" required></textarea></label>
    <label>Descripción<textarea name="descripcion"></textarea></label>`, { aceptar: 'Radicar' });
  if (!v) return;
  await api('/solicitudes', { method: 'POST', body: v });
  aviso('Solicitud radicada. Calidad la revisará.');
  if (location.hash.startsWith('#/solicitudes')) solicitudes(); else location.hash = '#/solicitudes';
}

async function solicitudes(pestana) {
  const tabs = [...(esCalidad() ? [['pendientes', 'Por resolver']] : []), ['tramite', 'Mis solicitudes en trámite'], ['historicas', 'Históricas']];
  pestana = pestana || tabs[0][0];
  const lista = await api('/solicitudes?vista=' + pestana);
  vista.innerHTML = `
    <div class="encabezado"><h2>Solicitudes</h2>
      ${yo.rol !== 'consulta' ? '<button class="btn primario" id="nuevaSol">Nueva solicitud</button>' : ''}</div>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="${k === pestana ? 'activo' : ''}" onclick="location.hash='#/solicitudes/${k}'">${n}</button>`).join('')}</div>
    ${lista.length ? `<div class="tabla-wrap"><table><thead><tr><th>#</th><th>Tipo</th><th>Documento</th><th>Proceso</th><th>Clase</th>
      <th>Justificación</th><th>Solicitante</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map(s => `<tr><td>${s.id}</td><td>${esc(s.tipo_solicitud)}</td>
        <td>${s.documento_id ? `<a href="#/documento/${s.documento_id}" class="mono">${esc(s.documento_codigo)}</a> ` : ''}${esc(s.nombre)}</td>
        <td>${esc(s.proceso)}</td><td>${esc(s.clase)}</td><td>${esc(s.justificacion)}</td><td>${esc(s.solicitante)}</td>
        <td>${fecha(s.creada)}</td><td>${esc(s.estado)}${s.respuesta ? `<br><small>“${esc(s.respuesta)}”</small>` : ''}</td>
        <td>${pestana === 'pendientes' ? `<div class="acciones"><button class="btn chico primario" data-ok="${s.id}">Aprobar</button>
          <button class="btn chico peligro" data-no="${s.id}">Rechazar</button></div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="vacio">No hay solicitudes aquí.</p>'}`;
  $('#nuevaSol')?.addEventListener('click', intentar(() => nuevaSolicitud()));
  const resolver = aprobar => intentar(async e => {
    const id = e.target.dataset.ok || e.target.dataset.no;
    const v = await modal(aprobar ? 'Aprobar solicitud' : 'Rechazar solicitud',
      `<label>Respuesta${aprobar ? '' : ' (obligatoria)'}<textarea name="respuesta" ${aprobar ? '' : 'required'}></textarea></label>`,
      { aceptar: aprobar ? 'Aprobar' : 'Rechazar', peligro: !aprobar });
    if (!v) return;
    const r = await api(`/solicitudes/${id}/resolver`, { method: 'POST', body: { aprobar, respuesta: v.respuesta } });
    aviso(aprobar ? 'Solicitud aprobada' : 'Solicitud rechazada');
    if (aprobar && r.documento_id) location.hash = '#/documento/' + r.documento_id; else solicitudes(pestana);
  });
  vista.querySelectorAll('[data-ok]').forEach(b => b.onclick = resolver(true));
  vista.querySelectorAll('[data-no]').forEach(b => b.onclick = resolver(false));
}

// ---------- Listado maestro de registros ----------
async function registros() {
  vista.innerHTML = `
    <div class="encabezado"><h2>Listado maestro de registros</h2>
      ${esCalidad() ? '<button class="btn primario" id="nuevoReg">Nuevo registro</button>' : ''}</div>
    <form class="tarjeta filtros" id="filtros">
      <label>Registro<input name="texto"></label>
      <label>Proceso<select name="proceso" multiple>${opciones(cat.procesos)}</select></label>
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form>
    <div id="resultado"></div>`;
  let lista = [];
  const formReg = (r = {}) => `<div class="form">
    <label class="ancho">Nombre del registro<input name="nombre" required value="${esc(r.nombre)}"></label>
    <label>Proceso<select name="proceso_id">${opciones(cat.procesos, r.proceso_id)}</select></label>
    <label>Formato asociado (id de documento)<input name="documento_id" type="number" value="${esc(r.documento_id)}"></label>
    <label>Cargo responsable<input name="responsable_cargo" value="${esc(r.responsable_cargo)}"></label>
    <label>Área<input name="responsable_area" value="${esc(r.responsable_area)}"></label>
    <label>Medio de almacenamiento<select name="medio">${['Físico', 'Digital', 'Físico y digital'].map(m => `<option ${r.medio === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <label>Ubicación<input name="ubicacion" value="${esc(r.ubicacion)}"></label>
    <label>Tiempo de almacenamiento<input name="tiempo_retencion" placeholder="Ej: 2 años" value="${esc(r.tiempo_retencion)}"></label>
    <label>Disposición final<select name="disposicion_final">${['Conservación total', 'Eliminación', 'Selección', 'Digitalización'].map(m => `<option ${r.disposicion_final === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <label class="ancho">Recuperación<input name="recuperacion" placeholder="Ej: por fecha y consecutivo" value="${esc(r.recuperacion)}"></label></div>`;
  const editar = intentar(async r => {
    const v = await modal(r ? 'Editar registro' : 'Nuevo registro', formReg(r || {}));
    if (!v) return;
    await api('/registros' + (r ? '/' + r.id : ''), { method: r ? 'PUT' : 'POST', body: v }); aviso('Guardado'); cargar();
  });
  const cargar = intentar(async () => {
    lista = await api('/registros?' + qs(valoresForm($('#filtros'))));
    $('#resultado').innerHTML = lista.length ? `<div class="tabla-wrap"><table><thead><tr><th>Registro</th><th>Proceso</th><th>Formato</th>
      <th>Cargo</th><th>Área</th><th>Medio</th><th>Ubicación</th><th>Tiempo</th><th>Disposición final</th><th>Recuperación</th>
      ${esCalidad() ? '<th></th>' : ''}</tr></thead><tbody>
      ${lista.map((r, i) => `<tr><td>${esc(r.nombre)}</td><td>${esc(r.proceso)}</td>
        <td>${r.documento_id ? `<a class="mono" href="#/documento/${r.documento_id}">${esc(r.documento_codigo)}</a>` : '—'}</td>
        <td>${esc(r.responsable_cargo)}</td><td>${esc(r.responsable_area)}</td><td>${esc(r.medio)}</td><td>${esc(r.ubicacion)}</td>
        <td>${esc(r.tiempo_retencion)}</td><td>${esc(r.disposicion_final)}</td><td>${esc(r.recuperacion)}</td>
        ${esCalidad() ? `<td><div class="acciones"><button class="btn chico" data-ed="${i}">Editar</button>
          <button class="btn chico peligro" data-del="${r.id}">Quitar</button></div></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">No hay registros.</p>';
    vista.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(lista[b.dataset.ed]));
    vista.querySelectorAll('[data-del]').forEach(b => b.onclick = intentar(async () => {
      if (!await modal('Quitar registro', '<p>¿Seguro que quieres quitarlo del listado?</p>', { aceptar: 'Quitar', peligro: true })) return;
      await api('/registros/' + b.dataset.del, { method: 'DELETE' }); cargar();
    }));
  });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); cargar(); });
  $('#nuevoReg')?.addEventListener('click', () => editar(null));
  cargar();
}

// ---------- Estadísticas ----------
async function estadisticas() {
  vista.innerHTML = `
    <div class="encabezado"><h2>Estadísticas</h2></div>
    <div id="kpis"></div>
    <form class="tarjeta filtros" id="filtros">
      <label>Documento<input name="texto" placeholder="Código o nombre"></label>
      <label>Tipo<select name="tipo" multiple>${opciones(cat.tipos)}</select></label>
      <label>Transición<select name="transicion" multiple>${opciones(cat.transiciones)}</select></label>
      <label>Estado inicial<select name="estado_inicial" multiple>${opciones(cat.estados)}</select></label>
      <label>Estado final<select name="estado_final" multiple>${opciones(cat.estados)}</select></label>
      <label>Usuario<select name="usuario" multiple>${opciones(cat.usuarios)}</select></label>
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form>
    <div class="tarjeta"><h3>Reporte de transiciones de documentos</h3><div id="resultado"></div></div>`;
  const cargar = intentar(async () => {
    const s = await api('/estadisticas?' + qs(valoresForm($('#filtros'))));
    const max = Math.max(1, ...s.por_proceso.map(p => p.n));
    $('#kpis').innerHTML = `<div class="kpis">${s.por_estado.map(e => `<div class="kpi"><b>${e.n}</b><span>${esc(e.nombre)}</span></div>`).join('')}</div>
      <div class="tarjeta"><h3>Documentos vigentes por proceso</h3><div class="barras">
      ${s.por_proceso.map(p => `<div><span>${esc(p.nombre)}</span><i style="width:${p.n / max * 100}%"></i><b>${p.n}</b></div>`).join('')}</div></div>`;
    $('#resultado').innerHTML = s.transiciones.length ? `<div class="tabla-wrap"><table><thead><tr><th>Tipo</th><th>Código</th><th>Nombre</th>
      <th>Versión</th><th>Estado inicial</th><th>Estado final</th><th>Transición</th><th>Usuario</th><th>Fecha</th><th>Comentarios</th></tr></thead><tbody>
      ${s.transiciones.map(t => `<tr><td>${esc(t.tipo)}</td><td class="mono"><a href="#/documento/${t.documento_id}">${esc(t.codigo)}</a></td>
        <td>${esc(t.nombre)}</td><td>v${t.version}</td><td>${t.estado_inicial ? estado(t.estado_inicial) : '—'}</td><td>${estado(t.estado_final)}</td>
        <td>${esc(t.transicion || t.transicion_id)}</td><td>${esc(t.usuario)}</td><td>${fecha(t.fecha)}</td><td>${esc(t.comentario)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="vacio">Sin transiciones.</p>';
  });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); cargar(); });
  cargar();
}

iniciar().then(() => { if (!yo) mostrarLogin(); });
