// Prueba del glosario y el buscador global: node prueba-glosario.js (con el servidor corriendo)
const B = 'http://localhost:3100/api';
const sesiones = {};
async function llamar(quien, ruta, cuerpo, metodo) {
  const o = { method: metodo || (cuerpo ? 'POST' : 'GET'), headers: { cookie: sesiones[quien] || '' } };
  if (cuerpo) { o.body = JSON.stringify(cuerpo); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(B + ruta, o);
  if (r.headers.get('set-cookie')) sesiones[quien] = r.headers.get('set-cookie').split(';')[0];
  return { status: r.status, ...(await r.json()) };
}
let fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', detalle); } };

(async () => {
  await llamar('calidad', '/login', { usuario: 'gestor', clave: 'gestor123' });
  await llamar('consulta', '/login', { usuario: 'colaborador', clave: 'colaborador123' });
  const marca = 'Zprueba' + Date.now();

  let r = await llamar('calidad', '/glosario', { termino: marca, descripcion: 'Término de prueba del glosario', glosario: 'ISO 9001', fuente: 'ISO 9000:2015' });
  esperar('Calidad crea un término', r.id, r);
  const id = r.id;

  r = await llamar('calidad', '/glosario', { termino: marca.toLowerCase(), descripcion: 'otra', glosario: 'ISO 9001' });
  esperar('No deja repetir el término en el mismo glosario', r.status === 400, r);

  r = await llamar('consulta', '/glosario', { termino: 'X', descripcion: 'Y' });
  esperar('Consulta NO puede crear términos', r.status === 403, r);

  r = await llamar('consulta', '/glosario?letra=Z&glosario=ISO%209001');
  esperar('Filtra por letra y glosario', r.terminos.some(t => t.id === id) && r.glosarios.includes('ISO 9001'), r);

  r = await llamar('calidad', `/glosario/${id}`, { termino: marca, descripcion: 'Descripción corregida', glosario: 'ISO 9001' }, 'PUT');
  r = await llamar('consulta', '/glosario?texto=corregida');
  esperar('Edita el término', r.terminos.some(t => t.id === id), r);

  r = await llamar('consulta', '/buscar?q=' + marca);
  esperar('El buscador encuentra el término', r.resultados.some(x => x.tipo === 'Término' && x.id === id), r);

  r = await llamar('consulta', '/glosario?texto=DESCRIPCION%20CORREGIDA');
  esperar('El glosario ignora tildes y mayúsculas', r.terminos.some(t => t.id === id), r);

  r = await llamar('consulta', '/buscar?q=Descripcion%20corregida');
  esperar('El buscador ignora tildes', r.resultados.some(x => x.id === id), r);

  r = await llamar('consulta', '/buscar?q=a');
  esperar('El buscador exige 2 caracteres', r.status === 400, r);

  r = await llamar('consulta', '/buscar?q=pro');
  const tipos = new Set(r.resultados.map(x => x.tipo));
  esperar('El buscador recorre varios módulos', tipos.size >= 2, [...tipos]);

  r = await llamar('consulta', `/buscar?q=${marca}&tipo=Documento`);
  esperar('Filtra el buscador por tipo', !r.resultados.some(x => x.tipo === 'Término'), r);

  r = await llamar('calidad', `/glosario/${id}`, null, 'DELETE');
  r = await llamar('consulta', '/buscar?q=' + marca);
  esperar('Quitar el término lo saca del buscador', !r.resultados.length, r);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo bien');
  process.exit(fallos ? 1 : 0);
})();
