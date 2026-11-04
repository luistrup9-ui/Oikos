-- Lo que se escribió en cada campo adicional, para cada cargo.
CREATE TABLE IF NOT EXISTS cargo_valores (
  cargo_id INT NOT NULL, campo_id INT NOT NULL, valor TEXT NULL,
  PRIMARY KEY (cargo_id, campo_id),
  FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE CASCADE, FOREIGN KEY (campo_id) REFERENCES cargo_campos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
