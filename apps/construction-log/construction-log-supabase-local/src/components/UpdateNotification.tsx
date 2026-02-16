import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { usePublicOrganizationBranding } from '@/hooks/usePublicOrganizationBranding';
import { Download, RefreshCw, Sparkles, AlertTriangle } from 'lucide-react';

export const UpdateNotification = () => {
  const { t } = useTranslation();
  const { updateInfo, downloading, downloadAndInstallUpdate, postponeUpdate } = useAppUpdates();
  const { branding } = usePublicOrganizationBranding();
  const [isOpen, setIsOpen] = useState(true);
  const [progress, setProgress] = useState(0);

  if (!updateInfo?.updateAvailable || !isOpen) return null;

  // Simulate download progress
  if (downloading && progress < 90) {
    setTimeout(() => setProgress(prev => Math.min(prev + 10, 90)), 200);
  }

  const handlePostpone = () => {
    postponeUpdate();
    setIsOpen(false);
  };

  const handleDownload = async () => {
    await downloadAndInstallUpdate();
    // Solo cerramos el diálogo si no es mandatory (el mandatory se maneja automáticamente)
    if (!updateInfo.isMandatory) {
      setIsOpen(false);
    }
  };

  const brandColor = branding?.brandColor;
  const hasCustomColors = brandColor && brandColor !== '#000000';

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="max-w-md">
        {/* Header with Organization Branding */}
        <AlertDialogHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {branding?.logo ? (
                <img
                  src={branding.logo}
                  alt={branding.name}
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <div 
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{
                    background: hasCustomColors 
                      ? `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}dd 100%)`
                      : undefined
                  }}
                >
                  <span className="text-lg font-bold text-white">
                    {branding?.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <AlertDialogTitle className="text-xl flex items-center gap-2 m-0">
                  <RefreshCw 
                    className="h-5 w-5"
                    style={{ color: hasCustomColors ? brandColor : undefined }}
                  />
                  {updateInfo.isMandatory ? 'Actualización Requerida' : 'Nueva Actualización'}
                </AlertDialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {branding?.name}
                </p>
              </div>
            </div>
            
            {updateInfo.isMandatory && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Obligatoria
              </Badge>
            )}
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription className="space-y-4">
          {/* Version Info */}
          <div 
            className="p-4 rounded-lg border-2"
            style={{
              borderColor: hasCustomColors ? `${brandColor}30` : undefined,
              background: hasCustomColors ? `${brandColor}08` : undefined
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles 
                  className="h-4 w-4"
                  style={{ color: hasCustomColors ? brandColor : undefined }}
                />
                <span className="font-semibold text-foreground text-base">
                  Versión {updateInfo.version}
                </span>
              </div>
              {updateInfo.fileSize && (
                <Badge variant="secondary" className="text-xs">
                  {(updateInfo.fileSize / 1024 / 1024).toFixed(1)} MB
                </Badge>
              )}
            </div>
            
            {updateInfo.releaseNotes && (
              <div className="mt-3">
                <p className="font-medium text-sm text-foreground mb-2">
                  Novedades:
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {updateInfo.releaseNotes}
                </p>
              </div>
            )}
          </div>

          {/* Download Progress */}
          {downloading && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Descargando actualización...</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress 
                value={progress} 
                className="h-2"
                style={{
                  background: hasCustomColors ? `${brandColor}20` : undefined
                }}
              />
            </div>
          )}

          {/* Mandatory Warning */}
          {updateInfo.isMandatory && !downloading && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
              <p className="text-sm text-amber-600 dark:text-amber-500 font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Esta actualización es obligatoria y debe instalarse para continuar
              </p>
            </div>
          )}
        </AlertDialogDescription>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          {!updateInfo.isMandatory && !downloading && (
            <AlertDialogCancel onClick={handlePostpone} className="w-full sm:w-auto">
              Más tarde
            </AlertDialogCancel>
          )}
          <Button
            onClick={handleDownload}
            disabled={downloading}
            className="gap-2 w-full sm:w-auto shadow-lg"
            style={{
              background: hasCustomColors && !downloading
                ? `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}dd 100%)`
                : undefined
            }}
          >
            <Download className="h-4 w-4" />
            {downloading ? 'Descargando...' : 'Descargar e Instalar'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
