// Prueba del módulo de indicadores: node prueba-indicadores.js (con el servidor corriendo)
const B = 'http://localhost:3100/api';
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  const d = await r.json();
  return Array.isArray(d) ? Object.assign(d, { status: r.status }) : { status: r.status, ...d };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', JSON.stringify(detalle).slice(0, 400)); } };

(async () => {
  for (const [u, c] of [['produccion', 'produccion123'], ['calidad', 'calidad123'], ['consulta', 'consulta123']])
    await llamar(u, '/login', { usuario: u, clave: c });
  const anio = new Date().getFullYear();

  let lista = await llamar('calidad', '/indicadores?anio=2026');
  esperar('Carga los 15 indicadores de Metalcof', lista.length === 15, lista.length);
  const energia = lista.find(i => i.codigo === 'IND-SIG-04');
  esperar('Energía: último 16,91 (Jun), previo 115,07, semáforo rojo',
    energia.ultimo.valor === 16.91 && energia.ultimo.etiqueta === 'Jun' && energia.previo.valor === 115.07 && energia.semaforo === 'rojo', energia.ultimo);
  esperar('Energía: mayo (115,07 ≥ 90) en verde', energia.serie[4].semaforo === 'verde', energia.serie[4]);

  const conf = lista.find(i => i.codigo === 'IND-PRO-01');
  let r = await llamar('produccion', `/indicadores/${conf.id}/mediciones`, { anio, periodo: 1, numerador: 90, denominador: 100 });
  esperar('Exige análisis si no cumple la meta', r.status === 400 && /análisis/.test(r.error), r);
  r = await llamar('produccion', `/indicadores/${conf.id}/mediciones`, { anio, periodo: 1, numerador: 85, denominador: 100, analisis: 'Falla en la soldadora 2' });
  esperar('Líder de Producción registra su indicador (85 % → rojo)', r.ok && r.valor === 85 && r.semaforo === 'rojo', r);
  r = await llamar('produccion', `/indicadores/${conf.id}/mediciones`, { anio, periodo: 2, numerador: 97, denominador: 100, analisis: 'Mejora parcial' });
  esperar('97 % con meta 98 y tolerancia 10 → amarillo', r.semaforo === 'amarillo', r);
  r = await llamar('produccion', `/indicadores/${conf.id}/mediciones`, { anio, periodo: 2, numerador: 99, denominador: 100 });
  esperar('Corrige el periodo (99 % → verde, sin análisis)', r.semaforo === 'verde', r);
  r = await llamar('produccion', `/indicadores/${conf.id}/mediciones`, { anio, periodo: 12, numerador: 99, denominador: 100 });
  esperar('No deja medir periodos futuros', r.status === 400 || new Date().getMonth() >= 10, r);
  r = await llamar('produccion', `/indicadores/${conf.id}/mediciones`, { anio, periodo: 1, numerador: 1, denominador: 0, analisis: 'x' });
  esperar('Rechaza denominador cero', r.status === 400, r);

  const ventas = lista.find(i => i.codigo === 'IND-COM-01');
  r = await llamar('produccion', `/indicadores/${ventas.id}/mediciones`, { anio, periodo: 1, valor: 20 });
  esperar('Producción NO mide indicadores de otro proceso', r.status === 403, r);
  r = await llamar('consulta', `/indicadores/${conf.id}/mediciones`, { anio, periodo: 1, valor: 20 });
  esperar('Consulta no mide', r.status === 403, r);

  const pend = await llamar('produccion', '/indicadores-pendientes');
  esperar('Producción ve sus mediciones atrasadas', pend.length === 1 && pend[0].codigo === 'IND-PRO-01', pend.map(i => [i.codigo, i.faltantes]));

  r = await llamar('produccion', '/indicadores', { nombre: 'X', proceso_id: 1, meta: 1, frecuencia: 'Mensual' });
  esperar('Solo Calidad crea indicadores', r.status === 403, r);
  r = await llamar('calidad', '/indicadores', { nombre: 'Días de inventario', proceso_id: conf.proceso_id, meta: 30, frecuencia: 'Trimestral',
    sentido: 'Descendente', calculo: 'directo', unidad: 'días' });
  esperar('Calidad crea indicador con código automático', r.id, r);
  const nuevo = await llamar('calidad', `/indicadores/${r.id}`);
  esperar('Código IND-PRO-02', nuevo.codigo === 'IND-PRO-02', nuevo.codigo);
  r = await llamar('calidad', `/indicadores/${nuevo.id}/mediciones`, { anio: anio - 1, periodo: 4, valor: 25 });
  esperar('Descendente: 25 días con meta ≤ 30 → verde', r.semaforo === 'verde', r);
  r = await llamar('calidad', `/indicadores/${nuevo.id}/mediciones`, { anio: anio - 1, periodo: 3, valor: 32, analisis: 'Sobrestock' });
  esperar('Descendente: 32 días → amarillo', r.semaforo === 'amarillo', r);
  r = await llamar('calidad', `/indicadores/${nuevo.id}`, { ...nuevo, frecuencia: 'Mensual' }, 'PUT');
  esperar('No deja cambiar la frecuencia si ya hay mediciones', r.status === 400, r);

  const bsc = await llamar('consulta', '/bsc');
  esperar('Cuadro de mando: 4 perspectivas y 6 objetivos', bsc.perspectivas.length === 4 &&
    bsc.perspectivas.flatMap(p => p.objetivos).length === 6, bsc.perspectivas.map(p => p.nombre));
  const oe4 = bsc.perspectivas.flatMap(p => p.objetivos).find(o => o.codigo === 'OE4');
  esperar('OE4 calcula cumplimiento con agua y energía', oe4.cumplimiento > 0 && oe4.cumplimiento < 100, oe4.cumplimiento);

  r = await llamar('produccion', '/planes-accion', { nombre: 'Mantenimiento de la soldadora 2', indicador_id: conf.id, avance: 40 });
  esperar('Crea plan de acción (En curso)', r.id, r);
  const ficha = await llamar('produccion', `/indicadores/${conf.id}`);
  esperar('El plan aparece en la ficha', ficha.planes[0]?.estado === 'En curso', ficha.planes);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo el módulo de indicadores funciona');
  process.exit(fallos ? 1 : 0);
})();
