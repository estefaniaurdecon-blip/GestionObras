import { ReactNode } from 'react';
import { usePublicOrganizationBranding } from '@/hooks/usePublicOrganizationBranding';
import { Skeleton } from '@/components/ui/skeleton';

interface BrandedLayoutProps {
  children: ReactNode;
  organizationId?: string;
}

export const BrandedLayout = ({ children, organizationId }: BrandedLayoutProps) => {
  const { branding, loading } = usePublicOrganizationBranding(organizationId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary-foreground p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <Skeleton className="h-24 w-24 rounded-full" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const brandColor = branding?.brandColor;
  const hasCustomColors = brandColor && brandColor !== '#000000';

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: hasCustomColors
          ? `linear-gradient(135deg, ${brandColor}15 0%, ${brandColor}05 100%)`
          : undefined
      }}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full opacity-10 blur-3xl"
          style={{
            background: hasCustomColors 
              ? `radial-gradient(circle, ${brandColor} 0%, transparent 70%)`
              : 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)'
          }}
        />
        <div 
          className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full opacity-10 blur-3xl"
          style={{
            background: hasCustomColors 
              ? `radial-gradient(circle, ${brandColor}dd 0%, transparent 70%)`
              : 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)'
          }}
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Organization Logo and Name */}
        <div className="flex flex-col items-center mb-8 animate-fade-in">
          {branding?.logo ? (
            <div className="relative mb-6">
              <div 
                className="absolute inset-0 blur-2xl opacity-30 rounded-full"
                style={{
                  background: hasCustomColors 
                    ? brandColor 
                    : 'hsl(var(--primary))'
                }}
              />
              <img
                src={branding.logo}
                alt={branding.name}
                className="h-24 w-24 object-contain relative z-10 drop-shadow-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div 
              className="h-20 w-20 rounded-full mb-6 flex items-center justify-center shadow-lg"
              style={{
                background: hasCustomColors 
                  ? `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}dd 100%)`
                  : undefined
              }}
            >
              <span className="text-3xl font-bold text-white">
                {branding?.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          
          <h1 
            className="text-2xl font-bold text-center tracking-tight"
            style={{
              color: hasCustomColors ? brandColor : undefined
            }}
          >
            {branding?.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sistema de Gestión de Obras
          </p>
        </div>

        {/* Content */}
        <div className="animate-scale-in">
          {children}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-muted-foreground animate-fade-in">
          <p>© {new Date().getFullYear()} {branding?.name}</p>
          <p className="mt-1">Todos los derechos reservados</p>
        </div>
      </div>
    </div>
  );
};
