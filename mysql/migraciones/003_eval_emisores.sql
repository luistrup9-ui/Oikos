-- Emisores de las evaluaciones (CAL, MC, EXT). El nombre coincide con el campo «evaluador» de las evaluaciones, que no cambia.
-- Los tres «por defecto» son opciones del emisor (en Almera: Riesgos, Indicadores y Trámites por defecto).
CREATE TABLE IF NOT EXISTS eval_emisores (
  id INT PRIMARY KEY AUTO_INCREMENT, empresa_id INT NOT NULL DEFAULT 1, sigla VARCHAR(10) NOT NULL, nombre VARCHAR(40) NOT NULL,
  riesgos_defecto TINYINT NOT NULL DEFAULT 0, indicadores_defecto TINYINT NOT NULL DEFAULT 0, tramites_defecto TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY eval_emisores_nombre (empresa_id, nombre), UNIQUE KEY eval_emisores_sigla (empresa_id, sigla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO eval_emisores (empresa_id, sigla, nombre, riesgos_defecto, indicadores_defecto, tramites_defecto) VALUES
  (1, 'CAL', 'Coordinador de Calidad', 0, 0, 0),
  (1, 'MC', 'Dueños de proceso', 1, 1, 1),
  (1, 'EXT', 'Externo', 0, 0, 0);
