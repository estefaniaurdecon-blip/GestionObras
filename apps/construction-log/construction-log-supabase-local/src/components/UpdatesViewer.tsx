import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { Download, RefreshCw, Loader2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';

export const UpdatesViewer = () => {
  const { t } = useTranslation();
  const { updateInfo, checking, downloading, checkForUpdates, downloadAndInstallUpdate } = useAppUpdates();
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const isNative = Capacitor.isNativePlatform();

  const handleRefresh = async () => {
    await checkForUpdates(false, true);
    setLastChecked(new Date());
  };

  const handleDownload = () => {
    if (isNative) {
      // En móvil, abrir navegador para descargar
      downloadAndInstallUpdate();
    } else {
      // En web/escritorio, abrir URL en nueva pestaña
      if (updateInfo?.downloadUrl) {
        window.open(updateInfo.downloadUrl, '_blank');
      }
    }
  };

  const handleDirectInstall = () => {
    downloadAndInstallUpdate();
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl sm:text-2xl">Actualizaciones</CardTitle>
            <CardDescription className="text-sm">
              Verifica y gestiona nuevas versiones
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={checking}
            className="w-full sm:w-auto"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Buscar actualizaciones</span>
            <span className="ml-2 sm:hidden">Buscar</span>
          </Button>
        </div>
        {lastChecked && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-primary/50" />
            <span>Última comprobación: {lastChecked.toLocaleTimeString()}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {updateInfo ? (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/5 via-background to-accent/10 p-5">
              {/* Header con versión */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Download className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="font-semibold text-base sm:text-lg truncate">
                        v{updateInfo.version}
                      </h3>
                    </div>
                    {updateInfo.isMandatory && (
                      <Badge variant="destructive" className="text-xs">
                        Obligatoria
                      </Badge>
                    )}
                  </div>
                  {updateInfo.fileSize && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                      <span>{(updateInfo.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notas de versión */}
              {updateInfo.releaseNotes && (
                <div className="mb-4 p-3 rounded-lg bg-background/50 backdrop-blur-sm border">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <span className="text-primary">📝</span>
                    Novedades
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {updateInfo.releaseNotes}
                  </p>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleDirectInstall}
                  disabled={downloading}
                  className="w-full h-11 font-medium shadow-sm"
                  size="lg"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="hidden sm:inline">Instalando...</span>
                      <span className="sm:hidden">Instalando</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">
                        {isNative ? 'Instalar ahora' : 'Actualizar directamente'}
                      </span>
                      <span className="sm:hidden">Instalar</span>
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={handleDownload}
                  disabled={downloading}
                  variant="outline"
                  className="w-full h-11"
                  size="lg"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">Descargar al dispositivo</span>
                  <span className="sm:hidden">Descargar</span>
                </Button>
              </div>

              {/* Nota informativa */}
              {isNative && (
                <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-muted">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    💡 La descarga se abrirá en el navegador. Asegúrate de tener habilitada la instalación desde fuentes desconocidas.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              {checking ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <RefreshCw className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <p className="text-base font-medium mb-1">
              {checking ? 'Buscando actualizaciones...' : 'Todo actualizado'}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {checking 
                ? 'Estamos verificando si hay nuevas versiones disponibles' 
                : 'No hay actualizaciones disponibles en este momento'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
