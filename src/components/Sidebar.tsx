import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  User, Star, Gamepad2, Zap, Car, Swords, Trophy, Globe, Crosshair,
  Settings, Users, Newspaper, Laptop, Puzzle, Folder, FolderOpen,
} from "lucide-react";
import {
  GamepadIcon as AnimatedGamepadIcon,
  HammerIcon as AnimatedHammerIcon,
  LaptopIcon as AnimatedLaptopIcon,
  RadioIcon as AnimatedRadioIcon,
  SettingsIcon as AnimatedSettingsIcon,
  StarIcon as AnimatedStarIcon,
  UserIcon as AnimatedUserIcon,
  UsersIcon as AnimatedUsersIcon,
  type AnimatedIconHandle,
  type AnimatedIconProps,
} from "./animated/SidebarIcons";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSteam, faDiscord, faXbox } from "@fortawesome/free-brands-svg-icons";
import {
  PHERIELIUM_LOGO_PATH, EPIC_GAMES_ICON_PATH, EA_GAMES_ICON_PATH,
  UBISOFT_ICON_PATH, GOG_ICON_PATH, RIOT_GAMES_ICON_PATH,
  BATTLENET_ICON_PATH, ROCKSTAR_ICON_PATH,
} from "../constants/assets";
import type { SoundEffectType } from "../hooks/useSoundEffects";
import { type LauncherLanguage } from "../context/PreferencesContext";
import { SIDEBAR_NAVIGATION_GROUPS, SIDEBAR_NAVIGATION_ORDER } from "../services/launcherNavigation";

export const SteamBrandIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => <FontAwesomeIcon icon={faSteam} className={className} style={style as any} />;
export const DiscordBrandIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => <FontAwesomeIcon icon={faDiscord} className={className} style={style as any} />;
export const XboxBrandIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => <FontAwesomeIcon icon={faXbox} className={className} style={style as any} />;

const createMaskIcon = (path: string) => {
  return function MaskIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { color, filter, ...restStyle } = style ?? {};
    return (
      <span
        role="img"
        aria-hidden="true"
        className={className}
        style={{
          ...restStyle,
          display: "inline-block",
          backgroundColor: (color as string) ?? "currentColor",
          WebkitMaskImage: `url(${path})`,
          maskImage: `url(${path})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          filter: filter && filter !== "none" ? (filter as string) : undefined,
        }}
      />
    );
  };
};

export const EpicBrandIcon = createMaskIcon(EPIC_GAMES_ICON_PATH);
export const EaBrandIcon = createMaskIcon(EA_GAMES_ICON_PATH);
export const UbisoftBrandIcon = createMaskIcon(UBISOFT_ICON_PATH);
export const GogBrandIcon = createMaskIcon(GOG_ICON_PATH);
export const RiotBrandIcon = createMaskIcon(RIOT_GAMES_ICON_PATH);
export const BattlenetBrandIcon = createMaskIcon(BATTLENET_ICON_PATH);
export const RockstarBrandIcon = createMaskIcon(ROCKSTAR_ICON_PATH);

// eslint-disable-next-line react-refresh/only-export-components
export const CATEGORIES = [
  { id: "ALL", label: "Todos", Icon: Gamepad2, AnimatedIcon: AnimatedGamepadIcon },
  { id: "FAVORITES", label: "Favoritos", Icon: Star, AnimatedIcon: AnimatedStarIcon },
  { id: "FRIENDS", label: "Amigos", Icon: Users, AnimatedIcon: AnimatedUsersIcon },
  { id: "FEED", label: "Radar", Icon: Newspaper, AnimatedIcon: AnimatedRadioIcon },
  { id: "MODS", label: "Mods", Icon: Puzzle, AnimatedIcon: AnimatedHammerIcon },
  { id: "STEAM", label: "Steam", Icon: SteamBrandIcon },
  { id: "EPIC", label: "Epic", Icon: EpicBrandIcon },
  { id: "EA", label: "EA App", Icon: EaBrandIcon },
  { id: "UBISOFT", label: "Ubisoft", Icon: UbisoftBrandIcon },
  { id: "GOG", label: "GOG", Icon: GogBrandIcon },
  { id: "XBOX", label: "Xbox", Icon: XboxBrandIcon },
  { id: "RIOT", label: "Riot Games", Icon: RiotBrandIcon },
  { id: "BATTLENET", label: "Battle.net", Icon: BattlenetBrandIcon },
  { id: "ROCKSTAR", label: "Rockstar", Icon: RockstarBrandIcon },
  { id: "LOCAL", label: "Local", Icon: Laptop, AnimatedIcon: AnimatedLaptopIcon },
  { id: "PROFILE", label: "Perfil", Icon: User, AnimatedIcon: AnimatedUserIcon },
  { id: "TROPHIES", label: "Troféus", Icon: Trophy },
  { id: "RACING", label: "Corrida", Icon: Car },
  { id: "ROLEPLAYING", label: "RPG", Icon: Swords },
  { id: "SPORTS", label: "Esportes", Icon: Trophy },
  { id: "ONLINE", label: "Online", Icon: Globe },
  { id: "SHOOTER", label: "Tiro", Icon: Crosshair },
  { id: "ACTION", label: "Ação", Icon: Gamepad2 },
  { id: "ADVENTURE", label: "Aventura", Icon: Gamepad2 },
  { id: "HORROR", label: "Terror", Icon: Zap },
  { id: "STRATEGY", label: "Estratégia", Icon: Trophy },
  { id: "FIGHTING", label: "Luta", Icon: Swords },
];

// eslint-disable-next-line react-refresh/only-export-components
export const SIDEBAR_CATEGORIES = CATEGORIES.filter(({ id }) =>
  SIDEBAR_NAVIGATION_ORDER.includes(id as (typeof SIDEBAR_NAVIGATION_ORDER)[number]),
).sort(
  (left, right) => SIDEBAR_NAVIGATION_ORDER.indexOf(left.id as (typeof SIDEBAR_NAVIGATION_ORDER)[number])
    - SIDEBAR_NAVIGATION_ORDER.indexOf(right.id as (typeof SIDEBAR_NAVIGATION_ORDER)[number]),
);

const COLLAPSIBLE_GROUP_KEYS = new Set(["platforms"]);

interface SidebarProps {
  activeCategory: string;
  onCategory: (id: string) => void;
  settingsLabel: string;
  playSound: (t: SoundEffectType) => void;
  notificationCount?: number;
  language?: LauncherLanguage;
  userDisplay?: string;
  userAvatar?: string;
  platformOperations?: any;
}

interface SidebarButtonProps {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  AnimatedIcon?: AnimatedSidebarIcon;
  active: boolean;
  onClick: () => void;
  notificationCount?: number;
  reducedMotion?: boolean;
  rotateOnHover?: boolean;
  isExpanded?: boolean;
  nested?: boolean;
}

type AnimatedSidebarIcon = React.ForwardRefExoticComponent<
  AnimatedIconProps & React.RefAttributes<AnimatedIconHandle>
>;

const SidebarButton: React.FC<SidebarButtonProps> = ({
  id, label, Icon, AnimatedIcon, active, onClick,
  notificationCount = 0, reducedMotion = false,
  rotateOnHover = false, isExpanded = true, nested = false,
}) => {
  const hasNotifications = notificationCount > 0;
  const animatedIconRef = React.useRef<AnimatedIconHandle>(null);
  const animationTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
  }, []);

  const playIconAnimation = () => {
    if (!AnimatedIcon || reducedMotion || animationTimerRef.current) return;
    animatedIconRef.current?.startAnimation();
    animationTimerRef.current = setTimeout(() => {
      animatedIconRef.current?.stopAnimation();
      animationTimerRef.current = null;
    }, 1300);
  };

  // Ícone com cor e brilho seguindo o tema ativo
  const iconStyle = {
    color: active ? "rgb(var(--launcher-accent))" : "rgba(255,255,255,0.4)",
    filter: active ? "drop-shadow(0 0 10px rgb(var(--launcher-accent) / 0.7))" : "none",
    transition: "color 0.3s ease, filter 0.3s ease",
  };

  const iconSizeClass = isExpanded ? (nested ? "h-4 w-4" : "h-[22px] w-[22px]") : "h-6 w-6";

  const buttonContent = (
    <motion.button
      onClick={onClick}
      onMouseEnter={playIconAnimation}
      aria-label={hasNotifications ? `${label}, ${notificationCount} notificações` : label}
      aria-current={active ? "page" : undefined}
      data-sidebar-item={id}
      whileTap={{ scale: 0.97 }}
      className={`relative group flex cursor-pointer items-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50
        ${isExpanded
          // Mac Native Layout: Cantos arredondados (rounded-xl) em vez de pílula (rounded-full)
          ? `w-full ${nested ? "h-9 px-3 gap-3" : "h-[42px] px-3.5 gap-3.5"} rounded-xl text-left`
          : "h-12 w-12 justify-center rounded-[18px]"}
        ${!active ? "hover:bg-white/[0.06]" : ""}`}
      style={{
        // Fundo com tint do accent color ao ativar
        background: active ? "rgb(var(--launcher-accent) / 0.14)" : "transparent",
        boxShadow: active
          ? "0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgb(var(--launcher-accent) / 0.20)"
          : "none",
      }}
    >
      <motion.div
        className={`shrink-0 transform transition-transform duration-500 ease-out 
          ${rotateOnHover && !AnimatedIcon ? "group-hover:rotate-45" : ""}`}
      >
        {AnimatedIcon ? (
          <AnimatedIcon ref={animatedIconRef} size={isExpanded ? (nested ? 16 : 22) : 24} duration={1} className={`${iconSizeClass}`} style={iconStyle} />
        ) : (
          <Icon className={`${iconSizeClass}`} style={iconStyle} />
        )}
      </motion.div>

      {isExpanded && (
        <div className="flex flex-1 items-center justify-between min-w-0">
          <span
            className={`truncate font-body tracking-[0.015em] transition-all duration-300 
              ${nested ? "text-[12.5px]" : "text-[13.5px]"} 
              ${active ? "font-semibold" : "text-white/50 group-hover:text-white/80"}`}
            style={active ? { color: "rgb(var(--launcher-accent))", textShadow: "0 0 8px rgb(var(--launcher-accent) / 0.5)" } : undefined}
          >
            {label}
          </span>
          {hasNotifications && (
            <div className="relative flex items-center justify-center">
              <span
                className="flex h-5 min-w-[20px] items-center justify-center rounded-md border px-1.5 text-[10px] font-bold text-black shadow-[0_0_12px_rgb(var(--launcher-accent)/0.3)] backdrop-blur-md"
                style={{ background: "rgb(var(--launcher-accent))", borderColor: "rgb(var(--launcher-accent) / 0.4)" }}
              >
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            </div>
          )}
        </div>
      )}

      {!isExpanded && hasNotifications && (
        <div
          className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full"
          style={{ background: "rgb(var(--launcher-accent))", boxShadow: "0 0 8px rgb(var(--launcher-accent) / 1)" }}
        />
      )}
    </motion.button>
  );

  if (!isExpanded) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex w-full justify-center">{buttonContent}</span>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" sideOffset={16} className="border border-white/10 bg-[#121214]/80 px-3 py-1.5 text-xs text-white/90 tracking-wide backdrop-blur-2xl rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return buttonContent;
};

const Sidebar: React.FC<SidebarProps> = ({
  activeCategory, onCategory, settingsLabel, playSound, notificationCount = 0, language = "pt-BR",
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem("checkpoint_sidebar_expanded") !== "false"; }
    catch { return true; }
  });

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("checkpoint_sidebar_groups") || '{"platforms": false}'); }
    catch { return { platforms: false }; }
  });

  const toggleExpand = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    try { localStorage.setItem("checkpoint_sidebar_expanded", String(next)); } catch { void 0; }
    playSound("navigate");
    window.dispatchEvent(new CustomEvent("checkpoint:sidebar-toggle", { detail: { expanded: next } }));
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("checkpoint_sidebar_groups", JSON.stringify(next)); } catch { void 0; }
      return next;
    });
    playSound("navigate");
  };

  const sidebarLabels: Record<string, string> = {
    ALL: { "pt-BR": "Todos os Jogos", "en-US": "All Games", "es-ES": "Todos los juegos", "fr-FR": "Tous les jeux", "de-DE": "Alle Spiele", "it-IT": "Tutti i giochi" }[language],
    FAVORITES: { "pt-BR": "Favoritos", "en-US": "Favorites", "es-ES": "Favoritos", "fr-FR": "Favoris", "de-DE": "Favoriten", "it-IT": "Preferiti" }[language],
    FRIENDS: { "pt-BR": "Amigos", "en-US": "Friends", "es-ES": "Amigos", "fr-FR": "Amis", "de-DE": "Freunde", "it-IT": "Amici" }[language],
    FEED: { "pt-BR": "Radar Gamer", "en-US": "Gaming Radar", "es-ES": "Radar Gamer", "fr-FR": "Radar Gamer", "de-DE": "Gaming Radar", "it-IT": "Radar Gamer" }[language],
    MODS: "Gerenciador de Mods",
    STEAM: "Steam", EPIC: "Epic Games",
    LOCAL: { "pt-BR": "Jogos Locais", "en-US": "Local Games", "es-ES": "Juegos Locales", "fr-FR": "Jeux Locaux", "de-DE": "Lokale Spiele", "it-IT": "Giochi Locali" }[language],
    PROFILE: { "pt-BR": "Perfil", "en-US": "Profile", "es-ES": "Perfil", "fr-FR": "Profil", "de-DE": "Profil", "it-IT": "Profilo" }[language],
  };

  const groupLabels: Record<string, string> = {
    filters: { "pt-BR": "MENU", "en-US": "MENU", "es-ES": "MENÚ", "fr-FR": "MENU", "de-DE": "MENÜ", "it-IT": "MENU" }[language],
    platforms: { "pt-BR": "PLATAFORMAS", "en-US": "PLATFORMS", "es-ES": "PLATAFORMAS", "fr-FR": "PLATEFORMES", "de-DE": "PLATTFORMEN", "it-IT": "PIATTAFORME" }[language],
    community: { "pt-BR": "SOCIAL", "en-US": "SOCIAL", "es-ES": "SOCIAL", "fr-FR": "SOCIAL", "de-DE": "SOZIAL", "it-IT": "SOCIAL" }[language],
    mods: { "pt-BR": "FERRAMENTAS", "en-US": "TOOLS", "es-ES": "HERRAMIENTAS", "fr-FR": "OUTILS", "de-DE": "WERKZEUGE", "it-IT": "STRUMENTI" }[language],
  };

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      // Generous Negative Space: Sidebar mais larga (280px)
      className="fixed left-4 top-4 bottom-4 z-50 flex flex-col pointer-events-none transition-[width] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu"
      style={{ width: isExpanded ? 280 : 88 }}
    >
      <div
        className="pointer-events-auto flex-1 flex flex-col py-6 px-4 min-h-0 rounded-[28px] border border-white/[0.08]"
        style={{
          // Frosted Glassmorphism - Deep Charcoal / Obsidian
          background: "linear-gradient(145deg, rgba(20,20,22,0.55) 0%, rgba(10,10,12,0.7) 100%)",
          backdropFilter: "blur(48px) saturate(160%)",
          WebkitBackdropFilter: "blur(48px) saturate(160%)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.06)",
        }}
      >
        <div
          onClick={toggleExpand}
          role="button"
          tabIndex={0}
          className={`relative mb-8 flex items-center cursor-pointer group p-1 transition-all duration-300 ${isExpanded ? "justify-start gap-4 px-1" : "justify-center"}`}
        >
          <div className="relative w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.05] border border-white/[0.1] shadow-[0_4px_16px_rgba(0,0,0,0.2)] group-hover:bg-white/[0.08] group-hover:shadow-[0_4px_20px_rgba(255,255,255,0.05)] transition-all duration-300 shrink-0">
            <img src={PHERIELIUM_LOGO_PATH} alt="Pherielium" className="h-[22px] w-[22px] object-contain grayscale brightness-200 opacity-90 group-hover:opacity-100 transition-opacity" />
          </div>
          {isExpanded && (
            <div className="flex flex-1 items-center min-w-0">
              <span className="font-display font-medium text-[15px] text-white tracking-[0.2em] uppercase drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">
                Pherielium
              </span>
            </div>
          )}
        </div>

        <nav aria-label="Navegação principal" className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain no-scrollbar gap-6">
          {SIDEBAR_NAVIGATION_GROUPS.map((group) => {
            const isCollapsible = COLLAPSIBLE_GROUP_KEYS.has(group.key);
            const isOpen = !isCollapsible || Boolean(expandedGroups[group.key]);
            const items = group.ids
              .map((id) => SIDEBAR_CATEGORIES.find((item) => item.id === id))
              .filter((item): item is (typeof SIDEBAR_CATEGORIES)[number] => Boolean(item));

            return (
              <div key={group.key} role="group" className="flex w-full flex-col gap-1.5">
                {isExpanded && (
                  isCollapsible ? (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex items-center gap-3 px-2 w-full py-1.5 transition-colors duration-300 hover:bg-white/[0.04] rounded-lg group/folder"
                      aria-expanded={isOpen}
                    >
                      <motion.span className="flex items-center justify-center shrink-0 text-white/30 group-hover/folder:text-white/60 transition-colors">
                        {isOpen ? <FolderOpen className="h-[14px] w-[14px]" /> : <Folder className="h-[14px] w-[14px]" />}
                      </motion.span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40 font-body group-hover/folder:text-white/80 transition-colors">
                        {groupLabels[group.key]}
                      </span>
                    </button>
                  ) : (
                    <span className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/30 font-body">
                      {groupLabels[group.key]}
                    </span>
                  )
                )}

                <AnimatePresence initial={false}>
                  {(isOpen || !isExpanded) && (
                    <motion.div
                      initial={isCollapsible && isExpanded ? { height: 0, opacity: 0 } : false}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className={`overflow-hidden ${isCollapsible && isExpanded ? "relative pl-3" : ""}`}
                    >
                      {isCollapsible && isExpanded && (
                        <div className="absolute left-4 top-2 bottom-2 w-[1px] bg-white/[0.08]" />
                      )}
                      <div className="flex flex-col gap-1">
                        {items.map((category) => (
                          <SidebarButton
                            key={category.id}
                            id={category.id}
                            label={sidebarLabels[category.id] || category.label}
                            Icon={category.Icon}
                            AnimatedIcon={category.AnimatedIcon}
                            active={activeCategory === category.id}
                            onClick={() => { onCategory(category.id); playSound("showModal"); }}
                            notificationCount={category.id === "FRIENDS" ? notificationCount : 0}
                            reducedMotion={Boolean(prefersReducedMotion)}
                            isExpanded={isExpanded}
                            nested={isCollapsible && isExpanded}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* Separador inferior com gradient sutil */}
        <div className="w-full h-[1px] mt-4 mb-4 shrink-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        <div className="w-full flex flex-col gap-1 shrink-0">
          <SidebarButton
            id="SETTINGS"
            label={settingsLabel}
            Icon={Settings}
            AnimatedIcon={AnimatedSettingsIcon}
            active={activeCategory === "SETTINGS"}
            onClick={() => { onCategory("SETTINGS"); playSound("showModal"); }}
            reducedMotion={Boolean(prefersReducedMotion)}
            rotateOnHover
            isExpanded={isExpanded}
          />
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;