import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { login } from "../api/auth";
import { LoginPage } from "../pages/LoginPage";
import { renderWithProviders } from "./testUtils";

vi.mock("../api/auth", () => ({
  login: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    history: {
      push: pushMock,
    },
  }),
}));

const mockedLogin = vi.mocked(login);

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockedLogin.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("redirige a /mfa cuando el backend requiere MFA", async () => {
    mockedLogin.mockResolvedValueOnce({
      mfa_required: true,
      access_token: undefined,
      token_type: undefined,
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/auth\.login\.email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.login\.password/i), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /auth\.login\.submit/i }),
    );

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith("user@example.com", "password");
      expect(pushMock).toHaveBeenCalledWith("/mfa");
    });
  });

  it("redirige al dashboard cuando el login devuelve token", async () => {
    mockedLogin.mockResolvedValueOnce({
      mfa_required: false,
      access_token: "test-token",
      token_type: "bearer",
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/auth\.login\.email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/auth\.login\.password/i), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /auth\.login\.submit/i }),
    );

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith("user@example.com", "password");
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
  });
});
