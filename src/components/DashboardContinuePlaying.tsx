import React from "react";
import { motion } from "framer-motion";
import { Clock, Play, Star, Trophy, Zap } from "lucide-react";
import type { Game } from "../types/domain";
import { formatPlayedHours, getGamePlayedHours } from "../utils/playtime";

interface DashboardContinuePlayingProps {
  continuePlayingGames: Game[];
  onPlayGame: (game: Game) => void;
  playSound?: (sound: any) => void;
}

const platformBadge = (launcherType?: string) => {
  switch (launcherType) {
    case "steam": return { label: "Steam", color: "bg-[#1a9fff]/20 text-[#1a9fff] border-[#1a9fff]/30" };
    case "epic": return { label: "Epic", color: "bg-white/10 text-white/80 border-white/15" };
    case "ea": return { label: "EA", color: "bg-[#f0951e]/20 text-[#f0951e] border-[#f0951e]/30" };
    case "ubisoft": return { label: "Ubisoft", color: "bg-[#00a4ef]/20 text-[#00a4ef] border-[#00a4ef]/30" };
    case "gog": return { label: "GOG", color: "bg-[#a1359c]/20 text-[#a1359c] border-[#a1359c]/30" };
    case "xbox": return { label: "Xbox", color: "bg-[#107c10]/20 text-[#107c10] border-[#107c10]/30" };
    case "riot": return { label: "Riot", color: "bg-[#d32936]/20 text-[#d32936] border-[#d32936]/30" };
    case "battlenet": return { label: "Battle.net", color: "bg-[#00aeef]/20 text-[#00aeef] border-[#00aeef]/30" };
    case "rockstar": return { label: "Rockstar", color: "bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/30" };
    default: return { label: "Local", color: "bg-white/8 text-white/50 border-white/10" };
  }
};

const ContinueCard: React.FC<{
  game: Game;
  index: number;
  onPlay: () => void;
  playSound?: (sound: any) => void;
  featured?: boolean;
}> = ({ game, index, onPlay, playSound, featured = false }) => {
  const hours = getGamePlayedHours(game);
  const badge = platformBadge(game.launcherType);
  const totalAch = game.totalAchievements || 0;
  const achievementPct = totalAch > 0
    ? Math.round(((game.completedAchievements || 0) / totalAch) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090b10]/90 backdrop-blur-xl transition-all duration-300 hover:border-white/25 hover:bg-[#0f121a] hover:shadow-[0_12px_40px_rgba(0,0,0,0.7),0_0_24px_rgba(255,255,255,0.06)] hover:-translate-y-1 ${
        featured ? "w-[340px] h-[196px]" : "w-[230px] h-[146px]"
      }`}
      onMouseEnter={() => playSound?.("hover")}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      aria-label={`Continuar jogando ${game.title}`}
    >
      {/* Background Artwork */}
      <div className="absolute inset-0 z-0">
        {(game.backgroundImage || game.image || game.cardImage) && (
          <img
            src={game.backgroundImage || game.cardImage || game.image}
            alt=""
            className="h-full w-full object-cover opacity-35 transition-all duration-500 group-hover:opacity-55 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-[#090b10]/60 to-transparent" />
      </div>

      {/* Top Meta Badges - Concentric R_inner (8px) = R_outer (16px) - Padding (8px optical) */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider backdrop-blur-md shadow-sm ${badge.color}`}>
          {badge.label}
        </span>

        <div className="flex items-center gap-1.5">
          {game.isFavorite && (
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-black/60 border border-white/15 backdrop-blur-md shadow-sm">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            </div>
          )}
          {achievementPct > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/60 px-2 py-0.5 text-[9.5px] font-bold text-white/80 backdrop-blur-md shadow-sm">
              <Trophy className="h-2.5 w-2.5 text-amber-400" /> {achievementPct}%
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end p-4 pointer-events-none">
        <h3 className={`font-display font-bold text-white tracking-tight leading-snug line-clamp-1 drop-shadow-md ${featured ? "text-base md:text-lg" : "text-sm"}`}>
          {game.title}
        </h3>

        <div className="mt-1 flex items-center justify-between text-xs text-white/50 font-body">
          <div className="flex items-center gap-2">
            {hours > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-white/40" /> {formatPlayedHours(hours)}h
              </span>
            )}
            {game.category && (
              <span className="text-white/35">• {game.category}</span>
            )}
          </div>
        </div>

        {/* Goal-Gradient Progress Bar (Laws of UX) */}
        {totalAch > 0 && (
          <div className="mt-2 w-full h-1 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
              style={{ width: `${achievementPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Floating Play Action Icon on Hover */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-20 pointer-events-none">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.4)] transition-transform duration-200 group-hover:scale-105">
          <Play className="h-4 w-4 fill-black ml-0.5" />
        </div>
      </div>
    </motion.div>
  );
};

const DashboardContinuePlaying: React.FC<DashboardContinuePlayingProps> = ({
  continuePlayingGames,
  onPlayGame,
  playSound,
}) => {
  if (continuePlayingGames.length === 0) {
    return null;
  }

  return (
    <section aria-label="Continuar Jogando" className="px-10 pb-5">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/50 font-body">
          Continuar Jogando
        </h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
        {continuePlayingGames.map((game, index) => (
          <ContinueCard
            key={game.id}
            game={game}
            index={index}
            onPlay={() => onPlayGame(game)}
            playSound={playSound}
            featured={index === 0}
          />
        ))}
      </div>
    </section>
  );
};

export default DashboardContinuePlaying;
