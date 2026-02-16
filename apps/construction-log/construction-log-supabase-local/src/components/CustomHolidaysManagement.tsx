import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { useCustomHolidays } from '@/hooks/useCustomHolidays';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { HolidaysCalendar } from '@/components/HolidaysCalendar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const REGIONS = [
  'Nacional',
  'Andalucía',
  'Aragón',
  'Asturias',
  'Baleares',
  'Canarias',
  'Cantabria',
  'Castilla y León',
  'Castilla-La Mancha',
  'Cataluña',
  'Comunidad Valenciana',
  'Extremadura',
  'Galicia',
  'La Rioja',
  'Madrid',
  'Murcia',
  'Navarra',
  'País Vasco',
];

export const CustomHolidaysManagement = () => {
  const { holidays, loading, addHoliday, deleteHoliday } = useCustomHolidays();
  
  const [isAdding, setIsAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    name: '',
    region: 'Nacional',
  });

  const resetForm = () => {
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      name: '',
      region: 'Nacional',
    });
    setIsAdding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.date) {
      return;
    }

    try {
      await addHoliday(formData);
      resetForm();
    } catch (error) {
      console.error('Error saving holiday:', error);
    }
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteHoliday(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Calendario Visual */}
      <HolidaysCalendar />

      {/* Gestión de Festivos */}
      <Card>
        <CardHeader>
          <CardTitle>Gestionar Festivos Locales/Regionales</CardTitle>
          <CardDescription>
            Añade festivos específicos de tu comunidad autónoma o localidad que no están incluidos en los festivos nacionales
          </CardDescription>
        </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Añadir Festivo
            </Button>
          )}
        </div>

        {isAdding && (
          <Card className="border-primary/20">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Fecha *</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Nombre del Festivo *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: San Isidro, Día de Andalucía..."
                      required
                    />
                  </div>
                  <div>
                    <Label>Ámbito</Label>
                    <select
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    >
                      {REGIONS.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Añadir
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-center text-muted-foreground py-4">Cargando...</p>
        ) : holidays.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground text-sm">
                No hay festivos locales/regionales configurados
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {holidays.map((holiday) => (
                <Card key={holiday.id} className="hover:bg-accent/50 transition-colors">
                  <CardContent className="py-3 px-4">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {format(new Date(holiday.date), 'dd/MM/yyyy', { locale: es })}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="font-semibold">{holiday.name}</span>
                        </div>
                        {holiday.region && (
                          <p className="text-xs text-muted-foreground mt-1 ml-6">
                            {holiday.region}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteId(holiday.id)}
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar festivo?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El festivo será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
    </div>
  );
};
