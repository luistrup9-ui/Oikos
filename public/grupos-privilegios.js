// SGI — Administración → Grupos de usuarios y Privilegios. Los privilegios SUMAN a los roles: sin ellos todo sigue como siempre.
// Usa $, api, esc, yo, aviso, intentar, modal, coincide (app.js), buscador (admin.js) y puede (app.js). Servidor: php/modulos/grupos.php y privilegios.php.

// Lista de personas con casillas y buscador, para el diálogo de miembros y el de privilegios
const listaMarcable = (filas, buscarId) => `<input class="filtro-personas" id="${buscarId}" placeholder="Buscar persona…" autocomplete="off">
  <div class="lista-personas" data-lista="${buscarId}">${filas.join('')}</div>`;
function conectarFiltro(buscarId) {
  const f = $('#' + buscarId);
  f.oninput = e => { const q = e.target.value; document.querySelectorAll(`[data-lista="${buscarId}"] label[data-texto]`).forEach(l => { l.hidden = !coincide(l.dataset.texto, q); }); };
  f.onkeydown = e => { if (e.key === 'Enter') e.preventDefault(); };
}

async function pestanaGrupos(q0 = '') {
  const [grupos, personas] = await Promise.all([api('/grupos'), api('/personas')]);
  const crea = puede('gestionar_grupos'), esAdmin = yo.rol === 'admin';
  // Un grupo que da privilegios solo lo cambia el administrador; en uno sin privilegios cambia quien gestiona grupos o quien lo administra
  const puedeCambiar = g => (esAdmin || !g.privilegios) && (crea || g.administro);
  let q = q0;
  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0">${grupos.length} grupo${grupos.length === 1 ? '' : 's'} de usuarios</p>
    <div class="acciones">${buscador(q0, 'Buscar grupo…')}${crea ? '<button class="btn primario" id="nuevoGrupo">Adicionar grupo</button>' : ''}</div></div>
    <p class="sub">Un grupo reúne personas para darles privilegios de una vez (pestaña Privilegios). Las personas nuevas entran solas a los grupos marcados «por defecto».
      Un grupo que da privilegios solo lo cambia el administrador.</p>
    <div id="tablaGrupos"></div>`;
  const dibujar = () => {
    const filas = grupos.map((g, i) => [g, i]).filter(([g]) => coincide(g.nombre, q));
    $('#tablaGrupos').innerHTML = filas.length ? `<div class="tabla-wrap"><table class="sin-dt"><thead><tr><th>Nombre</th><th>Por defecto</th><th class="num">Miembros</th><th>Administradores</th><th class="num">Privilegios</th><th>Creado por</th><th></th></tr></thead><tbody>
      ${filas.map(([g, i]) => `<tr><td><b>${esc(g.nombre)}</b></td><td>${g.por_defecto ? 'Sí' : 'No'}</td><td class="num">${g.miembros}</td><td>${g.administradores ? esc(g.administradores) : '<span class="gris">—</span>'}</td>
        <td class="num">${g.privilegios}</td><td>${g.creado_por ? esc(g.creado_por) : '<span class="gris">—</span>'}<br><small class="gris">${g.creado ? esc(String(g.creado).slice(0, 10)) : ''}</small></td>
        <td>${puedeCambiar(g) ? `<div class="acciones"><button class="btn chico" data-miembros="${i}">Miembros</button>${crea ? `<button class="btn chico" data-editar-grupo="${i}">Editar</button><button class="btn chico peligro" data-borrar-grupo="${i}">Borrar</button>` : ''}</div>`
          : (g.privilegios && !esAdmin ? '<small class="gris">Da privilegios: solo el administrador</small>' : '')}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="vacio">${grupos.length ? `Ningún grupo coincide con «${esc(q)}».` : 'Todavía no hay grupos.'}</p>`;
    conectar();
  };
  const recargar = () => pestanaGrupos(q);
  const formGrupo = async g => {
    const v = await modal(g ? `Editar ${g.nombre}` : 'Nuevo grupo', `<div class="form"><label class="ancho">Nombre<input name="nombre" required maxlength="120" value="${esc(g?.nombre)}" autofocus></label>
      <label class="check ancho"><input type="checkbox" name="por_defecto" ${g?.por_defecto ? 'checked' : ''}> Grupo por defecto (las personas que se creen después entran solas)</label></div>`, { aceptar: g ? 'Guardar' : 'Crear' });
    return v ? { nombre: v.nombre, por_defecto: !!v.por_defecto } : null;
  };
  function conectar() {
    $('#tablaGrupos').querySelectorAll('[data-editar-grupo]').forEach(b => b.onclick = intentar(async () => {
      const g = grupos[b.dataset.editarGrupo], d = await formGrupo(g); if (!d) return;
      await api('/grupos/' + g.id, { method: 'PUT', body: d }); aviso('Grupo actualizado'); await recargar();
    }));
    $('#tablaGrupos').querySelectorAll('[data-borrar-grupo]').forEach(b => b.onclick = intentar(async () => {
      const g = grupos[b.dataset.borrarGrupo];
      if (!await modal('Borrar grupo', `<p>Se borra el grupo <b>${esc(g.nombre)}</b> y se les quitan a sus ${g.miembros} miembros los privilegios que les daba${g.privilegios ? ` (${g.privilegios})` : ''}. Las personas no se borran.</p>`, { aceptar: 'Borrar', peligro: true })) return;
      await api('/grupos/' + g.id, { method: 'DELETE' }); aviso('Grupo borrado'); await recargar();
    }));
    $('#tablaGrupos').querySelectorAll('[data-miembros]').forEach(b => b.onclick = intentar(async () => {
      const g = await api('/grupos/' + grupos[b.dataset.miembros].id), marcados = new Map(g.miembros.map(m => [m.id, m.administrador]));
      const activas = personas.filter(p => p.activo || marcados.has(p.id));
      const p = modal(`Miembros de ${g.nombre}`, `<p class="sub" style="margin:0">Marca quiénes son miembros del grupo. «Administra» deja a la persona cambiar los miembros de este grupo.</p>
        <div class="acciones"><button type="button" class="btn chico" id="marcarTodas">Marcar a todas las personas activas</button><button type="button" class="btn chico" id="desmarcarTodas">Quitar a todas</button></div>
        ${listaMarcable(activas.map(x => `<label data-texto="${esc(x.nombre + ' ' + (x.correo || '') + ' ' + (x.cargo || ''))}" class="fila-miembro"><input type="checkbox" name="m_${x.id}" ${marcados.has(x.id) ? 'checked' : ''}>
          <span>${esc(x.nombre)}${x.activo ? '' : ' <small class="gris">(inactiva)</small>'}${x.cargo ? ` <small class="gris">${esc(x.cargo)}</small>` : ''}</span>
          <span class="adm"><input type="checkbox" name="a_${x.id}" ${marcados.get(x.id) ? 'checked' : ''} aria-label="Administra"> Administra</span></label>`), 'filtroMiembros')}`, { aceptar: 'Guardar' });
      conectarFiltro('filtroMiembros');
      const todas = valor => document.querySelectorAll('#modalForm [name^="m_"]').forEach(c => { if (!c.closest('label').hidden && (valor === false || personas.find(x => x.id === Number(c.name.slice(2)))?.activo)) c.checked = valor; });
      $('#marcarTodas').onclick = () => todas(true); $('#desmarcarTodas').onclick = () => todas(false);
      const v = await p; if (!v) return;
      const miembros = activas.filter(x => v['m_' + x.id]).map(x => ({ id: x.id, administrador: !!v['a_' + x.id] }));
      const r = await api(`/grupos/${g.id}/miembros`, { method: 'PUT', body: { miembros } });
      aviso(`Grupo actualizado: ${r.miembros} miembro${r.miembros === 1 ? '' : 's'}`); await recargar();
    }));
  }
  $('#buscar').oninput = e => { q = e.target.value; dibujar(); };
  $('#nuevoGrupo') && ($('#nuevoGrupo').onclick = intentar(async () => { const d = await formGrupo(null); if (!d) return; await api('/grupos', { method: 'POST', body: d }); aviso('Grupo creado'); await recargar(); }));
  dibujar();
}

// Privilegios: el catálogo con quién tiene cada uno. El super usuario es el rol Administrador y los tiene todos; los demás se otorgan a personas y a grupos.
async function pestanaPrivilegios() {
  const [lista, grupos, personas] = await Promise.all([api('/privilegios'), api('/grupos'), api('/personas')]);
  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0">${lista.filter(p => p.delegable).length} privilegios que se pueden otorgar · ${lista.filter(p => !p.delegable).length} solo del super usuario</p></div>
    <p class="sub">Los privilegios <b>suman</b> a los roles: nadie pierde nada por no tener uno. Se otorgan a personas o a grupos y valen al instante. El super usuario es el rol Administrador y los tiene todos.
      Lo delicado (usuarios, claves, líderes de proceso, copias de seguridad y los propios privilegios) no se puede otorgar.</p>
    <div class="tabla-wrap"><table class="sin-dt tabla-privilegios"><thead><tr><th>Privilegio</th><th>Super usuario</th><th>Personas</th><th>Grupos</th><th></th></tr></thead><tbody>
    ${lista.map((p, i) => `<tr><td><b>${esc(p.nombre)}</b><br><small class="gris">${esc(p.descripcion)}</small></td><td class="centro-txt" title="El rol Administrador lo tiene siempre">✓</td>
      <td>${p.delegable ? (p.usuarios.length ? p.usuarios.map(u => `<span class="chip">${esc(u.nombre)}</span>`).join(' ') : '<span class="gris">Nadie</span>') : '<span class="gris">—</span>'}</td>
      <td>${p.delegable ? (p.grupos.length ? p.grupos.map(g => `<span class="chip">${esc(g.nombre)}</span>`).join(' ') : '<span class="gris">Ninguno</span>') : '<span class="gris">—</span>'}</td>
      <td>${p.delegable ? `<button class="btn chico" data-otorgar="${i}">Otorgar</button>` : '<small class="gris">Solo super usuario</small>'}</td></tr>`).join('')}</tbody></table></div>`;
  $('#cuerpo').querySelectorAll('[data-otorgar]').forEach(b => b.onclick = intentar(async () => {
    const p = lista[b.dataset.otorgar], tiene = new Set(p.usuarios.map(u => u.id)), tieneG = new Set(p.grupos.map(g => g.id));
    const candidatas = personas.filter(x => x.rol !== 'admin' && (x.activo || tiene.has(x.id)));
    const abierto = modal(`Otorgar: ${p.nombre}`, `<p class="sub" style="margin:0">${esc(p.descripcion)}</p>
      <b>Personas</b>${listaMarcable(candidatas.map(x => `<label data-texto="${esc(x.nombre + ' ' + (x.cargo || ''))}"><input type="checkbox" name="u_${x.id}" ${tiene.has(x.id) ? 'checked' : ''}>
        <span>${esc(x.nombre)}${x.cargo ? ` <small class="gris">${esc(x.cargo)}</small>` : ''}</span></label>`), 'filtroPrivilegio')}
      <b>Grupos</b><div class="lista-personas">${grupos.length ? grupos.map(g => `<label><input type="checkbox" name="g_${g.id}" ${tieneG.has(g.id) ? 'checked' : ''}> <span>${esc(g.nombre)} <small class="gris">${g.miembros} miembro${g.miembros === 1 ? '' : 's'}</small></span></label>`).join('') : '<p class="sub" style="margin:6px">Todavía no hay grupos (pestaña Grupos).</p>'}</div>`, { aceptar: 'Guardar' });
    conectarFiltro('filtroPrivilegio');
    const v = await abierto; if (!v) return;
    await api('/privilegios/' + p.clave, { method: 'PUT', body: { usuarios: candidatas.filter(x => v['u_' + x.id]).map(x => x.id), grupos: grupos.filter(g => v['g_' + g.id]).map(g => g.id) } });
    aviso('Privilegio actualizado'); pestanaPrivilegios();
  }));
}
