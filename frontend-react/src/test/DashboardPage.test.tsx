import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToolGrid } from "../components/tools/ToolGrid";
import { renderWithProviders } from "./testUtils";

describe("ToolGrid", () => {
  it("renderiza las herramientas y dispara launch", () => {
    const onLaunch = vi.fn();

    renderWithProviders(
      <ToolGrid
        tools={[
          {
            id: 1,
            name: "Moodle Demo",
            slug: "moodle-demo",
            base_url: "https://moodle.mavico.shop",
            description: "Instancia Moodle de pruebas",
          },
        ]}
        onLaunch={onLaunch}
      />,
    );

    expect(screen.getByText("Moodle Demo")).toBeInTheDocument();
    expect(screen.getByText("Instancia Moodle de pruebas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /moodle demo/i }));

    expect(onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        slug: "moodle-demo",
      }),
    );
  });
});
