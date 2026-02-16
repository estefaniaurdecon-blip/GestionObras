import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  login as apiLogin, 
  verifyMFA as apiVerifyMFA, 
  getCurrentUser, 
  logout as apiLogout,
  getToken,
  setToken,
  clearToken,
  ApiUser 
} from '@/integrations/api/client';
import { cleanOrphanSession } from '@/utils/cleanOrphanSession';
import { clearActiveTenantId } from '@/offline-db/tenantScope';

interface AuthContextType {
  user: ApiUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; mfaRequired?: boolean; tempToken?: string; email?: string }>;
  verifyMFA: (email: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({ success: false }),
  verifyMFA: async () => false,
  signOut: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const redirectToAuth = () => {
    const currentHashPath = window.location.hash.replace(/^#/, '');
    if (!currentHashPath.startsWith('/auth')) {
      navigate('/auth', { replace: true });
    }
  };

  // Load user on mount if token exists
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Clean orphan sessions first
        const wasOrphan = await cleanOrphanSession();
        
        if (wasOrphan) {
          console.log('[Auth] Orphan session cleaned, starting fresh');
          if (isMounted) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        const token = await getToken();
        const hadStoredToken = Boolean(token?.access_token);

        // Try to resolve current user from token OR cookie session.
        try {
          const userData = await getCurrentUser();
          if (isMounted) {
            setUser(userData);
            setLoading(false);
          }
        } catch (error: any) {
          if (error?.status === 401) {
            await clearToken();
            if (isMounted) {
              setUser(null);
              setLoading(false);
            }
            // Only force redirect when we had stale local auth state.
            if (hadStoredToken && isMounted) {
              redirectToAuth();
            }
            return;
          }

          console.log('[Auth] No valid session found:', error.message);
          if (isMounted) {
            setUser(null);
            setLoading(false);
          }
        }
      } catch (err) {
        console.log('[Auth] Error during initialization:', err);
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Sign in with email and password
   * Returns { success: true } on success, { success: false, mfaRequired: true } if MFA is needed
   */
  const signIn = async (email: string, password: string): Promise<{ success: boolean; mfaRequired?: boolean; tempToken?: string; email?: string }> => {
    try {
      const response = await apiLogin({ username: email, password });
      
      // MFA required - don't store token yet
      if (response.mfa_required) {
        return { 
          success: false, 
          mfaRequired: true, 
          tempToken: response.temp_token,
          email 
        };
      }
      
      // Optional JWT in body (backend can also authenticate only via HttpOnly cookie).
      if (response.access_token) {
        await setToken({
          access_token: response.access_token,
          token_type: response.token_type || 'Bearer',
        });
      }

      // Session must be usable immediately after login (token-based or cookie-based).
      try {
        const userData = await getCurrentUser();
        setUser(userData);
        return { success: true };
      } catch (refreshError: any) {
        await clearToken();
        setUser(null);

        if (refreshError?.status === 401) {
          throw new Error('Sesion no establecida tras login. Vuelve a intentarlo.');
        }

        throw refreshError;
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  };

  /**
   * Verify MFA code and complete login
   */
  const verifyMFA = async (email: string, code: string): Promise<boolean> => {
    try {
      const response = await apiVerifyMFA({ username: email, mfa_code: code });
      
      if (response.access_token) {
        await setToken({
          access_token: response.access_token,
          token_type: response.token_type || 'Bearer',
        });
      }

      // Always confirm session by reading /users/me right after MFA.
      try {
        const userData = await getCurrentUser();
        setUser(userData);
        return true;
      } catch (refreshError: any) {
        await clearToken();
        setUser(null);
        if (refreshError?.status === 401) {
          throw new Error('Sesion no establecida tras MFA. Inicia sesion de nuevo.');
        }
        throw refreshError;
      }
    } catch (error: any) {
      console.error('MFA verification error:', error);
      throw error;
    }
  };

  /**
   * Sign out - clear token and navigate to auth page
   */
  const signOut = async () => {
    const currentUser = user;
    try {
      await apiLogout();
    } catch (error) {
      console.log('Sign out error (continuing anyway):', error);
    } finally {
      await clearActiveTenantId(currentUser);
      await clearToken();
      setUser(null);
      navigate('/auth', { replace: true });
    }
  };

  /**
   * Refresh current user info
   */
  const refreshUser = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (error: any) {
      console.error('Error refreshing user:', error);
      if (error?.status === 401) {
        await clearToken();
        setUser(null);
        redirectToAuth();
        return;
      }
      setUser(null);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signIn,
    verifyMFA,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
