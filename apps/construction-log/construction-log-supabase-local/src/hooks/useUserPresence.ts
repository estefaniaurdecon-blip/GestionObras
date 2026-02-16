import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Note: RealtimeChannel type from @supabase/supabase-js - disabled
// Using stub type since Supabase is no longer used
type RealtimeChannel = any;

interface PresenceState {
  [key: string]: Array<{
    user_id: string;
    online_at: string;
  }>;
}

export const useUserPresence = () => {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [channel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    // Note: User presence via Supabase Realtime is disabled
    // This feature is pending migration to the new backend
    console.log('[useUserPresence] Feature disabled - Supabase Realtime not available');
    
    // Return empty cleanup function
    return () => {};
  }, [user]);

  const isUserOnline = (userId: string): boolean => {
    // Always return false since presence is not available
    return false;
  };

  return {
    onlineUsers,
    isUserOnline,
  };
};
