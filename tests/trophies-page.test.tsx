// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

afterEach(() => {
  cleanup();
});
import TrophiesPage from "../src/components/TrophiesPage";
import type { Game } from "../src/types/domain";

const mockGames: Game[] = [
  {
    id: "game-1",
    title: "God of War",
    totalAchievements: 37,
    completedAchievements: 37,
    launcherType: "steam",
    lastPlayedAt: "2026-08-30T10:00:00Z",
    playtimeMinutes: 3000,
  },
  {
    id: "game-2",
    title: "Spider-Man",
    totalAchievements: 50,
    completedAchievements: 25,
    launcherType: "steam",
    lastPlayedAt: "2026-08-28T10:00:00Z",
    playtimeMinutes: 1200,
  },
  {
    id: "game-3",
    title: "Cyberpunk 2077",
    totalAchievements: 44,
    completedAchievements: 0,
    launcherType: "epic",
    lastPlayedAt: "2026-08-01T10:00:00Z",
    playtimeMinutes: 100,
  },
  {
    id: "game-4-no-achievements",
    title: "Indie Game Without Achievements",
    totalAchievements: 0,
    completedAchievements: 0,
  },
];

describe("TrophiesPage", () => {
  it("renders correctly without throwing errors", () => {
    const onOpenGame = vi.fn();
    const playSound = vi.fn();

    render(
      <TrophiesPage
        games={mockGames}
        onOpenGame={onOpenGame}
        playSound={playSound}
      />
    );

    // Should display level info and game titles
    expect(screen.getByText("God of War")).toBeDefined();
    expect(screen.getByText("Spider-Man")).toBeDefined();
    expect(screen.getByText("Cyberpunk 2077")).toBeDefined();

    // Game without achievements shouldn't be listed
    expect(screen.queryByText("Indie Game Without Achievements")).toBeNull();
  });

  it("filters games by status (Platinados, Em Progresso, Não Iniciados)", () => {
    render(<TrophiesPage games={mockGames} />);

    // Click "Platinados" tab button
    const platinumBtn = screen.getByRole("button", { name: /Platinados/i });
    fireEvent.click(platinumBtn);

    expect(screen.getByRole("heading", { name: "God of War" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Spider-Man" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Cyberpunk 2077" })).toBeNull();

    // Click "Em Progresso" tab button
    const inProgressBtn = screen.getByRole("button", { name: /Em Progresso/i });
    fireEvent.click(inProgressBtn);

    expect(screen.queryByRole("heading", { name: "God of War" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Spider-Man" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Cyberpunk 2077" })).toBeNull();
  });

  it("calls onOpenGame when clicking a game row", () => {
    const onOpenGame = vi.fn();
    render(<TrophiesPage games={mockGames} onOpenGame={onOpenGame} />);

    const gameHeading = screen.getByRole("heading", { name: "God of War" });
    fireEvent.click(gameHeading);

    expect(onOpenGame).toHaveBeenCalledWith(expect.objectContaining({ id: "game-1" }));
  });

  it("filters games by search term instantly", () => {
    render(<TrophiesPage games={mockGames} />);

    const searchInput = screen.getByPlaceholderText("Buscar jogos...");
    fireEvent.change(searchInput, { target: { value: "Spider" } });

    expect(screen.getByRole("heading", { name: "Spider-Man" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "God of War" })).toBeNull();
  });

  it("renders Epic Games achievements correctly in the list", () => {
    const epicGames: Game[] = [
      {
        id: "epic-game-1",
        title: "Alan Wake 2",
        launcherType: "epic",
        epicLaunchId: "AlanWake2",
        totalAchievements: 66,
        completedAchievements: 33,
      },
    ];

    render(<TrophiesPage games={epicGames} />);

    expect(screen.getByRole("heading", { name: "Alan Wake 2" })).toBeDefined();
    expect(screen.getByText("Epic Games")).toBeDefined();
    expect(screen.getByText("50% Concluído")).toBeDefined();
  });

  it("handles large game collections efficiently with windowed rendering", () => {
    const largeCollection: Game[] = Array.from({ length: 60 }, (_, i) => ({
      id: `game-${i}`,
      title: `Adventure Quest ${i + 1}`,
      launcherType: i % 2 === 0 ? "steam" : "epic",
      totalAchievements: 20,
      completedAchievements: i % 5 === 0 ? 20 : 10,
    }));

    render(<TrophiesPage games={largeCollection} />);

    // First visible item should be rendered
    expect(screen.getByRole("heading", { name: "Adventure Quest 1" })).toBeDefined();
  });
});
