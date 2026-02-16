-- Drop the existing unique constraint that only uses (work_id, item_type, name)
ALTER TABLE work_inventory DROP CONSTRAINT IF EXISTS work_inventory_work_id_item_type_name_key;

-- Add new unique constraint that includes category (supplier) so we can have same material from different suppliers
ALTER TABLE work_inventory ADD CONSTRAINT work_inventory_work_id_item_type_name_category_key 
  UNIQUE (work_id, item_type, name, category);