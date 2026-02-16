import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2, UserPlus, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createUser,
  deleteUser,
  listUsersByTenant,
  updateUserStatus,
  type ApiUser,
} from '@/integrations/api/client';
import { toast } from '@/hooks/use-toast';

interface UsersAdminPanelProps {
  tenantId?: number | null;
  isSuperAdmin?: boolean;
}

interface UserFormState {
  email: string;
  fullName: string;
  password: string;
  roleName: string;
}

const INITIAL_FORM: UserFormState = {
  email: '',
  fullName: '',
  password: '',
  roleName: 'user',
};

export function UsersAdminPanel({ tenantId, isSuperAdmin = false }: UsersAdminPanelProps) {
  const envTenantId = useMemo(() => {
    const fromEnv = Number(import.meta.env.VITE_TENANT_ID);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 1;
  }, []);

  const [selectedTenantId, setSelectedTenantId] = useState<number>(tenantId || envTenantId);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(INITIAL_FORM);

  useEffect(() => {
    if (tenantId && tenantId !== selectedTenantId) {
      setSelectedTenantId(tenantId);
    }
  }, [tenantId, selectedTenantId]);

  const loadUsers = useCallback(async () => {
    if (!selectedTenantId) {
      setUsers([]);
      setError('No hay tenant seleccionado para cargar usuarios');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await listUsersByTenant(selectedTenantId);
      setUsers(data);
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTenantId) {
      toast({
        title: 'Tenant requerido',
        description: 'Selecciona un tenant para crear usuarios',
        variant: 'destructive',
      });
      return;
    }

    setFormLoading(true);
    try {
      await createUser({
        email: form.email.trim().toLowerCase(),
        full_name: form.fullName.trim(),
        password: form.password,
        tenant_id: selectedTenantId,
        role_name: form.roleName.trim() || 'user',
        is_super_admin: false,
      });

      toast({
        title: 'Usuario creado',
        description: 'El usuario se ha creado correctamente',
      });

      setForm(INITIAL_FORM);
      await loadUsers();
    } catch (createError: any) {
      toast({
        title: 'No se pudo crear el usuario',
        description: createError?.message || 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (targetUser: ApiUser) => {
    try {
      const updated = await updateUserStatus(targetUser.id, !targetUser.is_active);
      setUsers((prev) => prev.map((item) => (item.id === targetUser.id ? updated : item)));
      toast({
        title: updated.is_active ? 'Usuario activado' : 'Usuario desactivado',
        description: updated.email,
      });
    } catch (updateError: any) {
      toast({
        title: 'No se pudo actualizar el usuario',
        description: updateError?.message || 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async (targetUser: ApiUser) => {
    try {
      await deleteUser(targetUser.id);
      setUsers((prev) => prev.filter((item) => item.id !== targetUser.id));
      toast({
        title: 'Usuario eliminado',
        description: targetUser.email,
      });
    } catch (deleteError: any) {
      toast({
        title: 'No se pudo eliminar el usuario',
        description: deleteError?.message || 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Usuarios del tenant</CardTitle>
          <div className="flex items-center gap-2">
            {isSuperAdmin ? (
              <Input
                type="number"
                min={1}
                className="w-24 h-8"
                value={selectedTenantId}
                onChange={(event) => setSelectedTenantId(Number(event.target.value || 1))}
              />
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void loadUsers()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {loading ? <div className="text-sm text-muted-foreground">Cargando usuarios...</div> : null}
          {!loading && users.length === 0 ? (
            <div className="text-sm text-muted-foreground">No hay usuarios para el tenant seleccionado.</div>
          ) : null}

          <div className="space-y-2">
            {users.map((item) => (
              <div
                key={item.id}
                className="rounded-md border bg-white p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <div className="font-medium text-sm">{item.full_name || item.email}</div>
                  <div className="text-xs text-muted-foreground">{item.email}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={item.is_active ? 'default' : 'secondary'}>
                      {item.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    <Badge variant="outline">{item.role_name || 'user'}</Badge>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleToggleActive(item)}
                  >
                    <UserX className="h-4 w-4 mr-2" />
                    {item.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => void handleDeleteUser(item)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crear usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="api-user-email">Email</Label>
              <Input
                id="api-user-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="api-user-full-name">Nombre completo</Label>
              <Input
                id="api-user-full-name"
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="api-user-password">Password</Label>
              <Input
                id="api-user-password"
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="api-user-role">Rol</Label>
              <Input
                id="api-user-role"
                value={form.roleName}
                onChange={(event) => setForm((prev) => ({ ...prev, roleName: event.target.value }))}
                placeholder="user | admin | site_manager"
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={formLoading}>
                <UserPlus className="h-4 w-4 mr-2" />
                {formLoading ? 'Creando...' : 'Crear usuario'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
