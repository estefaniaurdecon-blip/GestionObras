import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BrandedLayout } from '@/components/BrandedLayout';
import { resetPassword } from '@/integrations/api/client';
import { saveOfflineCredential } from '@/integrations/api/offlineCredentials';

export default function UpdatePassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Enlace no válido. Solicita uno nuevo desde la pantalla de inicio de sesión.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword(token, newPassword, confirmPassword);
      if (result?.email) {
        await saveOfflineCredential(result.email, newPassword);
      }
      setSuccess(true);
    } catch (err: unknown) {
      const detail =
        err != null && typeof err === 'object' && 'detail' in err
          ? String((err as { detail: unknown }).detail)
          : err instanceof Error
          ? err.message
          : 'El enlace no es válido o ha caducado. Solicita uno nuevo.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <BrandedLayout>
        <Card className="w-full backdrop-blur-sm bg-background/95 border-primary/20 shadow-2xl">
          <CardHeader className="text-center space-y-4 pb-4">
            <div className="flex justify-center">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
            </div>
            <CardTitle className="text-xl font-bold">Enlace no válido</CardTitle>
            <CardDescription>
              Este enlace de recuperación no es válido o ya ha sido usado.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <Button className="w-full" onClick={() => navigate('/auth')}>
              Volver al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </BrandedLayout>
    );
  }

  if (success) {
    return (
      <BrandedLayout>
        <Card className="w-full backdrop-blur-sm bg-background/95 border-primary/20 shadow-2xl">
          <CardHeader className="text-center space-y-4 pb-4">
            <div className="flex justify-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-xl font-bold">Contraseña actualizada</CardTitle>
            <CardDescription>
              Tu contraseña ha sido restablecida. Ya puedes iniciar sesión.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <Button className="w-full" onClick={() => navigate('/auth')}>
              Ir al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </BrandedLayout>
    );
  }

  return (
    <BrandedLayout>
      <Card className="w-full backdrop-blur-sm bg-background/95 border-primary/20 shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-6">
          <div className="flex justify-center">
            <div className="bg-primary/10 p-4 rounded-full ring-2 ring-primary/20">
              <Lock className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Nueva contraseña</CardTitle>
            <CardDescription className="text-base mt-1">
              Elige una contraseña segura de al menos 8 caracteres
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pb-8">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
              {loading ? 'Guardando...' : 'Establecer nueva contraseña'}
            </Button>

            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/auth')}>
              Volver al inicio de sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </BrandedLayout>
  );
}
