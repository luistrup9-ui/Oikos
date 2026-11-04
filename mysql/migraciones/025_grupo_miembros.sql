-- Miembros de cada grupo; administrador = 1 puede cambiar quiénes son los miembros de ese grupo.
CREATE TABLE IF NOT EXISTS grupo_miembros (
  grupo_id INT NOT NULL, usuario_id INT NOT NULL, administrador TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (grupo_id, usuario_id),
  FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE CASCADE, FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
