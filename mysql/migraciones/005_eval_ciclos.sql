-- Ciclos de evaluación (parámetros generales de evaluación). Empieza vacío: se llena en Administración → Evaluaciones → Ciclos.
CREATE TABLE IF NOT EXISTS eval_ciclos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL DEFAULT 1, nombre VARCHAR(100) NOT NULL, orden INT NOT NULL DEFAULT 0, activo TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY eval_ciclos_nombre (empresa_id, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
