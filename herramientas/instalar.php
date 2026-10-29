<?php
// Instalación NUEVA de OIKOS (base MySQL vacía, sin datos anteriores). En consola:
//   php herramientas/instalar.php correo@empresa.com ClaveTemporal123
// Crea las tablas (mysql/esquema.sql), carga los datos iniciales de Metalcof (mysql/datos-iniciales.sql: procesos, catálogos,
// indicadores, mecanismos y cargos) y el usuario administrador, que deberá cambiar la clave al entrar.
// Si ya tienes datos en la versión anterior (sgi.db), NO uses esto: usa herramientas/migrar-sqlite-a-mysql.php.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../php/nucleo.php';

[, $correo, $clave] = $argv + [null, '', ''];
$correo = mb_strtolower(trim((string)$correo));
if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $correo) || strlen((string)$clave) < 8 || !preg_match('/[a-zA-Z]/', $clave) || !preg_match('/\d/', $clave)) {
    fwrite(STDERR, "Uso: php herramientas/instalar.php correo@empresa.com ClaveTemporal123\n(la clave: mínimo 8 caracteres, con letras y números)\n"); exit(1);
}
$pdo = bd();
if ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN)) { fwrite(STDERR, "La base de datos ya tiene tablas: la instalación es solo para una base vacía.\n"); exit(1); }

foreach (['esquema.sql', 'datos-iniciales.sql'] as $archivo) {
    $sql = preg_replace('/^--.*$/m', '', file_get_contents(__DIR__ . "/../mysql/$archivo"));
    foreach (preg_split('/;\s*\n/', $sql) as $s) if (trim($s) !== '') $pdo->exec($s);
    echo "Cargado mysql/$archivo\n";
}
$usuario = preg_replace('/[^a-z0-9._-]+/', '.', explode('@', $correo)[0]) ?: 'admin';
ejecutar("INSERT INTO usuarios (empresa_id, usuario, correo, nombre, cargo, rol, clave, activo, debe_cambiar) VALUES (1, ?, ?, 'Administrador', 'Administrador del sistema', 'admin', ?, 1, 1)",
    substr($usuario, 0, 30), $correo, hash_clave($clave));
echo "Listo. Ingresa con $correo y la clave que diste; el sistema te pedirá cambiarla.\n";
