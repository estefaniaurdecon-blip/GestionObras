import { AlertCircle, Clock, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkRepasos } from '@/hooks/useWorkRepasos';

interface ActiveRepasosSectionProps {
  workId: string | null;
}

export const ActiveRepasosSection: React.FC<ActiveRepasosSectionProps> = ({ workId }) => {
  const { repasos, loading } = useWorkRepasos(workId ?? '');

  if (!workId) return null;

  const active = repasos.filter((r) => r.status === 'pending' || r.status === 'in_progress');

  if (!loading && active.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-800">
          <Wrench className="h-4 w-4 shrink-0" />
          Repasos activos en esta obra
          <Badge variant="outline" className="ml-auto border-amber-300 bg-amber-100 text-amber-800 text-xs">
            {loading ? '…' : active.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        {loading ? (
          <p className="text-xs text-amber-700">Cargando repasos…</p>
        ) : (
          <div className="space-y-1.5">
            {active.map((repaso) => {
              const isPending = repaso.status === 'pending';
              return (
                <div
                  key={repaso.id}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  {isPending ? (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  ) : (
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-700">{repaso.code}</span>
                      <Badge
                        variant="outline"
                        className={
                          isPending
                            ? 'border-amber-200 bg-amber-50 text-amber-700 text-[10px] py-0 px-1'
                            : 'border-blue-200 bg-blue-50 text-blue-700 text-[10px] py-0 px-1'
                        }
                      >
                        {isPending ? 'Pendiente' : 'En proceso'}
                      </Badge>
                      {repaso.estimated_hours > 0 && (
                        <span className="ml-auto text-slate-400">{repaso.estimated_hours}h est.</span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-slate-600">{repaso.description}</p>
                    {repaso.assigned_company && (
                      <p className="text-slate-400">{repaso.assigned_company}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
