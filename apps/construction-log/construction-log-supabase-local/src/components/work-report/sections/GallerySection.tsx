import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Camera, Trash2 } from 'lucide-react';

type GalleryImage = {
  id: string;
  name: string;
  dataUrl: string;
};

type GallerySectionProps = {
  sectionTriggerClass: string;
  galleryImages: GalleryImage[];
  handleGalleryUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setGalleryImages: React.Dispatch<React.SetStateAction<GalleryImage[]>>;
};

export const GallerySection = ({
  sectionTriggerClass,
  galleryImages,
  handleGalleryUpload,
  setGalleryImages,
}: GallerySectionProps) => {
  return (
    <AccordionItem value="gallery" className="rounded-md border border-[#d9e1ea] bg-white px-4">
      <AccordionTrigger className={sectionTriggerClass}>Galería de imágenes</AccordionTrigger>
      <AccordionContent className="space-y-3 pt-2">
        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm hover:bg-slate-50">
          <Camera className="mr-2 h-4 w-4" />
          Añadir imágenes
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
        </label>
        {galleryImages.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-slate-500">Sin imágenes cargadas</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {galleryImages.map((image) => (
              <div key={image.id} className="rounded-md border bg-white p-2">
                <img src={image.dataUrl} alt={image.name} className="h-24 w-full rounded object-cover" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{image.name}</span>
                  <Button variant="ghost" size="icon" onClick={() => setGalleryImages(galleryImages.filter((item) => item.id !== image.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

export type { GallerySectionProps };

