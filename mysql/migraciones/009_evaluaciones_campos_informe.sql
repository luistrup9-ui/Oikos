-- Campos del informe de la evaluación: ciclo, fortalezas y recomendaciones. Cada columna se agrega solo si no existe (sirve igual en MySQL y MariaDB).
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evaluaciones' AND COLUMN_NAME = 'ciclo_id');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE evaluaciones ADD COLUMN ciclo_id INT NULL, ADD CONSTRAINT evaluaciones_ciclo FOREIGN KEY (ciclo_id) REFERENCES eval_ciclos(id) ON DELETE SET NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evaluaciones' AND COLUMN_NAME = 'fortalezas');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE evaluaciones ADD COLUMN fortalezas TEXT NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evaluaciones' AND COLUMN_NAME = 'recomendaciones');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE evaluaciones ADD COLUMN recomendaciones TEXT NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
