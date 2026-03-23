import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarDays, Paintbrush } from 'lucide-react';

export type ToolsOptionButtonProps = {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export const CalendarNumberIcon = ({ value }: { value: string }) => (
  <span className="relative inline-flex items-center justify-center text-indigo-600">
    <CalendarDays className="h-8 w-8" />
    <span
      className={`pointer-events-none absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-indigo-200 bg-white/95 font-extrabold leading-none text-indigo-700 ${
        value.length > 1 ? 'px-1.5 py-0.5 text-[12px]' : 'px-1 py-0.5 text-[14px]'
      }`}
    >
      {value}
    </span>
  </span>
);

export const CalendarCustomIcon = () => (
  <span className="relative inline-flex items-center justify-center text-indigo-600">
    <CalendarDays className="h-8 w-8" />
    <span className="pointer-events-none absolute left-1/2 top-[56%] -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/95 p-0.5">
      <Paintbrush className="h-4 w-4 text-indigo-700" />
    </span>
  </span>
);

export const ToolsOptionButton = ({ icon, label, disabled, onClick }: ToolsOptionButtonProps) => (
  <Button
    type="button"
    variant="outline"
    disabled={disabled}
    onClick={onClick}
    className="h-24 w-full flex-col items-center justify-start gap-2 rounded-2xl border-slate-300 bg-white px-3 pt-3 text-slate-700 shadow-sm hover:bg-slate-50 sm:h-28 sm:pt-4 md:h-32 md:pt-5 lg:h-28 lg:pt-4"
  >
    <span className="flex h-9 items-center justify-center sm:h-10 md:h-11 [&_svg]:h-8 [&_svg]:w-8 sm:[&_svg]:h-9 sm:[&_svg]:w-9 md:[&_svg]:h-10 md:[&_svg]:w-10">
      {icon}
    </span>
    <span className="min-h-[2.25rem] max-w-full whitespace-normal break-words text-center text-[14px] font-medium leading-snug sm:min-h-[2.75rem] sm:text-base">
      {label}
    </span>
  </Button>
);

export const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

export const normalizePersonDisplayName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
