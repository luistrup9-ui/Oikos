-- Áreas de la estructura organizacional, en árbol (padre_id). Hasta ahora el área de un cargo era solo un texto (sigla + nombre).
-- Se crea una fila por cada área que ya usan los cargos; el orden en el árbol (quién depende de quién) lo arma el administrador en pantalla.
CREATE TABLE IF NOT EXISTS areas (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL, sigla VARCHAR(10) NOT NULL, nombre VARCHAR(200) NOT NULL,
  padre_id INT NULL, tipo_area_id INT NULL, orden INT NOT NULL DEFAULT 0, activo TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY areas_sigla (empresa_id, sigla),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id), FOREIGN KEY (padre_id) REFERENCES areas(id), FOREIGN KEY (tipo_area_id) REFERENCES tipos_area(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO areas (empresa_id, sigla, nombre) SELECT empresa_id, area_sigla, MIN(area) FROM cargos GROUP BY empresa_id, area_sigla;
