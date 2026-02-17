import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppIcon } from '@/components/AppIcon';
import { LanguageSelector } from '@/components/LanguageSelector';
import { NetworkStatusIcon } from '@/components/NetworkStatusIcon';
import { Capacitor } from '@capacitor/core';
import { CloudUpload, LogOut, RefreshCw, Settings } from 'lucide-react';

type IndexHeaderProps = {
  roleLabel: string;
  userEmail: string;
  roleName: string;
  worksLoading: boolean;
  syncing: boolean;
  tenantUnavailable: boolean;
  tenantErrorMessage: string;
  showUserManagementTab: boolean;
  // Optional for backwards compatibility with old Index prop wiring.
  showUpdatesTab?: boolean;
  hasPendingUpdate?: boolean;
  onReloadWorks: () => void;
  onSyncNow: () => Promise<void>;
  onOpenSettings: () => void;
  onSignOut: () => Promise<void>;
};

export const IndexHeader = ({
  roleLabel,
  userEmail,
  roleName,
  worksLoading,
  syncing,
  tenantUnavailable,
  tenantErrorMessage,
  showUserManagementTab,
  showUpdatesTab: _showUpdatesTab,
  hasPendingUpdate = false,
  onReloadWorks,
  onSyncNow,
  onOpenSettings,
  onSignOut,
}: IndexHeaderProps) => {
  const isAndroidPlatform = Capacitor.getPlatform() === 'android';

  return (
    <>
      <header className="bg-blue-700 text-white shadow-sm sticky top-0 z-50">
        <div
          className="w-full px-2 sm:px-4 lg:px-6 py-2 sm:py-3"
          style={
            isAndroidPlatform
              ? {
                  paddingTop: 'max(1rem, env(safe-area-inset-top))',
                }
              : undefined
          }
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <AppIcon size={34} className="flex-shrink-0" />
              <div className="min-w-0 leading-tight">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-base sm:text-lg font-semibold truncate">Partes de Trabajo y C.A. 2.0</h1>
                  <Badge className="hidden sm:inline-flex bg-white/15 text-white border-white/20">
                    {roleLabel}
                  </Badge>
                </div>
                <p className="text-[11px] text-blue-100 truncate hidden sm:block">
                  {userEmail}
                  {roleName ? ` | ${roleName}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <NetworkStatusIcon />

              <Button
                variant="ghost"
                size="icon"
                onClick={onReloadWorks}
                disabled={worksLoading}
                className="h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                title="Recargar datos"
              >
                <RefreshCw className={`h-4 w-4 ${worksLoading ? 'animate-spin' : ''}`} />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => void onSyncNow()}
                disabled={syncing || tenantUnavailable}
                className="h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                title={tenantUnavailable ? tenantErrorMessage : 'Sincronizar (outbox)'}
              >
                <CloudUpload className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              </Button>

              <div className="hidden sm:block">
                <LanguageSelector />
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenSettings}
                className="relative h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                title="Ajustes"
              >
                <Settings className="h-4 w-4" />
                {hasPendingUpdate ? (
                  <span
                    className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-orange-400 ring-2 ring-blue-700"
                    aria-label="Actualizaciones disponibles"
                  />
                ) : null}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => void onSignOut()}
                className="h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                title="Salir"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-2 sm:px-4 lg:px-6 py-3 border-b bg-slate-100">
        <div className="overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
          <div className="flex w-max min-w-full justify-start md:justify-center">
            <TabsList className="h-auto w-max min-w-max flex-nowrap bg-slate-200/90 p-1 rounded-xl justify-center gap-1">
              <TabsTrigger
                value="work-reports"
                className="shrink-0 rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-[15px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Partes de Trabajo
              </TabsTrigger>
              <TabsTrigger
                value="access-control"
                className="shrink-0 rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-[15px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Control de Accesos
              </TabsTrigger>
              <TabsTrigger
                value="works"
                className="shrink-0 rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-[15px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Obras
              </TabsTrigger>
              <TabsTrigger
                value="economics"
                className="shrink-0 rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-[15px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Analisis Economico
              </TabsTrigger>
              {showUserManagementTab ? (
                <TabsTrigger
                  value="users"
                  className="shrink-0 rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-[15px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  Gestion de Usuarios
                </TabsTrigger>
              ) : null}
            </TabsList>
          </div>
        </div>
      </div>
    </>
  );
};
