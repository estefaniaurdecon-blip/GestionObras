-- Ensure full row data is sent on updates for realtime payloads
ALTER TABLE public.organizations REPLICA IDENTITY FULL;