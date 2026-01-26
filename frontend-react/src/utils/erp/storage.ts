import { SUMMARY_STORAGE_KEY } from "./constants";
import type { SummaryStorage, SummaryYearlyData } from "./types";

export const readSummaryStorage = (): SummaryStorage => {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(SUMMARY_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    console.warn("Failed to read summary storage", err);
  }
  return {};
};

export const writeSummaryStorage = (value: SummaryStorage) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(value));
  } catch (err) {
    console.warn("Failed to write summary storage", err);
  }
};

export const cloneYearData = (data: SummaryYearlyData): SummaryYearlyData => ({
  projectJustify: { ...data.projectJustify },
  projectJustified: { ...data.projectJustified },
  summaryMilestones: Object.fromEntries(
    Object.entries(data.summaryMilestones || {}).map(([projId, items]) => [
      Number(projId),
      (items || []).map((item) => ({
        label: item.label,
        hours: item.hours,
      })),
    ]),
  ),
});

export const loadSummaryFallback = (year: number): SummaryYearlyData => {
  const storage = readSummaryStorage();
  const entry = storage[year];
  return entry ? cloneYearData(entry) : { projectJustify: {}, projectJustified: {}, summaryMilestones: {} };
};

export const persistSummaryFallback = (year: number, data: SummaryYearlyData) => {
  const storage = readSummaryStorage();
  storage[year] = cloneYearData(data);
  writeSummaryStorage(storage);
};
