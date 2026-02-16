-- Añadir campos profesionales al inventario de obra
ALTER TABLE public.work_inventory
ADD COLUMN IF NOT EXISTS product_code TEXT,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS delivery_note_number TEXT,
ADD COLUMN IF NOT EXISTS batch_number TEXT,
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS model TEXT,
ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'nuevo',
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS exit_date DATE,
ADD COLUMN IF NOT EXISTS delivery_note_image TEXT,
ADD COLUMN IF NOT EXISTS observations TEXT;

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_work_inventory_product_code ON public.work_inventory(product_code);
CREATE INDEX IF NOT EXISTS idx_work_inventory_delivery_note ON public.work_inventory(delivery_note_number);
CREATE INDEX IF NOT EXISTS idx_work_inventory_brand ON public.work_inventory(brand);
CREATE INDEX IF NOT EXISTS idx_work_inventory_condition ON public.work_inventory(condition);

-- Añadir comentarios para documentación
COMMENT ON COLUMN public.work_inventory.product_code IS 'Código o referencia del producto';
COMMENT ON COLUMN public.work_inventory.unit_price IS 'Precio unitario del producto';
COMMENT ON COLUMN public.work_inventory.total_price IS 'Precio total (cantidad x precio unitario)';
COMMENT ON COLUMN public.work_inventory.delivery_note_number IS 'Número de albarán de entrada';
COMMENT ON COLUMN public.work_inventory.batch_number IS 'Número de lote o serie';
COMMENT ON COLUMN public.work_inventory.brand IS 'Marca del producto';
COMMENT ON COLUMN public.work_inventory.model IS 'Modelo del producto';
COMMENT ON COLUMN public.work_inventory.condition IS 'Estado: nuevo, usado, dañado';
COMMENT ON COLUMN public.work_inventory.location IS 'Ubicación física en la obra';
COMMENT ON COLUMN public.work_inventory.exit_date IS 'Fecha de salida del inventario';
COMMENT ON COLUMN public.work_inventory.delivery_note_image IS 'URL de la imagen del albarán';
COMMENT ON COLUMN public.work_inventory.observations IS 'Observaciones adicionales';