import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Clock,
  Search,
  ChevronRight,
  Gem,
  Sparkles,
  ArrowUpDown,
  X,
  Zap,
} from "lucide-react";
import type { Game } from "../types/domain";
import { formatPlayedHours, getGamePlayedHours } from "../utils/playtime";
import {
  calculateGameTrophyCounts,
  calculatePlayerLevel,
  aggregateTrophyCounts,
  getTrophyTier,
  getPSNTierInfo,
  type GameTrophyCounts,
  type PSNTier,
} from "../utils/trophyTiers";
import { getHubAggregateCounts } from "../utils/hubTrophies";
import { useAuth } from "../auth/AuthProvider";
import { useGamepadNavigation } from "../hooks/useGamepadNavigation";

interface TrophiesPageProps {
  games: Game[];
  onOpenGame?: (game: Game) => void;
  playSound?: (sound: any) => void;
}

type TrophyFilter = "all" | "platinum" | "in-progress" | "not-started";
type SortOption = "progress" | "points" | "trophies" | "recent" | "title";

const ESTIMATED_ROW_HEIGHT = 120;
const OVERSCAN_BUFFER = 4;
const HEADER_ESTIMATED_HEIGHT = 380;

const getAchievementPercentsForGame = (
  game: Game,
): Array<{ percent: number; achieved: boolean; name?: string; description?: string; apiName?: string; id?: string }> | undefined => {
  const list = (game as any)?.achievementPercents;
  return Array.isArray(list) && list.length > 0 ? list : undefined;
};

// ============================================================
// 1. SUBCOMPONENTES VISUAIS ALTAMENTE OTIMIZADOS E MEMOIZADOS
// ============================================================

const PSNTrophyIcon = React.memo<{
  type: "platinum" | "gold" | "silver" | "bronze";
  size?: number;
  glow?: boolean;
  className?: string;
}>(({ type, size = 18, glow = false, className = "" }) => {
  const config = useMemo(() => {
    switch (type) {
      case "platinum":
        return { color: "#38bdf8", glowStyle: "drop-shadow-[0_0_10px_rgba(56,189,248,0.85)]" };
      case "gold":
        return { color: "#fbbf24", glowStyle: "drop-shadow-[0_0_10px_rgba(251,191,36,0.75)]" };
      case "silver":
        return { color: "#f1f5f9", glowStyle: "drop-shadow-[0_0_8px_rgba(241,245,249,0.7)]" };
      case "bronze":
      default:
        return { color: "#cd7f32", glowStyle: "drop-shadow-[0_0_7px_rgba(205,127,50,0.6)]" };
    }
  }, [type]);

  if (type === "platinum") {
    return (
      <div className={`relative inline-flex items-center justify-center ${className}`}>
        <Gem
          size={size}
          style={{ color: config.color }}
          className={`transition-all duration-300 ${glow ? config.glowStyle : ""}`}
          strokeWidth={2}
          fill="currentColor"
          fillOpacity={0.25}
        />
      </div>
    );
  }

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <Trophy
        size={size}
        style={{ color: config.color }}
        className={`transition-all duration-300 ${glow ? config.glowStyle : ""}`}
        strokeWidth={1.8}
        fill="currentColor"
        fillOpacity={0.3}
      />
    </div>
  );
});

const PSNTierBadge = React.memo<{
  tier: PSNTier;
  subTier: number;
  level: number;
}>(({ tier, level }) => {
  const tierInfo = useMemo(() => getPSNTierInfo(level), [level]);

  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="relative flex items-center justify-center shrink-0 cursor-default"
    >
      <div
        className="relative flex h-20 w-20 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md shadow-sm overflow-hidden"
      >
        {tier === "platinum" ? (
          <Gem className="h-6 w-6 text-[#38bdf8]" />
        ) : (
          <Trophy
            className="h-6 w-6"
            style={{ color: tierInfo.hexColor }}
            strokeWidth={2}
          />
        )}
        <div className="mt-1 flex items-baseline gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">LV</span>
          <span className="text-base font-bold text-white leading-none tracking-tight">{level}</span>
        </div>
      </div>
    </motion.div>
  );
});

const ProgressBar = React.memo<{
  pct: number;
  height?: string;
  className?: string;
  glow?: boolean;
}>(({ pct, height = "h-2", className = "", glow = false }) => {
  const tier = useMemo(() => getTrophyTier(pct), [pct]);
  const gradient = useMemo(() => `linear-gradient(90deg, ${tier.gradientFrom}, ${tier.gradientTo})`, [tier]);

  return (
    <div className={`relative ${height} w-full rounded-full bg-neutral-900/80 border border-white/5 overflow-hidden ${className}`}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: gradient, boxShadow: glow ? `0 0 12px ${tier.gradientFrom}` : undefined }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(pct, 0)}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
      {pct >= 100 && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)`, backgroundSize: "200% 100%" }}
          animate={{ backgroundPosition: ["-100% 0%", "200% 0%"] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
        />
      )}
    </div>
  );
});

// ============================================================
// 2. LINHA DA LISTA DE JOGOS MEMOIZADA (GAME ROW)
// ============================================================

interface GameRowProps {
  game: Game;
  index: number;
  trophyCounts: GameTrophyCounts;
  completionPct: number;
  onOpen?: (game: Game) => void;
  playSound?: (sound: any) => void;
}

const GameRow = React.memo<GameRowProps>(
  ({ game, trophyCounts, completionPct, onOpen, playSound }) => {
    const hasPlatinum = trophyCounts.platinum > 0;
    const hours = useMemo(() => getGamePlayedHours(game), [game]);

    const handleClick = useCallback(() => {
      onOpen?.(game);
    }, [onOpen, game]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(game);
        }
      },
      [onOpen, game],
    );

    const handleMouseEnter = useCallback(() => {
      playSound?.("hover");
    }, [playSound]);

    const launcherLabel = useMemo(() => {
      if (game.launcherType === "steam") return "Steam";
      if (game.launcherType === "epic") return "Epic Games";
      return game.launcherType?.toUpperCase() || "PC";
    }, [game.launcherType]);

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        whileHover={{ y: -2, scale: 1.003 }}
        whileTap={{ scale: 0.985 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        className={`group relative flex flex-col gap-3.5 rounded-2xl border p-4 sm:p-5 transition-all duration-160 cursor-pointer overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-white/60 transform-gpu will-change-transform ${hasPlatinum
            ? "border-[#38bdf8]/30 bg-white/[0.03] hover:border-[#38bdf8]/50 hover:bg-white/[0.05]"
            : "border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
          }`}
        style={{ minHeight: `${ESTIMATED_ROW_HEIGHT}px` }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div
              className={`relative h-16 w-12 sm:h-18 sm:w-13 shrink-0 overflow-hidden rounded-xl transition-all duration-200 group-hover:scale-105 ${hasPlatinum
                  ? "border border-[#38bdf8]/50 shadow-sm"
                  : "bg-neutral-800 border border-white/10"
                }`}
            >
              {game.cardImage || game.image ? (
                <img
                  src={game.cardImage || game.image}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-neutral-800 text-white/30 text-xs font-bold">
                  {game.title?.slice(0, 2).toUpperCase()}
                </div>
              )}
              {hasPlatinum && (
                <div className="absolute inset-0 bg-gradient-to-t from-[#38bdf8]/30 to-transparent pointer-events-none" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3
                  className={`truncate text-base font-bold transition-colors ${hasPlatinum ? "text-white group-hover:text-[#7dd3fc]" : "text-neutral-100 group-hover:text-white"
                    }`}
                >
                  {game.title}
                </h3>
                {hasPlatinum && (
                  <div className="flex items-center gap-1 rounded-full border border-[#38bdf8]/40 bg-[#38bdf8]/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.25)]">
                    <Sparkles className="h-3 w-3 animate-pulse" />
                    <span>Platinado</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-neutral-400">
                <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                  {launcherLabel}
                </span>
                {hours > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-400">
                    <Clock className="h-3 w-3 text-neutral-500" /> {formatPlayedHours(hours)}h
                  </span>
                )}
                {trophyCounts.points ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400/90">
                    <Zap className="h-3 w-3 text-amber-400" /> +{trophyCounts.points} XP
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-200 ${hasPlatinum
                    ? "border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.15)]"
                    : "border-white/5 bg-black/20 text-white/30"
                  }`}
                title="Troféu de Platina (300 XP)"
              >
                <PSNTrophyIcon type="platinum" size={15} glow={hasPlatinum} />
                <span className="text-xs font-black">
                  {trophyCounts.platinum}
                  <span className="text-[10px] opacity-50 font-normal">/{trophyCounts.totalPlatinum ?? 1}</span>
                </span>
              </div>
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-200 ${trophyCounts.gold > 0
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.15)]"
                    : "border-white/5 bg-black/20 text-white/30"
                  }`}
                title="Troféus de Ouro (90 XP cada)"
              >
                <PSNTrophyIcon type="gold" size={15} glow={trophyCounts.gold > 0} />
                <span className="text-xs font-black">
                  {trophyCounts.gold}
                  {trophyCounts.totalGold ? (
                    <span className="text-[10px] opacity-50 font-normal">/{trophyCounts.totalGold}</span>
                  ) : null}
                </span>
              </div>
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-200 ${trophyCounts.silver > 0
                    ? "border-slate-300/30 bg-slate-300/10 text-slate-200"
                    : "border-white/5 bg-black/20 text-white/30"
                  }`}
                title="Troféus de Prata (30 XP cada)"
              >
                <PSNTrophyIcon type="silver" size={15} />
                <span className="text-xs font-black">
                  {trophyCounts.silver}
                  {trophyCounts.totalSilver ? (
                    <span className="text-[10px] opacity-50 font-normal">/{trophyCounts.totalSilver}</span>
                  ) : null}
                </span>
              </div>
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-200 ${trophyCounts.bronze > 0
                    ? "border-[#cd7f32]/40 bg-[#cd7f32]/10 text-[#cd7f32]"
                    : "border-white/5 bg-black/20 text-white/30"
                  }`}
                title="Troféus de Bronze (15 XP cada)"
              >
                <PSNTrophyIcon type="bronze" size={15} />
                <span className="text-xs font-black">
                  {trophyCounts.bronze}
                  {trophyCounts.totalBronze ? (
                    <span className="text-[10px] opacity-50 font-normal">/{trophyCounts.totalBronze}</span>
                  ) : null}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 pl-2">
              <div className="flex flex-col items-end">
                <span className={`text-sm font-black tracking-tight ${hasPlatinum ? "text-[#38bdf8]" : "text-white"}`}>
                  {completionPct}%
                </span>
                <span className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider">
                  {trophyCounts.completed}/{trophyCounts.total}
                </span>
              </div>
              <ChevronRight
                className={`h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 ${hasPlatinum ? "text-[#38bdf8]" : "text-neutral-500 group-hover:text-white"
                  }`}
              />
            </div>
          </div>
        </div>
        <div className="relative z-10 pt-1">
          <ProgressBar pct={completionPct} glow={hasPlatinum} />
        </div>
      </motion.div>
    );
  },
  (prev, next) => {
    return (
      prev.game.id === next.game.id &&
      prev.index === next.index &&
      prev.completionPct === next.completionPct &&
      prev.trophyCounts.completed === next.trophyCounts.completed &&
      prev.trophyCounts.total === next.trophyCounts.total &&
      prev.trophyCounts.platinum === next.trophyCounts.platinum &&
      prev.trophyCounts.gold === next.trophyCounts.gold &&
      prev.trophyCounts.silver === next.trophyCounts.silver &&
      prev.trophyCounts.bronze === next.trophyCounts.bronze &&
      prev.onOpen === next.onOpen &&
      prev.playSound === next.playSound
    );
  },
);

// ============================================================
// 3. PÁGINA PRINCIPAL DE TROFÉUS
// ============================================================

const TrophiesPage: React.FC<TrophiesPageProps> = ({ games, onOpenGame, playSound }) => {
  const [filter, setFilter] = useState<TrophyFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("progress");
  const [searchTerm, setSearchTerm] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useGamepadNavigation({
    scrollRef: scrollRef as React.RefObject<HTMLElement>,
    scrollSpeed: 25,
    enabled: true,
    priority: 1,
  });

  // Scroll & Resize Handler com RAF
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        setScrollTop(container.scrollTop);
        rafId = null;
      });
    };

    const updateHeight = () => {
      setContainerHeight(container.clientHeight || 800);
    };

    updateHeight();
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateHeight);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });
      resizeObserver.observe(container);
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateHeight);
      resizeObserver?.disconnect();
    };
  }, []);

  const gamesWithAchievements = useMemo(() => {
    return (games || []).filter((g) => (g.totalAchievements || 0) > 0);
  }, [games]);

  // FASE 1: Enriquecimento de Dados (Cálculo Único e Centralizado)
  const enrichedGames = useMemo(() => {
    return gamesWithAchievements.map((game) => {
      const t = game.totalAchievements || 0;
      const u = game.completedAchievements || 0;
      const pct = t > 0 ? Math.round((u / t) * 100) : 0;
      const counts = calculateGameTrophyCounts(t, u, getAchievementPercentsForGame(game));
      return { game, t, u, pct, counts };
    });
  }, [gamesWithAchievements]);

  // Estatísticas Globais do Jogador
  const totalStats = useMemo(() => {
    const gamesForAggregate = gamesWithAchievements.map((g) => ({
      totalAchievements: g.totalAchievements,
      completedAchievements: g.completedAchievements,
      achievementPercents: getAchievementPercentsForGame(g),
    }));
    const agg = aggregateTrophyCounts(gamesForAggregate);
    let levelAgg = agg;
    if (user?.uid) {
      levelAgg = getHubAggregateCounts(user.uid, gamesWithAchievements as any);
    }
    const playerLevel = calculatePlayerLevel(0, 0, 0, levelAgg);
    return {
      total: agg.total,
      unlocked: agg.completed,
      platinum: agg.platinum,
      gold: agg.gold,
      silver: agg.silver,
      bronze: agg.bronze,
      gamesCount: gamesWithAchievements.length,
      playerLevel,
    };
  }, [gamesWithAchievements, user?.uid]);

  // FASE 2: Filtragem e Ordenação Estável
  const filteredGames = useMemo(() => {
    let list = [...enrichedGames];

    if (filter === "platinum") list = list.filter((g) => g.t > 0 && g.u >= g.t);
    else if (filter === "in-progress") list = list.filter((g) => g.u > 0 && g.u < g.t);
    else if (filter === "not-started") list = list.filter((g) => g.u === 0);

    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase().trim();
      list = list.filter((g) => g.game.title?.toLowerCase().includes(s));
    }

    list.sort((a, b) => {
      if (sortBy === "progress") return b.pct - a.pct;
      if (sortBy === "points") return (b.counts.points || 0) - (a.counts.points || 0);
      if (sortBy === "trophies") return b.u - a.u;
      if (sortBy === "recent") {
        const aTime = a.game.lastPlayedAt ? new Date(a.game.lastPlayedAt).getTime() : 0;
        const bTime = b.game.lastPlayedAt ? new Date(b.game.lastPlayedAt).getTime() : 0;
        return bTime - aTime;
      }
      if (sortBy === "title") return (a.game.title || "").localeCompare(b.game.title || "");
      return b.pct - a.pct;
    });

    return list;
  }, [enrichedGames, filter, searchTerm, sortBy]);

  // FASE 3: Virtual Windowing Nativo e Seguro
  const { visibleGames, topSpacerHeight, bottomSpacerHeight, startIndex } = useMemo(() => {
    const count = filteredGames.length;
    if (count <= 10) {
      return { visibleGames: filteredGames, topSpacerHeight: 0, bottomSpacerHeight: 0, startIndex: 0 };
    }

    const relativeScroll = Math.max(0, scrollTop - HEADER_ESTIMATED_HEIGHT);
    const start = Math.max(0, Math.floor(relativeScroll / ESTIMATED_ROW_HEIGHT) - OVERSCAN_BUFFER);
    const end = Math.min(count, Math.ceil((relativeScroll + containerHeight) / ESTIMATED_ROW_HEIGHT) + OVERSCAN_BUFFER);

    return {
      visibleGames: filteredGames.slice(start, end),
      topSpacerHeight: start * ESTIMATED_ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (count - end) * ESTIMATED_ROW_HEIGHT),
      startIndex: start,
    };
  }, [filteredGames, scrollTop, containerHeight]);

  const levelInfo = totalStats.playerLevel;
  const tierInfo = levelInfo.tierInfo;

  // Callbacks Estáveis
  const handleFilterSelect = useCallback(
    (newFilter: TrophyFilter) => {
      playSound?.("select");
      setFilter(newFilter);
    },
    [playSound],
  );

  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as SortOption);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
  }, []);

  const filterTabs = useMemo(
    () => [
      { id: "all" as TrophyFilter, label: "Todos", count: gamesWithAchievements.length },
      { id: "platinum" as TrophyFilter, label: "Platinados", count: totalStats.platinum },
      {
        id: "in-progress" as TrophyFilter,
        label: "Em Progresso",
        count: gamesWithAchievements.filter(
          (g) => (g.completedAchievements || 0) > 0 && (g.completedAchievements || 0) < (g.totalAchievements || 0),
        ).length,
      },
      {
        id: "not-started" as TrophyFilter,
        label: "Não Iniciados",
        count: gamesWithAchievements.filter((g) => (g.completedAchievements || 0) === 0).length,
      },
    ],
    [gamesWithAchievements, totalStats.platinum],
  );

  return (
    <motion.div
      ref={scrollRef}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative min-h-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full px-6 sm:px-10 pb-16 pt-6 text-white font-sans"
    >
      <div className="mx-auto max-w-5xl space-y-7">
        {/* Banner PlayStation PSN Level */}
        <section className="relative rounded-3xl border border-white/10 bg-black/40 backdrop-blur-3xl p-6 sm:p-8 shadow-[0_20px_80px_rgba(0,0,0,0.6)] overflow-hidden">
          <div
            className="absolute -top-32 -left-32 w-80 h-80 rounded-full blur-[100px] opacity-25 pointer-events-none transition-all duration-700"
            style={{ background: tierInfo.gradientFrom }}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
            <div className="flex items-center gap-6 min-w-0">
              <PSNTierBadge tier={levelInfo.tier} subTier={levelInfo.subTier} level={levelInfo.level} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <span className={`text-xl sm:text-2xl font-black tracking-tight ${tierInfo.color}`}>
                    {levelInfo.tierName}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white/60">
                    Phelierium Level
                  </span>
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-white/60">
                      {levelInfo.level >= 999
                        ? "Nível Máximo Alcançado"
                        : `${levelInfo.currentLevelXp} / ${levelInfo.xpForNextLevel} XP`}
                    </span>
                    <span className={`font-black ${tierInfo.color}`}>{levelInfo.progress}%</span>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-neutral-800/80 overflow-hidden border border-white/5">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${tierInfo.gradientFrom}, ${tierInfo.gradientTo})`,
                        boxShadow: `0 0 10px ${tierInfo.gradientFrom}`,
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${levelInfo.progress}%` }}
                      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
                  <span>Total Acumulado:</span>
                  <span className="text-amber-400 font-extrabold flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    {levelInfo.xp.toLocaleString()} XP
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-900/60 p-4 rounded-2xl border border-white/10 backdrop-blur-xl">
              <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-[#38bdf8]/30 transition-all group">
                <PSNTrophyIcon type="platinum" size={22} glow={totalStats.platinum > 0} />
                <span className="mt-1.5 text-xl font-black text-[#38bdf8] tabular-nums">{totalStats.platinum}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 group-hover:text-white/70 transition-colors">
                  Platina (300)
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-amber-400/30 transition-all group">
                <PSNTrophyIcon type="gold" size={22} glow={totalStats.gold > 0} />
                <span className="mt-1.5 text-xl font-black text-amber-400 tabular-nums">{totalStats.gold}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 group-hover:text-white/70 transition-colors">
                  Ouro (90)
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-slate-300/30 transition-all group">
                <PSNTrophyIcon type="silver" size={22} />
                <span className="mt-1.5 text-xl font-black text-slate-200 tabular-nums">{totalStats.silver}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 group-hover:text-white/70 transition-colors">
                  Prata (30)
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-[#cd7f32]/30 transition-all group">
                <PSNTrophyIcon type="bronze" size={22} />
                <span className="mt-1.5 text-xl font-black text-[#cd7f32] tabular-nums">{totalStats.bronze}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 group-hover:text-white/70 transition-colors">
                  Bronze (15)
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Controles de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1">
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-neutral-900/60 border border-white/10 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {filterTabs.map((f) => (
              <motion.button
                key={f.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleFilterSelect(f.id)}
                onMouseEnter={() => playSound?.("hover")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap focus-visible:ring-2 focus-visible:ring-white/50 outline-none ${filter === f.id
                    ? "bg-white text-black shadow-md"
                    : "bg-transparent text-neutral-400 hover:text-white hover:bg-white/5"
                  }`}
              >
                <span>{f.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${filter === f.id ? "bg-black/10 text-black" : "bg-white/10 text-white/60"
                    }`}
                >
                  {f.count}
                </span>
              </motion.button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-300 transition-colors hover:border-white/20">
              <ArrowUpDown className="h-3.5 w-3.5 text-neutral-500" />
              <select
                value={sortBy}
                onChange={handleSortChange}
                className="bg-transparent font-bold text-white outline-none cursor-pointer"
              >
                <option value="progress" className="bg-neutral-900 text-white">
                  Maior %
                </option>
                <option value="points" className="bg-neutral-900 text-white">
                  Mais Pontos
                </option>
                <option value="trophies" className="bg-neutral-900 text-white">
                  Mais Troféus
                </option>
                <option value="recent" className="bg-neutral-900 text-white">
                  Mais Recentes
                </option>
                <option value="title" className="bg-neutral-900 text-white">
                  Alfabética
                </option>
              </select>
            </div>
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 transition-colors group-focus-within:text-white" />
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Buscar jogos..."
                className="h-10 w-44 sm:w-56 rounded-2xl border border-white/10 bg-neutral-900/60 pl-10 pr-8 text-xs font-medium text-white placeholder:text-neutral-500 outline-none transition-all focus:border-white/30 focus:w-64"
              />
              {searchTerm && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white p-0.5 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lista Virtualizada com Spacers */}
        <div className="space-y-3">
          {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}

          <AnimatePresence mode="popLayout">
            {visibleGames.map(({ game, pct, counts }, idx) => (
              <GameRow
                key={game.id}
                game={game}
                index={startIndex + idx}
                trophyCounts={counts}
                completionPct={pct}
                onOpen={onOpenGame}
                playSound={playSound}
              />
            ))}
          </AnimatePresence>

          {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}

          {filteredGames.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-white/5 bg-black/20"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 mb-4">
                <Trophy className="h-8 w-8 text-neutral-500" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-neutral-300">
                {filter === "platinum"
                  ? "Nenhum jogo platinado ainda"
                  : filter === "in-progress"
                    ? "Nenhum jogo em progresso no momento"
                    : filter === "not-started"
                      ? "Você já iniciou todos os seus jogos!"
                      : "Nenhum jogo encontrado"}
              </h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                {filter === "platinum"
                  ? "Complete 100% das conquistas de um jogo para conquistar seu troféu de Platina!"
                  : "Tente alterar os filtros de busca para ver seus outros jogos e troféus."}
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(TrophiesPage);