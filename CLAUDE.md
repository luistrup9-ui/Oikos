# OIKOS: reglas para quien trabaje en este repositorio

OIKOS es PHP 8.1+ con MySQL/MariaDB (ver `README.md`, `DESPLIEGUE.md`). Se publica en cPanel (https://metalcostos.co/oikos/);
cada push a `main` actualiza el hosting solo (en un minuto, con un cron: `herramientas/desplegar.sh`). El repositorio es público.

## Cambios de la base de datos

Todo cambio de la base (tabla, columna, índice o dato de catálogo que deba existir en el hosting) va en un archivo NUEVO
`mysql/migraciones/NNN_descripcion.sql`. Nunca editar una migración ya subida; nunca DROP, TRUNCATE ni DELETE de datos sin una
migración revisada a mano; también actualizar `mysql/esquema.sql`. Probar en local con `php herramientas/migrar.php` antes del push.
Los registros y adjuntos que se cargan en la pantalla de OIKOS NO van en git (el repo es público): los datos reales se cargan directo en metalcostos.

Cómo funciona y cómo escribirlas bien:
- Se aplican en orden y una sola vez cada una; `migraciones_aplicadas` (archivo, fecha, sha) lleva el registro. Si un archivo ya aplicado cambia, el sistema avisa y no hace nada.
- Un cambio por archivo y repetible sin daño (`CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`): MySQL no deshace el DDL si falla a la mitad.
- Antes de aplicar hay una copia de seguridad automática (base + adjuntos). Una migración que falla marca el despliegue como fallido (`/healthz` → `despliegue_ok: false`) y no se aplica ninguna de las siguientes.
- El divisor de sentencias entiende textos y comentarios, pero no `DELIMITER` (nada de triggers ni procedimientos).
- Una migración nueva que ya tenga número menor que la última aplicada se rechaza: usa un número mayor.
- En XAMPP de Windows: `C:\xampp\php\php.exe herramientas\migrar.php`.

## Datos y secretos
- `php/config.php`, `datos/` y `ACCESOS-LOCAL.md` están en `.gitignore`. Ninguna clave, token ni dato real se escribe en archivos del repositorio, commits ni issues.
- En el hosting, adjuntos y respaldos viven fuera de `public_html` (`datos_dir`); un push nunca los toca.

## Interfaz y seguridad del navegador
- La política de seguridad (`public/.htaccess`) no admite código escrito dentro del HTML: nada de `onclick=`, `onfocus=`, `onerror=`, `<script>` sin `src` ni `javascript:`. Ese código no se ejecuta y falla sin avisar.
  Para que una fila o un botón lleve a otra pantalla o imprima, usa `data-ir="#/ruta"` y `data-imprimir` (los atiende `public/app.js`); para lo demás, `addEventListener`. `prueba-csp.js` lo vigila.
- Los textos que escribe una persona se insertan en el HTML siempre con `esc(...)`.

## Despliegue
- El hosting NO recibe nada de GitHub: un cron de cPanel corre `herramientas/desplegar.sh` cada minuto, mira si `main` tiene un commit nuevo,
  lo trae (`git merge --ff-only`) y corre `herramientas/migrar.php`. (Un Action de GitHub no sirve: la protección Imunify360 del hosting bloquea sus llamadas a cPanel, y PHP no puede ejecutar `git` allí porque `exec` está desactivado.)
- Cómo saber si un push llegó: `https://metalcostos.co/oikos/healthz` dice `commit` (el del hosting; compáralo con el de GitHub), `migraciones_pendientes` (debe ser 0) y `despliegue_ok` (debe ser true).
  El detalle está en `oikos_datos/despliegue.log` (fuera de la web) y, si algo falla, cPanel manda un correo una sola vez por cada error.
- Las migraciones de un commit se intentan una sola vez; si fallan, se corrige con un commit nuevo. Un cambio hecho a mano en archivos del código del servidor hace que `git merge` se detenga: no se toca el código directo en el hosting.
- Commit y push los hace el usuario (GitHub Desktop) o los hace Claude solo si el usuario lo pide expresamente en ese momento.
