import { AlertCircle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

interface ActiveRepasosSectionProps {
  workId: string | null;
}

export const ActiveRepasosSection: React.FC<ActiveRepasosSectionProps> = ({
  workId,
}) => {
  if (!workId) {
    return null;
  }

  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="flex items-start gap-3 p-3 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          El resumen de repasos legacy esta desactivado hasta completar la
          migracion al backend actual.
        </div>
      </CardContent>
    </Card>
  );
};
