import React from "react";
import { Flame, Users2 } from "lucide-react";
import type { TranslationKey } from "../context/PreferencesContext";
import type { Game } from "../types/domain";
import { motion } from "framer-motion";

interface FriendPresenceSnapshot {
  id: string;
  name: string;
  status: "online" | "playing" | "offline";
  playing?: string;
  avatar?: string;
}

interface ActivityItem {
  id: string;
  title: string;
  detail: string;
}

interface HomeOverviewPanelsProps {
  continuePlaying: Game[];
  favoriteGames: Game[];
  friendsPlaying: FriendPresenceSnapshot[];
  recentActivity: ActivityItem[];
  onOpenGame: (game: Game) => void;
  onOpenFriends: () => void;
  onOpenFriendChat: (friendId: string) => void;
  t: (key: TranslationKey) => string;
}

export const HomeOverviewPanels = React.memo(function HomeOverviewPanels({
  friendsPlaying,
  recentActivity,
  onOpenFriends,
}: HomeOverviewPanelsProps) {
  const topFriends = friendsPlaying.slice(0, 2);
  const topActivities = recentActivity.slice(0, 2);

  return (
    <aside
      aria-label="Painel de atividade e amigos"
      className="absolute top-24 right-10 flex flex-col gap-2.5 z-20 pointer-events-none"
    >
      {topFriends.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 20, filter: "blur(6px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onClick={onOpenFriends}
          className="pointer-events-auto group w-72 rounded-2xl border border-white/[0.08] bg-[#090b10]/80 backdrop-blur-2xl p-3 shadow-[0_12px_36px_rgba(0,0,0,0.55)] flex items-center gap-3 cursor-pointer hover:border-white/20 hover:bg-[#0f121a]/90 transition-all duration-200"
        >
          {/* Inner Icon: R_inner (12px) = R_outer (16px) - Padding (4px optical margin) */}
          <div className="relative w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 group-hover:border-white/20 transition-colors">
            <Users2 className="h-4 w-4 text-white/80 group-hover:text-white transition-colors" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#090b10] shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-[10px] font-semibold tracking-widest text-white/45 uppercase font-body">
              Amigos online
            </span>
            <p className="text-xs font-semibold text-white/95 truncate font-body group-hover:text-white transition-colors">
              {topFriends[0].name} {topFriends.length > 1 ? `e mais ${friendsPlaying.length - 1}` : "ativo agora"}
            </p>
          </div>
        </motion.div>
      )}

      {topActivities.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 20, filter: "blur(6px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.35, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto group w-72 rounded-2xl border border-white/[0.08] bg-[#090b10]/80 backdrop-blur-2xl p-3 shadow-[0_12px_36px_rgba(0,0,0,0.55)] flex items-center gap-3 hover:border-white/20 hover:bg-[#0f121a]/90 transition-all duration-200"
        >
          {/* Inner Icon: R_inner (12px) = R_outer (16px) - Padding (4px optical margin) */}
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Flame className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-[10px] font-semibold tracking-widest text-amber-300/60 uppercase font-body">
              Atividade recente
            </span>
            <p className="text-xs font-semibold text-white/95 truncate font-body">
              {topActivities[0].title}
            </p>
          </div>
        </motion.div>
      )}
    </aside>
  );
});
