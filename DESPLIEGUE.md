# Despliegue de OIKOS: PHP + MySQL (cPanel)

OIKOS es una aplicación **PHP 8.1+ con base de datos MySQL / MariaDB**. No necesita Node, Docker ni programas extra:
corre en cualquier hosting con cPanel.

```
Navegador ──HTTPS──▶ Apache (cPanel)
                       ├─ public/            ← raíz pública del subdominio: pantallas (HTML/CSS/JS)
                       │   └─ api/index.php  ← la API: todo lo que empieza por /api
                       ├─ php/               ← código del servidor y config.php (privado)
                       ├─ mysql/             ← esquema y datos iniciales (privado)
                       ├─ herramientas/      ← instalar, migrar, respaldar, restaurar (consola)
                       └─ datos/             ← adjuntos y copias de seguridad (privado)
                     MySQL (base «oikos»)
```

## Qué necesitas en el hosting
- **PHP 8.1 o superior**, con las extensiones `pdo_mysql`, `mbstring` y `phar` (vienen activas casi siempre).
  Se revisa en cPanel → «Select PHP Version» o «MultiPHP Manager».
- **MySQL 8.0.16+ o MariaDB 10.4+**.
- Un **subdominio** (ej. `oikos.metalcof.co`). Las pantallas llaman a la API con rutas relativas, pero la raíz pública debe ser `public/`.
- Para subir adjuntos grandes: `upload_max_filesize` y `post_max_size` de al menos 25M (cPanel → «MultiPHP INI Editor»).

## Primera instalación en cPanel
1. **Base de datos** — cPanel → «Bases de datos MySQL»: crea la base (ej. `usuario_oikos`), un usuario con clave y
   agrégalo a la base con **todos los privilegios**.
2. **Subir el código** a una carpeta **fuera de `public_html`**, por ejemplo `/home/USUARIO/oikos`
   (Git™ Version Control de cPanel o un ZIP con el «Administrador de archivos»). Solo hacen falta `public/`, `php/`, `mysql/` y `herramientas/`.
3. **Raíz del subdominio** — cPanel → «Dominios» → el subdominio → *Document Root*: `/home/USUARIO/oikos/public`.
4. **Configuración** — copia `php/config.ejemplo.php` como `php/config.php` y llena:
   `db_nombre`, `db_usuario`, `db_clave` (los del paso 1), `app_url` (`https://oikos.metalcof.co`) y, si quieres
   recuperación de clave por correo, los datos `smtp_*`. Deja `datos_dir` vacío (usa `oikos/datos`, fuera de la parte pública).
5. **Cargar los datos**, con la «Terminal» de cPanel (o por SSH), desde la carpeta `oikos`:
   - **Con los datos actuales** (lo normal): sube tu `sgi.db` y la carpeta `archivos/` de la versión anterior a una carpeta temporal y corre
     `php herramientas/migrar-sqlite-a-mysql.php /ruta/a/sgi.db`. Copia todo, comprueba que cada tabla cuadre y copia los adjuntos.
   - **Desde cero** (sin datos anteriores): `php herramientas/instalar.php correo@empresa.com ClaveTemporal123`.
     Crea las tablas, los procesos, catálogos, indicadores, mecanismos y cargos de Metalcof, y el administrador.
   - Sin Terminal: en phpMyAdmin importa `mysql/esquema.sql` y luego `mysql/datos-iniciales.sql`; el administrador se crea después
     con la Terminal o pidiéndole al hosting que corra `instalar.php`.
   - Más adelante, para crear otro administrador o recuperar el acceso si se pierden las claves:
     `php herramientas/crear-admin.php correo@empresa.com --nombre="Nombre Apellido"` (ver README, «Tu acceso de administrador»).
6. **HTTPS** — cPanel → «SSL/TLS Status» → AutoSSL para el subdominio.
7. Abre `https://oikos.metalcof.co/healthz`: debe responder `{"ok":true,"php":"8.x", "modulos":[…13 módulos…]}`.

## Copias de seguridad
- Cada copia es un `.tar.gz` con la base completa (`oikos.sql`) y los adjuntos. Se guardan en `datos/respaldos/` y se conservan las últimas 30 (`respaldos_conservar`).
- **Manual**: Administración → Respaldos → «Respaldar ahora», y desde ahí se descargan.
- **Diaria**: cPanel → «Cron Jobs» → `0 2 * * *  php /home/USUARIO/oikos/herramientas/respaldar.php`
  y en `config.php` pon `'respaldo_automatico' => true` para que la pantalla lo indique.
- **Guarda copias fuera del servidor** (descárgalas cada semana): si el servidor se pierde, las copias que están en él se pierden con él.
- **Restaurar**: `php herramientas/restaurar.php datos/respaldos/oikos-AAAA-MM-DD_HHMMSS.tar.gz`.
  Reemplaza toda la base y los adjuntos; antes guarda una copia del estado actual por si hay que deshacer.

## Actualizar el sistema
Trae el código nuevo (Pull en Git™ Version Control o sube los archivos). No hay nada que reiniciar: PHP toma los cambios al instante.
Si un cambio trae tablas o columnas nuevas, vendrá con su script en `mysql/` y se dirá en el mensaje de la actualización.
Comprueba con `/healthz` qué módulos tiene el servidor.

## En XAMPP (para trabajar en el equipo)
1. Base `oikos` en phpMyAdmin (o `herramientas/migrar-sqlite-a-mysql.php` / `instalar.php` como arriba).
2. `php/config.php` con `db_usuario` `root`, clave vacía y `app_url` `http://localhost/OIKOS`.
3. El `.htaccess` de la carpeta del proyecto manda todo a `public/`, así que se abre en `http://localhost/OIKOS/`.

## Seguridad: lista de verificación
- [ ] `php/config.php` tiene una clave de base de datos fuerte y no está en el repositorio (ya está en `.gitignore`).
- [ ] La raíz pública del subdominio es `public/` (no la carpeta del proyecto).
- [ ] HTTPS activo; la cookie de sesión se marca `Secure` automáticamente.
- [ ] El administrador cambió su clave temporal.
- [ ] Copia diaria programada en Cron y copias descargadas fuera del servidor.

## Variables de `php/config.php`
| Clave | Para qué sirve | Por defecto |
|---|---|---|
| `db_host`, `db_nombre`, `db_usuario`, `db_clave` | Conexión a MySQL | localhost / oikos / root / vacía |
| `datos_dir` | Carpeta de adjuntos y respaldos (fuera de la parte pública) | `datos/` junto a `php/` |
| `app_url` | Dirección pública; con ella se arman los enlaces de recuperación de clave | — |
| `sesion_horas` | Duración de la sesión | 12 |
| `smtp_host`, `smtp_puerto`, `smtp_usuario`, `smtp_clave`, `smtp_remitente` | Correo para «¿Olvidaste tu clave?» (587 STARTTLS o 465 SSL). En Gmail / Microsoft 365, una contraseña de aplicación. Sin `smtp_host` la petición le aparece al administrador | — |
| `respaldos_conservar`, `respaldo_automatico`, `respaldo_hora` | Copias de seguridad | 30 / false / 2 |

## Pruebas (solo desarrollo)
`node herramientas/correr-pruebas.mjs` corre las pruebas automáticas contra PHP + MySQL con una base temporal `oikos_prueba`
(necesita Node, PHP y MySQL en el equipo; nada de esto va al servidor).
