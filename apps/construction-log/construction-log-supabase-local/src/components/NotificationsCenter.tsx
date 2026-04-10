import { Bell, Check, CheckCheck, ClipboardCheck, Clock3, HardHat, MessageSquare, Tractor, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Notification as AppNotification } from '@/types/notifications';
type NotificationsCenterProps = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void> | void;
  markAllAsRead: () => Promise<void> | void;
  deleteNotification: (notificationId: string) => Promise<void> | void;
};

const getNotificationIcon = (type: AppNotification['type']) => {
  switch (type) {
    case 'work_report_pending':
      return <Clock3 className="h-5 w-5 text-amber-600" />;
    case 'work_report_approved':
      return <ClipboardCheck className="h-5 w-5 text-emerald-600" />;
    case 'work_assigned':
      return <HardHat className="h-5 w-5 text-blue-600" />;
    case 'task_pending':
      return <Clock3 className="h-5 w-5 text-rose-600" />;
    case 'machinery_expiry_warning':
      return <Tractor className="h-5 w-5 text-orange-600" />;
    case 'new_message':
      return <MessageSquare className="h-5 w-5 text-sky-600" />;
    default:
      return <Bell className="h-5 w-5 text-muted-foreground" />;
  }
};

const isSyntheticNotification = (notification: AppNotification): boolean =>
  notification.metadata?.synthetic === true;

export const NotificationsCenter = ({
  notifications,
  unreadCount,
  loading,
  markAsRead,
  markAllAsRead,
  deleteNotification,
}: NotificationsCenterProps) => {
  const navigate = useNavigate();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-primary-foreground hover:bg-primary-foreground/20 h-9 w-9"
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center p-0 text-[10px] sm:text-xs font-medium"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg sm:text-xl">Notificaciones</SheetTitle>
            {unreadCount > 0 && (
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
            {unreadCount > 0
              ? `Tienes ${unreadCount} notificacion${unreadCount > 1 ? 'es' : ''} sin leer`
              : 'No tienes notificaciones sin leer'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-160px)] sm:h-[calc(100vh-140px)] mt-4 sm:mt-6 pr-2 sm:pr-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Bell className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
              <p className="text-sm sm:text-base text-muted-foreground">No tienes notificaciones</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`
                    group relative p-3 sm:p-4 rounded-lg border cursor-pointer transition-colors
                    ${notification.read ? 'bg-background' : 'bg-accent/50'}
                    hover:bg-accent
                  `}
                  onClick={() => {
                    if (!notification.read) {
                      void markAsRead(notification.id);
                    }
                    if (notification.type === 'work_assigned' || notification.type === 'task_pending') {
                      navigate('/task-calendar');
                    }
                  }}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm sm:text-base leading-5">
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!notification.read && !isSyntheticNotification(notification) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 sm:h-7 sm:w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          void markAsRead(notification.id);
                        }}
                      >
                        <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                    {!isSyntheticNotification(notification) ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 sm:h-7 sm:w-7 text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteNotification(notification.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
