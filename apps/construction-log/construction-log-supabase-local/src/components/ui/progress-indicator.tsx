import React from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressStep {
  label: string;
  progress: number;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  currentStep: number;
  currentProgress: number;
  className?: string;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  steps,
  currentStep,
  currentProgress,
  className
}) => {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Barra de progreso general */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">
            {steps[currentStep]?.label || 'Procesando...'}
          </span>
          <span className="text-muted-foreground">
            {Math.round(currentProgress)}%
          </span>
        </div>
        <Progress 
          value={currentProgress} 
          className="h-2 animate-pulse"
        />
      </div>

      {/* Lista de pasos */}
      <div className="space-y-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isPending = index > currentStep;

          return (
            <div
              key={index}
              className={cn(
                'flex items-center gap-3 p-2 rounded-lg transition-all duration-300',
                isCurrent && 'bg-accent/50 animate-fade-in',
                isCompleted && 'opacity-70'
              )}
            >
              {/* Ícono de estado */}
              <div className={cn(
                'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
                'transition-all duration-300',
                isCompleted && 'bg-green-500 animate-scale-in',
                isCurrent && 'bg-primary animate-pulse',
                isPending && 'bg-muted'
              )}>
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-white" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                ) : (
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                )}
              </div>

              {/* Texto del paso */}
              <span className={cn(
                'text-sm transition-all duration-300',
                isCompleted && 'text-muted-foreground line-through',
                isCurrent && 'text-foreground font-medium',
                isPending && 'text-muted-foreground'
              )}>
                {step.label}
              </span>

              {/* Progreso del paso actual */}
              {isCurrent && (
                <div className="ml-auto flex-shrink-0">
                  <Progress 
                    value={currentProgress - step.progress} 
                    className="w-16 h-1.5"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
