// Corre las pruebas automáticas (prueba-*.js) contra la API PHP + MySQL. Solo para desarrollo: necesita Node, PHP y MySQL locales.
// Cada prueba usa una base nueva «oikos_prueba» (mysql/esquema.sql + mysql/datos-prueba.sql) y el servidor integrado de PHP.
//   node herramientas/correr-pruebas.mjs                 → todas
//   node herramientas/correr-pruebas.mjs admin,flujo     → algunas
// Variables opcionales: PHP_BIN y MYSQL_BIN (por defecto los de XAMPP en C:/xampp), MYSQL_USUARIO (root).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const PHP = process.env.PHP_BIN || (fs.existsSync('C:/xampp/php/php.exe') ? 'C:/xampp/php/php.exe' : 'php');
const MYSQL = process.env.MYSQL_BIN || (fs.existsSync('C:/xampp/mysql/bin/mysql.exe') ? 'C:/xampp/mysql/bin/mysql.exe' : 'mysql');
const USUARIO = process.env.MYSQL_USUARIO || 'root', PUERTO = 3196, dormir = ms => new Promise(r => setTimeout(r, ms));
const nombres = process.argv[2] ? process.argv[2].split(',') : ['admin', 'flujo', 'procesos', 'indicadores', 'riesgos', 'auditorias', 'mecanismos', 'glosario', 'mop'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oikos-pruebas-')).replace(/\\/g, '/');
const config = `${tmp}/config.php`;
fs.writeFileSync(config, `<?php return ['db_host' => '127.0.0.1', 'db_nombre' => 'oikos_prueba', 'db_usuario' => '${USUARIO}', 'db_clave' => '${process.env.MYSQL_CLAVE || ''}', 'datos_dir' => '${tmp}/datos', 'app_url' => '', 'smtp_host' => ''];`);
const mysql = (args, entrada) => spawnSync(MYSQL, ['-u', USUARIO, ...(process.env.MYSQL_CLAVE ? [`-p${process.env.MYSQL_CLAVE}`] : []), ...args], { input: entrada, encoding: 'utf8' });

const resultados = [];
for (const n of nombres) {
  const f = `prueba-${n}.js`;
  mysql(['-e', 'DROP DATABASE IF EXISTS oikos_prueba; CREATE DATABASE oikos_prueba CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;']);
  for (const a of ['mysql/esquema.sql', 'mysql/datos-prueba.sql']) {
    const r = mysql(['oikos_prueba'], fs.readFileSync(`${RAIZ}/${a}`));
    if (r.status) { console.error(`No se pudo cargar ${a}:`, r.stderr); process.exit(1); }
  }
  fs.rmSync(`${tmp}/datos`, { recursive: true, force: true });
  const srv = spawn(PHP, ['-S', `127.0.0.1:${PUERTO}`, '-t', 'public', 'herramientas/servidor-local.php'], { cwd: RAIZ, env: { ...process.env, OIKOS_CONFIG: config }, stdio: 'ignore' });
  try {
    let listo = false;
    for (let i = 0; i < 60 && !listo; i++) { try { listo = (await fetch(`http://127.0.0.1:${PUERTO}/healthz`)).ok; } catch {} if (!listo) await dormir(200); }
    if (!listo) { resultados.push([f, 'EL SERVIDOR NO ARRANCÓ', '']); continue; }
    // Las pruebas apuntan a localhost:3100; se corre una copia apuntando al servidor PHP de prueba
    const copia = `${tmp}/${f}`;
    fs.writeFileSync(copia, fs.readFileSync(`${RAIZ}/${f}`, 'utf8').replaceAll('localhost:3100', `127.0.0.1:${PUERTO}`).replaceAll('127.0.0.1:3100', `127.0.0.1:${PUERTO}`)
      .replaceAll("require('./", `require('${RAIZ}/`).replaceAll('__dirname', JSON.stringify(RAIZ)));
    const sal = await new Promise(res => {
      const p = spawn(process.execPath, [copia], { cwd: RAIZ }); let o = '';
      p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
      const t = setTimeout(() => p.kill(), 180000); p.on('close', c => { clearTimeout(t); res({ c, o }); });
    });
    const ok = (sal.o.match(/^OK/gm) || []).length, fallas = sal.o.split('\n').filter(l => l.startsWith('FALLA'));
    resultados.push([f, sal.c === 0 ? 'OK' : 'FALLA', `${ok} ok, ${fallas.length} fallas`, fallas.slice(0, 5)]);
  } finally { srv.kill(); await dormir(300); }
}
for (const [f, e, d, fallas = []] of resultados) { console.log(f.padEnd(26), e.padEnd(10), d); fallas.forEach(x => console.log('    ' + x)); }
mysql(['-e', 'DROP DATABASE IF EXISTS oikos_prueba;']);
fs.rmSync(tmp, { recursive: true, force: true });
