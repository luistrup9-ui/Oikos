-- Prueba del despliegue automático (se elimina en la 002). Inofensiva: solo crea una tabla vacía.
CREATE TABLE IF NOT EXISTS prueba_despliegue (id INT PRIMARY KEY AUTO_INCREMENT, creada DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
