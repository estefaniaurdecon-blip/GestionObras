import { FormEvent, useMemo, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  changePassword,
  getApiBaseUrl,
  updateCurrentUserProfile,
  type ApiUser,
} from '@/integrations/api/client';
import { saveOfflineCredential, verifyOfflineCredential } from '@/integrations/api/offlineCredentials';
import { offlineDb } from '@/offline-db/db';
import { toast } from '@/hooks/use-toast';

interface ProfileSettingsPanelProps {
  user: ApiUser;
  onProfileUpdated?: () => Promise<void> | void;
}

export function ProfileSettingsPanel({ user, onProfileUpdated }: ProfileSettingsPanelProps) {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [language, setLanguage] = useState(user.language || 'es');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const canReachApi = async (): Promise<boolean> => {
    try {
      const baseUrl = getApiBaseUrl().replace(/\/$/, '');
      const healthUrl =
        baseUrl === '/api' || baseUrl.endsWith('/api')
          ? `${baseUrl}/v1/health`
          : `${baseUrl}/api/v1/health`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(healthUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // Reachable API even if endpoint returns auth-related status.
      return response.ok || response.status === 401 || response.status === 403;
    } catch {
      return false;
    }
  };

  const languageOptions = useMemo(
    () => [
      { value: 'es', label: 'Espanol' },
      { value: 'en', label: 'English' },
      { value: 'fr', label: 'Francais' },
    ],
    []
  );

  const handleProfileSave = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await updateCurrentUserProfile({
        full_name: fullName.trim(),
        language,
        avatar_url: user.avatar_url || null,
      });
      if (onProfileUpdated) {
        await onProfileUpdated();
      }
      toast({
        title: 'Perfil actualizado',
        description: 'Los cambios de perfil se guardaron correctamente',
      });
    } catch (profileError: any) {
      toast({
        title: 'No se pudo actualizar el perfil',
        description: profileError?.message || 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async (event: FormEvent) => {
    event.preventDefault();

    if (newPassword !== newPasswordConfirm) {
      toast({
        title: 'Contraseñas diferentes',
        description: 'Las nuevas contraseñas no coinciden',
        variant: 'destructive',
      });
      return;
    }

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const isReachable = isOnline && (await canReachApi());

    setSavingPassword(true);
    try {
      if (!isReachable) {
        // Offline: verificar contra credenciales locales, guardar nuevo hash y encolar en outbox
        const valid = await verifyOfflineCredential(user.email, currentPassword);
        if (!valid) {
          toast({
            title: 'Contraseña actual incorrecta',
            description: 'La contraseña actual introducida no es correcta.',
            variant: 'destructive',
          });
          return;
        }

        await saveOfflineCredential(user.email, newPassword);

        await offlineDb.transaction(async (tx) => {
          // Deduplicar: eliminar cualquier cambio pendiente anterior para este usuario
          await tx.run(
            `DELETE FROM outbox WHERE entity = 'credential_change' AND entity_id = ? AND status = 'pending';`,
            [user.email],
          );
          await tx.run(
            `INSERT INTO outbox (id, entity, entity_id, op, payload_json, created_at, attempts, last_error, status)
             VALUES (?, 'credential_change', ?, 'update', ?, ?, 0, NULL, 'pending');`,
            [
              crypto.randomUUID(),
              user.email,
              JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                new_password_confirm: newPasswordConfirm,
              }),
              Date.now(),
            ],
          );
        });

        setCurrentPassword('');
        setNewPassword('');
        setNewPasswordConfirm('');
        toast({
          title: 'Contraseña actualizada localmente',
          description: 'El cambio se enviará al servidor la próxima vez que te conectes.',
        });
        return;
      }

      // Online: llamar a la API directamente
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      try {
        await saveOfflineCredential(user.email, newPassword);
      } catch (offlineCredentialError) {
        console.warn('[Profile] No se pudo actualizar credencial offline tras cambiar contraseña:', offlineCredentialError);
      }
      toast({
        title: 'Contraseña actualizada',
        description: 'La contraseña se ha cambiado correctamente',
      });
    } catch (passwordError: any) {
      toast({
        title: 'No se pudo cambiar la contraseña',
        description:
          (typeof passwordError?.data?.detail === 'string' && passwordError.data.detail) ||
          passwordError?.message ||
          'Intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil de usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSave} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={user.email} disabled />
            </div>

            <div className="space-y-1">
              <Label htmlFor="profile-language">Idioma</Label>
              <select
                id="profile-language"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="profile-full-name">Nombre completo</Label>
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={savingProfile}>
                <Save className="h-4 w-4 mr-2" />
                {savingProfile ? 'Guardando...' : 'Guardar perfil'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-blue-700" />
            Cambiar password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSave} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="current-password">Actual</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-password">Nueva</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-password-confirm">Confirmar</Label>
              <Input
                id="new-password-confirm"
                type="password"
                value={newPasswordConfirm}
                onChange={(event) => setNewPasswordConfirm(event.target.value)}
                required
              />
            </div>

            <div className="md:col-span-3">
              <Button type="submit" variant="outline" disabled={savingPassword}>
                {savingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
