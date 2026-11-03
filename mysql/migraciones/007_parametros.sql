-- Parámetros de la empresa (clave → valor). Primeros usos: los cortes del semáforo del nivel de gestión de las evaluaciones
-- (verde desde 80 %, amarillo desde 60 %, rojo por debajo); se cambian en Administración → Evaluaciones.
CREATE TABLE IF NOT EXISTS parametros (
  empresa_id INT NOT NULL, clave VARCHAR(80) NOT NULL, valor VARCHAR(500) NOT NULL, PRIMARY KEY (empresa_id, clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO parametros (empresa_id, clave, valor) VALUES
  (1, 'evaluacion.corte_verde', '80'),
  (1, 'evaluacion.corte_amarillo', '60');
