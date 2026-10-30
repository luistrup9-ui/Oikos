# OIKOS — Sistema de Gestión Integral

Sistema que replica la gestión documental, de procesos, indicadores, riesgos, auditorías y mecanismos de integración de Almera.
**PHP 8.1+ con MySQL / MariaDB** en el servidor (pensado para cPanel) y JavaScript sin frameworks en las pantallas.

## Estructura
| Carpeta | Qué tiene |
|---|---|
| `public/` | Lo único público: las pantallas (`index.html`, `*.js`, `styles.css`) y la API en `public/api/index.php` |
| `php/` | El servidor: `nucleo.php` (base de datos, sesión, enrutador), `alcance.php` (qué ve cada rol), `modulos/*.php` (un archivo por módulo) y `config.php` |
| `mysql/` | `esquema.sql` (todas las tablas), `datos-iniciales.sql` (Metalcof sin usuarios) y `datos-prueba.sql` (base de desarrollo con cuentas de prueba) |
| `herramientas/` | `instalar.php`, `crear-admin.php`, `migrar-sqlite-a-mysql.php`, `respaldar.php`, `restaurar.php`, `servidor-local.php` y `correr-pruebas.mjs` |

## Arrancar en el equipo (XAMPP)
1. Crea la base `oikos` y carga los datos: `php herramientas/instalar.php correo@empresa.com ClaveTemporal123`
   (base nueva) o `php herramientas/migrar-sqlite-a-mysql.php ruta/a/sgi.db` (datos de la versión anterior).
   Para la base de desarrollo con cuentas de prueba: importa `mysql/esquema.sql` y `mysql/datos-prueba.sql`.
2. Copia `php/config.ejemplo.php` como `php/config.php` y ajusta la conexión.
3. Abre `http://localhost/OIKOS/` (el `.htaccess` del proyecto manda todo a `public/`).

Sin Apache: `php -S 127.0.0.1:8080 -t public herramientas/servidor-local.php` y abre `http://127.0.0.1:8080/`.
Para el servidor (cPanel) ver `DESPLIEGUE.md`.

> La versión anterior en Node.js (`server.js`, `*.js` de la raíz, `sgi.db`) quedó como referencia mientras se valida la versión PHP;
> no se usa ni se sube al servidor. Las pruebas `prueba-*.js` se corren contra PHP con `node herramientas/correr-pruebas.mjs`.

## Usuarios de prueba
La base de **desarrollo** (`mysql/datos-prueba.sql`) trae una cuenta por rol. Se ingresa con el correo (o con el usuario) y la clave:

| Correo | Usuario | Clave | Rol |
|---|---|---|---|
| admin@oikos.test | admin | admin123 | Administrador |
| gestor@oikos.test | gestor | gestor123 | Gestor de Calidad |
| lider@oikos.test | lider | lider123 | Líder (del proceso Producción) |
| colaborador@oikos.test | colaborador | colaborador123 | Colaborador |

El dominio `.test` está reservado: esos correos nunca llegan a una bandeja real. Todas piden cambiar la clave al primer ingreso.
En una instalación real no hay cuentas de prueba: `herramientas/instalar.php` crea solo el administrador con el correo y la clave temporal que le des.
Las claves que venían de la versión Node siguen sirviendo; al ingresar se vuelven a guardar con el cifrado de PHP.

## Tu acceso de administrador (y qué hacer si lo pierdes)
Los accesos de la base en uso (usuario, correo y clave de cada administrador) están en **`ACCESOS-LOCAL.md`**, en la raíz del proyecto.
Git lo ignora a propósito: este repositorio es público, y una clave escrita aquí la leería cualquiera. Si el repositorio pasa a ser privado,
puedes pegar esa tabla en este README.

Para crear otro administrador, o recuperar el acceso a uno que ya existe (también si se olvidaron todas las claves), en la consola del proyecto:
```
php herramientas/crear-admin.php correo@empresa.com --nombre="Nombre Apellido" --clave=MiClave123
php herramientas/crear-admin.php admin
```
- Con un correo que no existe crea el administrador; con un usuario o correo que ya existe lo deja como administrador activo y le pone la clave nueva.
- Sin `--clave` genera una y la muestra. La clave queda como la diste (no pide cambiarla al entrar) y se quitan bloqueos y sesiones viejas.
- En XAMPP de Windows: `C:\xampp\php\php.exe herramientas\crear-admin.php …`. En cPanel, en la Terminal o con quien administre el hosting.
- Después, en Administración → Usuarios, puedes desactivar las cuentas que ya no uses (siempre debe quedar un administrador activo).

## Guardar los datos que vas poniendo
Todo lo que cambias en OIKOS se guarda al instante en MySQL (base `oikos`, en `C:\xampp\mysql\data\oikos`) y sigue ahí al apagar el equipo.
Para tener además un archivo `.sql` (por si XAMPP se daña, o para llevar los datos a otro MySQL):
- Doble clic en `herramientas\guardar-datos.bat` (o `php herramientas/exportar-sql.php`): escribe `datos/oikos-datos.sql` con toda la base, sin las
  sesiones abiertas ni las fichas de recuperación de clave. Reemplaza al anterior; hazlo cada vez que quieras fijar una versión.
- Los adjuntos viven en `datos/archivos/`. Administración → Respaldos crea un `.tar.gz` con la base **y** los adjuntos juntos.
- **Estos archivos no suben con `push`**: `datos/` está en `.gitignore` porque el repositorio es público y el volcado trae datos reales y las claves
  cifradas de todos los usuarios.
- Para llevar los datos a cPanel: phpMyAdmin → la base → *Importar* → `oikos-datos.sql`; o subir un respaldo `.tar.gz` a `datos/respaldos/` del
  servidor y correr `php herramientas/restaurar.php datos/respaldos/<copia>.tar.gz`.

## Roles y alcance
| Rol | Qué ve | Qué puede hacer |
|---|---|---|
| Administrador | Todo | Todo lo del Gestor de Calidad, más **crear y editar usuarios** (correo, rol, proceso, clave), **crear procesos y subprocesos** y **asignar quién lidera cada proceso** (Administración → Usuarios y → Procesos) |
| Gestor de Calidad | Todo | Aprobar, devolver y publicar documentos, editar la ficha de cualquier proceso, gestionar indicadores, riesgos, evaluaciones y mecanismos |
| Líder | El mapa y la ficha de **todos** los procesos, y los documentos vigentes, registros y glosario de todos. De **los procesos y subprocesos que tenga marcados**: borradores, indicadores, riesgos y controles, evaluaciones, hallazgos, acciones, estadísticas y cuadro de mando. Mecanismos, actas y compromisos: solo aquellos de los que hace parte | Gestionar lo de sus procesos y editar el contenido de sus fichas (el nombre, el código y el tipo los define Calidad). No edita otros procesos |
| Colaborador | Consulta los documentos vigentes, registros, indicadores, riesgos y controles, evaluaciones, hallazgos, acciones y cuadro de mando; no ve solicitudes, ni los mecanismos, actas y compromisos de los que no hace parte | Solo consulta |

- El rol Líder se le da a cada persona según su cargo. En Usuarios → Editar se le marcan los **procesos y subprocesos** que lidera, en una lista donde cada proceso despliega los suyos; al marcar un proceso se marcan sus subprocesos y se pueden desmarcar uno por uno. Un subproceso creado después no entra solo.
- Una persona puede liderar varios procesos y un proceso puede tener varios líderes (tabla `usuario_procesos`). En Administración → Procesos, «Asignar líder» suma ese proceso (con sus subprocesos) y la × quita solo ese; quien se queda sin procesos pasa a Colaborador.
- «Hace parte» de un mecanismo = integrante, coordinador, convocado a un acta o responsable de un compromiso.
- En la base los roles conservan sus claves internas (`admin`, `lider_calidad`, `lider_proceso`, `consulta`); solo cambiaron los nombres que se ven.
- Las reglas de alcance están en `php/alcance.php` (`propios`, `lidera`, `ve`, `filtro`); los módulos del servidor las reutilizan.

## Cargos
- Administración → **Cargos**: la estructura de cargos (como «Cargos» de Almera) con código OIKOS `CAR-<sigla del área>-<número>` (ej. `CAR-GPR-27` = Operario), área, jefe inmediato (otro cargo) y personas.
- Se crean, editan (incluido activar/desactivar) y se asignan personas con «Personas». Si cambia quien ocupa un cargo, se reasigna ahí: el código, el área y el jefe se conservan. Una persona ocupa un cargo.
- La primera vez se cargan solos los 48 cargos de Metalcof tomados de Almera, con sus jefes, y se asignan las personas que ya son usuarios por su nombre (`php/semillas.php`). El cargo «Responsable del proceso de servicios generales» no tenía número en Almera: quedó `CAR-MTC-47`.
- En Usuarios → Editar el cargo se elige de la lista; quien tenía un cargo escrito a mano lo conserva hasta que se le elija uno.

## Ingreso con correo y recuperación de la clave
- Cada persona ingresa con su **correo corporativo** (el usuario interno, que se deduce del correo, también sirve). El correo es único.
- El administrador crea y edita usuarios en Administración → Usuarios. Para cargar correos a usuarios ya creados:
  «Completar correos» (asigna `usuario@dominio` a quien no tiene) o Importar datos → «Correos de usuarios que ya existen».
- **Restablecer clave** (administrador): genera una clave temporal que se entrega una vez y se cambia al primer ingreso.
- **¿Olvidaste tu clave?** (en la pantalla de ingreso):
  - Con correo configurado, llega un enlace de un solo uso que vale 60 minutos. En `php/config.php`: `smtp_host`, `smtp_puerto` (587; 465 = conexión segura),
    `smtp_usuario`, `smtp_clave` (en Gmail o Microsoft 365 suele ser una «contraseña de aplicación»), `smtp_remitente` y `app_url`
    (dirección con la que se abre OIKOS, p. ej. `https://oikos.metalcof.co`). Ver `php/correo.php`.
  - Sin correo configurado, la petición le aparece al administrador en Usuarios («Pidió restablecer su clave») y él entrega una temporal.
  - La respuesta es la misma exista o no el correo, y hay límite de pedidos por hora.

## Qué incluye
- **Mi plan de trabajo**: transiciones pendientes, solicitudes por resolver y documentos por vencer.
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
- **Permisos**: Calidad crea y edita indicadores y objetivos. Mide el responsable del indicador o el Líder del proceso. El Colaborador solo consulta.
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
  - Líder: los riesgos y controles de su proceso y sus subprocesos.
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
  - Tipos: usuarios y correos de usuarios existentes (solo administrador; un Líder importado queda con su proceso y los subprocesos de ese proceso), documentos del listado maestro, riesgos, controles y mediciones históricas de indicadores.
  - El archivo se revisa fila por fila y solo se importa si **todas** las filas son válidas.
  - Cada tipo tiene su plantilla descargable.
  - Aceptan coma decimal, fechas AAAA-MM-DD o DD/MM/AAAA, y nombre o sigla de proceso, tipo y clase.
  - Los documentos importados entran como Vigentes, sin archivo adjunto.
  - Orden recomendado: usuarios → documentos → riesgos → controles → mediciones.

Pruebas: `node prueba-admin.js` (servidor corriendo y base limpia).

## Armazón (igual a Almera)

La interfaz sigue la organización de Almera: menú gris arriba con los desplegables Gestión de Calidad, Documentos, Riesgos y Cuadro de Mando; panel izquierdo (ancho ajustable arrastrando el divisor) con logo, usuario y las pestañas Plan Individual, Sistemas, Buscar y Admin; y el contenido al centro. Los listados se paginan de 15 en 15 y sus columnas se ordenan con un clic, y las listas de selección múltiple se muestran como el "Seleccione" de Almera. Todo esto vive en `public/armazon.js` y `public/styles.css`.

El logo de Estufas Ecoeficientes ya está en `public/logo.png`; si se borra, vuelve a mostrarse el nombre de la empresa.

## Mecanismos de integración (`#/mecanismos`)

Igual a Almera (ver `../MECANISMOS-Y-PROCESOS-ALMERA.md`):
- **Administración** (`#/mecanismos`): filtros por tipo, estado y fechas; pestañas *Mecanismos de Integración* (ID, tipo, nombre, # actas, administradores, otros, activo), *Seguimiento compromisos* (actas, actividades, cerradas, cumplimiento, invitados, asistentes, asistencia) y *Actas* (listado global exportable a XLSX/CSV). Calidad adiciona Comités, Comités Primarios o Reuniones. Vienen cargados los 18 mecanismos que Metalcof tiene en Almera (sin actas).
- **Configuración**: nombre, tipo, coordinador, periodicidad, objetivo, miembros, funciones; integrantes (Principal/Suplente, privilegio Administrador / Administrador - Miembro / Miembro, "puede adicionar actas"); opciones de las actas (lugar, tipo de reunión, asistentes, control de asistencia, compromisos, arrastrar compromisos abiertos, miembros adicionan compromisos…) y codificación automática con patrón (`%C` consecutivo con padding, `%M` mes, `%Y` año; ej. `COPASST%C`) o manual.
- **Ficha** (`#/mecanismo/N`): Información General, Actas (por año), Seguimiento (compromisos por estado, fecha y acta) y Estadísticas (sesiones, asistencia, cumplimiento y cierre a tiempo).
- **Acta** (`#/acta/N`): Planeación (fecha, horas, lugar, tipo de reunión, asistentes con "Asiste", agenda, adjuntos), Desarrollo (contenido y adjuntos, p. ej. la plantilla Word del comité) y Compromisos (responsables, fecha fin, avance, días de adelanto/atraso y avance ponderado; con "arrastrar", los abiertos de actas anteriores). Cerrar, anular y reabrir solo lo hacen los administradores; un acta cerrada o anulada no se edita y la anulada no cuenta en las estadísticas.
- **Compromiso** (`#/compromiso/N`): Información general y Seguimientos. Cada seguimiento lleva porcentaje (0–100, obligatorio), fecha, descripción y archivo opcional; con 100 % queda Terminada. Se reprograma con nueva fecha y causa (queda el historial). Estados: Planeación (sin seguimientos), Ejecución, Terminada.
- **Mi Plan de Trabajo**: árbol Mecanismos de Integración → Comités / Comités Primarios / Reuniones → cada mecanismo, y "Mis compromisos" abiertos.

Pruebas: `node prueba-mecanismos.js` (servidor corriendo; crea su propio comité de prueba y al final lo deja inactivo).

**Datos reales de Almera**: `node importar-almera-mecanismos.js ../datos-almera/mecanismos-actas.json` simula y `--aplicar` importa actas, asistentes, compromisos y seguimientos exportados de Almera. Asocia los comités por nombre, pone cada compromiso en su acta de origen, deja a los asistentes como integrantes y crea las personas que no existen (rol consulta, sin clave utilizable hasta que un administrador la asigne). No duplica si se ejecuta otra vez (guarda el ID de Almera). Los archivos adjuntos no se traen: su nombre queda anotado en el desarrollo del acta. Importado el 2026-10-23: 43 actas, 207 compromisos y 248 seguimientos; los 14 comités cuadran con Almera.

## Documentos de procesos → Listado maestro

`node importar-documentos-de-procesos.js --aplicar` convierte en documentos reales (estado Vigente) las 304 referencias que trajo la importación de procesos (tabla `proceso_documentacion`; no vuelve a tocar Almera, usa lo que ya está en la base). La mayoría de esas referencias en Almera solo traen el código (ej. `ES-PRO-FOR-01`), sin el título del documento; esos quedan con el nombre **"(sin confirmar)"** para que alguien los complete a mano desde la ficha del documento. Cuando el código y el título venían juntos (ej. "ES-PRO-FOR-07 Control e Inspección de Obra Blanca") se separan bien. Lo que no tenía forma de código (materias primas del almacén, algunos registros) se guarda con su nombre tal cual y un código propio generado. Importado el 2026-10-26: 294 documentos nuevos. Además se crearon 3 indicadores reales que faltaban (código y nombre confirmados por Almera: ES-GCO-FTE-05, ES-PRO-FTE-01, ES-MAN-FTE-01); como Almera no entregó su meta ni frecuencia reales, quedaron con valores neutros y una nota "Pendiente de configurar" en su propósito, para no confundirlos con datos reales.

## Seguimiento al MOP (`#/seguimiento`)

Reporte igual al de Almera: árbol Estratégico / Misional / Apoyo → proceso → indicador, con "+ Expandir / - Colapsar", mini gráfica del año, medición previa, flecha Mejor/Peor (según el sentido del indicador), último valor en el color del semáforo, meta y semáforo. "Exportar" pide el formato (XLSX o CSV) y descarga desde `/api/mop/exportar?anio=&formato=`; el archivo trae además los valores de cada mes del año (cada periodo en el mes en que cierra). El XLSX se genera sin librerías (`xlsx.js`). El botón de impresora imprime solo el reporte, con todo expandido.

Pruebas: `node prueba-mop.js` (servidor corriendo).

## Ficha de caracterización de procesos (`#/proceso/N`)

Igual a Almera (ver `../MECANISMOS-Y-PROCESOS-ALMERA.md`): encabezado con código, fecha y versión; franja Estratégico/Misional/Apoyo; secciones plegables (Objetivo, Dueño, Alcance, Recursos, Documentos y registros asociados, Requisitos aplicables, y las propias de cada ficha); indicadores con su código real; subprocesos; documentación relacionada; y la tabla de entradas y salidas (Proveedor | Entrada | Actividad con ciclo P/H/V/A | Salida | Cliente), que enlaza al subproceso cuando corresponde. Pestañas Matriz de Riesgos, Medición y Planes de mejora reusan los listados de esos módulos filtrados por proceso. Historial con cada edición como una nueva versión. Solo Calidad edita, y debe describir el cambio.

**Datos reales de Almera**: `node importar-almera-procesos.js ../DATA/procesos-almera.json` simula y `--aplicar` importa los 16 procesos y 13 subprocesos/procedimientos. Empareja por nombre, crea los subprocesos bajo su proceso, enlaza las entradas y salidas al subproceso correspondiente, y actualiza el código de los indicadores de la réplica al código real de Almera (moviendo el indicador de proceso si hace falta). Un proceso que ya se editó en la réplica (versión > 1) no se sobrescribe salvo con `--forzar`. Importado el 2026-10-26.

## Glosario y buscador global

- **Glosario** (`#/glosario`): términos con descripción, fuente (ej. ISO 9000:2015, 3.12.2) y glosario al que pertenecen. Filtro por texto, glosario y letra inicial. Solo Calidad y Administración crean, editan o quitan términos; el resto los consulta. No se repite un término dentro del mismo glosario.
- **Buscador global** (caja "Buscar…" de la barra superior o `#/buscar?q=`): busca a la vez en documentos (menos los eliminados), registros, glosario, riesgos, controles, indicadores, evaluaciones y acciones de mejora. No distingue tildes ni mayúsculas ("accion" encuentra "Acción"). Cada resultado lleva a su ficha.

Pruebas: `node prueba-glosario.js` (servidor corriendo; crea y borra su propio término, así que funciona también con una base usada).

## Puesta en producción
La guía completa está en **[DESPLIEGUE.md](DESPLIEGUE.md)**: cPanel con PHP + MySQL, HTTPS, copias de seguridad, restauración, actualización y lista de seguridad.

- **Instalar**: `php herramientas/instalar.php correo@empresa.com ClaveTemporal123` (base vacía) o `php herramientas/migrar-sqlite-a-mysql.php sgi.db` (datos anteriores).
- **Respaldos**: Administración → Respaldos, o `php herramientas/respaldar.php` (en el Cron de cPanel, cada día). Restaurar: `php herramientas/restaurar.php <copia>.tar.gz`.
- `/healthz` responde sin sesión, para monitoreo, y dice qué módulos tiene el servidor.

Pruebas (desarrollo): `node herramientas/correr-pruebas.mjs` corre las pruebas de la API contra PHP + MySQL con una base temporal.
Las líneas «Pruebas: node prueba-…» de las secciones de arriba se corren hoy con ese comando.
