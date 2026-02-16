import { Cloud, CloudOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface NetworkStatusIconProps {
  className?: string;
  showWhenOnline?: boolean;
}

/**
 * Icono compacto que muestra el estado de conexión a red
 * - Online: Nube verde (o invisible si showWhenOnline=false)
 * - Offline: Nube tachada roja
 */
export const NetworkStatusIcon = ({ 
  className,
  showWhenOnline = false 
}: NetworkStatusIconProps) => {
  const { isOnline, isOffline } = useNetworkStatus();

  // Si está online y no queremos mostrarlo, no renderizar nada
  if (isOnline && !showWhenOnline) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center justify-center p-1.5 rounded-md transition-colors',
            isOffline 
              ? 'text-destructive bg-destructive/10' 
              : 'text-green-600 dark:text-green-500 bg-green-500/10',
            className
          )}
        >
          {isOffline ? (
            <CloudOff className="h-4 w-4" />
          ) : (
            <Cloud className="h-4 w-4" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isOffline ? (
          <p className="text-xs">
            <span className="font-medium text-destructive">Modo Sin Conexión</span>
            <br />
            Los datos se guardan localmente
          </p>
        ) : (
          <p className="text-xs">
            <span className="font-medium text-green-600 dark:text-green-500">Conectado</span>
            <br />
            Sincronización activa
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
};
