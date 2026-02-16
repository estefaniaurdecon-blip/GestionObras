import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useAuth } from '@/contexts/AuthContext';
import { UpdatesViewer } from './UpdatesViewer';
import { UpdatesAdminPanel } from './admin/UpdatesAdminPanel';

export const UpdateManager = () => {
  const { isMaster, isAdmin } = useUserPermissions();
  const { user } = useAuth();

  // Acceso basado en roles: master y admin pueden gestionar actualizaciones
  const canManageUpdates = isMaster || isAdmin;

  // Todos los usuarios autenticados pueden ver actualizaciones
  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Visor de actualizaciones disponible para todos los usuarios */}
      <UpdatesViewer />
      
      {/* Panel de administración solo para master/admin */}
      {canManageUpdates && <UpdatesAdminPanel />}
    </div>
  );
};
