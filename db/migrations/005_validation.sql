-- 005_validation.sql

-- 1. Contar registros en cada tabla
SELECT 'obras' as tabla, COUNT(*) as registros FROM obras
UNION ALL
SELECT 'proveedores_subcontratacion' as tabla, COUNT(*) as registros FROM proveedores_subcontratacion
UNION ALL
SELECT 'proveedores_suministros_servicios' as tabla, COUNT(*) as registros FROM proveedores_suministros_servicios
UNION ALL
SELECT 'contratos' as tabla, COUNT(*) as registros FROM contratos;

-- Resultado esperado:
-- obras: 1
-- proveedores_subcontratacion: 153 (se deduplican CIFs repetidos en importacion)
-- proveedores_suministros_servicios: 72 (se deduplican CIFs repetidos en importacion)
-- contratos: 26

-- 2. Verificar integridad referencial (contratos deben tener obras validas)
SELECT 
    c.id_contrato,
    c.num_obra,
    o.nombre_obra
FROM contratos c
LEFT JOIN obras o ON c.num_obra = o.num_obra
WHERE o.num_obra IS NULL;

-- Resultado esperado: 0 filas (ningun contrato huerfano)

-- 3. Distribucion de contratos por tipo
SELECT 
    tipo_cont,
    COUNT(*) as cantidad,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM contratos), 2) as porcentaje
FROM contratos
GROUP BY tipo_cont
ORDER BY cantidad DESC;

-- 4. Contratos por estado
SELECT 
    estado,
    COUNT(*) as cantidad
FROM contratos
GROUP BY estado
ORDER BY cantidad DESC;

-- 5. Proveedores que tienen contratos
SELECT 
    p.empresa,
    p.razon_social,
    COUNT(c.id_contrato) as num_contratos,
    MIN(c.f_inicio) as primer_contrato,
    MAX(c.f_fin) as ultimo_contrato
FROM proveedores_subcontratacion p
LEFT JOIN contratos c ON p.cif = c.cif
GROUP BY p.empresa, p.razon_social
HAVING COUNT(c.id_contrato) > 0
ORDER BY num_contratos DESC;

-- 6. Verificar unicidad de CIFs en proveedores (dentro de cada tabla)
SELECT 'subcontratacion' as tabla, cif, COUNT(*) as repeticiones
FROM proveedores_subcontratacion
GROUP BY cif
HAVING COUNT(*) > 1
UNION ALL
SELECT 'suministros_servicios' as tabla, cif, COUNT(*) as repeticiones
FROM proveedores_suministros_servicios
GROUP BY cif
HAVING COUNT(*) > 1;

-- 6b. CIFs repetidos entre tablas (informativo)
SELECT s.cif, s.empresa as empresa_sub, t.empresa as empresa_sum
FROM proveedores_subcontratacion s
JOIN proveedores_suministros_servicios t ON t.cif = s.cif;

-- 7. Contratos con fechas invalidas (fecha fin antes que fecha inicio)
SELECT 
    id_contrato,
    empresa,
    f_inicio,
    f_fin,
    (f_fin - f_inicio) as duracion_dias
FROM contratos
WHERE f_fin < f_inicio;

-- Resultado esperado: 0 filas

-- 8. Resumen por obra
SELECT 
    o.num_obra,
    o.nombre_obra,
    o.promotora,
    COUNT(c.id_contrato) as total_contratos,
    SUM(CASE WHEN c.estado = 'Hecho' THEN 1 ELSE 0 END) as contratos_hechos,
    SUM(CASE WHEN c.tipo_cont LIKE 'SUBCONTRATAC%' THEN 1 ELSE 0 END) as subcontrataciones,
    SUM(CASE WHEN c.tipo_cont LIKE 'SUMINISTRO%' THEN 1 ELSE 0 END) as suministros,
    SUM(CASE WHEN c.tipo_cont LIKE 'SERVICIO%' THEN 1 ELSE 0 END) as servicios
FROM obras o
LEFT JOIN contratos c ON o.num_obra = c.num_obra
GROUP BY o.num_obra, o.nombre_obra, o.promotora;

-- 9. Proveedores sin contratos (potenciales a eliminar o investigar)
SELECT 'Subcontratacion' as tipo, empresa, razon_social
FROM proveedores_subcontratacion p
WHERE NOT EXISTS (
    SELECT 1 FROM contratos c WHERE c.cif = p.cif
)
UNION ALL
SELECT 'Suministros/Servicios' as tipo, empresa, razon_social
FROM proveedores_suministros_servicios p
WHERE NOT EXISTS (
    SELECT 1 FROM contratos c WHERE c.cif = p.cif
);

-- 10. Calendario de contratos (proximos a finalizar)
SELECT 
    id_contrato,
    empresa,
    nom_jo as jefe_obra,
    tipo_cont,
    f_inicio,
    f_fin,
    (f_fin - CURRENT_DATE) as dias_restantes
FROM contratos
WHERE f_fin >= CURRENT_DATE
ORDER BY f_fin ASC
LIMIT 10;
