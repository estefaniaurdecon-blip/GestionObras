import React, { useState, useEffect } from 'react';
import { Monitor, Smartphone, Globe, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  getMyUserPreferences,
  updateMyUserPreferences,
  type UserPlatformPreference,
} from '@/integrations/api/client';

type Platform = UserPlatformPreference;

const platforms: { value: Platform; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'all',
    label: 'Todas las plataformas',
    icon: <Bell className="w-5 h-5" />,
    description: 'Recibe notificaciones de actualizaciones para Windows, Android y Web'
  },
  {
    value: 'windows',
    label: 'Windows',
    icon: <Monitor className="w-5 h-5" />,
    description: 'Solo notificaciones de actualizaciones para escritorio Windows'
  },
  {
    value: 'android',
    label: 'Android',
    icon: <Smartphone className="w-5 h-5" />,
    description: 'Solo notificaciones de actualizaciones para dispositivos Android'
  },
  {
    value: 'web',
    label: 'Web',
    icon: <Globe className="w-5 h-5" />,
    description: 'Solo notificaciones de actualizaciones para la versión web'
  }
];

export const PlatformPreferences: React.FC = () => {
  const { user } = useAuth();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadPreference = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const data = await getMyUserPreferences();
        if (data?.user_platform) {
          setSelectedPlatform(data.user_platform as Platform);
        }
      } catch (error: unknown) {
        console.error('Error loading platform preference:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreference();
  }, [user]);

  const handlePlatformChange = async (value: Platform) => {
    if (!user) return;
    
    setSaving(true);
    try {
      await updateMyUserPreferences(value);
      
      setSelectedPlatform(value);
      toast({
        title: 'Preferencia guardada',
        description: `Ahora recibirás notificaciones de actualizaciones para ${platforms.find(p => p.value === value)?.label}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la preferencia';
      console.error('Error saving platform preference:', error);
      toast({
        title: 'Error al guardar',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardContent className="py-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notificaciones de Actualizaciones
        </CardTitle>
        <CardDescription>
          Elige qué actualizaciones te interesan según la plataforma que uses
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={selectedPlatform}
          onValueChange={(value) => handlePlatformChange(value as Platform)}
          disabled={saving}
          className="space-y-3"
        >
          {platforms.map((platform) => (
            <div
              key={platform.value}
              className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                selectedPlatform === platform.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value={platform.value} id={platform.value} className="mt-1" />
              <Label htmlFor={platform.value} className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 font-medium">
                  {platform.icon}
                  {platform.label}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {platform.description}
                </p>
              </Label>
            </div>
          ))}
        </RadioGroup>
        
        {saving && (
          <p className="text-sm text-muted-foreground mt-3 animate-pulse">
            Guardando preferencia...
          </p>
        )}
      </CardContent>
    </Card>
  );
};
