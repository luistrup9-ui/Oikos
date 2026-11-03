-- Historial de transiciones de una evaluación (pestaña Historial): quién, cuándo, de qué estado a cuál, observaciones y usuarios de la ruta.
CREATE TABLE IF NOT EXISTS evaluacion_historial (
  id INT PRIMARY KEY AUTO_INCREMENT, evaluacion_id INT NOT NULL, usuario_id INT NULL, fecha DATETIME NOT NULL,
  estado_inicial VARCHAR(20) NULL, estado_final VARCHAR(20) NOT NULL, observaciones TEXT NULL, usuarios_ruta VARCHAR(500) NULL,
  KEY evaluacion_historial_evaluacion (evaluacion_id),
  FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
