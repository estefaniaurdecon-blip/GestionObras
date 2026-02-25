import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle, Clock, Wrench } from 'lucide-react';

interface ActiveRepaso {
  id: string;
  code: string;
  status: 'pending' | 'in_progress';
  description: string;
  assigned_company: string | null;
  estimated_hours: number;
  actual_hours: number;
}

interface ActiveRepasosSectionProps {
  workId: string | null;
}

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertCircle },
  in_progress: { label: 'En Proceso', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
};

export const ActiveRepasosSection: React.FC<ActiveRepasosSectionProps> = ({ workId }) => {
  const [repasos, setRepasos] = useState<ActiveRepaso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActiveRepasos = async () => {
      if (!workId) {
        setRepasos([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('work_repasos')
          .select('id, code, status, description, assigned_company, estimated_hours, actual_hours')
          .eq('work_id', workId)
          .in('status', ['pending', 'in_progress'])
          .order('code', { ascending: true });

        if (error) throw error;
        
        // Cast para asegurar el tipo correcto
        const typedData = (data || []).map(item => ({
          ...item,
          status: item.status as 'pending' | 'in_progress'
        }));
        
        setRepasos(typedData);
      } catch (error) {
        console.error('Error fetching active repasos:', error);
        setRepasos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActiveRepasos();
  }, [workId]);

  // No mostrar nada si no hay repasos activos
  if (!loading && repasos.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingCount = repasos.filter(r => r.status === 'pending').length;
  const inProgressCount = repasos.filter(r => r.status === 'in_progress').length;
  const totalHours = repasos.reduce((sum, r) => sum + (r.estimated_hours || 0), 0);

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5 text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <span>{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5 text-blue-600">
          <Clock className="h-4 w-4" />
          <span>{inProgressCount} en proceso</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Wrench className="h-4 w-4" />
          <span>{totalHours}h estimadas</span>
        </div>
      </div>

      {/* Lista de repasos */}
      <div className="space-y-2">
        {repasos.map((repaso) => {
          const StatusIcon = STATUS_CONFIG[repaso.status].icon;
          return (
            <Card key={repaso.id} className="bg-muted/30">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{repaso.code}</span>
                      <Badge className={`text-xs ${STATUS_CONFIG[repaso.status].color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {STATUS_CONFIG[repaso.status].label}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{repaso.description}</p>
                    {repaso.assigned_company && (
                      <p className="text-xs text-muted-foreground mt-1">
                        📍 {repaso.assigned_company}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {repaso.actual_hours || 0}h / {repaso.estimated_hours || 0}h
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground italic">
        💡 Los repasos se gestionan desde la sección "Obras" → "Repasos"
      </p>
    </div>
  );
};
