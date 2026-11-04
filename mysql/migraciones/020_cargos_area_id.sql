-- Cada cargo apunta a su área (areas.id). Las columnas de texto area_sigla y area se conservan (el código CAR-sigla-NN se arma con ellas).
-- La columna se agrega solo si no existe (sirve igual en MySQL y MariaDB) y se llena para los cargos que ya existen.
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cargos' AND COLUMN_NAME = 'area_id');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE cargos ADD COLUMN area_id INT NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
UPDATE cargos c JOIN areas a ON a.empresa_id = c.empresa_id AND a.sigla = c.area_sigla SET c.area_id = a.id WHERE c.area_id IS NULL;
