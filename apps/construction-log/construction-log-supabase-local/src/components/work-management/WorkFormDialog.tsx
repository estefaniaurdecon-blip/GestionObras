import { Capacitor } from '@capacitor/core';
import { ArrowLeft, Loader2, MapPin, Save, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';

const isAndroidPlatform = Capacitor.getPlatform() === 'android';

const fieldLabelClass = isAndroidPlatform
  ? 'text-[16px] font-medium text-slate-700'
  : 'text-[15px] font-medium text-slate-700 sm:text-[16px]';

const sectionDescriptionClass = isAndroidPlatform
  ? 'text-[16px] text-muted-foreground'
  : 'text-[15px] text-muted-foreground sm:text-[16px]';

const lightButtonClass = isAndroidPlatform
  ? 'h-11 px-4 justify-center border-slate-200 bg-slate-50 text-[16px] font-medium text-slate-700 shadow-none hover:bg-slate-100 hover:text-slate-900'
  : 'h-10 px-4 justify-center border-slate-200 bg-slate-50 text-[15px] font-medium text-slate-700 shadow-none hover:bg-slate-100 hover:text-slate-900 sm:h-11 sm:text-base';

const accentActionButtonClass = isAndroidPlatform
  ? 'h-11 w-[158px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[16px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800'
  : 'h-10 w-[148px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[15px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800';

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
      <DialogContent fullScreen className="overflow-y-auto">

        {/* Header — mismo estilo que AccessControlForm */}
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white/70 px-4 py-5 shadow-sm backdrop-blur-sm sm:px-6">
          <div className="relative flex w-full justify-center">
            <Button
              variant="ghost"
              onClick={onCancel}
              size="sm"
              className="-ml-3 absolute left-0 top-0 h-9 border-0 px-2 text-slate-600 shadow-none hover:bg-transparent hover:text-slate-900 sm:ml-0"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span>Cancelar</span>
            </Button>
            <div className="flex flex-col items-center gap-1 px-14 text-center">
              <h1 className="text-xl font-semibold text-slate-900 sm:text-3xl">
                {isEditing ? 'Editar obra' : 'Nuevo registro'}
              </h1>
              <p className="text-[15px] text-muted-foreground">
                Gestión de Obras
              </p>
            </div>
          </div>
        </div>

        {/* Secciones en Cards */}
        <div className="flex flex-col gap-6 pb-4">

          {/* CARD 1: INFORMACIÓN GENERAL */}
          <Card>
            <CardHeader>
              <CardTitle className="text-center text-xl font-semibold text-slate-900 sm:text-2xl">
                Información General
              </CardTitle>
              <CardDescription className={`text-center ${sectionDescriptionClass}`}>
                Datos principales de identificación de la obra
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="workNumber" className={fieldLabelClass}>Número de Obra *</Label>
                  <Input
                    id="workNumber"
                    value={workData.number}
                    onChange={(e) => onChange({ number: e.target.value })}
                    placeholder="Ej: OB-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="executionPeriod" className={fieldLabelClass}>Plazo de Ejecución</Label>
                  <Input
                    id="executionPeriod"
                    value={workData.execution_period}
                    onChange={(e) => onChange({ execution_period: e.target.value })}
                    placeholder="Ej: 6 meses"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workName" className={fieldLabelClass}>Nombre de la Obra *</Label>
                <Input
                  id="workName"
                  value={workData.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  placeholder="Ej: Construcción Edificio Central"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address" className={fieldLabelClass}>Dirección</Label>
                <Input
                  id="address"
                  value={workData.address}
                  onChange={(e) => onChange({ address: e.target.value })}
                  placeholder="Calle, número, ciudad"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="promoter" className={fieldLabelClass}>Promotor</Label>
                  <Input
                    id="promoter"
                    value={workData.promoter}
                    onChange={(e) => onChange({ promoter: e.target.value })}
                    placeholder="Nombre del promotor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget" className={fieldLabelClass}>Presupuesto (€)</Label>
                  <Input
                    id="budget"
                    type="number"
                    value={workData.budget}
                    onChange={(e) => onChange({ budget: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startDate" className={fieldLabelClass}>Fecha de Inicio</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={workData.start_date}
                    onChange={(e) => onChange({ start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate" className={fieldLabelClass}>Fecha de Fin</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={workData.end_date}
                    onChange={(e) => onChange({ end_date: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD 2: DESCRIPCIÓN Y CONTACTO */}
          <Card>
            <CardHeader>
              <CardTitle className="text-center text-xl font-semibold text-slate-900 sm:text-2xl">
                Descripción y Contacto
              </CardTitle>
              <CardDescription className={`text-center ${sectionDescriptionClass}`}>
                Descripción general y datos de coordinación
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description" className={fieldLabelClass}>Descripción</Label>
                <Textarea
                  id="description"
                  value={workData.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                  placeholder="Descripción general de la obra"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactPerson" className={fieldLabelClass}>Persona de Contacto</Label>
                <Input
                  id="contactPerson"
                  value={workData.contact_person}
                  onChange={(e) => onChange({ contact_person: e.target.value })}
                  placeholder="Nombre completo"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactPhone" className={fieldLabelClass}>Teléfono</Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    value={workData.contact_phone}
                    onChange={(e) => onChange({ contact_phone: e.target.value })}
                    placeholder="+34 600 000 000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail" className={fieldLabelClass}>Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={workData.contact_email}
                    onChange={(e) => onChange({ contact_email: e.target.value })}
                    placeholder="contacto@ejemplo.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD 3: UBICACIÓN Y GPS */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
                <MapPin className="h-5 w-5" />
                Ubicación
              </CardTitle>
              <CardDescription className={`text-center ${sectionDescriptionClass}`}>
                Dirección postal y coordenadas GPS de la obra
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dirección postal */}
              <div className="space-y-2">
                <Label htmlFor="streetAddress" className={fieldLabelClass}>Dirección (Calle y número)</Label>
                <Input
                  id="streetAddress"
                  value={workData.street_address}
                  onChange={(e) => onChange({ street_address: e.target.value })}
                  placeholder="Calle Mayor, 123"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city" className={fieldLabelClass}>Población</Label>
                  <Input
                    id="city"
                    value={workData.city}
                    onChange={(e) => onChange({ city: e.target.value })}
                    placeholder="Madrid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="province" className={fieldLabelClass}>Provincia / Región</Label>
                  <Input
                    id="province"
                    value={workData.province}
                    onChange={(e) => onChange({ province: e.target.value })}
                    placeholder="Madrid"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country" className={fieldLabelClass}>País</Label>
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
                className={`w-full ${lightButtonClass}`}
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

              {/* Estado coordenadas GPS */}
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
                <div className="text-center py-3">
                  <MapPin className="h-7 w-7 text-muted-foreground mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">Sin coordenadas definidas</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Busca desde la dirección o captura la ubicación GPS
                  </p>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={onCaptureLocation}
                disabled={geoLoading}
                className={`w-full ${lightButtonClass}`}
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
            </CardContent>
          </Card>

        </div>

        {/* Footer — mismo estilo que PersonalEntryForm de AccessControlForm */}
        <DialogFooter className="pt-2 sm:justify-between sm:space-x-0">
          <Button
            variant="outline"
            onClick={onCancel}
            className={`w-full sm:w-[48%] ${lightButtonClass}`}
          >
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={onSubmit}
            className={`w-full sm:w-[48%] ${accentActionButtonClass}`}
          >
            <Save className="h-4 w-4 mr-2" />
            {isEditing ? 'Guardar cambios' : 'Añadir'}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
