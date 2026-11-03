-- Clasificación de hallazgos (parametrización de puntos de atención). En Almera solo existe «Hallazgo»; se pueden crear más.
CREATE TABLE IF NOT EXISTS hallazgo_clasificaciones (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL DEFAULT 1, nombre VARCHAR(100) NOT NULL,
  UNIQUE KEY hallazgo_clasificaciones_nombre (empresa_id, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO hallazgo_clasificaciones (empresa_id, nombre) VALUES (1, 'Hallazgo');
