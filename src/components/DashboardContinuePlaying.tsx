import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Gamepad2 } from "lucide-react";
import type { Game } from "../types/domain";
import { formatPlayedHours, getGamePlayedHours } from "../utils/playtime";
import {
  SteamBrandIcon,
  EpicBrandIcon,
  XboxBrandIcon,
  EaBrandIcon,
  UbisoftBrandIcon,
  GogBrandIcon,
  BattlenetBrandIcon,
  RockstarBrandIcon,
} from "./Sidebar";

interface DashboardContinuePlayingProps {
  continuePlayingGames: Game[];
  onPlayGame: (game: Game) => void;
  onOpenDetails?: (game: Game) => void;
  playSound?: (sound: any) => void;
}

const getPlatformInfo = (launcherType?: string) => {
  switch (launcherType?.toLowerCase()) {
    case "steam":
      return {
        label: "Steam",
        icon: <SteamBrandIcon className="w-3.5 h-3.5 text-white/70" />,
      };
    case "epic":
      return {
        label: "Epic",
        icon: <EpicBrandIcon className="w-3.5 h-3.5 text-white/70" />,
      };
    case "ea":
      return {
        label: "EA App",
        icon: <EaBrandIcon className="w-3.5 h-3.5 text-white/70" />,
      };
    case "ubisoft":
      return {
        label: "Ubisoft",
        icon: <UbisoftBrandIcon className="w-3.5 h-3.5 text-white/70" />,
      };
    case "gog":
      return {
        label: "GOG",
        icon: <GogBrandIcon className="w-3.5 h-3.5 text-white/70" />,
      };
    case "xbox":
      return {
        label: "Xbox",
        icon: <XboxBrandIcon className="w-3.5 h-3.5 text-white/70" />,
      };
    case "battlenet":
      return {
        label: "Battle.net",
        icon: <BattlenetBrandIcon className="w-3.5 h-3.5 text-white/70" />,
      };
    case "rockstar":
      return {
        label: "Rockstar",
        icon: <RockstarBrandIcon className="w-3.5 h-3.5 text-white/70" />,
      };
    default:
      return {
        label: "Local",
        icon: <Gamepad2 className="w-3.5 h-3.5 text-white/70" />,
      };
  }
};

const ContinueCard: React.FC<{
  game: Game;
  index: number;
  onPlay: () => void;
  onOpenDetails: () => void;
  playSound?: (sound: any) => void;
}> = ({ game, index, onPlay, onOpenDetails, playSound }) => {
  const hours = getGamePlayedHours(game);
  const platform = getPlatformInfo(game.launcherType);
  const totalAch = game.totalAchievements || 0;
  const achievementPct =
    totalAch > 0 ? Math.round(((game.completedAchievements || 0) / totalAch) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="group relative shrink-0 overflow-hidden rounded-[36px] border border-white/10 bg-[#0c0d12]/90 backdrop-blur-3xl p-6 flex flex-col justify-between items-center text-center transition-all duration-300 hover:border-white/25 hover:shadow-[0_24px_60px_rgba(0,0,0,0.85)] hover:-translate-y-1 w-[360px] h-[230px]"
      onMouseEnter={() => playSound?.("hover")}
      role="article"
      aria-label={`Continuar jogando ${game.title}`}
    >
      {/* Artwork de Fundo com Blur e Vinheta Cinematográfica */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {(game.backgroundImage || game.image || game.cardImage) && (
          <img
            src={game.backgroundImage || game.cardImage || game.image}
            alt=""
            className="h-full w-full object-cover opacity-20 filter blur-[2px] transition-all duration-500 group-hover:scale-105 group-hover:opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d12] via-[#0c0d12]/75 to-[#0c0d12]/50" />
      </div>

      {/* Conteúdo Central */}
      <div className="relative z-10 flex flex-col justify-between items-center h-full w-full select-none">
        {/* Top Glyph / Símbolo Delicado */}
        <div className="flex items-center justify-center pt-0.5">
          <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center bg-white/[0.04]">
            <Sparkles className="w-2.5 h-2.5 text-white/60" />
          </div>
        </div>

        {/* Título Principal */}
        <h3 className="font-display font-semibold text-lg md:text-xl text-white tracking-tight line-clamp-1 drop-shadow-md w-full px-2">
          {game.title}
        </h3>

        {/* 3 Colunas de Metadados (Estilo Imagem 4: RUNTIME / YEAR / DIRECTOR) */}
        <div className="grid grid-cols-3 w-full gap-2 px-1 text-center my-1">
          <div>
            <span className="block text-[9.5px] font-semibold text-white/40 uppercase tracking-widest font-mono">
              TEMPO
            </span>
            <span className="block text-xs font-semibold text-white/90 truncate mt-0.5">
              {hours > 0 ? `${formatPlayedHours(hours)}h` : "Recente"}
            </span>
          </div>

          <div>
            <span className="block text-[9.5px] font-semibold text-white/40 uppercase tracking-widest font-mono">
              PLATAFORMA
            </span>
            <span className="block text-xs font-semibold text-white/90 truncate mt-0.5">
              {platform.label}
            </span>
          </div>

          <div>
            <span className="block text-[9.5px] font-semibold text-white/40 uppercase tracking-widest font-mono">
              CONQUISTAS
            </span>
            <span className="block text-xs font-semibold text-white/90 truncate mt-0.5">
              {totalAch > 0 ? `${achievementPct}%` : "Em breve"}
            </span>
          </div>
        </div>

        {/* Logos / Ícones da Plataforma (Centralizados) */}
        <div className="flex items-center justify-center gap-3 text-white/50 h-5">
          {platform.icon}
        </div>

        {/* Botões de Ação Pílula (Estilo Imagem 4: Watch / Save) */}
        <div className="flex items-center justify-center gap-3 w-full pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            onMouseEnter={() => playSound?.("hover")}
            className="flex-1 py-2 px-6 rounded-full bg-white text-black font-semibold text-xs tracking-wide shadow-md hover:bg-white/90 active:scale-95 transition-all cursor-pointer"
          >
            Jogar
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails();
            }}
            onMouseEnter={() => playSound?.("hover")}
            className="flex-1 py-2 px-6 rounded-full bg-white/20 hover:bg-white/30 text-white font-medium text-xs tracking-wide border border-white/10 backdrop-blur-md active:scale-95 transition-all cursor-pointer"
          >
            Detalhes
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export const DashboardContinuePlaying: React.FC<DashboardContinuePlayingProps> = ({
  continuePlayingGames,
  onPlayGame,
  onOpenDetails,
  playSound,
}) => {
  if (continuePlayingGames.length === 0) {
    return null;
  }

  return (
    <section aria-label="Continuar Jogando" className="px-10 pb-5">
      <div className="flex gap-5 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
        {continuePlayingGames.map((game, index) => (
          <ContinueCard
            key={game.id}
            game={game}
            index={index}
            onPlay={() => onPlayGame(game)}
            onOpenDetails={() => onOpenDetails?.(game) ?? onPlayGame(game)}
            playSound={playSound}
          />
        ))}
      </div>
    </section>
  );
};

export default DashboardContinuePlaying;
