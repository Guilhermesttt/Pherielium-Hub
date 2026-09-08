import React, { useState, useMemo, useCallback } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Play, Star, Gamepad2 } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSteam } from "@fortawesome/free-brands-svg-icons";
import {
  EpicBrandIcon,
  EaBrandIcon,
  UbisoftBrandIcon,
  GogBrandIcon,
  XboxBrandIcon,
  RiotBrandIcon,
  BattlenetBrandIcon,
  RockstarBrandIcon,
} from "./Sidebar";

export interface GameCardProps {
  title: string;
  image?: string;
  isActive: boolean;
  isSteam?: boolean;
  isEpic?: boolean;
  launcherType?: string;
  steamAppId?: number;
  isFavorite?: boolean;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const EPIC_GAMES_ICON_PATH = "/epic_games_store.ico";
const FALLBACK_CARD_BACKGROUND = "linear-gradient(180deg, #161820 0%, #08090C 100%)";
const CARD_WIDTH = 168;
const CARD_HEIGHT = 252;
const CARD_FRAME_WIDTH = 178;
const CARD_FRAME_HEIGHT = 264;

const GameCard: React.FC<GameCardProps> = ({
  title,
  image,
  isActive,
  isSteam,
  isEpic,
  launcherType,
  steamAppId,
  isFavorite = false,
  onClick,
  onKeyDown,
  onContextMenu,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [useFallbackSteamUrl, setUseFallbackSteamUrl] = useState(false);

  const currentImageSrc = useMemo(() => {
    if (steamAppId && !imageFailed) {
      if (useFallbackSteamUrl) {
        return `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_600x900.jpg`;
      }
      return image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_600x900.jpg`;
    }
    return image || "";
  }, [steamAppId, imageFailed, useFallbackSteamUrl, image]);

  const hasAllFailed = imageFailed || !currentImageSrc;

  const handleImageError = useCallback(() => {
    if (steamAppId && !useFallbackSteamUrl) {
      setUseFallbackSteamUrl(true);
    } else {
      setImageFailed(true);
    }
  }, [steamAppId, useFallbackSteamUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
      onKeyDown?.(e);
    },
    [onClick, onKeyDown],
  );

  const platformBadge = useMemo(() => {
    const type = (launcherType || "").toLowerCase() || (isSteam ? "steam" : isEpic ? "epic" : "local");
    const badgeStyle = {
      color: "#FFFFFF",
      border: "rgba(255, 255, 255, 0.2)",
      background: "rgba(18, 20, 26, 0.92)",
    };

    if (type === "steam") {
      return {
        label: "Steam",
        ...badgeStyle,
        icon: <FontAwesomeIcon icon={faSteam} className="h-3 w-3 text-white" />,
      };
    }

    if (type === "epic") {
      return {
        label: "Epic",
        ...badgeStyle,
        icon: <EpicBrandIcon className="h-3 w-3 text-white" />,
      };
    }

    if (type === "ea") {
      return {
        label: "EA",
        ...badgeStyle,
        icon: <EaBrandIcon className="h-3 w-3 text-white" />,
      };
    }

    if (type === "ubisoft") {
      return {
        label: "Ubisoft",
        ...badgeStyle,
        icon: <UbisoftBrandIcon className="h-3 w-3 text-white" />,
      };
    }

    if (type === "gog") {
      return {
        label: "GOG",
        ...badgeStyle,
        icon: <GogBrandIcon className="h-3 w-3 text-white" />,
      };
    }

    if (type === "xbox") {
      return {
        label: "Xbox",
        ...badgeStyle,
        icon: <XboxBrandIcon className="h-3 w-3 text-white" />,
      };
    }

    if (type === "riot") {
      return {
        label: "Riot",
        ...badgeStyle,
        icon: <RiotBrandIcon className="h-3 w-3 text-white" />,
      };
    }

    if (type === "battlenet") {
      return {
        label: "B.net",
        ...badgeStyle,
        icon: <BattlenetBrandIcon className="h-3 w-3 text-white" />,
      };
    }

    if (type === "rockstar") {
      return {
        label: "Rockstar",
        ...badgeStyle,
        icon: <RockstarBrandIcon className="h-3 w-3 text-white" />,
      };
    }

    return {
      label: "Local",
      ...badgeStyle,
      icon: <Gamepad2 className="h-3 w-3 text-white" />,
    };
  }, [isEpic, isSteam, launcherType]);

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      aria-label={title}
      aria-pressed={isActive}
      data-game-card={true}
      className="group relative flex items-center justify-center p-0 text-left select-none focus:outline-none cursor-pointer"
      style={{
        width: CARD_FRAME_WIDTH,
        height: CARD_FRAME_HEIGHT,
      }}
    >
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
        }}
        className={`relative isolate rounded-2xl bg-[#090A0D] border transform-gpu will-change-transform flex flex-col justify-between transition-all duration-200 ease-out ${
          isActive
            ? "scale-[1.05] -translate-y-2 border-white/80 ring-2 ring-white/70 shadow-[0_0_40px_rgba(255,255,255,0.45),0_25px_60px_rgba(0,0,0,0.95)] z-20"
            : "scale-95 border-white/[0.08] hover:border-white/25 hover:scale-[0.98] shadow-[0_10px_28px_rgba(0,0,0,0.7)] hover:shadow-[0_15px_36px_rgba(0,0,0,0.85)] z-10"
        }`}
      >
        {/* Clip container isolado - borda arredondada fica aqui, fora do layer de transform 3D */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl isolate">
          {/* Full-Bleed Cover Image Artwork */}
          {hasAllFailed ? (
            <div
              className="absolute inset-0 flex items-center justify-center p-5 text-center"
              style={{ background: FALLBACK_CARD_BACKGROUND }}
            >
              <span className="line-clamp-3 text-xs font-display font-medium text-white/70">
                {title}
              </span>
            </div>
          ) : (
            <img
              src={currentImageSrc}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={handleImageError}
            />
          )}

          {/* Cinematic Vignette Overlay (Darker at bottom for text contrast) */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/20 pointer-events-none" />

          {/* Ambient Gloss Highlight on Top Edge */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />
        </div>

        {/* Top Badges (Platform & Favorite) */}
        <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between pointer-events-none">
          {platformBadge && (
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 shadow-md backdrop-blur-md"
              style={{
                background: platformBadge.background,
                border: `1px solid ${platformBadge.border}`,
              }}
            >
              {platformBadge.icon}
              <span className="text-[10.5px] font-semibold tracking-tight text-white">
                {platformBadge.label}
              </span>
            </div>
          )}

          {isFavorite && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16171c]/95 border border-white/20 backdrop-blur-md shadow-md">
              <Star className="h-3 w-3 fill-white text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
            </div>
          )}
        </div>

        {/* Central Interactive Play/Action Indicator */}
        <div
          className={`absolute inset-0 z-20 flex items-center justify-center pointer-events-none transition-all duration-300 ${
            isActive
              ? "opacity-100 scale-100"
              : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-95"
          }`}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 border border-white/40 backdrop-blur-xl shadow-[0_0_24px_rgba(255,255,255,0.3)] transition-transform duration-200 group-hover:scale-110">
            <Play className="h-4 w-4 fill-white text-white ml-0.5" />
          </div>
        </div>

        {/* Bottom Title and Source Metadata (Ultra Clean) */}
        <div className="relative z-20 mt-auto p-4 flex flex-col justify-end pointer-events-none">
          <h3 className="line-clamp-2 text-sm font-display font-semibold text-white tracking-tight leading-snug drop-shadow-md">
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] font-body text-white/50 line-clamp-1 drop-shadow-sm">
            {platformBadge?.label || "Jogo"} • Pherielium
          </p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(GameCard);
