import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clock, ExternalLink, Gamepad2, Layers, Lock, Pencil, Search, Star, Trophy, TrendingUp, User } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord, faSteam } from "@fortawesome/free-brands-svg-icons";
import { EPIC_GAMES_ICON_PATH } from "../constants/assets";
import type { LauncherLanguage } from "../context/PreferencesContext";
import type { Game, UserProfile } from "../types/domain";
import { useGamepadNavigation } from "../hooks/useGamepadNavigation";
import { calculateAchievementTotals } from "../utils/achievementTotals";
import {
  calculatePlayerLevel,
  aggregateTrophyCounts,
  calculatePlayerLevelFromXp,
  getPSNTierInfo,
} from "../utils/trophyTiers";
import { getHubAggregateCounts } from "../utils/hubTrophies";
import { useAuth } from "../auth/AuthProvider";
import {
  calculateTotalPlayedMinutes,
  formatPlayedHours,
  getGamePlayedHours,
} from "../utils/playtime";
import ProfileEditorModal from "./ProfileEditorModal";
import TrophyHistoryTimeline from "./trophies/TrophyHistoryTimeline";

interface UserProfilePageProps {
  userProfile: UserProfile | null;
  user: { email?: string | null; photoURL?: string | null } | null;
  games: Game[];
  onOpenGame?: (game: Game) => void;
  onProfileUpdated?: () => Promise<void> | void;
  editable?: boolean;
  playSound?: (sound: string) => void;
  language?: LauncherLanguage;
  copyFriendDiscord?: boolean;
  onNotify?: (message: string, type?: "success" | "error" | "info") => void;
  /**
   * When provided, the page renders a server-side trophy/XP event timeline
   * (Phase 3.5). Only the self profile should pass this; the friend-profile
   * modal intentionally omits it.
   */
  userId?: string | null;
}

type LegacyGameFields = {
  minutesPlayed?: number;
  imageUrl?: string;
};

type LegacyLibrarySummaryFields = {
  steamGameCount?: number;
  epicGameCount?: number;
  localGameCount?: number;
};

const profileCopy = {
  "pt-BR": {
    connected: "Conectado", disconnected: "Não conectado", player: "Jogador",
    edit: "Editar perfil", games: "Jogos", hours: "Horas", favorites: "Favoritos",
    platforms: "Plataformas", achievements: "Conquistas", library: "Biblioteca",
    mostPlayed: "Mais jogados", allGames: "Todos os Jogos", searchGames: "Filtrar jogos...", noGamesFound: "Nenhum jogo encontrado.",
    unlocked: "conquistas desbloqueadas",
    catalogued: "jogos catalogados", catalog: "Catálogo e atalhos",
    noFavorites: "Nenhum favorito ainda.", emptyTitle: "Perfil em construção",
    emptyBody: "Jogue e favorite jogos para preencher esta área.", copiedNickname: "Nickname do Discord copiado.", copiedId: "ID do Discord copiado.", copyError: "Não foi possível copiar o Discord.",
  },
  "en-US": {
    connected: "Connected", disconnected: "Not connected", player: "Player",
    edit: "Edit profile", games: "Games", hours: "Hours", favorites: "Favorites",
    platforms: "Platforms", achievements: "Achievements", library: "Library",
    mostPlayed: "Most played", allGames: "All Games", searchGames: "Filter games...", noGamesFound: "No games found.",
    unlocked: "achievements unlocked",
    catalogued: "games catalogued", catalog: "Catalog and shortcuts",
    noFavorites: "No favorites yet.", emptyTitle: "Profile under construction",
    emptyBody: "Play and favorite games to fill this area.", copiedNickname: "Discord nickname copied.", copiedId: "Discord ID copied.", copyError: "Could not copy Discord.",
  },
  "es-ES": {
    connected: "Conectado", disconnected: "No conectado", player: "Jugador",
    edit: "Editar perfil", games: "Juegos", hours: "Horas", favorites: "Favoritos",
    platforms: "Plataformas", achievements: "Logros", library: "Biblioteca",
    mostPlayed: "Más jugados", allGames: "Todos los Juegos", searchGames: "Filtrar juegos...", noGamesFound: "No se encontraron juegos.",
    unlocked: "logros desbloqueados",
    catalogued: "juegos catalogados", catalog: "Catálogo y accesos directos",
    noFavorites: "Aún no hay favoritos.", emptyTitle: "Perfil en construcción",
    emptyBody: "Juega y marca juegos como favoritos para completar esta área.", copiedNickname: "Nickname de Discord copiado.", copiedId: "ID de Discord copiado.", copyError: "No se pudo copiar Discord.",
  },
  "fr-FR": {
    connected: "Connecté", disconnected: "Non connecté", player: "Joueur",
    edit: "Modifier le profil", games: "Jeux", hours: "Heures", favorites: "Favoris",
    platforms: "Plateformes", achievements: "Succès", library: "Bibliothèque",
    mostPlayed: "Les plus joués", allGames: "Tous les Jeux", searchGames: "Filtrer les jeux...", noGamesFound: "Aucun jeu trouvé.",
    unlocked: "succès débloqués",
    catalogued: "jeux catalogués", catalog: "Catalogue et raccourcis",
    noFavorites: "Aucun favori.", emptyTitle: "Profil en construction",
    emptyBody: "Jouez et ajoutez des jeux aux favoris pour remplir cette zone.", copiedNickname: "Pseudo Discord copié.", copiedId: "ID Discord copié.", copyError: "Impossible de copier Discord.",
  },
  "de-DE": {
    connected: "Verbunden", disconnected: "Nicht verbunden", player: "Spieler",
    edit: "Profil bearbeiten", games: "Spiele", hours: "Stunden", favorites: "Favoriten",
    platforms: "Plattformen", achievements: "Erfolge", library: "Bibliothek",
    mostPlayed: "Meistgespielt", allGames: "Alle Spiele", searchGames: "Spiele filtern...", noGamesFound: "Keine Spiele gefunden.",
    unlocked: "Erfolge freigeschaltet",
    catalogued: "Spiele katalogisiert", catalog: "Katalog und Verknüpfungen",
    noFavorites: "Noch keine Favoriten.", emptyTitle: "Profil im Aufbau",
    emptyBody: "Spiele und markiere Favoriten, um diesen Bereich zu füllen.", copiedNickname: "Discord-Name kopiert.", copiedId: "Discord-ID kopiert.", copyError: "Discord konnte nicht kopiert werden.",
  },
  "it-IT": {
    connected: "Connesso", disconnected: "Non connesso", player: "Giocatore",
    edit: "Modifica profilo", games: "Giochi", hours: "Ore", favorites: "Preferiti",
    platforms: "Piattaforme", achievements: "Obiettivi", library: "Libreria",
    mostPlayed: "Più giocati", allGames: "Tutti i Giochi", searchGames: "Filtra giochi...", noGamesFound: "Nessun gioco trovato.",
    unlocked: "obiettivi sbloccati",
    catalogued: "giochi catalogati", catalog: "Catalogo e collegamenti",
    noFavorites: "Nessun preferito.", emptyTitle: "Profilo in costruzione",
    emptyBody: "Gioca e aggiungi giochi ai preferiti per riempire questa area.", copiedNickname: "Nickname Discord copiato.", copiedId: "ID Discord copiato.", copyError: "Impossibile copiare Discord.",
  },
} as const;

const EpicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <img
    width={96}
    height={96}
    src={EPIC_GAMES_ICON_PATH}
    alt="Epic Games"
    className={className}
    style={{ filter: "invert(1)" }}
  />
);

const avatarUrl = (profile: UserProfile | null, authPhotoURL?: string | null) =>
  profile?.photoURL || authPhotoURL || profile?.discordAvatar || profile?.steamAvatar || "";

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const openExternalProfile = async (url: string) => {
  if (window.electronAPI?.openExternalUrl) {
    await window.electronAPI.openExternalUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

const copyToClipboard = async (value: string) => {
  if (window.electronAPI?.copyToClipboard) {
    try {
      const result = await window.electronAPI.copyToClipboard(value);
      if (result?.ok !== false) return;
    } catch {
      // Builds antigos ou um preload ainda em memória podem não expor o IPC.
      // Nesse caso, continuamos com os fallbacks do Chromium abaixo.
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // O Electron pode bloquear navigator.clipboard dependendo do foco/permissão.
    }
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = typeof document.execCommand === "function" && document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard unavailable");
};

const ProfileAvatar: React.FC<{
  profile: UserProfile | null;
  authPhotoURL?: string | null;
  displayName: string;
  compact?: boolean;
}> = ({ profile, authPhotoURL, displayName, compact = false }) => {
  const src = avatarUrl(profile, authPhotoURL);
  return (
    <div className={`relative shrink-0 aspect-square overflow-hidden rounded-full border-2 border-white/15 bg-white/[0.06] shadow-[0_18px_48px_rgba(0,0,0,.45)] ${compact ? "h-[72px] w-[72px]" : "h-[88px] w-[88px]"}`}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover object-center aspect-square" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xl font-black text-white/70">
          {initialsFor(displayName)}
        </div>
      )}
    </div>
  );
};

const PlatformCard: React.FC<{
  name: string;
  connected: boolean;
  username?: string;
  avatar?: string;
  icon: React.ReactNode;
  connectedLabel: string;
  disconnectedLabel: string;
  compact?: boolean;
}> = ({ name, connected, username, avatar, icon, connectedLabel, disconnectedLabel, compact = false }) => (
  <div
    className={`flex items-center rounded-2xl border ${compact ? "gap-3 p-2.5" : "gap-3.5 p-3.5"} ${connected ? "border-white/14 bg-white/[0.045]" : "border-white/[0.06] bg-black/25"
      }`}
  >
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.07] text-white/75 ${compact ? "h-9 w-9" : "h-10 w-10"}`}>
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-bold text-white">{name}</p>
      <p className="truncate text-xs font-medium text-white/40 mt-0.5">
        {connected ? username || connectedLabel : disconnectedLabel}
      </p>
    </div>
    <span className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-white" : "bg-white/15"}`} />
  </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; compact?: boolean }> = ({
  icon,
  label,
  value,
  compact = false,
}) => (
  <div className={`flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.045] ${compact ? "min-h-[72px] px-4 py-2.5" : "min-h-[90px] px-5 py-3.5"}`}>
    <div className={`${compact ? "mb-1" : "mb-1.5"} text-white/40`}>{icon}</div>
    <div className={`${compact ? "text-lg" : "text-xl"} font-bold text-white tabular-nums`}>{value}</div>
    <div className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-white/35">{label}</div>
  </div>
);

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

const Section: React.FC<SectionProps> = ({
  title,
  icon,
  children,
  className = "",
  compact = false,
}) => (
  <section className={`${compact ? "rounded-xl p-4 md:p-5" : "rounded-2xl p-6 md:p-7"} border border-white/10 bg-black/40 backdrop-blur-3xl shadow-[0_20px_70px_rgba(0,0,0,0.45)] ${className}`}>
    <div className={`${compact ? "mb-3" : "mb-5"} flex items-center gap-3`}>
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white/70">
          {icon}
        </div>
      )}
      <div>
        <h2 className="text-base md:text-lg font-bold text-white tracking-tight">{title}</h2>
      </div>
    </div>
    {children}
  </section>
);

const UserProfilePage: React.FC<UserProfilePageProps> = ({
  userProfile,
  user,
  games,
  onOpenGame,
  onProfileUpdated,
  editable = true,
  playSound,
  language = "pt-BR",
  copyFriendDiscord = false,
  onNotify,
  userId = null,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  useGamepadNavigation({
    scrollRef: scrollRef as React.RefObject<HTMLElement>,
    scrollSpeed: 25,
    disableX: true,
    disableO: true,
  });
  const copy = profileCopy[language];
  const compactProfile = !editable;
  const isPrivateProfile = !editable && userProfile?.profileVisibility === "private";
  const displayName = userProfile?.displayName || user?.email?.split("@")[0] || copy.player;
  const email = userProfile?.email || user?.email || "";

  const normalizedGames = useMemo(() => {
    return (games || []).map((game) => {
      const legacyGame = game as Game & LegacyGameFields;
      const minutes = Math.max(
        0,
        Number(legacyGame.minutesPlayed) || 0,
        Number(game.steamPlaytimeMinutes) || 0,
        Number(game.locallyTrackedMinutes) || 0,
        Math.round((Number(game.hoursPlayed) || 0) * 60),
      );
      return {
        ...game,
        hoursPlayed: minutes / 60,
        isFavorite: Boolean(game.isFavorite),
        cardImage: game.cardImage || legacyGame.imageUrl || game.image,
        image: game.image || legacyGame.imageUrl || game.cardImage,
      } as Game;
    });
  }, [games]);

  const stats = useMemo(() => {
    const totalMinutes = userProfile?.librarySummary
      ? Math.max(0, Math.round(Number(userProfile.librarySummary.minutesPlayed) || 0))
      : calculateTotalPlayedMinutes(normalizedGames);
    const totalHours = totalMinutes / 60;
    const achievementTotals = calculateAchievementTotals(normalizedGames);
    const storedAchievementSummary = userProfile?.achievementSummary;
    const totalAchievements =
      achievementTotals.unlocked > 0 || achievementTotals.available > 0
        ? achievementTotals.unlocked
        : Number(storedAchievementSummary?.unlocked || 0);
    const totalPossible =
      achievementTotals.available > 0
        ? achievementTotals.available
        : Math.max(Number(storedAchievementSummary?.available ?? 0), totalAchievements);
    const legacyLibrarySummary = userProfile?.librarySummary as
      | (UserProfile["librarySummary"] & LegacyLibrarySummaryFields)
      | undefined;
    const favorites = userProfile?.librarySummary?.favorites
      ?? normalizedGames.filter((game) => game.isFavorite).length;
    const steamGames = userProfile?.librarySummary?.steamGames
      ?? legacyLibrarySummary?.steamGameCount
      ?? normalizedGames.filter((game) => game.launcherType === "steam").length;
    const epicGames = userProfile?.librarySummary?.epicGames
      ?? legacyLibrarySummary?.epicGameCount
      ?? normalizedGames.filter((game) => game.launcherType === "epic").length;
    const localGames = userProfile?.librarySummary?.localGames
      ?? legacyLibrarySummary?.localGameCount
      ?? normalizedGames.filter((game) => !game.launcherType || game.launcherType === "local").length;
    const totalGames = userProfile?.librarySummary?.games ?? normalizedGames.length;
    return { totalGames, totalHours, totalAchievements, totalPossible, favorites, steamGames, epicGames, localGames };
  }, [normalizedGames, userProfile]);

  const [activeGameTab, setActiveGameTab] = useState<"mostPlayed" | "allGames">("mostPlayed");
  const [gameSearch, setGameSearch] = useState("");

  const topGames = useMemo(() => {
    const withHours = [...normalizedGames]
      .filter((game) => getGamePlayedHours(game) > 0)
      .sort((a, b) => getGamePlayedHours(b) - getGamePlayedHours(a));
    if (withHours.length > 0) return withHours.slice(0, 5);
    return [...normalizedGames].slice(0, 5);
  }, [normalizedGames]);

  const filteredAllGames = useMemo(() => {
    const q = gameSearch.trim().toLowerCase();
    const sorted = [...normalizedGames].sort((a, b) => {
      const diff = getGamePlayedHours(b) - getGamePlayedHours(a);
      if (diff !== 0) return diff;
      return a.title.localeCompare(b.title);
    });
    if (!q) return sorted;
    return sorted.filter((g) => g.title.toLowerCase().includes(q));
  }, [normalizedGames, gameSearch]);

  const favoriteGames = useMemo(
    () => normalizedGames.filter((game) => game.isFavorite).slice(0, 6),
    [normalizedGames],
  );

  const achievementPercent =
    stats.totalPossible > 0 ? Math.round((stats.totalAchievements / stats.totalPossible) * 100) : 0;
  const maxHours = Math.max(topGames[0] ? getGamePlayedHours(topGames[0]) : 1, 1);
  const libraryRows = [
    { label: "Steam", value: stats.steamGames },
    { label: "Epic Games", value: stats.epicGames },
    { label: "Local", value: stats.localGames },
  ];
  const steamId = String(userProfile?.steamId || "").trim();
  const discordId = String(userProfile?.discordId || "").trim();
  const hasSteamProfile = /^\d{10,20}$/.test(steamId);
  const hasDiscordProfile = /^\d{10,24}$/.test(discordId);
  const discordDisplayName = String(userProfile?.discordUsername || discordId).trim();

  const { user: authUser } = useAuth();
  const playerLevel = useMemo(() => {
    const isSelf = editable && authUser?.uid;
    if (isSelf) {
      const hubAgg = getHubAggregateCounts(authUser.uid!, normalizedGames as any);
      // Se tem progresso no hub, usa hub; senão mostra nível 1 Bronze 1 (não farmado)
      if ((hubAgg.hubPoints ?? 0) > 0 || normalizedGames.length > 0) {
        return calculatePlayerLevel(0, 0, 0, hubAgg);
      }
    } else {
      // Amigos ou perfis consultados via busca
      const anyProfile = userProfile as any;
      const levelProgress = anyProfile?.levelProgress;
      if (levelProgress?.total_xp != null && Number(levelProgress.total_xp) > 0) {
        return calculatePlayerLevelFromXp(Number(levelProgress.total_xp));
      }
      const rawLvl = Number(levelProgress?.current_level ?? anyProfile?.level ?? 0);
      if (rawLvl > 1) {
        const tierInfo = getPSNTierInfo(rawLvl);
        return {
          level: rawLvl,
          xp: 0,
          progress: Number(levelProgress?.progress_pct ?? 0),
          currentLevelXp: 0,
          xpForNextLevel: 0,
          tier: tierInfo.tier,
          subTier: tierInfo.subTier,
          tierName: tierInfo.name,
          rank: tierInfo.name,
          rankColor: tierInfo.color,
          tierInfo,
        };
      }
    }
    const agg = aggregateTrophyCounts(normalizedGames);
    return calculatePlayerLevel(stats.totalHours, stats.totalAchievements, stats.totalGames, agg);
  }, [normalizedGames, stats, editable, authUser?.uid, userProfile]);

  return (
    <motion.div
      ref={scrollRef}
      data-system-page
      initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      data-profile-density={compactProfile ? "compact" : "comfortable"}
      className={`relative min-h-0 flex-1 overflow-y-auto thin-scrollbar ${compactProfile ? "px-5 pb-6 pt-4" : "px-8 pb-12 pt-6"}`}
    >
      <div className={`relative mx-auto max-w-6xl ${compactProfile ? "space-y-4" : "space-y-6"}`}>
        <section className={`rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.45)] ${compactProfile ? "p-5 md:p-6" : "p-6 md:p-7"}`}>
          <div className={`flex flex-col md:flex-row md:items-center md:justify-between ${compactProfile ? "gap-4" : "gap-6"}`}>
            <div className="flex min-w-0 items-center gap-5">
              <ProfileAvatar profile={userProfile} authPhotoURL={user?.photoURL} displayName={displayName} compact={compactProfile} />
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/60 font-body">
                  {editable ? "Seu perfil" : "Perfil do jogador"}
                </p>
                <div className="flex items-center gap-3">
                  <h1 className={`${compactProfile ? "text-2xl" : "text-3xl"} truncate font-bold tracking-tight text-white`}>{displayName}</h1>
                  <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${compactProfile ? "scale-75 origin-left" : ""} ${playerLevel.tierInfo.borderClass} ${playerLevel.tierInfo.bgClass}`}>
                    <Trophy className={`h-3.5 w-3.5 ${playerLevel.tierInfo.color}`} />
                    <span className={`text-xs font-bold ${playerLevel.tierInfo.color}`}>Lv.{playerLevel.level}</span>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`text-xs font-medium ${playerLevel.tierInfo.color}`}>{playerLevel.tierInfo.name}</span>
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06] border border-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, playerLevel.progress))}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full bg-white"
                    />
                  </div>
                  <span className="text-xs text-white/60 font-medium">{playerLevel.progress}%</span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {hasSteamProfile && (
                    <button
                      type="button"
                      onClick={() => void openExternalProfile(`https://steamcommunity.com/profiles/${steamId}`)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <FontAwesomeIcon icon={faSteam} className="h-3 w-3" />
                      {userProfile?.steamUsername || "Steam"}
                    </button>
                  )}
                  {hasDiscordProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!copyFriendDiscord) {
                          void openExternalProfile(`https://discord.com/users/${discordId}`);
                          return;
                        }
                        void copyToClipboard(discordDisplayName).then(() => {
                          onNotify?.(
                            userProfile?.discordUsername ? copy.copiedNickname : copy.copiedId,
                            "success",
                          );
                        }).catch(() => onNotify?.(copy.copyError, "error"));
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <FontAwesomeIcon icon={faDiscord} className="h-3 w-3" />
                      {discordDisplayName}
                    </button>
                  )}
                </div>
                {userProfile?.bio && <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-white/70 font-body">{userProfile.bio}</p>}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-white/60">
                  {email && <span>{email}</span>}
                  {userProfile?.website && /^https:\/\//i.test(userProfile.website) && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-white"
                      onClick={() => window.electronAPI?.openExternalUrl(userProfile.website as string)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Site
                    </button>
                  )}
                </div>
                {Boolean(userProfile?.favoriteGenres?.length) && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {userProfile?.favoriteGenres?.map((genre) => (
                      <span key={genre} className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-xs font-medium text-white/70">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              {editable && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    playSound?.("showModal");
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/65 transition hover:bg-white/12 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" /> {copy.edit}
                </button>
              )}
              {isPrivateProfile ? (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white/50">
                  <Lock className="h-4 w-4 text-white/60" />
                  <span className="text-xs font-bold uppercase tracking-wider">Perfil Privado</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <StatCard compact={compactProfile} icon={<Gamepad2 className="h-4 w-4" />} label={copy.games} value={stats.totalGames} />
                  <StatCard compact={compactProfile} icon={<Clock className="h-4 w-4" />} label={copy.hours} value={`${formatPlayedHours(stats.totalHours)}h`} />
                  <StatCard compact={compactProfile} icon={<Star className="h-4 w-4" />} label={copy.favorites} value={stats.favorites} />
                </div>
              )}
            </div>
          </div>
        </section>

        {isPrivateProfile ? (
          <section className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/40 backdrop-blur-3xl p-12 text-center shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-white/60 shadow-inner">
              <Lock className="h-8 w-8 text-white/80" />
            </div>
            <h2 className="text-xl font-black text-white">Perfil Privado</h2>
            <p className="mt-2 max-w-md text-sm text-white/70 leading-relaxed">
              Este jogador optou por manter suas estatísticas, biblioteca de jogos e troféus privados.
            </p>
          </section>
        ) : (
          <>
            <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] ${compactProfile ? "gap-4" : "gap-5"}`}>
          <section aria-label="Atividade do jogador" className="space-y-5">
            <Section
              compact={compactProfile}
              title={activeGameTab === "mostPlayed" ? copy.mostPlayed : `${copy.allGames} (${normalizedGames.length})`}
              icon={activeGameTab === "mostPlayed" ? <TrendingUp className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
              className={compactProfile ? "min-h-[260px]" : "min-h-[346px]"}
            >
              {/* Tab Selector & Search */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-3">
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/5">
                  <button
                    type="button"
                    onClick={() => setActiveGameTab("mostPlayed")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeGameTab === "mostPlayed"
                        ? "bg-white/15 text-white shadow-xs"
                        : "text-white/45 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>{copy.mostPlayed}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGameTab("allGames")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeGameTab === "allGames"
                        ? "bg-white/15 text-white shadow-xs"
                        : "text-white/45 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>{copy.allGames}</span>
                    <span className="ml-0.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
                      {normalizedGames.length}
                    </span>
                  </button>
                </div>

                {activeGameTab === "allGames" && (
                  <div className="relative w-48 sm:w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
                    <input
                      type="text"
                      placeholder={copy.searchGames}
                      value={gameSearch}
                      onChange={(e) => setGameSearch(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-white placeholder-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition"
                    />
                  </div>
                )}
              </div>

              {activeGameTab === "mostPlayed" ? (
                topGames.length > 0 ? (
                  <div className="space-y-4">
                    {topGames.map((game, index) => {
                      const playedHours = getGamePlayedHours(game);
                      const pct = (playedHours / maxHours) * 100;
                      return (
                        <button
                          key={game.id}
                          type="button"
                          onClick={() => onOpenGame?.(game)}
                          disabled={!onOpenGame}
                          className="grid w-full grid-cols-[20px_42px_1fr_auto] items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <span className="text-right text-xs font-black text-white/25">{index + 1}</span>
                          <div className="h-12 w-9 overflow-hidden rounded-lg bg-white/8">
                            {(game.cardImage || game.image) && (
                              <img src={game.cardImage || game.image} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-white">{game.title}</p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: index * 0.05 }}
                                className="h-full rounded-full bg-white"
                              />
                            </div>
                          </div>
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-white/35">
                            <Clock className="h-3 w-3" /> {formatPlayedHours(playedHours)}h
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyProfileState compact={compactProfile} title={copy.emptyTitle} body={copy.emptyBody} />
                )
              ) : (
                /* Todos os Jogos Tab */
                filteredAllGames.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1 thin-scrollbar">
                    {filteredAllGames.map((game) => {
                      const playedHours = getGamePlayedHours(game);
                      const launcherBadge = game.launcherType === "steam"
                        ? "Steam"
                        : game.launcherType === "epic"
                        ? "Epic Games"
                        : "Local";

                      return (
                        <button
                          key={game.id}
                          type="button"
                          onClick={() => onOpenGame?.(game)}
                          disabled={!onOpenGame}
                          className="flex items-center gap-3 p-2.5 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/12 transition text-left cursor-pointer group disabled:cursor-default"
                        >
                          <div className="h-14 w-11 rounded-lg overflow-hidden bg-white/8 shrink-0 relative">
                            {(game.cardImage || game.image) ? (
                              <img src={game.cardImage || game.image} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-white/30">
                                <Gamepad2 className="h-5 w-5" />
                              </div>
                            )}
                            {game.isFavorite && (
                              <div className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-black/60 flex items-center justify-center">
                                <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-white group-hover:text-white/90">{game.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-medium text-white/40 flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                {formatPlayedHours(playedHours)}h
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-white/50 uppercase tracking-wider">
                                {launcherBadge}
                              </span>
                            </div>
                            {(game.totalAchievements || 0) > 0 && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-white/40">
                                <Trophy className="h-2.5 w-2.5 text-yellow-500/80" />
                                <span>{game.completedAchievements || 0} / {game.totalAchievements}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs font-bold text-white/40">
                    {copy.noGamesFound}
                  </div>
                )
              )}
            </Section>

            <Section compact={compactProfile} title={copy.favorites} icon={<Star className="h-4 w-4" />}>
              {favoriteGames.length > 0 ? (
                <div className="flex gap-4 overflow-x-auto pb-1 no-scrollbar">
                  {favoriteGames.map((game) => (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => onOpenGame?.(game)}
                      disabled={!onOpenGame}
                      className="w-[82px] shrink-0 rounded-3xl p-1 text-left transition-colors hover:bg-white/[0.07] disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <div className="h-[90px] w-[74px] overflow-hidden rounded-xl bg-white/8">
                        {(game.cardImage || game.image) && (
                          <img src={game.cardImage || game.image} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <p className="mt-2 truncate text-center text-[10px] text-white/45">{game.title}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={`${compactProfile ? "py-5" : "py-8"} text-center text-sm font-bold text-white/35`}>{copy.noFavorites}</p>
              )}
            </Section>
          </section>

          <aside aria-label="Resumo do perfil" className="space-y-5">
            <Section compact={compactProfile} title={copy.platforms}>
              <div className="space-y-2">
                <PlatformCard
                  name="Steam"
                  connected={Boolean(userProfile?.steamId)}
                  avatar={userProfile?.steamAvatar}
                  username={userProfile?.steamUsername || userProfile?.steamId}
                  icon={<FontAwesomeIcon icon={faSteam} className="h-4 w-4" />}
                  connectedLabel={copy.connected}
                  disconnectedLabel={copy.disconnected}
                  compact={compactProfile}
                />
                <PlatformCard
                  name="Epic Games"
                  connected={stats.epicGames > 0}
                  username={stats.epicGames > 0 ? `${stats.epicGames} ${copy.catalogued}` : copy.catalog}
                  icon={<EpicIcon className="h-5 w-5" />}
                  connectedLabel={copy.connected}
                  disconnectedLabel={copy.disconnected}
                  compact={compactProfile}
                />
                <PlatformCard
                  name="Discord"
                  connected={Boolean(userProfile?.discordId)}
                  avatar={userProfile?.discordAvatar}
                  username={userProfile?.discordUsername}
                  icon={<FontAwesomeIcon icon={faDiscord} className="h-4 w-4" />}
                  connectedLabel={copy.connected}
                  disconnectedLabel={copy.disconnected}
                  compact={compactProfile}
                />
              </div>
            </Section>

            <Section compact={compactProfile} title={copy.achievements}>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <span className="text-4xl font-black text-white">{stats.totalAchievements}</span>
                  <span className="ml-1 text-sm font-bold text-white/35">/ {stats.totalPossible}</span>
                </div>
                <span className="text-sm font-black text-white/45">{achievementPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <motion.div initial={{ width: 0 }} animate={{ width: `${achievementPercent}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full bg-white" />
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[10px] text-white/35">
                <Trophy className="h-3 w-3" /> {stats.totalAchievements} {copy.unlocked}
              </p>
            </Section>

            <Section compact={compactProfile} title={copy.library}>
              <div className="space-y-3">
                {libraryRows.map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-white/45"><span>{row.label}</span><span>{row.value}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                      <motion.div initial={{ width: 0 }} animate={{ width: stats.totalGames > 0 ? `${(row.value / stats.totalGames) * 100}%` : "0%" }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full bg-white" />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </aside>
        </div>

            <TrophyHistoryTimeline userId={userId || userProfile?.uid || (user as any)?.uid || "current-user"} games={games} />
          </>
        )}
      </div>
      <ProfileEditorModal
        isOpen={isEditing}
        profile={userProfile}
        fallbackName={displayName}
        fallbackPhotoURL={user?.photoURL}
        onClose={() => {
          setIsEditing(false);
          playSound?.("back");
        }}
        onSaved={onProfileUpdated}
      />
    </motion.div>
  );
};

const EmptyProfileState: React.FC<{ title: string; body: string; compact?: boolean }> = ({ title, body, compact = false }) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? "h-40" : "h-56"}`}>
    <User className="mb-4 h-9 w-9 text-white/20" />
    <p className="text-sm font-black text-white/40">{title}</p>
    <p className="mt-1 text-xs text-white/25">{body}</p>
  </div>
);

export default UserProfilePage;
