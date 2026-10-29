-- Datos de una base nueva de DESARROLLO (cuentas de prueba admin/gestor/lider/colaborador, riesgos e indicadores de ejemplo).
-- Lo usan las pruebas automáticas. NO cargar en el servidor real.
SET NAMES utf8mb4; SET FOREIGN_KEY_CHECKS = 0;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;








INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (1,1,'GG','Gerencia General',1,'Gerente General',NULL,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (2,1,'GG','Gerencia General',36,'Asesor de Proyectos',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (3,1,'GG','Gerencia General',37,'Asesor de Apoyo',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (4,1,'GG','Gerencia General',41,'Asesor Jurídico',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (5,1,'GG','Gerencia General',44,'Revisor Fiscal',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (6,1,'GC','Gerencia Comercial',2,'Gerente Comercial',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (7,1,'GC','Gerencia Comercial',4,'Líder Comercial y Marketing Digital',6,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (8,1,'GC','Gerencia Comercial',5,'Asistente Comercial',7,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (9,1,'GC','Gerencia Comercial',6,'Asesor Comercial',7,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (10,1,'GC','Gerencia Comercial',7,'Líder de Identidad Corporativa',6,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (11,1,'GC','Gerencia Comercial',8,'Diseñador Gráfico',10,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (12,1,'GC','Gerencia Comercial',9,'Líder de Logística y Distribución',6,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (13,1,'GC','Gerencia Comercial',10,'Operador de Logística y Distribución',12,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (14,1,'GC','Gerencia Comercial',11,'Operario de Transporte',12,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (15,1,'GC','Gerencia Comercial',40,'Asesor de Marketing Digital',6,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (16,1,'GCAL','Gestión de Calidad',3,'Coordinador de Calidad',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (17,1,'GCAL','Gestión de Calidad',35,'Coordinador Sistema Integral de Gestión',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (18,1,'GCAL','Gestión de Calidad',48,'Gestor de Calidad',17,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (19,1,'GAF','Gerencia Administrativa y Financiera',12,'Líder de Gestión Documental',NULL,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (20,1,'GAF','Gerencia Administrativa y Financiera',14,'Coordinador de Talento Humano',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (21,1,'GAF','Gerencia Administrativa y Financiera',13,'Líder de Seguridad y Salud en el Trabajo',20,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (22,1,'GAF','Gerencia Administrativa y Financiera',15,'Asistente de Talento Humano',20,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (23,1,'GAF','Gerencia Administrativa y Financiera',16,'Auxiliar Documental',20,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (24,1,'GAF','Gerencia Administrativa y Financiera',17,'Analista de Formación, Desarrollo y Calidad de Vida',20,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (25,1,'GAF','Gerencia Administrativa y Financiera',18,'Psicólogo',20,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (26,1,'GAF','Gerencia Administrativa y Financiera',19,'Auxiliar de Contratación',20,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (27,1,'GAF','Gerencia Administrativa y Financiera',20,'Analista de Nómina',20,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (28,1,'GAF','Gerencia Administrativa y Financiera',33,'Auxiliar de Servicios Generales',20,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (29,1,'GAF','Gerencia Administrativa y Financiera',34,'Tesorera',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (30,1,'GAF','Gerencia Administrativa y Financiera',35,'Auxiliar de Tesorería',29,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (31,1,'GAF','Gerencia Administrativa y Financiera',36,'Contadora',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (32,1,'GAF','Gerencia Administrativa y Financiera',37,'Auxiliar Contable',31,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (33,1,'GPR','Gerencia de Producción',38,'Gerente de Producción',1,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (34,1,'GPR','Gerencia de Producción',21,'Jefe de Mantenimiento',33,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (35,1,'GPR','Gerencia de Producción',22,'Auxiliar de Mantenimiento',34,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (36,1,'GPR','Gerencia de Producción',23,'Operario de Maquinaria y Mantenimiento',34,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (37,1,'GPR','Gerencia de Producción',24,'Jefe de Producción',33,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (38,1,'GPR','Gerencia de Producción',25,'Supervisor de Alistamiento y Calidad',37,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (39,1,'GPR','Gerencia de Producción',26,'Operario Soldador',37,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (40,1,'GPR','Gerencia de Producción',27,'Operario',37,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (41,1,'GPR','Gerencia de Producción',28,'Líder de Almacén, Compras y Activos Fijos',33,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (42,1,'GPR','Gerencia de Producción',29,'Auxiliar de Almacén',41,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (43,1,'GPR','Gerencia de Producción',30,'Auxiliar de Compras y Activos Fijos',41,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (44,1,'GPR','Gerencia de Producción',31,'Líder de Diseño y Desarrollo de Producto',33,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (45,1,'GPR','Gerencia de Producción',32,'Líder de Desarrollo e Innovación de Proyectos',33,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (46,1,'GPR','Gerencia de Producción',42,'Auxiliar de Logística y Distribución',37,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (47,1,'GPR','Gerencia de Producción',46,'Diseñador Industrial',33,1);
INSERT INTO `cargos` (`id`, `empresa_id`, `area_sigla`, `area`, `numero`, `nombre`, `jefe_id`, `activo`) VALUES (48,1,'MTC','Metalcof',47,'Responsable del proceso de servicios generales',NULL,1);

INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (1,'Formatos','FOR');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (2,'Guías','GUI');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (3,'Instructivos','INS');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (4,'Manuales','MAN');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (5,'Caracterización','CAR');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (6,'Documentos de área','DOC');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (7,'Matrices','MAT');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (8,'Programas','PRG');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (9,'Políticas','POL');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (10,'Procedimientos','PRO');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (11,'Protocolo','PRT');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (12,'Registro','REG');
INSERT INTO `clases_documento` (`id`, `nombre`, `sigla`) VALUES (13,'Planes','PLA');





INSERT INTO `controles` (`id`, `riesgo_id`, `codigo`, `descripcion`, `clasificacion`, `mitiga_probabilidad`, `mitiga_impacto`, `efectividad`, `frecuencia`, `documentado`, `evidencia`, `responsable_gestion_id`, `responsable_revision_id`) VALUES (1,1,'C-PRO-01','Inspección de soldadura en cada lote','Detectivo',1,0,'Fuerte','Por lote',1,NULL,3,2);
INSERT INTO `controles` (`id`, `riesgo_id`, `codigo`, `descripcion`, `clasificacion`, `mitiga_probabilidad`, `mitiga_impacto`, `efectividad`, `frecuencia`, `documentado`, `evidencia`, `responsable_gestion_id`, `responsable_revision_id`) VALUES (2,1,'C-PRO-02','Plan de mantenimiento preventivo de soldadoras','Preventivo',1,0,'Moderado','Mensual',1,NULL,3,2);
INSERT INTO `controles` (`id`, `riesgo_id`, `codigo`, `descripcion`, `clasificacion`, `mitiga_probabilidad`, `mitiga_impacto`, `efectividad`, `frecuencia`, `documentado`, `evidencia`, `responsable_gestion_id`, `responsable_revision_id`) VALUES (3,2,'C-ALM-01','Stock mínimo de seguridad','Preventivo',0,1,'Moderado','Semanal',0,NULL,2,2);



INSERT INTO `empresas` (`id`, `nombre`) VALUES (1,'Metalcof');

INSERT INTO `estados` (`id`, `nombre`, `orden`) VALUES ('ELABORACION','Elaboración / Modificación (Líder)',1);
INSERT INTO `estados` (`id`, `nombre`, `orden`) VALUES ('ELIMINADO','Eliminado',5);
INSERT INTO `estados` (`id`, `nombre`, `orden`) VALUES ('PUBLICACION','Publicación',3);
INSERT INTO `estados` (`id`, `nombre`, `orden`) VALUES ('REVISION','Revisión por Gestor de Calidad',2);
INSERT INTO `estados` (`id`, `nombre`, `orden`) VALUES ('VIGENTE','Vigente',4);





INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (1,1,1,1,'IND-GER-01','Metas alcanzadas',NULL,'Metas cumplidas / metas programadas × 100','razon','%','Anual','Ascendente',90,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (2,1,2,1,'IND-COM-01','Comportamiento de ventas anual',NULL,'Variación de ventas frente al año anterior','directo','%','Anual','Ascendente',10,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (3,1,2,1,'IND-COM-02','Comportamiento comparativo mensual de ventas',NULL,'Ventas del mes / ventas del mismo mes del año anterior × 100','razon','%','Mensual','Ascendente',100,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (4,1,2,2,'IND-COM-03','Respuesta oportuna a quejas y reclamos',NULL,'PQR respondidas a tiempo / PQR recibidas × 100','razon','%','Mensual','Ascendente',90,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (5,1,2,2,'IND-COM-04','Satisfacción del cliente',NULL,'Clientes satisfechos / clientes encuestados × 100','razon','%','Semestral','Ascendente',90,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (6,1,4,5,'IND-SIG-01','Administración del riesgo (monitoreo)',NULL,'Controles ejecutados / controles programados × 100','razon','%','Trimestral','Ascendente',90,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (7,1,4,3,'IND-SIG-02','Acciones correctivas',NULL,'Acciones cerradas eficazmente / acciones abiertas × 100','razon','%','Trimestral','Ascendente',90,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (8,1,4,4,'IND-SIG-03','Uso eficiente del agua',NULL,'(Consumo m³ periodo actual − consumo m³ periodo anterior) / consumo m³ periodo anterior × 100','directo','%','Mensual','Ascendente',90,22.22,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (9,1,4,4,'IND-SIG-04','Uso eficiente de energía',NULL,'(Consumo kWh periodo actual − consumo kWh periodo anterior) / consumo kWh periodo anterior × 100','directo','%','Mensual','Descendente',90,0,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (10,1,4,4,'IND-SIG-05','Porcentaje de residuos aprovechables',NULL,'Kg aprovechables / kg generados × 100','razon','%','Mensual','Ascendente',60,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (11,1,5,3,'IND-CCA-01','Conformidad de producto',NULL,'Unidades conformes / unidades inspeccionadas × 100','razon','%','Mensual','Ascendente',98,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (12,1,9,3,'IND-PRO-01','Conformidad de producto - dispositivo',NULL,'Dispositivos conformes / dispositivos producidos × 100','razon','%','Mensual','Ascendente',98,10,3,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (13,1,11,3,'IND-ALM-01','Desempeño de proveedores',NULL,'Promedio de la evaluación de proveedores','directo','%','Semestral','Ascendente',80,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (14,1,12,6,'IND-GTH-01','Evaluación de desempeño',NULL,'Promedio de la evaluación de desempeño','directo','%','Anual','Ascendente',85,10,2,NULL,1);
INSERT INTO `indicadores` (`id`, `empresa_id`, `proceso_id`, `objetivo_id`, `codigo`, `nombre`, `proposito`, `formula`, `calculo`, `unidad`, `frecuencia`, `sentido`, `meta`, `tolerancia`, `responsable_id`, `fuente`, `activo`) VALUES (15,1,12,6,'IND-GTH-02','Programa de capacitación',NULL,'Capacitaciones ejecutadas / programadas × 100','razon','%','Trimestral','Ascendente',90,10,2,NULL,1);


INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (1,1,'Comité','Brigada de Emergencia',1,NULL,'Eventual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','BRIGADA-%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (2,1,'Comité','Comité Copasst',1,NULL,'Mensual','Promover y vigilar el cumplimiento de las actividades de Seguridad y Salud en el Trabajo, identificando riesgos y proponiendo acciones preventivas.','- Eder Garzón - Operarios\n- Maura Gómez - Aux. Logística y despachos\n- Laura Rivera - Tesorería\n- Adriana Bermeo - Contadora',NULL,1,1,1,1,1,1,1,1,1,1,'Auto','COPASST%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (3,1,'Comité','Comité de Convivencia Laboral',1,NULL,'Trimestral',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','CCL-%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (4,1,'Comité','Comité de Innovación',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','INNOVACION-%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (5,1,'Comité','Comité de Mejoramiento Continuo',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','CMC-%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (6,1,'Comité','Comité Gerencial',1,NULL,'Mensual','Revisar el desempeño estratégico de la organización, analizar indicadores, tomar decisiones y hacer seguimiento a los planes de acción.','- Nelson Rojas - Gerente General\n- Alexander Rojas - Gerente comercial\n- Marcela Lozano - Coordinador SIG',NULL,1,1,1,1,1,1,1,1,1,1,'Auto','GERENCIAL-%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (7,1,'Comité','Plan de Acción 2026',1,NULL,'Eventual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','PA2026-%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (8,1,'Comité Primario','Comercial',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (9,1,'Comité Primario','Compras, Almacen y Activos Fijos',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (10,1,'Comité Primario','Contabilidad',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (11,1,'Comité Primario','Diseño Industrial',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (12,1,'Comité Primario','Gestión Documental y Archivo',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (13,1,'Comité Primario','Identidad Corporativa',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (14,1,'Comité Primario','Mantenimiento e Infraestructura',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (15,1,'Comité Primario','Producción',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (16,1,'Comité Primario','Talento Humano y SST',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (17,1,'Comité Primario','Tesorería',1,NULL,'Mensual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');
INSERT INTO `mecanismos` (`id`, `empresa_id`, `tipo`, `nombre`, `activo`, `coordinador_id`, `periodicidad`, `objetivo`, `miembros`, `funciones`, `indicar_lugar`, `mostrar_tipo`, `indicar_asistentes`, `control_asistencia`, `tiene_compromisos`, `control_compromisos`, `arrastrar_compromisos`, `miembros_compromisos`, `notificar_cierre`, `dias_recordatorio`, `codificacion`, `patron`, `padding`, `consecutivo`, `creado`) VALUES (18,1,'Reunión','Comité de Convivencia Laboral (Informe)',1,NULL,'Eventual',NULL,NULL,NULL,1,1,1,1,1,1,1,1,1,1,'Auto','%C',3,0,'2026-10-29 21:12:19');

INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (1,8,2026,1,NULL,NULL,-40.26,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (2,8,2026,2,NULL,NULL,-29.87,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (3,8,2026,3,NULL,NULL,4.84,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (4,8,2026,4,NULL,NULL,-7.32,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (5,8,2026,5,NULL,NULL,-18.92,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (6,9,2026,1,NULL,NULL,74.1,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (7,9,2026,2,NULL,NULL,59.97,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (8,9,2026,3,NULL,NULL,137.88,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (9,9,2026,4,NULL,NULL,30.3,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (10,9,2026,5,NULL,NULL,115.07,90,NULL,2,'2026-10-29 21:12:19');
INSERT INTO `mediciones` (`id`, `indicador_id`, `anio`, `periodo`, `numerador`, `denominador`, `valor`, `meta`, `analisis`, `usuario_id`, `fecha`) VALUES (11,9,2026,6,NULL,NULL,16.91,90,NULL,2,'2026-10-29 21:12:19');


INSERT INTO `objetivos` (`id`, `perspectiva_id`, `codigo`, `nombre`, `descripcion`, `responsable_id`) VALUES (1,1,'OE1','Crecer en ventas de forma sostenida',NULL,2);
INSERT INTO `objetivos` (`id`, `perspectiva_id`, `codigo`, `nombre`, `descripcion`, `responsable_id`) VALUES (2,2,'OE2','Aumentar la satisfacción del cliente',NULL,2);
INSERT INTO `objetivos` (`id`, `perspectiva_id`, `codigo`, `nombre`, `descripcion`, `responsable_id`) VALUES (3,3,'OE3','Asegurar la conformidad del producto',NULL,2);
INSERT INTO `objetivos` (`id`, `perspectiva_id`, `codigo`, `nombre`, `descripcion`, `responsable_id`) VALUES (4,3,'OE4','Usar eficientemente los recursos',NULL,2);
INSERT INTO `objetivos` (`id`, `perspectiva_id`, `codigo`, `nombre`, `descripcion`, `responsable_id`) VALUES (5,3,'OE5','Gestionar los riesgos del negocio',NULL,2);
INSERT INTO `objetivos` (`id`, `perspectiva_id`, `codigo`, `nombre`, `descripcion`, `responsable_id`) VALUES (6,4,'OE6','Desarrollar las competencias del personal',NULL,2);

INSERT INTO `perspectivas` (`id`, `plan_id`, `nombre`, `orden`) VALUES (1,1,'Financiera',0);
INSERT INTO `perspectivas` (`id`, `plan_id`, `nombre`, `orden`) VALUES (2,1,'Cliente',1);
INSERT INTO `perspectivas` (`id`, `plan_id`, `nombre`, `orden`) VALUES (3,1,'Procesos internos',2);
INSERT INTO `perspectivas` (`id`, `plan_id`, `nombre`, `orden`) VALUES (4,1,'Aprendizaje y crecimiento',3);


INSERT INTO `planes_estrategicos` (`id`, `empresa_id`, `nombre`, `anio_inicio`, `anio_fin`) VALUES (1,1,'Plan Estratégico 2026',2026,2026);





INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (1,1,'Gestión Gerencial','GER','Estratégico',0,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (2,1,'Gestión Comercial','COM','Estratégico',1,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (3,1,'Gestión Financiera','FIN','Estratégico',2,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (4,1,'Sistema Integrado de Gestión','SIG','Estratégico',3,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (5,1,'Control de Calidad','CCA','Misional',4,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (6,1,'Comercialización y Captación Digital','CCD','Misional',5,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (7,1,'Diseño y Desarrollo del Producto','DDP','Misional',6,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (8,1,'Servicio Post Venta','SPV','Misional',7,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (9,1,'Producción','PRO','Misional',8,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (10,1,'Logística y Distribución','LOG','Misional',9,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (11,1,'Gestión de Almacén y Compras','ALM','Misional',10,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (12,1,'Gestión de Talento Humano','GTH','Apoyo',11,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (13,1,'Gestión Administrativa','ADM','Apoyo',12,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (14,1,'Gestión de Activos Fijos','ACT','Apoyo',13,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (15,1,'Gestión de Facturación','FAC','Apoyo',14,NULL,'Proceso',NULL,1,NULL,NULL,NULL);
INSERT INTO `procesos` (`id`, `empresa_id`, `nombre`, `sigla`, `categoria`, `orden`, `padre_id`, `tipo`, `codigo`, `version`, `fecha`, `almera_id`, `modificado`) VALUES (16,1,'Gestión de Infraestructura y Mantenimiento','MAN','Apoyo',15,NULL,'Proceso',NULL,1,NULL,NULL,NULL);



INSERT INTO `riesgos` (`id`, `empresa_id`, `codigo`, `proceso_id`, `tipo`, `nombre`, `descripcion`, `causas`, `consecuencias`, `probabilidad`, `impacto`, `tratamiento`, `responsable_id`, `activo`, `creado`, `modificado`) VALUES (1,1,'R-PRO-01',9,'Calidad','(Ejemplo) Producto no conforme por fallas en soldadura',NULL,'Equipos sin mantenimiento; operarios sin entrenamiento','Reprocesos, devoluciones y quejas',4,4,'Reducir',3,1,'2026-10-29 21:12:19','2026-10-29 21:12:19');
INSERT INTO `riesgos` (`id`, `empresa_id`, `codigo`, `proceso_id`, `tipo`, `nombre`, `descripcion`, `causas`, `consecuencias`, `probabilidad`, `impacto`, `tratamiento`, `responsable_id`, `activo`, `creado`, `modificado`) VALUES (2,1,'R-ALM-01',11,'Compras y proveedores','(Ejemplo) Desabastecimiento de lámina de acero',NULL,'Dependencia de un solo proveedor','Paradas de producción',3,5,'Reducir',2,1,'2026-10-29 21:12:19','2026-10-29 21:12:19');
INSERT INTO `riesgos` (`id`, `empresa_id`, `codigo`, `proceso_id`, `tipo`, `nombre`, `descripcion`, `causas`, `consecuencias`, `probabilidad`, `impacto`, `tratamiento`, `responsable_id`, `activo`, `creado`, `modificado`) VALUES (3,1,'R-GTH-01',12,'Seguridad y Salud en el Trabajo','(Ejemplo) Quemaduras en el área de corte',NULL,'Falta de EPP','Incapacidades y sanciones',3,4,'Reducir',2,1,'2026-10-29 21:12:19','2026-10-29 21:12:19');


INSERT INTO `tipos_documento` (`id`, `nombre`, `sigla`) VALUES (1,'Proceso','PRC');
INSERT INTO `tipos_documento` (`id`, `nombre`, `sigla`) VALUES (2,'Subproceso','SUB');
INSERT INTO `tipos_documento` (`id`, `nombre`, `sigla`) VALUES (3,'Procedimiento','PR');
INSERT INTO `tipos_documento` (`id`, `nombre`, `sigla`) VALUES (4,'Documento específico','DES');
INSERT INTO `tipos_documento` (`id`, `nombre`, `sigla`) VALUES (5,'Instructivo','IN');

INSERT INTO `transiciones` (`id`, `nombre`, `desde`, `hacia`, `roles`, `nueva_version`, `pos`) VALUES ('aprobar','Aprobar','REVISION','PUBLICACION','lider_calidad,admin',0,2);
INSERT INTO `transiciones` (`id`, `nombre`, `desde`, `hacia`, `roles`, `nueva_version`, `pos`) VALUES ('devolver','Devolver','REVISION','ELABORACION','lider_calidad,admin',0,3);
INSERT INTO `transiciones` (`id`, `nombre`, `desde`, `hacia`, `roles`, `nueva_version`, `pos`) VALUES ('eliminar','Eliminar',NULL,'ELIMINADO','lider_calidad,admin',0,6);
INSERT INTO `transiciones` (`id`, `nombre`, `desde`, `hacia`, `roles`, `nueva_version`, `pos`) VALUES ('enviar_revision','Enviar a revisión','ELABORACION','REVISION','lider_proceso,admin',0,1);
INSERT INTO `transiciones` (`id`, `nombre`, `desde`, `hacia`, `roles`, `nueva_version`, `pos`) VALUES ('modificar','Iniciar modificación','VIGENTE','ELABORACION','lider_calidad,admin',1,5);
INSERT INTO `transiciones` (`id`, `nombre`, `desde`, `hacia`, `roles`, `nueva_version`, `pos`) VALUES ('publicar','Publicar','PUBLICACION','VIGENTE','lider_calidad,admin',0,4);

INSERT INTO `usuario_procesos` (`usuario_id`, `proceso_id`) VALUES (3,9);

INSERT INTO `usuarios` (`id`, `empresa_id`, `usuario`, `nombre`, `cargo`, `rol`, `proceso_id`, `clave`, `activo`, `debe_cambiar`, `correo`, `reinicio_solicitado`, `cargo_id`) VALUES (1,1,'admin','Administrador','Administrador del sistema','admin',NULL,'7a2a6ddf930c92d919259ee604a68903:20d537c8668ecb89b2be71c44ffc94522f528f6323682960eff7816f2f75ab61',1,1,'admin@oikos.test',NULL,NULL);
INSERT INTO `usuarios` (`id`, `empresa_id`, `usuario`, `nombre`, `cargo`, `rol`, `proceso_id`, `clave`, `activo`, `debe_cambiar`, `correo`, `reinicio_solicitado`, `cargo_id`) VALUES (2,1,'gestor','Gestor de Calidad','Coordinador de Calidad','lider_calidad',4,'5e2ce79c1cb193fae07d5d8c8eab29ad:77880b3e586bd07e22549c9eb0e1cc0a8ab2fd9c6b8610102f16c946cdd6a373',1,1,'gestor@oikos.test',NULL,NULL);
INSERT INTO `usuarios` (`id`, `empresa_id`, `usuario`, `nombre`, `cargo`, `rol`, `proceso_id`, `clave`, `activo`, `debe_cambiar`, `correo`, `reinicio_solicitado`, `cargo_id`) VALUES (3,1,'lider','Líder de Producción','Jefe de Producción','lider_proceso',9,'086f729a6a9e9136e41da907d8ba7c37:33f66555c57d2ccb0fda3d4dc012a50c50e0f7d04a935f279d988c2cdddde967',1,1,'lider@oikos.test',NULL,NULL);
INSERT INTO `usuarios` (`id`, `empresa_id`, `usuario`, `nombre`, `cargo`, `rol`, `proceso_id`, `clave`, `activo`, `debe_cambiar`, `correo`, `reinicio_solicitado`, `cargo_id`) VALUES (4,1,'colaborador','Colaborador','Auxiliar','consulta',NULL,'083c3fb4134776c9bbf40269cc1be54e:25e8db3f481d9f8111568f3ad1679994c6b0b78464579857d7122304ddc688bc',1,1,'colaborador@oikos.test',NULL,NULL);

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

SET FOREIGN_KEY_CHECKS = 1;
