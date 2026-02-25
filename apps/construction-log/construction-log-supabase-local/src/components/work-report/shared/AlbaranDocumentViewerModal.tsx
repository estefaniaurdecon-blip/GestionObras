import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { toAlbaranImageSrc } from '@/components/work-report/shared/albaranImage';

type AlbaranDocumentViewerModalProps = {
  open: boolean;
  imageUris: string[];
  title: string;
  initialIndex?: number;
  onClose: () => void;
};

export const AlbaranDocumentViewerModal = ({
  open,
  imageUris,
  title,
  initialIndex = 0,
  onClose,
}: AlbaranDocumentViewerModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const total = imageUris.length;

  useEffect(() => {
    if (!open) return;
    const safeIndex = Math.max(0, Math.min(initialIndex, Math.max(0, total - 1)));
    setCurrentIndex(safeIndex);
    setZoom(1);
  }, [initialIndex, open, total]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && total > 1) {
        setCurrentIndex((current) => (current - 1 + total) % total);
      }
      if (event.key === 'ArrowRight' && total > 1) {
        setCurrentIndex((current) => (current + 1) % total);
      }
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open, total]);

  const currentUri = imageUris[currentIndex] || '';
  const canNavigate = total > 1;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="h-[88vh] w-[95vw] max-w-5xl p-0">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#d9e1ea] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-800">{title}</p>
              <p className="text-xs text-slate-500">
                {total > 0 ? `Pagina ${currentIndex + 1} de ${total}` : 'Sin adjuntos'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}
                disabled={!currentUri || zoom <= 1}
                title="Reducir zoom"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs text-slate-600">{Math.round(zoom * 100)}%</span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}
                disabled={!currentUri || zoom >= 4}
                title="Aumentar zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="relative flex-1 bg-slate-900">
            <div className="h-full w-full overflow-auto p-3">
              {currentUri ? (
                <div className="inline-block origin-top-left" style={{ transform: `scale(${zoom})` }}>
                  <img src={toAlbaranImageSrc(currentUri)} alt={`Albaran adjunto ${currentIndex + 1}`} className="max-w-none rounded-md" />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-300">No hay adjuntos para mostrar.</div>
              )}
            </div>

            {canNavigate ? (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2"
                  onClick={() => setCurrentIndex((current) => (current - 1 + total) % total)}
                  title="Pagina anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2"
                  onClick={() => setCurrentIndex((current) => (current + 1) % total)}
                  title="Pagina siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { AlbaranDocumentViewerModalProps };

