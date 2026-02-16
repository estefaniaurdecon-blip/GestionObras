// Spanish national holidays for 2025 and 2026
export const SPANISH_HOLIDAYS_2025 = [
  '2025-01-01', // Año Nuevo
  '2025-01-06', // Reyes Magos
  '2025-04-18', // Viernes Santo
  '2025-05-01', // Día del Trabajador
  '2025-08-15', // Asunción de la Virgen
  '2025-10-12', // Fiesta Nacional de España
  '2025-11-01', // Todos los Santos
  '2025-12-06', // Día de la Constitución
  '2025-12-08', // Inmaculada Concepción
  '2025-12-25', // Navidad
];

export const SPANISH_HOLIDAYS_2026 = [
  '2026-01-01', // Año Nuevo
  '2026-01-06', // Reyes Magos
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Día del Trabajador
  '2026-08-15', // Asunción de la Virgen
  '2026-10-12', // Fiesta Nacional de España
  '2026-11-01', // Todos los Santos
  '2026-12-06', // Día de la Constitución
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
];

export const ALL_SPANISH_HOLIDAYS = [
  ...SPANISH_HOLIDAYS_2025,
  ...SPANISH_HOLIDAYS_2026,
];

/**
 * Calculate working days between two dates, excluding weekends and Spanish national holidays
 * @param customHolidays Optional array of custom holiday dates in 'YYYY-MM-DD' format
 */
export function calculateWorkingDays(
  startDate: Date, 
  endDate: Date, 
  customHolidays: string[] = []
): number {
  const holidays = new Set([...ALL_SPANISH_HOLIDAYS, ...customHolidays]);
  let workingDays = 0;
  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);
  
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    const dateString = currentDate.toISOString().split('T')[0];
    
    // Check if it's not a weekend (0 = Sunday, 6 = Saturday) and not a holiday
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.has(dateString)) {
      workingDays++;
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return workingDays;
}
