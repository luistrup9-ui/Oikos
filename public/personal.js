// SGI — página Personal: perfil, calendario de actividades y "Mi SGI" (el plan de trabajo de siempre) y cambio de clave.
// Usa $, api, esc, vista, yo, cat, rutas, ROLES, hora12, fechaLarga y pedirCambioClave de los otros módulos.
(() => {
  const previa = rutas.inicio; // "Mi plan de trabajo", con las secciones que le añaden los demás módulos
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const TIPOS = { // [nombre en la leyenda, color]
    reunion: ['Reuniones', '#008080'], compromiso: ['Compromisos', '#d97706'], actividad: ['Actividades', '#6256cf'],
    accion: ['Acciones de mejora', '#c23b3b'], plan: ['Planes de acción', '#1f6f93'], evaluacion: ['Evaluaciones', '#8a6d00'],
    vencimiento: ['Vencimientos', '#b3261e'], medicion: ['Mediciones', '#566874'] };
  const MAX_POR_DIA = 3;

  const pad = n => String(n).padStart(2, '0');
  const aFecha = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const deFecha = s => new Date(s + 'T12:00');
  const sumar = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const inicioSemana = d => sumar(d, -d.getDay()); // la semana va de domingo a sábado, como en Almera
  const mayus = s => s.charAt(0).toUpperCase() + s.slice(1);
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('sgi-calendario') || '{}'); } catch { return {}; } })();

  // Rango de fechas que se pide al servidor según la vista (el mes incluye los días de las semanas de los bordes)
  function rango(vista, ancla) {
    if (vista === 'dia') return [ancla, ancla];
    if (vista === 'semana') { const i = inicioSemana(ancla); return [i, sumar(i, 6)]; }
    const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1), ultimo = new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0);
    return [inicioSemana(primero), sumar(inicioSemana(ultimo), 6)];
  }
  function titulo(vista, ancla) {
    if (vista === 'mes') return `${MESES[ancla.getMonth()]} ${ancla.getFullYear()}`;
    if (vista === 'dia') return mayus(fechaLarga(aFecha(ancla)));
    const [a, b] = rango('semana', ancla);
    return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} de ${MESES[a.getMonth()].toLowerCase()} de ${a.getFullYear()}`
      : `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3).toLowerCase()} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3).toLowerCase()} ${b.getFullYear()}`;
  }

  const hora = e => e.hora_inicio ? hora12(e.hora_inicio) + ' ' : '';
  const nota = e => `${TIPOS[e.tipo][0]}: ${e.titulo}${e.detalle ? ' · ' + e.detalle : ''}${e.terminada ? ' · terminada' : e.vencida ? ' · vencida' : ''}`;
  const evento = (e, completo = false) => `<a class="cal-ev${e.terminada ? ' hecho' : ''}${e.vencida ? ' vencida' : ''}" style="--c:${TIPOS[e.tipo][1]}" href="${esc(e.enlace)}" title="${esc(nota(e))}">
    <b>${esc(hora(e))}${esc(e.titulo)}</b>${completo && e.detalle ? `<small>${esc(e.detalle)}</small>` : ''}</a>`;

  function mes(ancla, porDia) {
    const [desde, hasta] = rango('mes', ancla), hoy = aFecha(new Date()), semanas = [];
    for (let d = desde; d <= hasta; d = sumar(d, 7)) {
      const dias = Array.from({ length: 7 }, (_, i) => {
        const x = sumar(d, i), f = aFecha(x), lista = porDia.get(f) || [];
        return `<div class="cal-dia${x.getMonth() !== ancla.getMonth() ? ' otro' : ''}${f === hoy ? ' hoy' : ''}" role="gridcell">
          <button class="cal-num" data-dia="${f}" aria-label="Ver el ${x.getDate()} de ${MESES[x.getMonth()].toLowerCase()}">${x.getDate()}</button>
          ${lista.slice(0, MAX_POR_DIA).map(e => evento(e)).join('')}
          ${lista.length > MAX_POR_DIA ? `<button class="cal-mas" data-dia="${f}">+${lista.length - MAX_POR_DIA} más</button>` : ''}</div>`;
      }).join('');
      semanas.push(`<div class="cal-sem" role="row">${dias}</div>`);
    }
    return `<div class="cal-mes" role="grid"><div class="cal-cab">${DIAS.map(d => `<div>${d}</div>`).join('')}</div>${semanas.join('')}</div>`;
  }
  function semana(ancla, porDia) {
    const inicio = inicioSemana(ancla), hoy = aFecha(new Date());
    return `<div class="cal-semana">${Array.from({ length: 7 }, (_, i) => {
      const x = sumar(inicio, i), f = aFecha(x), lista = porDia.get(f) || [];
      return `<section class="cal-col${f === hoy ? ' hoy' : ''}"><h4><button data-dia="${f}">${DIAS[i]} ${x.getDate()}</button></h4>
        ${lista.length ? lista.map(e => evento(e, true)).join('') : '<p class="cal-vacio">Sin actividades</p>'}</section>`;
    }).join('')}</div>`;
  }
  function dia(ancla, porDia) {
    const lista = porDia.get(aFecha(ancla)) || [];
    return `<div class="cal-lista">${lista.length ? lista.map(e => `<a class="cal-fila${e.terminada ? ' hecho' : ''}${e.vencida ? ' vencida' : ''}" style="--c:${TIPOS[e.tipo][1]}" href="${esc(e.enlace)}">
      <span class="cal-hora">${e.hora_inicio ? esc(hora12(e.hora_inicio)) + (e.hora_fin ? ' – ' + esc(hora12(e.hora_fin)) : '') : 'Todo el día'}</span>
      <span class="cal-texto"><b>${esc(e.titulo)}</b>${e.detalle ? `<small>${esc(e.detalle)}</small>` : ''}</span>
      <span class="cal-tipo">${TIPOS[e.tipo][0]}${e.terminada ? ' · terminada' : e.vencida ? ' · vencida' : ''}</span></a>`).join('')
      : '<p class="cal-vacio grande">No tienes actividades este día.</p>'}</div>`;
  }

  async function calendario(contenedor) {
    const est = { vista: ['mes', 'semana', 'dia'].includes(guardado.vista) ? guardado.vista : 'mes', ancla: new Date(),
      terminadas: guardado.terminadas !== false, mecanismos: guardado.mecanismos !== false };
    const cache = new Map(); let peticion = 0;
    const recordar = () => { try { localStorage.setItem('sgi-calendario', JSON.stringify({ vista: est.vista, terminadas: est.terminadas, mecanismos: est.mecanismos })); } catch { /* sin almacenamiento */ } };

    contenedor.innerHTML = `<div class="cal-filtros">
        <label class="check"><input type="checkbox" data-filtro="terminadas"${est.terminadas ? ' checked' : ''}> Incluir actividades terminadas</label>
        <label class="check"><input type="checkbox" data-filtro="mecanismos"${est.mecanismos ? ' checked' : ''}> Incluir mecanismos de integración</label></div>
      <div class="cal-barra">
        <div class="cal-nav"><button class="btn" data-accion="ant" aria-label="Anterior">‹</button><button class="btn" data-accion="sig" aria-label="Siguiente">›</button><button class="btn" data-accion="hoy">Hoy</button></div>
        <h3 class="cal-titulo" id="calTitulo" aria-live="polite"></h3>
        <div class="cal-vistas" role="group" aria-label="Vista del calendario">${[['mes', 'Mes'], ['semana', 'Semana'], ['dia', 'Día']].map(([v, t]) => `<button data-vista="${v}">${t}</button>`).join('')}</div></div>
      <ul class="cal-leyenda">${Object.values(TIPOS).map(([n, c]) => `<li style="--c:${c}">${n}</li>`).join('')}<li class="cal-nota">Tachado: terminada · Rojo: vencida</li></ul>
      <div class="cal-cuerpo" id="calCuerpo"></div>`;
    const cuerpo = $('#calCuerpo', contenedor);

    async function pintar() {
      const [desde, hasta] = rango(est.vista, est.ancla), clave = aFecha(desde) + '|' + aFecha(hasta), mia = ++peticion;
      $('#calTitulo', contenedor).textContent = titulo(est.vista, est.ancla);
      contenedor.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('activo', b.dataset.vista === est.vista));
      if (!cache.has(clave)) {
        cuerpo.innerHTML = '<p class="cal-vacio grande">Cargando actividades…</p>';
        try { cache.set(clave, await api(`/calendario?desde=${aFecha(desde)}&hasta=${aFecha(hasta)}`)); }
        catch (e) { if (mia === peticion) cuerpo.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
      }
      if (mia !== peticion) return; // llegó una respuesta vieja: ya se pidió otra vista
      const porDia = new Map();
      for (const e of cache.get(clave)) {
        if (!est.terminadas && e.terminada) continue;
        if (!est.mecanismos && e.tipo === 'reunion') continue;
        (porDia.get(e.fecha) || porDia.set(e.fecha, []).get(e.fecha)).push(e);
      }
      const aviso = porDia.size ? '' : '<p class="cal-aviso">No tienes actividades en este periodo. El calendario se llena solo cuando te asignan reuniones, compromisos, actividades o mediciones de tu proceso.</p>';
      cuerpo.innerHTML = aviso + (est.vista === 'mes' ? mes(est.ancla, porDia) : est.vista === 'semana' ? semana(est.ancla, porDia) : dia(est.ancla, porDia));
    }
    const mover = n => {
      if (est.vista === 'mes') est.ancla = new Date(est.ancla.getFullYear(), est.ancla.getMonth() + n, 1);
      else est.ancla = sumar(est.ancla, n * (est.vista === 'semana' ? 7 : 1));
      pintar();
    };
    contenedor.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.accion === 'ant') mover(-1);
      else if (b.dataset.accion === 'sig') mover(1);
      else if (b.dataset.accion === 'hoy') { est.ancla = new Date(); pintar(); }
      else if (b.dataset.vista) { est.vista = b.dataset.vista; recordar(); pintar(); }
      else if (b.dataset.dia) { est.ancla = deFecha(b.dataset.dia); est.vista = 'dia'; recordar(); pintar(); }
    });
    contenedor.addEventListener('change', ev => {
      const f = ev.target.dataset.filtro; if (!f) return;
      est[f] = ev.target.checked; recordar(); pintar();
    });
    await pintar();
  }

  rutas.inicio = async function () {
    await previa(); // arma "Mi plan de trabajo" en #vista; se mueve tal cual a la pestaña "Mi SGI"
    const sgi = document.createElement('div'); sgi.className = 'pers-panel'; sgi.dataset.panel = 'sgi'; sgi.hidden = true;
    sgi.append(...vista.childNodes);
    const iniciales = (yo.nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    const proceso = cat.procesos.find(p => p.id === yo.proceso_id)?.nombre;
    vista.innerHTML = `<header class="pers-cab">
        <div class="pers-avatar" aria-hidden="true">${esc(iniciales)}</div>
        <div class="pers-datos"><h2>${esc(yo.nombre)}</h2>
          <p class="pers-cargo"><i class="ic ic-usuario"></i><span>${esc(yo.cargo || ROLES[yo.rol] || '')}</span>${proceso ? `<em>/ ${esc(proceso)}</em>` : ''}</p>
          <p class="pers-sub">${esc(ROLES[yo.rol] || '')}${yo.empresa ? ' en ' + esc(yo.empresa) : ''}</p></div>
        <button class="btn" id="cambiarClave" title="Cambiar la clave con la que ingresas"><i class="ic ic-llave"></i> Cambiar mi clave</button></header>
      <div class="tabs" role="tablist"><button class="activo" role="tab" data-pestana="actividades">Actividades</button><button role="tab" data-pestana="sgi">Mi SGI</button></div>
      <div class="pers-panel" data-panel="actividades"></div>`;
    vista.append(sgi);
    $('#cambiarClave').onclick = () => pedirCambioClave(false);
    $('.tabs', vista).addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      vista.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('activo', x === b));
      vista.querySelectorAll('.pers-panel').forEach(p => p.hidden = p.dataset.panel !== b.dataset.pestana);
    });
    await calendario($('[data-panel="actividades"]', vista));
  };
})();
