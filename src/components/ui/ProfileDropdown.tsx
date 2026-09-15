import React, { useMemo } from "react";
import { LogOut, Settings, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import type { LauncherLanguage } from "../../context/PreferencesContext";
import type { SoundEffectType } from "../../hooks/useSoundEffects";
import { Squircle } from "./Squircle";
import { getPSNTierInfo, type PlayerLevelInfo } from "../../utils/trophyTiers";

interface ProfileDropdownProps {
  userDisplay: string;
  email?: string;
  avatarUrl?: string;
  userLevel?: PlayerLevelInfo | number;
  onLogout: () => void;
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
  language?: LauncherLanguage;
  playSound: (type: SoundEffectType) => void;
}

const dropdownCopy = {
  "pt-BR": { identity: "Identidade", profile: "Ver perfil", settings: "Configurações", logout: "Sair", level: "Nível" },
  "en-US": { identity: "Identity", profile: "View profile", settings: "Settings", logout: "Sign out", level: "Level" },
  "es-ES": { identity: "Identidad", profile: "Ver perfil", settings: "Configuración", logout: "Salir", level: "Nivel" },
  "fr-FR": { identity: "Identité", profile: "Voir le profil", settings: "Paramètres", logout: "Se déconnecter", level: "Niveau" },
  "de-DE": { identity: "Identität", profile: "Profil anzeigen", settings: "Einstellungen", logout: "Abmelden", level: "Stufe" },
  "it-IT": { identity: "Identità", profile: "Vedi profilo", settings: "Impostazioni", logout: "Esci", level: "Livello" },
} as const;

export function ProfileDropdown({
  userDisplay,
  email,
  avatarUrl,
  userLevel,
  onLogout,
  onOpenProfile,
  onOpenSettings,
  language = "pt-BR",
  playSound,
}: ProfileDropdownProps) {
  const initials = userDisplay.slice(0, 2).toUpperCase();
  const copy = dropdownCopy[language] || dropdownCopy["pt-BR"];

  const levelInfo = useMemo<PlayerLevelInfo | null>(() => {
    if (!userLevel) return null;
    if (typeof userLevel === "number") {
      const tierInfo = getPSNTierInfo(userLevel);
      return {
        level: userLevel,
        xp: 0,
        progress: 0,
        currentLevelXp: 0,
        xpForNextLevel: 100,
        tier: tierInfo.tier,
        subTier: tierInfo.subTier,
        tierName: tierInfo.name,
        rank: tierInfo.name,
        rankColor: tierInfo.color,
        tierInfo,
      };
    }
    return userLevel;
  }, [userLevel]);

  const levelNum = levelInfo?.level;
  const tierInfo = useMemo(() => {
    return levelInfo?.tierInfo || (levelNum ? getPSNTierInfo(levelNum) : getPSNTierInfo(1));
  }, [levelInfo, levelNum]);

  return (
    <DropdownMenu>
      <div className="font-ui">
        <DropdownMenuTrigger asChild>
          <button
            onPointerEnter={() => playSound("hover")}
            onClick={() => playSound("select")}
            className="group flex cursor-pointer items-center gap-3 rounded-2xl p-1.5 transition-all hover:bg-white/10 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <div className="flex flex-col items-end pl-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40 group-hover:text-white/60 transition-colors">
                  {copy.identity}
                </span>
                {levelNum != null && (
                  <span className={`text-[9px] font-black uppercase tracking-wider ${tierInfo.color}`}>
                    • Nv. {levelNum}
                  </span>
                )}
              </div>
              <span className="text-xs font-black uppercase text-white transition-colors">
                {userDisplay}
              </span>
            </div>
            <Squircle cornerRadius={12} cornerSmoothing={1} className="relative h-11 w-11 shrink-0 aspect-square overflow-hidden border border-white/20 bg-white/10 ring-2 ring-white/10 group-hover:ring-white/30 group-hover:scale-105 transition-all shadow-md">
              {avatarUrl ? (
                <img src={avatarUrl} alt={userDisplay} className="h-full w-full object-cover object-center aspect-square" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-black text-white/70">
                  {initials}
                </div>
              )}
            </Squircle>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-72 rounded-[20px] border border-white/[0.08] p-2"
          style={{
            background: "rgba(28, 28, 30, 0.75)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
          align="end"
          sideOffset={12}
        >
          <DropdownMenuLabel className="p-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-black text-white truncate">{userDisplay}</span>
                  {email && <span className="text-xs font-medium text-white/40 truncate">{email}</span>}
                </div>
                {levelNum != null && (
                  <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border ${tierInfo.bgClass} ${tierInfo.borderClass} ${tierInfo.color}`}>
                    Nv. {levelNum}
                  </span>
                )}
              </div>

              {levelInfo && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 space-y-1.5 mt-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-bold ${tierInfo.color}`}>
                      {tierInfo.name}
                    </span>
                    <span className="font-mono text-[10px] text-white/60 font-semibold">
                      {levelInfo.currentLevelXp} / {levelInfo.xpForNextLevel} XP
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${levelInfo.progress}%`,
                        backgroundColor: tierInfo.hexColor || "#38bdf8",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuGroup className="p-1">
            {onOpenProfile && (
              <DropdownMenuItem
                onClick={onOpenProfile}
                onPointerEnter={() => playSound("hover")}
                className="flex cursor-pointer items-center gap-3 rounded-xl p-3 text-xs font-semibold text-white/70 transition-colors focus:bg-white/10 focus:text-white"
              >
                <User className="h-4 w-4" />
                {copy.profile}
              </DropdownMenuItem>
            )}
            {onOpenSettings && (
              <DropdownMenuItem
                onClick={onOpenSettings}
                onPointerEnter={() => playSound("hover")}
                className="flex cursor-pointer items-center gap-3 rounded-xl p-3 text-xs font-semibold text-white/70 transition-colors focus:bg-white/10 focus:text-white"
              >
                <Settings className="h-4 w-4" />
                {copy.settings}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="bg-white/10" />
          <div className="p-1">
            <DropdownMenuItem
              onClick={onLogout}
              onPointerEnter={() => playSound("hover")}
              className="flex cursor-pointer items-center gap-3 rounded-xl p-3 text-xs font-bold text-red-400 transition-colors focus:bg-red-500/15 focus:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              {copy.logout}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}



