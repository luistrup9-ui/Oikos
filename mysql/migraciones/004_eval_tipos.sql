-- Tipos de evaluación. Los cuatro nombres son los que ya admite el campo «tipo» de las evaluaciones, que no cambia.
-- Una evaluación nueva siempre nace en Planeación (estado_inicial); el tipo «por defecto» es el que aparece preseleccionado al programarla.
CREATE TABLE IF NOT EXISTS eval_tipos (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL DEFAULT 1, nombre VARCHAR(40) NOT NULL,
  por_defecto TINYINT NOT NULL DEFAULT 0, estado_inicial VARCHAR(20) NOT NULL DEFAULT 'Planeación',
  UNIQUE KEY eval_tipos_nombre (empresa_id, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO eval_tipos (empresa_id, nombre, por_defecto) VALUES
  (1, 'Auditoría interna', 1),
  (1, 'Auditoría externa', 0),
  (1, 'Autoevaluación', 0),
  (1, 'Inspección', 0);
