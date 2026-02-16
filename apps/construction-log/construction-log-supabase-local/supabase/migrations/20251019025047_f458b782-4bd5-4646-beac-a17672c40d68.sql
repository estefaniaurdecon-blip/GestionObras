-- Consolidar duplicados entre material y herramienta
WITH normalized_duplicates AS (
  SELECT 
    work_id,
    REGEXP_REPLACE(UPPER(TRIM(name)), '\s+', ' ', 'g') as norm_name,
    unit,
    ARRAY_AGG(id ORDER BY 
      CASE item_type 
        WHEN 'herramienta' THEN 1 
        ELSE 2 
      END,
      created_at
    ) as all_ids,
    SUM(quantity) as total_qty,
    MAX(last_entry_date) as max_date,
    MAX(last_supplier) FILTER (WHERE last_supplier IS NOT NULL) as supplier,
    MAX(delivery_note_number) FILTER (WHERE delivery_note_number IS NOT NULL) as delivery,
    MAX(product_code) FILTER (WHERE product_code IS NOT NULL) as prod_code,
    MAX(unit_price) FILTER (WHERE unit_price IS NOT NULL) as price,
    MAX(batch_number) FILTER (WHERE batch_number IS NOT NULL) as batch,
    MAX(brand) FILTER (WHERE brand IS NOT NULL) as brand_val,
    MAX(model) FILTER (WHERE model IS NOT NULL) as model_val,
    MAX(category) as cat,
    ARRAY_AGG(DISTINCT name) as original_names
  FROM work_inventory
  GROUP BY work_id, REGEXP_REPLACE(UPPER(TRIM(name)), '\s+', ' ', 'g'), unit
  HAVING COUNT(DISTINCT item_type) > 1
),
typed_duplicates AS (
  SELECT 
    *,
    CASE 
      WHEN norm_name ~ '(MARTILLO|TALADRO|PALA SDS|MIRA|LASER|CABLE|BASE MULTIPLE|GAFA|GUANTE|CHALECO|CAMISETA|PANTALON|DISPENSADOR)' 
        THEN 'herramienta'
      ELSE 'material'
    END as determined_type
  FROM normalized_duplicates
),
updated AS (
  UPDATE work_inventory w
  SET 
    quantity = td.total_qty,
    item_type = td.determined_type,
    name = td.original_names[1],
    last_entry_date = COALESCE(td.max_date, w.last_entry_date),
    last_supplier = COALESCE(w.last_supplier, td.supplier),
    delivery_note_number = COALESCE(w.delivery_note_number, td.delivery),
    product_code = COALESCE(w.product_code, td.prod_code),
    unit_price = COALESCE(w.unit_price, td.price),
    batch_number = COALESCE(w.batch_number, td.batch),
    brand = COALESCE(w.brand, td.brand_val),
    model = COALESCE(w.model, td.model_val),
    category = COALESCE(w.category, td.cat),
    updated_at = now()
  FROM typed_duplicates td
  WHERE w.id = td.all_ids[1]
  RETURNING td.all_ids
)
DELETE FROM work_inventory w
USING updated u
WHERE w.id = ANY (u.all_ids[2:array_length(u.all_ids, 1)]);