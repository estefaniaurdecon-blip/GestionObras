import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AUTH_SESSION_EXPIRED_EVENT,
  login as apiLogin, 
  verifyMFA as apiVerifyMFA, 
  getCurrentUser, 
  logout as apiLogout,
  getToken,
  isTokenExpired,
  resetAuthSessionExpiredNotification,
  setToken,
  clearToken,
  ApiUser 
} from '@/integrations/api/client';
import { cleanOrphanSession } from '@/utils/cleanOrphanSession';
import { clearActiveTenantId } from '@/offline-db/tenantScope';
import { toast } from '@/hooks/use-toast';
import { storage } from '@/utils/storage';
import {
  normalizeCredentialEmail,
  saveOfflineCredential,
  verifyOfflineCredential,
} from '@/integrations/api/offlineCredentials';

interface AuthContextType {
  user: ApiUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; mfaRequired?: boolean; tempToken?: string; email?: string }>;
  verifyMFA: (email: string, code: string, password?: string) => Promise<boolean>;
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
  const userRef = useRef<ApiUser | null>(null);
  const offlineWarningRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const LEGACY_CACHED_USER_KEY = 'api_cached_user_v1';
  const CACHED_USERS_KEY = 'api_cached_users_v1';

  const isBrowserOffline = () =>
    typeof navigator !== 'undefined' && navigator.onLine === false;

  const isNetworkError = (error: any): boolean => {
    if (!error) return false;
    if (error instanceof TypeError) return true;
    if (typeof error?.status === 'number') {
      if (error.status === 0) return true;
      return false;
    }
    const message = [
      String(error?.message || ''),
      String(error?.detail || ''),
      String(error?.data?.detail || ''),
      String(error?.cause?.message || ''),
      String(error),
    ]
      .join(' ')
      .toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('network request failed') ||
      message.includes('load failed') ||
      message.includes('fetch failed') ||
      message.includes('err_internet_disconnected') ||
      message.includes('err_network_changed')
    );
  };

  const isApiUserCandidate = (value: unknown): value is ApiUser => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'number' && typeof candidate.email === 'string';
  };

  const readCachedUsersStore = async (): Promise<Record<string, ApiUser>> => {
    try {
      const raw = await storage.getItem(CACHED_USERS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};

      const store: Record<string, ApiUser> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!isApiUserCandidate(value)) continue;
        store[normalizeCredentialEmail(key)] = value;
      }
      return store;
    } catch {
      return {};
    }
  };

  const readCachedUser = async (email?: string): Promise<ApiUser | null> => {
    const normalizedEmail = email ? normalizeCredentialEmail(email) : '';
    try {
      const store = await readCachedUsersStore();
      if (normalizedEmail && store[normalizedEmail]) {
        return store[normalizedEmail];
      }

      const storeValues = Object.values(store);
      if (!normalizedEmail && storeValues.length > 0) {
        return storeValues[storeValues.length - 1];
      }
    } catch {
      // Continue with legacy fallback below
    }

    // Backward compatibility with older single-user cache key
    try {
      const rawLegacy = await storage.getItem(LEGACY_CACHED_USER_KEY);
      if (!rawLegacy) return null;
      const parsedLegacy = JSON.parse(rawLegacy);
      if (!isApiUserCandidate(parsedLegacy)) return null;
      if (!normalizedEmail) return parsedLegacy;
      return normalizeCredentialEmail(parsedLegacy.email) === normalizedEmail ? parsedLegacy : null;
    } catch {
      return null;
    }
  };

  const writeCachedUser = async (userData: ApiUser): Promise<void> => {
    try {
      const normalizedEmail = normalizeCredentialEmail(userData.email || '');
      if (!normalizedEmail) return;

      const store = await readCachedUsersStore();
      store[normalizedEmail] = userData;

      await storage.setItem(CACHED_USERS_KEY, JSON.stringify(store));
      await storage.setItem(LEGACY_CACHED_USER_KEY, JSON.stringify(userData));
    } catch (error) {
      console.warn('[Auth] Could not cache user for offline mode:', error);
    }
  };

  const redirectToAuth = () => {
    const currentHashPath = window.location.hash.replace(/^#/, '');
    if (!currentHashPath.startsWith('/auth')) {
      navigate('/auth', { replace: true });
    }
  };

  const warnOfflineSessionLimited = (reason: 'offline-login' | 'expired-session') => {
    if (offlineWarningRef.current === reason) return;
    offlineWarningRef.current = reason;
    toast({
      title: 'Modo offline activo',
      description:
        reason === 'expired-session'
          ? 'La sesión ha caducado. Puedes seguir trabajando en local, pero no se sincronizará nada hasta volver a validarla online.'
          : 'Has entrado en modo offline. Puedes trabajar en local, pero no se sincronizará nada hasta recuperar conexión y validar la sesión.',
      duration: 5000,
    });
  };

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let handlingSessionExpiry = false;

    const handleSessionExpired = () => {
      if (handlingSessionExpiry) return;
      handlingSessionExpiry = true;

      void (async () => {
        let keepOfflineSession = false;
        try {
          const currentUser = userRef.current;
          await clearToken();
          if (isBrowserOffline() && currentUser) {
            keepOfflineSession = true;
            setUser(currentUser);
            setLoading(false);
            warnOfflineSessionLimited('expired-session');
            return;
          }
          await clearActiveTenantId(currentUser);
        } finally {
          if (!keepOfflineSession) {
            setUser(null);
            setLoading(false);
            redirectToAuth();
          }
          resetAuthSessionExpiredNotification();
          handlingSessionExpiry = false;
        }
      })();
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);
    };
  }, [navigate]);

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
        const expiredToken = isTokenExpired(token);
        if (hadStoredToken && expiredToken) {
          await clearToken();
        }

        // Try to resolve current user from token OR cookie session.
        try {
          const userData = await getCurrentUser();
          await writeCachedUser(userData);
          offlineWarningRef.current = null;
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

          if (
            (hadStoredToken || expiredToken) &&
            (isBrowserOffline() || isNetworkError(error))
          ) {
            const cachedUser = await readCachedUser();
            if (cachedUser) {
              console.log('[Auth] Offline session restored from cached user');
              if (isMounted) {
                setUser(cachedUser);
                setLoading(false);
              }
              if (expiredToken) {
                warnOfflineSessionLimited('expired-session');
              }
              return;
            }
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
    const loginEmail = email.trim();
    const normalizedEmail = normalizeCredentialEmail(loginEmail);

    const signInOffline = async (): Promise<{ success: boolean }> => {
      const isValidOfflineCredential = await verifyOfflineCredential(normalizedEmail, password);
      if (!isValidOfflineCredential) {
        throw new Error('Credenciales offline incorrectas.');
      }

      const cachedUser = await readCachedUser(normalizedEmail);
      if (!cachedUser) {
        throw new Error('Necesitas iniciar sesion online al menos una vez para habilitar modo offline.');
      }

      await clearToken();
      setUser(cachedUser);
      warnOfflineSessionLimited('offline-login');
      return { success: true };
    };

    if (isBrowserOffline()) {
      return signInOffline();
    }

    try {
      const response = await apiLogin({ username: loginEmail, password });
      
      // MFA required - don't store token yet
      if (response.mfa_required) {
        if (response.user) {
          await writeCachedUser(response.user);
        }
        try {
          await saveOfflineCredential(normalizedEmail, password);
        } catch (offlineCredentialError) {
          console.warn('[Auth] No se pudo guardar credencial offline tras login paso 1:', offlineCredentialError);
        }
        return { 
          success: false, 
          mfaRequired: true, 
          tempToken: response.temp_token,
          email: loginEmail,
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
        await writeCachedUser(userData);
        try {
          await saveOfflineCredential(normalizedEmail, password);
        } catch (offlineCredentialError) {
          console.warn('[Auth] No se pudo guardar credencial offline tras login:', offlineCredentialError);
        }
        offlineWarningRef.current = null;
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
      if (
        isBrowserOffline() ||
        isNetworkError(error) ||
        typeof error?.status !== 'number' ||
        error?.status === 0
      ) {
        return await signInOffline();
      }
      console.error('Login error:', error);
      throw error;
    }
  };

   /**
   * Verify MFA code and complete login
   */
  const verifyMFA = async (email: string, code: string, password?: string): Promise<boolean> => {
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
        await writeCachedUser(userData);
        if (password) {
          try {
            await saveOfflineCredential(email, password);
          } catch (offlineCredentialError) {
            console.warn('[Auth] No se pudo guardar credencial offline tras MFA:', offlineCredentialError);
          }
        }
        offlineWarningRef.current = null;
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
      offlineWarningRef.current = null;
      setUser(userData);
    } catch (error: any) {
      console.error('Error refreshing user:', error);
      if (error?.status === 401) {
        await clearToken();
        setUser(null);
        redirectToAuth();
        return;
      }
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
