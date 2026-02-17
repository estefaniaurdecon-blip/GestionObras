import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { AlertCircle, Building2, Eye, EyeOff, Lock } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';

const loginIdentifierSchema = z.string().email({ message: 'Email invalido' });
const loginPasswordSchema = z.string().min(1, { message: 'Contrasena requerida' });
const mfaCodeSchema = z
  .string()
  .length(6, { message: 'El codigo MFA debe tener 6 digitos' })
  .regex(/^\d+$/, { message: 'Solo numeros permitidos' });

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn, verifyMFA } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showMFA, setShowMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaEmail, setMfaEmail] = useState('');
  const [mfaError, setMfaError] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('Necesito recuperar mi contrasena.');

  const adminSupportEmail = (
    import.meta.env.VITE_ADMIN_SUPPORT_EMAIL ||
    'admin@pendiente-configurar.com'
  ).trim();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/');
    }

    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setLoginEmail(savedEmail);
      setRememberMe(true);
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setMfaError('');

    const loginEmailValue = loginEmail.trim();

    try {
      loginIdentifierSchema.parse(loginEmailValue);
      loginPasswordSchema.parse(loginPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Error de validacion',
          description: error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    setLoading(true);

    try {
      const result = await signIn(loginEmailValue, loginPassword);

      if (result.mfaRequired) {
        setMfaEmail(loginEmailValue);
        setShowMFA(true);
        setLoading(false);
        return;
      }

      if (!result.success) {
        toast({
          title: 'Error al iniciar sesion',
          description: 'Email o contrasena incorrectos',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', loginEmailValue);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      toast({
        title: 'Bienvenido',
        description: 'Has iniciado sesion correctamente',
      });

      navigate('/');
    } catch (error: any) {
      console.error('Login error:', error);
      const explicitOfflineReason =
        typeof error?.message === 'string' &&
        (error.message.toLowerCase().includes('credenciales offline incorrectas') ||
          error.message.toLowerCase().includes('necesitas iniciar sesion online al menos una vez'));
      const rawMessage = [
        String(error?.message || ''),
        String(error?.detail || ''),
        String(error?.data?.detail || ''),
        String(error),
      ]
        .join(' ')
        .toLowerCase();
      const isNetworkFailure =
        rawMessage.includes('failed to fetch') ||
        rawMessage.includes('network request failed') ||
        rawMessage.includes('fetch failed') ||
        rawMessage.includes('networkerror') ||
        rawMessage.includes('err_internet_disconnected');

      toast({
        title: 'Error al iniciar sesion',
        description: explicitOfflineReason
          ? error.message
          : isNetworkFailure
          ? 'Sin conexion con el servidor. Para entrar offline, este usuario debe haber iniciado sesion online en este dispositivo al menos una vez.'
          : error.message || 'Email o contrasena incorrectos',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleMFAVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setMfaError('');

    try {
      mfaCodeSchema.parse(mfaCode);
    } catch (error) {
      if (error instanceof z.ZodError) {
        setMfaError(error.errors[0].message);
        return;
      }
    }

    setLoading(true);

    try {
      const success = await verifyMFA(mfaEmail, mfaCode, loginPassword);

      if (!success) {
        setMfaError('Codigo MFA incorrecto');
        setLoading(false);
        return;
      }

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', mfaEmail);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      toast({
        title: 'Bienvenido',
        description: 'Has iniciado sesion correctamente',
      });

      navigate('/');
    } catch (error: any) {
      console.error('MFA verification error:', error);
      setMfaError(error.message || 'Error al verificar el codigo MFA');
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    try {
      console.log('[Auth] Starting comprehensive cache cleanup...');

      if ((window as any).electronAPI?.clearSessionData) {
        console.log('[Auth] Calling Electron clearSessionData...');
        const result = await (window as any).electronAPI.clearSessionData();
        console.log('[Auth] Electron clearSessionData result:', result);
      }

      const { forceCleanAndReauth } = await import('@/utils/cleanElectronStorage');
      console.log('[Auth] Calling forceCleanAndReauth...');
      await forceCleanAndReauth();

      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (error) {
        console.warn('[Auth] Storage clear warning:', error);
      }

      console.log('[Auth] Cache cleanup complete, reloading...');

      toast({
        title: 'Cache limpiado',
        description: 'Se ha limpiado el cache completamente. La aplicacion se reiniciara.',
      });

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('[Auth] Error clearing cache:', error);
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (storageError) {
        console.warn('[Auth] Emergency clear failed:', storageError);
      }

      toast({
        title: 'Cache limpiado',
        description: 'Se ha limpiado el cache. La aplicacion se reiniciara.',
      });

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  };

  const openForgotPasswordDialog = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setForgotPasswordEmail(loginEmail.trim());
    setForgotPasswordMessage('Necesito recuperar mi contrasena.');
    setIsForgotPasswordOpen(true);
  };

  const handleSendForgotPasswordEmail = () => {
    if (!adminSupportEmail) {
      toast({
        title: 'Sin correo de administrador',
        description: 'Configura VITE_ADMIN_SUPPORT_EMAIL para enviar solicitudes.',
        variant: 'destructive',
      });
      return;
    }

    const requesterEmail = forgotPasswordEmail.trim() || loginEmail.trim() || 'sin-email';
    const requesterMessage = forgotPasswordMessage.trim() || 'Necesito recuperar mi contrasena.';
    const timestamp = new Date().toLocaleString('es-ES');
    const subject = encodeURIComponent('Solicitud de recuperacion de contrasena');
    const body = encodeURIComponent(
      `Hola,\n\n${requesterMessage}\n\nEmail de usuario: ${requesterEmail}\nFecha: ${timestamp}\n`
    );

    window.location.href = `mailto:${adminSupportEmail}?subject=${subject}&body=${body}`;
    setIsForgotPasswordOpen(false);

    toast({
      title: 'Solicitud preparada',
      description: `Se abrira tu correo para enviar la solicitud a ${adminSupportEmail}.`,
    });
  };

  if (showMFA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary-foreground p-3 sm:p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center space-y-2 sm:space-y-3 px-4 sm:px-6 py-4 sm:py-6">
            <div className="flex justify-center mb-2 sm:mb-4">
              <Lock className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold leading-tight">Verificacion MFA</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Ingresa el codigo de 6 digitos de tu aplicacion autenticadora
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <form onSubmit={handleMFAVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mfa-code">Codigo MFA</Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest h-14"
                  autoFocus
                />
                {mfaError ? (
                  <div className="flex items-center gap-2 text-destructive text-sm mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>{mfaError}</span>
                  </div>
                ) : null}
              </div>

              <Button type="submit" className="w-full btn-gradient h-11 text-base font-medium" disabled={loading}>
                {loading ? 'Verificando...' : 'Verificar'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setShowMFA(false);
                  setMfaCode('');
                  setMfaError('');
                }}
              >
                Volver al inicio de sesion
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary-foreground p-3 sm:p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2 sm:space-y-3 px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex justify-center mb-2 sm:mb-4">
            <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-bold leading-tight">Partes de Trabajo y C.A. 2.0</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Sistema de Gestion de Obras</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <form onSubmit={handleLogin} noValidate className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="login-email" className="text-sm sm:text-base">
                Email
              </Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  placeholder="tu@email.com"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  className="text-sm sm:text-base h-10 sm:h-11"
                  required
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="login-password" className="text-sm sm:text-base">
                Contrasena
              </Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className="text-sm sm:text-base h-10 sm:h-11 pr-10"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-2 sm:px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              />
              <Label htmlFor="remember-me" className="text-xs sm:text-sm font-normal cursor-pointer">
                Recordar mi email
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full btn-gradient h-10 sm:h-11 text-sm sm:text-base font-medium"
              disabled={loading}
            >
              {loading ? 'Iniciando...' : 'Iniciar sesion'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full h-10 sm:h-11 text-sm sm:text-base"
              onClick={handleClearCache}
            >
              Limpiar cache y reiniciar
            </Button>

          </form>

          <Button
            type="button"
            variant="link"
            className="w-full h-auto p-0 mt-2 text-xs text-primary underline underline-offset-2"
            onClick={openForgotPasswordDialog}
          >
            Olvidé mi contraseña
          </Button>

          <Dialog open={isForgotPasswordOpen} onOpenChange={setIsForgotPasswordOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Recuperar contraseña</DialogTitle>
                <DialogDescription>
                  Se enviara un correo al administrador para gestionar el acceso.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="forgot-password-email">Tu email</Label>
                  <Input
                    id="forgot-password-email"
                    type="email"
                    value={forgotPasswordEmail}
                    onChange={(event) => setForgotPasswordEmail(event.target.value)}
                    placeholder="tu@email.com"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="forgot-password-message">Mensaje</Label>
                  <Textarea
                    id="forgot-password-message"
                    value={forgotPasswordMessage}
                    onChange={(event) => setForgotPasswordMessage(event.target.value)}
                    rows={4}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Destino: {adminSupportEmail}
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsForgotPasswordOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleSendForgotPasswordEmail}>
                  Enviar email
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
