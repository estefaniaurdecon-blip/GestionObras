import React, { useEffect, useState } from 'react';
import { CheckCircle2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SuccessAnimationProps {
  message?: string;
  onComplete?: () => void;
  duration?: number;
}

export const SuccessAnimation: React.FC<SuccessAnimationProps> = ({ 
  message, 
  onComplete,
  duration = 2000
}) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => setShow(true), 50);
    
    // Auto-hide after duration
    if (onComplete) {
      const completeTimer = setTimeout(onComplete, duration);
      return () => {
        clearTimeout(timer);
        clearTimeout(completeTimer);
      };
    }
    
    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-4 p-6',
      'transition-all duration-500',
      show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
    )}>
      <div className="relative">
        {/* Círculo de fondo con animación */}
        <div className={cn(
          'absolute inset-0 bg-green-500/20 rounded-full',
          'animate-ping'
        )} />
        
        {/* Ícono principal */}
        <div className={cn(
          'relative bg-green-500 text-white rounded-full p-4',
          'animate-scale-in'
        )}>
          <CheckCircle2 className="h-8 w-8" />
        </div>
        
        {/* Check animado */}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center',
          'animate-fade-in animation-delay-300'
        )}>
          <Check className="h-12 w-12 text-white stroke-[3]" />
        </div>
      </div>
      
      {message && (
        <p className={cn(
          'text-base font-medium text-center',
          'animate-fade-in animation-delay-500'
        )}>
          {message}
        </p>
      )}
    </div>
  );
};
