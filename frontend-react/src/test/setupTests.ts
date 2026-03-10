import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

vi.mock("react-i18next", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => children,
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: async () => {},
      language: "es",
    },
  }),
}));
