import { Badge } from '@/components/ui/badge';
import { NOTE_CATEGORIES, NoteCategory } from '@/hooks/useLocalClassifier';
import { cn } from '@/lib/utils';
import { AlertTriangle, Package, ShieldCheck, Info, Sparkles } from 'lucide-react';

interface NoteCategoryChipsProps {
  selectedCategory: NoteCategory | null;
  onSelectCategory: (category: NoteCategory) => void;
  aiSuggested?: NoteCategory | null;
  disabled?: boolean;
}

const categoryConfig: Record<NoteCategory, { 
  icon: typeof AlertTriangle; 
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  'Urgente': {
    icon: AlertTriangle,
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    borderColor: 'border-red-300 dark:border-red-700'
  },
  'Materiales': {
    icon: Package,
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    borderColor: 'border-amber-300 dark:border-amber-700'
  },
  'Seguridad': {
    icon: ShieldCheck,
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700'
  },
  'Informativo': {
    icon: Info,
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-700'
  }
};

/**
 * Chips de categoría para clasificar notas de obra
 * Muestra indicador de sugerencia de IA cuando aplica
 */
export const NoteCategoryChips = ({
  selectedCategory,
  onSelectCategory,
  aiSuggested,
  disabled = false
}: NoteCategoryChipsProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {NOTE_CATEGORIES.map((category) => {
        const config = categoryConfig[category];
        const Icon = config.icon;
        const isSelected = selectedCategory === category;
        const isAiSuggested = aiSuggested === category && !isSelected;

        return (
          <button
            key={category}
            type="button"
            disabled={disabled}
            onClick={() => onSelectCategory(category)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
              'border-2 transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50',
              disabled && 'opacity-50 cursor-not-allowed',
              isSelected ? [
                config.bgColor,
                config.borderColor,
                config.color,
                'shadow-sm'
              ] : [
                'bg-muted/50 border-transparent',
                'text-muted-foreground',
                'hover:bg-muted hover:border-muted-foreground/20'
              ],
              isAiSuggested && !isSelected && [
                'ring-2 ring-primary/40 ring-offset-1',
                'animate-pulse'
              ]
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{category}</span>
            {isAiSuggested && !isSelected && (
              <Sparkles className="h-3 w-3 text-primary animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
};
