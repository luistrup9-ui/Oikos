-- Fechas reales (ejecutadas) del plan de acción: cuándo empezó y cuándo terminó de verdad, frente a las planeadas (fecha_inicio y fecha_fin).
-- Cada columna se agrega solo si no existe (sirve igual en MySQL y MariaDB y se puede repetir sin daño). Los planes que ya existen quedan sin fechas reales.
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planes_accion' AND COLUMN_NAME = 'fecha_inicio_real');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE planes_accion ADD COLUMN fecha_inicio_real DATE NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planes_accion' AND COLUMN_NAME = 'fecha_fin_real');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE planes_accion ADD COLUMN fecha_fin_real DATE NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
