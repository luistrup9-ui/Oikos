-- Publicación de los procesos: 1 = publicado (se ve en el mapa, en el árbol y en las listas para elegir), 0 = no publicado (se retira sin borrar nada).
-- Los procesos que ya existen quedan publicados. La columna se agrega solo si no existe (sirve igual en MySQL y MariaDB).
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'procesos' AND COLUMN_NAME = 'publicado');
SET @sentencia = IF(@existe = 0, 'ALTER TABLE procesos ADD COLUMN publicado TINYINT NOT NULL DEFAULT 1', 'DO 0');
PREPARE paso FROM @sentencia;
EXECUTE paso;
DEALLOCATE PREPARE paso;
