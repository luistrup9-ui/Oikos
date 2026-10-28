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
  const etiqueta = `${esc(texto)}${cuenta != null ? ` <span class="cuenta">(${cuenta})</span>` : ''}`;
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
      ...grupos.map(([n, l]) => nodo(n, null, l.map(m => nodo(m.nombre, `#/mecanismo/${m.id}`)))),
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

$('#actualizarPlan').onclick = intentar(cargarPlan);
document.addEventListener('sgi:plan', () => intentar(cargarPlan)());
document.addEventListener('sgi:sesion', () => {
  mostrarPestana(guardado.leer('pestana') || 'plan');
  cargarSistemas(); if (esCalidad()) cargarAdmin();
  intentar(cargarPlan)();
});

// ---------- Página de inicio (como la bienvenida de Almera) ----------
rutas.bienvenida = async function () {
  const tile = (titulo, enlace, texto, dibujo) => `<a class="tile" href="${enlace}"><span class="tile-titulo">${titulo}</span>
    <span class="tile-cuerpo">${dibujo}</span><span class="tile-pie">${texto}</span></a>`;
  vista.innerHTML = `<div class="tiles">
    ${tile('La empresa', '#/mapa', 'Mapa de procesos', `<img class="tile-logo" src="oikos/oikos-isotipo.svg" alt=""><b class="tile-empresa">${esc(yo.empresa || 'SGI')}</b>`)}
    ${tile('Mapa de procesos', '#/mapa', 'Mapa de procesos', '<span class="hex hex-mapa"></span>')}
    ${tile('Página individual', '#/inicio', 'Página individual', '<span class="hex hex-usuario"></span>')}
    ${tile('Cuadro de Mando', '#/tablero', 'Cuadro de Mando', '<span class="hex hex-mando"></span>')}
  </div>`;
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
