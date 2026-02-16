-- Consolidar zahorra de Cutillas: sumar cantidades convertidas a toneladas
WITH zahorra_consolidated AS (
  SELECT 
    work_id,
    name,
    item_type,
    ARRAY_AGG(id ORDER BY created_at) as all_ids,
    SUM(
      CASE 
        WHEN unit IN ('tn', 'TN', 'Tn', 't', 'T') THEN quantity
        WHEN unit IN ('kg', 'KG', 'Kg') THEN quantity / 1000.0
        WHEN unit IN ('ud', 'UD', 'Ud') THEN quantity
        ELSE quantity
      END
    ) as total_tons,
    MAX(last_entry_date) as max_date,
    MAX(last_supplier) FILTER (WHERE last_supplier IS NOT NULL) as supplier,
    MAX(delivery_note_number) FILTER (WHERE delivery_note_number IS NOT NULL) as delivery,
    MAX(product_code) FILTER (WHERE product_code IS NOT NULL) as prod_code,
    MAX(unit_price) FILTER (WHERE unit_price IS NOT NULL) as price,
    MAX(batch_number) FILTER (WHERE batch_number IS NOT NULL) as batch,
    MAX(brand) FILTER (WHERE brand IS NOT NULL) as brand_val,
    MAX(model) FILTER (WHERE model IS NOT NULL) as model_val,
    MAX(category) as cat
  FROM public.work_inventory
  WHERE (LOWER(name) LIKE '%zahorra%' OR LOWER(name) LIKE '%todo en uno%')
    AND (LOWER(category) LIKE '%cutillas%' OR LOWER(last_supplier) LIKE '%cutillas%')
  GROUP BY work_id, name, item_type
  HAVING COUNT(*) > 1
),
updated AS (
  UPDATE public.work_inventory w
  SET 
    quantity = zc.total_tons,
    unit = 't',
    last_entry_date = COALESCE(zc.max_date, w.last_entry_date),
    last_supplier = COALESCE(w.last_supplier, zc.supplier),
    delivery_note_number = COALESCE(w.delivery_note_number, zc.delivery),
    product_code = COALESCE(w.product_code, zc.prod_code),
    unit_price = COALESCE(w.unit_price, zc.price),
    batch_number = COALESCE(w.batch_number, zc.batch),
    brand = COALESCE(w.brand, zc.brand_val),
    model = COALESCE(w.model, zc.model_val),
    category = COALESCE(w.category, zc.cat),
    updated_at = now()
  FROM zahorra_consolidated zc
  WHERE w.id = zc.all_ids[1]
  RETURNING zc.all_ids
)
DELETE FROM public.work_inventory w
USING updated u
WHERE w.id = ANY (u.all_ids[2:array_length(u.all_ids, 1)]);

-- Normalizar unidades restantes de zahorra
UPDATE public.work_inventory
SET 
  unit = 't',
  quantity = CASE 
    WHEN unit IN ('tn', 'TN', 'Tn', 't', 'T') THEN quantity
    WHEN unit IN ('kg', 'KG', 'Kg') THEN quantity / 1000.0
    WHEN unit IN ('ud', 'UD', 'Ud') THEN quantity
    ELSE quantity
  END,
  updated_at = now()
WHERE (LOWER(name) LIKE '%zahorra%' OR LOWER(name) LIKE '%todo en uno%')
  AND (LOWER(category) LIKE '%cutillas%' OR LOWER(last_supplier) LIKE '%cutillas%')
  AND unit != 't';