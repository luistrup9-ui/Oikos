# Despliegue del SGI en un servidor (HTTPS + copias de seguridad)

El sistema corre en un contenedor Docker. Delante va **Caddy**, que consigue y renueva solo el certificado HTTPS
(Let's Encrypt). Los datos viven en volúmenes aparte, así que actualizar el sistema no los toca.

```
Internet ──443──▶ Caddy (HTTPS) ──▶ SGI (puerto 3100, solo interno)
                                      ├─ volumen sgi-data: base de datos + archivos adjuntos
                                      └─ ./backups: copias de seguridad diarias
```

## Qué necesitas
- Un servidor Linux (Ubuntu 22.04 o 24.04), con 1 CPU y 1 GB de RAM alcanza para un equipo de decenas de usuarios.
- Un nombre de dominio, por ejemplo `sgi.metalcof.com`, con un **registro A** que apunte a la IP del servidor.
- Los puertos **80 y 443** abiertos (el 80 solo lo usa Caddy para validar el certificado).
- Docker con Compose: `curl -fsSL https://get.docker.com | sh`

## Primera instalación
1. Copia esta carpeta (`sgi`) al servidor, por ejemplo con `scp -r sgi usuario@IP:~/` o con git.
2. Crea tu configuración:
   ```bash
   cd sgi
   cp .env.example .env
   nano .env            # pon DOMINIO y CORREO_ADMIN
   ```
3. Prepara la carpeta de copias (el contenedor corre como usuario 1000, no como root):
   ```bash
   mkdir -p backups && sudo chown 1000:1000 backups
   ```
4. Arranca:
   ```bash
   docker compose up -d --build
   ```
5. Mira la clave temporal del administrador (si no pusiste `ADMIN_CLAVE_INICIAL` en `.env`):
   ```bash
   docker compose logs sgi | grep -A4 "Primer arranque"
   ```
6. Entra a `https://tu-dominio`, usuario `admin`, y cambia la clave cuando te la pida.
7. En **Administración → Usuarios** crea las cuentas del equipo. En **Importar datos** carga los documentos, riesgos y mediciones.

En producción **no se crean los usuarios de prueba**: el único usuario inicial es `admin`.

> Para probar en tu propio computador antes de subirlo al servidor: pon `DOMINIO=localhost` en `.env` y abre `https://localhost`
> (el navegador avisará del certificado local; es normal en esta prueba).

## Copias de seguridad
- **Automáticas:** cada día, pasadas las 2:00 a.m. (`BACKUP_HORA`), se crea un `.tar.gz` con la base de datos y los archivos adjuntos
  en `./backups`. Se conservan las últimas 30 (`BACKUP_KEEP`). La copia es consistente aunque haya gente usando el sistema.
- **Desde la aplicación:** el administrador ve, crea y descarga copias en **Administración → Respaldos**.
- **Manual por terminal:** `docker compose exec sgi node backup.js`
- **Una copia fuera del servidor es obligatoria.** Si el servidor se pierde, las copias que estaban dentro se pierden con él.
  Dos opciones sencillas:
  - Descargar una copia desde la aplicación cada semana y guardarla en otro lugar (Drive, disco externo).
  - Automatizarlo con [rclone](https://rclone.org) (Google Drive, OneDrive, S3…): configura `rclone config` una vez y agrega al cron del servidor
    (`crontab -e`): `30 3 * * * rclone copy ~/sgi/backups remote:sgi-copias --max-age 48h`

### Restaurar una copia
Practícalo una vez antes de necesitarlo. Restaura **con el sistema apagado**:
```bash
docker compose stop sgi
docker compose run --rm --no-deps sgi node restaurar.js /backups/sgi-2026-10-20_020000.tar.gz
docker compose start sgi
```
- Antes de reemplazar nada, guarda los datos actuales en `antes-de-restaurar-<fecha>` dentro del volumen de datos.
- Comprueba que la base de la copia esté sana; si está dañada, no toca nada.
- Para restaurar una copia que bajaste a tu computador, súbela a `./backups` del servidor primero.

## Actualizar el sistema
Copia los archivos nuevos al servidor y ejecuta:
```bash
docker compose up -d --build
```
Los datos se conservan (están en volúmenes). Haz una copia manual antes de actualizar si el cambio es grande.

## Seguridad: lista de verificación
- [ ] Cambiaste la clave del `admin` y creaste usuarios personales (no compartas la cuenta admin).
- [ ] El firewall solo permite 22, 80 y 443: `sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable`
- [ ] Acceso por SSH con llave y sin contraseña; actualizaciones automáticas: `sudo apt install unattended-upgrades`
- [ ] Hay una copia **fuera** del servidor y ya probaste restaurar.
- [ ] Monitoreo: apunta un servicio gratuito (UptimeRobot, Better Stack) a `https://tu-dominio/healthz`.

Ya viene incluido: HTTPS con renovación automática, cookies seguras, sesiones que vencen (12 h, `SESSION_HORAS`),
bloqueo de 15 minutos tras 5 claves incorrectas, claves guardadas con scrypt y cabeceras de seguridad.

## Variables (`.env`)
| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `DOMINIO` | Dirección pública del sistema | (obligatoria) |
| `CORREO_ADMIN` | Correo para avisos del certificado | (obligatoria) |
| `ADMIN_CLAVE_INICIAL` | Clave temporal de `admin` en el primer arranque | aleatoria, en el log |
| `SESSION_HORAS` | Duración de la sesión | 12 |
| `BACKUP_HORA` | Hora desde la que se hace la copia diaria | 2 |
| `BACKUP_KEEP` | Cuántas copias se conservan | 30 |
| `BACKUP_AUTO` | `0` desactiva la copia automática | activa en producción |
| `TZ` | Zona horaria | America/Bogota |

## Alternativa sin Docker
Necesitas Node 22.12 o superior, `tar` y un proxy con HTTPS (Caddy o Nginx).
```bash
npm ci --omit=dev
NODE_ENV=production DATA_DIR=/var/lib/sgi BACKUP_DIR=/var/backups/sgi TRUST_PROXY=1 HOST=127.0.0.1 node server.js
```
Déjalo como servicio con systemd (`/etc/systemd/system/sgi.service`):
```ini
[Unit]
Description=SGI
After=network.target

[Service]
WorkingDirectory=/opt/sgi
Environment=NODE_ENV=production DATA_DIR=/var/lib/sgi BACKUP_DIR=/var/backups/sgi TRUST_PROXY=1 HOST=127.0.0.1 TZ=America/Bogota
ExecStart=/usr/bin/node server.js
Restart=always
User=sgi

[Install]
WantedBy=multi-user.target
```
y en Caddy: `sgi.tuempresa.com { reverse_proxy 127.0.0.1:3100 }`.
Restaurar: `NODE_ENV=production DATA_DIR=/var/lib/sgi node restaurar.js /var/backups/sgi/<copia>.tar.gz` (con el servicio detenido).
