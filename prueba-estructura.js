// Prueba de la estructura organizacional (áreas y tipos de área) y del perfil del cargo (responsabilidad, campos adicionales, participación en procesos):
// node prueba-estructura.js (con el servidor corriendo y la base limpia)
// Base de prueba: 4 personas (admin, gestor = Gestor de Calidad, lider = Líder de Producción, colaborador) y cargos de ejemplo en las áreas GG, GC, GAF, GCAL y GPR.
const B = 'http://localhost:3100/api';
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { texto: t }; }
  return Array.isArray(d) ? Object.assign(d, { status: r.status }) : { status: r.status, ...d };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle).slice(0, 500)); } };

(async () => {
  for (const [q, u, c] of [['admin', 'admin', 'admin123'], ['gestor', 'gestor', 'gestor123'], ['lider', 'lider', 'lider123'], ['colab', 'colaborador', 'colaborador123']]) await llamar(q, '/login', { usuario: u, clave: c });

  // ================= Áreas =================
  let areas = await llamar('colab', '/areas');
  let cargos = await llamar('colab', '/cargos');
  const siglas = [...new Set(cargos.map(c => c.area_sigla))];
  esperar('Cualquier persona ve las áreas: hay una por cada sigla que usan los cargos', areas.status === 200 && areas.length === siglas.length && siglas.every(s => areas.some(a => a.sigla === s)), [areas.length, siglas]);
  esperar('Todos los cargos ya apuntan a su área (area_id) y el nombre del área coincide', cargos.every(c => areas.find(a => a.id === c.area_id)?.sigla === c.area_sigla && areas.find(a => a.id === c.area_id)?.nombre === c.area), cargos.filter(c => !c.area_id).length);
  const GG = areas.find(a => a.sigla === 'GG'), GC = areas.find(a => a.sigla === 'GC');
  esperar('Cada área cuenta sus cargos y sus personas', GG.cargos === cargos.filter(c => c.area_sigla === 'GG' && c.activo).length && typeof GG.personas === 'number', GG);

  let r = await llamar('colab', '/areas', { nombre: 'Gerencia de Innovación', sigla: 'INN' });
  esperar('Un Colaborador no crea áreas', r.status === 403 && /privilegio/i.test(r.error), r);
  r = await llamar('gestor', '/areas', { nombre: 'Gerencia de Innovación', sigla: 'INN' });
  esperar('Ni el Gestor de Calidad (la estructura no es de Calidad)', r.status === 403, r);
  r = await llamar('admin', '/areas', { nombre: 'Gerencia de Innovación', sigla: 'inn', padre_id: GG.id });
  const INN = r.id;
  esperar('El administrador crea un área (la sigla queda en mayúsculas) dentro de Gerencia General', r.status === 200 && INN, r);
  areas = await llamar('admin', '/areas');
  esperar('El área nueva sale colgando de Gerencia General', areas.find(a => a.id === INN).padre_id === GG.id && areas.find(a => a.id === INN).sigla === 'INN', areas.find(a => a.id === INN));
  esperar('Sigla repetida, sigla mal escrita y nombre vacío se rechazan', (await llamar('admin', '/areas', { nombre: 'Otra', sigla: 'INN' })).status === 400
    && (await llamar('admin', '/areas', { nombre: 'Otra', sigla: 'I1' })).status === 400 && (await llamar('admin', '/areas', { nombre: ' ', sigla: 'OTR' })).status === 400
    && (await llamar('admin', '/areas', { nombre: 'Otra', sigla: 'OTR', padre_id: 99999 })).status === 404, null);
  const DPR = (await llamar('admin', '/areas', { nombre: 'Dirección de Proyectos', sigla: 'DPR', padre_id: INN })).id;
  r = await llamar('admin', `/areas/${GG.id}`, { padre_id: DPR }, 'PUT');
  esperar('Un área no puede depender de una de sus áreas internas (ciclo)', r.status === 400 && /ciclo|depender/i.test(r.error), r);
  r = await llamar('admin', `/areas/${INN}`, { padre_id: INN }, 'PUT');
  esperar('Ni de sí misma', r.status === 400, r);

  // Tipos de área
  r = await llamar('colab', '/tipos-area', { nombre: 'Gerencia' });
  esperar('Un Colaborador no crea tipos de área', r.status === 403, r);
  const TG = (await llamar('admin', '/tipos-area', { nombre: 'Gerencia' })).id, TD = (await llamar('admin', '/tipos-area', { nombre: 'Dirección' })).id;
  esperar('El administrador crea tipos de área; no se repiten', TG && TD && (await llamar('admin', '/tipos-area', { nombre: 'gerencia' })).status === 400, null);
  r = await llamar('admin', `/areas/${INN}`, { tipo_area_id: TG }, 'PUT');
  areas = await llamar('colab', '/areas');
  esperar('Un área puede tener tipo; editar solo el tipo conserva lo demás', r.status === 200 && areas.find(a => a.id === INN).tipo === 'Gerencia' && areas.find(a => a.id === INN).padre_id === GG.id && areas.find(a => a.id === INN).sigla === 'INN', areas.find(a => a.id === INN));
  const ts = await llamar('colab', '/tipos-area');
  esperar('La lista de tipos dice cuántas áreas usa cada uno', ts.find(t => t.id === TG).areas === 1 && ts.find(t => t.id === TD).areas === 0, ts);
  r = await llamar('admin', `/tipos-area/${TG}`, null, 'DELETE');
  esperar('No se borra un tipo que usa un área', r.status === 400 && /lo usan 1 área/.test(r.error), r);
  r = await llamar('admin', `/tipos-area/${TD}`, null, 'DELETE');
  esperar('Uno sin usar sí se borra', r.status === 200 && !(await llamar('colab', '/tipos-area')).some(t => t.id === TD), r);

  // Renombrar y borrar
  const cargoGG = cargos.find(c => c.area_sigla === 'GG');
  r = await llamar('admin', `/areas/${GG.id}`, { sigla: 'GGX' }, 'PUT');
  esperar('La sigla de un área con cargos no se cambia (el código de sus cargos depende de ella)', r.status === 400 && /sigla/.test(r.error), r);
  r = await llamar('admin', `/areas/${GG.id}`, { nombre: 'Gerencia General y Estrategia' }, 'PUT');
  cargos = await llamar('colab', '/cargos');
  esperar('Renombrar un área cambia el nombre que muestran sus cargos, sin cambiar sus códigos', r.status === 200 && cargos.filter(c => c.area_sigla === 'GG').every(c => c.area === 'Gerencia General y Estrategia') && cargos.find(c => c.id === cargoGG.id).codigo === cargoGG.codigo, cargos.find(c => c.id === cargoGG.id));
  r = await llamar('admin', `/areas/${INN}`, { sigla: 'INO' }, 'PUT');
  esperar('La sigla de un área sin cargos sí se puede cambiar', r.status === 200 && (await llamar('colab', '/areas')).find(a => a.id === INN).sigla === 'INO', r);
  r = await llamar('admin', `/areas/${GG.id}`, null, 'DELETE');
  esperar('No se borra un área con cargos', r.status === 400 && /cargo/.test(r.error), r);
  r = await llamar('admin', `/areas/${INN}`, null, 'DELETE');
  esperar('Ni un área de la que dependen otras', r.status === 400 && /dependen 1 área/.test(r.error), r);
  r = await llamar('admin', `/areas/${DPR}`, null, 'DELETE');
  esperar('Un área vacía y sin áreas internas sí se borra', r.status === 200 && !(await llamar('colab', '/areas')).some(a => a.id === DPR), r);

  // ---- Los cargos usan las áreas ----
  r = await llamar('admin', '/cargos', { area_id: GC.id, nombre: 'Cargo de prueba comercial' });
  const idNuevo = r.id; let cn = (await llamar('colab', '/cargos')).find(c => c.id === idNuevo);
  esperar('Crear un cargo eligiendo el área: toma su sigla y su nombre', r.status === 200 && cn.area_id === GC.id && cn.area_sigla === 'GC' && cn.area === 'Gerencia Comercial' && /^CAR-GC-\d\d$/.test(r.codigo), [r, cn]);
  r = await llamar('admin', '/cargos', { area_sigla: 'GC', area: 'Nombre que se ignora', nombre: 'Cargo por sigla' });
  cn = (await llamar('colab', '/cargos')).find(c => c.id === r.id);
  esperar('La forma anterior (sigla y nombre) sigue funcionando y usa el área que ya existe', r.status === 200 && cn.area_id === GC.id && cn.area === 'Gerencia Comercial', cn);
  r = await llamar('admin', '/cargos', { area_sigla: 'NUE', area: 'Área nueva al vuelo', nombre: 'Cargo del área nueva' });
  esperar('Con una sigla nueva, el administrador crea el área al vuelo', r.status === 200 && (await llamar('colab', '/areas')).some(a => a.sigla === 'NUE' && a.nombre === 'Área nueva al vuelo'), r);
  const idMover = r.id;
  r = await llamar('admin', `/cargos/${idMover}`, { nombre: 'Cargo del área nueva' }, 'PUT');
  esperar('Editar un cargo sin decir el área lo deja donde está', r.status === 200 && (await llamar('colab', '/cargos')).find(c => c.id === idMover).area_sigla === 'NUE', r);
  r = await llamar('admin', `/cargos/${idMover}`, { area_id: GC.id, nombre: 'Cargo del área nueva' }, 'PUT');
  cn = (await llamar('colab', '/cargos')).find(c => c.id === idMover);
  esperar('Mover un cargo a otra área cambia su área y su código (CAR-GC-…)', r.status === 200 && cn.area_id === GC.id && /^CAR-GC-/.test(cn.codigo), cn);
  esperar('Un área que no existe se rechaza', (await llamar('admin', '/cargos', { area_id: 99999, nombre: 'X' })).status === 400, null);

  // ================= Perfil del cargo =================
  const jefe = cargos.find(c => c.id === cargoGG.jefe_id) || cargos.find(c => c.jefe_id === null);
  const conReportes = cargos.find(c => cargos.some(x => x.jefe_id === c.id));
  let pf = await llamar('colab', `/cargos/${conReportes.id}/perfil`);
  esperar('Cualquier persona ve el perfil: datos del cargo, personas, a quién reporta y quiénes le reportan', pf.status === 200 && pf.cargo.codigo === conReportes.codigo && pf.reportan.length === cargos.filter(x => x.jefe_id === conReportes.id && x.activo).length && pf.puede_editar === false && Array.isArray(pf.campos) && pf.campos.length === 0, pf);
  const sub = cargos.find(c => c.jefe_id === conReportes.id);
  pf = await llamar('colab', `/cargos/${sub.id}/perfil`);
  esperar('Un cargo con jefe muestra a quién reporta', pf.cargo.jefe?.id === conReportes.id && pf.cargo.jefe.codigo === conReportes.codigo, pf.cargo);
  esperar('El perfil de un cargo que no existe da 404', (await llamar('colab', '/cargos/99999/perfil')).status === 404, null);
  r = await llamar('colab', `/cargos/${sub.id}/perfil`, { responsabilidad: 'x' }, 'PUT');
  esperar('Un Colaborador no edita el perfil', r.status === 403, r);
  r = await llamar('gestor', `/cargos/${sub.id}/perfil`, { responsabilidad: 'x' }, 'PUT');
  esperar('Ni el Gestor de Calidad', r.status === 403, r);
  r = await llamar('admin', `/cargos/${sub.id}/perfil`, { responsabilidad: 'Responder por la gestión comercial del área.' }, 'PUT');
  pf = await llamar('colab', `/cargos/${sub.id}/perfil`);
  esperar('El administrador escribe la responsabilidad básica y todos la ven', r.status === 200 && pf.cargo.responsabilidad === 'Responder por la gestión comercial del área.', pf.cargo);
  esperar('Más de 5000 letras se rechaza', (await llamar('admin', `/cargos/${sub.id}/perfil`, { responsabilidad: 'a'.repeat(5001) }, 'PUT')).status === 400, null);

  // Campos adicionales
  r = await llamar('colab', '/cargo-campos');
  esperar('La lista de campos (parametrización) no es para un Colaborador', r.status === 403, r);
  r = await llamar('colab', '/cargo-campos', { codigo: 'EXP', nombre: 'Experiencia', tipo: 'texto' });
  esperar('Un Colaborador no crea campos', r.status === 403, r);
  const NIV = (await llamar('admin', '/cargo-campos', { codigo: 'NIVEL_EDU', nombre: 'Nivel educativo', agrupador: 'Nivel educativo, experiencia y conocimientos requeridos', tipo: 'seleccion', opciones: 'Bachiller\nTécnico\nProfesional', alias: 'nivel' })).id;
  const EXP = (await llamar('admin', '/cargo-campos', { codigo: 'EXP', nombre: 'Experiencia', agrupador: 'Nivel educativo, experiencia y conocimientos requeridos', tipo: 'texto', orden: 2 })).id;
  esperar('El administrador crea un campo de selección y uno de texto', NIV && EXP, null);
  esperar('Código repetido, código mal escrito, tipo inválido y selección con una sola opción se rechazan', (await llamar('admin', '/cargo-campos', { codigo: 'EXP', nombre: 'Otra', tipo: 'texto' })).status === 400
    && (await llamar('admin', '/cargo-campos', { codigo: 'a b', nombre: 'Otra', tipo: 'texto' })).status === 400 && (await llamar('admin', '/cargo-campos', { codigo: 'OTRO', nombre: 'Otra', tipo: 'numero' })).status === 400
    && (await llamar('admin', '/cargo-campos', { codigo: 'OTRO', nombre: 'Otra', tipo: 'seleccion', opciones: 'Solo una' })).status === 400, null);
  pf = await llamar('colab', `/cargos/${sub.id}/perfil`);
  esperar('El perfil trae los campos activos con sus opciones', pf.campos.length === 2 && pf.campos.find(c => c.id === NIV).opciones_lista.join('|') === 'Bachiller|Técnico|Profesional' && pf.campos.every(c => c.valor === null), pf.campos);
  r = await llamar('admin', `/cargos/${sub.id}/perfil`, { valores: { [NIV]: 'Técnico', [EXP]: '3 años en ventas' } }, 'PUT');
  pf = await llamar('colab', `/cargos/${sub.id}/perfil`);
  esperar('Se llenan los valores del perfil y todos los ven', r.status === 200 && pf.campos.find(c => c.id === NIV).valor === 'Técnico' && pf.campos.find(c => c.id === EXP).valor === '3 años en ventas' && pf.cargo.responsabilidad.startsWith('Responder'), pf.campos);
  esperar('Guardar valores no borra la responsabilidad ya escrita (y al revés)', pf.cargo.responsabilidad === 'Responder por la gestión comercial del área.', pf.cargo);
  r = await llamar('admin', `/cargos/${sub.id}/perfil`, { valores: { [NIV]: 'Doctorado' } }, 'PUT');
  esperar('En un campo de selección solo vale una de sus opciones', r.status === 400 && /opciones/.test(r.error), r);
  esperar('Un campo que no existe se rechaza', (await llamar('admin', `/cargos/${sub.id}/perfil`, { valores: { 99999: 'x' } }, 'PUT')).status === 400, null);
  r = await llamar('admin', `/cargos/${sub.id}/perfil`, { valores: { [EXP]: '' } }, 'PUT');
  pf = await llamar('colab', `/cargos/${sub.id}/perfil`);
  esperar('Dejar un valor vacío lo borra', r.status === 200 && pf.campos.find(c => c.id === EXP).valor === null && pf.campos.find(c => c.id === NIV).valor === 'Técnico', pf.campos);
  await llamar('admin', `/cargos/${sub.id}/perfil`, { valores: { [EXP]: '3 años en ventas' } }, 'PUT');
  r = await llamar('admin', `/cargo-campos/${EXP}`, null, 'DELETE');
  esperar('Un campo con valores no se borra: se desactiva para no perder lo escrito', r.status === 400 && /desactívalo/.test(r.error), r);
  r = await llamar('admin', `/cargo-campos/${NIV}`, { tipo: 'texto' }, 'PUT');
  esperar('Y no se le cambia el tipo', r.status === 400 && /tipo/.test(r.error), r);
  r = await llamar('admin', `/cargo-campos/${EXP}`, { activo: 0 }, 'PUT');
  pf = await llamar('colab', `/cargos/${sub.id}/perfil`);
  const lc = await llamar('admin', '/cargo-campos');
  esperar('Un campo desactivado deja de salir en el perfil, pero sigue en la parametrización con sus usos', r.status === 200 && pf.campos.length === 1 && lc.find(c => c.id === EXP).activo === 0 && lc.find(c => c.id === EXP).usos === 1, [pf.campos.length, lc.find(c => c.id === EXP)]);
  r = await llamar('admin', `/cargos/${sub.id}/perfil`, { valores: { [EXP]: 'otro' } }, 'PUT');
  esperar('Y no se le puede escribir', r.status === 400, r);
  const nuevoSin = await llamar('admin', '/cargo-campos', { codigo: 'SIN_USO', nombre: 'Campo sin usar', tipo: 'texto' }), SIN = nuevoSin.id;
  r = await llamar('admin', `/cargo-campos/${SIN}`, null, 'DELETE');
  esperar('Un campo sin valores sí se borra', SIN && r.status === 200 && !(await llamar('admin', '/cargo-campos')).some(c => c.id === SIN), [nuevoSin, r]);

  // Participación en procesos: los que lideran las personas que ocupan el cargo
  const us = await llamar('admin', '/usuarios'), lid = us.find(u => u.usuario === 'lider');
  await llamar('admin', `/cargos/${sub.id}/personas`, { usuarios: [lid.id] }, 'PUT');
  pf = await llamar('colab', `/cargos/${sub.id}/perfil`);
  esperar('La participación en procesos sale de los procesos que lideran las personas del cargo', pf.personas.length === 1 && pf.personas[0].id === lid.id && pf.procesos.length >= 1 && pf.procesos.every(p => lid.procesos.includes(p.id)), [pf.personas, pf.procesos]);
  const retirado = pf.procesos[0];
  const fila = (await llamar('admin', '/procesos-lideres')).find(p => p.id === retirado.id);
  r = await llamar('admin', `/procesos/${retirado.id}/identidad`, { nombre: fila.nombre, codigo: fila.codigo || '', tipo: fila.tipo, ...(fila.padre_id ? { padre_id: fila.padre_id } : { categoria: fila.categoria }), publicado: 0 }, 'PUT');
  esperar('(el administrador retira ese proceso)', r.status === 200 && r.ok, r);
  pf = await llamar('colab', `/cargos/${sub.id}/perfil`);
  esperar('Un proceso que se retira (No publicado) deja de figurar en la participación', !pf.procesos.some(p => p.id === retirado.id), pf.procesos);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nLa estructura organizacional y el perfil del cargo funcionan');
  process.exit(fallos ? 1 : 0);
})();
