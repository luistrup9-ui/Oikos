// SGI — Cuenta de la persona (Página individual, como «Mi Cuenta» de Almera): avisos, alerta temprana, página de inicio, firma mecánica y números de contacto.
// Usa $, api, esc, vista, yo, rutas, aviso, intentar y modal de app.js. El servidor está en php/modulos/cuenta.php.
rutas.cuenta = async function () {
  const c = await api('/cuenta'), p = c.preferencias, MAX_TEL = 10;
  let tieneFirma = c.tiene_firma;
  const filaTel = (t = {}) => `<div class="fila-tel"><input name="t_nombre" placeholder="Nombre (Celular, Casa…)" maxlength="60" required aria-label="Nombre del número" value="${esc(t.nombre)}">
    <select name="t_prefijo" aria-label="Prefijo del país">${c.prefijos.map(x => `<option value="${esc(x.prefijo)}" ${x.prefijo === (t.prefijo || '+57') ? 'selected' : ''}>${esc(x.prefijo)} ${esc(x.pais)}</option>`).join('')}</select>
    <input name="t_numero" inputmode="tel" placeholder="Número" required aria-label="Número" value="${esc(t.numero)}">
    <button type="button" class="btn chico peligro" data-quitar-tel aria-label="Quitar este número">×</button></div>`;
  vista.innerHTML = `
    <div class="encabezado"><h2>Mi cuenta</h2><div class="acciones"><button class="btn" data-ir="#/inicio">‹ Volver a mi página</button></div></div>
    <form id="formCuenta" class="cuenta-rejilla">
      <div class="cuenta-col">
        <section class="tarjeta"><h3>Notificaciones</h3>
          <div class="fila-aviso"><label class="check"><input type="checkbox" name="notif_atraso" ${p.notif_atraso ? 'checked' : ''}> Notificar atraso de una actividad</label>
            <label class="en-linea"><input type="number" name="dias_atraso" min="1" max="90" required value="${p.dias_atraso}" aria-label="Días después del atraso"> días después</label></div>
          <div class="fila-aviso"><label class="check"><input type="checkbox" name="notif_por_terminar" ${p.notif_por_terminar ? 'checked' : ''}> Notificar actividades por terminar</label>
            <label class="en-linea"><input type="number" name="dias_por_terminar" min="1" max="90" required value="${p.dias_por_terminar}" aria-label="Días antes de terminar"> días antes</label></div>
          <p class="sub" style="margin:12px 0 0">Aquí queda guardado cuándo quieres que te avisen. El envío de estos avisos por correo se activa aparte; mientras tanto no te llegan correos.</p></section>
        <section class="tarjeta"><h3>Personalizar</h3><div class="form">
          <label class="ancho">Alerta temprana <small>(días hacia adelante que se muestran en «Lo que viene», en la página de inicio)</small>
            <input type="number" name="alerta_dias" min="1" max="90" required value="${p.alerta_dias}"></label>
          <label class="ancho">Página de inicio <small>(la que se abre al ingresar a OIKOS)</small>
            <select name="pagina_inicio">${c.paginas.map(x => `<option value="${esc(x.id)}" ${x.id === p.pagina_inicio ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label></div></section></div>
      <div class="cuenta-col">
        <section class="tarjeta"><h3>Firma mecánica</h3>
          <div class="firma-vista" id="firmaVista"></div>
          <div class="acciones" style="margin-top:12px"><label class="btn" for="archivoFirma"><i class="ic ic-documento"></i> Subir firma</label>
            <input type="file" id="archivoFirma" accept="image/png,image/jpeg" hidden><button type="button" class="btn peligro" id="quitarFirma">Quitar</button></div>
          <p class="sub" style="margin:12px 0 0">Imagen PNG o JPG de hasta 1 MB. Se guarda en cuanto la subes (no hace falta pulsar Aceptar) y solo la ves tú.</p></section>
        <section class="tarjeta"><h3>Números de contacto</h3>
          <div id="listaTel"></div><p class="vacio" id="sinTel" hidden style="padding:10px 0">Todavía no has agregado ningún número.</p>
          <div class="acciones" style="margin-top:8px"><button type="button" class="btn" id="agregarTel">+ Agregar número</button></div></section></div>
      <div class="acciones cuenta-pie"><button type="button" class="btn" id="cancelarCuenta">Cancelar</button><button class="btn primario">Aceptar</button></div></form>`;

  const lista = $('#listaTel'), f = $('#formCuenta');
  const actualizarTel = () => { const n = lista.children.length; $('#sinTel').hidden = n > 0; $('#agregarTel').disabled = n >= MAX_TEL; $('#agregarTel').title = n >= MAX_TEL ? `Puedes guardar hasta ${MAX_TEL} números` : ''; };
  c.telefonos.forEach(t => lista.insertAdjacentHTML('beforeend', filaTel(t))); actualizarTel();
  $('#agregarTel').onclick = () => { lista.insertAdjacentHTML('beforeend', filaTel()); actualizarTel(); lista.lastElementChild.querySelector('input').focus(); };
  lista.addEventListener('click', e => { const b = e.target.closest('[data-quitar-tel]'); if (b) { b.closest('.fila-tel').remove(); actualizarTel(); } });

  const pintarFirma = () => {
    $('#firmaVista').innerHTML = tieneFirma ? `<img src="api/cuenta/firma?v=${Date.now()}" alt="Tu firma mecánica">` : '<span class="gris">Todavía no has subido tu firma</span>';
    $('#quitarFirma').hidden = !tieneFirma;
  };
  pintarFirma();
  $('#archivoFirma').onchange = intentar(async e => {
    const archivo = e.target.files[0]; e.target.value = '';
    if (!archivo) return;
    if (archivo.size > 1024 * 1024) { aviso('La imagen de la firma no puede pasar de 1 MB', true); return; }
    const datos = new FormData(); datos.append('archivo', archivo);
    await api('/cuenta/firma', { method: 'POST', body: datos });
    tieneFirma = true; pintarFirma(); aviso('Firma guardada');
  });
  $('#quitarFirma').onclick = intentar(async () => {
    if (!await modal('Quitar la firma', '<p>Se borra tu firma mecánica. Puedes subir otra cuando quieras.</p>', { aceptar: 'Quitar', peligro: true })) return;
    await api('/cuenta/firma', { method: 'DELETE' });
    tieneFirma = false; pintarFirma(); aviso('Firma quitada');
  });

  $('#cancelarCuenta').onclick = () => { location.hash = '#/inicio'; };
  f.addEventListener('submit', intentar(async e => {
    e.preventDefault();
    const telefonos = [...lista.querySelectorAll('.fila-tel')].map(x => ({ nombre: x.querySelector('[name=t_nombre]').value, prefijo: x.querySelector('[name=t_prefijo]').value, numero: x.querySelector('[name=t_numero]').value }));
    const r = await api('/cuenta', { method: 'PUT', body: { notif_atraso: f.notif_atraso.checked, dias_atraso: f.dias_atraso.value, notif_por_terminar: f.notif_por_terminar.checked,
      dias_por_terminar: f.dias_por_terminar.value, alerta_dias: f.alerta_dias.value, pagina_inicio: f.pagina_inicio.value, telefonos } });
    yo.pagina_inicio = r.preferencias.pagina_inicio; yo.alerta_dias = r.preferencias.alerta_dias;   // «Lo que viene» y la página de inicio ya usan lo nuevo
    aviso('Cuenta actualizada');
  }));
};
