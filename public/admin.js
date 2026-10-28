// SGI — administración de usuarios e importación de datos, y cambio de clave propia
const ROL_NOMBRE = { admin: 'Administrador', lider_calidad: 'Líder de Calidad', lider_proceso: 'Líder de proceso', consulta: 'Consulta' };

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
  const tabs = [...(esAdmin ? [['usuarios', 'Usuarios'], ['procesos', 'Procesos']] : []), ['importar', 'Importar datos'], ...(esAdmin ? [['respaldos', 'Respaldos']] : [])];
  vista.innerHTML = `<div class="encabezado"><h2>Administración</h2></div>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="${k === pestana ? 'activo' : ''}" onclick="location.hash='#/admin?v=${k}'">${n}</button>`).join('')}</div>
    <div id="cuerpo"></div>`;
  if (pestana === 'usuarios' && esAdmin) await pestanaUsuarios();
  else if (pestana === 'procesos' && esAdmin) await pestanaProcesos();
  else if (pestana === 'respaldos' && esAdmin) await pestanaRespaldos();
  else await pestanaImportar();
};

const mostrarClave = (titulo, quien, clave) => modal(titulo, `<p>Entrégale esta clave temporal a <b>${esc(quien)}</b>. Se pide cambiarla al primer ingreso y no se vuelve a mostrar.</p>
  <input readonly value="${esc(clave)}" class="mono" style="font-size:18px" onfocus="this.select()">`, { aceptar: 'Listo' });

async function pestanaUsuarios() {
  const lista = await api('/usuarios');
  const campos = (u = {}) => `<div class="form">
    <label>Usuario${u.id ? '' : ' <small>(minúsculas, sin espacios)</small>'}<input name="usuario" ${u.id ? 'readonly' : 'required'} value="${esc(u.usuario)}"></label>
    <label>Nombre completo<input name="nombre" required value="${esc(u.nombre)}"></label>
    <label>Cargo<input name="cargo" value="${esc(u.cargo)}"></label>
    <label>Rol<select name="rol">${Object.entries(ROL_NOMBRE).map(([k, n]) => `<option value="${k}" ${k === (u.rol || 'consulta') ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="ancho">Proceso <small>(obligatorio para líder de proceso)</small><select name="proceso_id">${opciones(cat.procesos, u.proceso_id, '— Ninguno —')}</select></label></div>
    <p class="sub" style="margin:0">Administrador: todo, incluidos los usuarios · Líder de Calidad: todos los módulos · Líder de proceso: ve el mapa y los documentos vigentes de todos, y gestiona solo su proceso · Consulta: solo lectura.</p>`;
  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0">${lista.filter(u => u.activo).length} usuarios activos</p>
    <button class="btn primario" id="nuevo">Nuevo usuario</button></div>
    <div class="tabla-wrap"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Cargo</th><th>Rol</th><th>Proceso</th><th>Estado</th><th></th></tr></thead><tbody>
    ${lista.map((u, i) => `<tr style="${u.activo ? '' : 'opacity:.55'}"><td class="mono">${esc(u.usuario)}</td><td>${esc(u.nombre)}</td><td>${esc(u.cargo)}</td>
      <td>${esc(ROL_NOMBRE[u.rol])}</td><td>${esc(u.proceso)}</td>
      <td>${u.activo ? 'Activo' : 'Inactivo'}${u.debe_cambiar && u.activo ? '<br><small class="faltan">Debe cambiar su clave</small>' : ''}</td>
      <td><div class="acciones"><button class="btn chico" data-ed="${i}">Editar</button>
        <button class="btn chico" data-cl="${i}">Restablecer clave</button>
        ${u.id !== yo.id ? `<button class="btn chico ${u.activo ? 'peligro' : ''}" data-ac="${i}">${u.activo ? 'Desactivar' : 'Reactivar'}</button>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div>`;
  const recargar = () => pestanaUsuarios();
  $('#nuevo').onclick = intentar(async () => {
    const v = await modal('Nuevo usuario', campos() + '<p class="sub" style="margin:0">Se genera una clave temporal que verás una sola vez.</p>', { aceptar: 'Crear' });
    if (!v) return;
    const r = await api('/usuarios', { method: 'POST', body: v });
    await recargar(); await mostrarClave('Usuario creado', v.usuario, r.clave_temporal);
  });
  $('#cuerpo').querySelectorAll('[data-ed]').forEach(b => b.onclick = intentar(async () => {
    const u = lista[b.dataset.ed];
    const v = await modal(`Editar ${u.usuario}`, campos(u)); if (!v) return;
    await api('/usuarios/' + u.id, { method: 'PUT', body: v }); aviso('Usuario actualizado'); recargar();
  }));
  $('#cuerpo').querySelectorAll('[data-cl]').forEach(b => b.onclick = intentar(async () => {
    const u = lista[b.dataset.cl];
    if (!await modal('Restablecer clave', `<p>Se genera una clave temporal nueva para <b>${esc(u.usuario)}</b> y se cierran sus sesiones abiertas.</p>`, { aceptar: 'Restablecer' })) return;
    const r = await api(`/usuarios/${u.id}/clave`, { method: 'POST', body: {} });
    await recargar(); await mostrarClave('Clave restablecida', u.usuario, r.clave_temporal);
  }));
  $('#cuerpo').querySelectorAll('[data-ac]').forEach(b => b.onclick = intentar(async () => {
    const u = lista[b.dataset.ac], baja = !!u.activo;
    if (baja && !await modal('Desactivar usuario', `<p><b>${esc(u.nombre)}</b> ya no podrá entrar. Sus registros se conservan.</p>`, { aceptar: 'Desactivar', peligro: true })) return;
    await api('/usuarios/' + u.id, { method: 'PUT', body: { ...u, activo: baja ? 0 : 1 } });
    aviso(baja ? 'Usuario desactivado' : 'Usuario reactivado'); recargar();
  }));
}

// ---------- Procesos: crear procesos y subprocesos y asignar quién los lidera ----------
async function pestanaProcesos() {
  const lista = await api('/procesos-lideres');
  const nombreDe = id => lista.find(p => p.id === id)?.nombre || '';
  const hijos = id => lista.filter(p => p.padre_id === id);
  const fila = (p, nivel) => `<tr>
    <td style="padding-left:${8 + nivel * 22}px">${nivel ? '<span class="gris">↳</span> ' : ''}${p.codigo ? `<span class="mono gris">${esc(p.codigo)}</span> ` : ''}<b>${esc(p.nombre)}</b>${nivel ? ` <span class="gris">${esc(p.tipo)}</span>` : ''}</td>
    <td>${p.lideres.length ? p.lideres.map(l => `<span class="chip lider-chip" title="${esc(l.cargo || l.usuario)}">${esc(l.nombre)}
        <button type="button" class="quitar-lider" data-quitar="${p.id}:${l.id}" aria-label="Quitar a ${esc(l.nombre)} como líder">×</button></span>`).join(' ')
      : '<span class="faltan">Sin líder</span>'}</td>
    <td><div class="acciones"><button class="btn chico" data-lider="${p.id}">Asignar líder</button>
      ${nivel === 0 ? `<button class="btn chico" data-sub="${p.id}">Nuevo subproceso</button>` : ''}</div></td></tr>`;
  const grupo = c => {
    const raices = lista.filter(p => !p.padre_id && p.categoria === c);
    return raices.length ? `<tr class="grupo-cat"><th colspan="3">${c}</th></tr>${raices.map(p => fila(p, 0) + hijos(p.id).map(h => fila(h, 1)).join('')).join('')}` : '';
  };
  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0">${lista.length} procesos y subprocesos · ${lista.filter(p => p.lideres.length).length} con líder asignado</p>
    <button class="btn primario" id="nuevoProceso">Nuevo proceso</button></div>
    <p class="sub">Quien lidera un proceso ve el mapa y los documentos vigentes de todos, pero solo gestiona lo de su proceso. Cada persona lidera un solo proceso; un proceso puede tener varios líderes.</p>
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
    const etiqueta = u => `${u.nombre} (${u.usuario})${u.rol === 'lider_proceso' && u.proceso_id ? ` — hoy lidera ${nombreDe(u.proceso_id)}` : ''}`;
    const v = await modal(`Asignar líder: ${p.nombre}`, `<label class="ancho">Persona<select name="usuario_id" required>
        <option value="">— Elige una persona —</option>${usuarios.map(u => `<option value="${u.id}">${esc(etiqueta(u))}</option>`).join('')}</select></label>
      <p class="sub" style="margin:0">Pasa a tener el rol Líder de proceso: verá el mapa y los documentos vigentes de todos, y solo gestionará este proceso. Se cierran sus sesiones abiertas para que tome los permisos nuevos.</p>`, { aceptar: 'Asignar' });
    if (!v || !v.usuario_id) return;
    const u = usuarios.find(x => x.id === Number(v.usuario_id));
    if (u.rol === 'lider_proceso' && u.proceso_id && u.proceso_id !== p.id
      && !await modal('Esta persona ya lidera otro proceso', `<p><b>${esc(u.nombre)}</b> lidera <b>${esc(nombreDe(u.proceso_id))}</b>. Cada persona lidera un solo proceso: al continuar deja de liderar ese y pasa a liderar <b>${esc(p.nombre)}</b>.</p>`, { aceptar: 'Mover' })) return;
    await api(`/procesos/${p.id}/lideres`, { method: 'POST', body: { usuario_id: u.id } });
    aviso(`${u.nombre} ahora lidera ${p.nombre}`); await recargar();
  }));

  $('#cuerpo').querySelectorAll('[data-quitar]').forEach(b => b.onclick = intentar(async () => {
    const [pid, uid] = b.dataset.quitar.split(':').map(Number), p = lista.find(x => x.id === pid), l = p.lideres.find(x => x.id === uid);
    if (!await modal('Quitar líder', `<p><b>${esc(l.nombre)}</b> deja de liderar <b>${esc(p.nombre)}</b> y queda con el rol Consulta (solo lectura). Se cierran sus sesiones abiertas.</p>`, { aceptar: 'Quitar', peligro: true })) return;
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
    $('#plantilla').href = `/api/importar/${$('#tipo').value}/plantilla`;
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
        <td><a class="btn chico" href="/api/respaldos/${encodeURIComponent(x.nombre)}" download>Descargar</a></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">Aún no hay copias. Pulsa “Respaldar ahora”.</p>'}`;
  $('#ahora').onclick = intentar(async () => {
    $('#ahora').disabled = true;
    try { await api('/respaldos', { method: 'POST' }); aviso('Copia creada'); } finally { pestanaRespaldos(); }
  });
}
