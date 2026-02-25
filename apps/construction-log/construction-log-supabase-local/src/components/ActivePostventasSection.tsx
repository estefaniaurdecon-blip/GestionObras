import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle, Clock, Wrench } from 'lucide-react';

interface ActivePostventa {
  id: string;
  code: string;
  status: 'pending' | 'in_progress';
  description: string;
  assigned_company: string | null;
  estimated_hours: number;
  actual_hours: number;
}

interface ActivePostventasSectionProps {
  workId: string | null;
}

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: AlertCircle },
  in_progress: { label: 'En Proceso', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Clock },
};

export const ActivePostventasSection: React.FC<ActivePostventasSectionProps> = ({ workId }) => {
  const [postventas, setPostventas] = useState<ActivePostventa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivePostventas = async () => {
      if (!workId) {
        setPostventas([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('work_postventas')
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
        
        setPostventas(typedData);
      } catch (error) {
        console.error('Error fetching active postventas:', error);
        setPostventas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivePostventas();
  }, [workId]);

  // No mostrar nada si no hay post-ventas activas
  if (!loading && postventas.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingCount = postventas.filter(p => p.status === 'pending').length;
  const inProgressCount = postventas.filter(p => p.status === 'in_progress').length;
  const totalHours = postventas.reduce((sum, p) => sum + (p.estimated_hours || 0), 0);

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5 text-purple-600">
          <AlertCircle className="h-4 w-4" />
          <span>{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5 text-indigo-600">
          <Clock className="h-4 w-4" />
          <span>{inProgressCount} en proceso</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Wrench className="h-4 w-4" />
          <span>{totalHours}h estimadas</span>
        </div>
      </div>

      {/* Lista de post-ventas */}
      <div className="space-y-2">
        {postventas.map((postventa) => {
          const StatusIcon = STATUS_CONFIG[postventa.status].icon;
          return (
            <Card key={postventa.id} className="bg-muted/30">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{postventa.code}</span>
                      <Badge className={`text-xs ${STATUS_CONFIG[postventa.status].color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {STATUS_CONFIG[postventa.status].label}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{postventa.description}</p>
                    {postventa.assigned_company && (
                      <p className="text-xs text-muted-foreground mt-1">
                        📍 {postventa.assigned_company}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {postventa.actual_hours || 0}h / {postventa.estimated_hours || 0}h
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground italic">
        💡 Las post-ventas se gestionan desde la sección "Obras" → "Post-Venta"
      </p>
    </div>
  );
};
