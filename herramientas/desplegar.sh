#!/bin/bash
# Despliegue por jalón (pull): lo corre el Cron de cPanel cada minuto. Si GitHub tiene un commit nuevo en main, lo trae a esta carpeta
# (solo avance: nunca pisa cambios) y corre las migraciones de la base (herramientas/migrar.php, en un proceso nuevo para usar el código nuevo).
#   * * * * *  /bin/bash /home/USUARIO/public_html/oikos/herramientas/desplegar.sh
# Es la alternativa al Action de GitHub: la protección del hosting (Imunify360) bloquea las llamadas de GitHub a cPanel, y PHP no puede
# ejecutar git en ese hosting (exec está desactivado), por eso es un script de bash.
# Sin novedades no escribe nada. Si algo falla lo escribe en STDERR (cPanel lo manda por correo) una sola vez por cada error distinto, y
# las migraciones de un commit se intentan UNA sola vez (se vuelven a intentar cuando llegue otro commit), para no llenar el disco de respaldos.
# Registro y estado en la carpeta de datos (datos_dir de php/config.php): despliegue.log, despliegue.migrado (commit ya migrado),
# despliegue.fallo (commit cuya migración falló) y despliegue.error (existe solo si el último despliegue falló).
# /healthz muestra el commit del hosting y si el último despliegue salió bien.
# Variables opcionales: OIKOS_PHP (php de línea de comandos) y OIKOS_GIT (git).
set -u

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PHP="${OIKOS_PHP:-}"
if [ -z "$PHP" ]; then for p in /usr/local/bin/ea-php85 /usr/local/bin/php; do [ -x "$p" ] && PHP="$p" && break; done; fi
PHP="${PHP:-php}"
GIT=git
for g in "${OIKOS_GIT:-}" /usr/local/cpanel/3rdparty/bin/git /usr/bin/git; do [ -n "$g" ] && [ -x "$g" ] && GIT="$g" && break; done

# Carpeta de datos: la misma que usa la aplicación (fuera de public_html)
DATOS="$("$PHP" -r '$c = require $argv[1]; echo rtrim($c["datos_dir"] ?: dirname($argv[1], 2) . "/datos", "/\\");' "$RAIZ/php/config.php" 2>/dev/null)"
if [ -z "$DATOS" ]; then echo "OIKOS despliegue: no pude leer datos_dir de php/config.php (¿falta el archivo?)" >&2; exit 1; fi
mkdir -p "$DATOS"
LOG="$DATOS/despliegue.log"

registrar() {
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 300000 ]; then tail -c 100000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi # no crece sin fin
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG"
}
fallar() {
  registrar "ERROR: $1"
  if [ "$(cat "$DATOS/despliegue.error" 2>/dev/null)" != "$1" ]; then echo "OIKOS despliegue: $1" >&2; fi # se avisa una vez por cada error distinto
  printf '%s' "$1" > "$DATOS/despliegue.error"
  exit 1
}

# Una sola ejecución a la vez: si la anterior sigue trabajando, esta se va sin hacer nada
if command -v flock >/dev/null 2>&1; then exec 9>"$DATOS/despliegue.lock"; flock -n 9 || exit 0; fi

export GIT_TERMINAL_PROMPT=0 # nunca se queda esperando una clave
g() { "$GIT" -C "$RAIZ" "$@"; }

ACTUAL="$(g rev-parse HEAD 2>&1)" || fallar "esta carpeta no es un repositorio de git: $ACTUAL"
SALIDA="$(g -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60 fetch --quiet origin main 2>&1)" || fallar "no pude consultar GitHub (git fetch): $SALIDA"
REMOTO="$(g rev-parse origin/main 2>&1)" || fallar "no encuentro origin/main: $REMOTO"

if [ "$REMOTO" != "$ACTUAL" ]; then
  g merge-base --is-ancestor "$ACTUAL" "$REMOTO" || fallar "el main de GitHub no continúa desde el commit de esta carpeta (¿push forzado?); no se tocó nada"
  SALIDA="$(g merge --ff-only --quiet origin/main 2>&1)" || fallar "no pude traer el código (git merge): $SALIDA"
  registrar "Código actualizado: ${ACTUAL:0:7} -> ${REMOTO:0:7}"
  ACTUAL="$REMOTO"
fi

# Migraciones: una sola vez por commit (también la primera vez, para dejar el registro al día)
if [ "$(cat "$DATOS/despliegue.migrado" 2>/dev/null)" != "$ACTUAL" ]; then
  TEXTO="$("$PHP" "$RAIZ/herramientas/migrar.php" 2>&1)"; CODIGO=$?
  printf '%s' "$ACTUAL" > "$DATOS/despliegue.migrado"
  if [ "$CODIGO" -ne 0 ]; then
    printf '%s' "$ACTUAL" > "$DATOS/despliegue.fallo" # este commit quedó con migración fallida: el error sigue hasta que llegue otro
    fallar "las migraciones fallaron en el commit ${ACTUAL:0:7}: $TEXTO"
  fi
  case "$TEXTO" in *"No hay migraciones pendientes"*) ;; *) registrar "Migraciones: $TEXTO";; esac
fi

if [ -f "$DATOS/despliegue.error" ]; then
  if [ "$(cat "$DATOS/despliegue.fallo" 2>/dev/null)" = "$ACTUAL" ]; then exit 1; fi # sigue el mismo commit fallido: nada que avisar
  registrar "Recuperado: el último despliegue salió bien"; rm -f "$DATOS/despliegue.error" "$DATOS/despliegue.fallo"
fi
exit 0
