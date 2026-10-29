// Prueba de usuarios, claves e importación: node prueba-admin.js (con el servidor corriendo y la base limpia)
const B = 'http://localhost:3100/api';
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = { texto: txt }; }
  return Array.isArray(d) ? Object.assign(d, { status: r.status }) : { status: r.status, ...d };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle).slice(0, 500)); } };
const login = (q, usuario, clave) => llamar(q, '/login', { usuario, clave });
// etiqueta de la prueba → [cuenta sembrada, clave]; se entra con el correo para probarlo desde el principio
const PRUEBA = { admin: ['admin@oikos.test', 'admin123'], calidad: ['gestor@oikos.test', 'gestor123'], produccion: ['lider@oikos.test', 'lider123'], consulta: ['colaborador@oikos.test', 'colaborador123'] };

(async () => {
  for (const [u, [n, c]] of Object.entries(PRUEBA)) await login(u, n, c);
  let r = await llamar('admin', '/yo');
  esperar('Se ingresa con el correo corporativo', r.usuario === 'admin' && r.correo === 'admin@oikos.test', r);
  esperar('Los usuarios sembrados deben cambiar su clave', r.debe_cambiar === 1, r);

  // ---- Usuarios ----
  r = await llamar('calidad', '/usuarios');
  esperar('Calidad no administra usuarios', r.status === 403, r);
  const cat = await llamar('admin', '/catalogos');
  const pid = s => cat.procesos.find(p => p.sigla === s).id;
  r = await llamar('admin', '/usuarios', { usuario: 'Mal Usuario', correo: 'mal@oikos.test', nombre: 'X', rol: 'consulta' });
  esperar('Valida el formato del usuario', r.status === 400, r);
  r = await llamar('admin', '/usuarios', { nombre: 'Sin Correo', rol: 'consulta' });
  esperar('Crear un usuario exige correo', r.status === 400 && /correo/i.test(r.error), r);
  r = await llamar('admin', '/usuarios', { correo: 'no-es-correo', nombre: 'X', rol: 'consulta' });
  esperar('Valida el formato del correo', r.status === 400, r);
  r = await llamar('admin', '/usuarios', { correo: 'GESTOR@oikos.test', nombre: 'X', rol: 'consulta' });
  esperar('No repite correos (sin importar mayúsculas)', r.status === 400 && /correo/.test(r.error), r);
  r = await llamar('admin', '/usuarios', { correo: 'laura.pineda@oikos.test', nombre: 'Laura Pineda', rol: 'lider_proceso' });
  esperar('Líder de proceso exige proceso', r.status === 400, r);
  r = await llamar('admin', '/usuarios', { correo: 'Laura.Pineda@oikos.test', nombre: 'Laura Pineda', cargo: 'Jefe de almacén', rol: 'lider_proceso', proceso_id: pid('ALM') });
  esperar('Crea usuario con clave temporal generada', r.id && r.clave_temporal && r.clave_temporal.length >= 10, r);
  esperar('El usuario interno sale del correo', r.usuario === 'laura.pineda', r);
  const clave1 = r.clave_temporal, idLaura = r.id;
  r = await llamar('admin', '/usuarios', { usuario: 'laura.pineda', correo: 'otra@oikos.test', nombre: 'Otra', rol: 'consulta' });
  esperar('No repite usuarios', r.status === 400, r);
  r = await llamar('admin', '/usuarios', { correo: 'laura.pineda@otro.test', nombre: 'Otra Laura', rol: 'consulta' });
  esperar('Si el usuario interno ya existe, le agrega un número', r.usuario === 'laura.pineda2', r);
  r = await login('laura', 'laura.pineda@oikos.test', clave1);
  esperar('El nuevo usuario entra con su clave temporal', r.ok, r);
  r = await llamar('laura', '/yo');
  esperar('Y debe cambiarla', r.debe_cambiar === 1 && r.rol === 'lider_proceso', r);

  r = await llamar('laura', '/yo/clave', { actual: 'incorrecta1', nueva: 'NuevaClave2026' });
  esperar('Cambio de clave exige la actual', r.status === 400, r);
  r = await llamar('laura', '/yo/clave', { actual: clave1, nueva: 'corta1' });
  esperar('Rechaza claves cortas', r.status === 400, r);
  r = await llamar('laura', '/yo/clave', { actual: clave1, nueva: 'solo letras largas' });
  esperar('Rechaza claves sin números', r.status === 400, r);
  r = await llamar('laura', '/yo/clave', { actual: clave1, nueva: 'NuevaClave2026' });
  esperar('Cambia su clave', r.ok, r);
  r = await llamar('laura', '/yo');
  esperar('La sesión sigue activa y ya no debe cambiar', r.debe_cambiar === 0, r);
  r = await login('laura2', 'laura.pineda', clave1);
  esperar('La clave temporal ya no sirve', r.status === 401, r);
  r = await login('laura2', 'laura.pineda', 'NuevaClave2026');
  esperar('La clave nueva sí', r.ok, r);

  // ---- Editar: correo, proceso principal con sus subprocesos ----
  r = await llamar('admin', `/usuarios/${idLaura}`, { nombre: 'Laura Pineda', correo: 'gestor@oikos.test', rol: 'lider_proceso', proceso_id: pid('ALM') }, 'PUT');
  esperar('Editar no deja usar el correo de otro', r.status === 400 && /correo/.test(r.error), r);
  r = await llamar('admin', `/usuarios/${idLaura}`, { nombre: 'Laura Pineda', correo: '', rol: 'lider_proceso', proceso_id: pid('ALM') }, 'PUT');
  esperar('Ni dejarlo vacío', r.status === 400, r);
  r = await llamar('admin', `/usuarios/${idLaura}`, { nombre: 'Laura Pineda', correo: 'lpineda@oikos.test', cargo: 'Jefe de almacén', rol: 'lider_proceso', proceso_id: pid('ALM') }, 'PUT');
  esperar('El administrador cambia el correo', r.ok, r);
  r = await login('laura3', 'lpineda@oikos.test', 'NuevaClave2026');
  esperar('Y se ingresa con el correo nuevo', r.ok, r);
  r = await login('laura3', 'laura.pineda@oikos.test', 'NuevaClave2026');
  esperar('El correo anterior ya no sirve', r.status === 401, r);
  const sub = await llamar('admin', '/procesos', { nombre: 'Subproceso de prueba', padre_id: pid('ALM') });
  // Los procesos del Líder se marcan uno por uno: un subproceso creado después no entra solo
  let yoLaura = await llamar('laura3', '/yo');
  esperar('Un subproceso nuevo no se marca solo', yoLaura.procesos_propios.includes(pid('ALM')) && !yoLaura.procesos_propios.includes(sub.id), yoLaura.procesos_propios);
  r = await llamar('admin', `/usuarios/${idLaura}`, { nombre: 'Laura Pineda', correo: 'lpineda@oikos.test', rol: 'lider_proceso', procesos: [] }, 'PUT');
  esperar('El Líder necesita al menos un proceso marcado', r.status === 400, r);
  r = await llamar('admin', `/usuarios/${idLaura}`, { nombre: 'Laura Pineda', correo: 'lpineda@oikos.test', rol: 'lider_proceso', procesos: [sub.id, pid('FIN')] }, 'PUT');
  esperar('Se le marcan procesos y subprocesos sueltos', r.ok, r);
  yoLaura = await llamar('laura3', '/yo');
  esperar('Y lidera exactamente esos', [...yoLaura.procesos_propios].sort().join() === [sub.id, pid('FIN')].sort().join(), yoLaura.procesos_propios);
  esperar('Su proceso principal es el proceso, no el subproceso', yoLaura.proceso_id === pid('FIN'), yoLaura.proceso_id);
  r = await llamar('laura3', `/procesos/${sub.id}`);
  esperar('Y puede editar el subproceso marcado', r.puede_editar === true, r.puede_editar);
  r = await llamar('laura3', `/procesos/${pid('ALM')}`);
  esperar('Pero ya no el proceso que le quitaron', r.puede_editar === false, r.puede_editar);
  r = await llamar('admin', `/procesos/${pid('ALM')}/lideres`, { usuario_id: idLaura });
  esperar('Desde Procesos se le suma un proceso con sus subprocesos', r.ok && r.agregados === 2, r);
  r = await fetch(B + `/procesos/${pid('FIN')}/lideres/${idLaura}`, { method: 'DELETE', headers: { cookie: sesiones.admin } }).then(x => x.json());
  esperar('Quitar un proceso deja los demás', r.ok && r.quedan === 2, r);
  r = await llamar('laura3', '/yo');
  esperar('Y no le cierra la sesión mientras siga siendo Líder', r.rol === 'lider_proceso', r);

  r = await llamar('admin', `/usuarios/${idLaura}`, { nombre: 'Laura Pineda', cargo: 'Jefe de almacén', rol: 'consulta', proceso_id: null }, 'PUT');
  r = await llamar('laura', '/yo');
  esperar('Cambiar el rol cierra sus sesiones', r.status === 401, r);
  await login('laura', 'laura.pineda', 'NuevaClave2026');
  r = await llamar('admin', `/usuarios/${idLaura}/clave`, {});
  esperar('Restablecer clave devuelve una temporal', r.clave_temporal, r);
  const clave2 = r.clave_temporal;
  r = await llamar('laura', '/yo');
  esperar('Restablecer cierra las sesiones abiertas', r.status === 401, r);
  r = await llamar('admin', `/usuarios/${idLaura}`, { nombre: 'Laura Pineda', rol: 'consulta', activo: 0 }, 'PUT');
  r = await login('laura', 'laura.pineda', clave2);
  esperar('Un usuario desactivado no entra', r.status === 401, r);
  const lista = await llamar('admin', '/usuarios');
  esperar('Sigue en el listado como inactivo', lista.find(u => u.id === idLaura)?.activo === 0, lista.map(u => [u.usuario, u.activo]));
  esperar('Y no sale en los catálogos', !(await llamar('admin', '/catalogos')).usuarios.some(u => u.id === idLaura), 'aparece');

  const yoAdmin = await llamar('admin', '/yo');
  r = await llamar('admin', `/usuarios/${yoAdmin.id}`, { nombre: 'Administrador', rol: 'admin', activo: 0 }, 'PUT');
  esperar('No puedes desactivar tu propia cuenta', r.status === 400, r);
  r = await llamar('admin', `/usuarios/${yoAdmin.id}`, { nombre: 'Administrador', rol: 'lider_calidad' }, 'PUT');
  esperar('No puede quedar el sistema sin administrador', r.status === 400 && /administrador/.test(r.error), r);

  // ---- Olvidé mi clave sin correo configurado: la petición le llega al administrador ----
  r = await llamar('anonimo', '/olvide', { correo: 'colaborador@oikos.test' });
  esperar('Olvidé mi clave responde sin sesión', r.ok && r.por_correo === false, r);
  r = await llamar('anonimo', '/olvide', { correo: 'nadie@oikos.test' });
  esperar('Y responde lo mismo aunque el correo no exista', r.ok && r.por_correo === false, r);
  let us0 = await llamar('admin', '/usuarios');
  esperar('El administrador ve quién pidió restablecer su clave', us0.filter(u => u.reinicio_solicitado).map(u => u.usuario).join() === 'colaborador', us0.filter(u => u.reinicio_solicitado));
  r = await llamar('admin', `/usuarios/${us0.find(u => u.usuario === 'colaborador').id}/clave`, {});
  us0 = await llamar('admin', '/usuarios');
  esperar('Al restablecerla se borra el aviso', !us0.some(u => u.reinicio_solicitado), us0.filter(u => u.reinicio_solicitado));
  r = await llamar('anonimo', '/restablecer', { token: 'a'.repeat(64), nueva: 'ClaveNueva2026' });
  esperar('Un enlace inventado no restablece nada', r.status === 400, r);

  // ---- Completar correos de usuarios que no tienen ----
  await llamar('admin', '/importar/usuarios', { csv: 'correo,nombre,rol\nviejo@oikos.test,Viejo,colaborador', aplicar: true });
  r = await llamar('admin', '/usuarios/completar-correos', { dominio: 'no es dominio' });
  esperar('Completar correos valida el dominio', r.status === 400, r);
  r = await llamar('admin', '/usuarios/completar-correos', { dominio: '@metalcof.test' });
  esperar('Completar correos no toca a quien ya tiene', r.actualizados === 0, r);

  // ---- Bloqueo por intentos fallidos (con un usuario desechable) ----
  await llamar('admin', '/usuarios', { usuario: 'bloqueable', correo: 'bloqueable@oikos.test', nombre: 'Prueba', rol: 'consulta', clave: 'ClaveBuena123' });
  for (let i = 0; i < 5; i++) await login('b', 'bloqueable', 'mala');
  r = await login('b', 'bloqueable', 'ClaveBuena123');
  esperar('Tras 5 fallos se bloquea el usuario (aun con la clave buena)', r.status === 429, r);

  // ---- Importación ----
  r = await llamar('produccion', '/importar');
  esperar('Líder de proceso no importa', r.status === 403, r);
  r = await llamar('calidad', '/importar/usuarios', { csv: 'correo;nombre;rol\nx@oikos.test;X;colaborador' });
  esperar('Calidad no importa usuarios (solo admin)', r.status === 403, r);
  r = await llamar('calidad', '/importar');
  esperar('Calidad ve 4 tipos de importación', r.length === 4, r.map(t => t.id));
  r = await llamar('calidad', '/importar/documentos', { csv: 'nombre;tipo\nA;Procedimiento' });
  esperar('Avisa de columnas obligatorias que faltan', r.status === 400 && /clase/.test(r.error), r);

  const docs = [
    'codigo;nombre;tipo;clase;proceso;origen;version;fecha_documento;fecha_vencimiento;responsable;descripcion',
    'PRO-PRO-01;"Procedimiento de soldadura; versión MIG";Procedimiento;Procedimientos;Producción;Interno;2;15/03/2025;15/03/2027;lider;',
    ';Manual de calidad;Documento específico;MAN;SIG;Interno;1;2024-01-10;;gestor@oikos.test;Manual del SGC',
    ';Norma ISO 9001;Documento específico;Manuales;Sistema Integrado de Gestión;Externo;;;;;',
  ].join('\r\n');
  r = await llamar('calidad', '/importar/documentos', { csv: docs });
  esperar('Revisa sin aplicar: 3 filas válidas, nada importado', r.total === 3 && r.validas === 3 && !r.aplicado, r);
  esperar('Respeta comillas y punto y coma dentro del nombre', r.filas[0].resumen.includes('versión MIG'), r.filas[0]);
  esperar('Aún no hay documentos', (await llamar('calidad', '/documentos')).length === 0, 'ya había');

  const malos = docs + '\r\n;Duplicado;Procedimiento;Procedimientos;Producción;Interno;1;31/02/2025;;;\r\n;Sin proceso;Procedimiento;Procedimientos;Inventado;;;;;;';
  r = await llamar('calidad', '/importar/documentos', { csv: malos, aplicar: true });
  esperar('Si hay errores no importa nada (todo o nada)', !r.aplicado && r.errores === 2 && r.validas === 3, r);
  esperar('Dice cuál fila falló y por qué', /fecha_documento/.test(r.filas[3].error) && /Inventado/.test(r.filas[4].error), r.filas.slice(3));
  esperar('Sigue sin haber documentos', (await llamar('calidad', '/documentos')).length === 0, 'se importó algo');

  r = await llamar('calidad', '/importar/documentos', { csv: docs, aplicar: true });
  esperar('Importa los 3 documentos', r.aplicado && r.validas === 3, r);
  const ld = await llamar('calidad', '/documentos');
  esperar('Entran como vigentes con código propio y generado', ld.length === 3 && ld.every(d => d.estado === 'VIGENTE') &&
    ld.some(d => d.codigo === 'PRO-PRO-01') && ld.some(d => d.codigo === 'SIG-MAN-01') && ld.some(d => d.codigo === 'SIG-MAN-02'), ld.map(d => [d.codigo, d.estado]));
  const dsol = ld.find(d => d.codigo === 'PRO-PRO-01');
  esperar('Conservan versión, fechas y responsable', dsol.version === 2 && dsol.fecha_documento === '2025-03-15' && dsol.fecha_vencimiento === '2027-03-15' && dsol.responsable === 'Líder de Producción', dsol);
  const ficha = await llamar('calidad', `/documentos/${dsol.id}`);
  esperar('Dejan rastro en la bitácora', ficha.bitacora[0].transicion_id === 'importar', ficha.bitacora);
  r = await llamar('calidad', '/importar/documentos', { csv: docs });
  esperar('Reimportar el mismo archivo se rechaza por códigos repetidos', r.errores >= 1 && /ya existe/.test(r.filas[0].error), r.filas);

  const riesgos = [
    'proceso,tipo,nombre,causas,consecuencias,probabilidad,impacto,tratamiento,responsable',
    'Producción,Calidad,Producto no conforme por soldadura,Equipos sin mantenimiento,Reprocesos,4,4,Reducir,lider',
    'ALM,Compras y proveedores,Desabastecimiento de lámina,Un solo proveedor,Paradas,"3","5",,gestor',
    'ALM,Inventado,Riesgo raro,,,2,2,,',
    'ALM,Calidad,Probabilidad fuera de escala,,,6,2,,',
  ].join('\n');
  r = await llamar('calidad', '/importar/riesgos', { csv: riesgos });
  esperar('Detecta tipo inexistente y escala fuera de rango', r.validas === 2 && r.errores === 2 && /tipo/.test(r.filas[2].error) && /entre 1 y 5/.test(r.filas[3].error), r.filas);
  r = await llamar('calidad', '/importar/riesgos', { csv: riesgos.split('\n').slice(0, 3).join('\n'), aplicar: true });
  esperar('Importa 2 riesgos', r.aplicado, r);
  const lr = await llamar('calidad', '/riesgos');
  esperar('Códigos R-PRO-01 y R-ALM-01 (+ los de ejemplo)', lr.some(x => x.codigo === 'R-PRO-02') && lr.some(x => x.codigo === 'R-ALM-02'), lr.map(x => x.codigo));

  const ctrl = 'riesgo_codigo;descripcion;clasificacion;efectividad;mitiga_probabilidad;mitiga_impacto;responsable_gestion\n' +
    'R-PRO-02;Inspección final de soldadura;Detectivo;Fuerte;sí;no;lider\nR-PRO-02;Sin mitigación;Preventivo;Moderado;no;no;\nR-XXX-99;Control huérfano;Preventivo;;si;;';
  r = await llamar('calidad', '/importar/controles', { csv: ctrl });
  esperar('Controles: exige mitigar algo y que el riesgo exista', r.validas === 1 && /mitigar/.test(r.filas[1].error) && /R-XXX-99/.test(r.filas[2].error), r.filas);
  r = await llamar('calidad', '/importar/controles', { csv: ctrl.split('\n').slice(0, 2).join('\n'), aplicar: true });
  const rg = (await llamar('calidad', '/riesgos')).find(x => x.codigo === 'R-PRO-02');
  esperar('El control importado baja el riesgo residual (4×4 → 2×4)', r.aplicado && rg.probabilidad_residual === 2 && rg.impacto_residual === 4, rg);

  const meds = [
    'indicador_codigo;anio;periodo;valor;numerador;denominador;analisis',
    'IND-CCA-01;2025;1;;196;200;',
    'IND-CCA-01;2025;2;97,5;;;Falla en el lote 12',
    'IND-CCA-01;2025;13;99;;;',
    'IND-CCA-01;2025;1;95;;;',
    'IND-SIG-04;2026;6;20;;;Nuevo valor',
    'IND-NOEXISTE;2025;1;1;;;',
  ].join('\n');
  r = await llamar('calidad', '/importar/mediciones', { csv: meds });
  esperar('Mediciones: periodo fuera de frecuencia, repetido e indicador inexistente', r.validas === 3 && r.errores === 3, r.filas);
  esperar('Avisa cuando reemplaza una medición existente', /reemplaza 16.91/.test(r.filas[4].resumen), r.filas[4]);
  esperar('Calcula la razón (196/200 = 98 %) y acepta coma decimal', /2025-1: 98/.test(r.filas[0].resumen) && /2025-2: 97.5/.test(r.filas[1].resumen), r.filas.slice(0, 2));
  r = await llamar('calidad', '/importar/mediciones', { csv: meds.split('\n').filter((_, i) => [0, 1, 2, 5].includes(i)).join('\n'), aplicar: true });
  esperar('Importa las mediciones válidas', r.aplicado, r);
  const ind = (await llamar('calidad', '/indicadores?anio=2025&texto=IND-CCA-01'))[0];
  esperar('Quedan en la serie del indicador (ene 98, feb 97,5)', ind.serie[0].valor === 98 && ind.serie[1].valor === 97.5, ind.serie.slice(0, 3));
  const ener = (await llamar('calidad', '/indicadores?anio=2026&texto=IND-SIG-04'))[0];
  esperar('Y reemplaza la de energía de junio', ener.serie[5].valor === 20, ener.serie[5]);

  // ---- Importar usuarios (solo admin) ----
  const us = 'correo,nombre,cargo,rol,proceso\nmgomez@oikos.test,María Gómez,Contadora,Líder,Gestión Financiera\nrnino@oikos.test,Rafael Niño,,Colaborador,\nadmin@oikos.test,Repetido,,admin,';
  r = await llamar('admin', '/importar/usuarios', { csv: us });
  esperar('Usuarios: detecta el que ya existe', r.validas === 2 && /ya existe/.test(r.filas[2].error), r.filas);
  r = await llamar('admin', '/importar/usuarios', { csv: us.split('\n').slice(0, 3).join('\n'), aplicar: true });
  esperar('Importa 2 usuarios y entrega sus claves una vez', r.aplicado && r.claves.length === 2, r);
  r = await login('m', 'mgomez@oikos.test', r.claves[0].clave_temporal);
  esperar('Y esas claves funcionan', r.ok, r);
  const m = await llamar('m', '/yo');
  esperar('María quedó como líder de Gestión Financiera', m.rol === 'lider_proceso' && m.proceso_id === pid('FIN'), m);

  r = await llamar('admin', '/importar/correos', { csv: 'usuario,correo\nrnino,rafael.nino@oikos.test\nnoexiste,x@oikos.test', aplicar: true });
  esperar('Correos: detecta el usuario que no existe y no aplica nada', !r.aplicado && /no existe/.test(r.filas[1].error), r.filas);
  r = await llamar('admin', '/importar/correos', { csv: 'usuario,correo\nrnino,rafael.nino@oikos.test', aplicar: true });
  esperar('Correos: asigna el correo a un usuario existente', r.aplicado && (await llamar('admin', '/usuarios')).find(u => u.usuario === 'rnino')?.correo === 'rafael.nino@oikos.test', r);

  // ---- Cargos ----
  const cg = await llamar('admin', '/cargos');
  const gg = cg.find(c => c.nombre === 'Gerente General');
  esperar('Trae los 48 cargos de Metalcof con código OIKOS', cg.length === 48 && cg.some(c => c.codigo === 'CAR-GPR-27' && c.nombre === 'Operario' && c.jefe === 'Jefe de Producción'), cg.length);
  r = await llamar('calidad', '/cargos', { area_sigla: 'GPR', area: 'Gerencia de Producción', nombre: 'X' });
  esperar('Solo el administrador crea cargos', r.status === 403, r);
  r = await llamar('admin', '/cargos', { area_sigla: 'GPR', area: 'Gerencia de Producción', numero: 27, nombre: 'Repetido' });
  esperar('No repite el código', r.status === 400 && /CAR-GPR-27/.test(r.error), r);
  r = await llamar('admin', '/cargos', { area_sigla: 'gti', area: 'Gestión de Tecnología', nombre: 'Analista de Sistemas', jefe_id: gg.id });
  esperar('Crea un cargo con el número siguiente', r.codigo === 'CAR-GTI-49', r);
  const idAn = r.id;
  r = await llamar('admin', '/cargos/' + gg.id, { area_sigla: 'GG', area: 'Gerencia General', numero: 1, nombre: 'Gerente General', jefe_id: idAn }, 'PUT');
  esperar('No permite ciclos de jefes', r.status === 400 && /ciclo/.test(r.error), r);
  const idM = (await llamar('admin', '/usuarios')).find(u => u.usuario === 'mgomez').id;
  r = await llamar('admin', '/cargos/' + idAn + '/personas', { usuarios: [idM] }, 'PUT');
  let um = (await llamar('admin', '/usuarios')).find(u => u.id === idM);
  esperar('Asigna la persona al cargo y su perfil muestra el cargo', r.ok && um.cargo_id === idAn && um.cargo === 'Analista de Sistemas', um);
  r = await llamar('admin', '/cargos/' + idAn, { area_sigla: 'GTI', area: 'Gestión de Tecnología', numero: 49, nombre: 'Analista de Tecnología' }, 'PUT');
  um = (await llamar('admin', '/usuarios')).find(u => u.id === idM);
  esperar('Renombrar el cargo actualiza a quien lo ocupa', um.cargo === 'Analista de Tecnología', um);
  r = await llamar('admin', '/cargos/' + idAn + '/personas', { usuarios: [] }, 'PUT');
  um = (await llamar('admin', '/usuarios')).find(u => u.id === idM);
  esperar('Al quitarla del cargo queda sin cargo', !um.cargo_id && !um.cargo, um);

  r = await llamar('calidad', '/importar/documentos/plantilla');
  esperar('Descarga la plantilla CSV', r.texto?.includes('"codigo";"nombre";"tipo"'), r);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo el módulo de administración funciona');
  process.exit(fallos ? 1 : 0);
})();
