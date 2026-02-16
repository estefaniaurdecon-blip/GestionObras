import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Lock, AlertTriangle } from 'lucide-react';
import { BrandedLayout } from '@/components/BrandedLayout';

export default function UpdatePassword() {
  const navigate = useNavigate();

  useEffect(() => {
    // Show message that this feature is pending migration
    toast({
      title: "Función no disponible",
      description: "La actualización de contraseña está pendiente de migración al nuevo backend.",
      variant: "destructive",
    });
    
    // Redirect to auth after a short delay
    const timeout = setTimeout(() => {
      navigate('/auth');
    }, 2000);
    
    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <BrandedLayout>
      <Card className="w-full backdrop-blur-sm bg-background/95 border-primary/20 shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
              <div className="relative bg-amber-500/10 p-4 rounded-full ring-2 ring-amber-500/20">
                <AlertTriangle className="h-10 w-10 text-amber-600" />
              </div>
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Función no disponible</CardTitle>
            <CardDescription className="text-base mt-2">
              La actualización de contraseña está pendiente de migración
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pb-8">
          <div className="space-y-5">
            <div className="bg-amber-50 p-4 rounded-lg space-y-2 text-sm text-amber-800">
              <p className="font-medium flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Estado de la migración:
              </p>
              <p>
                Esta función utilizaba Supabase Auth, que ha sido reemplazado por el sistema de autenticación 
                del nuevo backend. Por favor, contacta al administrador si necesitas restablecer tu contraseña.
              </p>
            </div>

            <Button
              type="button"
              className="w-full h-12 text-base font-semibold"
              onClick={() => navigate('/auth')}
            >
              Volver al inicio de sesión
            </Button>
          </div>
        </CardContent>
      </Card>
    </BrandedLayout>
  );
}
