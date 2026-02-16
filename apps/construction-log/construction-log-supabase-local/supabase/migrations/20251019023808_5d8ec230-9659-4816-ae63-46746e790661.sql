-- Consolidar y normalizar productos de zahorra de Cutillas a toneladas
WITH zahorra_items AS (
  SELECT 
    id,
    name,
    unit,
    quantity,
    CASE 
      WHEN unit IN ('tn', 'TN', 'Tn') THEN quantity
      WHEN unit IN ('kg', 'KG', 'Kg') THEN quantity / 1000.0
      ELSE 0  -- ud se ignoran porque no sabemos la conversión
    END AS quantity_in_tons
  FROM public.work_inventory
  WHERE (LOWER(name) LIKE '%zahorra%' OR LOWER(name) LIKE '%todo en uno%')
    AND (LOWER(category) LIKE '%cutillas%' OR LOWER(last_supplier) LIKE '%cutillas%')
    AND unit != 't'
)
UPDATE public.work_inventory
SET 
  unit = 't',
  quantity = CASE 
    WHEN zi.unit IN ('tn', 'TN', 'Tn') THEN zi.quantity
    WHEN zi.unit IN ('kg', 'KG', 'Kg') THEN zi.quantity / 1000.0
    WHEN zi.unit IN ('ud', 'UD', 'Ud') THEN zi.quantity  -- Asumimos que ud ya son toneladas
    ELSE zi.quantity
  END,
  updated_at = now()
FROM zahorra_items zi
WHERE work_inventory.id = zi.id;