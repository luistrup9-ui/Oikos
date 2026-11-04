-- Tres datos de procesos que no coincidían con la otra plataforma (Almera), tomada como referencia (se identifican por su número de allá, almera_id).
-- Cada cambio solo se hace si el proceso todavía tiene EXACTAMENTE el valor de antes (BINARY: la base normal ignora mayúsculas y tildes, y «Tesorería» ya corregida
-- se confundiría con «Tesoreria»). Si alguien ya lo corrigió a mano, no se toca. Repetirla no hace daño.
UPDATE procesos SET nombre = 'Control de Calidad del Producto' WHERE almera_id = 6063 AND BINARY nombre = 'Control de Calidad';
UPDATE procesos SET codigo = 'ES-SGE-DAR-01' WHERE almera_id = 6130 AND BINARY codigo = 'ES-SG-DAR-01';
UPDATE procesos SET nombre = 'Tesorería' WHERE almera_id = 6154 AND BINARY nombre = 'Tesoreria';
