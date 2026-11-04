-- Tipos de área de la estructura organizacional (Gerencia, Dirección, Coordinación…). Empieza vacía: cada empresa define los suyos.
CREATE TABLE IF NOT EXISTS tipos_area (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL, nombre VARCHAR(100) NOT NULL, orden INT NOT NULL DEFAULT 0,
  UNIQUE KEY tipos_area_nombre (empresa_id, nombre),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
