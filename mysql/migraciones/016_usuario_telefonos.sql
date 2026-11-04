-- Números de contacto de cada persona (pantalla «Cuenta»): un nombre (Celular, Casa…), el prefijo del país y el número. Repetirla no hace daño.
CREATE TABLE IF NOT EXISTS usuario_telefonos (
  id INT PRIMARY KEY AUTO_INCREMENT, usuario_id INT NOT NULL, orden INT NOT NULL DEFAULT 0,
  nombre VARCHAR(60) NOT NULL, prefijo VARCHAR(8) NOT NULL, numero VARCHAR(20) NOT NULL,
  KEY usuario_telefonos_usuario (usuario_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
