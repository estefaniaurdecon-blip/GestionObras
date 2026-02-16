-- Ensure unique constraint includes unit for correct grouping by supplier, concept and unit
ALTER TABLE public.work_inventory DROP CONSTRAINT IF EXISTS work_inventory_work_id_item_type_name_category_key;
ALTER TABLE public.work_inventory DROP CONSTRAINT IF EXISTS work_inventory_work_id_item_type_name_key;

ALTER TABLE public.work_inventory ADD CONSTRAINT work_inventory_work_id_item_type_name_category_unit_key
  UNIQUE (work_id, item_type, name, category, unit);
