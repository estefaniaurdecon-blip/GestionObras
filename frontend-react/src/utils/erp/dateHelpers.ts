export const toDateSafe = (value?: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const toDateInput = (value?: string | null) =>
  value ? value.split("T")[0] : "";

export const computeProgress = (start: Date, end: Date) => {
  const now = new Date();
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) return 0;
  const elapsedMs = now.getTime() - start.getTime();
  const ratio = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  return Math.round(ratio * 100);
};

export const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
