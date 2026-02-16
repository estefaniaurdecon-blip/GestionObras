import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

// Lazy load del mapa para mejor rendimiento
const ProjectMap = lazy(() => import("@/components/map/ProjectMap"));

const RadarPage = () => {
  return (
    <div className="relative w-full h-screen">
      {/* Mapa ocupando todo el espacio */}
      <Suspense 
        fallback={
          <div className="w-full h-full flex items-center justify-center bg-muted/50">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        }
      >
        <ProjectMap />
      </Suspense>
    </div>
  );
};

export default RadarPage;
