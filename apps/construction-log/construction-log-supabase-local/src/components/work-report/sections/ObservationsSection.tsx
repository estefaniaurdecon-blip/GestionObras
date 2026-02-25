import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ObservacionesIncidenciasSection, type NoteCategory } from '@/components/ObservacionesIncidenciasSection';

type ObservationsSectionProps = {
  sectionTriggerClass: string;
  readOnly: boolean;
  observacionesDictationActive: boolean;
  observacionesInterimText: string;
  observacionesDictationError: string | null;
  stopObservacionesDictation: () => Promise<void> | void;
  startObservacionesDictation: () => Promise<void> | void;
  observationsCompleted: boolean;
  observationsCategory: NoteCategory;
  observationsText: string;
  setObservationsCompleted: (value: boolean) => void;
  setObservationsCategory: (value: NoteCategory) => void;
  setObservationsText: (value: string) => void;
};

export const ObservationsSection = ({
  sectionTriggerClass,
  readOnly,
  observacionesDictationActive,
  observacionesInterimText,
  observacionesDictationError,
  stopObservacionesDictation,
  startObservacionesDictation,
  observationsCompleted,
  observationsCategory,
  observationsText,
  setObservationsCompleted,
  setObservationsCategory,
  setObservationsText,
}: ObservationsSectionProps) => {
  return (
    <AccordionItem value="observations" className="rounded-md border border-[#d9e1ea] bg-white px-4">
      <AccordionTrigger className={sectionTriggerClass}>Observaciones e incidencias</AccordionTrigger>
      <AccordionContent className="pt-2">
        <ObservacionesIncidenciasSection
          showHeader={false}
          disabled={readOnly}
          dictationActive={observacionesDictationActive}
          dictationInterimText={observacionesInterimText}
          dictationError={observacionesDictationError}
          onDictate={() => {
            if (observacionesDictationActive) {
              void stopObservacionesDictation();
              return;
            }
            void startObservacionesDictation();
          }}
          value={{
            isCompleted: observationsCompleted,
            category: observationsCategory,
            text: observationsText,
          }}
          onChange={(next) => {
            setObservationsCompleted(next.isCompleted);
            setObservationsCategory(next.category);
            setObservationsText(next.text);
          }}
        />
      </AccordionContent>
    </AccordionItem>
  );
};

export type { ObservationsSectionProps };

