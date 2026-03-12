import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/user';
import { getCurrentUser, listManagedUserRoles } from '@/integrations/api/client';

interface UserPermissionsContextType {
  roles: AppRole[];
  loading: boolean;
  isMaster: boolean;
  isAdmin: boolean;
  isSiteManager: boolean;
  isForeman: boolean;
  isReader: boolean;
  isOfi: boolean;
  canAssignRoles: boolean;
  canAssignWorks: boolean;
  canApprove: boolean;
  reloadRoles: () => Promise<void>;
  userProfile: { full_name: string | null; organization_id: string | null } | null;
}

const UserPermissionsContext = createContext<UserPermissionsContextType | undefined>(undefined);

const normalizeRoles = (roles: unknown): AppRole[] => {
  if (!Array.isArray(roles)) return [];
  return roles.map((role) => String(role).trim()).filter(Boolean) as AppRole[];
};

export const UserPermissionsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<{ full_name: string | null; organization_id: string | null } | null>(null);

  const loadUserRoles = useCallback(async () => {
    if (!user) {
      setRoles([]);
      setUserProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setRoles(normalizeRoles(user.roles));
      setUserProfile({
        full_name: user.full_name ?? null,
        organization_id: user.tenant_id != null ? String(user.tenant_id) : null,
      });
    } catch (error) {
      console.error('Error loading user roles:', error);
      setRoles([]);
      setUserProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadUserRoles();
  }, [loadUserRoles]);

  const reloadRoles = useCallback(async () => {
    if (!user) {
      setRoles([]);
      setUserProfile(null);
      return;
    }

    try {
      setLoading(true);
      const userRoles = await listManagedUserRoles(Number(user.id));
      setRoles(userRoles as AppRole[]);

      try {
        const currentUser = await getCurrentUser();
        setUserProfile({
          full_name: currentUser.full_name ?? null,
          organization_id: currentUser.tenant_id != null ? String(currentUser.tenant_id) : null,
        });
      } catch (profileError) {
        console.error('Error loading profile:', profileError);
      }
    } catch (error) {
      console.error('Error loading user roles:', error);
      setRoles(normalizeRoles(user.roles));
      setUserProfile({
        full_name: user.full_name ?? null,
        organization_id: user.tenant_id != null ? String(user.tenant_id) : null,
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  const isMaster = roles.includes('master');
  const isAdmin = roles.includes('admin');
  const isSiteManager = roles.includes('site_manager');
  const isForeman = roles.includes('foreman');
  const isReader = roles.includes('reader');
  const isOfi = roles.includes('ofi');

  const canAssignRoles = isMaster || isAdmin;
  const canAssignWorks = isMaster || isAdmin || isSiteManager;
  const canApprove = isMaster || isAdmin || isSiteManager;

  return (
    <UserPermissionsContext.Provider
      value={{
        roles,
        loading,
        isMaster,
        isAdmin,
        isSiteManager,
        isForeman,
        isReader,
        isOfi,
        canAssignRoles,
        canAssignWorks,
        canApprove,
        reloadRoles,
        userProfile,
      }}
    >
      {children}
    </UserPermissionsContext.Provider>
  );
};

export const useUserPermissions = () => {
  const context = useContext(UserPermissionsContext);
  if (context === undefined) {
    throw new Error('useUserPermissions must be used within a UserPermissionsProvider');
  }
  return context;
};
