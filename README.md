# SGI — Gestión documental

Sistema independiente que replica la funcionalidad de gestión documental de Almera
(ver `../ESPECIFICACION.md`). Node.js 22+ con SQLite incluido, Express y JavaScript sin frameworks.

## Arrancar
```bash
npm install
node server.js        # http://localhost:3100
node prueba-flujo.js  # prueba de punta a punta (con el servidor corriendo y la base limpia)
node prueba-cuenta.js # Mi cuenta: perfil, foto, firma, contactos y permisos (igual: servidor corriendo y base limpia)
```
La base `sgi.db` se crea sola con los procesos de Metalcof. Para empezar de cero, borra `sgi.db` y la carpeta `archivos/`.

## Abrir con XAMPP: http://sgi.localhost/
Apache (XAMPP) recibe las peticiones y se las pasa a Node (puerto 3100). Doble clic en **`iniciar-sgi.bat`**: enciende Apache y SGI si hacen falta y abre el navegador.
La ventana minimizada «SGI» es el servidor: si la cierras, SGI se apaga (y Apache mostrará «SGI no está iniciado»; vuelve a ejecutar el `.bat`).
- La configuración de Apache está en `C:\xampp\apache\conf\extra\httpd-sgi.conf` y se carga desde `httpd-vhosts.conf` con una línea `Include`.
  Respaldos de los archivos originales: `*.sgi-bak-2026-10-20`. Para quitarlo: borra esa línea y reinicia Apache.
- No funciona como `http://localhost/almera-replica/`: SGI es una app Node, no PHP, y usa rutas absolutas (`/api/...`).
- Chrome, Edge y Firefox resuelven `*.localhost` solos. Con `curl` agrega `-H "Host: sgi.localhost"`.
- Detrás de HTTPS (producción) se usa Caddy; ver `DESPLIEGUE.md`.

## Estructura del frontend (`public/`)
JavaScript nativo con módulos ES: sin frameworks y sin paso de compilación. Aspecto de la familia SiGeDo (Plus Jakarta Sans + Sora, acento teal).
Detalle de las decisiones en `docs/superpowers/specs/2026-10-20-frontend-sgi-design.md`.
```
index.html          shell: login, menú lateral, contenido, diálogo y avisos; carga js/main.js
css/                tokens → base → layout → components → vistas → motion (capas @layer, en ese orden)
fonts/              Sora y Plus Jakarta Sans guardadas aquí (el CSP no permite fuentes externas)
img/                logos de la marca (estufas, ergonatura, metalcof) recortados del SVG de SiGeDo; el banner los muestra en blanco
js/main.js          arranque: aquí se listan, a mano y en orden, los módulos
js/core/            api · sesion · router (registro de módulos, menú y rutas)
js/ui/              componentes compartidos: tablas, KPIs, vacíos, esqueletos, iconos, modal, avisos, movimiento
js/modules/         inicio · documental · indicadores · riesgos · auditorias · admin · cuenta
js/compartido/      lógica que usan varios módulos (planes de acción, cambio de clave)
```
**Agregar un módulo**: crea `js/modules/mimodulo.js` que exporte `{ grupo, nav: [{ ruta, titulo, icono }], rutas: { nombre: async (arg, params) => … } }`
e impórtalo en `js/main.js`. El menú y las rutas salen de esa declaración. Opcionalmente aporta al Inicio con tres funciones:
`resumen()` (su mosaico: cifra, visual y pie), `plan()` (sus pendientes para «Mi plan de trabajo») y `buscar(texto)` (grupos de resultados para el buscador global).

Reglas que mantienen el CSP estricto (`script-src 'self'; style-src 'self'`): nada de `onclick` ni `style=""` en el HTML que se genera.
Navegar: `data-href` en la fila. Anchos dinámicos: `data-w` (lo convierte `movimiento.js` en la variable CSS `--w`). Imprimir: `data-imprimir`.
Las animaciones solo usan `transform` y `opacity`, ocurren al cambiar de vista (no al filtrar) y se apagan con `prefers-reduced-motion`.

## Usuarios de prueba
| Usuario | Clave | Rol |
|---|---|---|
| admin | admin123 | Administrador |
| calidad | calidad123 | Líder de Calidad (aprueba, devuelve, publica, resuelve solicitudes) |
| produccion | produccion123 | Líder de proceso de Producción (elabora y envía a revisión) |
| consulta | consulta123 | Solo ve documentos vigentes |

Cambia estas claves antes de usarlo en serio.

## Qué incluye
- **Inicio**: **banner de marca** (verde Estufas Ecoeficientes `#028080`/`#00a39f` y naranja Metalcof `#fa9f06`, según el manual de identidad, con los logos de Estufas, Ergonatura y Metalcof en una sola tinta blanca, Ergonatura al centro) con los botones **Inicio** y **Mi cuenta**, saludo, **buscador global** (documentos, indicadores, riesgos, controles, evaluaciones, hallazgos y acciones; atajo `/`),
  un **mosaico por módulo** con su cifra principal y estado, y **Mi plan de trabajo** agrupado por módulo (transiciones, solicitudes, vencimientos, mediciones atrasadas, evaluaciones y acciones).
- **Mi cuenta** (`#/cuenta`, desde el banner o desde el nombre en el menú lateral): foto y **firma** del usuario (PNG, JPG o WebP; 2 MB la foto y 1 MB la firma),
  correo, hasta 5 números de contacto, preferencias de notificación, **alerta temprana** (días que se muestran los documentos por vencer en el Inicio),
  **página de inicio** (la que se abre al entrar) y cambio de clave. La firma solo la ven su dueño, Calidad y administración; la foto la ve toda la empresa.
  Las imágenes se reconocen por su contenido (no se aceptan SVG), viven en `archivos/usuarios/` y **entran en los respaldos**. Los avisos por correo todavía no se envían: las preferencias quedan guardadas para cuando se configure el correo.
- **Mapa de procesos**: Estratégico, Misional y Apoyo, con el conteo de documentos vigentes.
- **Listado maestro**: filtros por tipo, proceso, clase, origen, estado y fechas. Exporta a CSV.
- **Ficha del documento**: flujo visual, archivos por versión y trazabilidad completa.
- **Flujo**: Elaboración → Revisión → Publicación → Vigente (más Eliminado). Al iniciar una modificación se abre una versión nueva.
  Los estados y transiciones están en las tablas `estados` y `transiciones`, así que se pueden configurar.
- **Solicitudes** de creación, modificación y eliminación, con aprobación de Calidad.
- **Listado maestro de registros**: retención, disposición final, ubicación, etc.
- **Estadísticas**: documentos por estado y por proceso, y reporte de transiciones con filtros.

## Indicadores y cuadro de mando
- **Cuadro de mando** (`#/tablero`): plan estratégico → 4 perspectivas BSC → objetivos → indicadores.
  El cumplimiento de un objetivo es el promedio del cumplimiento de sus indicadores (tope 100 %).
- **Indicadores** (`#/indicadores`): hoja de vida (fórmula, frecuencia, sentido, meta, tolerancia, responsable), tendencia y periodos sin medir.
- **Ficha del indicador**: gráfica de resultado contra meta, registro y corrección de mediciones, y planes de acción.
  - El cálculo puede ser por numerador/denominador o por valor directo.
  - El análisis es obligatorio cuando el resultado no cumple la meta.
  - No se pueden registrar periodos que todavía no han ocurrido.
- **Semáforo**: verde si cumple. Amarillo si queda dentro de la tolerancia (por defecto 10 % de la meta). Rojo si no.
  En los indicadores descendentes la regla se invierte.
- **Seguimiento** (`#/seguimiento`): árbol Categoría → Proceso → Indicador con medición previa, último valor y meta, como el "Seguimiento MOP" de Almera.
  Se exporta a CSV o se imprime a PDF.
- **Permisos**: Calidad crea y edita indicadores y objetivos. Mide el responsable del indicador o el líder del proceso. Consulta solo ve.
- **Mi plan de trabajo** muestra también las mediciones atrasadas.
- **Datos iniciales**: los 15 indicadores que Metalcof tiene en Almera, con las mediciones 2026 de agua y energía tomadas de allí.
  Las fórmulas son de referencia; ajústalas.

Pruebas: `node prueba-indicadores.js` (servidor corriendo y base limpia).

## Riesgos y controles
- **Matriz de riesgos** (`#/riesgos`):
  - Filtros por proceso, tipo (los 10 de Metalcof) y zona.
  - Mapa de calor 5×5 con vista de riesgo absoluto o residual. Al hacer clic en una casilla se filtra la lista.
  - Distribución por proceso o por tipo, con opción de apilar al 100 %. Exporta a CSV.
- **Escalas**:
  - Probabilidad: 1 Rara vez … 5 Casi seguro.
  - Impacto: 1 Insignificante … 5 Catastrófico.
  - Zona según P×I: Baja (1–4), Moderada (5–9), Alta (10–14), Extrema (15–25).
- **Riesgo residual**: cada control baja 2 niveles si es fuerte, 1 si es moderado y 0 si es débil.
  Baja la probabilidad, el impacto o ambos, según lo que mitigue, sin bajar de 1.
- **Ficha del riesgo**:
  - Recorrido absoluto → controles → residual.
  - Controles: clasificación, efectividad, frecuencia, evidencia, responsables de gestión y de revisión.
  - Reporte mensual de ejecución (monitoreo) y planes de acción.
- **Controles** (`#/controles`): listado de todos los controles con filtros por proceso, clasificación y responsable. Exporta a CSV.
- **Permisos**:
  - Calidad: todo.
  - Líder de proceso: los riesgos y controles de su proceso.
  - Responsable de un control: puede reportar su ejecución.
  - Consulta: solo ve.
- **Datos iniciales**: 3 riesgos marcados "(Ejemplo)". Reemplázalos por los de la matriz ES-GER-MAT-05 real.

Pruebas: `node prueba-riesgos.js` (servidor corriendo y base limpia).

## Evaluaciones (auditorías) y acciones correctivas
- **Evaluaciones** (`#/auditorias`):
  - Programa por año, con tipo (interna, externa, autoevaluación, inspección).
  - Evaluador: Coordinador de Calidad, Dueños de proceso o Externo.
  - Filtros por proceso y estado.
- **Flujo de la evaluación**: Planeación → Ejecución → Evaluación → Terminada.
  - Para pasar a Ejecución hacen falta procesos, auditor y lista de verificación.
  - Para pasar a Evaluación hay que tener todas las preguntas respondidas.
  - Para terminar hacen falta conclusiones. Solo Calidad termina.
- **Lista de verificación**: preguntas propias o la plantilla ISO 9001 (10 numerales por proceso), con agenda por proceso.
  Responder "No conforme" u "Observación" genera el hallazgo automáticamente.
- **Hallazgos**: vienen de auditorías o de otras fuentes (quejas, indicadores, riesgos, producto no conforme…).
  Tipos: NC mayor, NC menor, observación y oportunidad de mejora.
- **Acciones**: Análisis → Ejecución → Verificación → Cerrada.
  - Para ejecutar hace falta la causa raíz (5 porqués, Ishikawa…) y al menos una actividad.
  - Cada actividad cumplida exige evidencia.
  - Calidad verifica la eficacia, nunca el mismo responsable de la acción. Si no fue eficaz, la acción se reabre y queda contada.
  - Se marcan las acciones vencidas y todo queda en la trazabilidad.
- **Estadísticas**: abiertas, vencidas, eficaces, reaperturas, % de eficacia (sirve para el indicador IND-SIG-02) y hallazgos por proceso.
- **Mi plan de trabajo** muestra las acciones a tu cargo, las que esperan verificación y las evaluaciones donde eres auditor.

Pruebas: `node prueba-auditorias.js` (servidor corriendo y base limpia).

## Administración: usuarios e importación (`#/admin`)
- **Usuarios** (solo el administrador): crear, editar rol y proceso, restablecer clave, desactivar y reactivar.
  - La clave temporal se muestra una sola vez y se debe cambiar al primer ingreso.
  - Desactivar o cambiar el rol cierra las sesiones abiertas del usuario.
  - Siempre debe quedar al menos un administrador activo.
- **Mi clave** (botón de la barra superior): mínimo 8 caracteres, con letras y números.
- **Seguridad del ingreso**: 5 intentos fallidos bloquean ese usuario durante 15 minutos.
- **Importar datos** (Calidad y administrador), desde CSV (guarda tu Excel como CSV):
  - Tipos: usuarios (solo administrador), documentos del listado maestro, riesgos, controles y mediciones históricas de indicadores.
  - El archivo se revisa fila por fila y solo se importa si **todas** las filas son válidas.
  - Cada tipo tiene su plantilla descargable.
  - Aceptan coma decimal, fechas AAAA-MM-DD o DD/MM/AAAA, y nombre o sigla de proceso, tipo y clase.
  - Los documentos importados entran como Vigentes, sin archivo adjunto.
  - Orden recomendado: usuarios → documentos → riesgos → controles → mediciones.

Pruebas: `node prueba-admin.js` (servidor corriendo y base limpia).

## Puesta en producción
La guía completa está en **[DESPLIEGUE.md](DESPLIEGUE.md)**: Docker + Caddy con HTTPS automático, copias de seguridad diarias,
restauración, actualización y lista de seguridad.

- Con `NODE_ENV=production` no se crean los usuarios de prueba: solo `admin`, con la clave de `ADMIN_CLAVE_INICIAL` o una al azar en el log.
- **Respaldos**: `node backup.js`, automáticos cada día, o desde Administración → Respaldos.
  Restaurar: `node restaurar.js <copia>.tar.gz` con el sistema apagado.
- `/healthz` responde sin sesión, para monitoreo.

Pruebas: `node prueba-produccion.js` (no toca tus datos: usa carpetas temporales y sus propios servidores).
