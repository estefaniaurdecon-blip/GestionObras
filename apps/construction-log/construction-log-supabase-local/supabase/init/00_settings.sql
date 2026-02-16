-- Apply local Supabase settings for functions that read app.settings.*
ALTER DATABASE postgres SET "app.settings.supabase_url" = 'http://localhost:8000';
ALTER DATABASE postgres SET "app.settings.supabase_anon_key" = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzg4MjIsImV4cCI6MjA4NTczODgyMn0.n1gv8wddeMzjm7ckNTnB5dlTWmN5O4HIlYqCkuM4eXU';
ALTER DATABASE postgres SET default_table_access_method = 'heap';
