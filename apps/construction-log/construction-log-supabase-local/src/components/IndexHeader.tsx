import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppIcon } from '@/components/AppIcon';
import { NetworkStatusIcon } from '@/components/NetworkStatusIcon';
import { NotificationsCenter } from '@/components/NotificationsCenter';
import { MobileActionsMenu } from '@/components/MobileActionsMenu';
import { Capacitor } from '@capacitor/core';
import { Globe, LogOut, MessageSquare, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMessages } from '@/hooks/useMessages';

type IndexHeaderProps = {
  roleLabel: string;
  userEmail: string;
  roleName: string;
  // Optional for backwards compatibility with old Index prop wiring.
  worksLoading?: boolean;
  syncing?: boolean;
  tenantUnavailable?: boolean;
  tenantErrorMessage?: string;
  showUpdatesTab?: boolean;
  hasPendingUpdate?: boolean;
  onReloadWorks?: () => void;
  onSyncNow?: () => Promise<void>;
  onOpenSettings: () => void;
  onSignOut: () => Promise<void>;
};

export const IndexHeader = ({
  roleLabel,
  userEmail,
  roleName,
  showUpdatesTab: _showUpdatesTab,
  hasPendingUpdate = false,
  onOpenSettings,
  onSignOut,
}: IndexHeaderProps) => {
  const isAndroidPlatform = Capacitor.getPlatform() === 'android';
  const navigate = useNavigate();
  const { unreadCount } = useMessages();

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
          <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <AppIcon size={34} className="flex-shrink-0" />
              <div className="min-w-0 leading-tight">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-[15px] sm:text-lg font-semibold truncate">Partes de trabajo y C.A. 2.0</h1>
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

            <div className="flex w-full items-center justify-end gap-1 sm:w-auto sm:gap-2 flex-shrink-0">
              <NetworkStatusIcon />

              <NotificationsCenter />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => document.dispatchEvent(new Event('open-chat-center'))}
                className="relative h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                title="Mensajería"
              >
                <MessageSquare className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                ) : null}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/radar')}
                className="h-9 w-9 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground rounded-lg"
                title="Radar de Obras"
              >
                <Globe className="h-4 w-4" />
              </Button>

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

              <div className="sm:hidden">
                <MobileActionsMenu />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-2 sm:px-4 lg:px-6 py-3 border-b bg-slate-100">
        <div className="overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
          <TabsList className="grid h-auto min-h-12 w-full grid-cols-2 gap-2 rounded-xl bg-slate-200/90 p-1 sm:grid-cols-4">
            <TabsTrigger
              value="work-reports"
              className="min-h-10 h-auto w-full whitespace-normal rounded-lg px-2 py-1.5 text-[13px] sm:text-[15px] md:text-base font-medium leading-tight data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Partes de trabajo
            </TabsTrigger>
            <TabsTrigger
              value="access-control"
              className="min-h-10 h-auto w-full whitespace-normal rounded-lg px-2 py-1.5 text-[13px] sm:text-[15px] md:text-base font-medium leading-tight data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Control de accesos
            </TabsTrigger>
            <TabsTrigger
              value="works"
              className="min-h-10 h-auto w-full whitespace-normal rounded-lg px-2 py-1.5 text-[13px] sm:text-[15px] md:text-base font-medium leading-tight data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Obras
            </TabsTrigger>
            <TabsTrigger
              value="economics"
              className="min-h-10 h-auto w-full whitespace-normal rounded-lg px-2 py-1.5 text-[13px] sm:text-[15px] md:text-base font-medium leading-tight data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Análisis económico
            </TabsTrigger>
          </TabsList>
        </div>
      </div>
    </>
  );
};
