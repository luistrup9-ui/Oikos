-- Las preguntas de la lista de verificación se agrupan en cuestionarios (p. ej. «Elementos de protección personal») dentro de cada unidad auditable.
-- Las preguntas que ya existen quedan sin cuestionario (se muestran como «Lista de verificación»).
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'verificacion_items' AND COLUMN_NAME = 'cuestionario');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE verificacion_items ADD COLUMN cuestionario VARCHAR(200) NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
