export const cleanOrphanSession = async (): Promise<boolean> => {
  // Supabase has been removed. This helper is kept only to avoid touching the
  // Auth bootstrap flow, but it no longer attempts any Supabase calls.
  // If you need legacy cleanup, implement it here without Supabase.
  return false;
};
