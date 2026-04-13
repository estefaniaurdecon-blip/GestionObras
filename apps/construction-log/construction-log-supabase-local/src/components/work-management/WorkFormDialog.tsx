import { Loader2, MapPin, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface WorkFormData {
  number: string;
  name: string;
  address: string;
  promoter: string;
  budget: string;
  execution_period: string;
  start_date: string;
  end_date: string;
  description: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  latitude: string | number;
  longitude: string | number;
  street_address: string;
  city: string;
  province: string;
  country: string;
}

interface WorkFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  workData: WorkFormData;
  onChange: (patch: Partial<WorkFormData>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onGeocodeAddress: () => void;
  onCaptureLocation: () => void;
  geocodingLoading: boolean;
  geoLoading: boolean;
}

export function WorkFormDialog({
  open,
  onOpenChange,
  isEditing,
  workData,
  onChange,
  onSubmit,
  onCancel,
  onGeocodeAddress,
  onCaptureLocation,
  geocodingLoading,
  geoLoading,
}: WorkFormDialogProps) {
  const hasCoords = workData.latitude !== '' && workData.longitude !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreen className="overflow-y-auto px-4 sm:px-6">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="app-page-title">
            {isEditing ? 'Editar obra' : 'Añadir obras'}
          </DialogTitle>
          <DialogDescription className="app-page-subtitle text-center">
            Sistema de Gestión de Obras
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* MÓDULO 1: INFORMACIÓN GENERAL */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workNumber" className="app-field-label">Número de Obra *</Label>
                <Input
                  id="workNumber"
                  value={workData.number}
                  onChange={(e) => onChange({ number: e.target.value })}
                  placeholder="Ej: OB-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="executionPeriod" className="app-field-label">Plazo de Ejecución</Label>
                <Input
                  id="executionPeriod"
                  value={workData.execution_period}
                  onChange={(e) => onChange({ execution_period: e.target.value })}
                  placeholder="Ej: 6 meses"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workName" className="app-field-label">Nombre de la Obra *</Label>
              <Input
                id="workName"
                value={workData.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="Ej: Construcción Edificio Central"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address" className="app-field-label">Dirección</Label>
              <Input
                id="address"
                value={workData.address}
                onChange={(e) => onChange({ address: e.target.value })}
                placeholder="Calle, número, ciudad"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="promoter" className="app-field-label">Promotor</Label>
                <Input
                  id="promoter"
                  value={workData.promoter}
                  onChange={(e) => onChange({ promoter: e.target.value })}
                  placeholder="Nombre del promotor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget" className="app-field-label">Presupuesto (€)</Label>
                <Input
                  id="budget"
                  type="number"
                  value={workData.budget}
                  onChange={(e) => onChange({ budget: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="app-field-label">Fecha de Inicio</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={workData.start_date}
                  onChange={(e) => onChange({ start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="app-field-label">Fecha de Fin</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={workData.end_date}
                  onChange={(e) => onChange({ end_date: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* MÓDULO 2: DESCRIPCIÓN Y CONTACTO */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description" className="app-field-label">Descripción</Label>
              <Textarea
                id="description"
                value={workData.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="Descripción general de la obra"
                rows={3}
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-900">Contacto</p>
                <p className="app-section-subtitle">Datos principales para coordinar la obra.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPerson" className="app-field-label-muted">Persona de Contacto</Label>
                <Input
                  id="contactPerson"
                  value={workData.contact_person}
                  onChange={(e) => onChange({ contact_person: e.target.value })}
                  placeholder="Nombre completo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPhone" className="app-field-label-muted">Teléfono</Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={workData.contact_phone}
                    onChange={(e) => onChange({ contact_phone: e.target.value })}
                    placeholder="+34 600 000 000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail" className="app-field-label-muted">Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={workData.contact_email}
                    onChange={(e) => onChange({ contact_email: e.target.value })}
                    placeholder="contacto@ejemplo.com"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* MÓDULO 3: UBICACIÓN */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <MapPin className="h-4 w-4" />
              <span>Ubicación</span>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 space-y-4">
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-900">Dirección postal</p>
                <p className="app-section-subtitle">Usa estos datos para localizar la obra y autocompletar coordenadas.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="streetAddress" className="app-field-label-muted">Dirección (Calle y número)</Label>
                <Input
                  id="streetAddress"
                  value={workData.street_address}
                  onChange={(e) => onChange({ street_address: e.target.value })}
                  placeholder="Calle Mayor, 123"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city" className="app-field-label-muted">Población</Label>
                  <Input
                    id="city"
                    value={workData.city}
                    onChange={(e) => onChange({ city: e.target.value })}
                    placeholder="Madrid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="province" className="app-field-label-muted">Provincia / Región</Label>
                  <Input
                    id="province"
                    value={workData.province}
                    onChange={(e) => onChange({ province: e.target.value })}
                    placeholder="Madrid"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country" className="app-field-label-muted">País</Label>
                <Input
                  id="country"
                  value={workData.country}
                  onChange={(e) => onChange({ country: e.target.value })}
                  placeholder="España"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={onGeocodeAddress}
                disabled={geocodingLoading || (!workData.street_address && !workData.city)}
                className="app-btn-soft w-full"
              >
                {geocodingLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Buscando coordenadas...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Buscar Coordenadas desde Dirección
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* MÓDULO 4: COORDENADAS GPS */}
          <div className="space-y-4">
            {hasCoords ? (
              <div className="bg-muted/50 border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Ubicación definida</p>
                      <p className="text-xs text-muted-foreground">
                        {Number(workData.latitude).toFixed(6)}, {Number(workData.longitude).toFixed(6)}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange({ latitude: '', longitude: '' })}
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Eliminar ubicación"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sin coordenadas definidas</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Usa el botón de arriba para buscar coordenadas o captura la ubicación GPS
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={onCaptureLocation}
              disabled={geoLoading}
              className="app-btn-soft mx-auto w-full sm:w-auto sm:min-w-[220px]"
            >
              {geoLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Obteniendo ubicación...
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-4 w-4" />
                  Capturar Ubicación GPS Actual
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Botones finales */}
        <div className="flex flex-col items-center gap-2 pt-2 sm:flex-row sm:justify-center">
          <Button
            onClick={onSubmit}
            className="app-btn-primary w-full sm:w-auto sm:min-w-[180px]"
          >
            {isEditing ? 'Guardar cambios' : 'Añadir'}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            className="app-btn-soft w-full sm:w-auto sm:min-w-[180px]"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
