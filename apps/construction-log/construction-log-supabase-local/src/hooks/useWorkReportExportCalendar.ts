import { useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type ExportCalendarMonthOption = {
  value: number;
  label: string;
};

const CALENDAR_START_MONTH = new Date(2020, 0, 1);

const buildCalendarEndMonth = (referenceDate: Date = new Date()) =>
  new Date(referenceDate.getFullYear() + 2, 11, 31);

const CALENDAR_CLASS_NAMES = {
  root: 'relative w-full',
  months: 'w-full',
  month: 'relative mx-auto flex w-full max-w-[540px] flex-col gap-4',
  month_grid: 'mx-auto border-collapse',
  weekdays: 'mx-auto flex w-fit',
  week: 'mx-auto mt-2 flex w-fit',
  month_caption: 'relative flex h-10 items-center justify-center',
  dropdowns: 'flex items-center justify-center gap-3',
  dropdown_root:
    'relative inline-flex h-9 min-w-[108px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm',
  dropdown: 'absolute inset-0 cursor-pointer appearance-none opacity-0',
  caption_label:
    'inline-flex w-full flex-row-reverse items-center justify-center gap-2 truncate text-sm font-medium capitalize text-slate-700',
  chevron: 'h-3.5 w-3.5 text-slate-500',
  nav: 'pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-2',
  button_previous:
    'pointer-events-auto z-10 h-8 w-8 rounded-md border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-100',
  button_next:
    'pointer-events-auto z-10 h-8 w-8 rounded-md border border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-100',
} as const;

export const useWorkReportExportCalendar = () => {
  const calendarStartMonth = useMemo(() => CALENDAR_START_MONTH, []);
  const calendarEndMonth = useMemo(() => buildCalendarEndMonth(), []);
  const monthOptions = useMemo<ExportCalendarMonthOption[]>(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => ({
        value: monthIndex,
        label: format(new Date(2026, monthIndex, 1), 'MMMM', { locale: es }),
      })),
    [],
  );
  const yearOptions = useMemo(
    () =>
      Array.from(
        { length: calendarEndMonth.getFullYear() - calendarStartMonth.getFullYear() + 1 },
        (_, index) => calendarStartMonth.getFullYear() + index,
      ),
    [calendarEndMonth, calendarStartMonth],
  );

  return {
    calendarStartMonth,
    calendarEndMonth,
    calendarClassNames: CALENDAR_CLASS_NAMES,
    monthOptions,
    yearOptions,
  };
};
