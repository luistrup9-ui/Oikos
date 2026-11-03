-- Clase del control: Actual (ya funciona) o Propuesto (se va a implementar). Es distinta de la clasificación (Preventivo, Detectivo, Correctivo).
-- Los controles que ya existen quedan como «Actual». La columna se agrega solo si no existe (sirve igual en MySQL y MariaDB).
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'controles' AND COLUMN_NAME = 'clase');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE controles ADD COLUMN clase VARCHAR(20) NOT NULL DEFAULT ''Actual''', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
