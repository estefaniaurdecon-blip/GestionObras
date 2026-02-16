-- Add image field to work_rental_machinery table
ALTER TABLE work_rental_machinery 
ADD COLUMN IF NOT EXISTS image TEXT;