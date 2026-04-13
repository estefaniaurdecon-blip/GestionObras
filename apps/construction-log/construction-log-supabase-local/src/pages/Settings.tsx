import { useCallback, useEffect, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpCenter, type HelpCenterTab } from '@/components/HelpCenter';
import { UpdatesViewer } from '@/components/UpdatesViewer';
import { ProfileSettingsPanel } from '@/components/api/ProfileSettingsPanel';
import { UsersAdminPanel } from '@/components/api/UsersAdminPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { getCanonicalUserRoleLabel, getUserPrimaryCanonicalRole } from '@/lib/userRoles';
import { isTenantAdminRole, normalizeRoles } from './indexHelpers';

type SettingsTab = 'profile' | 'users' | 'updates' | 'help';

const SETTINGS_TABS: SettingsTab[] = ['profile', 'users', 'updates', 'help'];
const HELP_TABS: HelpCenterTab[] = ['features', 'faq', 'chat'];

const isSettingsTab = (value: string | null): value is SettingsTab =>
  value !== null && SETTINGS_TABS.includes(value as SettingsTab);

const isHelpTab = (value: string | null): value is HelpCenterTab =>
  value !== null && HELP_TABS.includes(value as HelpCenterTab);

const SettingsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading, refreshUser } = useAuth();
  const { updateInfo } = useAppUpdates();

  const roles = useMemo(() => normalizeRoles(user?.roles), [user?.roles]);
  const isSuperAdmin =
    Boolean(user?.is_super_admin) || roles.includes('super_admin') || roles.includes('master');
  const isTenantAdmin = roles.some(isTenantAdminRole);
  const showUserManagementTab = isSuperAdmin || isTenantAdmin;
  const showUpdatesTab = true;
  const hasPendingUpdate = showUpdatesTab && Boolean(updateInfo?.updateAvailable);
  const roleName = useMemo(
    () =>
      getCanonicalUserRoleLabel(
        getUserPrimaryCanonicalRole({
          isSuperAdmin: user?.is_super_admin,
          roles,
          roleName: user?.role_name,
        }),
      ),
    [roles, user?.is_super_admin, user?.role_name],
  );

  const allowedTabs = useMemo<SettingsTab[]>(
    () => [
      'profile',
      ...(showUserManagementTab ? (['users'] as SettingsTab[]) : []),
      ...(showUpdatesTab ? (['updates'] as SettingsTab[]) : []),
      'help',
    ],
    [showUpdatesTab, showUserManagementTab],
  );

  const rawTab = searchParams.get('tab');
  const rawHelpTab = searchParams.get('helpTab');
  const activeTab = isSettingsTab(rawTab) && allowedTabs.includes(rawTab) ? rawTab : 'profile';
  const activeHelpTab = isHelpTab(rawHelpTab) ? rawHelpTab : 'features';

  const updateParams = useCallback(
    (nextTab: SettingsTab, nextHelpTab?: HelpCenterTab) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', nextTab);
      if (nextTab === 'help' && nextHelpTab && nextHelpTab !== 'features') {
        nextParams.set('helpTab', nextHelpTab);
      } else {
        nextParams.delete('helpTab');
      }
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const shouldNormalizeTab = rawTab !== activeTab;
    const shouldNormalizeHelpTab =
      activeTab === 'help'
        ? rawHelpTab === 'features' || (rawHelpTab !== null && rawHelpTab !== activeHelpTab)
        : searchParams.has('helpTab');

    if (shouldNormalizeTab || shouldNormalizeHelpTab || rawTab === null) {
      updateParams(activeTab, activeTab === 'help' ? activeHelpTab : undefined);
    }
  }, [activeHelpTab, activeTab, rawHelpTab, rawTab, searchParams, updateParams]);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando ajustes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-3 py-4 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="outline" className="gap-2" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Ajustes</h1>
              <p className="text-sm text-muted-foreground">Perfil, usuarios, actualizaciones y ayuda.</p>
            </div>
          </div>

          <div className="hidden text-right sm:block">
            <p className="truncate text-sm font-medium text-slate-900">{user.email}</p>
            <p className="text-xs text-muted-foreground">{roleName}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-2 py-5 sm:px-4 sm:py-7 lg:px-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => updateParams(value as SettingsTab, value === 'help' ? activeHelpTab : undefined)}
          className="space-y-4"
        >
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
            <TabsTrigger value="profile" className="text-sm sm:text-[15px]">
              Perfil
            </TabsTrigger>
            {showUserManagementTab ? (
              <TabsTrigger value="users" className="text-sm sm:text-[15px]">
                Gestion de usuarios
              </TabsTrigger>
            ) : null}
            {showUpdatesTab ? (
              <TabsTrigger value="updates" className="relative text-sm sm:text-[15px]">
                Actualizaciones
                {hasPendingUpdate ? (
                  <span
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-400"
                    aria-label="Actualizaciones disponibles"
                  />
                ) : null}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="help" className="text-sm sm:text-[15px]">
              Ayuda
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-0">
            <ProfileSettingsPanel user={user} onProfileUpdated={refreshUser} />
          </TabsContent>

          {showUserManagementTab ? (
            <TabsContent value="users" className="mt-0">
              <UsersAdminPanel tenantId={user.tenant_id} isSuperAdmin={Boolean(user.is_super_admin)} />
            </TabsContent>
          ) : null}

          {showUpdatesTab ? (
            <TabsContent value="updates" className="mt-0">
              <UpdatesViewer />
            </TabsContent>
          ) : null}

          <TabsContent value="help" className="mt-0">
            <HelpCenter
              initialTab={activeHelpTab}
              onTabChange={(nextHelpTab) => updateParams('help', nextHelpTab)}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default SettingsPage;
