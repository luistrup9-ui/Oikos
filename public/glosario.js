// Glosario de términos y buscador global
const LETRAS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

rutas.glosario = async function () {
  vista.innerHTML = `
    <div class="encabezado"><h2>Glosario de términos</h2>
      ${esCalidad() ? '<button class="btn primario" id="nuevoTer">Nuevo término</button>' : ''}</div>
    <form class="tarjeta filtros" id="filtros">
      <label>Buscar<input name="texto" placeholder="Término o descripción"></label>
      <label>Glosario<select name="glosario" id="selGlosario"><option value="">Todos</option></select></label>
      <input type="hidden" name="letra">
      <div class="acciones"><button class="btn primario">Filtrar</button></div></form>
    <div class="tarjeta letras" id="letras"><button class="btn chico activo" data-l="">Todas</button>
      ${LETRAS.map(l => `<button class="btn chico" data-l="${l}">${l}</button>`).join('')}</div>
    <div id="resultado"></div>`;
  let lista = [];
  const form = $('#filtros');
  const formTer = (t = {}, glosarios = []) => `<div class="form">
    <label class="ancho">Término<input name="termino" required value="${esc(t.termino)}"></label>
    <label>Glosario<input name="glosario" list="listaGlosarios" placeholder="General" value="${esc(t.glosario)}">
      <datalist id="listaGlosarios">${glosarios.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
    <label>Fuente<input name="fuente" placeholder="Ej: ISO 9000:2015, 3.4.1" value="${esc(t.fuente)}"></label>
    <label class="ancho">Descripción<textarea name="descripcion" rows="5" required>${esc(t.descripcion)}</textarea></label></div>`;
  let glosarios = [];
  const editar = intentar(async t => {
    const v = await modal(t ? 'Editar término' : 'Nuevo término', formTer(t || {}, glosarios));
    if (!v) return;
    await api('/glosario' + (t ? '/' + t.id : ''), { method: t ? 'PUT' : 'POST', body: v }); aviso('Guardado'); cargar();
  });
  const cargar = intentar(async () => {
    const res = await api('/glosario?' + qs(valoresForm(form)));
    lista = res.terminos; glosarios = res.glosarios;
    const sel = $('#selGlosario'), actual = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + glosarios.map(g => `<option ${g === actual ? 'selected' : ''}>${esc(g)}</option>`).join('');
    $('#resultado').innerHTML = lista.length ? `<div class="tabla-wrap"><table><thead><tr><th>Término</th><th>Descripción</th>
      <th>Glosario</th><th>Fuente</th>${esCalidad() ? '<th></th>' : ''}</tr></thead><tbody>
      ${lista.map((t, i) => `<tr id="termino-${t.id}"><td><b>${esc(t.termino)}</b></td><td class="texto-largo">${esc(t.descripcion)}</td>
        <td>${esc(t.glosario)}</td><td>${esc(t.fuente)}</td>
        ${esCalidad() ? `<td><div class="acciones"><button class="btn chico" data-ed="${i}">Editar</button>
          <button class="btn chico peligro" data-del="${t.id}">Quitar</button></div></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<p class="vacio">No hay términos con estos criterios.</p>';
    vista.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(lista[b.dataset.ed]));
    vista.querySelectorAll('[data-del]').forEach(b => b.onclick = intentar(async () => {
      if (!await modal('Quitar término', '<p>¿Seguro que quieres quitarlo del glosario?</p>', { aceptar: 'Quitar', peligro: true })) return;
      await api('/glosario/' + b.dataset.del, { method: 'DELETE' }); cargar();
    }));
    const marcado = new URLSearchParams(location.hash.split('?')[1]).get('id');
    if (marcado) $('#termino-' + marcado)?.classList.add('resaltado');
  });
  vista.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
    form.letra.value = b.dataset.l;
    vista.querySelectorAll('[data-l]').forEach(x => x.classList.toggle('activo', x === b));
    cargar();
  });
  form.addEventListener('submit', e => { e.preventDefault(); cargar(); });
  $('#nuevoTer')?.addEventListener('click', () => editar(null));
  cargar();
};

// ---------- Buscador global ----------
rutas.buscar = async function () {
  const q = new URLSearchParams(location.hash.split('?')[1]).get('q') || '';
  vista.innerHTML = `
    <div class="encabezado"><h2>Buscar</h2></div>
    <form class="tarjeta filtros" id="filtros">
      <label class="ancho">Qué buscas<input name="q" value="${esc(q)}" placeholder="Código, nombre, término…" autofocus></label>
      <div class="acciones"><button class="btn primario">Buscar</button></div></form>
    <div id="resultado">${q ? '' : '<p class="vacio">Busca en documentos, registros, glosario, riesgos, controles, indicadores, evaluaciones y acciones de mejora.</p>'}</div>`;
  $('#filtros').addEventListener('submit', e => {
    e.preventDefault();
    location.hash = '#/buscar?q=' + encodeURIComponent($('#filtros').q.value.trim());
  });
  if (!q) return;
  const res = await api('/buscar?' + qs({ q }));
  const grupos = {};
  res.resultados.forEach(x => (grupos[x.tipo] ||= []).push(x));
  const enlace = x => x.ruta === 'glosario' ? `#/glosario?id=${x.id}` : x.ruta === 'registros' ? '#/registros' : `#/${x.ruta}/${x.id}`;
  $('#resultado').innerHTML = res.resultados.length
    ? `<p class="sub">${res.resultados.length} resultado(s) para «${esc(res.texto)}»</p>` + Object.entries(grupos).map(([tipo, filas]) => `
      <div class="tarjeta"><h3>${esc(tipo)} <span class="chip">${filas.length}</span></h3>
        <div class="tabla-wrap"><table><thead><tr><th>Código</th><th>Nombre</th><th>Proceso / grupo</th><th>Detalle</th></tr></thead><tbody>
        ${filas.map(x => `<tr class="click" onclick="location.hash='${enlace(x)}'"><td class="mono">${esc(x.codigo || '—')}</td>
          <td>${esc(x.titulo)}</td><td>${esc(x.proceso || '—')}</td><td>${esc(String(x.detalle ?? '').slice(0, 120))}</td></tr>`).join('')}
        </tbody></table></div></div>`).join('')
    : `<p class="vacio">No se encontró nada para «${esc(res.texto)}».</p>`;
};
