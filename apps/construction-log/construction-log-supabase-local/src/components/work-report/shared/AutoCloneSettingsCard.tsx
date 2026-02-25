import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

type AutoCloneSettingsCardProps = {
  autoCloneNextDay: boolean;
  onAutoCloneNextDayChange: (value: boolean) => void;
};

export const AutoCloneSettingsCard = ({
  autoCloneNextDay,
  onAutoCloneNextDayChange,
}: AutoCloneSettingsCardProps) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Clonación automática</CardTitle>
      </CardHeader>
      <CardContent>
        <label className="flex items-start gap-3 rounded-md border bg-blue-50 p-3 text-sm">
          <Checkbox
            className="h-3 w-3 shrink-0"
            checked={autoCloneNextDay}
            onCheckedChange={(checked) => onAutoCloneNextDayChange(Boolean(checked))}
          />
          <div>
            <p className="font-medium">Clonar automáticamente mañana a las 06:00</p>
            <p className="text-sm text-slate-600">Si activas esta opción, este parte se clona para el siguiente día laborable.</p>
          </div>
        </label>
      </CardContent>
    </Card>
  );
};

export type { AutoCloneSettingsCardProps };
