// Armazón al estilo Almera: menú desplegable, panel lateral con pestañas y árboles,
// página de bienvenida y tablas paginadas/ordenables (como sus listados).
const guardado = { leer: k => { try { return localStorage.getItem('sgi.' + k); } catch { return null; } },
  escribir: (k, v) => { try { localStorage.setItem('sgi.' + k, v); } catch { /* sin almacenamiento */ } } };

// ---------- Menú superior ----------
const menu = $('#menu');
const cerrarMenus = () => menu.querySelectorAll('li.abierto').forEach(li => li.classList.remove('abierto'));
menu.addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a) return;
  if (a.classList.contains('tiene-sub')) {
    e.preventDefault();
    const li = a.parentElement, abrir = !li.classList.contains('abierto');
    [...li.parentElement.children].forEach(x => x !== li && x.classList.remove('abierto'));
    li.classList.toggle('abierto', abrir);
    return;
  }
  if (a.dataset.accion === 'elaborar') { e.preventDefault(); intentar(() => nuevaSolicitud())(); }
  cerrarMenus();
});
document.addEventListener('click', e => { if (!menu.contains(e.target)) cerrarMenus(); });

// ---------- Pestañas del panel lateral ----------
function mostrarPestana(tab) {
  const boton = $(`#oeste [data-tab="${tab}"]`);
  if (!boton || boton.hidden) tab = 'plan';
  document.querySelectorAll('#oeste [data-tab]').forEach(b => b.classList.toggle('activo', b.dataset.tab === tab));
  document.querySelectorAll('#oeste [data-panel]').forEach(p => p.hidden = p.dataset.panel !== tab);
  guardado.escribir('pestana', tab);
  if (tab === 'buscar') $('#buscarGlobal').q.focus();
}
document.querySelectorAll('#oeste [data-tab]').forEach(b => b.onclick = () => mostrarPestana(b.dataset.tab));

// ---------- Divisor arrastrable ----------
const fijarAncho = px => document.documentElement.style.setProperty('--ancho-oeste', Math.min(600, Math.max(220, px)) + 'px');
fijarAncho(Number(guardado.leer('ancho')) || 355);
$('#divisor').addEventListener('pointerdown', e => {
  e.preventDefault();
  const mover = ev => fijarAncho(ev.clientX);
  const soltar = ev => { removeEventListener('pointermove', mover); removeEventListener('pointerup', soltar); guardado.escribir('ancho', Math.round(ev.clientX)); };
  addEventListener('pointermove', mover); addEventListener('pointerup', soltar);
});

// ---------- Árboles del panel lateral ----------
const nodo = (texto, href, hijos, { abierto = true, cuenta } = {}) => {
  const etiqueta = `${esc(texto)}${cuenta != null ? ` <span class="cuenta${cuenta ? '' : ' cero'}">${cuenta}</span>` : ''}`;
  if (!hijos) return `<li class="hoja"><i class="ic ic-hoja"></i>${href ? `<a href="${href}">${etiqueta}</a>` : etiqueta}</li>`;
  return `<li class="rama${abierto ? ' abierta' : ''}"><span class="mas" role="button" aria-label="Abrir o cerrar"></span><i class="ic ic-carpeta"></i>${href ? `<a href="${href}">${etiqueta}</a>` : `<span>${etiqueta}</span>`}
    <ul>${hijos.join('') || '<li class="hoja vacia">Nada pendiente</li>'}</ul></li>`;
};
document.addEventListener('click', e => {
  const mas = e.target.closest('.arbol-lat .mas');
  if (mas) mas.parentElement.classList.toggle('abierta');
});

async function cargarPlan() {
  const [p, inds, aud, mec] = await Promise.all([api('/pendientes'), api('/indicadores-pendientes').catch(() => []),
    api('/auditorias-pendientes').catch(() => ({ acciones: [], evaluaciones: [] })),
    api('/mecanismos-pendientes').catch(() => ({ mecanismos: [], compromisos: [] }))]);
  const docs = p.documentos.map(d => nodo(`${d.codigo} ${d.nombre}`, `#/documento/${d.id}`));
  // Mecanismos de integración agrupados por tipo, como en Almera (Comités, Comités Primarios, Reuniones)
  const grupos = [['Comité', 'Comités'], ['Comité Primario', 'Comités Primarios'], ['Reunión', 'Reuniones']]
    .map(([t, n]) => [n, mec.mecanismos.filter(m => m.tipo === t)]).filter(([, l]) => l.length);
  $('#arbolPlan').innerHTML = nodo('Mi Plan de Trabajo', '#/inicio', [
    nodo('Mecanismos de Integración', '#/mecanismos', [
      ...grupos.map(([n, l]) => nodo(n, null, l.map(m => nodo(m.nombre, `#/mecanismo/${m.id}`)), { abierto: false, cuenta: l.length })),
      nodo('Mis compromisos', null, mec.compromisos.map(c => nodo(`${c.nombre} (${c.fecha_fin})`, `#/compromiso/${c.id}`)),
        { cuenta: mec.compromisos.length, abierto: false }),
    ]),
    nodo('Documentos por gestionar', null, docs, { cuenta: docs.length }),
    ...(esCalidad() ? [nodo('Solicitudes por resolver', '#/solicitudes', [], { cuenta: p.solicitudes, abierto: false })] : []),
    nodo('Documentos por vencer', null, p.por_vencer.map(d => nodo(`${d.codigo} ${d.nombre}`, `#/documento/${d.id}`)), { cuenta: p.por_vencer.length, abierto: false }),
    nodo('Mediciones atrasadas', null, inds.map(i => nodo(i.nombre, `#/indicador/${i.id}`)), { cuenta: inds.length, abierto: false }),
    nodo('Acciones de mejora', null, aud.acciones.map(a => nodo(`${a.codigo} ${a.tipo}`, `#/accion/${a.id}`)), { cuenta: aud.acciones.length, abierto: false }),
    nodo('Evaluaciones a mi cargo', null, aud.evaluaciones.map(e => nodo(`${e.codigo || ''} ${e.nombre}`, `#/auditoria/${e.id}`)), { cuenta: aud.evaluaciones.length, abierto: false }),
  ]);
}

function cargarSistemas() {
  $('#arbolSistemas').innerHTML = nodo('01 Sistema de Gestión de Calidad', '#/mapa',
    ['Estratégico', 'Misional', 'Apoyo'].map(c => nodo(c, null,
      cat.procesos.filter(p => p.categoria === c && !p.padre_id).map(function rama(p) {
        const hijos = cat.procesos.filter(h => h.padre_id === p.id);
        return hijos.length ? nodo(p.nombre, `#/proceso/${p.id}`, hijos.map(rama), { abierto: false }) : nodo(p.nombre, `#/proceso/${p.id}`);
      }), { abierto: false })));
}

function cargarAdmin() {
  const esAdmin = yo.rol === 'admin';
  $('#arbolAdmin').innerHTML = nodo('Administración', '#/admin', [
    nodo('Mecanismos de integración', '#/mecanismos'),
    ...(esAdmin ? [nodo('Usuarios', '#/admin?v=usuarios')] : []),
    nodo('Importar datos', '#/admin?v=importar'),
    ...(esAdmin ? [nodo('Respaldos', '#/admin?v=respaldos')] : []),
  ]);
}

// ---------- Buscador del panel lateral ----------
$('#buscarGlobal').addEventListener('submit', intentar(async e => {
  e.preventDefault();
  const q = e.target.q.value.trim(), caja = $('#resultadosBuscador');
  if (q.length < 2) { caja.innerHTML = '<p class="gris">Escribe al menos 2 caracteres.</p>'; return; }
  const res = await api('/buscar?' + qs({ q }));
  const grupos = {};
  res.resultados.forEach(x => (grupos[x.tipo] ||= []).push(x));
  const enlace = x => x.ruta === 'glosario' ? `#/glosario?id=${x.id}` : x.ruta === 'registros' ? '#/registros' : `#/${x.ruta}/${x.id}`;
  caja.innerHTML = res.resultados.length
    ? `<ul class="arbol-lat">${Object.entries(grupos).map(([t, filas]) => nodo(t, null,
        filas.map(x => nodo(`${x.codigo ? x.codigo + ' ' : ''}${x.titulo}`, enlace(x))), { cuenta: filas.length })).join('')}</ul>
       <p><a href="#/buscar?q=${encodeURIComponent(q)}">Ver resultados en detalle</a></p>`
    : `<p class="gris">No se encontró nada para «${esc(q)}».</p>`;
}));

$('#buscarTop').addEventListener('submit', e => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  if (q.length < 2) { aviso('Escribe al menos 2 caracteres para buscar', true); return; }
  location.hash = '#/buscar?q=' + encodeURIComponent(q);
});

$('#actualizarPlan').onclick = intentar(cargarPlan);
document.addEventListener('sgi:plan', () => intentar(cargarPlan)());
document.addEventListener('sgi:sesion', () => {
  const nombre = yo.nombre || yo.usuario || '';
  $('#chipIniciales').textContent = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  $('#chipNombre').textContent = nombre.split(/\s+/).slice(0, 2).join(' ');
  $('#chipRol').textContent = yo.cargo || ROLES[yo.rol] || '';
  mostrarPestana(guardado.leer('pestana') || 'plan');
  cargarSistemas(); if (esCalidad()) cargarAdmin();
  intentar(cargarPlan)();
});

// ---------- Página de inicio: saludo, buscador, lo pendiente, accesos a los módulos y lo que viene ----------
// Hexágono con degradado y un glifo blanco (el mismo lenguaje de los íconos del sistema)
const PALETAS = { estrategico: ['#6256cf', '#2a2180'], misional: ['#19b3a5', '#0b5c56'], apoyo: ['#5fb4dc', '#1f6f93'] };
const GLIFOS = {
  mapa: '<circle cx="8" cy="8" r="3.6"/><circle cx="8" cy="8" r="1.3" fill="#fff" stroke="none"/>',
  documento: '<path d="M5.4 3.8h3.5l2.2 2.2v6.2H5.4z"/><path d="M7 8.2h2.8M7 10h2.8"/>',
  tablero: '<path d="M4.4 11.6V8.6M8 11.6V5.4M11.6 11.6V7.2"/>',
  riesgo: '<path d="M8 3.8l4 7.4H4z"/><path d="M8 6.8v2"/><circle cx="8" cy="10.1" r=".5" fill="#fff" stroke="none"/>',
  gente: '<circle cx="6.2" cy="6.4" r="1.6"/><circle cx="10.2" cy="6.9" r="1.3"/><path d="M3.6 11.6c.2-1.8 1.2-2.7 2.6-2.7s2.4.9 2.6 2.7M9.4 9.4c1.4-.2 2.6.5 3 2.1"/>',
  evaluacion: '<path d="M5.2 4.2h5.6v7.6H5.2z"/><path d="M6.7 8l1.1 1.1 1.9-2.1"/>',
  glosario: '<path d="M4.4 5.1c1.4-.5 2.7-.3 3.6.5.9-.8 2.2-1 3.6-.5v6.1c-1.4-.5-2.7-.3-3.6.5-.9-.8-2.2-1-3.6-.5z"/><path d="M8 5.6v6.1"/>',
  usuario: '<circle cx="8" cy="6.1" r="1.7" fill="#fff" stroke="none"/><path d="M4.9 12c.3-2.1 1.5-3.1 3.1-3.1s2.8 1 3.1 3.1"/>',
  engrane: '<circle cx="8" cy="8" r="1.9"/><path d="M8 3.6v1.5M8 10.9v1.5M3.6 8h1.5M10.9 8h1.5M4.9 4.9l1 1M10.1 10.1l1 1M11.1 4.9l-1 1M5.9 10.1l-1 1"/>',
};
let _hx = 0;
const hexagono = (glifo, paleta = 'misional') => {
  const id = 'hx' + ++_hx, [c1, c2] = PALETAS[paleta];
  return `<svg class="hx" viewBox="0 0 16 16" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <polygon points="8,0.7 14.7,4.4 14.7,11.6 8,15.3 1.3,11.6 1.3,4.4" fill="url(#${id})" stroke="url(#${id})" stroke-width=".9" stroke-linejoin="round"/>
    <g fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${GLIFOS[glifo]}</g></svg>`;
};

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const TIPO_EVENTO = { reunion: 'Reunión', compromiso: 'Compromiso', actividad: 'Actividad', accion: 'Acción de mejora', plan: 'Plan de acción',
  evaluacion: 'Evaluación', vencimiento: 'Vencimiento', medicion: 'Medición' };

rutas.bienvenida = async function () {
  const ahora = new Date(), hora = ahora.getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const primerNombre = (yo.nombre || '').split(/\s+/)[0] || 'bienvenido';
  const fechaTexto = ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hasta = new Date(ahora); hasta.setDate(hasta.getDate() + 14);
  const ceros = (p, v) => p.catch(() => v);

  // Módulos: del color de su familia en el mapa de procesos (estratégico, misional, apoyo)
  const modulos = [
    ['Mapa de procesos', '#/mapa', 'Estratégicos, misionales y de apoyo, y sus fichas.', 'mapa', 'estrategico'],
    ['Cuadro de Mando', '#/tablero', 'Objetivos del plan estratégico e indicadores.', 'tablero', 'estrategico'],
    ['Documentos', '#/documentos', 'Listado maestro, versiones y flujo de aprobación.', 'documento', 'misional'],
    ['Mecanismos de integración', '#/mecanismos', 'Comités, reuniones, actas y compromisos.', 'gente', 'misional'],
    ['Mi página', '#/inicio', 'Mis actividades, mi calendario y mi clave.', 'usuario', 'misional'],
    ['Riesgos y controles', '#/riesgos', 'Matriz de riesgos y sus controles.', 'riesgo', 'apoyo'],
    ['Evaluaciones', '#/auditorias', 'Auditorías, hallazgos y acciones de mejora.', 'evaluacion', 'apoyo'],
    ['Glosario', '#/glosario', 'Los términos que usamos, bien definidos.', 'glosario', 'apoyo'],
    ...(esCalidad() ? [['Administración', yo.rol === 'admin' ? '#/admin?v=usuarios' : '#/admin?v=importar', 'Usuarios, cargos, procesos y copias de seguridad.', 'engrane', 'estrategico']] : []),
  ];
  vista.innerHTML = `<div class="inicio">
    <header class="ini-hero">
      <div class="ini-saludo">
        <p class="ini-fecha">${esc(fechaTexto)}</p>
        <h1>${saludo}, <span>${esc(primerNombre)}</span></h1>
        <p class="ini-rol">${esc(yo.cargo || ROLES[yo.rol] || '')}${yo.empresa ? ` en ${esc(yo.empresa)}` : ''}</p>
        <form class="ini-buscar" id="buscarInicio" role="search"><i class="ic ic-lupa"></i>
          <input name="q" type="search" placeholder="Busca un documento, un riesgo, un indicador…" aria-label="Buscar en todo el sistema" autocomplete="off">
          <button class="btn primario">Buscar</button></form>
      </div>
      <div class="ini-cifras" id="iniCifras" aria-live="polite">${Array(4).fill('<span class="cifra cargando"><b>·</b><small>Cargando</small></span>').join('')}</div>
    </header>
    <div class="ini-cuerpo">
      <section class="ini-modulos" aria-label="Módulos">
        <h2>¿A dónde vamos hoy?</h2>
        <div class="ini-rejilla">${modulos.map(([nombre, enlace, texto, glifo, familia]) => `<a class="modulo ${familia}" href="${enlace}">
          <span class="modulo-hex">${hexagono(glifo, familia)}</span><span class="modulo-tx"><b>${esc(nombre)}</b><small>${esc(texto)}</small></span>
          <i class="modulo-flecha" aria-hidden="true"></i></a>`).join('')}</div>
      </section>
      <aside class="ini-agenda" aria-label="Lo que viene">
        <div class="agenda-cab"><h2>Lo que viene</h2><a href="#/inicio">Ver calendario</a></div>
        <ul id="iniAgenda" class="agenda-lista"><li class="agenda-vacia">Buscando tus próximas fechas…</li></ul>
      </aside>
    </div>
  </div>`;

  $('#buscarInicio').addEventListener('submit', e => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q.length < 2) { aviso('Escribe al menos 2 caracteres para buscar', true); return; }
    location.hash = '#/buscar?q=' + encodeURIComponent(q);
  });
  $('#buscarInicio input').focus({ preventScroll: true });

  // Lo pendiente y la agenda llegan después, para que el inicio aparezca al instante
  const [p, inds, aud, mec, eventos] = await Promise.all([
    ceros(api('/pendientes'), { documentos: [], solicitudes: 0, por_vencer: [] }), ceros(api('/indicadores-pendientes'), []),
    ceros(api('/auditorias-pendientes'), { acciones: [], evaluaciones: [] }), ceros(api('/mecanismos-pendientes'), { mecanismos: [], compromisos: [] }),
    ceros(api('/calendario?' + qs({ desde: iso(ahora), hasta: iso(hasta) })), [])]);
  if (!$('#iniCifras')) return; // ya navegó a otra pantalla
  const cifras = [
    [p.documentos.length, 'Documentos por gestionar', '#/documentos'],
    ...(esCalidad() ? [[p.solicitudes, 'Solicitudes por resolver', '#/solicitudes']] : [[mec.compromisos.length, 'Compromisos abiertos', '#/compromisos']]),
    [p.por_vencer.length, 'Documentos por vencer', '#/documentos'],
    [inds.length + aud.acciones.length, 'Mediciones y acciones pendientes', '#/inicio'],
  ];
  const caja = $('#iniCifras');
  if (!caja) return;
  caja.innerHTML = cifras.map(([n, texto, enlace]) => `<a class="cifra${n ? ' hay' : ''}" href="${enlace}"><b>${n}</b><small>${esc(texto)}</small></a>`).join('');

  const lista = $('#iniAgenda');
  const proximos = eventos.filter(e => !e.terminada).slice(0, 6);
  lista.innerHTML = proximos.length ? proximos.map(e => {
    const [a, m, d] = e.fecha.split('-').map(Number);
    const esHoy = e.fecha === iso(ahora);
    return `<li><a class="agenda-item ${esc(e.tipo)}${e.vencida ? ' vencida' : ''}" href="${esc(e.enlace)}">
      <span class="agenda-fecha${esHoy ? ' hoy' : ''}"><b>${d}</b><small>${esHoy ? 'hoy' : MESES_CORTOS[m - 1]}</small></span>
      <span class="agenda-tx"><b>${esc(e.titulo)}</b><small>${esc(TIPO_EVENTO[e.tipo] || '')}${e.detalle ? ' · ' + esc(e.detalle) : ''}${e.hora_inicio ? ' · ' + esc(e.hora_inicio) : ''}</small></span></a></li>`;
  }).join('') : '<li class="agenda-vacia"><b>Nada para las próximas dos semanas.</b><small>Cuando te asignen reuniones, compromisos o mediciones, aparecen aquí solos.</small></li>';
};

// ---------- Tablas como los listados de Almera: 15 registros por página y columnas ordenables ----------
const TAMANOS = [15, 30, 50, 100];
function mejorarTabla(tabla) {
  if (tabla.dataset.dt || tabla.closest('dialog') || tabla.classList.contains('arbol') || !tabla.tBodies[0]) return;
  tabla.dataset.dt = '1';
  const cuerpo = tabla.tBodies[0];
  let filas = [...cuerpo.rows], pagina = 0, tamano = Number(guardado.leer('tamano')) || 15, orden = null;
  const barra = document.createElement('div'); barra.className = 'dt-pie';
  (tabla.closest('.tabla-wrap') || tabla).after(barra);
  const pintar = () => {
    const total = filas.length, paginas = Math.max(1, Math.ceil(total / tamano));
    pagina = Math.min(pagina, paginas - 1);
    filas.forEach((f, i) => { f.hidden = i < pagina * tamano || i >= (pagina + 1) * tamano; });
    if (total <= 15) { barra.hidden = true; return; }
    barra.hidden = false;
    const desde = pagina * tamano + 1, hasta = Math.min(total, (pagina + 1) * tamano);
    const nums = [...new Set([0, pagina - 1, pagina, pagina + 1, paginas - 1])].filter(n => n >= 0 && n < paginas).sort((a, b) => a - b);
    let botones = '', previo = -1;
    for (const n of nums) { if (n - previo > 1) botones += '<span class="elipsis">…</span>'; botones += `<button data-p="${n}" class="${n === pagina ? 'actual' : ''}">${n + 1}</button>`; previo = n; }
    barra.innerHTML = `<span>Mostrando registros del ${desde} al ${hasta} de un total de ${total}</span>
      <label class="dt-tam">Mostrar <select>${TAMANOS.map(t => `<option ${t === tamano ? 'selected' : ''}>${t}</option>`).join('')}</select> registros</label>
      <nav><button data-p="0" ${pagina ? '' : 'disabled'}>Primero</button><button data-p="${pagina - 1}" ${pagina ? '' : 'disabled'}>Anterior</button>
      ${botones}<button data-p="${pagina + 1}" ${pagina < paginas - 1 ? '' : 'disabled'}>Siguiente</button>
      <button data-p="${paginas - 1}" ${pagina < paginas - 1 ? '' : 'disabled'}>Último</button></nav>`;
    barra.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { pagina = Number(b.dataset.p); pintar(); });
    barra.querySelector('select').onchange = e => { tamano = Number(e.target.value); guardado.escribir('tamano', tamano); pagina = 0; pintar(); };
  };
  const texto = (f, i) => f.cells[i]?.innerText.trim() ?? '';
  const numero = s => { const n = Number(s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return s && /\d/.test(s) && !isNaN(n) ? n : null; };
  [...(tabla.tHead?.rows[0]?.cells || [])].forEach((th, i) => {
    if (!th.textContent.trim()) return;
    th.classList.add('ordenable');
    th.onclick = () => {
      const asc = !(orden?.i === i && orden.asc);
      orden = { i, asc };
      tabla.tHead.querySelectorAll('th').forEach(x => x.classList.remove('asc', 'desc'));
      th.classList.add(asc ? 'asc' : 'desc');
      filas.sort((a, b) => {
        const x = texto(a, i), y = texto(b, i), nx = numero(x), ny = numero(y);
        const c = nx != null && ny != null ? nx - ny : x.localeCompare(y, 'es', { numeric: true });
        return asc ? c : -c;
      });
      filas.forEach(f => cuerpo.appendChild(f));
      pagina = 0; pintar();
    };
  });
  pintar();
}

// ---------- Listas de selección múltiple como el "Seleccione" de Almera ----------
function mejorarMultiple(sel) {
  if (sel.dataset.ms) return;
  sel.dataset.ms = '1';
  const caja = document.createElement('div'); caja.className = 'ms';
  const boton = document.createElement('button'); boton.type = 'button'; boton.className = 'ms-boton';
  const lista = document.createElement('div'); lista.className = 'ms-lista'; lista.hidden = true;
  sel.after(caja); caja.append(sel, boton, lista); sel.hidden = true;
  const titulo = () => {
    const elegidas = [...sel.selectedOptions].map(o => o.text);
    boton.textContent = !elegidas.length ? 'Seleccione' : elegidas.length > 2 ? `${elegidas.length} seleccionadas` : elegidas.join(', ');
  };
  const pintar = () => {
    lista.innerHTML = `<div class="ms-cab"><a href="#" data-t="1">Todas</a><a href="#" data-t="0">Ninguna</a></div>` +
      [...sel.options].map((o, i) => `<label><input type="checkbox" data-i="${i}" ${o.selected ? 'checked' : ''}> ${esc(o.text)}</label>`).join('');
  };
  boton.onclick = () => { pintar(); lista.hidden = !lista.hidden; };
  lista.addEventListener('click', e => {
    const t = e.target.closest('[data-t]');
    if (t) { e.preventDefault(); [...sel.options].forEach(o => o.selected = t.dataset.t === '1'); pintar(); titulo(); }
  });
  lista.addEventListener('change', e => { sel.options[e.target.dataset.i].selected = e.target.checked; titulo(); });
  document.addEventListener('click', e => { if (!caja.contains(e.target)) lista.hidden = true; });
  sel.form?.addEventListener('reset', () => setTimeout(titulo));
  titulo();
}

new MutationObserver(() => {
  vista.querySelectorAll('table').forEach(mejorarTabla);
  vista.querySelectorAll('select[multiple]').forEach(mejorarMultiple);
}).observe(vista, { childList: true, subtree: true });
