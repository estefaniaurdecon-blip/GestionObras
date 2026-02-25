import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type MaterialCostDifference = {
  groupId: string;
  rowId: string;
  material: string;
  costDoc: number;
  costCalc: number;
  difference: number;
};

type CostDifferenceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  differences: MaterialCostDifference[];
  onKeep: () => void;
  onOverwrite: () => void;
};

export const CostDifferenceDialog = ({
  open,
  onOpenChange,
  differences,
  onKeep,
  onOverwrite,
}: CostDifferenceDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Diferencia de coste detectada</DialogTitle>
          <DialogDescription>
            El coste del documento no coincide con el calculado (cantidad × precio/ud).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {differences.map((difference, index) => (
            <div key={`${difference.groupId}-${difference.rowId}-${index}`} className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm">
              <div className="font-medium text-amber-900">{difference.material}</div>
              <div className="text-amber-800">
                Doc: {difference.costDoc.toFixed(2)} € | Calculado: {difference.costCalc.toFixed(2)} € | Delta: {difference.difference.toFixed(2)} €
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onKeep}>
            Mantener
          </Button>
          <Button onClick={onOverwrite}>
            Sobrescribir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export type { CostDifferenceDialogProps, MaterialCostDifference };

