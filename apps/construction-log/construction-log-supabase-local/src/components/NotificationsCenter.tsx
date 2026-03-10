import { useState, useEffect, useMemo } from 'react';
import { Bell, Check, CheckCheck, Trash2, Download, FileText, FileSpreadsheet, Building2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import {
  getErpWorkReport,
} from '@/integrations/api/client';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import {
  extractWorkReportDetail,
  type WorkReportDetail,
} from '@/services/workReportContract';
import type { Notification as AppNotification } from '@/types/notifications';
import type { WorkReport } from '@/types/workReport';
import { toApiReportId, useNotificationDownload } from '@/hooks/useNotificationDownload';

type NotificationWorkDetail = WorkReportDetail;
type NotificationsCenterProps = {
  companyLogo?: string;
  reports?: WorkReport[];
};

export const NotificationsCenter = ({
  companyLogo,
  reports = [],
}: NotificationsCenterProps) => {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { isOfi } = useUserPermissions();
  const [open, setOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const [workReportDetails, setWorkReportDetails] = useState<Record<string, NotificationWorkDetail>>({});
  const [expandedWorks, setExpandedWorks] = useState<Set<string>>(new Set());
  const { handleDownload, isDownloading } = useNotificationDownload({
    selectedNotification,
    reports,
    companyLogo,
    onDownloadComplete: () => setDownloadDialogOpen(false),
  });

  // Filter notifications for 'ofi' role - only show completed/approved work reports
  const filteredNotifications = isOfi
    ? notifications.filter(n => n.type === 'work_report_approved' || n.type === 'work_report_created')
    : notifications;

  const filteredUnreadCount = isOfi
    ? filteredNotifications.filter(n => !n.read).length
    : unreadCount;

  // Load work report details for ofi role notifications
  useEffect(() => {
    if (!isOfi) return;
    
    const loadWorkReportDetails = async () => {
      const pendingNotifications = filteredNotifications
        .filter(n => n.related_id && !workReportDetails[n.related_id])
        .map((n) => ({ relatedId: n.related_id as string, reportId: toApiReportId(n.related_id) }))
        .filter((entry): entry is { relatedId: string; reportId: number } => entry.reportId !== null);

      if (pendingNotifications.length === 0) return;

      try {
        const fetched = await Promise.all(
          pendingNotifications.map(async ({ relatedId, reportId }) => {
            try {
              const report = await getErpWorkReport(reportId);
              return { relatedId, detail: extractWorkReportDetail(report) };
            } catch {
              return null;
            }
          }),
        );

        const details: Record<string, NotificationWorkDetail> = {};
        fetched.forEach((row) => {
          if (!row) return;
          details[row.relatedId] = row.detail;
        });

        if (Object.keys(details).length > 0) {
          setWorkReportDetails(prev => ({ ...prev, ...details }));
        }
      } catch (error) {
        console.error('Error loading work report details:', error);
      }
    };

    loadWorkReportDetails();
  }, [isOfi, notifications, filteredNotifications, workReportDetails]);

  // Format notification message for ofi role
  const getNotificationMessage = (notification: AppNotification) => {
    if (!isOfi || !notification.related_id) {
      return notification.message;
    }

    const details = workReportDetails[notification.related_id];
    if (!details) {
      return notification.message;
    }

    const formattedDate = new Date(details.date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    return `Obra: ${details.workName} | Número: ${details.workNumber} | Fecha: ${formattedDate}`;
  };

  // Group notifications by work for ofi role
  const groupedNotifications = useMemo(() => {
    if (!isOfi) return null;

    const groups = new Map<string, { workName: string; workNumber: string; notifications: AppNotification[] }>();

    filteredNotifications.forEach(notification => {
      if (!notification.related_id) return;

      const details = workReportDetails[notification.related_id];
      if (!details) return;

      const workKey = `${details.workNumber}-${details.workName}`;
      
      if (!groups.has(workKey)) {
        groups.set(workKey, {
          workName: details.workName,
          workNumber: details.workNumber,
          notifications: []
        });
      }

      groups.get(workKey)!.notifications.push(notification);
    });

    // Sort notifications within each group by date (newest first)
    groups.forEach(group => {
      group.notifications.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return groups;
  }, [isOfi, filteredNotifications, workReportDetails]);

  const toggleWorkExpanded = (workKey: string) => {
    setExpandedWorks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(workKey)) {
        newSet.delete(workKey);
      } else {
        newSet.add(workKey);
      }
      return newSet;
    });
  };

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    
    // Navigate to related item if exists
    if (notification.related_id && notification.type.includes('work_report')) {
      setOpen(false);
      // You could navigate to the specific work report here
      // navigate(`/work-report/${notification.related_id}`);
    }
  };

  const handleDownloadClick = (notification: AppNotification, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNotification(notification);
    setDownloadDialogOpen(true);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'work_report_created':
        return '📝';
      case 'work_report_approved':
        return '✅';
      case 'work_report_rejected':
        return '❌';
      case 'new_message':
        return '💬';
      case 'new_comment':
        return '💭';
      case 'work_report_pending':
        return '⏰';
      case 'work_assigned':
        return '🏗️';
      case 'work_expiry_warning':
        return '⚠️';
      case 'machinery_expiry_warning':
        return '🚜';
      case 'work_report_modified':
        return '✏️';
      case 'work_report_completed':
        return '✅';
      case 'anomaly_detected':
        return '🚨';
      default:
        return '🔔';
    }
  };

  const getNotificationStyle = (type: string, severity?: string) => {
    if (type === 'anomaly_detected') {
      switch (severity) {
        case 'critical':
          return 'border-l-4 border-l-destructive bg-destructive/5';
        case 'warning':
          return 'border-l-4 border-l-orange-500 bg-orange-50 dark:bg-orange-950/20';
        default:
          return 'border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20';
      }
    }
    return '';
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative text-primary-foreground hover:bg-primary-foreground/20 h-9 w-9"
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          {filteredUnreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center p-0 text-[10px] sm:text-xs font-medium"
              variant="destructive"
            >
              {filteredUnreadCount > 9 ? '9+' : filteredUnreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg sm:text-xl">Notificaciones</SheetTitle>
            {filteredUnreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-7 sm:h-8 text-xs"
              >
                <CheckCheck className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="hidden sm:inline">Marcar todas</span>
                <span className="sm:hidden">Todas</span>
              </Button>
            )}
          </div>
          <SheetDescription className="text-xs sm:text-sm">
            {filteredUnreadCount > 0 
              ? `Tienes ${filteredUnreadCount} notificación${filteredUnreadCount > 1 ? 'es' : ''} sin leer`
              : 'No tienes notificaciones sin leer'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-160px)] sm:h-[calc(100vh-140px)] mt-4 sm:mt-6 pr-2 sm:pr-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Bell className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
              <p className="text-sm sm:text-base text-muted-foreground">No tienes notificaciones</p>
            </div>
          ) : isOfi && groupedNotifications ? (
            <div className="space-y-3">
              {Array.from(groupedNotifications.entries()).map(([workKey, group]) => {
                const isExpanded = expandedWorks.has(workKey);
                const unreadInGroup = group.notifications.filter(n => !n.read).length;
                
                return (
                  <div key={workKey} className="border rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between p-3 sm:p-4 bg-accent/50 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => toggleWorkExpanded(workKey)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs sm:text-sm truncate">
                            {group.workName}
                          </p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            Nº {group.workNumber}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-[10px] sm:text-xs">
                            {group.notifications.length} parte{group.notifications.length !== 1 ? 's' : ''}
                          </Badge>
                          {unreadInGroup > 0 && (
                            <Badge variant="destructive" className="text-[10px] sm:text-xs">
                              {unreadInGroup}
                            </Badge>
                          )}
                          <ChevronDown 
                            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="divide-y">
                        {group.notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`
                              group relative p-3 sm:p-4 cursor-pointer transition-colors
                              ${notification.read ? 'bg-background' : 'bg-accent/30'}
                              hover:bg-accent
                            `}
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <div className="flex gap-2 sm:gap-3">
                              <span className="text-xl sm:text-2xl mt-0.5 sm:mt-1">
                                {getNotificationIcon(notification.type)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-semibold text-xs sm:text-sm">{notification.title}</h4>
                                  {!notification.read && (
                                    <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1 sm:mt-1.5" />
                                  )}
                                </div>
                                <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {getNotificationMessage(notification)}
                                </p>
                                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
                                  {formatDistanceToNow(new Date(notification.created_at), {
                                    addSuffix: true,
                                    locale: es
                                  })}
                                </p>
                              </div>
                            </div>
                            
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {notification.type === 'work_report_created' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 sm:h-7 sm:w-7 text-primary"
                                  onClick={(e) => handleDownloadClick(notification, e)}
                                >
                                  <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                              )}
                              {!notification.read && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 sm:h-7 sm:w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(notification.id);
                                  }}
                                >
                                  <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 sm:h-7 sm:w-7 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNotification(notification.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotifications.map((notification) => {
                const metadata = notification.metadata as Record<string, unknown> | null;
                const severity = metadata?.severity as string | undefined;
                
                return (
                <div
                  key={notification.id}
                  className={`
                    group relative p-3 sm:p-4 rounded-lg border cursor-pointer transition-colors
                    ${notification.read ? 'bg-background' : 'bg-accent/50'}
                    hover:bg-accent
                    ${getNotificationStyle(notification.type, severity)}
                  `}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex gap-2 sm:gap-3">
                    <span className="text-xl sm:text-2xl mt-0.5 sm:mt-1">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-xs sm:text-sm">{notification.title}</h4>
                        {!notification.read && (
                          <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1 sm:mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                        {getNotificationMessage(notification)}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: es
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {notification.type === 'work_report_created' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 sm:h-7 sm:w-7 text-primary"
                        onClick={(e) => handleDownloadClick(notification, e)}
                      >
                        <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 sm:h-7 sm:w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                      >
                        <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 sm:h-7 sm:w-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>

      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Descargar Parte de Trabajo</DialogTitle>
            <DialogDescription>
              Selecciona el formato y período para descargar
            </DialogDescription>
          </DialogHeader>
          
          {isDownloading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-3">Formato</h4>
              <div className="grid grid-cols-2 gap-3">
                <Card 
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => {
                    const period = 'day';
                    handleDownload('pdf', period);
                  }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-primary" />
                    <span className="text-sm font-medium">PDF</span>
                  </div>
                </Card>
                
                <Card 
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => {
                    // Will be asked for period in next step
                  }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-8 w-8 text-primary" />
                    <span className="text-sm font-medium">Excel</span>
                  </div>
                </Card>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3">Período (Excel)</h4>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload('excel', 'day')}
                >
                  Día
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload('excel', 'week')}
                >
                  Semana
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload('excel', 'month')}
                >
                  Mes
                </Button>
              </div>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </Sheet>
  );
};
