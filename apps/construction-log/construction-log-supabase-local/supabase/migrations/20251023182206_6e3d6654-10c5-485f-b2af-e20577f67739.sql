-- Add 'ofi' role to the app_role enum
-- This must be done in a separate transaction
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ofi';