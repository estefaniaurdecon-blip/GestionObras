import { useState } from 'react';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { Camera, Upload, X, Edit2, Loader2, Trash2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CameraScanner } from '@/components/CameraScanner';
import { useWorkReportImages } from '@/hooks/useWorkReportImages';
import { compressBase64Image } from '@/utils/imageCompression';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface WorkReportImageGalleryProps {
  workReportId: string | null;
}

export const WorkReportImageGallery = ({ workReportId }: WorkReportImageGalleryProps) => {
  const { images, isLoading, isUploading, addImage, updateDescription, deleteImage, analyzeImage } = useWorkReportImages(workReportId);
  const { toast } = useToast();
  
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  
  // Estado para el diálogo de revisión antes de guardar
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingDescription, setPendingDescription] = useState('');
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleCameraCapture = async (imageBase64: string) => {
    setIsCameraOpen(false);
    await processImage(imageBase64);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Error',
        description: 'Por favor selecciona un archivo de imagen',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      await processImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (imageBase64: string) => {
    if (!workReportId) {
      toast({
        title: 'Error',
        description: 'Debe guardar el parte antes de agregar imágenes',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsAnalyzing(true);
      
      // Compress image
      const compressed = await compressBase64Image(imageBase64, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.8,
      });

      // Analyze with AI
      const description = await analyzeImage(compressed);

      // Mostrar diálogo de revisión en lugar de guardar directamente
      setPendingImage(compressed);
      setPendingDescription(description || '');
      setShowReviewDialog(true);
      
    } catch (error) {
      console.error('Error processing image:', error);
      toast({
        title: 'Error',
        description: 'Error al procesar la imagen',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSavePendingImage = async () => {
    if (!pendingImage) return;
    
    try {
      setIsSaving(true);
      await addImage(pendingImage, pendingDescription || null);
      setShowReviewDialog(false);
      setPendingImage(null);
      setPendingDescription('');
      toast({
        title: 'Éxito',
        description: 'Imagen guardada correctamente',
      });
    } catch (error) {
      console.error('Error saving image:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar la imagen',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelPendingImage = () => {
    setShowReviewDialog(false);
    setPendingImage(null);
    setPendingDescription('');
  };

  const handleClearPendingDescription = () => {
    setPendingDescription('');
  };

  const handleEditDescription = (imageId: string, currentDescription: string | null) => {
    setEditingImageId(imageId);
    setEditDescription(currentDescription || '');
  };

  const handleSaveDescription = async () => {
    if (editingImageId) {
      await updateDescription(editingImageId, editDescription);
      setEditingImageId(null);
      setEditDescription('');
    }
  };

  const handleDeleteDescription = async (imageId: string) => {
    await updateDescription(imageId, '');
  };

  if (!workReportId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Guarda el parte para poder agregar imágenes
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsCameraOpen(true)}
          disabled={isAnalyzing}
        >
          <Camera className="w-4 h-4 mr-2" />
          Tomar Foto
        </Button>
        
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById('image-upload')?.click()}
          disabled={isAnalyzing}
        >
          <Upload className="w-4 h-4 mr-2" />
          Subir Archivo
        </Button>
        
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        
        {isAnalyzing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analizando imagen...
          </div>
        )}
        {isUploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Subiendo imagen al servidor...
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      ) : images.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No hay imágenes agregadas</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {images.map((image) => (
            <Card key={image.id} className="overflow-hidden">
              <div className="relative aspect-video bg-muted">
                <AuthenticatedImage
                  src={image.image_url}
                  alt="Imagen del parte"
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setViewImageUrl(image.image_url)}
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2"
                  onClick={() => deleteImage(image.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="p-4 space-y-2">
                {editingImageId === image.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Descripción de la imagen..."
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveDescription}>
                        Guardar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingImageId(null);
                          setEditDescription('');
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-foreground flex-1">
                        {image.description || 'Sin descripción'}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEditDescription(image.id, image.description)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        {image.description && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteDescription(image.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CameraScanner
        isOpen={isCameraOpen}
        onCapture={handleCameraCapture}
        onClose={() => setIsCameraOpen(false)}
        title="Tomar foto para el parte"
      />

      <Dialog open={!!viewImageUrl} onOpenChange={() => setViewImageUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Vista de imagen</DialogTitle>
            <DialogDescription>
              Haz clic fuera de la imagen para cerrar
            </DialogDescription>
          </DialogHeader>
          {viewImageUrl && (
            <div className="flex-1 min-h-0 overflow-auto">
              <AuthenticatedImage
                src={viewImageUrl}
                alt="Vista completa"
                className="w-full h-auto max-h-[70vh] object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de revisión antes de guardar */}
      <Dialog open={showReviewDialog} onOpenChange={(open) => !open && handleCancelPendingImage()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Revisar imagen antes de guardar</DialogTitle>
            <DialogDescription>
              Puedes editar o borrar la descripción generada por IA antes de guardar
            </DialogDescription>
          </DialogHeader>
          
          {pendingImage && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              <div className="relative bg-muted rounded-lg overflow-hidden">
                <AuthenticatedImage
                  src={pendingImage}
                  alt="Vista previa"
                  className="w-full h-auto max-h-[40vh] object-contain"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Descripción (generada por IA)</label>
                  {pendingDescription && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleClearPendingDescription}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Borrar descripción
                    </Button>
                  )}
                </div>
                <Textarea
                  value={pendingDescription}
                  onChange={(e) => setPendingDescription(e.target.value)}
                  placeholder="Escribe una descripción o déjala vacía..."
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelPendingImage}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSavePendingImage}
              disabled={isSaving || isUploading}
            >
              {isSaving || isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isUploading ? 'Subiendo...' : 'Guardando...'}
                </>
              ) : (
                'Guardar imagen'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};