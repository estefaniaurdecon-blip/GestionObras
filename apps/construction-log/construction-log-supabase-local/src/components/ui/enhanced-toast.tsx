import * as React from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  AlertTriangle,
  X 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast as baseToast } from '@/hooks/use-toast';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface EnhancedToastProps {
  title?: string;
  description?: string;
  type?: ToastType;
  duration?: number;
}

const getToastIcon = (type: ToastType) => {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case 'error':
      return <AlertCircle className="h-5 w-5 text-destructive" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-warning" />;
    case 'info':
      return <Info className="h-5 w-5 text-primary" />;
    default:
      return null;
  }
};

const getToastStyles = (type: ToastType) => {
  switch (type) {
    case 'success':
      return 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800';
    case 'error':
      return 'bg-destructive/10 border-destructive/20';
    case 'warning':
      return 'bg-warning/10 border-warning/20';
    case 'info':
      return 'bg-primary/10 border-primary/20';
    default:
      return '';
  }
};

export const enhancedToast = ({
  title,
  description,
  type = 'info',
  duration = 3000,
}: EnhancedToastProps) => {
  const icon = getToastIcon(type);
  const styles = getToastStyles(type);

  return baseToast({
    title: title,
    description: description,
    duration,
    className: cn(
      'animate-scale-in border-2',
      styles
    ),
  });
};
