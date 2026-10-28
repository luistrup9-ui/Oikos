// Mecanismos de integración: administración, ficha del mecanismo, actas y compromisos (como Almera)
const TIPOS_MEC = ['Comité', 'Comité Primario', 'Reunión'];
const PERIODICIDADES = ['Anual', 'Bimestral', 'Eventual', 'Mensual', 'Quincenal', 'Semanal', 'Semestral', 'Trimestral'];
const OPCIONES_MEC = [['indicar_lugar', 'Indicar lugar'], ['mostrar_tipo', 'Mostrar tipo de reunión'], ['indicar_asistentes', 'Indicar asistentes'],
  ['control_asistencia', 'Control de asistencia'], ['tiene_compromisos', 'Tiene compromisos'], ['control_compromisos', 'Control de compromisos'],
  ['arrastrar_compromisos', 'Arrastrar compromisos abiertos'], ['miembros_compromisos', 'Miembros pueden adicionar compromisos'],
  ['notificar_cierre', 'Notificar cierre de acciones']];
const pct = v => v == null ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%';
const fechaLarga = f => f ? new Date(f + 'T12:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  .replace(/^./, c => c.toUpperCase()) : '—';
const hora12 = h => { if (!h) return ''; const [H, M] = h.split(':').map(Number); return `${(H % 12) || 12}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`; };
const parametro = n => new URLSearchParams(location.hash.split('?')[1] || '').get(n);
const pestanasPagina = (tabs, activa, base) => `<div class="tabs">${tabs.map(([k, n]) =>
  `<button class="${k === activa ? 'activo' : ''}" onclick="location.hash='${base}?t=${k}'">${esc(n)}</button>`).join('')}</div>`;
const estadoComp = e => `<span class="est-comp ${esc(e)}">${esc(e)}</span>`;
const diasTxt = d => `<span class="dias ${d < 0 ? 'atraso' : ''}">${d > 0 ? '+' : ''}${d}</span>`;
const barraAvance = v => `<span class="avance"><i style="width:${Math.max(0, Math.min(100, v || 0))}%"></i></span> ${pct(v)}`;
async function descargar(url) { const a = document.createElement('a'); a.href = url; a.download = ''; a.click(); }

// ---------- Administración de mecanismos de integración ----------
rutas.mecanismos = async function () {
  const t = parametro('t') || 'mecanismos';
  vista.innerHTML = `<h2 class="titulo-form">Administración de Mecanismos de Integración</h2>
    <form class="tarjeta filtros" id="filtros">
      <label>Tipo<select name="tipo" multiple>${TIPOS_MEC.map(x => `<option>${x}</option>`).join('')}</select></label>
      <label>Estado<select name="estado"><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="">Todos</option></select></label>
      <label>Fecha inicio<input type="date" name="desde"></label>
      <label>Fecha fin<input type="date" name="hasta"></label>
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form>
    ${pestanasPagina([['mecanismos', 'Mecanismos de Integración'], ['seguimiento', 'Seguimiento compromisos'], ['actas', 'Actas']], t, '#/mecanismos')}
    <div id="resultado"></div>`;
  const cargar = intentar(async () => {
    const f = valoresForm($('#filtros'));
    if (t === 'actas') {
      const lista = await api('/actas?' + qs({ desde: f.desde, hasta: f.hasta }));
      $('#resultado').innerHTML = `<div class="controles"><span class="espacio"></span>
          <button class="btn" id="expActas"><i class="ic ic-excel"></i> Exportar</button></div>
        <div class="tabla-wrap"><table><thead><tr><th>Tipo</th><th>Mecanismo</th><th>ID</th><th>Acta/Consecutivo</th><th>Fecha</th><th>Hora inicio</th>
        <th>Hora fin</th><th>Estado</th><th>Usuario</th><th>Lugar</th><th># Invitados</th><th># Asistentes</th><th>% Asistencia</th><th># Archivos</th></tr></thead><tbody>
        ${lista.map(a => `<tr class="click" onclick="location.hash='#/acta/${a.id}'"><td>${esc(a.tipo)}</td><td>${esc(a.mecanismo)}</td><td>${a.id}</td>
          <td><a href="#/acta/${a.id}">${esc(a.codigo)}</a></td><td>${esc(a.fecha)}</td><td>${hora12(a.hora_inicio)}</td><td>${hora12(a.hora_fin)}</td>
          <td>${esc(a.estado)}</td><td>${esc(a.autor_usuario)}</td><td>${esc(a.lugar)}</td><td class="num">${a.invitados}</td><td class="num">${a.asistentes}</td>
          <td class="num">${pct(a.asistencia)}</td><td class="num">${a.n_archivos}</td></tr>`).join('')}</tbody></table></div>
        ${lista.length ? '' : '<p class="vacio">No hay actas con estos criterios.</p>'}`;
      $('#expActas').onclick = intentar(async () => {
        const v = await modal('Exportar', `<table class="tblform"><tr><th>Formato</th><td><select name="formato"><option value="xlsx">XLSX</option>
          <option value="csv">CSV</option></select></td></tr></table>`, { aceptar: 'Exportar' });
        if (v) descargar('/api/actas-exportar?' + qs({ desde: f.desde, hasta: f.hasta, formato: v.formato }));
      });
      return;
    }
    const lista = await api('/mecanismos?' + qs({ tipo: f.tipo, estado: f.estado }));
    if (t === 'seguimiento') {
      const filas = lista.filter(m => m.estadisticas.actas);
      $('#resultado').innerHTML = `<div class="tabla-wrap"><table><thead><tr><th>Tipo</th><th>Nombre</th><th># actas</th><th># actividades</th>
        <th># actividades cerradas</th><th>Cumplimiento</th><th>Invitados</th><th>Asistentes</th><th>Asistencia</th></tr></thead><tbody>
        ${filas.map(m => { const s = m.estadisticas; return `<tr class="click" onclick="location.hash='#/mecanismo/${m.id}?t=seguimiento'">
          <td>${esc(m.tipo)}</td><td>${esc(m.nombre)}</td><td class="num">${s.actas}</td><td class="num">${s.actividades}</td><td class="num">${s.cerradas}</td>
          <td class="num">${pct(s.cumplimiento ?? 0)}</td><td class="num">${s.invitados}</td><td class="num">${s.asistentes}</td><td class="num">${pct(s.asistencia ?? 0)}</td></tr>`; }).join('')}
        </tbody></table></div>${filas.length ? '' : '<p class="vacio">Ningún mecanismo tiene actas todavía.</p>'}`;
      return;
    }
    const personas = (m, admin) => m.integrantes.filter(i => /Administrador/.test(i.privilegio) === admin)
      .map(i => `${esc(i.nombre)} (${esc(i.privilegio)})`).join(', ');
    $('#resultado').innerHTML = `<div class="controles">${esCalidad() ? `<label class="en-linea">Tipo <select id="tipoNuevo">${TIPOS_MEC.map(x => `<option>${x}</option>`).join('')}</select></label>
        <button class="btn primario" id="adicionar">Adicionar</button>` : ''}<span class="espacio"></span></div>
      <div class="tabla-wrap"><table><thead><tr><th>ID</th><th>Tipo</th><th>Nombre</th><th># Actas</th><th>Administradores</th><th>Otros</th><th>Activo</th></tr></thead><tbody>
      ${lista.map(m => `<tr class="click" onclick="location.hash='#/mecanismo/${m.id}'"><td>${m.id}</td><td>${esc(m.tipo)}</td><td><a href="#/mecanismo/${m.id}">${esc(m.nombre)}</a></td>
        <td class="num">${m.n_actas}</td><td>${personas(m, true) || '—'}</td><td>${personas(m, false) || '—'}</td><td>${m.activo ? 'Sí' : 'No'}</td></tr>`).join('')}
      </tbody></table></div>${lista.length ? '' : `<p class="vacio">No hay mecanismos con estos criterios.${esCalidad() ? '' : ' Aquí ves solo los de los que haces parte.'}</p>`}`;
    $('#adicionar')?.addEventListener('click', () => editarMecanismo({ tipo: $('#tipoNuevo').value, activo: 1, codificacion: 'Auto', patron: '%C', padding: 3,
      dias_recordatorio: 1, integrantes: [], ...Object.fromEntries(OPCIONES_MEC.map(([k]) => [k, 1])) }));
  });
  $('#filtros').addEventListener('submit', e => { e.preventDefault(); cargar(); });
  cargar();
};

// Formulario de configuración del mecanismo (datos, integrantes y opciones de las actas)
const editarMecanismo = intentar(async m => {
  const usuarios = cat.usuarios;
  const integ = Object.fromEntries((m.integrantes || []).map(i => [i.usuario_id, i]));
  const v = await modal(m.id ? 'Editar mecanismo' : `Adicionar ${m.tipo}`, `<div class="form">
    <label class="ancho">Nombre<input name="nombre" required value="${esc(m.nombre)}"></label>
    <label>Tipo<select name="tipo">${TIPOS_MEC.map(x => `<option ${x === m.tipo ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label>Coordinador<select name="coordinador_id">${opciones(usuarios, m.coordinador_id, '— Sin coordinador —')}</select></label>
    <label>Periodicidad<select name="periodicidad">${PERIODICIDADES.map(x => `<option ${x === m.periodicidad ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" name="activo" ${m.activo ? 'checked' : ''}> Activo</label>
    <label class="ancho">Objetivo<textarea name="objetivo" rows="3">${esc(m.objetivo)}</textarea></label>
    <label class="ancho">Miembros del comité<textarea name="miembros" rows="3">${esc(m.miembros)}</textarea></label>
    <label class="ancho">Funciones del comité<textarea name="funciones" rows="3">${esc(m.funciones)}</textarea></label></div>
    <h3>Integrantes</h3>
    <div class="tabla-wrap integrantes"><table><thead><tr><th>Integra</th><th>Nombre</th><th>Cargo</th><th>Calidad</th><th>Privilegio</th><th>Puede adicionar actas</th></tr></thead><tbody>
      ${usuarios.map(u => { const i = integ[u.id]; return `<tr><td><input type="checkbox" name="int_${u.id}" ${i ? 'checked' : ''}></td><td>${esc(u.nombre)}</td><td>${esc(u.cargo)}</td>
        <td><select name="cal_${u.id}">${['Principal', 'Suplente'].map(x => `<option ${i?.calidad === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><select name="priv_${u.id}">${['Miembro', 'Administrador - Miembro', 'Administrador'].map(x => `<option ${i?.privilegio === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><input type="checkbox" name="act_${u.id}" ${i?.adiciona_actas ? 'checked' : ''}></td></tr>`; }).join('')}</tbody></table></div>
    <h3>Actas</h3>
    <div class="opciones">${OPCIONES_MEC.map(([k, n]) => `<label class="check"><input type="checkbox" name="${k}" ${m[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>
    <div class="form">
      <label>Codificación<select name="codificacion">${['Auto', 'Manual'].map(x => `<option ${x === m.codificacion ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Patrón <small>(%C consecutivo, %M mes, %Y año)</small><input name="patron" value="${esc(m.patron)}"></label>
      <label>Padding<input name="padding" type="number" min="0" max="6" value="${esc(m.padding)}"></label>
      <label>Días recordatorio<input name="dias_recordatorio" type="number" min="0" value="${esc(m.dias_recordatorio)}"></label></div>`);
  if (!v) return;
  const cuerpo = { ...v, activo: !!v.activo, ...Object.fromEntries(OPCIONES_MEC.map(([k]) => [k, !!v[k]])),
    integrantes: usuarios.filter(u => v['int_' + u.id]).map(u => ({ usuario_id: u.id, calidad: v['cal_' + u.id], privilegio: v['priv_' + u.id], adiciona_actas: !!v['act_' + u.id] })) };
  const res = await api('/mecanismos' + (m.id ? '/' + m.id : ''), { method: m.id ? 'PUT' : 'POST', body: cuerpo });
  aviso('Guardado');
  if (m.id) enrutar(); else location.hash = '#/mecanismo/' + res.id;
  document.dispatchEvent(new Event('sgi:plan'));
});

// ---------- Ficha del mecanismo ----------
rutas.mecanismo = async function (id) {
  const t = parametro('t') || 'general', anio = parametro('anio') || '';
  const m = await api(`/mecanismos/${id}?` + qs({ anio }));
  const base = `#/mecanismo/${id}`;
  let cuerpo = '';
  if (t === 'general') {
    const principales = m.integrantes.filter(i => i.calidad === 'Principal'), suplentes = m.integrantes.filter(i => i.calidad === 'Suplente');
    const filas = Math.max(principales.length, suplentes.length, 1);
    cuerpo = `<div class="ficha-mec"><h3>Integrantes</h3>
      <table class="tabla-ficha"><thead><tr><th>Principal</th><th>Suplente</th></tr></thead><tbody>
      ${Array.from({ length: filas }, (_, i) => `<tr><td>${principales[i] ? `${esc(principales[i].nombre)} <span class="gris">(${esc(principales[i].cargo || '')})</span>` : '—'}</td>
        <td>${suplentes[i] ? `${esc(suplentes[i].nombre)} <span class="gris">(${esc(suplentes[i].cargo || '')})</span>` : '—'}</td></tr>`).join('')}</tbody></table>
      <dl class="datos"><dt>Coordinador</dt><dd>${esc(m.coordinador ? `${m.coordinador} (${m.coordinador_cargo || ''})` : '—')}</dd>
        <dt>Periodicidad</dt><dd>${esc(m.periodicidad || '—')}</dd>
        <dt>Objetivo</dt><dd class="pre">${esc(m.objetivo || '—')}</dd>
        <dt>Miembros del comité</dt><dd class="pre">${esc(m.miembros || '—')}</dd>
        ${m.funciones ? `<dt>Funciones del comité</dt><dd class="pre">${esc(m.funciones)}</dd>` : ''}</dl></div>`;
  } else if (t === 'actas') {
    cuerpo = `<div class="controles"><label class="en-linea">Año <select id="anioActas"><option value="">Todos</option>
        ${m.anios.map(a => `<option ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      ${m.permisos.actas && m.activo ? '<button class="btn primario" id="nuevaActa">Adicionar acta</button>' : ''}<span class="espacio"></span>
      <button class="btn" id="expActas"><i class="ic ic-excel"></i> Exportar</button></div>
      <div class="tabla-wrap"><table><thead><tr><th>Actas</th><th>Fecha</th><th>Estado</th>${m.mostrar_tipo ? '<th>Tipo de reunión</th>' : ''}
        <th>Compromisos</th><th>Asistencia</th><th>Cumplimiento compromisos</th></tr></thead><tbody>
      ${m.actas.map(a => `<tr class="click" onclick="location.hash='#/acta/${a.id}'"><td><a href="#/acta/${a.id}">Acta / ${esc(a.codigo)}</a> <span class="gris">/ ${esc(a.autor_usuario || '')}</span></td>
        <td>${esc(a.fecha)}</td><td>${esc(a.estado)}</td>${m.mostrar_tipo ? `<td>${esc(a.tipo_reunion)}</td>` : ''}<td class="num">${a.compromisos}</td>
        <td class="num">${pct(a.asistencia)}</td><td class="num">${a.compromisos ? pct(a.cumplimiento) : ''}</td></tr>`).join('')}</tbody></table></div>
      ${m.actas.length ? '' : '<p class="vacio">Este mecanismo aún no tiene actas.</p>'}`;
  } else if (t === 'seguimiento') {
    cuerpo = `<form class="tarjeta filtros" id="filtroComp">
        <label>Estado<select name="estado" multiple>${['Planeación', 'Ejecución', 'Terminada'].map(x => `<option>${x}</option>`).join('')}</select></label>
        <label>Fecha fin<select name="op"><option value="">—</option><option value=">">Mayor</option><option value="<">Menor</option><option value="entre">Entre</option></select></label>
        <label>Fecha 1<input type="date" name="fecha1"></label><label>Fecha 2<input type="date" name="fecha2"></label>
        <label>Acta<select name="acta"><option value="">Todas</option>${m.actas.map(a => `<option value="${a.id}">${esc(a.codigo)}</option>`).join('')}</select></label>
        <div class="acciones"><button class="btn primario">Buscar</button></div></form>
      <div class="kpis"><div class="kpi"><b>${pct(m.estadisticas.asistencia)}</b><span>Indicador de asistencia</span></div>
        <div class="kpi"><b>${pct(m.estadisticas.cumplimiento)}</b><span>Cumplimiento de compromisos</span></div></div>
      <div id="compromisos"></div>`;
  } else {
    const s = m.estadisticas;
    const barras = (campo) => m.sesiones.length ? `<div class="barras">${m.sesiones.map(x => `<div><span>${esc(x.codigo)} <small class="gris">${esc(x.fecha)}</small></span>
      <i style="width:${Math.min(100, x[campo] || 0)}%"></i><b>${pct(x[campo])}</b></div>`).join('')}</div>` : '<p class="vacio">Sin sesiones.</p>';
    cuerpo = `<div class="kpis"><div class="kpi"><b>${s.actas}</b><span>Sesiones</span></div>
        <div class="kpi"><b>${pct(s.asistencia)}</b><span>Asistencia (${s.asistentes} de ${s.invitados})</span></div>
        <div class="kpi"><b>${pct(s.cumplimiento)}</b><span>Cumplimiento compromisos (${s.cerradas} de ${s.actividades})</span></div>
        <div class="kpi"><b>${s.cerradas ? pct(s.a_tiempo / s.cerradas * 100) : '—'}</b><span>Cierre de compromisos a tiempo</span></div></div>
      <div class="tarjeta"><h3>Asistencia por sesión</h3>${barras('asistencia')}</div>
      <div class="tarjeta"><h3>Cumplimiento de compromisos por sesión</h3>${barras('cumplimiento')}</div>`;
  }
  vista.innerHTML = `<h2 class="titulo-form">${esc(m.nombre)} <span class="gris">· ${esc(m.tipo)}${m.activo ? '' : ' (inactivo)'}</span></h2>
    <div class="controles"><button class="btn" onclick="location.hash='#/mecanismos'">Volver</button>
      ${m.permisos.administra ? '<button class="btn" id="editarMec">Editar</button>' : ''}
      <button class="btn" onclick="window.print()"><i class="ic ic-imprimir"></i> Exportar a PDF</button><span class="espacio"></span></div>
    ${pestanasPagina([['general', 'Información General'], ['actas', 'Actas'], ['seguimiento', 'Seguimiento'], ['estadisticas', 'Estadísticas']], t, base)}
    ${cuerpo}`;
  $('#editarMec')?.addEventListener('click', () => editarMecanismo(m));
  $('#nuevaActa')?.addEventListener('click', () => editarActa(null, m));
  $('#anioActas')?.addEventListener('change', e => location.hash = `${base}?t=actas&anio=${e.target.value}`);
  $('#expActas')?.addEventListener('click', () => descargar('/api/actas-exportar?' + qs({ mecanismo: m.id, formato: 'xlsx' })));
  if (t === 'seguimiento') {
    const cargar = intentar(async () => {
      const lista = await api('/compromisos?' + qs({ ...valoresForm($('#filtroComp')), mecanismo: m.id }));
      $('#compromisos').innerHTML = tablaCompromisos(lista, true);
    });
    $('#filtroComp').addEventListener('submit', e => { e.preventDefault(); cargar(); });
    cargar();
  }
};

function tablaCompromisos(lista, conActa) {
  if (!lista.length) return '<p class="vacio">La búsqueda no produjo resultados.</p>';
  return `<div class="tabla-wrap"><table><thead><tr><th>Actividad</th>${conActa ? '<th>Acta</th>' : ''}<th>Responsables</th><th>Fin</th><th>Estado</th>
    <th>Avance</th><th>Días</th></tr></thead><tbody>
    ${lista.map(c => `<tr class="click" onclick="location.hash='#/compromiso/${c.id}'"><td><a href="#/compromiso/${c.id}">${c.numero}. ${esc(c.nombre)}</a></td>
      ${conActa ? `<td>${esc(c.acta_codigo)}</td>` : ''}<td>${esc(c.responsables || '—')}</td><td class="${c.vencido ? 'rojo' : ''}">${esc(c.fecha_fin)}</td>
      <td>${estadoComp(c.estado)}</td><td>${barraAvance(c.avance)}</td><td>${diasTxt(c.dias)}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- Acta ----------
const editarActa = intentar(async (acta, m) => {
  const mec = acta ? acta.mecanismo : m;
  const manual = (m?.codificacion || '') === 'Manual';
  const asist = acta ? acta.asistentes : (m.integrantes || []).map(i => ({ usuario_id: i.usuario_id, nombre: i.nombre, cargo: i.cargo, asiste: 1 }));
  const porUsuario = Object.fromEntries(asist.filter(a => a.usuario_id).map(a => [a.usuario_id, a]));
  const externos = asist.filter(a => !a.usuario_id).map(a => [a.nombre, a.cargo, a.area].filter(Boolean).join(' - ')).join('\n');
  const v = await modal(acta ? `Editar acta ${acta.codigo}` : `Adicionar acta · ${m.nombre}`, `<div class="form">
    ${manual && !acta ? '<label class="ancho">Código del acta<input name="codigo" required></label>' : ''}
    <label>Fecha<input type="date" name="fecha" required value="${esc(acta?.fecha || new Date().toISOString().slice(0, 10))}"></label>
    ${mec.mostrar_tipo ? `<label>Tipo de reunión<select name="tipo_reunion">${['Ordinaria', 'Extraordinaria'].map(x => `<option ${x === acta?.tipo_reunion ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
    <label>Hora inicio<input type="time" name="hora_inicio" value="${esc(acta?.hora_inicio)}"></label>
    <label>Hora fin<input type="time" name="hora_fin" value="${esc(acta?.hora_fin)}"></label>
    ${mec.indicar_lugar ? `<label class="ancho">Lugar<input name="lugar" value="${esc(acta?.lugar)}"></label>` : ''}
    <label class="ancho">Agenda de la reunión<textarea name="agenda" rows="5" placeholder="1. Verificación de quórum&#10;2. Seguimiento de compromisos anteriores&#10;…">${esc(acta?.agenda)}</textarea></label></div>
    ${mec.indicar_asistentes ? `<h3>Asistentes</h3><div class="tabla-wrap integrantes"><table><thead><tr><th>Convocado</th><th>Nombre</th><th>Cargo</th>
      ${mec.control_asistencia ? '<th>Asiste</th>' : ''}</tr></thead><tbody>
      ${cat.usuarios.map(u => { const a = porUsuario[u.id]; return `<tr><td><input type="checkbox" name="conv_${u.id}" ${a ? 'checked' : ''}></td><td>${esc(u.nombre)}</td>
        <td>${esc(u.cargo)}</td>${mec.control_asistencia ? `<td><input type="checkbox" name="asis_${u.id}" ${!a || a.asiste ? 'checked' : ''}></td>` : ''}</tr>`; }).join('')}</tbody></table></div>
      <label>Invitados externos <small>(uno por línea: Nombre - Cargo - Empresa)</small><textarea name="externos" rows="2">${esc(externos)}</textarea></label>` : ''}`);
  if (!v) return;
  const asistentes = mec.indicar_asistentes ? [
    ...cat.usuarios.filter(u => v['conv_' + u.id]).map(u => ({ usuario_id: u.id, asiste: mec.control_asistencia ? !!v['asis_' + u.id] : true })),
    ...String(v.externos || '').split('\n').map(l => l.split(' - ').map(s => s.trim())).filter(p => p[0]).map(([nombre, cargo, area]) => ({ nombre, cargo, area, asiste: true })),
  ] : undefined;
  const cuerpo = { ...v, asistentes, desarrollo: acta?.desarrollo };
  if (acta) { await api('/actas/' + acta.id, { method: 'PUT', body: cuerpo }); aviso('Acta guardada'); enrutar(); }
  else { const res = await api(`/mecanismos/${m.id}/actas`, { method: 'POST', body: cuerpo }); aviso('Acta ' + res.codigo + ' creada'); location.hash = '#/acta/' + res.id; }
});

rutas.acta = async function (id) {
  const t = parametro('t') || 'planeacion';
  const a = await api('/actas/' + id);
  const mec = a.mecanismo, p = a.permisos, base = `#/acta/${id}`;
  const archivos = parte => {
    const l = a.archivos.filter(f => f.parte === parte);
    return `<div class="archivos">${l.length ? l.map(f => `<div class="archivo"><a href="/api/actas/${a.id}/archivos/${f.id}" download>📄 ${esc(f.nombre)}</a>
      <span class="gris">${esc(f.usuario || '')} — ${(f.tamano / 1024).toFixed(2)} KB · ${esc(String(f.fecha).slice(0, 16))}</span>
      ${p.editar ? `<button class="btn chico peligro" data-quitar="${f.id}">Quitar</button>` : ''}</div>`).join('') : '<p class="gris">Sin archivos adjuntos.</p>'}
      ${p.editar ? `<label class="btn chico subir">Adjuntar archivo<input type="file" data-parte="${parte}" hidden></label>` : ''}</div>`;
  };
  let cuerpo;
  if (t === 'planeacion') {
    cuerpo = `<dl class="datos acta-datos"><dt>Fecha y hora</dt><dd>${fechaLarga(a.fecha)}<br>${hora12(a.hora_inicio)}${a.hora_fin ? ' – ' + hora12(a.hora_fin) : ''}</dd>
      ${mec.indicar_lugar ? `<dt>Lugar</dt><dd>${esc(a.lugar || '—')}</dd>` : ''}
      ${mec.mostrar_tipo ? `<dt>Tipo de reunión</dt><dd>${esc(a.tipo_reunion)}</dd>` : ''}</dl>
      ${mec.indicar_asistentes ? `<h3>Asistentes</h3><div class="tabla-wrap"><table class="arbol"><thead><tr><th>Nombre</th><th>Cargo</th><th>Área/Empresa</th>
        ${mec.control_asistencia ? '<th>Asiste</th>' : ''}</tr></thead><tbody>
        ${a.asistentes.map(s => `<tr><td>${esc(s.nombre)}</td><td>${esc(s.cargo || '')}</td><td>${esc(s.area || '')}</td>
          ${mec.control_asistencia ? `<td>${s.asiste ? '✔' : '✘'}</td>` : ''}</tr>`).join('') || '<tr><td colspan="4" class="gris">Sin asistentes</td></tr>'}</tbody></table></div>
        ${mec.control_asistencia ? `<p class="gris">Asistencia: ${pct(a.asistencia)}</p>` : ''}` : ''}
      <h3>Agenda de la reunión</h3><div class="pre caja">${esc(a.agenda || '—')}</div>
      <h3>Archivos adjuntos</h3>${archivos('Planeación')}`;
  } else if (t === 'desarrollo') {
    cuerpo = `<h3>Contenido</h3>${p.editar ? `<textarea id="desarrollo" rows="14" class="ancho-total" placeholder="Desarrollo de la reunión, punto por punto de la agenda…">${esc(a.desarrollo)}</textarea>
      <div class="acciones"><button class="btn primario" id="guardarDesarrollo">Guardar desarrollo</button></div>`
      : `<div class="pre caja">${esc(a.desarrollo || 'Sin contenido registrado.')}</div>`}
      <h3>Archivos adjuntos</h3>${archivos('Desarrollo')}`;
  } else {
    const lista = a.compromisos_lista;
    cuerpo = `${p.compromisos && mec.tiene_compromisos ? '<div class="controles"><button class="btn primario" id="nuevoComp">Adicionar compromiso</button><span class="espacio"></span></div>' : ''}
      ${lista.length ? `<div class="tabla-wrap"><table class="arbol"><thead><tr><th>Actividad</th><th>Fin</th><th>Seguimiento</th><th></th></tr></thead><tbody>
        ${lista.map(c => `<tr class="click" onclick="location.hash='#/compromiso/${c.id}'"><td><a href="#/compromiso/${c.id}">${c.numero}. ${esc(c.nombre)}</a>
          ${c.arrastrado ? `<span class="chip" title="Compromiso abierto de un acta anterior">${esc(c.acta_codigo)}</span>` : ''}
          <br><span class="gris">• ${esc(c.responsables || '—')}</span></td><td class="${c.vencido ? 'rojo' : ''}">${esc(c.fecha_fin)}</td>
          <td>${barraAvance(c.avance)}</td><td>${diasTxt(c.dias)}</td></tr>`).join('')}</tbody></table></div>
        <p><b>${lista.length} Actividades</b> · Avance ponderado: <b>${pct(a.avance_ponderado)}</b></p>` : '<p class="vacio">El acta no tiene compromisos.</p>'}`;
  }
  vista.innerHTML = `<h2 class="titulo-form">${esc(mec.tipo)} - ${esc(mec.nombre)}<br><small>Acta / ${esc(a.codigo)}</small>
      <span class="est-acta ${esc(a.estado)}">${esc(a.estado)}</span></h2>
    <div class="controles"><button class="btn" onclick="location.hash='#/mecanismo/${mec.id}?t=actas'">Volver</button>
      ${p.actas ? '<button class="btn" id="adicionarActa">Adicionar Acta</button>' : ''}
      ${p.editar ? '<button class="btn" id="editarActa">Editar Acta</button>' : ''}
      ${p.administra && a.estado === 'Abierta' ? '<button class="btn" data-estado="cerrar">Cerrar</button><button class="btn peligro" data-estado="anular">Anular</button>' : ''}
      ${p.administra && a.estado !== 'Abierta' ? '<button class="btn" data-estado="reabrir">Reabrir</button>' : ''}
      <button class="btn icono-solo" title="Exportar a PDF / imprimir" onclick="window.print()"><i class="ic ic-imprimir"></i></button>
      <span class="espacio"></span>
      <select id="otraActa" aria-label="Ir a otra acta">${a.otras_actas.map(o => `<option value="${o.id}" ${o.id === a.id ? 'selected' : ''}>${esc(o.codigo)} / ${esc(o.fecha)}</option>`).join('')}</select></div>
    ${pestanasPagina([['planeacion', 'Planeación'], ['desarrollo', 'Desarrollo'], ...(mec.tiene_compromisos ? [['compromisos', 'Compromisos']] : [])], t, base)}
    <div class="tarjeta">${cuerpo}</div>`;
  $('#otraActa').onchange = e => location.hash = '#/acta/' + e.target.value;
  $('#editarActa')?.addEventListener('click', () => editarActa(a));
  $('#adicionarActa')?.addEventListener('click', intentar(async () => editarActa(null, await api('/mecanismos/' + mec.id))));
  $('#nuevoComp')?.addEventListener('click', () => editarCompromiso(null, a));
  $('#guardarDesarrollo')?.addEventListener('click', intentar(async () => {
    await api('/actas/' + a.id, { method: 'PUT', body: { ...a, desarrollo: $('#desarrollo').value, asistentes: undefined } }); aviso('Desarrollo guardado');
  }));
  vista.querySelectorAll('[data-estado]').forEach(b => b.onclick = intentar(async () => {
    const accion = b.dataset.estado, textos = { cerrar: 'Al cerrarla ya no se podrá editar.', anular: 'El acta anulada no cuenta en las estadísticas.', reabrir: 'Se podrá volver a editar.' };
    if (!await modal(`${accion[0].toUpperCase() + accion.slice(1)} acta`, `<p>${textos[accion]} ¿Continuar?</p>`, { aceptar: 'Sí', peligro: accion === 'anular' })) return;
    await api(`/actas/${a.id}/estado`, { method: 'POST', body: { accion } });
    aviso({ cerrar: 'Acta cerrada', anular: 'Acta anulada', reabrir: 'Acta reabierta' }[accion]); enrutar();
  }));
  vista.querySelectorAll('input[type=file][data-parte]').forEach(inp => inp.onchange = intentar(async () => {
    if (!inp.files[0]) return;
    const fd = new FormData(); fd.append('archivo', inp.files[0]); fd.append('parte', inp.dataset.parte);
    await api(`/actas/${a.id}/archivos`, { method: 'POST', body: fd }); aviso('Archivo adjuntado'); enrutar();
  }));
  vista.querySelectorAll('[data-quitar]').forEach(b => b.onclick = intentar(async () => {
    if (!await modal('Quitar archivo', '<p>¿Quitar este archivo del acta?</p>', { aceptar: 'Quitar', peligro: true })) return;
    await api(`/actas/${a.id}/archivos/${b.dataset.quitar}`, { method: 'DELETE' }); enrutar();
  }));
};

// ---------- Compromisos ----------
const editarCompromiso = intentar(async (c, acta) => {
  const v = await modal(c ? 'Editar compromiso' : 'Adicionar compromiso', `<div class="form">
    <label class="ancho">Actividad<input name="nombre" required value="${esc(c?.nombre)}"></label>
    <label class="ancho">Descripción<textarea name="descripcion" rows="3">${esc(c?.descripcion)}</textarea></label>
    <label>Fecha fin<input type="date" name="fecha_fin" required value="${esc(c?.fecha_fin)}" ${c?.n_seguimientos ? 'disabled title="Ya tiene seguimientos: usa Reprogramar"' : ''}></label>
    <label>Responsables<select name="responsables" multiple required>${cat.usuarios.map(u => `<option value="${u.id}" ${c?.responsables_ids.includes(u.id) ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select></label></div>`);
  if (!v) return;
  if (c) { await api('/compromisos/' + c.id, { method: 'PUT', body: v }); aviso('Compromiso guardado'); enrutar(); }
  else { await api(`/actas/${acta.id}/compromisos`, { method: 'POST', body: v }); aviso('Compromiso adicionado'); enrutar(); }
  document.dispatchEvent(new Event('sgi:plan'));
});

rutas.compromiso = async function (id) {
  const t = parametro('t') || 'general';
  const c = await api('/compromisos/' + id);
  const base = `#/compromiso/${id}`;
  const mensaje = c.estado === 'Terminada' ? 'La actividad ya fue registrada como terminada'
    : c.estado === 'Ejecución' ? 'La actividad está en ejecución. Debe registrar al menos un seguimiento del 100% para registrar la terminación de la actividad'
    : 'La actividad aún no tiene seguimientos.';
  const cuerpo = t === 'general' ? `<p class="aviso-estado ${esc(c.estado)}">${mensaje}</p>
      <h3>${c.numero}. ${esc(c.nombre)}</h3><p class="pre">${esc(c.descripcion || '')}</p>
      <dl class="datos"><dt>Fecha fin planeada</dt><dd>${esc(c.fecha_fin)}${c.fecha_fin_inicial && c.fecha_fin_inicial !== c.fecha_fin ? ` <span class="gris">(inicial ${esc(c.fecha_fin_inicial)})</span>` : ''}</dd>
        <dt>Fecha fin real</dt><dd>${esc(c.fecha_terminacion || '—')}</dd>
        <dt>Avance real</dt><dd>${barraAvance(c.avance)} (${c.dias > 0 ? '+' : ''}${c.dias})</dd>
        <dt>Acta</dt><dd><a href="#/acta/${c.acta_id}?t=compromisos">${esc(c.acta_codigo)}</a> <span class="gris">(${esc(c.acta_fecha)}) · ${esc(c.mecanismo)}</span></dd>
        <dt>Último seguimiento</dt><dd>${c.ultimo_seguimiento ? `${fechaLarga(c.ultimo_seguimiento.fecha)} / ${esc(c.ultimo_seguimiento.usuario || '')} (${esc(c.ultimo_seguimiento.cargo || '')})
          <div class="pre">${esc(c.ultimo_seguimiento.descripcion)}</div>` : '—'}</dd>
        <dt>Responsable</dt><dd>${esc(c.responsables || '—')}</dd></dl>
      ${c.reprogramaciones.length ? `<h3>Reprogramaciones</h3><table class="arbol"><thead><tr><th>Registrada</th><th>De</th><th>A</th><th>Causa</th><th>Por</th></tr></thead><tbody>
        ${c.reprogramaciones.map(r => `<tr><td>${esc(String(r.registrado).slice(0, 10))}</td><td>${esc(r.fecha_anterior)}</td><td>${esc(r.fecha_nueva)}</td>
          <td>${esc(r.causa)}</td><td>${esc(r.usuario || '')}</td></tr>`).join('')}</tbody></table>` : ''}`
    : `${c.seguimientos.length ? c.seguimientos.map(s => `<div class="seguimiento"><b>Avance ${pct(s.avance)}</b> · ${fechaLarga(s.fecha)} / ${esc(s.usuario || '')} - (${esc(s.cargo || '')})
        <div class="pre">${esc(s.descripcion)}</div>${s.archivo_nombre ? `<a href="/api/compromisos/${c.id}/seguimientos/${s.id}/archivo" download>📎 ${esc(s.archivo_nombre)}</a>` : ''}</div>`).join('')
      : '<p class="vacio">Sin seguimientos.</p>'}`;
  vista.innerHTML = `<h2 class="titulo-form">${esc(c.mecanismo)}<br><small>${esc(c.acta_codigo)} (${esc(c.acta_fecha)})</small> ${estadoComp(c.estado)}</h2>
    <div class="controles"><button class="btn" onclick="location.hash='#/acta/${c.acta_id}?t=compromisos'">Volver al acta</button>
      ${c.permisos.seguimiento ? '<button class="btn primario" id="seguir">Adicionar seguimiento</button>' : ''}
      ${c.permisos.reprogramar ? '<button class="btn" id="reprogramar">Reprogramar</button>' : ''}
      ${c.permisos.editar ? '<button class="btn" id="editarComp">Editar</button>' : ''}
      ${c.permisos.eliminar ? '<button class="btn peligro" id="eliminarComp">Eliminar</button>' : ''}
      <span class="espacio"></span></div>
    ${pestanasPagina([['general', 'Información general'], ['seguimientos', `Seguimientos (${c.seguimientos.length})`]], t, base)}
    <div class="tarjeta">${cuerpo}</div>`;
  $('#seguir')?.addEventListener('click', intentar(async () => {
    const v = await modal('Adicionar seguimiento', `<div class="form">
      <label>Porcentaje de avance<input name="avance" type="number" min="0" max="100" step="any" required value="${esc(c.avance)}"></label>
      <label>Fecha<input name="fecha" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="ancho">Descripción<textarea name="descripcion" rows="4" required></textarea></label>
      <label class="ancho">Archivo (opcional)<input name="archivo" type="file"></label></div>
      <p class="gris">Con 100% el compromiso queda registrado como terminado.</p>`);
    if (!v) return;
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) if (!(val instanceof File) || val.size) fd.append(k, val);
    const res = await api(`/compromisos/${c.id}/seguimientos`, { method: 'POST', body: fd });
    aviso(res.terminado ? 'Compromiso terminado' : 'Seguimiento registrado'); enrutar(); document.dispatchEvent(new Event('sgi:plan'));
  }));
  $('#editarComp')?.addEventListener('click', () => editarCompromiso(c));
  $('#eliminarComp')?.addEventListener('click', intentar(async () => {
    if (!await modal('Eliminar compromiso', '<p>¿Eliminar este compromiso del acta?</p>', { aceptar: 'Eliminar', peligro: true })) return;
    await api('/compromisos/' + c.id, { method: 'DELETE' }); aviso('Compromiso eliminado'); location.hash = `#/acta/${c.acta_id}?t=compromisos`;
  }));
  $('#reprogramar')?.addEventListener('click', intentar(async () => {
    const v = await modal('Reprogramar', `<div class="form"><label>Nueva fecha de terminación planeada<input name="fecha_nueva" type="date" required value="${esc(c.fecha_fin)}"></label>
      <label class="ancho">Causa<textarea name="causa" rows="3" required></textarea></label></div>`, { aceptar: 'Reprogramar' });
    if (!v) return;
    await api(`/compromisos/${c.id}/reprogramar`, { method: 'POST', body: v }); aviso('Compromiso reprogramado'); enrutar();
  }));
};
