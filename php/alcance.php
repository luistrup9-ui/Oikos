<?php
// Alcance de cada persona sobre los procesos (igual que alcance.js):
//  - administrador y Gestor de Calidad: todo.
//  - Líder: lee el mapa y los documentos vigentes de todos los procesos, pero el resto (trabajo en curso, indicadores,
//    riesgos, auditorías, acciones, estadísticas) solo de los procesos y subprocesos que el administrador le marcó, y solo edita lo suyo.
declare(strict_types=1);

// El proceso y todos sus subprocesos, a cualquier profundidad
function con_hijos(int $id): array {
    return array_map(fn($p) => (int)$p['id'], todos('WITH RECURSIVE arbol(id) AS (SELECT id FROM procesos WHERE id = ?
      UNION SELECT p.id FROM procesos p JOIN arbol a ON p.padre_id = a.id) SELECT id FROM arbol', $id));
}
// Lo que el administrador le marcó (procesos y subprocesos, uno por uno)
function marcados(array $u): array {
    return array_map(fn($p) => (int)$p['proceso_id'], todos('SELECT proceso_id FROM usuario_procesos WHERE usuario_id = ? ORDER BY proceso_id', $u['id']));
}
// Ids de los procesos que lidera la persona; null = sin restricción
function propios(array $u): ?array { return $u['rol'] !== 'lider_proceso' ? null : marcados($u); }
// Procesos que tiene asignados cualquier persona (para su agenda), sin importar el rol
function asignados(array $u): array {
    return array_values(array_unique(array_merge(marcados($u), $u['proceso_id'] ? con_hijos((int)$u['proceso_id']) : [])));
}
// ¿Es Líder y ese proceso es de él? (permiso de escritura)
function lidera($procesoId, array $u): bool { return $u['rol'] === 'lider_proceso' && in_array((int)$procesoId, propios($u) ?? [], true); }
// ¿Puede ver el dato de ese proceso? (lecturas con restricción)
function ve($procesoId, array $u): bool { $ids = propios($u); return $ids === null || in_array((int)$procesoId, $ids, true); }
// Fragmento SQL " AND columna IN (...)" con sus parámetros; vacío si la persona no tiene restricción
function filtro(array $u, string $columna): array {
    $ids = propios($u);
    if ($ids === null) return ['sql' => '', 'params' => []];
    return $ids ? ['sql' => " AND $columna IN (" . marcas($ids) . ')', 'params' => $ids] : ['sql' => ' AND 1 = 0', 'params' => []];
}
