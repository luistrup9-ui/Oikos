<?php
// Datos iniciales que la versión Node creaba al arrancar. Se usan al migrar y en una instalación nueva.
declare(strict_types=1);

// Los 48 cargos de Metalcof tal como están en Almera: [sigla, número, cargo, jefe, personas]
const CARGOS_AREAS = [
    'GAF' => 'Gerencia Administrativa y Financiera',
    'GC' => 'Gerencia Comercial',
    'GCAL' => 'Gestión de Calidad',
    'GG' => 'Gerencia General',
    'GPR' => 'Gerencia de Producción',
    'MTC' => 'Metalcof',
];
const CARGOS_INICIALES = [
    ['GG', 1, 'Gerente General', null, 'Nelson Rojas'],
    ['GG', 36, 'Asesor de Proyectos', 'Gerente General', 'Alfonso Andrade'],
    ['GG', 37, 'Asesor de Apoyo', 'Gerente General', 'Edwin Cortes'],
    ['GG', 41, 'Asesor Jurídico', 'Gerente General', 'Ferney Ramirez'],
    ['GG', 44, 'Revisor Fiscal', 'Gerente General', 'Omar Aponte'],
    ['GC', 2, 'Gerente Comercial', 'Gerente General', 'Alexander Rojas'],
    ['GC', 4, 'Líder Comercial y Marketing Digital', 'Gerente Comercial', 'Emmanuel Rojas'],
    ['GC', 5, 'Asistente Comercial', 'Líder Comercial y Marketing Digital', 'Ana Maria Pérez; Ibon Viviana Oliveros Cardozo'],
    ['GC', 6, 'Asesor Comercial', 'Líder Comercial y Marketing Digital', 'Gerardo Chavarro Avendaño; Laura Sofia Aros Escobar; Yonatan Alexis Suarez'],
    ['GC', 7, 'Líder de Identidad Corporativa', 'Gerente Comercial', 'Santiago Rojas'],
    ['GC', 8, 'Diseñador Gráfico', 'Líder de Identidad Corporativa', 'Daniel Rojas; Yiby Escobar'],
    ['GC', 9, 'Líder de Logística y Distribución', 'Gerente Comercial', ''],
    ['GC', 10, 'Operador de Logística y Distribución', 'Líder de Logística y Distribución', ''],
    ['GC', 11, 'Operario de Transporte', 'Líder de Logística y Distribución', ''],
    ['GC', 40, 'Asesor de Marketing Digital', 'Gerente Comercial', 'Jessica'],
    ['GCAL', 3, 'Coordinador de Calidad', 'Gerente General', ''],
    ['GCAL', 35, 'Coordinador Sistema Integral de Gestión', 'Gerente General', 'Lina Marcela Lozano Cortes'],
    ['GCAL', 48, 'Gestor de Calidad', 'Coordinador Sistema Integral de Gestión', ''],
    ['GAF', 12, 'Líder de Gestión Documental', null, 'Luis Fernando Pobre Trujillo'],
    ['GAF', 14, 'Coordinador de Talento Humano', 'Gerente General', 'María Paula Rojas Marquez'],
    ['GAF', 13, 'Líder de Seguridad y Salud en el Trabajo', 'Coordinador de Talento Humano', 'Tatiana Andrea Cardenas Fuentes'],
    ['GAF', 15, 'Asistente de Talento Humano', 'Coordinador de Talento Humano', 'Aura Yueidy Motta Yosa'],
    ['GAF', 16, 'Auxiliar Documental', 'Coordinador de Talento Humano', ''],
    ['GAF', 17, 'Analista de Formación, Desarrollo y Calidad de Vida', 'Coordinador de Talento Humano', ''],
    ['GAF', 18, 'Psicólogo', 'Coordinador de Talento Humano', ''],
    ['GAF', 19, 'Auxiliar de Contratación', 'Coordinador de Talento Humano', ''],
    ['GAF', 20, 'Analista de Nómina', 'Coordinador de Talento Humano', ''],
    ['GAF', 33, 'Auxiliar de Servicios Generales', 'Coordinador de Talento Humano', 'Diana Marcela Cordoba Rivas'],
    ['GAF', 34, 'Tesorera', 'Gerente General', 'Laura Rivera'],
    ['GAF', 35, 'Auxiliar de Tesorería', 'Tesorera', ''],
    ['GAF', 36, 'Contadora', 'Gerente General', 'Adriana Bermeo'],
    ['GAF', 37, 'Auxiliar Contable', 'Contadora', ''],
    ['GPR', 38, 'Gerente de Producción', 'Gerente General', ''],
    ['GPR', 21, 'Jefe de Mantenimiento', 'Gerente de Producción', ''],
    ['GPR', 22, 'Auxiliar de Mantenimiento', 'Jefe de Mantenimiento', 'Julian Dussan'],
    ['GPR', 23, 'Operario de Maquinaria y Mantenimiento', 'Jefe de Mantenimiento', ''],
    ['GPR', 24, 'Jefe de Producción', 'Gerente de Producción', 'Luis Nuñez'],
    ['GPR', 25, 'Supervisor de Alistamiento y Calidad', 'Jefe de Producción', ''],
    ['GPR', 26, 'Operario Soldador', 'Jefe de Producción', ''],
    ['GPR', 27, 'Operario', 'Jefe de Producción', 'Anderson Campos; Anderson Santamaria; Brayan Cabrera; Brhanndon Rojas; Carlos Calle; Eder Garzón; Francisco Marchan; John Alver Polania Galvis; Juan Pablo Perdomo; Nancy Arredondo; Nicolas Barragan; Oliver Toro; Sebastian Nomelin; Yohan Jose Castillo Sucre'],
    ['GPR', 28, 'Líder de Almacén, Compras y Activos Fijos', 'Gerente de Producción', 'Cindy Johana Patiño Vanegas'],
    ['GPR', 29, 'Auxiliar de Almacén', 'Líder de Almacén, Compras y Activos Fijos', 'Angel Ignacio Martinez Navarro'],
    ['GPR', 30, 'Auxiliar de Compras y Activos Fijos', 'Líder de Almacén, Compras y Activos Fijos', ''],
    ['GPR', 31, 'Líder de Diseño y Desarrollo de Producto', 'Gerente de Producción', ''],
    ['GPR', 32, 'Líder de Desarrollo e Innovación de Proyectos', 'Gerente de Producción', 'Alex Ceron'],
    ['GPR', 42, 'Auxiliar de Logística y Distribución', 'Jefe de Producción', 'Maura Gomez'],
    ['GPR', 46, 'Diseñador Industrial', 'Gerente de Producción', 'Yulitza Suarez'],
    ['MTC', 47, 'Responsable del proceso de servicios generales', null, ''],
];

// Primera carga de cargos: los crea y asigna a las personas que ya son usuarios (por nombre). No hace nada si ya hay cargos.
function sembrar_cargos(): int {
    if ((int)uno('SELECT COUNT(*) n FROM cargos')['n']) return 0;
    $empresa = uno('SELECT id FROM empresas ORDER BY id LIMIT 1');
    if (!$empresa) return 0;
    return transaccion(function () use ($empresa) {
        $ids = [];
        foreach (CARGOS_INICIALES as [$s, $n, $nombre])
            $ids[$nombre] = ejecutar('INSERT INTO cargos (empresa_id, area_sigla, area, numero, nombre) VALUES (?,?,?,?,?)', $empresa['id'], $s, CARGOS_AREAS[$s], $n, $nombre);
        foreach (CARGOS_INICIALES as [, , $nombre, $jefe]) if ($jefe) ejecutar('UPDATE cargos SET jefe_id = ? WHERE id = ?', $ids[$jefe], $ids[$nombre]);
        $usuarios = todos('SELECT id, nombre FROM usuarios WHERE empresa_id = ? AND cargo_id IS NULL', $empresa['id']);
        $palabras = fn($s) => preg_split('/\s+/', norm($s), -1, PREG_SPLIT_NO_EMPTY);
        $asignados = 0;
        foreach (CARGOS_INICIALES as [, , $nombre, , $personas])
            foreach (array_filter(array_map('norm', explode(';', (string)$personas))) as $p) {
                $p = preg_replace('/\s+/', ' ', $p); $partes = explode(' ', $p); $u = null;
                foreach ($usuarios as $x) if (implode(' ', $palabras($x['nombre'])) === $p) { $u = $x; break; }
                if (!$u) foreach ($usuarios as $x) if (!array_diff($partes, $palabras($x['nombre']))) { $u = $x; break; }
                if ($u) { ejecutar('UPDATE usuarios SET cargo_id = ?, cargo = ? WHERE id = ?', $ids[$nombre], $nombre, $u['id']); $asignados++; }
            }
        return $asignados;
    });
}

// Lo que Node hacía al arrancar sobre una base anterior: nombres de los estados y procesos de cada Líder
function completar_base(): void {
    ejecutar("UPDATE estados SET nombre = ? WHERE id = 'ELABORACION' AND nombre = ?", 'Elaboración / Modificación (Líder)', 'Elaboración / Modificación (Líder de proceso)');
    ejecutar("UPDATE estados SET nombre = ? WHERE id = 'REVISION' AND nombre = ?", 'Revisión por Gestor de Calidad', 'Revisión por Líder de Calidad');
    // Un Líder sin lista conserva lo que veía: su proceso y los subprocesos de ese proceso
    ejecutar("INSERT IGNORE INTO usuario_procesos (usuario_id, proceso_id)
      SELECT u.id, p.id FROM usuarios u JOIN procesos p ON p.id = u.proceso_id OR p.padre_id = u.proceso_id
      WHERE u.rol = 'lider_proceso' AND u.proceso_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuario_procesos x WHERE x.usuario_id = u.id)");
    sembrar_cargos();
}
