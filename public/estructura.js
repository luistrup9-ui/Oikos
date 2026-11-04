// SGI — Estructura organizacional (áreas en árbol y sus tipos), perfil del cargo (#/cargo/N) y campos adicionales de los cargos.
// Usa $, api, esc, vista, yo, cat, rutas, aviso, intentar, modal, opciones, coincide (app.js), buscador (admin.js) y puede (app.js).
// El servidor está en php/modulos/estructura.php. Cambiar exige un privilegio (o ser el administrador); ver php/modulos/privilegios.php.

// ---------- Administración → Estructura: Árbol, Tabla y Tipos de área ----------
async function pestanaEstructura(modo0 = 'arbol', q0 = '') {
  const [areas, cargos, tipos] = await Promise.all([api('/areas'), api('/cargos'), api('/tipos-area')]);
  const editable = puede('gestionar_estructura');
  let modo = modo0, q = q0;
  const hijosDe = id => areas.filter(a => (a.padre_id || null) === id);
  const descendientes = id => hijosDe(id).flatMap(h => [h.id, ...descendientes(h.id)]);
  const cargosDe = id => cargos.filter(c => c.area_id === id);
  const nivelDe = a => a.padre_id ? 1 + nivelDe(areas.find(x => x.id === a.padre_id)) : 0;
  const enOrden = (padre = null) => hijosDe(padre).flatMap(a => [a, ...enOrden(a.id)]);                // el árbol aplanado, cada área seguida de sus áreas internas
  const textoCargo = c => `${c.nombre} ${c.codigo} ${c.personas.map(p => p.nombre).join(' ')}`;
  const textoArea = a => `${a.nombre} ${a.sigla} ${a.tipo || ''}`;
  const coincideArea = a => !q.trim() || coincide(textoArea(a), q) || cargosDe(a.id).some(c => coincide(textoCargo(c), q)) || hijosDe(a.id).some(coincideArea);

  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0" id="cuentaEst"></p>
    <div class="acciones">${buscador(q0, 'Buscar área, cargo o persona…')}
      <div class="tabs" style="margin:0" role="group" aria-label="Vista">${[['arbol', 'Árbol'], ['tabla', 'Tabla'], ['tipos', 'Tipos de área']].map(([k, n]) => `<button type="button" data-modo="${k}">${n}</button>`).join('')}</div>
      ${editable ? '<button class="btn primario" id="nuevaArea">Adicionar área</button>' : ''}</div></div>
    <div id="vistaEst"></div>`;

  const filaCargo = c => `<div class="nodo-cargo${c.activo ? '' : ' inactiva'}"><a href="#/cargo/${c.id}"><b>${esc(c.nombre)}</b></a> <span class="mono gris">${esc(c.codigo)}</span>
    ${c.jefe ? `<small class="gris">· reporta a ${esc(c.jefe)}</small>` : ''}<span class="nodo-personas">${c.personas.length ? c.personas.map(p => `<span class="chip">${esc(p.nombre)}</span>`).join(' ') : '<span class="gris">Vacante</span>'}</span></div>`;
  const nodoArea = a => {
    const todos = !q.trim() || coincide(textoArea(a), q), mios = cargosDe(a.id).filter(c => todos || coincide(textoCargo(c), q));
    return `<details class="nodo-area${a.activo ? '' : ' inactiva'}" ${q.trim() ? 'open' : ''}>
      <summary><span class="nodo-nombre">${esc(a.nombre)}</span> <span class="chip mono">${esc(a.sigla)}</span>${a.tipo ? ` <span class="chip">${esc(a.tipo)}</span>` : ''}${a.activo ? '' : ' <span class="chip">Inactiva</span>'}
        <small class="gris">${a.cargos} cargo${a.cargos === 1 ? '' : 's'} · ${a.personas} persona${a.personas === 1 ? '' : 's'}</small>
        ${editable ? `<span class="acciones-nodo"><button type="button" class="btn chico" data-editar-area="${a.id}">Editar</button><button type="button" class="btn chico" data-sub-area="${a.id}">+ Área interna</button></span>` : ''}</summary>
      <div class="nodo-cuerpo">${mios.map(filaCargo).join('')}${hijosDe(a.id).filter(coincideArea).map(nodoArea).join('')}</div></details>`;
  };
  const dibujar = () => {
    $('#cuerpo').querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('activo', b.dataset.modo === modo));
    $('#cuentaEst').textContent = `${areas.length} área${areas.length === 1 ? '' : 's'} · ${cargos.filter(c => c.activo).length} cargos activos · ${tipos.length} tipo${tipos.length === 1 ? '' : 's'} de área`;
    $('#buscar').hidden = modo === 'tipos'; if ($('#nuevaArea')) $('#nuevaArea').hidden = modo === 'tipos';
    const sin = `<p class="vacio">Ninguna área ni cargo coincide con «${esc(q)}».</p>`;
    if (modo === 'arbol') {
      const raices = hijosDe(null).filter(coincideArea);
      $('#vistaEst').innerHTML = areas.length ? `<div class="acciones" style="margin-bottom:8px"><button type="button" class="btn chico" id="expandir">Expandir todo</button><button type="button" class="btn chico" id="contraer">Contraer todo</button></div>
        <div class="arbol-estructura"><div class="nodo-raiz">${esc(yo.empresa || 'Empresa')}</div>${raices.length ? `<div class="nodo-cuerpo">${raices.map(nodoArea).join('')}</div>` : sin}</div>`
        : `<p class="vacio">Todavía no hay áreas.${editable ? ' Crea la primera con «Adicionar área».' : ''}</p>`;
    } else if (modo === 'tabla') {
      const filas = enOrden().filter(a => !q.trim() || coincide(textoArea(a), q) || cargosDe(a.id).some(c => coincide(textoCargo(c), q)));
      $('#vistaEst').innerHTML = filas.length ? `<div class="tabla-wrap"><table class="tabla-estructura"><thead><tr><th>Sigla</th><th>Nombre</th><th>Depende de</th><th>Tipo</th><th class="num">Cargos</th><th class="num">Personas</th><th>Estado</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>
        ${filas.map(a => `<tr${a.activo ? '' : ' style="opacity:.55"'}><td class="mono">${esc(a.sigla)}</td><td style="padding-left:${8 + nivelDe(a) * 18}px">${nivelDe(a) ? '<span class="gris">↳</span> ' : ''}<b>${esc(a.nombre)}</b></td>
          <td>${a.padre_id ? esc(areas.find(x => x.id === a.padre_id)?.nombre) : '<span class="gris">—</span>'}</td><td>${a.tipo ? esc(a.tipo) : '<span class="gris">—</span>'}</td>
          <td class="num">${a.cargos}</td><td class="num">${a.personas}</td><td>${a.activo ? 'Activa' : 'Inactiva'}</td>
          ${editable ? `<td><div class="acciones"><button class="btn chico" data-editar-area="${a.id}">Editar</button><button class="btn chico peligro" data-borrar-area="${a.id}">Borrar</button></div></td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : (areas.length ? sin : '<p class="vacio">Todavía no hay áreas.</p>');
    } else {
      $('#vistaEst').innerHTML = `<div class="tarjeta"><div class="encabezado"><h3 style="margin:0">Tipos de área</h3>${editable ? '<button class="btn chico primario" id="nuevoTipo">Nuevo tipo</button>' : ''}</div>
        <p class="sub">Clasifican las áreas (por ejemplo Gerencia, Dirección, Coordinación). Cada empresa define los suyos.</p>
        ${tipos.length ? `<table class="sin-dt"><thead><tr><th>Tipo</th><th class="num">Áreas</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${tipos.map(t => `<tr><td><b>${esc(t.nombre)}</b></td><td class="num">${t.areas}</td>
          ${editable ? `<td><div class="acciones"><button class="btn chico" data-editar-tipo="${t.id}">Renombrar</button><button class="btn chico peligro" data-borrar-tipo="${t.id}">Borrar</button></div></td>` : ''}</tr>`).join('')}</tbody></table>` : '<p class="vacio">Todavía no hay tipos de área.</p>'}</div>`;
    }
    conectar();
  };

  const recargar = () => pestanaEstructura(modo, q);
  const formArea = async (a = null, padreInicial = null) => {
    const excluidas = a ? [a.id, ...descendientes(a.id)] : [], conCargos = a && cargos.some(c => c.area_id === a.id);
    const lista = enOrden().filter(x => !excluidas.includes(x.id)).map(x => ({ id: x.id, nombre: `${'— '.repeat(nivelDe(x))}${x.nombre}` }));
    const v = await modal(a ? `Editar ${a.nombre}` : padreInicial ? `Nueva área interna de ${padreInicial.nombre}` : 'Nueva área', `<div class="form">
      <label class="ancho">Nombre<input name="nombre" required maxlength="200" value="${esc(a?.nombre)}" autofocus></label>
      <label>Sigla <small>(2 a 6 letras)</small><input name="sigla" required maxlength="6" pattern="[A-Za-z]{2,6}" value="${esc(a?.sigla)}" ${conCargos ? 'readonly title="Tiene cargos: su código se arma con esta sigla"' : ''}></label>
      <label>Tipo<select name="tipo_area_id">${opciones(tipos, a?.tipo_area_id, '— Sin tipo —')}</select></label>
      <label class="ancho">Depende de<select name="padre_id">${opciones(lista, a ? a.padre_id : padreInicial?.id, '— Ninguna (primer nivel) —')}</select></label>
      ${a ? `<label class="check ancho"><input type="checkbox" name="activo" ${a.activo ? 'checked' : ''}> Activa</label>` : ''}
      <p class="sub ancho" style="margin:0">${conCargos ? 'La sigla no se cambia mientras el área tenga cargos: el código de cada cargo (CAR-sigla-número) se arma con ella. ' : 'Con la sigla se arma el código de los cargos del área (ej. CAR-GPR-27). '}Cambiar el nombre se refleja en todos sus cargos.</p></div>`, { aceptar: a ? 'Guardar' : 'Crear' });
    if (!v) return null;
    return { nombre: v.nombre, sigla: v.sigla, tipo_area_id: v.tipo_area_id ? Number(v.tipo_area_id) : null, padre_id: v.padre_id ? Number(v.padre_id) : null, ...(a ? { activo: v.activo ? 1 : 0 } : {}) };
  };
  const nuevaArea = async (padre = null) => {
    const d = await formArea(null, padre); if (!d) return;
    await api('/areas', { method: 'POST', body: d }); aviso('Área creada'); await recargar();
  };
  const nombreTipo = async (t = null) => {
    const v = await modal(t ? 'Renombrar tipo de área' : 'Nuevo tipo de área', `<label class="ancho">Nombre<input name="nombre" required maxlength="100" value="${esc(t?.nombre)}" autofocus></label>`, { aceptar: t ? 'Guardar' : 'Crear' });
    return v ? v.nombre : null;
  };
  function conectar() {
    const raiz = $('#vistaEst');
    $('#nuevaArea') && ($('#nuevaArea').onclick = intentar(() => nuevaArea()));
    $('#expandir') && ($('#expandir').onclick = () => raiz.querySelectorAll('details').forEach(d => { d.open = true; }));
    $('#contraer') && ($('#contraer').onclick = () => raiz.querySelectorAll('details').forEach(d => { d.open = false; }));
    raiz.querySelectorAll('[data-editar-area]').forEach(b => b.onclick = intentar(async e => {
      e.preventDefault(); e.stopPropagation();                                         // dentro del árbol el botón está en el título del nodo: que no lo pliegue
      const a = areas.find(x => x.id === Number(b.dataset.editarArea)), d = await formArea(a); if (!d) return;
      await api('/areas/' + a.id, { method: 'PUT', body: d }); aviso('Área actualizada'); await recargar();
    }));
    raiz.querySelectorAll('[data-sub-area]').forEach(b => b.onclick = intentar(async e => { e.preventDefault(); e.stopPropagation(); await nuevaArea(areas.find(x => x.id === Number(b.dataset.subArea))); }));
    raiz.querySelectorAll('[data-borrar-area]').forEach(b => b.onclick = intentar(async () => {
      const a = areas.find(x => x.id === Number(b.dataset.borrarArea));
      if (!await modal('Borrar área', `<p>Se borra el área <b>${esc(a.nombre)}</b>. Solo se puede si no tiene cargos ni áreas internas.</p>`, { aceptar: 'Borrar', peligro: true })) return;
      await api('/areas/' + a.id, { method: 'DELETE' }); aviso('Área borrada'); await recargar();
    }));
    $('#nuevoTipo') && ($('#nuevoTipo').onclick = intentar(async () => { const n = await nombreTipo(); if (!n) return; await api('/tipos-area', { method: 'POST', body: { nombre: n } }); aviso('Tipo creado'); await recargar(); }));
    raiz.querySelectorAll('[data-editar-tipo]').forEach(b => b.onclick = intentar(async () => {
      const t = tipos.find(x => x.id === Number(b.dataset.editarTipo)), n = await nombreTipo(t); if (!n) return;
      await api('/tipos-area/' + t.id, { method: 'PUT', body: { nombre: n } }); aviso('Tipo actualizado'); await recargar();
    }));
    raiz.querySelectorAll('[data-borrar-tipo]').forEach(b => b.onclick = intentar(async () => {
      const t = tipos.find(x => x.id === Number(b.dataset.borrarTipo));
      if (!await modal('Borrar tipo de área', `<p>Se borra el tipo <b>${esc(t.nombre)}</b>. Solo se puede si ningún área lo usa.</p>`, { aceptar: 'Borrar', peligro: true })) return;
      await api('/tipos-area/' + t.id, { method: 'DELETE' }); aviso('Tipo borrado'); await recargar();
    }));
  }
  $('#buscar').oninput = e => { q = e.target.value; dibujar(); };
  $('#cuerpo').querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { modo = b.dataset.modo; dibujar(); });
  dibujar();
}

// ---------- Administración → Campos del perfil (la «Parametrización de cargos» de Almera): los campos adicionales del perfil ----------
async function pestanaCamposCargo() {
  const campos = await api('/cargo-campos');
  $('#cuerpo').innerHTML = `<div class="encabezado"><p class="sub" style="margin:0">${campos.length} campo${campos.length === 1 ? '' : 's'} adicional${campos.length === 1 ? '' : 'es'} del perfil del cargo</p>
    <div class="acciones"><button class="btn primario" id="nuevoCampo">Nuevo campo adicional</button></div></div>
    <p class="sub">Los campos que defines aquí aparecen en el perfil de todos los cargos (nivel educativo, experiencia, conocimientos…). Un campo que ya tiene valores no se borra: se desactiva.</p>
    <div id="tablaCampos"></div>`;
  $('#tablaCampos').innerHTML = campos.length ? `<div class="tabla-wrap"><table class="sin-dt"><thead><tr><th>Agrupador</th><th>Código</th><th>Nombre</th><th>Tipo</th><th>Alias</th><th class="num">Orden</th><th class="num">En uso</th><th>Estado</th><th></th></tr></thead><tbody>
    ${campos.map((c, i) => `<tr${c.activo ? '' : ' style="opacity:.55"'}><td>${c.agrupador ? esc(c.agrupador) : '<span class="gris">—</span>'}</td><td class="mono">${esc(c.codigo)}</td><td><b>${esc(c.nombre)}</b>${c.tipo === 'seleccion' ? `<br><small class="gris">${c.opciones_lista.map(esc).join(' · ')}</small>` : ''}</td>
      <td>${c.tipo === 'seleccion' ? 'Selección' : 'Texto'}</td><td>${c.alias ? esc(c.alias) : '<span class="gris">—</span>'}</td><td class="num">${c.orden}</td><td class="num">${c.usos}</td><td>${c.activo ? 'Activo' : 'Inactivo'}</td>
      <td><div class="acciones"><button class="btn chico" data-editar-campo="${i}">Editar</button><button class="btn chico peligro" data-borrar-campo="${i}">Borrar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="vacio">Todavía no hay campos adicionales.</p>';
  const formCampo = async (c = null) => {
    const abierto = modal(c ? `Editar ${c.nombre}` : 'Nuevo campo adicional', `<div class="form">
      <label class="ancho">Agrupador <small>(opcional: título bajo el que se muestra, ej. «Nivel educativo, experiencia y conocimientos requeridos»)</small><input name="agrupador" maxlength="200" value="${esc(c?.agrupador)}"></label>
      <label>Código<input name="codigo" required maxlength="40" pattern="[A-Za-z0-9_\\-]{2,40}" placeholder="NIVEL_EDU" value="${esc(c?.codigo)}"></label>
      <label>Alias <small>(opcional)</small><input name="alias" maxlength="60" value="${esc(c?.alias)}"></label>
      <label class="ancho">Nombre<input name="nombre" required maxlength="200" value="${esc(c?.nombre)}" autofocus></label>
      <label>Tipo<select name="tipo" ${c && c.usos ? 'disabled title="Ya tiene valores: no se cambia el tipo"' : ''}><option value="texto" ${c?.tipo === 'seleccion' ? '' : 'selected'}>Texto</option><option value="seleccion" ${c?.tipo === 'seleccion' ? 'selected' : ''}>Selección (una opción)</option></select></label>
      <label>Orden<input name="orden" type="number" value="${c ? c.orden : 0}"></label>
      <label class="ancho" data-si-seleccion>Opciones <small>(una por línea, mínimo 2)</small><textarea name="opciones" rows="4">${esc(c?.opciones)}</textarea></label>
      ${c ? `<label class="check ancho"><input type="checkbox" name="activo" ${c.activo ? 'checked' : ''}> Activo (aparece en el perfil de los cargos)</label>` : ''}</div>`, { aceptar: c ? 'Guardar' : 'Crear' });
    const f = $('#modalForm'), tipo = f.querySelector('[name=tipo]'), ver = () => { f.querySelector('[data-si-seleccion]').hidden = tipo.value !== 'seleccion'; };
    tipo.onchange = ver; ver();
    const v = await abierto; if (!v) return null;
    return { agrupador: v.agrupador, codigo: v.codigo, alias: v.alias, nombre: v.nombre, tipo: v.tipo || c.tipo, orden: Number(v.orden) || 0, opciones: v.opciones, ...(c ? { activo: v.activo ? 1 : 0 } : {}) };
  };
  $('#nuevoCampo').onclick = intentar(async () => { const d = await formCampo(); if (!d) return; await api('/cargo-campos', { method: 'POST', body: d }); aviso('Campo creado'); pestanaCamposCargo(); });
  $('#cuerpo').querySelectorAll('[data-editar-campo]').forEach(b => b.onclick = intentar(async () => {
    const c = campos[b.dataset.editarCampo], d = await formCampo(c); if (!d) return;
    await api('/cargo-campos/' + c.id, { method: 'PUT', body: d }); aviso('Campo actualizado'); pestanaCamposCargo();
  }));
  $('#cuerpo').querySelectorAll('[data-borrar-campo]').forEach(b => b.onclick = intentar(async () => {
    const c = campos[b.dataset.borrarCampo];
    if (!await modal('Borrar campo', `<p>Se borra el campo <b>${esc(c.nombre)}</b> de todos los cargos. Si ya tiene valores escritos, no se borra: se desactiva.</p>`, { aceptar: 'Borrar', peligro: true })) return;
    await api('/cargo-campos/' + c.id, { method: 'DELETE' }); aviso('Campo borrado'); pestanaCamposCargo();
  }));
}

// ---------- Perfil del cargo: el «manual de responsabilidades» (#/cargo/N) ----------
rutas.cargo = async function () {
  const id = location.hash.split('?')[0].split('/')[2];
  const p = await api(`/cargos/${id}/perfil`), c = p.cargo;
  const grupos = [...new Set(p.campos.map(k => k.agrupador || ''))];
  const lista = (items, vacio) => items.length ? `<ul class="lista-simple">${items.join('')}</ul>` : `<p class="sub" style="margin:0">${vacio}</p>`;
  vista.innerHTML = `
    <div class="encabezado"><div>${puede('gestionar_estructura') || puede('gestionar_cargos') ? `<a href="#/admin?v=${puede('gestionar_estructura') ? 'estructura' : 'cargos'}">← ${puede('gestionar_estructura') ? 'Estructura organizacional' : 'Cargos'}</a>` : ''}<h2 style="margin-top:6px">${esc(c.nombre)} <small class="mono gris">${esc(c.codigo)}</small>${c.activo ? '' : ' <span class="chip">Inactivo</span>'}</h2></div>
      <div class="acciones">${p.puede_editar ? '<button class="btn primario" id="editarPerfil">Editar perfil</button>' : ''}<button class="btn" data-imprimir>Imprimir</button></div></div>
    <div class="ficha">
      <div>
        <div class="tarjeta"><h3>Responsabilidad básica</h3>${c.responsabilidad ? `<p style="white-space:pre-wrap;margin:0">${esc(c.responsabilidad)}</p>` : '<p class="sub" style="margin:0">Todavía no se ha escrito.</p>'}</div>
        <div class="tarjeta"><h3>Participación en procesos</h3>
          ${lista(p.procesos.map(x => `<li><a href="#/proceso/${x.id}">${x.codigo ? `<span class="mono gris">${esc(x.codigo)}</span> ` : ''}${esc(x.nombre)}</a> <span class="gris">${esc(x.tipo)}</span></li>`), 'Las personas de este cargo no lideran ningún proceso publicado.')}
          <p class="sub" style="margin:8px 0 0">Son los procesos que lideran las personas que ocupan el cargo.</p></div>
        ${p.campos.length ? grupos.map(g => `<div class="tarjeta"><h3>${g ? esc(g) : 'Otros datos del perfil'}</h3><dl class="datos">${p.campos.filter(k => (k.agrupador || '') === g).map(k => `<dt>${esc(k.nombre)}</dt><dd>${k.valor ? esc(k.valor) : '<span class="gris">—</span>'}</dd>`).join('')}</dl></div>`).join('') : ''}
      </div>
      <div>
        <div class="tarjeta"><h3>Identificación</h3><dl class="datos">
          <dt>Cargo</dt><dd>${esc(c.nombre)}</dd><dt>Código</dt><dd class="mono">${esc(c.codigo)}</dd><dt>Área</dt><dd>${esc(c.area)}</dd>
          <dt>Reporta a</dt><dd>${c.jefe ? `<a href="#/cargo/${c.jefe.id}">${esc(c.jefe.nombre)}</a> <span class="mono gris">${esc(c.jefe.codigo)}</span>` : '<span class="gris">—</span>'}</dd></dl></div>
        <div class="tarjeta"><h3>Personas en el cargo</h3>${lista(p.personas.map(x => `<li><b>${esc(x.nombre)}</b> <span class="gris">${esc(x.correo || x.usuario)}</span></li>`), 'Vacante: nadie ocupa el cargo.')}</div>
        <div class="tarjeta"><h3>Cargos que le reportan</h3>${lista(p.reportan.map(x => `<li><a href="#/cargo/${x.id}">${esc(x.nombre)}</a> <span class="mono gris">${esc(x.codigo)}</span></li>`), 'Ningún cargo le reporta.')}</div>
      </div>
    </div>`;
  $('#editarPerfil')?.addEventListener('click', intentar(async () => {
    const campo = k => `<label class="ancho">${esc(k.nombre)}${k.agrupador ? ` <small>(${esc(k.agrupador)})</small>` : ''}${k.tipo === 'seleccion'
      ? `<select name="campo_${k.id}"><option value="">— Sin elegir —</option>${k.opciones_lista.map(o => `<option ${o === k.valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : `<input name="campo_${k.id}" maxlength="2000" value="${esc(k.valor)}">`}</label>`;
    const v = await modal(`Perfil de ${c.nombre}`, `<div class="form"><label class="ancho">Responsabilidad básica<textarea name="responsabilidad" rows="5" maxlength="5000">${esc(c.responsabilidad)}</textarea></label>
      ${p.campos.map(campo).join('')}
      ${p.campos.length ? '' : '<p class="sub ancho" style="margin:0">Aún no hay campos adicionales. Se definen en Administración → Campos del perfil.</p>'}</div>`, { aceptar: 'Guardar' });
    if (!v) return;
    const valores = Object.fromEntries(p.campos.map(k => [k.id, v['campo_' + k.id] ?? '']));
    await api(`/cargos/${c.id}/perfil`, { method: 'PUT', body: { responsabilidad: v.responsabilidad, valores } });
    aviso('Perfil actualizado'); rutas.cargo();
  }));
};
