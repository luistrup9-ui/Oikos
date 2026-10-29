// Prueba del reporte Seguimiento al MOP: node prueba-mop.js (con el servidor corriendo)
const { crc32 } = require('./xlsx');
const B = 'http://localhost:3100/api';
let cookie = '', fallos = 0;
const esperar = (nombre, cond, detalle) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + nombre); if (!cond) { fallos++; console.log('      ', detalle); } };

// Lee las entradas de un ZIP sin compresión (lo que genera xlsx.js)
function entradas(buf) {
  const out = {};
  for (let i = 0; i + 30 < buf.length && buf.readUInt32LE(i) === 0x04034b50;) {
    const crc = buf.readUInt32LE(i + 14), tam = buf.readUInt32LE(i + 18), n = buf.readUInt16LE(i + 26), e = buf.readUInt16LE(i + 28);
    const nombre = buf.toString('utf8', i + 30, i + 30 + n), datos = buf.subarray(i + 30 + n + e, i + 30 + n + e + tam);
    out[nombre] = { texto: datos.toString('utf8'), crcOk: crc32(datos) === crc };
    i += 30 + n + e + tam;
  }
  return out;
}

(async () => {
  const r = await fetch(B + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'colaborador', clave: 'colaborador123' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
  const bajar = async q => fetch(B + '/mop/exportar?' + q, { headers: { cookie } });

  let res = await bajar('anio=2026&formato=xlsx');
  const buf = Buffer.from(await res.arrayBuffer());
  esperar('XLSX responde 200 con tipo de Excel', res.status === 200 && res.headers.get('content-type').includes('spreadsheetml'), res.status);
  esperar('Nombre de archivo seguimiento-mop-2026.xlsx', /seguimiento-mop-2026\.xlsx/.test(res.headers.get('content-disposition')), res.headers.get('content-disposition'));
  const z = entradas(buf);
  esperar('El ZIP trae las 6 partes del libro', ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml'].every(k => z[k]), Object.keys(z));
  esperar('Los CRC del ZIP son correctos', Object.values(z).every(x => x.crcOk));
  const hoja = z['xl/worksheets/sheet1.xml'].texto;
  esperar('La hoja trae encabezado y el indicador de energía', hoja.includes('Medición previa') && hoja.includes('Uso eficiente de energía'), hoja.slice(0, 300));
  esperar('La hoja trae el valor de junio de energía (16.91)', hoja.includes('<v>16.91</v>'), '');

  res = await bajar('anio=2026&formato=csv');
  const bytes = Buffer.from(await res.arrayBuffer()), texto = bytes.toString('utf8');
  const lineas = texto.replace(/^﻿/, '').split('\r\n');
  esperar('CSV responde con BOM y punto y coma', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && lineas[0].includes('";"'), lineas[0]);
  const energia = lineas.find(l => l.includes('Uso eficiente de energía'));
  esperar('CSV usa coma decimal y marca la tendencia', energia?.includes('"16,91"') && /"(Mejor|Peor|Igual)"/.test(energia), energia);
  esperar('CSV trae una fila por indicador activo', lineas.length - 1 === (await (await fetch(B + '/indicadores?anio=2026', { headers: { cookie } })).json()).length, lineas.length);

  res = await fetch(B + '/mop/exportar?formato=xlsx');
  esperar('Sin sesión no exporta', res.status === 401, res.status);

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo bien');
  process.exit(fallos ? 1 : 0);
})();
