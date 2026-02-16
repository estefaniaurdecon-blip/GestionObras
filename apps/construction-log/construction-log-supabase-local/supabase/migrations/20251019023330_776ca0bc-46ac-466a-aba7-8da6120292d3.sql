BEGIN;

-- 1) Eliminar TODOS los constraints únicos existentes en work_inventory
DO $$ 
DECLARE
  constraint_rec RECORD;
BEGIN
  FOR constraint_rec IN 
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.work_inventory'::regclass 
      AND contype = 'u'
  LOOP
    EXECUTE 'ALTER TABLE public.work_inventory DROP CONSTRAINT IF EXISTS ' || constraint_rec.conname;
  END LOOP;
END $$;

-- 2) Añadir columna generada para normalizar unidad si no existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='work_inventory' AND column_name='unit_norm'
  ) THEN
    ALTER TABLE public.work_inventory
    ADD COLUMN unit_norm text GENERATED ALWAYS AS (lower(btrim(unit))) STORED;
  END IF;
END $$;

-- 3) Normalizar valores de unidad
UPDATE public.work_inventory
SET unit = lower(btrim(unit))
WHERE unit IS NOT NULL AND unit <> lower(btrim(unit));

-- 4) Fusionar duplicados agrupando SOLO por (work_id, name, item_type, unit) SIN categoría
WITH groups AS (
  SELECT 
    work_id,
    name,
    item_type,
    unit,
    ARRAY_AGG(id ORDER BY created_at) AS all_ids,
    SUM(COALESCE(quantity, 0)) AS total_qty,
    MAX(last_entry_date) AS max_last_entry_date,
    MAX(last_supplier) FILTER (WHERE last_supplier IS NOT NULL) AS supplier_agg,
    MAX(delivery_note_number) FILTER (WHERE delivery_note_number IS NOT NULL) AS delivery_agg,
    MAX(product_code) FILTER (WHERE product_code IS NOT NULL) AS product_code_agg,
    MAX(unit_price) FILTER (WHERE unit_price IS NOT NULL) AS unit_price_agg,
    MAX(total_price) FILTER (WHERE total_price IS NOT NULL) AS total_price_agg,
    MAX(batch_number) FILTER (WHERE batch_number IS NOT NULL) AS batch_agg,
    MAX(brand) FILTER (WHERE brand IS NOT NULL) AS brand_agg,
    MAX(model) FILTER (WHERE model IS NOT NULL) AS model_agg,
    MAX(category) FILTER (WHERE category IS NOT NULL) AS category_agg
  FROM public.work_inventory
  GROUP BY work_id, name, item_type, unit
  HAVING COUNT(*) > 1
),
updated AS (
  UPDATE public.work_inventory w
  SET 
    quantity = g.total_qty,
    last_entry_date = COALESCE(g.max_last_entry_date, w.last_entry_date),
    last_supplier = COALESCE(w.last_supplier, g.supplier_agg),
    delivery_note_number = COALESCE(w.delivery_note_number, g.delivery_agg),
    product_code = COALESCE(w.product_code, g.product_code_agg),
    unit_price = COALESCE(w.unit_price, g.unit_price_agg),
    total_price = COALESCE(w.total_price, g.total_price_agg),
    batch_number = COALESCE(w.batch_number, g.batch_agg),
    brand = COALESCE(w.brand, g.brand_agg),
    model = COALESCE(w.model, g.model_agg),
    category = COALESCE(w.category, g.category_agg),
    updated_at = now()
  FROM groups g
  WHERE w.id = g.all_ids[1]
  RETURNING g.all_ids
)
DELETE FROM public.work_inventory w
USING updated u
WHERE w.id = ANY (u.all_ids[2:array_length(u.all_ids, 1)]);

-- 5) Crear nuevo constraint único basado solo en (work_id, name, item_type, unit_norm)
ALTER TABLE public.work_inventory
ADD CONSTRAINT work_inventory_unique_norm UNIQUE (work_id, name, item_type, unit_norm);

COMMIT;