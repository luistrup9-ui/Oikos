-- Responsabilidad básica del cargo (parte del perfil del cargo). Columna nueva, vacía al principio.
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cargos' AND COLUMN_NAME = 'responsabilidad');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE cargos ADD COLUMN responsabilidad TEXT NULL', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
