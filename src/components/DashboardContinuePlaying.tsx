import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Gamepad2, ArrowRight } from "lucide-react";
import type { Game } from "../types/domain";
import { formatPlayedHours, getGamePlayedHours } from "../utils/playtime";
import {
  SteamBrandIcon,
  EpicBrandIcon,
  XboxBrandIcon,
  EaBrandIcon,
  UbisoftBrandIcon,
  GogBrandIcon,
  RiotBrandIcon,
  BattlenetBrandIcon,
  RockstarBrandIcon,
} from "./Sidebar";
import { useGameColor } from "../hooks/useGameColor";

interface DashboardContinuePlayingProps {
  continuePlayingGames: Game[];
  onPlayGame: (game: Game) => void;
  onOpenDetails?: (game: Game) => void;
  playSound?: (sound: any) => void;
}

const STANDARD_SPRING = {
  type: "spring" as const,
  bounce: 0,
  duration: 0.4,
};

// How far the cover pops above the card's top edge, and the card's own height.
// The article's total height (COVER_HEIGHT) already accounts for the overhang,
// so nothing here ever exceeds the row's scroll box and gets clipped.
const CARD_HEIGHT = 130;
const OVERHANG = 46;
const COVER_WIDTH = 122;
const COVER_HEIGHT = CARD_HEIGHT + OVERHANG; // 176
const COVER_LEFT = 18;
const TEXT_OFFSET = COVER_LEFT + COVER_WIDTH + 18; // reserved space so text never sits under the cover

const getPlatformInfo = (launcherType?: string) => {
  const iconClass = "h-3.5 w-3.5 text-white/78";

  switch (launcherType?.toLowerCase()) {
    case "steam":
      return { label: "Steam", icon: <SteamBrandIcon className={iconClass} /> };
    case "epic":
      return { label: "Epic", icon: <EpicBrandIcon className={iconClass} /> };
    case "ea":
      return { label: "EA App", icon: <EaBrandIcon className={iconClass} /> };
    case "ubisoft":
      return { label: "Ubisoft", icon: <UbisoftBrandIcon className={iconClass} /> };
    case "gog":
      return { label: "GOG", icon: <GogBrandIcon className={iconClass} /> };
    case "xbox":
      return { label: "Xbox", icon: <XboxBrandIcon className={iconClass} /> };
    case "riot":
      return { label: "Riot", icon: <RiotBrandIcon className={iconClass} /> };
    case "battlenet":
      return { label: "Battle.net", icon: <BattlenetBrandIcon className={iconClass} /> };
    case "rockstar":
      return { label: "Rockstar", icon: <RockstarBrandIcon className={iconClass} /> };
    default:
      return { label: "Local", icon: <Gamepad2 className={iconClass} /> };
  }
};

const ContinueCard: React.FC<{
  game: Game;
  index: number;
  onPlay: () => void;
  onOpenDetails: () => void;
  playSound?: (sound: any) => void;
}> = ({ game, index, onPlay, playSound }) => {
  const prefersReducedMotion = useReducedMotion();
  const hours = getGamePlayedHours(game);
  const platform = useMemo(() => getPlatformInfo(game.launcherType), [game.launcherType]);

  const coverArt = game.cardImage || game.image;
  const dominantColor = useGameColor(coverArt);

  const enterTransition = prefersReducedMotion
    ? { duration: 0.12 }
    : { ...STANDARD_SPRING, delay: Math.min(index * 0.035, 0.14) };

  const accentColor =
    dominantColor?.hex && dominantColor.hex !== "#ffffff" && dominantColor.hex !== "rgba(255,255,255,1)"
      ? dominantColor.hex
      : null;

  return (
    <motion.article
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 15 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={enterTransition}
      onClick={onPlay}
      onPointerEnter={() => playSound?.("hover")}
      className="group relative w-[400px] shrink-0 cursor-pointer"
      style={{ height: COVER_HEIGHT, scrollSnapAlign: "start" }}
      aria-label={`Continuar jogando ${game.title}`}
    >
      {/* Card background — sits BELOW the cover's overhang, own overflow-hidden
          only clips the gradient, never the cover (which is a sibling, not a child) */}
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden border shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12)]"
        style={{
          height: CARD_HEIGHT,
          borderRadius: 24, /* Squircle */
          borderColor: "rgba(255,255,255,0.08)",
          background: accentColor
            ? `linear-gradient(120deg, ${accentColor.replace("rgb", "rgba").replace(")", ", 0.25)")} 0%, var(--color-surface) 100%)`
            : "linear-gradient(120deg, rgba(255,255,255,0.06) 0%, var(--color-surface) 100%)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
        }}
      />

      {/* Text — reserved offset guarantees it never sits under the cover and never truncates */}
      <div
        className="absolute bottom-0 right-4 flex flex-col justify-center gap-1.5"
        style={{ height: CARD_HEIGHT, left: TEXT_OFFSET }}
      >
        <h3 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-white/90 drop-shadow-sm transition-colors group-hover:text-white">
          {game.title}
        </h3>
        <p className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-white/50">
          <span className="shrink-0">{hours > 0 ? `${formatPlayedHours(hours)}h` : "Recente"}</span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
          <span className="flex shrink-0 items-center gap-1">{platform.label}</span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
          <span className="shrink-0 text-[rgb(var(--launcher-accent))]">Último Jogo</span>
        </p>
      </div>

      {/* Cover — pops above the card, but stays inside the article's own box,
          so the scroll container's overflow-x never clips it */}
      <motion.div
        whileHover={{ y: -4, scale: 1.05 }}
        transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
        className="absolute top-0 z-10 overflow-hidden rounded-[16px] border border-white/10 bg-[#0f1115] shadow-[0_16px_32px_rgba(0,0,0,0.6)]"
        style={{ left: COVER_LEFT, width: COVER_WIDTH, height: COVER_HEIGHT - 12 }}
      >
        {coverArt ? (
          <img src={coverArt} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gamepad2 className="h-8 w-8 text-white/20" />
          </div>
        )}
      </motion.div>
    </motion.article>
  );
};

export const DashboardContinuePlaying: React.FC<DashboardContinuePlayingProps> = ({
  continuePlayingGames,
  onPlayGame,
  onOpenDetails,
  playSound,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (continuePlayingGames.length === 0) return null;
  const displayGames = continuePlayingGames.slice(0, 5);

  return (
    <section aria-label="Continuar jogando" className="px-10 pb-4">
      <div className="mb-16 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
            Retomar
          </p>
          <h2 className="mt-1 text-[18px] font-semibold leading-[1.1] tracking-[-0.02em] text-white/88">
            Continuar jogando
          </h2>
        </div>

        <span className="text-[10.5px] font-medium text-white/34">
          {continuePlayingGames.length} {continuePlayingGames.length === 1 ? "jogo" : "jogos"}
        </span>
      </div>

      {/* No pt- hack needed: the cover's overhang is inside each article's own
          height, so overflow-x-auto here never clips it top or bottom. */}
      <motion.div
        className="no-scrollbar -ml-[12px] flex gap-[24px] overflow-x-auto overscroll-x-contain pb-4 pl-[12px]"
        style={{ scrollSnapType: "x proximity" }}
        initial={false}
        animate={{ opacity: 1 }}
        transition={prefersReducedMotion ? { duration: 0.12 } : STANDARD_SPRING}
      >
        {displayGames.map((game, index) => (
          <ContinueCard
            key={game.id}
            game={game}
            index={index}
            onPlay={() => onPlayGame(game)}
            onOpenDetails={() => onOpenDetails?.(game) ?? onPlayGame(game)}
            playSound={playSound}
          />
        ))}

        {continuePlayingGames.length > 5 && (
          <motion.div
            className="flex shrink-0 items-end justify-center"
            style={{ width: 122, height: COVER_HEIGHT, paddingBottom: (CARD_HEIGHT - 64) / 2 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          >
            <button
              className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-3 rounded-full border border-white/[0.08] bg-[#1C1C1E]/75 text-white/50 shadow-[0_16px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:text-white"
              style={{ backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)" }}
              title="Ver mais jogos"
              onClick={() => playSound?.("select")}
            >
              <ArrowRight className="h-6 w-6" />
            </button>
          </motion.div>
        )}
      </motion.div>
    </section>
  );
};

export default React.memo(DashboardContinuePlaying);