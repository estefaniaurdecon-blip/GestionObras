import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { TaskCalendarView } from '@/components/TaskCalendarView';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantGate } from '@/hooks/useTenantGate';
import { getCanonicalUserRoleLabel, getUserPrimaryCanonicalRole } from '@/lib/userRoles';
import { isTenantAdminRole, normalizeRoles } from './indexHelpers';

export default function TaskCalendar() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    resolvedTenantId,
    tenantResolving,
    tenantNeedsPicker,
    tenantErrorMessage,
  } = useTenantGate(user);

  const roles = useMemo(() => normalizeRoles(user?.roles), [user?.roles]);
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
  const isSuperAdmin =
    Boolean(user?.is_super_admin) || roles.includes('super_admin') || roles.includes('master');
  const isTenantAdmin = roles.some(isTenantAdminRole);
  const canManageTasks = isSuperAdmin || isTenantAdmin;

  return (
    <div className="min-h-screen bg-slate-100">
      <main
        className="mx-auto max-w-7xl px-2 pb-5 pt-4 sm:px-4 sm:pb-7 sm:pt-5 lg:px-6"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="mb-4 flex items-center">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="h-10 rounded-xl bg-slate-200 px-3 text-slate-700 hover:bg-slate-300 hover:text-slate-900"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </div>

        {tenantResolving ? (
          <div className="rounded-3xl border bg-white px-6 py-8 text-sm text-muted-foreground shadow-sm">
            Cargando calendario...
          </div>
        ) : tenantNeedsPicker ? (
          <div className="rounded-3xl border bg-white px-6 py-8 text-sm text-muted-foreground shadow-sm">
            Selecciona antes un tenant activo en la pantalla principal para abrir el calendario.
          </div>
        ) : !resolvedTenantId && user?.is_super_admin ? (
          <div className="rounded-3xl border bg-white px-6 py-8 text-sm text-muted-foreground shadow-sm">
            {tenantErrorMessage}
          </div>
        ) : (
          <TaskCalendarView
            tenantId={resolvedTenantId}
            currentUser={user}
            canManageTasks={canManageTasks}
          />
        )}
      </main>
    </div>
  );
}
