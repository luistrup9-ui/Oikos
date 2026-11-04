// Prueba de grupos de usuarios y privilegios: node prueba-privilegios.js (con el servidor corriendo y la base limpia)
// Los privilegios SUMAN a los roles: sin ellos todo sigue como siempre; con ellos, una persona sin permiso de administración puede hacer una función concreta.
// Base de prueba: admin (id 1), gestor = Gestor de Calidad (2), lider = Líder de Producción (3) y colaborador (4, rol consulta).
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
const dar = (clave, usuarios = [], grupos = []) => llamar('admin', `/privilegios/${clave}`, { usuarios, grupos }, 'PUT');

(async () => {
  for (const [q, u, c] of [['admin', 'admin', 'admin123'], ['gestor', 'gestor', 'gestor123'], ['lider', 'lider', 'lider123'], ['colab', 'colaborador', 'colaborador123']]) await llamar(q, '/login', { usuario: u, clave: c });
  const ADMIN = 1, LIDER = 3, COLAB = 4;
  const GC = (await llamar('admin', '/areas')).find(a => a.sigla === 'GC');

  // ================= El catálogo =================
  let r = await llamar('gestor', '/privilegios');
  esperar('Solo el administrador ve los privilegios (el Gestor de Calidad no)', r.status === 403, r);
  r = await llamar('lider', '/privilegios');
  esperar('Ni un Líder', r.status === 403, r);
  const cat = await llamar('admin', '/privilegios');
  esperar('El catálogo trae 8 privilegios: 4 delegables y 4 solo del super usuario', cat.length === 8 && cat.filter(p => p.delegable).length === 4 && cat.filter(p => !p.delegable).length === 4 && cat.every(p => p.super_usuario === true), cat.map(p => p.clave));
  esperar('Los delegables son estructura, cargos, grupos y procesos', ['gestionar_estructura', 'gestionar_cargos', 'gestionar_grupos', 'gestionar_procesos'].every(k => cat.find(p => p.clave === k)?.delegable === true), cat.map(p => [p.clave, p.delegable]));
  esperar('Al principio nadie tiene privilegios otorgados', cat.every(p => p.usuarios.length === 0 && p.grupos.length === 0), cat);
  let yo = await llamar('admin', '/yo');
  esperar('El administrador tiene todos los privilegios en /yo', yo.privilegios.length === 8, yo.privilegios);
  yo = await llamar('colab', '/yo');
  esperar('Un Colaborador no tiene ninguno', Array.isArray(yo.privilegios) && yo.privilegios.length === 0, yo.privilegios);

  // ================= Sin privilegios todo sigue igual =================
  const cerrado = async () => ({
    cargo: (await llamar('colab', '/cargos', { area_id: GC.id, nombre: 'X' })).status, area: (await llamar('colab', '/areas', { nombre: 'X', sigla: 'XX' })).status,
    grupo: (await llamar('colab', '/grupos', { nombre: 'X' })).status, proceso: (await llamar('colab', '/procesos', { nombre: 'X', categoria: 'Apoyo' })).status,
    personas: (await llamar('colab', '/personas')).status, usuarios: (await llamar('colab', '/usuarios')).status });
  esperar('Un Colaborador sin privilegios: no crea cargos, áreas, grupos ni procesos y no ve la lista de personas', JSON.stringify(await cerrado()) === JSON.stringify({ cargo: 403, area: 403, grupo: 403, proceso: 403, personas: 403, usuarios: 403 }), await cerrado());

  // ================= Otorgar =================
  esperar('Un privilegio inexistente da 404', (await dar('inventado', [COLAB])).status === 404, null);
  r = await dar('gestionar_usuarios', [COLAB]);
  esperar('Un privilegio solo del super usuario no se puede otorgar', r.status === 400 && /super usuario/.test(r.error), r);
  esperar('Al administrador no se le otorga nada (ya lo tiene todo)', (await dar('gestionar_cargos', [ADMIN])).status === 400, null);
  esperar('Una persona que no existe se rechaza', (await dar('gestionar_cargos', [99999])).status === 400, null);
  esperar('Un grupo que no existe se rechaza', (await dar('gestionar_cargos', [], [99999])).status === 400, null);
  r = await llamar('gestor', '/privilegios/gestionar_cargos', { usuarios: [COLAB] }, 'PUT');
  esperar('El Gestor de Calidad no otorga privilegios', r.status === 403, r);

  r = await dar('gestionar_cargos', [COLAB]);
  yo = await llamar('colab', '/yo');
  esperar('Se le otorga «Gestionar cargos» al Colaborador y /yo lo muestra enseguida (misma sesión)', r.ok && yo.privilegios.join() === 'gestionar_cargos', [r, yo.privilegios]);
  r = await llamar('colab', '/cargos', { area_id: GC.id, nombre: 'Cargo creado por delegación' });
  esperar('Ahora crea cargos', r.status === 200 && r.id, r);
  const cargoNuevo = r.id;
  esperar('Y edita el perfil del cargo y define sus campos adicionales', (await llamar('colab', `/cargos/${cargoNuevo}/perfil`, { responsabilidad: 'Hecho por delegación' }, 'PUT')).status === 200
    && (await llamar('colab', '/cargo-campos', { codigo: 'DELEGADO', nombre: 'Campo creado por delegación', tipo: 'texto' })).status === 200, null);
  esperar('Puede ver la lista de personas para asignar quién ocupa el cargo (sin claves)', await (async () => { const p = await llamar('colab', '/personas'); return p.status === 200 && p.length >= 4 && p.every(x => !('clave' in x) && !('reinicio_solicitado' in x)); })(), await llamar('colab', '/personas'));
  r = await llamar('colab', `/cargos/${cargoNuevo}/personas`, { usuarios: [COLAB] }, 'PUT');
  esperar('Y asignar personas al cargo', r.status === 200, r);
  esperar('Pero lo demás sigue cerrado: áreas, grupos, procesos, usuarios y otorgar privilegios', (await llamar('colab', '/areas', { nombre: 'X', sigla: 'XX' })).status === 403 && (await llamar('colab', '/grupos', { nombre: 'X' })).status === 403
    && (await llamar('colab', '/procesos', { nombre: 'X', categoria: 'Apoyo' })).status === 403 && (await llamar('colab', '/usuarios')).status === 403
    && (await llamar('colab', '/privilegios/gestionar_cargos', { usuarios: [COLAB, LIDER] }, 'PUT')).status === 403 && (await llamar('colab', '/privilegios')).status === 403, null);
  esperar('Una cuenta de otra persona no recibe nada: el Líder sigue sin poder crear cargos', (await llamar('lider', '/cargos', { area_id: GC.id, nombre: 'X' })).status === 403, null);
  const cat2 = await llamar('admin', '/privilegios');
  esperar('El administrador ve a quién se lo dio', cat2.find(p => p.clave === 'gestionar_cargos').usuarios.map(u => u.id).join() === String(COLAB), cat2.find(p => p.clave === 'gestionar_cargos'));

  // ================= Quitar: vale al instante =================
  r = await dar('gestionar_cargos', []);
  esperar('Al quitarle el privilegio deja de poder, en la misma sesión y al momento', r.ok && (await llamar('colab', '/cargos', { area_id: GC.id, nombre: 'X' })).status === 403 && (await llamar('colab', '/yo')).privilegios.length === 0, r);

  // ================= Grupos =================
  esperar('Un Colaborador sin privilegios no ve los grupos', (await llamar('colab', '/grupos')).status === 403, null);
  r = await llamar('admin', '/grupos', { nombre: 'Equipo de estructura' });
  const G1 = r.id;
  esperar('El administrador crea un grupo', r.status === 200 && G1, r);
  esperar('El nombre no se repite ni queda vacío', (await llamar('admin', '/grupos', { nombre: 'equipo de estructura' })).status === 400 && (await llamar('admin', '/grupos', { nombre: ' ' })).status === 400, null);
  r = await llamar('admin', `/grupos/${G1}/miembros`, { miembros: [{ id: COLAB }] }, 'PUT');
  let g = await llamar('admin', `/grupos/${G1}`);
  esperar('Se le ponen miembros al grupo', r.status === 200 && g.miembros.length === 1 && g.miembros[0].id === COLAB && g.miembros[0].administrador === 0, g.miembros);
  esperar('Un miembro desactivado o inexistente se rechaza', (await llamar('admin', `/grupos/${G1}/miembros`, { miembros: [{ id: 99999 }] }, 'PUT')).status === 400, null);
  r = await dar('gestionar_estructura', [], [G1]);
  yo = await llamar('colab', '/yo');
  esperar('Al darle un privilegio al grupo, sus miembros lo reciben', r.ok && yo.privilegios.join() === 'gestionar_estructura', [r, yo.privilegios]);
  r = await llamar('colab', '/areas', { nombre: 'Área creada por grupo', sigla: 'ACG' });
  esperar('El miembro crea áreas gracias al grupo', r.status === 200 && r.id, r);
  const areaGrupo = r.id;
  await llamar('admin', `/grupos/${G1}/miembros`, { miembros: [] }, 'PUT');
  esperar('Si sale del grupo, pierde el privilegio al instante', (await llamar('colab', '/areas', { nombre: 'Otra', sigla: 'OTR' })).status === 403 && (await llamar('colab', '/yo')).privilegios.length === 0, null);
  g = await llamar('admin', '/grupos');
  esperar('La lista de grupos cuenta miembros y privilegios', g.find(x => x.id === G1).miembros === 0 && g.find(x => x.id === G1).privilegios === 1, g.find(x => x.id === G1));
  await llamar('admin', `/grupos/${G1}/miembros`, { miembros: [{ id: COLAB }] }, 'PUT');
  r = await llamar('admin', `/grupos/${G1}`, null, 'DELETE');
  const c3 = await llamar('admin', '/privilegios');
  esperar('Borrar el grupo borra también los privilegios que daba', r.status === 200 && c3.find(p => p.clave === 'gestionar_estructura').grupos.length === 0 && (await llamar('colab', '/areas', { nombre: 'Otra', sigla: 'OTR' })).status === 403, c3.find(p => p.clave === 'gestionar_estructura'));

  // ================= Quien gestiona grupos no se da privilegios a sí mismo =================
  const G2 = (await llamar('admin', '/grupos', { nombre: 'Grupo con privilegios' })).id;
  await dar('gestionar_estructura', [], [G2]);
  await dar('gestionar_grupos', [COLAB]);
  esperar('Con «Gestionar grupos» el Colaborador ve los grupos y crea uno nuevo', (await llamar('colab', '/grupos')).status === 200 && (await llamar('colab', '/grupos', { nombre: 'Grupo del colaborador' })).status === 200, null);
  r = await llamar('colab', `/grupos/${G2}/miembros`, { miembros: [{ id: COLAB }] }, 'PUT');
  esperar('Pero no puede meterse en un grupo que da privilegios', r.status === 403 && /da privilegios/.test(r.error), r);
  esperar('Ni renombrarlo ni borrarlo', (await llamar('colab', `/grupos/${G2}`, { nombre: 'Otro nombre' }, 'PUT')).status === 403 && (await llamar('colab', `/grupos/${G2}`, null, 'DELETE')).status === 403, null);
  esperar('Ni otorgar privilegios', (await llamar('colab', '/privilegios/gestionar_estructura', { grupos: [G2], usuarios: [COLAB] }, 'PUT')).status === 403, null);
  const G3 = (await llamar('colab', '/grupos', { nombre: 'Grupo sin privilegios' })).id;
  r = await llamar('colab', `/grupos/${G3}/miembros`, { miembros: [{ id: COLAB, administrador: true }, { id: LIDER }] }, 'PUT');
  g = await llamar('colab', `/grupos/${G3}`);
  esperar('En un grupo sin privilegios sí cambia miembros y marca administradores', r.status === 200 && g.miembros.length === 2 && g.miembros.find(m => m.id === COLAB).administrador === 1, g.miembros);
  esperar('Y puede renombrarlo y marcarlo «por defecto»', (await llamar('colab', `/grupos/${G3}`, { nombre: 'Grupo sin privilegios (renombrado)', por_defecto: true }, 'PUT')).status === 200, null);
  await dar('gestionar_grupos', []);

  // Administrador de grupo (sin el privilegio general)
  r = await llamar('lider', `/grupos/${G3}/miembros`, { miembros: [{ id: LIDER }] }, 'PUT');
  esperar('Un miembro que NO es administrador del grupo no cambia sus miembros', r.status === 403, r);
  r = await llamar('colab', `/grupos/${G3}/miembros`, { miembros: [{ id: COLAB, administrador: true }, { id: LIDER }] }, 'PUT');
  esperar('Quien es administrador del grupo sí lo cambia, aunque ya no tenga el privilegio general', r.status === 200, r);
  await llamar('colab', `/grupos/${G3}/miembros`, { miembros: [{ id: COLAB, administrador: true }, { id: LIDER, administrador: true }] }, 'PUT');
  esperar('Un administrador de grupo ve los grupos pero no crea grupos nuevos', (await llamar('lider', '/grupos')).status === 200 && (await llamar('lider', '/grupos', { nombre: 'X' })).status === 403, null);
  r = await llamar('lider', `/grupos/${G2}/miembros`, { miembros: [{ id: LIDER }] }, 'PUT');
  esperar('Y no toca un grupo que da privilegios (aunque lo administrara)', r.status === 403, r);

  // ================= Grupo por defecto =================
  const todos = (await llamar('admin', '/grupos', { nombre: 'Todos', por_defecto: true })).id;
  r = await llamar('admin', '/usuarios', { correo: 'nuevo.grupo@oikos.test', nombre: 'Persona Nueva', rol: 'consulta' });
  g = await llamar('admin', `/grupos/${todos}`);
  esperar('La persona que se crea después entra sola al grupo «por defecto»', r.status === 200 && g.miembros.some(m => m.id === r.id), g.miembros);
  const us = await llamar('admin', '/usuarios');
  esperar('La lista de usuarios muestra los grupos de cada persona (la nueva entró a los dos grupos «por defecto»)', us.find(u => u.id === r.id).grupos.map(x => x.nombre).sort().join() === 'Grupo sin privilegios (renombrado),Todos' && us.find(u => u.id === LIDER).grupos.some(x => x.nombre.startsWith('Grupo sin privilegios')), us.find(u => u.id === r.id).grupos);

  // ================= Procesos: se delega crear y publicar, no asignar líderes =================
  esperar('Sin el privilegio, un Colaborador no ve la lista de procesos del administrador', (await llamar('colab', '/procesos-lideres')).status === 403, null);
  await dar('gestionar_procesos', [COLAB]);
  r = await llamar('colab', '/procesos', { nombre: 'Proceso creado por delegación', categoria: 'Apoyo' });
  const PD = r.id;
  esperar('Con «Gestionar procesos» el Colaborador crea un proceso y ve la lista', r.status === 200 && PD && (await llamar('colab', '/procesos-lideres')).status === 200, r);
  r = await llamar('colab', `/procesos/${PD}/identidad`, { nombre: 'Proceso creado por delegación', tipo: 'Proceso', categoria: 'Apoyo', publicado: 0 }, 'PUT');
  esperar('Lo retira (No publicado) y lo vuelve a publicar', r.status === 200 && (await llamar('colab', `/procesos/${PD}/identidad`, { nombre: 'Proceso creado por delegación', tipo: 'Proceso', categoria: 'Apoyo', publicado: 1 }, 'PUT')).status === 200, r);
  r = await llamar('colab', `/procesos/${PD}/lideres`, { usuario_id: LIDER }, 'POST');
  esperar('Pero NO asigna líderes (eso cambia el rol de las personas: solo el super usuario)', r.status === 403 && /administrador/.test(r.error), r);
  esperar('Ni quita líderes', (await llamar('colab', `/procesos/${PD}/lideres/${LIDER}`, null, 'DELETE')).status === 403, null);
  const lideres = await llamar('admin', '/usuarios');
  esperar('La persona a la que se intentó asignar sigue como estaba', lideres.find(u => u.id === LIDER).rol === 'lider_proceso' && lideres.find(u => u.id === COLAB).rol === 'consulta', null);

  // ================= Lo no delegable sigue siendo del administrador =================
  esperar('Respaldos y usuarios siguen cerrados para quien tiene privilegios', (await llamar('colab', '/respaldos')).status === 403 && (await llamar('colab', '/usuarios', { correo: 'otro@oikos.test', nombre: 'Otro', rol: 'admin' })).status === 403, null);
  esperar('Y para un Gestor de Calidad tampoco hay cambios: no puede crear áreas ni cargos', (await llamar('gestor', '/areas', { nombre: 'X', sigla: 'XX' })).status === 403 && (await llamar('gestor', '/cargos', { area_id: GC.id, nombre: 'X' })).status === 403, null);
  esperar('Los datos que ya existían no se tocaron: el área creada por grupo sigue ahí', (await llamar('admin', '/areas')).some(a => a.id === areaGrupo), null);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nLos grupos y los privilegios funcionan');
  process.exit(fallos ? 1 : 0);
})();
