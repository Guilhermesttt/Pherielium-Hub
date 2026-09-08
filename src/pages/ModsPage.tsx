import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search,
  ChevronDown,
  LayoutGrid,
  ListFilter,
  Sparkles,
  MoreVertical,
  ArrowUpRight,
  PackageOpen,
  CheckCircle2,
  FolderPlus,
} from "lucide-react";
import type { Game } from "../types/domain";
import { usePreferences } from "../context/PreferencesContext";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useGamepadNavigation } from "../hooks/useGamepadNavigation";
import ModGameDetailPanel, {
  type InstalledModEntry,
} from "../components/mods/ModGameDetailPanel";

interface ModsPageProps {
  uid: string;
  games: Game[];
}

const storageKeys = {
  folders: (uid: string) => `checkpoint_mod_game_folders_${uid}`,
  domains: (uid: string) => `checkpoint_mod_game_domains_${uid}`,
  installed: (uid: string) => `checkpoint_installed_mods_${uid}`,
};

const readRecord = <T,>(key: string): Record<string, T> => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const normalizeInstalledMods = (
  record: Record<string, InstalledModEntry[]>,
): Record<string, InstalledModEntry[]> =>
  Object.fromEntries(
    Object.entries(record).map(([gameId, mods]) => [
      gameId,
      (Array.isArray(mods) ? mods : []).map((mod) => {
        if (mod.enabled && !mod.manifestPath) {
          return { ...mod, enabled: false, status: "downloaded" as const };
        }
        return mod;
      }),
    ]),
  );

export const getGameArtwork = (game: Game): string => {
  if (game.cardImage) return game.cardImage;
  if (game.image && (game.image.startsWith("http") || game.image.startsWith("data:"))) return game.image;
  if (game.backgroundImage) return game.backgroundImage;
  if (game.steamAppId) {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.steamAppId}/header.jpg`;
  }
  return game.image || "";
};

// ============================================================
// MOD GAME CARD MEMOIZADO
// ============================================================

interface ModGameCardProps {
  game: Game;
  index: number;
  gameModsCount: number;
  activeModsCount: number;
  artwork: string;
  totalGames: number;
  onSelectGame: (game: Game) => void;
  playSound?: (type: any) => void;
}

const ModGameCard = React.memo<ModGameCardProps>(
  ({
    game,
    index,
    gameModsCount,
    activeModsCount,
    artwork,
    totalGames,
    onSelectGame,
    playSound,
  }) => {
    const handleCardClick = useCallback(() => {
      playSound?.("select");
      onSelectGame(game);
    }, [game, onSelectGame, playSound]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playSound?.("select");
          onSelectGame(game);
        }
      },
      [game, onSelectGame, playSound],
    );

    const handleMouseEnter = useCallback(() => {
      playSound?.("hover");
    }, [playSound]);

    return (
      <div
        data-gamepad-id={`mods-card-${index}`}
        data-gamepad-nav-up={index < 4 ? "mods-sort" : `mods-card-${index - 4}`}
        data-gamepad-nav-down={index + 4 < totalGames ? `mods-card-${index + 4}` : undefined}
        tabIndex={0}
        role="button"
        aria-label={`Gerenciar mods de ${game.title}`}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        className="group relative rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.10] hover:border-white/20 p-3.5 transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 data-[gamepad-focused=true]:ring-2 data-[gamepad-focused=true]:ring-white/60 data-[gamepad-focused=true]:border-white/30 cursor-pointer transform-gpu text-left"
      >
        <div>
          {/* Game Artwork Thumbnail */}
          <div className="relative h-28 w-full rounded-2xl overflow-hidden bg-white/[0.05] mb-3 border border-white/10">
            {artwork ? (
              <img
                src={artwork}
                alt={game.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/40 px-2 text-center">
                {game.title}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
            <div
              aria-hidden="true"
              className="absolute top-2 right-2 h-8 w-8 rounded-lg bg-black/60 text-white/70 flex items-center justify-center backdrop-blur-md pointer-events-none"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Title & Mod Count */}
          <h3 className="text-sm font-display font-semibold text-white truncate">
            {game.title}
          </h3>
          <p className="text-xs font-body text-white/70 font-medium flex items-center gap-1.5 mt-1">
            {activeModsCount > 0 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-white/90 shrink-0" />
            ) : (
              <PackageOpen className="w-3.5 h-3.5 text-white/50 shrink-0" />
            )}
            <span>
              {activeModsCount
                ? `${activeModsCount}${gameModsCount > activeModsCount ? ` de ${gameModsCount}` : ""} mods ativos`
                : gameModsCount
                  ? `${gameModsCount} mods instalados`
                  : "Sem mods ativos"}
            </span>
          </p>
        </div>

        {/* Manage Action Indicator */}
        <div className="mt-4 pt-2 border-t border-white/[0.06]">
          <div
            className="w-full h-10 rounded-lg border border-white/15 bg-white/[0.08] group-hover:bg-white/[0.15] active:scale-98 text-white text-xs font-semibold transition-all duration-160 flex items-center justify-center gap-1.5 shadow-sm pointer-events-none"
          >
            {gameModsCount === 0 ? (
              <>
                <FolderPlus className="w-3.5 h-3.5 text-white/70" />
                <span>Vincular pasta</span>
              </>
            ) : (
              <span>Gerenciar</span>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.game.id === next.game.id &&
    prev.index === next.index &&
    prev.gameModsCount === next.gameModsCount &&
    prev.activeModsCount === next.activeModsCount &&
    prev.artwork === next.artwork &&
    prev.totalGames === next.totalGames &&
    prev.onSelectGame === next.onSelectGame &&
    prev.playSound === next.playSound,
);

// ============================================================
// PÁGINA PRINCIPAL DE MODS
// ============================================================

export const ModsPage: React.FC<ModsPageProps> = ({ uid, games }) => {
  const { effectsVolume, soundTheme, notificationVolume } = usePreferences();
  const { playSound } = useSoundEffects(
    effectsVolume / 100,
    soundTheme,
    notificationVolume / 100,
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortOrder, setSortOrder] = useState<"AZ" | "ZA" | "MODS">("AZ");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useGamepadNavigation({
    scrollRef: scrollRef as React.RefObject<HTMLElement>,
    enabled: !selectedGame,
    disableX: true,
    disableO: true,
  });

  const [gameFolders, setGameFolders] = useState<Record<string, string>>(() =>
    readRecord<string>(storageKeys.folders(uid)),
  );
  const [gameDomains, setGameDomains] = useState<Record<string, string>>(() =>
    readRecord<string>(storageKeys.domains(uid)),
  );
  const [installedByGame, setInstalledByGame] = useState<
    Record<string, InstalledModEntry[]>
  >(() =>
    normalizeInstalledMods(
      readRecord<InstalledModEntry[]>(storageKeys.installed(uid)),
    ),
  );

  useEffect(() => {
    localStorage.setItem(
      storageKeys.installed(uid),
      JSON.stringify(installedByGame),
    );
  }, [installedByGame, uid]);

  const chooseGameFolder = useCallback(async () => {
    if (!selectedGame || !window.electronAPI?.selectModGameDirectory) return;
    const folder = await window.electronAPI.selectModGameDirectory(selectedGame.title);
    if (!folder) return;
    setGameFolders((prev) => {
      const next = { ...prev, [selectedGame.id]: folder };
      localStorage.setItem(storageKeys.folders(uid), JSON.stringify(next));
      return next;
    });
  }, [selectedGame, uid]);

  const saveGameDomain = useCallback((domain: string) => {
    if (!selectedGame) return;
    setGameDomains((prev) => {
      const next = { ...prev, [selectedGame.id]: domain };
      localStorage.setItem(storageKeys.domains(uid), JSON.stringify(next));
      return next;
    });
  }, [selectedGame, uid]);

  const toggleInstalledMod = useCallback((
    modId: string,
    enabled: boolean,
  ) => {
    if (!selectedGame) return;
    setInstalledByGame((prev) => {
      const nextForGame: InstalledModEntry[] = (
        prev[selectedGame.id] || []
      ).map((mod) =>
        mod.id === modId
          ? {
              ...mod,
              enabled,
              status: enabled ? "installed" : "downloaded",
              ...(!enabled ? { manifestPath: undefined } : {}),
            }
          : mod,
      );
      const next = { ...prev, [selectedGame.id]: nextForGame };
      localStorage.setItem(storageKeys.installed(uid), JSON.stringify(next));
      return next;
    });
  }, [selectedGame, uid]);

  const removeInstalledMod = useCallback((modId: string) => {
    if (!selectedGame) return;
    setInstalledByGame((prev) => {
      const next = {
        ...prev,
        [selectedGame.id]: (prev[selectedGame.id] || []).filter((mod) => mod.id !== modId),
      };
      localStorage.setItem(storageKeys.installed(uid), JSON.stringify(next));
      return next;
    });
  }, [selectedGame, uid]);

  const recordDownloadedMod = useCallback(
    (mod: InstalledModEntry) => {
      if (!selectedGame) return;
      setInstalledByGame((current) => {
        const currentForGame = current[selectedGame.id] || [];
        const existing = currentForGame.find((entry) => entry.id === mod.id);
        const mergedMod: InstalledModEntry = existing
          ? {
              ...existing,
              ...mod,
              name: mod.name || existing.name,
              author:
                mod.author === "Nexus Mods"
                  ? existing.author || mod.author
                  : mod.author,
              pictureUrl: mod.pictureUrl || existing.pictureUrl,
              version: mod.version || existing.version,
              status:
                existing.status === "installed" && mod.status === "downloaded"
                  ? "installed"
                  : mod.status,
              enabled:
                existing.status === "installed" && mod.status === "downloaded"
                  ? existing.enabled
                  : mod.enabled,
            }
          : mod;
        const nextForGame = [
          mergedMod,
          ...currentForGame.filter((entry) => entry.id !== mod.id),
        ];
        const next = { ...current, [selectedGame.id]: nextForGame };
        localStorage.setItem(storageKeys.installed(uid), JSON.stringify(next));
        return next;
      });
    },
    [selectedGame, uid],
  );

  const handleDownloadRecorded = useCallback(
    (mod: InstalledModEntry) => {
      recordDownloadedMod(mod);
    },
    [recordDownloadedMod],
  );

  const enrichedGames = useMemo(() => {
    return games.map((game) => {
      const gameMods = installedByGame[game.id] || [];
      const activeMods = gameMods.filter((m) => m.enabled).length;
      const artwork = getGameArtwork(game);
      return {
        game,
        gameModsCount: gameMods.length,
        activeModsCount: activeMods,
        artwork,
      };
    });
  }, [games, installedByGame]);

  const filteredGames = useMemo(() => {
    let list = [...enrichedGames];
    const query = searchTerm.trim().toLowerCase();
    if (query) {
      list = list.filter(({ game }) =>
        [game.title, game.category, game.launcherType]
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }
    if (statusFilter === "WITH_MODS") {
      list = list.filter((item) => item.gameModsCount > 0);
    }
    if (sortOrder === "AZ") {
      list.sort((a, b) => a.game.title.localeCompare(b.game.title));
    } else if (sortOrder === "ZA") {
      list.sort((a, b) => b.game.title.localeCompare(a.game.title));
    } else if (sortOrder === "MODS") {
      list.sort((a, b) => b.gameModsCount - a.gameModsCount);
    }
    return list;
  }, [enrichedGames, searchTerm, statusFilter, sortOrder]);

  const configuredGames = useMemo(
    () => games.filter((game) => Boolean(gameFolders[game.id])).length,
    [games, gameFolders],
  );

  const { totalInstalledMods, activeInstalledMods } = useMemo(() => {
    const allMods = Object.values(installedByGame).flat();
    return {
      totalInstalledMods: allMods.length,
      activeInstalledMods: allMods.filter((m) => m.enabled).length,
    };
  }, [installedByGame]);

  const handleSelectGame = useCallback((game: Game) => {
    setSelectedGame(game);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedGame(null);
  }, []);

  return (
    <div
      ref={scrollRef}
      data-system-page
      className="flex flex-col min-h-0 flex-1 overflow-y-auto px-8 pb-16 pt-4 font-sans select-none thin-scrollbar hub-scroll"
    >
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Top Header Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-body font-semibold tracking-widest text-white/40 uppercase">
          <span>PHERIELIUM</span>
          <span>&gt;</span>
          <span className="text-white/80">MODS</span>
        </div>

        {/* Hero Section Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-white/[0.04] via-white/[0.02] to-transparent p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/[0.03] blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
                  <PackageOpen className="w-5 h-5" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-black text-white tracking-wide">
                  GERENCIADOR DE MODS
                </h1>
              </div>
              <p className="text-xs sm:text-sm font-body text-white/50 max-w-2xl leading-relaxed">
                Instale, ative e configure modificações para seus jogos instalados.
                Integração nativa com Nexus Mods e controle completo de diretórios.
              </p>
            </div>

            {/* Quick Metrics Bar */}
            <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
              <div className="px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-md">
                <span className="block text-[10px] font-body font-semibold uppercase tracking-wider text-white/40">
                  Jogos Suportados
                </span>
                <span className="text-lg font-display font-bold text-white">
                  {games.length}
                </span>
              </div>
              <div className="px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-md">
                <span className="block text-[10px] font-body font-semibold uppercase tracking-wider text-white/40">
                  Diretórios Vinculados
                </span>
                <span className="text-lg font-display font-bold text-white/90">
                  {configuredGames}
                </span>
              </div>
              <div className="px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-md">
                <span className="block text-[10px] font-body font-semibold uppercase tracking-wider text-white/40">
                  Mods Ativos
                </span>
                <span className="text-lg font-display font-bold text-white">
                  {activeInstalledMods} / {totalInstalledMods}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Tabs / Main Layout */}
        <div>
          {/* Main Grid View */}
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-2 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl">
              {/* Search Field */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                <input
                  id="mods-search-input"
                  type="text"
                  aria-label="Pesquisar jogos com suporte a mods"
                  placeholder="Pesquisar jogos com suporte a mods..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs font-body text-white placeholder-white/40 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>

              {/* Status and Sort Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <select
                    id="mods-category-select"
                    aria-label="Filtrar por categoria de mods"
                    data-gamepad-id="mods-category"
                    data-gamepad-nav-down="mods-status"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-10 px-4 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs font-body font-semibold text-white/80 focus:outline-none focus:border-white/25 cursor-pointer appearance-none"
                  >
                    <option value="ALL" className="bg-[#0c0d12] text-white">
                      Todas as Categorias
                    </option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    id="mods-status-select"
                    aria-label="Filtrar por status de mods instalados"
                    data-gamepad-id="mods-status"
                    data-gamepad-nav-up="mods-category"
                    data-gamepad-nav-down="mods-sort"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 px-4 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs font-body font-semibold text-white/80 focus:outline-none focus:border-white/25 cursor-pointer appearance-none"
                  >
                    <option value="ALL" className="bg-[#0c0d12] text-white">
                      Status
                    </option>
                    <option value="WITH_MODS" className="bg-[#0c0d12] text-white">
                      Com Mods
                    </option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    id="mods-sort-select"
                    aria-label="Ordenar jogos com mods"
                    data-gamepad-id="mods-sort"
                    data-gamepad-nav-up="mods-status"
                    data-gamepad-nav-down="mods-card-0"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as any)}
                    className="h-10 px-4 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs font-body font-semibold text-white/80 focus:outline-none focus:border-white/25 cursor-pointer appearance-none"
                  >
                    <option value="AZ" className="bg-[#0c0d12] text-white">
                      Ordenar: A - Z
                    </option>
                    <option value="ZA" className="bg-[#0c0d12] text-white">
                      Ordenar: Z - A
                    </option>
                    <option value="MODS" className="bg-[#0c0d12] text-white">
                      Mais Mods
                    </option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <button
                    type="button"
                    title="Visualização em Grade"
                    className="p-1.5 rounded-lg bg-white/10 text-white"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Visualização em Lista"
                    className="p-1.5 rounded-lg text-white/40 hover:text-white"
                  >
                    <ListFilter className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Games Grid Memoizado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {filteredGames.map(({ game, gameModsCount, activeModsCount, artwork }, index) => (
                <ModGameCard
                  key={game.id}
                  game={game}
                  index={index}
                  gameModsCount={gameModsCount}
                  activeModsCount={activeModsCount}
                  artwork={artwork}
                  totalGames={filteredGames.length}
                  onSelectGame={handleSelectGame}
                  playSound={playSound}
                />
              ))}
            </div>

            {/* Bottom Discovery Banner */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-xl shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-white/[0.08] border border-white/20 flex items-center justify-center text-white shrink-0">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-display font-bold text-white">
                    Descubra novos mods para seus jogos favoritos
                  </h4>
                  <p className="text-xs font-body text-white/50">
                    Navegue por milhares de mods incríveis disponíveis no Nexus Mods.
                  </p>
                </div>
              </div>

              <a
                href="https://www.nexusmods.com"
                target="_blank"
                rel="noreferrer"
                onMouseEnter={() => playSound?.("hover")}
                className="cursor-pointer shrink-0 px-5 py-2.5 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-body font-bold uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95"
              >
                <span>EXPLORAR NEXUS MODS</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Detalhes do Jogo Selecionado com Mods */}
      {selectedGame && (
        <ModGameDetailPanel
          game={selectedGame}
          isOpen={Boolean(selectedGame)}
          gameFolder={gameFolders[selectedGame.id] || ""}
          gameDomain={gameDomains[selectedGame.id] || ""}
          installedMods={installedByGame[selectedGame.id] || []}
          onClose={handleCloseDetail}
          onChooseFolder={chooseGameFolder}
          onSaveDomain={saveGameDomain}
          onToggleMod={toggleInstalledMod}
          onRemoveMod={removeInstalledMod}
          onDownloadRecorded={handleDownloadRecorded}
        />
      )}
    </div>
  );
};

export default React.memo(ModsPage);
