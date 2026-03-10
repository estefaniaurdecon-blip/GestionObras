import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useCustomHolidays } from '@/hooks/useCustomHolidays';
import { SPANISH_HOLIDAYS_2025, SPANISH_HOLIDAYS_2026 } from '@/utils/workingDaysCalculator';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, getDaysInMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isWeekend } from 'date-fns';
import { es } from 'date-fns/locale';

export const HolidaysCalendar = () => {
  const { holidays: customHolidays } = useCustomHolidays();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Combinar festivos nacionales
  const nationalHolidays = [...SPANISH_HOLIDAYS_2025, ...SPANISH_HOLIDAYS_2026];
  
  // Crear mapas de festivos para acceso rápido
  const nationalHolidaysMap = new Map(
    nationalHolidays.map(date => [date, true])
  );
  
  const customHolidaysMap = new Map(
    customHolidays.map(h => [h.date, { name: h.name, region: h.region }])
  );

  const handlePreviousMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
  };

  // Función para determinar si una fecha es festivo
  const getHolidayType = (date: Date): 'national' | 'custom' | 'both' | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const isNational = nationalHolidaysMap.has(dateStr);
    const isCustom = customHolidaysMap.has(dateStr);
    
    if (isNational && isCustom) return 'both';
    if (isNational) return 'national';
    if (isCustom) return 'custom';
    return null;
  };

  // Función para obtener el nombre del festivo
  const getHolidayName = (date: Date): string | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const customInfo = customHolidaysMap.get(dateStr);
    
    if (customInfo) {
      return `${customInfo.name}${customInfo.region ? ` (${customInfo.region})` : ''}`;
    }
    
    // Nombres de festivos nacionales
    const nationalNames: Record<string, string> = {
      '01-01': 'Año Nuevo',
      '01-06': 'Reyes Magos',
      '04-18': 'Viernes Santo',
      '04-03': 'Viernes Santo',
      '05-01': 'Día del Trabajador',
      '08-15': 'Asunción de la Virgen',
      '10-12': 'Fiesta Nacional',
      '11-01': 'Todos los Santos',
      '12-06': 'Día de la Constitución',
      '12-08': 'Inmaculada Concepción',
      '12-25': 'Navidad',
    };
    
    const monthDay = format(date, 'MM-dd');
    return nationalNames[monthDay] || null;
  };

  // Generar días del calendario
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Empieza en lunes
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const today = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Calendario de Festivos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controles de navegación */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePreviousMonth}
            className="h-10 w-10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
            >
              Hoy
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextMonth}
            className="h-10 w-10"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-4 text-sm p-4 bg-muted/50 rounded-lg mb-6">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-500" />
            <span className="font-medium">Festivo Nacional</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-purple-500" />
            <span className="font-medium">Festivo Local/Regional</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
            <span className="font-medium">Ambos</span>
          </div>
        </div>

        {/* Calendario personalizado */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Encabezados de días */}
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((day) => (
              <div
                key={day}
                className="p-3 text-center text-sm font-semibold text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Días del calendario */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => {
              const holidayType = getHolidayType(day);
              const holidayName = getHolidayName(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);
              const isWeekendDay = isWeekend(day);

              return (
                <div
                  key={index}
                  className={cn(
                    "relative p-2 min-h-[80px] border-r border-b transition-all group",
                    !isCurrentMonth && "bg-muted/20",
                    isCurrentMonth && "hover:bg-accent/50",
                    holidayType === 'national' && "bg-blue-50 dark:bg-blue-950/20",
                    holidayType === 'custom' && "bg-purple-50 dark:bg-purple-950/20",
                    holidayType === 'both' && "bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20"
                  )}
                >
                  {/* Número del día */}
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={cn(
                        "text-2xl font-bold transition-colors",
                        !isCurrentMonth && "text-muted-foreground/40",
                        isCurrentMonth && "text-foreground",
                        isToday && "text-primary",
                        holidayType && "text-foreground font-extrabold"
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    
                    {/* Indicador de festivo */}
                    {holidayType && (
                      <div
                        className={cn(
                          "w-3 h-3 rounded-full",
                          holidayType === 'national' && "bg-blue-500",
                          holidayType === 'custom' && "bg-purple-500",
                          holidayType === 'both' && "bg-gradient-to-r from-blue-500 to-purple-500"
                        )}
                      />
                    )}
                  </div>

                  {/* Nombre del festivo */}
                  {holidayName && isCurrentMonth && (
                    <div className="text-[10px] leading-tight font-medium line-clamp-2">
                      {holidayName}
                    </div>
                  )}

                  {/* Indicador de hoy */}
                  {isToday && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}

                  {/* Tooltip en hover */}
                  {holidayName && (
                    <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-lg text-sm whitespace-nowrap border">
                        {holidayName}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Lista de festivos del mes actual */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Festivos este mes:</h4>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {(() => {
              const monthStart = startOfMonth(currentMonth);
              const monthEnd = endOfMonth(currentMonth);
              const monthHolidays: Array<{ date: Date; name: string; type: string }> = [];

              // Recopilar festivos del mes
              const currentDate = new Date(monthStart);
              while (currentDate <= monthEnd) {
                const holidayType = getHolidayType(currentDate);
                const holidayName = getHolidayName(currentDate);
                
                if (holidayType && holidayName) {
                  monthHolidays.push({
                    date: new Date(currentDate),
                    name: holidayName,
                    type: holidayType,
                  });
                }
                
                currentDate.setDate(currentDate.getDate() + 1);
              }

              if (monthHolidays.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay festivos este mes
                  </p>
                );
              }

              return monthHolidays.map((holiday, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-3 h-3 rounded",
                      holiday.type === 'national' && "bg-blue-500",
                      holiday.type === 'custom' && "bg-purple-500",
                      holiday.type === 'both' && "bg-gradient-to-r from-blue-500 to-purple-500"
                    )} />
                    <span className="text-sm font-medium">
                      {format(holiday.date, 'EEEE, d', { locale: es })}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {holiday.name}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
