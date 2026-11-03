# Migraciones de la base de datos

Cada cambio de la base (tabla, columna, índice o dato de catálogo) va aquí en un archivo **nuevo** `NNN_descripcion.sql`
(`001_agrega_columna_x.sql`, `002_...`): número de tres cifras, minúsculas y guiones bajos. Se aplican en orden y una sola vez cada uno;
`migraciones_aplicadas` guarda cuáles ya corrieron. La instalación actual (`mysql/esquema.sql` + `datos-iniciales.sql`) es el punto de partida: esta carpeta empieza vacía.

Reglas (están completas en `CLAUDE.md`):
- **Nunca se edita** una migración ya subida (el sistema lo detecta por el sha y se niega a seguir). Un error se corrige con una migración nueva.
- **Un cambio por archivo** y escrito para poder repetirse: `CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`, `ON DUPLICATE KEY UPDATE`.
  MySQL no deshace los cambios de estructura si algo falla a la mitad.
- **Nunca** `DROP`, `TRUNCATE` ni `DELETE` de datos sin una migración revisada a mano.
- También se actualiza `mysql/esquema.sql`, para que una instalación nueva nazca con el cambio.
- Una sentencia termina en `;`. No sirven `DELIMITER`, triggers ni procedimientos.
- Se prueba en el equipo con `php herramientas/migrar.php` antes del push. En el hosting las aplica `public/migrar.php` después de cada push.
