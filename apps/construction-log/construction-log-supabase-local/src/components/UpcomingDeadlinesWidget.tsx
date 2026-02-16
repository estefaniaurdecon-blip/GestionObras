import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUpcomingDeadlines, DeadlineItem } from "@/hooks/useUpcomingDeadlines";
import { CalendarClock, CheckCircle2, PartyPopper, Hourglass, Flame, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface UpcomingDeadlinesWidgetProps {
  compact?: boolean;
}

const getStatusBadge = (daysRemaining: number, status: 'ok' | 'warning' | 'critical') => {
  if (status === 'critical') {
    if (daysRemaining < 0) {
      return (
        <Badge className="bg-destructive text-destructive-foreground animate-pulse">
          <Flame className="h-3 w-3 mr-1" />
          {Math.abs(daysRemaining)} días retraso
        </Badge>
      );
    }
    return (
      <Badge className="bg-destructive text-destructive-foreground animate-pulse">
        <Flame className="h-3 w-3 mr-1" />
        ¡Vence hoy!
      </Badge>
    );
  }
  
  if (status === 'warning') {
    return (
      <Badge className="bg-warning text-warning-foreground">
        <Hourglass className="h-3 w-3 mr-1" />
        {daysRemaining} {daysRemaining === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  
  return (
    <Badge className="bg-primary text-primary-foreground">
      <Hourglass className="h-3 w-3 mr-1" />
      {daysRemaining} días
    </Badge>
  );
};

const getProgressColor = (status: 'ok' | 'warning' | 'critical') => {
  switch (status) {
    case 'critical':
      return '[&>div]:bg-destructive';
    case 'warning':
      return '[&>div]:bg-warning';
    default:
      return '[&>div]:bg-primary';
  }
};

export const UpcomingDeadlinesWidget = ({ compact = false }: UpcomingDeadlinesWidgetProps) => {
  const { deadlines, isLoading } = useUpcomingDeadlines(compact ? 3 : 5);
  const [isOpen, setIsOpen] = useState(false);

  // Contar por estado para el resumen
  const criticalCount = deadlines.filter(d => d.status === 'critical').length;
  const warningCount = deadlines.filter(d => d.status === 'warning').length;

  if (isLoading) {
    return (
      <Card className={compact ? "" : "col-span-full"}>
        <div className="p-4 flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-primary animate-pulse" />
          <span className="text-sm text-muted-foreground">Cargando vencimientos...</span>
        </div>
      </Card>
    );
  }

  // Estado vacío positivo - todo al día (compacto)
  if (deadlines.length === 0) {
    return (
      <Card className={cn(
        "border-success/50 bg-success/5",
        compact ? "" : "col-span-full"
      )}>
        <div className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-success">¡Todo al día!</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              No hay partidas pendientes esta semana
            </span>
          </div>
          <PartyPopper className="h-4 w-4 text-success ml-auto" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={compact ? "" : "col-span-full"}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors rounded-lg">
            <CalendarClock className={cn(
              "h-5 w-5",
              criticalCount > 0 ? "text-destructive" : warningCount > 0 ? "text-warning" : "text-primary"
            )} />
            <div className="flex items-center gap-2 flex-1">
              <span className="font-medium text-sm">Próximos Vencimientos</span>
              <div className="flex items-center gap-1.5">
                {criticalCount > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">
                    <Flame className="h-3 w-3 mr-0.5" />
                    {criticalCount}
                  </Badge>
                )}
                {warningCount > 0 && (
                  <Badge className="bg-warning text-warning-foreground text-xs px-1.5 py-0 h-5">
                    <Hourglass className="h-3 w-3 mr-0.5" />
                    {warningCount}
                  </Badge>
                )}
                {criticalCount === 0 && warningCount === 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                    {deadlines.length} pendientes
                  </Badge>
                )}
              </div>
            </div>
            <ChevronDown className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <div className={cn(
              "gap-3",
              compact ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            )}>
              {deadlines.map((item: DeadlineItem) => (
                <div
                  key={item.id}
                  className={cn(
                    "p-3 rounded-lg border bg-card transition-colors",
                    item.status === 'critical' && "border-destructive/50 bg-destructive/5",
                    item.status === 'warning' && "border-warning/50 bg-warning/5"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <span className="font-medium text-sm truncate block">
                        {item.name}
                      </span>
                      {item.workName && (
                        <span className="text-xs text-muted-foreground truncate block">
                          {item.workName}
                        </span>
                      )}
                    </div>
                    {getStatusBadge(item.daysRemaining, item.status)}
                  </div>
                  <div className="space-y-1">
                    <Progress 
                      value={item.progress} 
                      className={cn("h-2", getProgressColor(item.status))}
                    />
                    <span className="text-xs text-muted-foreground">
                      {item.progress}% completado
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};