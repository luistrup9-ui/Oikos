# OIKOS: reglas para quien trabaje en este repositorio

OIKOS es PHP 8.1+ con MySQL/MariaDB (ver `README.md`, `DESPLIEGUE.md`). Se publica en cPanel (https://metalcostos.co/oikos/);
cada push a `main` actualiza el hosting solo (`.github/workflows/deploy-cpanel.yml`). El repositorio es público.

## Cambios de la base de datos

Todo cambio de la base (tabla, columna, índice o dato de catálogo que deba existir en el hosting) va en un archivo NUEVO
`mysql/migraciones/NNN_descripcion.sql`. Nunca editar una migración ya subida; nunca DROP, TRUNCATE ni DELETE de datos sin una
migración revisada a mano; también actualizar `mysql/esquema.sql`. Probar en local con `php herramientas/migrar.php` antes del push.
Los registros y adjuntos que se cargan en la pantalla de OIKOS NO van en git (el repo es público): los datos reales se cargan directo en metalcostos.

Cómo funciona y cómo escribirlas bien:
- Se aplican en orden y una sola vez cada una; `migraciones_aplicadas` (archivo, fecha, sha) lleva el registro. Si un archivo ya aplicado cambia, el sistema avisa y no hace nada.
- Un cambio por archivo y repetible sin daño (`CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`): MySQL no deshace el DDL si falla a la mitad.
- Antes de aplicar hay una copia de seguridad automática (base + adjuntos). Una migración que falla deja el Action en rojo y no se aplica ninguna de las siguientes.
- El divisor de sentencias entiende textos y comentarios, pero no `DELIMITER` (nada de triggers ni procedimientos).
- Una migración nueva que ya tenga número menor que la última aplicada se rechaza: usa un número mayor.
- En XAMPP de Windows: `C:\xampp\php\php.exe herramientas\migrar.php`.

## Datos y secretos
- `php/config.php`, `datos/` y `ACCESOS-LOCAL.md` están en `.gitignore`. Ninguna clave, token ni dato real se escribe en archivos del repositorio, commits ni issues.
- En el hosting, adjuntos y respaldos viven fuera de `public_html` (`datos_dir`); un push nunca los toca.

## Despliegue
- Un push a `main` trae el código al hosting, aplica las migraciones (`public/migrar.php`, con el token) y comprueba `/healthz` (ok y 0 pendientes).
- Si el Action sale en rojo, se ve en la pestaña Actions de GitHub; el mensaje dice en qué paso falló.
- Commit y push los hace el usuario (GitHub Desktop) o los hace Claude solo si el usuario lo pide expresamente en ese momento.
