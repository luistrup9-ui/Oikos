-- OIKOS — esquema MySQL / MariaDB (MySQL 8.0.16+ o MariaDB 10.4+).
-- Mismas tablas y columnas que tenía la versión SQLite, para que el sistema y sus datos pasen sin cambios.
-- Fechas: las columnas con valor automático son DATETIME (en UTC); las demás fechas se guardan como texto
-- 'AAAA-MM-DD' o 'AAAA-MM-DD HH:MM:SS', igual que antes, porque el sistema las compara como texto.
-- Importar en cPanel: phpMyAdmin → la base → Importar → este archivo.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS empresas (id INT PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(200) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS procesos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, nombre VARCHAR(255) NOT NULL, sigla VARCHAR(20) NOT NULL,
  categoria VARCHAR(20) NOT NULL CHECK (categoria IN ('Estratégico','Misional','Apoyo')), orden INT,
  padre_id INT, tipo VARCHAR(30) NOT NULL DEFAULT 'Proceso', codigo VARCHAR(80), version INT NOT NULL DEFAULT 1,
  fecha VARCHAR(30), almera_id INT, modificado VARCHAR(30),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id), FOREIGN KEY (padre_id) REFERENCES procesos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cargos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL, area_sigla VARCHAR(10) NOT NULL, area VARCHAR(200) NOT NULL,
  numero INT NOT NULL, nombre VARCHAR(255) NOT NULL, jefe_id INT, activo TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY cargos_codigo (empresa_id, area_sigla, numero),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id), FOREIGN KEY (jefe_id) REFERENCES cargos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, usuario VARCHAR(60) NOT NULL, nombre VARCHAR(200) NOT NULL, cargo VARCHAR(255),
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin','lider_calidad','lider_proceso','consulta')),
  proceso_id INT, clave VARCHAR(200) NOT NULL, activo TINYINT NOT NULL DEFAULT 1, debe_cambiar TINYINT NOT NULL DEFAULT 0,
  correo VARCHAR(120), reinicio_solicitado VARCHAR(30), cargo_id INT,
  UNIQUE KEY usuarios_usuario (usuario), UNIQUE KEY usuarios_correo (correo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id), FOREIGN KEY (cargo_id) REFERENCES cargos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_procesos (
  usuario_id INT NOT NULL, proceso_id INT NOT NULL, PRIMARY KEY (usuario_id, proceso_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id), FOREIGN KEY (proceso_id) REFERENCES procesos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones (
  token VARCHAR(64) PRIMARY KEY, usuario_id INT, creada DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reinicios_clave (
  id INT PRIMARY KEY AUTO_INCREMENT, usuario_id INT NOT NULL, token_hash VARCHAR(64) NOT NULL, creado VARCHAR(30) NOT NULL,
  vence VARCHAR(30) NOT NULL, usado VARCHAR(30), UNIQUE KEY reinicios_token (token_hash),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nuevas en la versión PHP: lo que Node guardaba en memoria (cada petición PHP empieza de cero)
CREATE TABLE IF NOT EXISTS intentos_login (clave VARCHAR(190) PRIMARY KEY, n INT NOT NULL, hasta BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS pedidos_clave (id INT PRIMARY KEY AUTO_INCREMENT, clave VARCHAR(190) NOT NULL, momento BIGINT NOT NULL, KEY pedidos_clave_clave (clave)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tipos_documento (id INT PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(200) NOT NULL, sigla VARCHAR(20) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS clases_documento (id INT PRIMARY KEY AUTO_INCREMENT, nombre VARCHAR(200) NOT NULL, sigla VARCHAR(20) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS estados (id VARCHAR(30) PRIMARY KEY, nombre VARCHAR(200) NOT NULL, orden INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS transiciones (
  id VARCHAR(40) PRIMARY KEY, nombre VARCHAR(200) NOT NULL, desde VARCHAR(30), hacia VARCHAR(30) NOT NULL, roles VARCHAR(200) NOT NULL,
  nueva_version TINYINT DEFAULT 0,
  pos INT NOT NULL AUTO_INCREMENT UNIQUE, -- orden en que se definieron (SQLite lo daba solo); las consultas ordenan por pos
  FOREIGN KEY (hacia) REFERENCES estados(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documentos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, codigo VARCHAR(120), nombre VARCHAR(500) NOT NULL,
  tipo_id INT, clase_id INT, proceso_id INT, origen VARCHAR(30) DEFAULT 'Interno', descripcion TEXT, responsable_id INT,
  estado VARCHAR(30) NOT NULL, version INT DEFAULT 1, fecha_documento VARCHAR(30), fecha_vencimiento VARCHAR(30),
  creado DATETIME DEFAULT CURRENT_TIMESTAMP, modificado DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY documentos_codigo (codigo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id), FOREIGN KEY (tipo_id) REFERENCES tipos_documento(id),
  FOREIGN KEY (clase_id) REFERENCES clases_documento(id), FOREIGN KEY (proceso_id) REFERENCES procesos(id),
  FOREIGN KEY (responsable_id) REFERENCES usuarios(id), FOREIGN KEY (estado) REFERENCES estados(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documento_versiones (
  id INT PRIMARY KEY AUTO_INCREMENT, documento_id INT, version INT, archivo VARCHAR(255), archivo_nombre VARCHAR(500), cambios TEXT,
  usuario_id INT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (documento_id) REFERENCES documentos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bitacora (
  id INT PRIMARY KEY AUTO_INCREMENT, documento_id INT, version INT, transicion_id VARCHAR(40), estado_inicial VARCHAR(30),
  estado_final VARCHAR(30), usuario_id INT, comentario TEXT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (documento_id) REFERENCES documentos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS solicitudes (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT,
  tipo_solicitud VARCHAR(20) NOT NULL CHECK (tipo_solicitud IN ('Creación','Modificación','Eliminación')),
  documento_id INT, tipo_id INT, clase_id INT, proceso_id INT, nombre VARCHAR(500) NOT NULL, justificacion TEXT NOT NULL, descripcion TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','Aprobada','Rechazada')),
  solicitante_id INT, revisor_id INT, respuesta TEXT, creada DATETIME DEFAULT CURRENT_TIMESTAMP, resuelta VARCHAR(30),
  FOREIGN KEY (documento_id) REFERENCES documentos(id), FOREIGN KEY (solicitante_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registros (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, documento_id INT, nombre VARCHAR(500) NOT NULL, proceso_id INT,
  responsable_cargo VARCHAR(255), responsable_area VARCHAR(255), medio VARCHAR(255), ubicacion VARCHAR(255),
  tiempo_retencion VARCHAR(255), disposicion_final VARCHAR(255), recuperacion VARCHAR(255),
  FOREIGN KEY (documento_id) REFERENCES documentos(id), FOREIGN KEY (proceso_id) REFERENCES procesos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Indicadores y cuadro de mando ----------
CREATE TABLE IF NOT EXISTS planes_estrategicos (id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, nombre VARCHAR(255) NOT NULL, anio_inicio INT, anio_fin INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS perspectivas (
  id INT PRIMARY KEY AUTO_INCREMENT, plan_id INT, nombre VARCHAR(255) NOT NULL, orden INT,
  FOREIGN KEY (plan_id) REFERENCES planes_estrategicos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS objetivos (
  id INT PRIMARY KEY AUTO_INCREMENT, perspectiva_id INT, codigo VARCHAR(80), nombre VARCHAR(500) NOT NULL, descripcion TEXT, responsable_id INT,
  FOREIGN KEY (perspectiva_id) REFERENCES perspectivas(id) ON DELETE CASCADE, FOREIGN KEY (responsable_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS indicadores (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, proceso_id INT, objetivo_id INT, codigo VARCHAR(80), nombre VARCHAR(500) NOT NULL,
  proposito TEXT, formula TEXT,
  calculo VARCHAR(20) NOT NULL DEFAULT 'directo' CHECK (calculo IN ('directo','razon')),
  unidad VARCHAR(10) NOT NULL DEFAULT '%' CHECK (unidad IN ('%','#','$','días','horas')),
  frecuencia VARCHAR(20) NOT NULL DEFAULT 'Mensual' CHECK (frecuencia IN ('Mensual','Bimestral','Trimestral','Semestral','Anual')),
  sentido VARCHAR(20) NOT NULL DEFAULT 'Ascendente' CHECK (sentido IN ('Ascendente','Descendente')),
  meta DOUBLE NOT NULL, tolerancia DOUBLE NOT NULL DEFAULT 10, responsable_id INT, fuente TEXT, activo TINYINT DEFAULT 1,
  FOREIGN KEY (proceso_id) REFERENCES procesos(id), FOREIGN KEY (objetivo_id) REFERENCES objetivos(id) ON DELETE SET NULL,
  FOREIGN KEY (responsable_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS mediciones (
  id INT PRIMARY KEY AUTO_INCREMENT, indicador_id INT, anio INT NOT NULL, periodo INT NOT NULL, numerador DOUBLE, denominador DOUBLE,
  valor DOUBLE NOT NULL, meta DOUBLE, analisis TEXT, usuario_id INT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY mediciones_periodo (indicador_id, anio, periodo),
  FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Riesgos ----------
CREATE TABLE IF NOT EXISTS riesgos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, codigo VARCHAR(80), proceso_id INT, tipo VARCHAR(100) NOT NULL, nombre VARCHAR(500) NOT NULL,
  descripcion TEXT, causas TEXT, consecuencias TEXT,
  probabilidad INT NOT NULL CHECK (probabilidad BETWEEN 1 AND 5), impacto INT NOT NULL CHECK (impacto BETWEEN 1 AND 5),
  tratamiento VARCHAR(20) DEFAULT 'Reducir' CHECK (tratamiento IN ('Aceptar','Reducir','Evitar','Compartir')),
  responsable_id INT, activo TINYINT DEFAULT 1, creado DATETIME DEFAULT CURRENT_TIMESTAMP, modificado DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proceso_id) REFERENCES procesos(id), FOREIGN KEY (responsable_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS controles (
  id INT PRIMARY KEY AUTO_INCREMENT, riesgo_id INT, codigo VARCHAR(80), descripcion TEXT NOT NULL,
  clasificacion VARCHAR(20) NOT NULL CHECK (clasificacion IN ('Preventivo','Detectivo','Correctivo')),
  mitiga_probabilidad TINYINT DEFAULT 0, mitiga_impacto TINYINT DEFAULT 0,
  efectividad VARCHAR(20) NOT NULL DEFAULT 'Moderado' CHECK (efectividad IN ('Fuerte','Moderado','Débil')),
  frecuencia VARCHAR(100), documentado TINYINT DEFAULT 0, evidencia TEXT, responsable_gestion_id INT, responsable_revision_id INT,
  FOREIGN KEY (riesgo_id) REFERENCES riesgos(id) ON DELETE CASCADE,
  FOREIGN KEY (responsable_gestion_id) REFERENCES usuarios(id), FOREIGN KEY (responsable_revision_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS monitoreos (
  id INT PRIMARY KEY AUTO_INCREMENT, control_id INT, periodo VARCHAR(20) NOT NULL, ejecutado TINYINT NOT NULL, observacion TEXT,
  usuario_id INT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY monitoreos_periodo (control_id, periodo),
  FOREIGN KEY (control_id) REFERENCES controles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS planes_accion (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, objetivo_id INT, indicador_id INT, nombre VARCHAR(500) NOT NULL, responsable_id INT,
  fecha_inicio VARCHAR(30), fecha_fin VARCHAR(30), avance DOUBLE DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'Abierto' CHECK (estado IN ('Abierto','En curso','Cerrado')), observaciones TEXT, riesgo_id INT,
  FOREIGN KEY (objetivo_id) REFERENCES objetivos(id) ON DELETE CASCADE, FOREIGN KEY (indicador_id) REFERENCES indicadores(id) ON DELETE CASCADE,
  FOREIGN KEY (responsable_id) REFERENCES usuarios(id), FOREIGN KEY (riesgo_id) REFERENCES riesgos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Auditorías y mejora ----------
CREATE TABLE IF NOT EXISTS evaluaciones (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, codigo VARCHAR(80), anio INT NOT NULL,
  tipo VARCHAR(40) NOT NULL CHECK (tipo IN ('Auditoría interna','Auditoría externa','Autoevaluación','Inspección')),
  nombre VARCHAR(500) NOT NULL, objetivo TEXT, alcance TEXT, criterios TEXT,
  evaluador VARCHAR(40) NOT NULL DEFAULT 'Coordinador de Calidad' CHECK (evaluador IN ('Coordinador de Calidad','Dueños de proceso','Externo')),
  auditor_id INT, auditor_externo VARCHAR(255), fecha_inicio VARCHAR(30), fecha_fin VARCHAR(30),
  estado VARCHAR(20) NOT NULL DEFAULT 'Planeación' CHECK (estado IN ('Planeación','Ejecución','Evaluación','Terminada')),
  conclusiones TEXT, creado DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (auditor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS evaluacion_procesos (
  evaluacion_id INT NOT NULL, proceso_id INT NOT NULL, fecha VARCHAR(30), auditado_id INT, PRIMARY KEY (evaluacion_id, proceso_id),
  FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE, FOREIGN KEY (proceso_id) REFERENCES procesos(id),
  FOREIGN KEY (auditado_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS verificacion_items (
  id INT PRIMARY KEY AUTO_INCREMENT, evaluacion_id INT, proceso_id INT, requisito TEXT, pregunta TEXT NOT NULL,
  resultado VARCHAR(20) CHECK (resultado IN ('Conforme','No conforme','Observación','No aplica')), evidencia TEXT,
  FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE, FOREIGN KEY (proceso_id) REFERENCES procesos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hallazgos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, codigo VARCHAR(80), evaluacion_id INT, item_id INT, origen VARCHAR(100) NOT NULL, proceso_id INT,
  tipo VARCHAR(40) NOT NULL CHECK (tipo IN ('No conformidad mayor','No conformidad menor','Observación','Oportunidad de mejora')),
  requisito TEXT, descripcion TEXT NOT NULL, evidencia TEXT, usuario_id INT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE SET NULL, FOREIGN KEY (item_id) REFERENCES verificacion_items(id) ON DELETE SET NULL,
  FOREIGN KEY (proceso_id) REFERENCES procesos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS acciones (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, codigo VARCHAR(80), hallazgo_id INT,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('Corrección','Acción correctiva','Acción de mejora')),
  correccion TEXT, metodo_causa VARCHAR(100), analisis_causa TEXT, causa_raiz TEXT, responsable_id INT, fecha_compromiso VARCHAR(30),
  estado VARCHAR(20) NOT NULL DEFAULT 'Análisis' CHECK (estado IN ('Análisis','Ejecución','Verificación','Cerrada')),
  eficaz TINYINT, verificacion TEXT, verificador_id INT, fecha_cierre VARCHAR(30), reaperturas INT DEFAULT 0, creado DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hallazgo_id) REFERENCES hallazgos(id) ON DELETE CASCADE, FOREIGN KEY (responsable_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS actividades (
  id INT PRIMARY KEY AUTO_INCREMENT, accion_id INT, descripcion TEXT NOT NULL, responsable_id INT, fecha VARCHAR(30),
  cumplida TINYINT DEFAULT 0, evidencia TEXT, fecha_cumplida VARCHAR(30),
  FOREIGN KEY (accion_id) REFERENCES acciones(id) ON DELETE CASCADE, FOREIGN KEY (responsable_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS acciones_bitacora (
  id INT PRIMARY KEY AUTO_INCREMENT, accion_id INT, evento VARCHAR(255), comentario TEXT, usuario_id INT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (accion_id) REFERENCES acciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Glosario ----------
CREATE TABLE IF NOT EXISTS glosario (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, glosario VARCHAR(150) NOT NULL DEFAULT 'General', termino VARCHAR(200) NOT NULL,
  descripcion TEXT NOT NULL, fuente TEXT, creado DATETIME DEFAULT CURRENT_TIMESTAMP, modificado DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY glosario_termino (empresa_id, glosario, termino)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Mecanismos de integración, actas y compromisos ----------
CREATE TABLE IF NOT EXISTS mecanismos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT, tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('Comité','Comité Primario','Reunión')),
  nombre VARCHAR(500) NOT NULL, activo TINYINT NOT NULL DEFAULT 1, coordinador_id INT,
  periodicidad VARCHAR(20) CHECK (periodicidad IN ('Anual','Bimestral','Eventual','Mensual','Quincenal','Semanal','Semestral','Trimestral')),
  objetivo TEXT, miembros TEXT, funciones TEXT,
  indicar_lugar TINYINT DEFAULT 1, mostrar_tipo TINYINT DEFAULT 1, indicar_asistentes TINYINT DEFAULT 1, control_asistencia TINYINT DEFAULT 1,
  tiene_compromisos TINYINT DEFAULT 1, control_compromisos TINYINT DEFAULT 1, arrastrar_compromisos TINYINT DEFAULT 1,
  miembros_compromisos TINYINT DEFAULT 1, notificar_cierre TINYINT DEFAULT 1, dias_recordatorio INT DEFAULT 1,
  codificacion VARCHAR(10) NOT NULL DEFAULT 'Auto' CHECK (codificacion IN ('Auto','Manual')),
  patron VARCHAR(100) DEFAULT '%C', padding INT DEFAULT 3, consecutivo INT NOT NULL DEFAULT 0, creado DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (coordinador_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS mecanismo_integrantes (
  id INT PRIMARY KEY AUTO_INCREMENT, mecanismo_id INT, usuario_id INT,
  calidad VARCHAR(20) NOT NULL DEFAULT 'Principal' CHECK (calidad IN ('Principal','Suplente')),
  privilegio VARCHAR(40) NOT NULL DEFAULT 'Miembro' CHECK (privilegio IN ('Administrador','Administrador - Miembro','Miembro')),
  adiciona_actas TINYINT DEFAULT 0, UNIQUE KEY integrante_unico (mecanismo_id, usuario_id),
  FOREIGN KEY (mecanismo_id) REFERENCES mecanismos(id) ON DELETE CASCADE, FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS actas (
  id INT PRIMARY KEY AUTO_INCREMENT, mecanismo_id INT, consecutivo INT, codigo VARCHAR(120), fecha VARCHAR(30) NOT NULL,
  hora_inicio VARCHAR(10), hora_fin VARCHAR(10), lugar VARCHAR(255),
  tipo_reunion VARCHAR(20) DEFAULT 'Ordinaria' CHECK (tipo_reunion IN ('Ordinaria','Extraordinaria')),
  agenda MEDIUMTEXT, desarrollo MEDIUMTEXT, estado VARCHAR(20) NOT NULL DEFAULT 'Abierta' CHECK (estado IN ('Abierta','Cerrada','Anulada')),
  autor_id INT, creado DATETIME DEFAULT CURRENT_TIMESTAMP, cerrada VARCHAR(30), almera_id INT,
  FOREIGN KEY (mecanismo_id) REFERENCES mecanismos(id) ON DELETE CASCADE, FOREIGN KEY (autor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS acta_asistentes (
  id INT PRIMARY KEY AUTO_INCREMENT, acta_id INT, usuario_id INT, nombre VARCHAR(255) NOT NULL, cargo VARCHAR(255), area VARCHAR(255),
  asiste TINYINT DEFAULT 1,
  FOREIGN KEY (acta_id) REFERENCES actas(id) ON DELETE CASCADE, FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS acta_archivos (
  id INT PRIMARY KEY AUTO_INCREMENT, acta_id INT, archivo VARCHAR(255), nombre VARCHAR(500), tamano INT, parte VARCHAR(30) DEFAULT 'Planeación',
  usuario_id INT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (acta_id) REFERENCES actas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS compromisos (
  id INT PRIMARY KEY AUTO_INCREMENT, acta_id INT, mecanismo_id INT, numero INT, nombre VARCHAR(1000) NOT NULL, descripcion MEDIUMTEXT,
  fecha_fin VARCHAR(30) NOT NULL, fecha_fin_inicial VARCHAR(30), avance DOUBLE NOT NULL DEFAULT 0, fecha_terminacion VARCHAR(30),
  creado DATETIME DEFAULT CURRENT_TIMESTAMP, almera_id INT,
  FOREIGN KEY (acta_id) REFERENCES actas(id) ON DELETE CASCADE, FOREIGN KEY (mecanismo_id) REFERENCES mecanismos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS compromiso_responsables (
  compromiso_id INT NOT NULL, usuario_id INT NOT NULL, PRIMARY KEY (compromiso_id, usuario_id),
  FOREIGN KEY (compromiso_id) REFERENCES compromisos(id) ON DELETE CASCADE, FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS compromiso_seguimientos (
  id INT PRIMARY KEY AUTO_INCREMENT, compromiso_id INT, fecha VARCHAR(30) NOT NULL, avance DOUBLE NOT NULL, descripcion MEDIUMTEXT NOT NULL,
  archivo VARCHAR(255), archivo_nombre VARCHAR(500), usuario_id INT, registrado DATETIME DEFAULT CURRENT_TIMESTAMP, almera_id INT,
  FOREIGN KEY (compromiso_id) REFERENCES compromisos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS compromiso_reprogramaciones (
  id INT PRIMARY KEY AUTO_INCREMENT, compromiso_id INT, fecha_anterior VARCHAR(30), fecha_nueva VARCHAR(30) NOT NULL, causa TEXT NOT NULL,
  usuario_id INT, registrado DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (compromiso_id) REFERENCES compromisos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Caracterización de procesos ----------
CREATE TABLE IF NOT EXISTS proceso_secciones (
  id INT PRIMARY KEY AUTO_INCREMENT, proceso_id INT, orden INT, titulo VARCHAR(255) NOT NULL, texto MEDIUMTEXT,
  FOREIGN KEY (proceso_id) REFERENCES procesos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS proceso_es (
  id INT PRIMARY KEY AUTO_INCREMENT, proceso_id INT, orden INT, actividad TEXT NOT NULL,
  ciclo CHAR(1) CHECK (ciclo IN ('P','H','V','A')), subproceso_id INT, entradas MEDIUMTEXT NOT NULL, salidas MEDIUMTEXT NOT NULL,
  FOREIGN KEY (proceso_id) REFERENCES procesos(id) ON DELETE CASCADE, FOREIGN KEY (subproceso_id) REFERENCES procesos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS proceso_documentacion (
  id INT PRIMARY KEY AUTO_INCREMENT, proceso_id INT, clase VARCHAR(255), nombre VARCHAR(1000) NOT NULL,
  FOREIGN KEY (proceso_id) REFERENCES procesos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS proceso_versiones (
  id INT PRIMARY KEY AUTO_INCREMENT, proceso_id INT, version INT, fecha VARCHAR(30), usuario_id INT, comentario TEXT, contenido MEDIUMTEXT,
  FOREIGN KEY (proceso_id) REFERENCES procesos(id) ON DELETE CASCADE, FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
