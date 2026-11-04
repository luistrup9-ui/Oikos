-- Grupos de usuarios. Empieza vacía: los grupos y sus miembros son datos reales que se cargan en pantalla.
-- por_defecto = 1: las personas que se creen después entran solas a ese grupo.
CREATE TABLE IF NOT EXISTS grupos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL, nombre VARCHAR(120) NOT NULL, por_defecto TINYINT NOT NULL DEFAULT 0,
  creado_por INT NULL, creado VARCHAR(30) NULL,
  UNIQUE KEY grupos_nombre (empresa_id, nombre),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id), FOREIGN KEY (creado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
