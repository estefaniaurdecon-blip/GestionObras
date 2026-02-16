-- Enable realtime for shared_files table
ALTER TABLE public.shared_files REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_files;
