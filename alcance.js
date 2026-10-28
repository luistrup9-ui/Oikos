// Alcance de cada persona sobre los procesos: qué puede ver y qué puede editar según su rol.
//  - administrador y Calidad: todo.
//  - líder de proceso: lee el mapa y los documentos vigentes de todos los procesos, pero el resto (trabajo en curso,
//    indicadores, riesgos, auditorías, acciones, estadísticas) solo del proceso que lidera, subprocesos incluidos,
//    y solo edita lo suyo.
//  - un líder sin proceso asignado no ve nada propio hasta que el administrador le asigne uno.
module.exports = function ({ todos }) {
  const conHijos = id => todos('SELECT id FROM procesos WHERE id = ? OR padre_id = ?', id, id).map(p => p.id);

  // Ids de los procesos que lidera la persona (el suyo y sus subprocesos); null = sin restricción
  const propios = u => u.rol !== 'lider_proceso' ? null : (u.proceso_id ? conHijos(u.proceso_id) : []);
  // Procesos que tiene asignados cualquier persona (para su agenda), sin importar el rol
  const asignados = u => u.proceso_id ? conHijos(u.proceso_id) : [];
  // ¿Es un líder de proceso y ese proceso es de él? (para permisos de escritura)
  const lidera = (procesoId, u) => u.rol === 'lider_proceso' && (propios(u) || []).includes(Number(procesoId));
  // ¿Puede ver el dato de ese proceso? (para lecturas con restricción)
  const ve = (procesoId, u) => { const ids = propios(u); return ids === null || ids.includes(Number(procesoId)); };
  // Fragmento SQL " AND columna IN (...)" con sus parámetros; vacío si la persona no tiene restricción
  const filtro = (u, columna) => {
    const ids = propios(u);
    if (ids === null) return { sql: '', params: [] };
    return ids.length ? { sql: ` AND ${columna} IN (${ids.map(() => '?').join(',')})`, params: ids } : { sql: ' AND 1 = 0', params: [] };
  };
  return { propios, asignados, lidera, ve, filtro };
};
