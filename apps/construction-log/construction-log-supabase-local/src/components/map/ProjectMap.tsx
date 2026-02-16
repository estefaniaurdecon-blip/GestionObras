import "leaflet/dist/leaflet.css";
import "./ProjectMap.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Building2, MapPinOff, Loader2, ArrowLeft, X, Trash2, MapPin } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";
import { useWorks } from "@/hooks/useWorks";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Coordenadas por defecto: Madrid
const DEFAULT_CENTER: [number, number] = [40.416, -3.703];
const DEFAULT_ZOOM = 6;

// Icono personalizado usando Lucide React
const createCustomIcon = (isActive: boolean) => {
  const iconMarkup = renderToStaticMarkup(
    <div className={`flex items-center justify-center w-8 h-8 ${isActive ? 'bg-primary' : 'bg-muted-foreground'} rounded-full shadow-lg border-2 border-white`}>
      <Building2 className="w-4 h-4 text-primary-foreground" />
    </div>
  );

  return L.divIcon({
    html: iconMarkup,
    className: "custom-marker-icon",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

interface ProjectMapProps {
  center?: [number, number];
  zoom?: number;
  onProjectClick?: (projectId: string) => void;
}

const ProjectMap = ({
  center,
  zoom = DEFAULT_ZOOM,
  onProjectClick,
}: ProjectMapProps) => {
  const { works, loading, updateWork } = useWorks();
  const navigate = useNavigate();
  const [deleteLocationDialog, setDeleteLocationDialog] = useState<{ open: boolean; workId: string; workName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtrar solo obras con coordenadas válidas
  const geolocatedWorks = useMemo(() => {
    return works.filter(
      (work) => 
        work.latitude !== null && 
        work.latitude !== undefined && 
        work.longitude !== null && 
        work.longitude !== undefined
    );
  }, [works]);

  // Determinar si una obra está activa (sin fecha de fin o fecha de fin futura)
  const isWorkActive = (work: typeof works[0]) => {
    if (!work.end_date) return true;
    return new Date(work.end_date) >= new Date();
  };

  // Calcular el centro del mapa basado en las obras geolocalizadas
  const mapCenter = useMemo(() => {
    if (center) return center;
    if (geolocatedWorks.length === 0) return DEFAULT_CENTER;
    
    // Calcular el centroide de todas las obras
    const avgLat = geolocatedWorks.reduce((sum, w) => sum + (w.latitude || 0), 0) / geolocatedWorks.length;
    const avgLng = geolocatedWorks.reduce((sum, w) => sum + (w.longitude || 0), 0) / geolocatedWorks.length;
    
    return [avgLat, avgLng] as [number, number];
  }, [center, geolocatedWorks]);

  const handleViewDetails = (workId: string) => {
    if (onProjectClick) {
      onProjectClick(workId);
    } else {
      // Navegar a la gestión de obras y seleccionar esta obra
      navigate('/?tab=works&workId=' + workId);
    }
  };

  const handleGoBack = () => {
    navigate('/');
  };

  const handleDeleteLocation = async () => {
    if (!deleteLocationDialog) return;
    
    setIsDeleting(true);
    try {
      await updateWork(deleteLocationDialog.workId, {
        latitude: null,
        longitude: null,
      });
      toast.success('Ubicación eliminada correctamente');
      setDeleteLocationDialog(null);
    } catch (error) {
      console.error('Error deleting location:', error);
      toast.error('Error al eliminar la ubicación');
    } finally {
      setIsDeleting(false);
    }
  };

  // Contar obras activas
  const activeWorksCount = useMemo(() => {
    return geolocatedWorks.filter(isWorkActive).length;
  }, [geolocatedWorks]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {geolocatedWorks.map((work) => {
          const active = isWorkActive(work);
          return (
            <Marker
              key={work.id}
              position={[work.latitude!, work.longitude!]}
              icon={createCustomIcon(active)}
            >
              <Popup>
                <div className="p-1 min-w-[200px]">
                  <h3 className="font-semibold text-sm mb-1">{work.name}</h3>
                  {work.address && (
                    <p className="text-xs text-muted-foreground mb-1">
                      📍 {work.address}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mb-2 capitalize">
                    Estado: {active ? "Activa" : "Completada"}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      className="w-full text-xs h-7"
                      onClick={() => handleViewDetails(work.id)}
                    >
                      Ver Detalles
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full text-xs h-7"
                      onClick={() => setDeleteLocationDialog({ open: true, workId: work.id, workName: work.name })}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Eliminar Ubicación
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Barra de navegación superior */}
      <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between">
        {/* Botón Atrás */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleGoBack}
          className="h-10 px-3 rounded-lg bg-background/95 backdrop-blur-sm shadow-lg hover:bg-accent border-border gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Volver</span>
        </Button>

        {/* Info de obras */}
        {geolocatedWorks.length > 0 && (
          <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {activeWorksCount} {activeWorksCount === 1 ? 'obra activa' : 'obras activas'}
              </span>
            </div>
          </div>
        )}

        {/* Botón Salir (X) */}
        <Button
          variant="outline"
          size="icon"
          onClick={handleGoBack}
          className="h-10 w-10 rounded-lg bg-background/95 backdrop-blur-sm shadow-lg hover:bg-destructive hover:text-destructive-foreground border-border"
          aria-label="Salir"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Mensaje de estado vacío */}
      {!loading && geolocatedWorks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
          <div className="bg-background/90 backdrop-blur-sm border border-border rounded-lg p-6 shadow-xl text-center max-w-xs pointer-events-auto">
            <MapPinOff className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-2">
              Sin obras geolocalizadas
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              No hay obras con ubicación definida. Edita una obra para añadir sus coordenadas.
            </p>
            <Button onClick={handleGoBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al inicio
            </Button>
          </div>
        </div>
      )}

      {/* Dialog de confirmación para eliminar ubicación */}
      <AlertDialog open={deleteLocationDialog?.open} onOpenChange={(open) => !open && setDeleteLocationDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ubicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la ubicación GPS de la obra "{deleteLocationDialog?.workName}". 
              La obra seguirá existiendo pero no aparecerá en el mapa hasta que se le asigne una nueva ubicación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLocation}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar ubicación'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectMap;
