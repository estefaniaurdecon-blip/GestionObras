import React from "react";
import { screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { renderWithProviders } from "./testUtils";
import { DashboardPage } from "./DashboardPage";

// Mock del módulo de API de herramientas
vi.mock("../api/tools", () => ({
  fetchTenantTools: vi.fn(),
}));

const mockedFetchTenantTools = vi.mocked(
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  require("../api/tools").fetchTenantTools
);

describe("DashboardPage", () => {
  beforeEach(() => {
    mockedFetchTenantTools.mockReset();
  });

  it("muestra el listado de herramientas del tenant", async () => {
    mockedFetchTenantTools.mockResolvedValueOnce([
      {
        id: 1,
        name: "Moodle Demo",
        slug: "moodle-demo",
        base_url: "https://moodle.mavico.shop",
        description: "Instancia Moodle de pruebas",
      },
    ]);

    renderWithProviders(<DashboardPage />);

    // Comprueba textos básicos y que la herramienta mock aparece
    expect(
      screen.getByText(/herramientas disponibles para tu tenant/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Moodle Demo")).toBeInTheDocument();
      expect(
        screen.getByText("Instancia Moodle de pruebas")
      ).toBeInTheDocument();
    });
  });
});
