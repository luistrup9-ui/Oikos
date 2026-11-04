-- Campos adicionales del perfil del cargo (nivel educativo, experiencia, conocimientos…). Los define el administrador; empieza vacía.
-- tipo: «texto» (se escribe) o «seleccion» (se elige una de las opciones, una por línea).
CREATE TABLE IF NOT EXISTS cargo_campos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL, agrupador VARCHAR(200) NULL, codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(200) NOT NULL, tipo VARCHAR(20) NOT NULL DEFAULT 'texto', opciones TEXT NULL, alias VARCHAR(60) NULL,
  orden INT NOT NULL DEFAULT 0, activo TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY cargo_campos_codigo (empresa_id, codigo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
