-- Privilegios que el administrador da a una persona (tipo «usuario») o a un grupo (tipo «grupo») además de lo que ya permite su rol.
-- El catálogo de privilegios vive en el código (php/modulos/privilegios.php); aquí solo se guarda a quién se le dio cada uno.
CREATE TABLE IF NOT EXISTS privilegios_otorgados (
  privilegio VARCHAR(40) NOT NULL, tipo VARCHAR(10) NOT NULL, ref_id INT NOT NULL, otorgado_por INT NULL, fecha VARCHAR(30) NULL,
  PRIMARY KEY (privilegio, tipo, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
