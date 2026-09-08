import React from "react";
import { Trophy, Search, AlertCircle, RotateCw, X } from "lucide-react";
import type { SteamAchievement } from "../../services/steam";
import type { AchievementFilter, GameDetailCopy } from "../../types/gameDetail";
import type { SoundEffectType } from "../../hooks/useSoundEffects";

export const ACHIEVEMENT_TIER_CONFIGS = [
  { color: "#38bdf8", bg: "rgba(56,189,248,0.10)", border: "rgba(56,189,248,0.30)", glow: "0 0 14px rgba(56,189,248,0.28)", label: "Platina" },
  { color: "#facc15", bg: "rgba(250,204,21,0.10)", border: "rgba(250,204,21,0.30)", glow: "0 0 12px rgba(250,204,21,0.22)", label: "Ouro" },
  { color: "#f1f5f9", bg: "rgba(241,245,249,0.12)", border: "rgba(241,245,249,0.35)", glow: "0 0 14px rgba(241,245,249,0.30)", label: "Prata" },
  { color: "#cd7f32", bg: "rgba(205,127,50,0.08)", border: "rgba(205,127,50,0.25)", glow: "", label: "Bronze" },
  { color: "#71797E", bg: "rgba(113,121,126,0.05)", border: "rgba(113,121,126,0.15)", glow: "", label: "" },
] as const;

interface GameDetailAchievementsProps {
  achievements: SteamAchievement[];
  isLoading: boolean;
  error: string | null;
  filter: AchievementFilter;
  searchQuery: string;
  copy: GameDetailCopy;
  locale: string;
  onFilterChange: (filter: AchievementFilter) => void;
  onSearchChange: (search: string) => void;
  onRetry: () => void;
  playSound: (type: SoundEffectType) => void;
}

const AchievementSkeleton: React.FC = () => (
  <div className="h-[96px] flex items-center gap-4 animate-pulse p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
    <div className="w-12 h-12 rounded-xl bg-white/10 flex-shrink-0" />
    <div className="flex-1 space-y-2 min-w-0">
      <div className="h-4 w-1/3 bg-white/10 rounded" />
      <div className="h-3 w-1/2 bg-white/10 rounded" />
    </div>
    <div className="w-20 h-6 bg-white/10 rounded-lg flex-shrink-0" />
  </div>
);

const AchievementCard: React.FC<{
  achievement: SteamAchievement;
  lockedLabel: string;
  unlockedLabel: string;
  unlockedAtLabel: string;
  locale: string;
  featured?: boolean;
}> = React.memo(({ achievement, lockedLabel, unlockedLabel, unlockedAtLabel, locale, featured }) => {
  const isAchieved = achievement.achieved;
  const unlockDate = React.useMemo(() => {
    if (!achievement.unlockTime || achievement.unlockTime <= 0) return null;
    try {
      return new Date(achievement.unlockTime * 1000).toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }, [achievement.unlockTime, locale]);

  return (
    <div
      tabIndex={0}
      role="article"
      aria-label={isAchieved ? `${unlockedLabel}: ${achievement.name}` : `${lockedLabel}: ${achievement.name}`}
      className={`flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200 group hover:translate-x-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
        isAchieved
          ? "bg-white/[0.03] border-white/15 hover:border-white/30"
          : "bg-white/[0.01] border-white/5 opacity-60 hover:opacity-80"
      }`}
    >
      <div className="relative shrink-0">
        <div className="h-12 w-12 rounded-xl border border-white/10 overflow-hidden bg-black/40 flex items-center justify-center">
          {achievement.icon || achievement.iconGray ? (
            <img
              src={isAchieved ? achievement.icon : achievement.iconGray || achievement.icon}
              alt=""
              className={`h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 ${
                isAchieved ? "" : "grayscale brightness-50"
              }`}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Trophy className="h-6 w-6 text-white/40" />
          )}
        </div>
        {isAchieved && (
          <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black shadow-sm">
            <Trophy className="h-2.5 w-2.5" fill="currentColor" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="font-bold text-white text-sm truncate">{achievement.name}</h4>
        </div>
        <p className="text-xs text-white/50 line-clamp-2">{achievement.description || lockedLabel}</p>
        {isAchieved && unlockDate && (
          <span className="text-[10px] text-white/40 font-medium block mt-1">
            {unlockedAtLabel} {unlockDate}
          </span>
        )}
      </div>

      <div className="shrink-0 flex items-center">
        <span
          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
            isAchieved
              ? "bg-white/10 text-white border border-white/15"
              : "bg-white/[0.03] text-white/30 border border-white/5"
          }`}
        >
          {isAchieved ? unlockedLabel : lockedLabel}
        </span>
      </div>
    </div>
  );
});

AchievementCard.displayName = "AchievementCard";

export const GameDetailAchievements: React.FC<GameDetailAchievementsProps> = React.memo(({
  achievements,
  isLoading,
  error,
  filter,
  searchQuery,
  copy,
  locale,
  onFilterChange,
  onSearchChange,
  onRetry,
  playSound,
}) => {
  const filteredAchievements = React.useMemo(() => {
    return achievements.filter((ach) => {
      if (filter === "unlocked" && !ach.achieved) return false;
      if (filter === "locked" && ach.achieved) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = ach.name.toLowerCase().includes(q);
        const matchesDesc = (ach.description || "").toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [achievements, filter, searchQuery]);

  const unlockedCount = React.useMemo(
    () => achievements.filter((a) => a.achieved).length,
    [achievements]
  );
  const lockedCount = achievements.length - unlockedCount;

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onFilterChange("all");
              playSound("navigate");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === "all"
                ? "bg-white text-black shadow-md"
                : "bg-white/[0.04] text-white/50 hover:text-white border border-white/5"
            }`}
          >
            {copy.filterAll} ({achievements.length})
          </button>
          <button
            onClick={() => {
              onFilterChange("unlocked");
              playSound("navigate");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === "unlocked"
                ? "bg-white text-black shadow-md"
                : "bg-white/[0.04] text-white/50 hover:text-white border border-white/5"
            }`}
          >
            {copy.filterUnlocked} ({unlockedCount})
          </button>
          <button
            onClick={() => {
              onFilterChange("locked");
              playSound("navigate");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === "locked"
                ? "bg-white text-black shadow-md"
                : "bg-white/[0.04] text-white/50 hover:text-white border border-white/5"
            }`}
          >
            {copy.filterLocked} ({lockedCount})
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={copy.searchPlaceholder}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          <AchievementSkeleton />
          <AchievementSkeleton />
          <AchievementSkeleton />
        </div>
      )}

      {/* Erro com Retry */}
      {!isLoading && error && (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-white/30" />
          <p className="text-sm font-semibold text-white/70 mb-4">{error}</p>
          <button
            onClick={onRetry}
            className="flex items-center gap-2 rounded-xl bg-white/[0.06] border border-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
            {copy.tryAgain}
          </button>
        </div>
      )}

      {/* Jogo sem suporte a conquistas */}
      {!isLoading && !error && achievements.length === 0 && (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <Trophy className="mb-3 h-8 w-8 text-white/20" />
          <p className="text-sm font-bold text-white/70">{copy.achievementsNoSupportTitle}</p>
          <p className="mt-1 text-xs text-white/40 max-w-sm">{copy.achievementsNoSupportDesc}</p>
        </div>
      )}

      {/* Nenhum resultado na busca */}
      {!isLoading && !error && achievements.length > 0 && filteredAchievements.length === 0 && (
        <div className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-black/20 p-6 text-center">
          <Search className="mb-2 h-6 w-6 text-white/30" />
          <p className="text-xs font-semibold text-white/60">{copy.noMatchingAchievements}</p>
        </div>
      )}

      {/* Lista de Conquistas Filtradas */}
      {!isLoading && !error && filteredAchievements.length > 0 && (
        <div className="flex flex-col gap-3">
          {filteredAchievements.map((ach) => (
            <AchievementCard
              key={ach.apiName || ach.name}
              achievement={ach}
              lockedLabel={copy.achievementsLocked}
              unlockedLabel={copy.achievementsUnlocked}
              unlockedAtLabel={copy.achievementsUnlockedAt}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
});

GameDetailAchievements.displayName = "GameDetailAchievements";
