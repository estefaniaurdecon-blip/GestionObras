import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type RentalMachine = {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  startDate: string;
  endDate?: string | null;
  price?: number | null;
  priceUnit?: string | null;
  status: string;
};

type RentalSectionProps = {
  sectionTriggerClass: string;
  rentalLoading: boolean;
  rentalError: string | null;
  selectedWorkId: string | null;
  rentalResult: { items: RentalMachine[] };
  normalizeDate: (value: string | null | undefined) => string;
};

export const RentalSection = ({
  sectionTriggerClass,
  rentalLoading,
  rentalError,
  selectedWorkId,
  rentalResult,
  normalizeDate,
}: RentalSectionProps) => {
  return (
    <AccordionItem value="rental" className="rounded-md border border-[#d9e1ea] bg-white px-4">
      <AccordionTrigger className={sectionTriggerClass}>Maquinaria alquilada</AccordionTrigger>
      <AccordionContent className="space-y-3">
        <div className="rounded-md border border-[#d9e1ea] bg-white">
          <div className="border-b border-[#d9e1ea] px-3 py-2 text-sm font-semibold text-slate-700">
            Maquinaria alquilada
          </div>

          <div className="p-4">
            {rentalLoading ? (
              <div className="text-center text-sm text-slate-500">Cargando maquinaria de alquiler...</div>
            ) : rentalError ? (
              <div className="text-center text-sm text-red-600">{rentalError}</div>
            ) : !selectedWorkId || rentalResult.items.length === 0 ? (
              <div className="rounded-md bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                <div>No hay maquinaria de alquiler activa para esta fecha.</div>
                <div>Gestiona la maquinaria de alquiler desde la pestaña de Gestión de Obras.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {rentalResult.items.map((machine) => (
                  <div key={machine.id} className="rounded-md border border-[#d9e1ea] bg-slate-50 p-3">
                    <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-5">
                      <div>
                        <div className="text-sm text-slate-500">Maquinaria</div>
                        <div className="font-medium text-slate-800">{machine.name}</div>
                        {machine.description ? (
                          <div className="text-sm text-slate-500">{machine.description}</div>
                        ) : null}
                      </div>
                      <div>
                        <div className="text-sm text-slate-500">Proveedor</div>
                        <div className="text-slate-800">{machine.provider || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-500">Fechas</div>
                        <div className="text-slate-800">
                          {normalizeDate(machine.startDate)} - {machine.endDate ? normalizeDate(machine.endDate) : 'Abierta'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-500">Precio</div>
                        <div className="text-slate-800">
                          {typeof machine.price === 'number'
                            ? `${machine.price.toFixed(2)} €/` + machine.priceUnit
                            : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-500">Estado</div>
                        <div className="text-emerald-700 font-medium">{machine.status}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export type { RentalSectionProps };

