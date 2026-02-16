import { Brain, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NoteClassifierIndicatorProps {
  isLoadingModel: boolean;
  isClassifying: boolean;
  isReady: boolean;
  modelError: string | null;
  className?: string;
}

/**
 * Indicador visual del estado del clasificador de notas con IA local
 */
export const NoteClassifierIndicator = ({
  isLoadingModel,
  isClassifying,
  isReady,
  modelError,
  className
}: NoteClassifierIndicatorProps) => {
  // Determine state and styles
  const getState = () => {
    if (modelError) {
      return {
        icon: AlertCircle,
        text: 'IA no disponible',
        className: 'text-muted-foreground',
        animate: false
      };
    }
    if (isLoadingModel) {
      return {
        icon: Brain,
        text: 'Cargando modelo IA...',
        className: 'text-amber-500',
        animate: true
      };
    }
    if (isClassifying) {
      return {
        icon: Brain,
        text: 'Clasificando nota...',
        className: 'text-primary',
        animate: true
      };
    }
    if (isReady) {
      return {
        icon: Brain,
        text: 'IA lista para clasificar',
        className: 'text-green-500',
        animate: false
      };
    }
    return {
      icon: Brain,
      text: 'Iniciando IA...',
      className: 'text-muted-foreground',
      animate: false
    };
  };

  const state = getState();
  const Icon = state.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all',
            state.className,
            className
          )}
        >
          <Icon 
            className={cn(
              'h-3.5 w-3.5',
              state.animate && 'animate-pulse'
            )} 
          />
          {(isLoadingModel || isClassifying) && (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {state.text}
      </TooltipContent>
    </Tooltip>
  );
};
