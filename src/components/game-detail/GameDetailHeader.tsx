import React from "react";
import { motion } from "framer-motion";
import type { Game } from "../../types/domain";
import type { GameDetailCopy } from "../../types/gameDetail";
import type { SoundEffectType } from "../../hooks/useSoundEffects";

interface GameDetailHeaderProps {
  game: Game;
  coverImage: string;
  platformLabel: string;
  localizedCategory: string;
  isRunning: boolean;
  activeTab: string;
  tabs: string[];
  copy: GameDetailCopy;
  actionsSlot: React.ReactNode;
  onTabChange: (tab: string) => void;
  playSound: (type: SoundEffectType) => void;
}

const NavTab: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  id: string;
  controls: string;
}> = React.memo(({ label, active, onClick, id, controls }) => (
  <button
    role="tab"
    id={id}
    aria-controls={controls}
    aria-selected={active}
    tabIndex={active ? 0 : -1}
    onClick={onClick}
    className={`relative pb-3.5 text-[11px] font-black tracking-[0.18em] uppercase transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/50 shrink-0 cursor-pointer ${
      active ? "text-white" : "text-white/35 hover:text-white/70"
    }`}
    style={active ? { textShadow: "0 0 12px rgba(255,255,255,0.4)" } : undefined}
  >
    {label}
    {active && (
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-white"
      />
    )}
  </button>
));

NavTab.displayName = "NavTab";

export const GameDetailHeader: React.FC<GameDetailHeaderProps> = React.memo(({
  game,
  coverImage,
  platformLabel,
  localizedCategory,
  isRunning,
  activeTab,
  tabs,
  copy,
  actionsSlot,
  onTabChange,
  playSound,
}) => {
  return (
    <>
      {/* Header (Capa + Título + Badges + Botão Jogar) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 sm:gap-8 mb-8">
        <div className="w-28 sm:w-32 h-40 sm:h-44 rounded-3xl overflow-hidden shrink-0 border border-white/10 -mt-24 relative z-20 bg-black shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)]">
          <img
            src={coverImage || undefined}
            alt={game.title}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex-1 min-w-0 pb-2">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-3xl sm:text-5xl font-display font-black tracking-tight text-white mb-3 leading-[0.95] truncate">
              {game.title}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-[9px] font-black tracking-[0.25em] text-white/60 uppercase">
                {platformLabel}
              </span>
              {localizedCategory && localizedCategory.toUpperCase() !== platformLabel.toUpperCase() && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[9px] font-black tracking-[0.25em] text-white/40 uppercase">
                  {localizedCategory}
                </span>
              )}
              {isRunning && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/20 border border-green-500/30 text-[9px] font-black tracking-[0.25em] text-green-400 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  {copy.running}
                </span>
              )}
            </div>
          </motion.div>
        </div>

        {/* Slot de Ação (Botão Jogar na lateral direita alinhado à base) */}
        <div className="shrink-0 w-full sm:w-[220px] pb-2">
          {actionsSlot}
        </div>
      </div>

      {/* Abas de Navegação */}
      <div
        className="flex items-center gap-4 sm:gap-8 border-b border-white/10 mb-10 overflow-x-auto hide-scrollbar"
        role="tablist"
      >
        {tabs.map((tabKey) => (
          <NavTab
            key={tabKey}
            label={tabKey}
            active={activeTab === tabKey}
            onClick={() => {
              onTabChange(tabKey);
              playSound("navigate");
            }}
            id={`tab-${tabKey.toLowerCase()}`}
            controls={`panel-${tabKey.toLowerCase()}`}
          />
        ))}
      </div>
    </>
  );
});

GameDetailHeader.displayName = "GameDetailHeader";
