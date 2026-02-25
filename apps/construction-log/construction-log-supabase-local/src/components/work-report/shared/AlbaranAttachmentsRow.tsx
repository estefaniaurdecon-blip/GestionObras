import { Button } from '@/components/ui/button';
import { ImageIcon } from 'lucide-react';

type AlbaranAttachmentsRowProps = {
  imageUris: string[];
  onOpenViewer: () => void;
  className?: string;
};

export const AlbaranAttachmentsRow = ({ imageUris, onOpenViewer, className }: AlbaranAttachmentsRowProps) => {
  if (imageUris.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-xs text-slate-600 ${className || ''}`}>
      <span className="font-medium">Adjuntos:</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={(event) => {
          event.stopPropagation();
          onOpenViewer();
        }}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        Ver albaran ({imageUris.length})
      </Button>
    </div>
  );
};

export type { AlbaranAttachmentsRowProps };

