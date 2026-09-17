// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const preferenceState = {
  openAtLogin: false,
  setOpenAtLogin: vi.fn(),
  lowPerformanceMode: false,
  setLowPerformanceMode: vi.fn(),
  closeOnLaunch: true,
  setCloseOnLaunch: vi.fn(),
  minimizeToTrayOnClose: true,
  setMinimizeToTrayOnClose: vi.fn(),
  restoreLastScreen: false,
  setRestoreLastScreen: vi.fn(),
  confirmBeforeExit: true,
  setConfirmBeforeExit: vi.fn(),
  achievementNotificationsEnabled: true,
  setAchievementNotificationsEnabled: vi.fn(),
  customAchievementNotifications: true,
  setCustomAchievementNotifications: vi.fn(),
  achievementNotificationPosition: "top-right" as const,
  setAchievementNotificationPosition: vi.fn(),
};

const authState = {
  user: { uid: "current-user", email: "player@example.com", displayName: "Player" },
  userProfile: { uid: "current-user", displayName: "Player", profileVisibility: "public" as const },
  authIssue: null,
  sessionStatus: "ok" as const,
  signOutUser: vi.fn(),
  refreshProfile: vi.fn(),
  clearAuthIssue: vi.fn(),
};
const { saveProfileVisibility } = vi.hoisted(() => ({
  saveProfileVisibility: vi.fn(),
}));

vi.mock("../src/context/PreferencesContext", () => ({
  usePreferences: () => preferenceState,
}));
vi.mock("../src/hooks/useSoundEffects", () => ({
  useSoundEffects: () => ({ playSound: vi.fn() }),
}));
vi.mock("../src/context/GamepadContext", () => ({
  useGamepad: () => ({ isGamepadConnected: false, gamepadFamily: "generic", connectedGamepadId: null }),
  useGamepadButton: vi.fn(),
}));
vi.mock("../src/hooks/useControllerLed", () => ({
  useControllerLedStatus: () => ({ status: "unsupported", message: "Indisponível" }),
}));
vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));
vi.mock("../src/services/profilePrivacy", () => ({ saveProfileVisibility }));
vi.mock("../src/services/supabase", () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn() } },
}));

import { SettingsPageV2 } from "../src/pages/SettingsPage";

const copy: Record<string, string> = {
  system: "Sistema",
  settings: "Ajustes",
  language: "Idioma",
  languageHint: "Idioma do launcher",
  performance: "Desempenho",
  appBehavior: "Comportamentos do App",
  appBehaviorHint: "Defina como o launcher inicia, fecha e retoma sua navegação.",
  minimizeToTray: "Minimizar para a bandeja ao fechar",
  minimizeToTrayHint: "Mantém o launcher em segundo plano.",
  restoreLastScreen: "Restaurar a última tela aberta",
  restoreLastScreenHint: "Retoma a última área estável.",
  confirmBeforeExit: "Confirmar antes de sair",
  confirmBeforeExitHint: "Pede confirmação antes de encerrar.",
  openAtLogin: "Iniciar com o Windows",
  openAtLoginHint: "Inicia junto com o sistema",
  closeOnLaunch: "Ocultar ao Jogar",
  closeOnLaunchHint: "Oculta durante o jogo",
  themes: "Temas",
  themesHint: "Visual e sons",
  soundEffects: "Efeitos sonoros",
  soundEffectsHint: "Navegação e seleção",
  achievementSound: "Som de conquista",
  achievementSoundHint: "Conquistas desbloqueadas",
  notificationSound: "Som de notificação",
  notificationSoundHint: "Mensagens e solicitações",
  music: "Música",
  musicHint: "Trilha de fundo",
  test: "Testar",
  mute: "Mudo",
  max: "Máximo",
  lowPerformanceMode: "Desativar animações",
  lowPerformanceModeHint: "Reduz efeitos",
};

const Icon = ({ className }: { className?: string }) => <span className={className} />;

const renderSettings = ({
  steamConnected = false,
  onTestOverlayAchievement = vi.fn(),
  onTestOverlayWelcome = vi.fn(),
} = {}) => render(
  <SettingsPageV2
    language="pt-BR"
    effectsVolume={40}
    achievementVolume={60}
    notificationVolume={70}
    musicVolume={10}
    soundTheme="ps5"
    visualTheme="checkpoint"
    languageOptions={[{ id: "pt-BR", label: "Português", hint: "Brasil" }]}
    appThemeOptions={[{
      id: "default",
      label: "PlayStation 5",
      hint: "Tema padrão",
      swatch: "rgb(255 255 255)",
      soundTheme: "ps5",
      visualTheme: "playstation",
    }]}
    SteamIcon={Icon}
    DiscordIcon={Icon}
    EpicIcon={Icon}
    onLanguageChange={vi.fn()}
    onEffectsVolumeChange={vi.fn()}
    onAchievementVolumeChange={vi.fn()}
    onNotificationVolumeChange={vi.fn()}
    onMusicVolumeChange={vi.fn()}
    onSoundThemeChange={vi.fn()}
    onVisualThemeChange={vi.fn()}
    onPreviewSound={vi.fn()}
    onTestNotificationSound={vi.fn()}
    t={(key) => copy[key] ?? key}
    steamConnected={steamConnected}
    discordConnected={false}
    steamConnecting={false}
    discordConnecting={false}
    retroAchievementsConnected={false}
    retroAchievementsConnecting={false}
    onConnectRetroAchievements={vi.fn()}
    onDisconnectRetroAchievements={vi.fn()}
    onConnectSteam={vi.fn()}
    onConnectDiscord={vi.fn()}
    onDisconnectSteam={vi.fn()}
    onDisconnectDiscord={vi.fn()}
    onTestOverlayWelcome={onTestOverlayWelcome}
    onTestOverlayAchievement={onTestOverlayAchievement}
    initialTab="general"
    onTabChange={vi.fn()}
  />,
);

describe("hierarquia dos ajustes", () => {
  beforeEach(() => {
    cleanup();
    saveProfileVisibility.mockReset();
    authState.refreshProfile.mockReset();
    authState.userProfile.profileVisibility = "public";
  });

  it("apresenta os cinco comportamentos do aplicativo", () => {
    renderSettings();

    expect(screen.getByRole("heading", { name: "Comportamentos do App" })).toBeInTheDocument();
    expect(screen.getByText("Iniciar com o Windows")).toBeInTheDocument();
    expect(screen.getByText("Ocultar ao Jogar")).toBeInTheDocument();
    expect(screen.getByText("Minimizar para a bandeja ao fechar")).toBeInTheDocument();
    expect(screen.getByText("Restaurar a última tela aberta")).toBeInTheDocument();
    expect(screen.getByText("Confirmar antes de sair")).toBeInTheDocument();
  });

  it("mantem quatro canais de audio com nomes completos", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: /personalização/i }));

    expect(screen.getAllByRole("slider")).toHaveLength(4);
    for (const label of ["Efeitos sonoros", "Som de conquista", "Som de notificação", "Música"]) {
      const title = screen.getByText(label);
      expect(title).toBeInTheDocument();
      expect(title).not.toHaveClass("truncate");
    }
    const [effects, achievement, notification, music] = screen.getAllByRole("slider");
    expect(effects).toHaveAttribute("data-gamepad-nav-down", "audio-notification-slider");
    expect(achievement).toHaveAttribute("data-gamepad-nav-down", "audio-music-slider");
    expect(notification).toHaveAttribute("data-gamepad-nav-up", "audio-effects-slider");
    expect(music).toHaveAttribute("data-gamepad-nav-up", "audio-achievement-slider");
  });

  it("restaura a visibilidade anterior quando a persistencia falha", async () => {
    saveProfileVisibility.mockRejectedValueOnce(new Error("Falha de rede"));
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: /contas & privacidade/i }));

    fireEvent.click(screen.getByRole("button", { name: /perfil privado/i }));

    expect(await screen.findByText("Falha de rede")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /perfil público/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("mantem a visibilidade confirmada sem recarregar um perfil antigo", async () => {
    saveProfileVisibility.mockResolvedValueOnce("private");
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: /contas & privacidade/i }));

    fireEvent.click(screen.getByRole("button", { name: /perfil privado/i }));

    expect(await screen.findByText("Privacidade atualizada.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /perfil privado/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(authState.refreshProfile).not.toHaveBeenCalled();
  });

  it("separa a identidade e as acoes Steam sem duplicar o Sync", () => {
    renderSettings({ steamConnected: true });
    fireEvent.click(screen.getByRole("button", { name: /contas & privacidade/i }));

    const steamCard = screen.getByRole("article", { name: "Steam" });
    expect(within(steamCard).getByText("Steam")).toBeInTheDocument();
    const actions = within(steamCard).getByRole("group", { name: /steam/i });
    expect(actions).toContainElement(within(steamCard).getByRole("button", { name: /unlink/i }));
    expect(within(steamCard).queryByRole("button", { name: /sync/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sair da Conta" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair do Aplicativo" })).toBeInTheDocument();
  });

  it("disponibiliza botoes de teste para os diferentes niveis de trofeu no Overlay Lab", () => {
    const onTestOverlayAchievement = vi.fn();
    renderSettings({ onTestOverlayAchievement });
    fireEvent.click(screen.getByRole("button", { name: /notificações/i }));

    const bronzeBtn = screen.getByRole("button", { name: /troféu bronze/i });
    const silverBtn = screen.getByRole("button", { name: /troféu prata/i });
    const goldBtn = screen.getByRole("button", { name: /troféu ouro/i });
    const platinumBtn = screen.getByRole("button", { name: /troféu platina/i });

    expect(bronzeBtn).toBeInTheDocument();
    expect(silverBtn).toBeInTheDocument();
    expect(goldBtn).toBeInTheDocument();
    expect(platinumBtn).toBeInTheDocument();

    fireEvent.click(goldBtn);
    expect(onTestOverlayAchievement).toHaveBeenCalledWith("gold");

    fireEvent.click(platinumBtn);
    expect(onTestOverlayAchievement).toHaveBeenCalledWith("platinum");
  });
});
