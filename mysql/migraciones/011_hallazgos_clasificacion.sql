-- Clasificación opcional de cada hallazgo (catálogo hallazgo_clasificaciones). Se agrega solo si no existe.
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hallazgos' AND COLUMN_NAME = 'clasificacion_id');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE hallazgos ADD COLUMN clasificacion_id INT NULL, ADD CONSTRAINT hallazgos_clasificacion FOREIGN KEY (clasificacion_id) REFERENCES hallazgo_clasificaciones(id) ON DELETE SET NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
