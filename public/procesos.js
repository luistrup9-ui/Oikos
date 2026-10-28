// Ficha de caracterización de procesos y subprocesos (como la de Almera)
const CICLO_NOMBRE = { P: 'Planear', H: 'Hacer', V: 'Verificar', A: 'Actuar' };
const raices = () => cat.procesos.filter(p => !p.padre_id);
const hijosDe = id => cat.procesos.filter(p => p.padre_id === id);

rutas.proceso = async function (id) {
  let t = parametro('t') || 'general';
  const p = await api('/procesos/' + id);
  if (p.propio === false && !['general', 'historial'].includes(t)) t = 'general'; // de un proceso ajeno solo se ve la ficha y su historial
  const base = `#/proceso/${id}`;
  let cuerpo = '';
  if (t === 'general') {
    const seccion = (titulo, html, clave) => `<section class="seccion-proc" data-clave="${esc(clave || titulo)}">
      <h3 class="agrupador" role="button" tabindex="0"><span class="flecha-sec"></span>${esc(titulo)}</h3><div class="contenido-sec">${html}</div></section>`;
    const es = p.entradas_salidas;
    cuerpo = `<table class="cab-proceso"><tr><td class="cab-logo"><b>${esc(yo.empresa || '')}</b></td>
        <td class="cab-centro"><b>${esc(yo.empresa || '')}</b><br>${p.ruta.length ? `Proceso: ${esc(p.ruta[0].nombre)}<br>${esc(p.tipo)}: ${esc(p.nombre)}` : `Proceso: ${esc(p.nombre)}`}</td>
        <td class="cab-datos"><table><tr><th>Código</th><td>${esc(p.codigo || '—')}</td></tr><tr><th>Fecha</th><td>${esc(p.fecha || '—')}</td></tr>
          <tr><th>Versión</th><td>Vigente: ${p.version}</td></tr></table></td></tr></table>
      <div class="franja-cat">${['Estratégico', 'Misional', 'Apoyo'].map(c => `<span class="${c === p.categoria ? 'activa' : ''}">${c}</span>`).join('')}</div>
      ${p.secciones.map(s => seccion(s.titulo, `<div class="pre">${esc(s.texto || '—')}</div>`)).join('')}
      ${p.indicadores.length ? seccion('Indicadores', `<table class="arbol"><thead><tr><th>Código</th><th>Nombre</th><th>Frecuencia</th><th>Meta</th></tr></thead><tbody>
        ${p.indicadores.map(i => `<tr><td class="mono">${esc(i.codigo)}</td><td><a href="#/indicador/${i.id}">${esc(i.nombre)}</a></td><td>${esc(i.frecuencia)}</td>
          <td class="num">${esc(i.meta)} ${esc(i.unidad)}</td></tr>`).join('')}</tbody></table>`) : ''}
      ${p.hijos.length ? seccion('Subprocesos', `<ul class="lista-hijos">${p.hijos.map(h => `<li><a href="#/proceso/${h.id}">${h.codigo ? esc(h.codigo) + ' - ' : ''}${esc(h.nombre)}</a>
        <span class="gris">${esc(h.tipo)}</span></li>`).join('')}</ul>`) : ''}
      ${seccion('Documentación', documentacion(p))}
      ${es.length ? seccion('Entradas y salidas', `<div class="tabla-wrap"><table class="arbol tabla-es"><thead><tr><th>Proveedor</th><th>Entrada</th>
          <th>${es.some(e => e.subproceso_id) ? 'Actividades / Subprocesos' : 'Actividades'}</th><th>Salida</th><th>Cliente</th></tr></thead><tbody>
        ${es.map(e => { const n = Math.max(e.entradas.length, e.salidas.length, 1); return Array.from({ length: n }, (_, k) => `<tr class="${k ? 'cont' : ''}">
          <td>${esc(e.entradas[k]?.proveedor || '')}</td><td>${esc(e.entradas[k]?.entrada || '')}</td>
          ${k ? '' : `<td rowspan="${n}" class="actividad">${e.subproceso_id ? `<a href="#/proceso/${e.subproceso_id}">${esc(e.actividad)}</a>` : esc(e.actividad)}
            ${e.ciclo ? `<br><b class="ciclo ${e.ciclo}" title="${CICLO_NOMBRE[e.ciclo]}">(${e.ciclo})</b>` : ''}</td>`}
          <td>${esc(e.salidas[k]?.salida || '')}</td><td>${esc(e.salidas[k]?.cliente || '')}</td></tr>`).join(''); }).join('')}</tbody></table></div>`) : ''}`;
  } else if (t === 'riesgos') {
    const l = await api('/riesgos?' + qs({ proceso: id }));
    cuerpo = l.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Riesgo</th><th>Tipo</th><th>Riesgo absoluto</th><th>Riesgo residual</th></tr></thead><tbody>
      ${l.map(x => `<tr class="click" onclick="location.hash='#/riesgo/${x.id}'"><td class="mono">${esc(x.codigo)}</td><td>${esc(x.nombre)}</td><td>${esc(x.tipo)}</td>
        <td><span class="zona ${esc(x.zona)}">${esc(x.zona)}</span></td><td><span class="zona ${esc(x.zona_residual)}">${esc(x.zona_residual)}</span></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">Este proceso no tiene riesgos registrados.</p>';
  } else if (t === 'medicion') {
    const l = await api('/indicadores?' + qs({ proceso: id }));
    const color = { verde: '#008000', amarillo: '#c99700', rojo: '#f00', sin_dato: '#808080' };
    cuerpo = l.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Indicador</th><th>Frecuencia</th><th>Último valor</th><th>Meta</th><th></th></tr></thead><tbody>
      ${l.map(i => `<tr class="click" onclick="location.hash='#/indicador/${i.id}'"><td class="mono">${esc(i.codigo)}</td><td>${esc(i.nombre)}</td><td>${esc(i.frecuencia)}</td>
        <td class="num" style="color:${color[i.semaforo]}">${fmt(i.ultimo?.valor, i.unidad)}</td><td class="num">${fmt(i.meta, i.unidad)}</td>
        <td><i class="punto" style="background:${color[i.semaforo]}"></i></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">Este proceso no tiene indicadores.</p>';
  } else if (t === 'mejora') {
    const l = await api('/hallazgos?' + qs({ proceso: id }));
    cuerpo = l.length ? `<div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Tipo</th><th>Origen</th><th>Descripción</th><th>Acciones</th></tr></thead><tbody>
      ${l.map(h => `<tr class="click" onclick="location.hash='#/hallazgo/${h.id}'"><td class="mono">${esc(h.codigo)}</td><td>${esc(h.tipo)}</td><td>${esc(h.origen)}</td>
        <td>${esc(String(h.descripcion || '').slice(0, 140))}</td><td>${h.acciones_cerradas}/${h.total_acciones} cerradas</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">Este proceso no tiene planes de mejora.</p>';
  } else {
    const l = await api(`/procesos/${id}/historial`);
    cuerpo = `<h3>Versiones</h3><div class="tabla-wrap"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Usuario</th><th>Modificación</th><th></th></tr></thead><tbody>
      ${l.map(v => `<tr><td>${v.version}${v.actual ? ' <span class="chip">Versión actual</span>' : ''}</td><td>${esc(String(v.fecha).slice(0, 16))}</td>
        <td>${esc(v.usuario || '—')}</td><td>${esc(v.comentario || '')}</td><td><button class="btn chico" data-ver="${v.id}">Ver</button></td></tr>`).join('')}</tbody></table></div>
      ${l.length ? '' : '<p class="vacio">Sin versiones registradas.</p>'}<div id="versionVista"></div>`;
  }
  vista.innerHTML = `<div class="ruta-proc">${p.ruta.map(x => `» <a href="#/proceso/${x.id}">${esc(x.nombre)}</a> `).join('')}» <b>${esc(p.nombre)}</b></div>
    <div class="controles"><button class="btn" onclick="location.hash='#/mapa'">Mapa de procesos</button>
      ${p.puede_editar ? '<button class="btn" id="editarProc">Editar</button>' : ''}
      <span class="espacio"></span><button class="btn icono-solo" title="Imprimir / PDF" onclick="window.print()"><i class="ic ic-imprimir"></i></button></div>
    ${pestanasPagina(p.propio !== false ? [['general', 'General'], ['riesgos', 'Matriz de Riesgos'], ['medicion', 'Medición'], ['mejora', 'Planes de mejora'], ['historial', 'Historial']]
      : [['general', 'General'], ['historial', 'Historial']], t, base)}
    <div class="tarjeta ficha-proceso">${cuerpo}</div>`;
  vista.querySelectorAll('.agrupador').forEach(h => h.onclick = () => h.parentElement.classList.toggle('cerrada'));
  vista.querySelectorAll('[data-ver]').forEach(b => b.onclick = intentar(async () => {
    const v = await api(`/procesos/${id}/historial/${b.dataset.ver}`);
    $('#versionVista').innerHTML = `<div class="tarjeta"><h3>Versión ${v.version} · ${esc(String(v.fecha).slice(0, 16))}</h3>
      ${(v.contenido.secciones || []).map(s => `<h4>${esc(s.titulo)}</h4><div class="pre">${esc(s.texto || '')}</div>`).join('')}</div>`;
  }));
  $('#editarProc')?.addEventListener('click', () => editarProceso(p));
};

function documentacion(p) {
  const grupos = {};
  for (const d of p.documentos) (grupos[d.clase || 'Otros'] ||= []).push(`<li><a href="#/documento/${d.id}"><span class="mono">${esc(d.codigo)}</span> ${esc(d.nombre)}</a> <span class="gris">v${d.version}</span></li>`);
  const ref = {};
  for (const d of p.documentacion) (ref[d.clase || 'Otros'] ||= []).push(`<li>${esc(d.nombre)}</li>`);
  const lista = g => Object.entries(g).map(([c, l]) => `<li class="grupo-doc"><b>${esc(c)}</b> <span class="gris">(${l.length})</span><ul>${l.join('')}</ul></li>`).join('');
  return `${p.documentos.length ? `<p><b>Documentos vigentes en el sistema</b> (${p.documentos.length})</p><ul class="lista-docs">${lista(grupos)}</ul>`
      : '<p class="gris">No hay documentos vigentes de este proceso en el listado maestro.</p>'}
    ${p.documentacion.length ? `<details><summary>Documentos relacionados en Almera (${p.documentacion.length})</summary><ul class="lista-docs">${lista(ref)}</ul></details>` : ''}`;
}

// Editor de la ficha: datos, secciones (título + texto) y entradas/salidas
const editarProceso = intentar(async p => {
  const bloqueo = esCalidad() ? '' : 'readonly'; // quien lidera el proceso edita el contenido, no su identidad
  const filaSec = (s = {}) => `<div class="fila-sec"><input name="sec_titulo" placeholder="Título (ej. Objetivo)" value="${esc(s.titulo)}">
    <textarea name="sec_texto" rows="3">${esc(s.texto)}</textarea><button type="button" class="btn chico peligro quitar">Quitar</button></div>`;
  const filaEs = (e = {}) => `<div class="fila-es"><input name="es_actividad" placeholder="Actividad" value="${esc(e.actividad)}">
    <select name="es_ciclo"><option value="">—</option>${['P', 'H', 'V', 'A'].map(c => `<option ${c === e.ciclo ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <textarea name="es_entradas" rows="2" placeholder="Proveedor | Entrada (una por línea)">${esc((e.entradas || []).map(x => `${x.proveedor || ''} | ${x.entrada || ''}`).join('\n'))}</textarea>
    <textarea name="es_salidas" rows="2" placeholder="Salida | Cliente (una por línea)">${esc((e.salidas || []).map(x => `${x.salida || ''} | ${x.cliente || ''}`).join('\n'))}</textarea>
    <input type="hidden" name="es_sub" value="${esc(e.subproceso_id || '')}"><button type="button" class="btn chico peligro quitar">Quitar</button></div>`;
  const dlgPromesa = modal(`Editar ${p.tipo.toLowerCase()}: ${p.nombre}`, `<div class="form">
    <label class="ancho">Nombre<input name="nombre" required value="${esc(p.nombre)}" ${bloqueo}></label>
    <label>Código<input name="codigo" value="${esc(p.codigo)}" ${bloqueo}></label>
    <label>Fecha<input type="date" name="fecha" value="${esc(p.fecha)}"></label>
    <label>Tipo<select name="tipo" ${bloqueo ? 'disabled' : ''}>${['Proceso', 'Subproceso', 'Procedimiento'].map(x => `<option ${x === p.tipo ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
    ${bloqueo ? '<p class="sub" style="margin:0">El nombre, el código y el tipo los define Calidad. Aquí editas el contenido de la ficha.</p>' : ''}
    <h3>Secciones</h3><div id="secciones">${p.secciones.map(filaSec).join('')}</div><button type="button" class="btn chico" id="masSec">Agregar sección</button>
    <h3>Entradas y salidas</h3><div id="filasEs">${p.entradas_salidas.map(filaEs).join('')}</div><button type="button" class="btn chico" id="masEs">Agregar actividad</button>
    <label class="ancho">Modificación (queda en el historial)<input name="comentario" required placeholder="Qué cambió y por qué"></label>`);
  const f = $('#modalForm');
  f.addEventListener('click', e => { if (e.target.classList.contains('quitar')) e.target.parentElement.remove(); });
  $('#masSec').onclick = () => $('#secciones').insertAdjacentHTML('beforeend', filaSec());
  $('#masEs').onclick = () => $('#filasEs').insertAdjacentHTML('beforeend', filaEs());
  const v = await dlgPromesa;
  if (!v) return;
  const arr = x => [].concat(x ?? []);
  const pares = (txt, a, b) => String(txt || '').split('\n').map(l => l.split('|').map(s => s.trim())).filter(x => x[0] || x[1]).map(([x, y]) => ({ [a]: x || '', [b]: y || '' }));
  const titulos = arr(v.sec_titulo), textos = arr(v.sec_texto);
  const acts = arr(v.es_actividad), ciclos = arr(v.es_ciclo), ent = arr(v.es_entradas), sal = arr(v.es_salidas), subs = arr(v.es_sub);
  await api('/procesos/' + p.id, { method: 'PUT', body: { nombre: v.nombre, codigo: v.codigo, fecha: v.fecha, tipo: v.tipo, comentario: v.comentario,
    secciones: titulos.map((t, i) => ({ titulo: t, texto: textos[i] })),
    entradas_salidas: acts.map((a, i) => ({ actividad: a, ciclo: ciclos[i] || null, subproceso_id: Number(subs[i]) || null,
      entradas: pares(ent[i], 'proveedor', 'entrada'), salidas: pares(sal[i], 'salida', 'cliente') })) } });
  aviso('Ficha guardada: nueva versión'); enrutar();
});
