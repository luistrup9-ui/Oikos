// SGI — administración de usuarios e importación de datos, y cambio de clave propia
const ROL_NOMBRE = ROLES; // definidos en app.js

// ---------- Mi clave ----------
async function pedirCambioClave(obligatorio = false) {
  const dlg = $('#modal'), f = $('#modalForm');
  f.innerHTML = `<h3>${obligatorio ? 'Cambia tu clave para continuar' : 'Cambiar mi clave'}</h3>
    ${obligatorio ? '<p class="sub" style="margin:0">Tu clave es temporal o de prueba. Elige una propia.</p>' : ''}
    <label>Clave actual<input type="password" name="actual" autocomplete="current-password" required></label>
    <label>Clave nueva <small>(mínimo 8, con letras y números)</small><input type="password" name="nueva" autocomplete="new-password" required minlength="8"></label>
    <label>Repite la clave nueva<input type="password" name="repetir" autocomplete="new-password" required></label>
    <p class="error" id="errClave"></p>
    <div class="acciones" style="justify-content:flex-end">
      ${obligatorio ? '' : '<button class="btn" value="cancelar" formnovalidate>Cancelar</button>'}
      <button class="btn primario" value="ok">Guardar clave</button></div>`;
  if (obligatorio) dlg.addEventListener('cancel', e => e.preventDefault(), { once: true });
  const enviar = async ev => {
    if (ev.submitter?.value !== 'ok') return;
    ev.preventDefault();
    const v = valoresForm(f);
    if (v.nueva !== v.repetir) { $('#errClave').textContent = 'Las claves nuevas no coinciden'; return; }
    try {
      await api('/yo/clave', { method: 'POST', body: { actual: v.actual, nueva: v.nueva } });
      f.removeEventListener('submit', enviar); yo.debe_cambiar = 0; dlg.close('ok'); aviso('Clave actualizada');
    } catch (e) { $('#errClave').textContent = e.message; }
  };
  f.addEventListener('submit', enviar);
  dlg.showModal();
}
// El cambio de clave vive en la página Personal (botón "Cambiar mi clave"); aquí solo se define la función.

// ---------- Administración ----------
rutas.admin = async function () {
  if (!esCalidad()) { vista.innerHTML = '<p class="error">No tienes permiso para esta sección.</p>'; return; }
  const esAdmin = yo.rol === 'admin';
  const pestana = new URLSearchParams(location.hash.split('?')[1] || '').get('v') || (esAdmin ? 'usuarios' : 'importar');
  const tabs = [...(esAdmin ? [['usuarios', 'Usuarios'], ['cargos', 'Cargos'], ['procesos', 'Procesos']] : []), ['importar', 'Importar datos'], ...(esAdmin ? [['respaldos', 'Respaldos']] : [])];
  vista.innerHTML = `<div class="encabezado"><h2>Administración</h2></div>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="${k === pestana ? 'activo' : ''}" onclick="location.hash='#/admin?v=${k}'">${n}</button>`).join('')}</div>
    <div id="cuerpo"></div>`;
  if (pestana === 'usuarios' && esAdmin) await pestanaUsuarios();
  else if (pestana === 'procesos' && esAdmin) await pestanaProcesos();
  else if (pestana === 'cargos' && esAdmin) await pestanaCargos();
  else if (pestana === 'respaldos' && esAdmin) await pestanaRespaldos();
  else await pestanaImportar();
};

const mostrarClave = (titulo, quien, clave) => modal(titulo, `<p>Entrégale esta clave temporal a <b>${esc(quien)}</b>. Se pide cambiarla al primer ingreso y no se vuelve a mostrar.</p>
  <input readonly value="${esc(clave)}" class="mono" style="font-size:18px" onfocus="this.select()">`, { aceptar: 'Listo' });

async function pestanaUsuarios() {
  // Si el servidor aún no tiene cargos (no se reinició tras actualizar), la pestaña sigue funcionando y lo avisa
  const [lista, cargos] = await Promise.all([api('/usuarios'), api('/cargos').catch(() => { aviso('El servidor no tiene el módulo de cargos: reinícialo (npm start) tras actualizar', true); return []; })]);
  // Líder: lista de casillas; cada proceso despliega sus subprocesos y se marcan uno por uno. Los demás roles: un proceso de referencia (opcional).
  const CATS = ['Estratégico', 'Misional', 'Apoyo'];
  const hijosDe = id => cat.procesos.filter(h => h.padre_id === id);
  const casilla = (p, marcados, clase) => `<label class="${clase}"><input type="checkbox" name="procesos" value="${p.id}" ${marcados.includes(p.id) ? 'checked' : ''}> ${esc(p.nombre)}</label>`;
  const listaProcesos = (marcados = []) => `<div class="lista-procesos"><input type="hidden" name="procesos" value="">${CATS.map(c => `<p class="lp-cat">${c}</p>${cat.procesos.filter(p => !p.padre_id && p.categoria === c).map(p => {
      const hs = hijosDe(p.id), abierto = hs.some(h => marcados.includes(h.id));
      return `<div class="lp-proc">${hs.length ? `<button type="button" class="lp-flecha" aria-expanded="${abierto}" title="Ver subprocesos">▸</button>` : '<span class="lp-flecha vacia"></span>'}
        ${casilla(p, marcados, 'lp-nombre')}${hs.length ? `<small class="gris">${hs.length} subproceso${hs.length > 1 ? 's' : ''}</small>` : ''}</div>
        ${hs.length ? `<div class="lp-subs" ${abierto ? '' : 'hidden'}>${hs.map(h => casilla(h, marcados, 'lp-sub')).join('')}</div>` : ''}`; }).join('')}`).join('')}</div>`;
  // Cargos agrupados por área; quien tenía un cargo escrito a mano (anterior a la lista) lo conserva hasta que se le elija uno
  const selectorCargo = u => `<option value="">${!u.cargo_id && u.cargo ? `— ${esc(u.cargo)} (escrito a mano) —` : '— Sin cargo —'}</option>${[...new Set(cargos.map(c => c.area))].map(a => `<optgroup label="${esc(a)}">${cargos.filter(c => c.area === a && (c.activo || c.id === u.cargo_id))
    .map(c => `<option value="${c.id}" ${c.id === u.cargo_id ? 'selected' : ''}>${esc(c.nombre)} · ${c.codigo}</option>`).join('')}</optgroup>`).join('')}`;
  const campos = (u = {}) => `<div class="form">
    <label class="ancho">Correo corporativo <small>(con él ingresa a OIKOS)</small><input name="correo" type="email" ${u.id && !u.correo ? '' : 'required'} value="${esc(u.correo)}" placeholder="nombre@empresa.com" autocomplete="off"></label>
    <label>Nombre completo<input name="nombre" required value="${esc(u.nombre)}"></label>
    <label>Cargo<select name="cargo_id">${selectorCargo(u)}</select></label>
    <label>Rol<select name="rol">${Object.entries(ROL_NOMBRE).map(([k, n]) => `<option value="${k}" ${k === (u.rol || 'consulta') ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label data-si-no-lider>Proceso <small>(opcional)</small><select name="proceso_id">${opciones(cat.procesos.filter(p => !p.padre_id), u.proceso_id, '— Ninguno —')}</select></label>
    <div class="ancho" data-si-lider><b>Procesos que lidera</b> <small class="gris">(marca los procesos y despliega ▸ para elegir sus subprocesos)</small>${listaProcesos(u.procesos)}</div></div>
    <p class="sub" style="margin:0">Administrador: todo, incluidos usuarios y procesos · Gestor de Calidad: todos los módulos · Líder: ve el mapa y los documentos vigentes de todos, y gestiona los procesos que tenga marcados · Colaborador: consulta, sin gestionar.</p>
    ${u.id ? `<p class="sub" style="margin:0">Usuario interno: <span class="mono">${esc(u.usuario)}</span> (también sirve para ingresar).</p>` : ''}`;
  // Conecta la lista del diálogo recién abierto: mostrar según el rol, desplegar subprocesos y marcar/desmarcar un proceso con sus subprocesos
  const conectarLista = () => {
    const f = $('#modalForm'), rol = f.querySelector('[name=rol]');
    const ver = () => { const l = rol.value === 'lider_proceso'; f.querySelector('[data-si-lider]').hidden = !l; f.querySelector('[data-si-no-lider]').hidden = l; };
    rol.onchange = ver; ver();
    f.querySelectorAll('.lp-flecha:not(.vacia)').forEach(b => b.onclick = () => {
      const subs = b.parentElement.nextElementSibling, abrir = subs.hidden;
      subs.hidden = !abrir; b.setAttribute('aria-expanded', abrir);
    });
    f.querySelectorAll('.lp-nombre input').forEach(c => c.onchange = () => {
      const subs = c.closest('.lp-proc').nextElementSibling;
      if (!subs?.classList.contains('lp-subs')) return;
      subs.querySelectorAll('input').forEach(s => { s.checked = c.checked; });
      if (c.checked) { subs.hidden = false; c.closest('.lp-proc').querySelector('.lp-flecha').setAttribute('aria-expanded', true); }
    });
  };
  const procesosTexto = u => u.rol !== 'lider_proceso' ? esc(u.proceso) : u.procesos.length
    ? esc(cat.procesos.filter(p => u.procesos.includes(p.id)).map(p => p.nombre).join(', ')) : '<span class="faltan">Sin procesos</span>';
  const activos = lista.filter(u => u.activo), sinCorreo = activos.filter(u => !u.correo).length, piden = activos.filter(u => u.reinicio_solicitado).length;
  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0">${activos.length} usuarios activos${sinCorreo ? ` · <span class="faltan">${sinCorreo} sin correo</span>` : ''}${piden ? ` · <b class="faltan">${piden} piden restablecer su clave</b>` : ''}</p>
    <div class="acciones">${sinCorreo ? '<button class="btn" id="completarCorreos">Completar correos</button>' : ''}<button class="btn primario" id="nuevo">Nuevo usuario</button></div></div>
    <div class="tabla-wrap"><table><thead><tr><th>Correo</th><th>Nombre</th><th>Cargo</th><th>Rol</th><th>Procesos</th><th>Estado</th><th></th></tr></thead><tbody>
    ${lista.map((u, i) => `<tr style="${u.activo ? '' : 'opacity:.55'}"><td>${u.correo ? esc(u.correo) : '<span class="faltan">Sin correo</span>'}<br><small class="gris mono">${esc(u.usuario)}</small></td>
      <td>${esc(u.nombre)}</td><td>${esc(u.cargo)}</td><td>${esc(ROL_NOMBRE[u.rol])}</td><td class="td-procesos">${procesosTexto(u)}</td>
      <td>${u.activo ? 'Activo' : 'Inactivo'}${u.reinicio_solicitado && u.activo ? `<br><b class="pide-clave" title="Lo pidió el ${esc(u.reinicio_solicitado)}">Pidió restablecer su clave</b>` : ''}${u.debe_cambiar && u.activo ? '<br><small class="faltan">Debe cambiar su clave</small>' : ''}</td>
      <td><div class="acciones"><button class="btn chico" data-ed="${i}">Editar</button>
        <button class="btn chico ${u.reinicio_solicitado ? 'primario' : ''}" data-cl="${i}">Restablecer clave</button>
        ${u.id !== yo.id ? `<button class="btn chico ${u.activo ? 'peligro' : ''}" data-ac="${i}">${u.activo ? 'Desactivar' : 'Reactivar'}</button>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div>`;
  const recargar = () => pestanaUsuarios();
  const quien = u => u.correo || u.usuario;
  $('#nuevo').onclick = intentar(async () => {
    const abierto = modal('Nuevo usuario', campos() + '<p class="sub" style="margin:0">Se genera una clave temporal que verás una sola vez.</p>', { aceptar: 'Crear' });
    conectarLista(); const v = await abierto;
    if (!v) return;
    const r = await api('/usuarios', { method: 'POST', body: v });
    await recargar(); await mostrarClave('Usuario creado', v.correo, r.clave_temporal);
  });
  $('#completarCorreos')?.addEventListener('click', intentar(async () => {
    const dominios = lista.map(u => (u.correo || '').split('@')[1]).filter(d => d && !d.endsWith('.test'));
    const comun = dominios.sort((a, b) => dominios.filter(x => x === b).length - dominios.filter(x => x === a).length)[0] || '';
    const v = await modal('Completar correos', `<p>A los <b>${sinCorreo}</b> usuarios activos sin correo se les asigna <span class="mono">usuario@dominio</span>
        (por ejemplo <span class="mono">${esc(activos.find(u => !u.correo)?.usuario || 'juan.perez')}@${esc(comun || 'empresa.com')}</span>).</p>
      <label>Dominio de la empresa<input name="dominio" required value="${esc(comun)}" placeholder="metalcof.co"></label>
      <p class="sub" style="margin:0">Revisa después la lista y corrige con «Editar» los que no coincidan con el correo real. Para cargar correos distintos usa Importar datos → Correos de usuarios que ya existen.</p>`, { aceptar: 'Completar' });
    if (!v) return;
    const r = await api('/usuarios/completar-correos', { method: 'POST', body: v });
    aviso(`${r.actualizados} correos asignados${r.omitidos.length ? ` · ${r.omitidos.length} omitidos (ese correo ya existía)` : ''}`); recargar();
  }));
  $('#cuerpo').querySelectorAll('[data-ed]').forEach(b => b.onclick = intentar(async () => {
    const u = lista[b.dataset.ed];
    const abierto = modal(`Editar ${u.nombre}`, campos(u)); conectarLista();
    const v = await abierto; if (!v) return;
    if (v.cargo_id === '' && !u.cargo_id) delete v.cargo_id; // no borra el cargo escrito a mano si no se eligió otro
    await api('/usuarios/' + u.id, { method: 'PUT', body: v }); aviso('Usuario actualizado'); recargar();
  }));
  $('#cuerpo').querySelectorAll('[data-cl]').forEach(b => b.onclick = intentar(async () => {
    const u = lista[b.dataset.cl];
    if (!await modal('Restablecer clave', `<p>Se genera una clave temporal nueva para <b>${esc(u.nombre)}</b> (${esc(quien(u))}) y se cierran sus sesiones abiertas.
      Al ingresar se le pide elegir una propia.</p>`, { aceptar: 'Restablecer' })) return;
    const r = await api(`/usuarios/${u.id}/clave`, { method: 'POST', body: {} });
    await recargar(); await mostrarClave('Clave restablecida', quien(u), r.clave_temporal);
  }));
  $('#cuerpo').querySelectorAll('[data-ac]').forEach(b => b.onclick = intentar(async () => {
    const u = lista[b.dataset.ac], baja = !!u.activo;
    if (baja && !await modal('Desactivar usuario', `<p><b>${esc(u.nombre)}</b> ya no podrá entrar. Sus registros se conservan.</p>`, { aceptar: 'Desactivar', peligro: true })) return;
    await api('/usuarios/' + u.id, { method: 'PUT', body: { ...u, activo: baja ? 0 : 1 } });
    aviso(baja ? 'Usuario desactivado' : 'Usuario reactivado'); recargar();
  }));
}

// ---------- Cargos: estructura de cargos con código OIKOS (CAR-ÁREA-NN), jefe y personas ----------
async function pestanaCargos() {
  const [cargos, usuarios] = await Promise.all([api('/cargos'), api('/usuarios')]);
  const areas = [...new Map(cargos.map(c => [c.area_sigla, c.area])).entries()];
  const ocupados = cargos.filter(c => c.personas.length).length;
  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0">${cargos.filter(c => c.activo).length} cargos activos en ${areas.length} áreas · ${ocupados} con personas asignadas</p>
    <button class="btn primario" id="nuevoCargo">Nuevo cargo</button></div>
    <p class="sub">Si cambia la persona que ocupa un cargo, usa «Personas» para reasignarlo: el código, el área y el jefe se conservan.</p>
    <div class="tabla-wrap"><table class="tabla-cargos"><thead><tr><th>Código</th><th>Área</th><th>Cargo</th><th>Jefe</th><th>Personas</th><th>Activo</th><th></th></tr></thead><tbody>
    ${cargos.map((c, i) => `<tr style="${c.activo ? '' : 'opacity:.55'}"><td class="mono">${c.codigo}</td><td>${esc(c.area)}</td><td><b>${esc(c.nombre)}</b></td>
      <td>${esc(c.jefe || '—')}</td><td>${c.personas.length ? c.personas.map(p => `<span class="chip">${esc(p.nombre)}</span>`).join(' ') : '<span class="gris">Vacante</span>'}</td>
      <td>${c.activo ? 'Sí' : 'No'}</td>
      <td><div class="acciones"><button class="btn chico" data-edc="${i}">Editar</button><button class="btn chico" data-per="${i}">Personas</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
  const recargar = () => pestanaCargos();
  const campos = (c = {}) => `<div class="form">
    <label>Área<select name="area_sigla" id="areaCargo">${areas.map(([s, a]) => `<option value="${s}" ${s === c.area_sigla ? 'selected' : ''}>${esc(a)} (${s})</option>`).join('')}
      <option value="__nueva">+ Nueva área…</option></select></label>
    <label>Número <small>(vacío = el siguiente libre)</small><input name="numero" type="number" min="1" max="999" value="${c.numero ?? ''}"></label>
    <div class="ancho" id="areaNueva" hidden><div class="form"><label>Sigla del área<input name="sigla_nueva" maxlength="6" placeholder="GPR"></label>
      <label>Nombre del área<input name="area_nueva" placeholder="Gerencia de Producción"></label></div></div>
    <label class="ancho">Cargo<input name="nombre" required value="${esc(c.nombre)}"></label>
    <label class="ancho">Jefe inmediato<select name="jefe_id">${opciones(cargos.filter(x => x.id !== c.id && x.activo).map(x => ({ id: x.id, nombre: `${x.nombre} · ${x.codigo}` })), c.jefe_id, '— Sin jefe —')}</select></label>
    ${c.id ? `<label class="check"><input type="checkbox" name="activo" ${c.activo ? 'checked' : ''}> Activo</label>` : ''}</div>
    <p class="sub" style="margin:0">El código se arma solo: CAR-sigla del área-número (ej. CAR-GPR-27).</p>`;
  const abrir = async (titulo, c, aceptar) => {
    const p = modal(titulo, campos(c), { aceptar });
    const sel = $('#areaCargo'), caja = $('#areaNueva');
    const ver = () => { caja.hidden = sel.value !== '__nueva'; };
    sel.onchange = ver; ver();
    const v = await p; if (!v) return null;
    if (v.area_sigla === '__nueva') { v.area_sigla = v.sigla_nueva; v.area = v.area_nueva; } else v.area = areas.find(([s]) => s === v.area_sigla)?.[1];
    delete v.sigla_nueva; delete v.area_nueva;
    if (c.id) v.activo = v.activo ? 1 : 0;
    return v;
  };
  $('#nuevoCargo').onclick = intentar(async () => {
    const v = await abrir('Nuevo cargo', {}, 'Crear'); if (!v) return;
    const r = await api('/cargos', { method: 'POST', body: v }); aviso(`Cargo ${r.codigo} creado`); recargar();
  });
  $('#cuerpo').querySelectorAll('[data-edc]').forEach(b => b.onclick = intentar(async () => {
    const c = cargos[b.dataset.edc], v = await abrir(`Editar ${c.codigo}`, c, 'Guardar'); if (!v) return;
    await api('/cargos/' + c.id, { method: 'PUT', body: v }); aviso('Cargo actualizado'); recargar();
  }));
  $('#cuerpo').querySelectorAll('[data-per]').forEach(b => b.onclick = intentar(async () => {
    const c = cargos[b.dataset.per], dondeEsta = u => cargos.find(x => x.id === u.cargo_id && x.id !== c.id);
    const p = modal(`Personas en ${c.nombre}`, `<p class="sub" style="margin:0">${c.codigo} · ${esc(c.area)}. Marca quiénes ocupan el cargo; quien tenga otro cargo pasa a este.</p>
      <input class="filtro-personas" id="filtroPer" placeholder="Buscar persona…" autocomplete="off">
      <div class="lista-personas"><input type="hidden" name="usuarios" value="">${usuarios.filter(u => u.activo).map(u => `<label><input type="checkbox" name="usuarios" value="${u.id}" ${u.cargo_id === c.id ? 'checked' : ''}>
        <span>${esc(u.nombre)}${dondeEsta(u) ? ` <small class="gris">hoy: ${esc(dondeEsta(u).nombre)}</small>` : ''}</span></label>`).join('')}</div>`, { aceptar: 'Guardar' });
    $('#filtroPer').oninput = e => { const q = e.target.value.toLowerCase(); document.querySelectorAll('.lista-personas label').forEach(l => { l.hidden = !l.textContent.toLowerCase().includes(q); }); };
    $('#filtroPer').onkeydown = e => { if (e.key === 'Enter') e.preventDefault(); };
    const v = await p; if (!v) return;
    const r = await api(`/cargos/${c.id}/personas`, { method: 'PUT', body: { usuarios: v.usuarios } });
    aviso(`${r.personas} persona${r.personas === 1 ? '' : 's'} en ${c.nombre}`); recargar();
  }));
}

// ---------- Procesos: crear procesos y subprocesos y asignar quién los lidera ----------
async function pestanaProcesos() {
  const lista = await api('/procesos-lideres');
  const hijos = id => lista.filter(p => p.padre_id === id);
  const chips = p => p.lideres.map(l => `<span class="chip lider-chip" title="${esc(l.cargo || l.usuario)}">${esc(l.nombre)}
        <button type="button" class="quitar-lider" data-quitar="${p.id}:${l.id}" aria-label="Quitar a ${esc(l.nombre)} como líder">×</button></span>`).join(' ');
  // Cada proceso y cada subproceso tiene sus propios líderes
  const fila = (p, nivel) => `<tr>
    <td style="padding-left:${8 + nivel * 22}px">${nivel ? '<span class="gris">↳</span> ' : ''}${p.codigo ? `<span class="mono gris">${esc(p.codigo)}</span> ` : ''}<b>${esc(p.nombre)}</b>${nivel ? ` <span class="gris">${esc(p.tipo)}</span>` : ''}</td>
    <td>${p.lideres.length ? chips(p) : '<span class="faltan">Sin líder</span>'}</td>
    <td><div class="acciones"><button class="btn chico" data-lider="${p.id}">Asignar líder</button>
      ${nivel ? '' : `<button class="btn chico" data-sub="${p.id}">Nuevo subproceso</button>`}</div></td></tr>`;
  const rama = (p, nivel) => fila(p, nivel) + hijos(p.id).map(h => rama(h, nivel + 1)).join(''); // subprocesos a cualquier profundidad
  const grupo = c => {
    const raices = lista.filter(p => !p.padre_id && p.categoria === c);
    return raices.length ? `<tr class="grupo-cat"><th colspan="3">${c}</th></tr>${raices.map(p => rama(p, 0)).join('')}` : '';
  };
  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0">${lista.filter(p => !p.padre_id).length} procesos y ${lista.filter(p => p.padre_id).length} subprocesos · ${lista.filter(p => p.lideres.length).length} con líder</p>
    <button class="btn primario" id="nuevoProceso">Nuevo proceso</button></div>
    <p class="sub">Un Líder puede liderar varios procesos y subprocesos, y un proceso varios líderes. Al asignarlo a un proceso principal se le marcan también sus subprocesos; el detalle se ajusta en Usuarios → Editar. Ve el mapa y los documentos vigentes de todos, pero solo gestiona lo suyo.</p>
    <div class="tabla-wrap"><table class="tabla-procesos" data-dt="1"><thead><tr><th>Proceso</th><th>Líder(es)</th><th></th></tr></thead><tbody>
      ${['Estratégico', 'Misional', 'Apoyo'].map(grupo).join('')}</tbody></table></div>`;

  const recargar = async () => { cat = await api('/catalogos'); cargarSistemas(); await pestanaProcesos(); }; // el catálogo alimenta el mapa y el árbol lateral

  const nuevo = async padre => {
    const v = await modal(padre ? `Nuevo subproceso de ${padre.nombre}` : 'Nuevo proceso', `<div class="form">
      <label class="ancho">Nombre<input name="nombre" required maxlength="120" autofocus></label>
      <label>Código <small>(opcional)</small><input name="codigo" maxlength="30" placeholder="ES-XXX-XXX-01"></label>
      <label>Sigla <small>(opcional)</small><input name="sigla" maxlength="6"></label>
      ${padre ? `<label class="ancho">Tipo<select name="tipo"><option>Subproceso</option><option>Procedimiento</option></select></label>
        <p class="sub ancho" style="margin:0">Hereda la categoría de su proceso (${esc(padre.categoria)}).</p>`
      : `<label class="ancho">Categoría<select name="categoria">${['Estratégico', 'Misional', 'Apoyo'].map(c => `<option ${c === 'Apoyo' ? 'selected' : ''}>${c}</option>`).join('')}</select></label>`}</div>`, { aceptar: 'Crear' });
    if (!v) return;
    const r = await api('/procesos', { method: 'POST', body: { ...v, padre_id: padre?.id || null } });
    aviso(padre ? 'Subproceso creado' : 'Proceso creado'); await recargar();
    return r;
  };
  $('#nuevoProceso').onclick = intentar(() => nuevo(null));
  $('#cuerpo').querySelectorAll('[data-sub]').forEach(b => b.onclick = intentar(() => nuevo(lista.find(p => p.id === Number(b.dataset.sub)))));

  $('#cuerpo').querySelectorAll('[data-lider]').forEach(b => b.onclick = intentar(async () => {
    const p = lista.find(x => x.id === Number(b.dataset.lider));
    const usuarios = (await api('/usuarios')).filter(u => u.activo && !['admin', 'lider_calidad'].includes(u.rol) && !p.lideres.some(l => l.id === u.id));
    if (!usuarios.length) { aviso('No hay más personas disponibles para liderar este proceso', true); return; }
    const etiqueta = u => `${u.nombre} (${u.correo || u.usuario})${u.rol === 'lider_proceso' && u.procesos.length ? ` — ya lidera ${u.procesos.length} proceso${u.procesos.length > 1 ? 's' : ''}` : ''}`;
    const v = await modal(`Asignar líder: ${p.nombre}`, `<label class="ancho">Persona<select name="usuario_id" required>
        <option value="">— Elige una persona —</option>${usuarios.map(u => `<option value="${u.id}">${esc(etiqueta(u))}</option>`).join('')}</select></label>
      <p class="sub" style="margin:0">Pasa a tener el rol Líder: verá el mapa y los documentos vigentes de todos, y se le suma este proceso${hijos(p.id).length ? ` con sus ${hijos(p.id).length} subprocesos` : ''} a los que ya lidere. Si aún no era Líder, se cierran sus sesiones para que tome los permisos nuevos.</p>`, { aceptar: 'Asignar' });
    if (!v || !v.usuario_id) return;
    const u = usuarios.find(x => x.id === Number(v.usuario_id));
    await api(`/procesos/${p.id}/lideres`, { method: 'POST', body: { usuario_id: u.id } });
    aviso(`${u.nombre} ahora lidera ${p.nombre}`); await recargar();
  }));

  $('#cuerpo').querySelectorAll('[data-quitar]').forEach(b => b.onclick = intentar(async () => {
    const [pid, uid] = b.dataset.quitar.split(':').map(Number), p = lista.find(x => x.id === pid), l = p.lideres.find(x => x.id === uid);
    if (!await modal('Quitar líder', `<p><b>${esc(l.nombre)}</b> deja de liderar <b>${esc(p.nombre)}</b> Si no le queda ningún otro proceso, pasa al rol Colaborador y se cierran sus sesiones.</p>`, { aceptar: 'Quitar', peligro: true })) return;
    await api(`/procesos/${pid}/lideres/${uid}`, { method: 'DELETE' });
    aviso(`${l.nombre} ya no lidera ${p.nombre}`); await recargar();
  }));
}

async function pestanaImportar() {
  const tipos = await api('/importar');
  $('#cuerpo').innerHTML = `<div class="tarjeta"><h3>Importar desde un archivo CSV</h3>
    <p class="sub">Guarda tu hoja de Excel como <b>CSV</b> (separado por punto y coma o coma). Se revisa fila por fila y <b>solo se importa si todas las filas son válidas</b>.</p>
    <div class="form"><label>¿Qué vas a importar?<select id="tipo">${tipos.map(t => `<option value="${t.id}">${esc(t.titulo)}</option>`).join('')}</select></label>
      <label>Archivo CSV<input type="file" id="archivo" accept=".csv,.txt,text/csv"></label></div>
    <p class="sub" id="ayuda" style="margin:10px 0 0"></p>
    <div class="acciones" style="margin-top:10px"><a class="btn" id="plantilla" download>Descargar plantilla</a>
      <button class="btn primario" id="revisar" disabled>Revisar archivo</button>
      <button class="btn primario" id="importar" hidden>Importar</button></div></div>
    <div id="resultado"></div>`;
  let texto = null;
  const actual = () => tipos.find(t => t.id === $('#tipo').value);
  const pintarTipo = () => {
    $('#ayuda').innerHTML = `<b>Columnas:</b> ${actual().columnas.map(c => actual().requeridas.includes(c) ? `<b>${c}*</b>` : c).join(', ')}<br>${esc(actual().ayuda)}`;
    $('#plantilla').href = `api/importar/${$('#tipo').value}/plantilla`;
    $('#resultado').innerHTML = ''; $('#importar').hidden = true;
  };
  $('#tipo').onchange = pintarTipo; pintarTipo();
  $('#archivo').onchange = async e => {
    const f = e.target.files[0];
    if (!f) { texto = null; $('#revisar').disabled = true; return; }
    const buf = await f.arrayBuffer();
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { texto = new TextDecoder('windows-1252').decode(buf); }
    $('#revisar').disabled = false; $('#importar').hidden = true; $('#resultado').innerHTML = '';
  };
  const enviar = aplicar => intentar(async () => {
    const r = await api('/importar/' + $('#tipo').value, { method: 'POST', body: { csv: texto, aplicar } });
    $('#importar').hidden = !(r.errores === 0 && !r.aplicado);
    if (r.aplicado) { $('#revisar').disabled = true; $('#archivo').value = ''; texto = null; }
    $('#resultado').innerHTML = `
      <div class="kpis"><div class="kpi"><b>${r.total}</b><span>Filas</span></div><div class="kpi"><b>${r.validas}</b><span>${sem('verde')} Válidas</span></div>
        <div class="kpi"><b>${r.errores}</b><span>${sem(r.errores ? 'rojo' : 'verde')} Con error</span></div></div>
      ${r.aplicado ? `<p class="tarjeta" style="border-color:var(--verde)">✅ Se importaron ${r.validas} filas.</p>` : r.errores ? '<p class="faltan" style="font-size:14px">Corrige las filas con error en tu archivo y vuelve a revisarlo. No se importó nada.</p>' : '<p>Todo está en orden. Pulsa <b>Importar</b> para guardar.</p>'}
      ${r.claves ? `<div class="tarjeta"><h3>Claves temporales (se muestran una sola vez)</h3><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Clave temporal</th></tr></thead><tbody>
        ${r.claves.map(c => `<tr><td class="mono">${esc(c.usuario)}</td><td>${esc(c.nombre)}</td><td class="mono">${esc(c.clave_temporal)}</td></tr>`).join('')}</tbody></table>
        <button class="btn" id="bajarClaves" style="margin-top:10px">Descargar CSV de claves</button></div>` : ''}
      <div class="tabla-wrap"><table><thead><tr><th>Fila</th><th>Resultado</th></tr></thead><tbody>
        ${r.filas.map(x => `<tr><td>${x.n}</td><td>${x.ok ? `✅ ${esc(x.resumen)}` : `<span class="faltan">❌ ${esc(x.error)}</span>`}</td></tr>`).join('')}</tbody></table></div>
      ${r.total > r.filas.length ? `<p class="sub">Se muestran las primeras ${r.filas.length} filas.</p>` : ''}`;
    $('#bajarClaves')?.addEventListener('click', () => exportarCSV('claves-temporales.csv', r.claves, [['usuario', 'Usuario'], ['nombre', 'Nombre'], ['clave_temporal', 'Clave temporal']]));
  });
  $('#revisar').onclick = enviar(false);
  $('#importar').onclick = enviar(true);
}

async function pestanaRespaldos() {
  const r = await api('/respaldos');
  const peso = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  $('#cuerpo').innerHTML = `<div class="tarjeta"><div class="encabezado"><div><h3 style="margin:0">Copias de seguridad</h3>
      <p class="sub" style="margin:4px 0 0">${r.automatico ? `Se crea una copia automática cada día después de las ${r.hora}:00 y se conservan las últimas ${r.conservar}.` : 'La copia automática está desactivada.'}
      Cada copia incluye la base de datos y los archivos adjuntos.</p></div>
      <button class="btn primario" id="ahora">Respaldar ahora</button></div>
    <p class="sub" style="margin:0"><b>Importante:</b> guarda también una copia fuera del servidor (descárgala de aquí cada semana o programa una copia externa).
      Si el servidor se pierde, las copias que están en él se pierden con él.</p></div>
    ${r.archivos.length ? `<div class="tabla-wrap"><table><thead><tr><th>Copia</th><th>Fecha</th><th class="num">Tamaño</th><th></th></tr></thead><tbody>
      ${r.archivos.map(x => `<tr><td class="mono">${esc(x.nombre)}</td><td>${esc(new Date(x.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }))}</td><td class="num">${peso(x.bytes)}</td>
        <td><a class="btn chico" href="api/respaldos/${encodeURIComponent(x.nombre)}" download>Descargar</a></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">Aún no hay copias. Pulsa “Respaldar ahora”.</p>'}`;
  $('#ahora').onclick = intentar(async () => {
    $('#ahora').disabled = true;
    try { await api('/respaldos', { method: 'POST' }); aviso('Copia creada'); } finally { pestanaRespaldos(); }
  });
}
