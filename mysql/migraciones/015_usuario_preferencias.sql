-- Preferencias de cada persona (pantalla «Cuenta»): avisos por atraso y por terminar (activados y con cuántos días), alerta temprana (días de «Lo que viene»),
-- página con la que abre al ingresar y su firma mecánica (imagen guardada con las demás cargas, fuera de la parte pública; aquí solo su nombre y tipo).
-- Una persona sin fila usa los valores de siempre. Repetirla no hace daño.
CREATE TABLE IF NOT EXISTS usuario_preferencias (
  usuario_id INT PRIMARY KEY,
  notif_atraso TINYINT NOT NULL DEFAULT 0, dias_atraso INT NOT NULL DEFAULT 1,
  notif_por_terminar TINYINT NOT NULL DEFAULT 0, dias_por_terminar INT NOT NULL DEFAULT 3,
  alerta_dias INT NOT NULL DEFAULT 14,
  pagina_inicio VARCHAR(20) NOT NULL DEFAULT 'bienvenida',
  firma_archivo VARCHAR(64) NULL, firma_tipo VARCHAR(20) NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
