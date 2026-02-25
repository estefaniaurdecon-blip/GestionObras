import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export const UpdatesAdminPanel = () => {
  return (
    <Card className="border-amber-300/40 bg-amber-50/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <CardTitle>Actualizaciones legacy retiradas</CardTitle>
          <Badge variant="secondary">DocInt-only</Badge>
        </div>
        <CardDescription>
          El pipeline de actualizaciones basado en Supabase (storage, publish y versionado) esta desactivado en runtime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
          <p>El flujo principal de escaneo y revision de albaranes sigue operativo.</p>
        </div>
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
          <p>No se realizan llamadas a Supabase desde este panel.</p>
        </div>
      </CardContent>
    </Card>
  );
};
