// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/pages/Home", () => ({ default: () => <div>Home pronta</div> }));
vi.mock("../src/components/GameBootIntro", () => ({
  default: ({ onFinish }: { onFinish: () => void }) => (
    <button type="button" onClick={onFinish}>Finalizar introdução</button>
  ),
}));
vi.mock("../src/components/AsyncLoader", () => ({ default: () => <div>Carregando</div> }));
vi.mock("../src/auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { uid: "user-1" },
    loading: false,
    authIssue: null,
    sessionStatus: "ok",
    signOutUser: async () => {},
    clearAuthIssue: () => {},
    refreshProfile: async () => null,
  }),
}));
vi.mock("../src/components/NotificationCenter", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
  useNotification: () => ({ notify: vi.fn(), notifications: [] }),
}));
vi.mock("../src/context/PreferencesContext", () => ({
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
  usePreferences: () => ({ musicVolume: 20, soundTheme: "ps5", lowPerformanceMode: true }),
}));
vi.mock("../src/context/GamepadContext", () => ({
  GamepadProvider: ({ children }: { children: React.ReactNode }) => children,
  useGamepadButton: vi.fn(),
}));
vi.mock("../src/components/MainVideoBackground", () => ({ default: () => null }));
vi.mock("../src/components/ui/GamepadStatusOverlay", () => ({ GamepadStatusOverlay: () => null }));
vi.mock("../src/components/ui/ControllerVirtualKeyboard", () => ({ default: () => null }));
vi.mock("../src/context/VoiceCallContext", () => ({
  VoiceCallProvider: ({ children }: { children: React.ReactNode }) => children,
  useVoiceCallContext: () => ({
    startCall: vi.fn(),
    callState: "idle",
  }),
}));
vi.mock("../src/hooks/useControllerLed", () => ({ useControllerLed: vi.fn() }));
vi.mock("../src/services/api", () => ({ isBackendHealthy: vi.fn().mockResolvedValue(true) }));

import App from "../src/App";

describe("novidades no fluxo inicial do app", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("AudioContext", class {
      destination = {};
      createMediaElementSource() { return { connect: vi.fn() }; }
      createGain() { return { connect: vi.fn(), gain: { value: 1 } }; }
      close() { return Promise.resolve(); }
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { getVersion: vi.fn().mockResolvedValue("3.2.4") },
    });
  });

  it("abre o modal somente depois que a introducao termina", async () => {
    render(<App />);

    expect(screen.queryByText("Telemetria de Controle, Voz Ultrarrápida & Galeria In-Game")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Finalizar introdução" }));

    await waitFor(() => {
      expect(screen.getByText("Telemetria de Controle, Voz Ultrarrápida & Galeria In-Game")).toBeInTheDocument();
    });
    expect(screen.getByText("Home pronta")).toBeInTheDocument();
  });
});
