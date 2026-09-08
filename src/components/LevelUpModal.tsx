import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Sparkles, ShieldCheck } from "lucide-react";
import type { PlayerLevelInfo, PSNTierInfo } from "../utils/trophyTiers";
import achievementSoundUrl from "../sounds/Phelierium Default/Achievment_Unlock.mp3";
import { progressionEventBus } from "../services/progressionEvents";

interface LevelUpDetail {
  oldLevel: number;
  newLevel: number;
  levelInfo: PlayerLevelInfo;
  tierInfo?: PSNTierInfo;
}

export const LevelUpModal: React.FC = () => {
  const [currentEvent, setCurrentEvent] = useState<LevelUpDetail | null>(null);

  useEffect(() => {
    const triggerModal = (detail: LevelUpDetail) => {
      setCurrentEvent(detail);
      try {
        const audio = new Audio(achievementSoundUrl);
        audio.volume = 0.65;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((err) => {
            console.debug("[LevelUpModal] Som de nível não reproduzido:", err);
          });
        }
      } catch (err) {
        console.debug("[LevelUpModal] Erro ao instanciar áudio:", err);
      }
    };

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<LevelUpDetail>;
      if (customEvent.detail) {
        triggerModal(customEvent.detail);
      }
    };

    const unsubscribeBus = progressionEventBus.onLevelUp(triggerModal);
    window.addEventListener("checkpoint:level-up", handleCustomEvent);

    return () => {
      unsubscribeBus();
      window.removeEventListener("checkpoint:level-up", handleCustomEvent);
    };
  }, []);

  const handleClose = () => {
    setCurrentEvent(null);
  };

  useEffect(() => {
    if (!currentEvent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentEvent]);

  const { oldLevel = 1, newLevel = 2, levelInfo, tierInfo } = currentEvent || ({} as Partial<LevelUpDetail>);
  const rankName = tierInfo?.name || levelInfo?.tierName || `Nível ${newLevel}`;

  return (
    <AnimatePresence>
      {currentEvent && (
        <div
          key="level-up-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="level-up-title"
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        >
          {/* Backdrop escuro com blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/85 backdrop-blur-2xl"
          />

          {/* Modal Card — Estética Constelação AGENTS.md */}
          <motion.div
            initial={{ scale: 0.92, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 12, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-[22px] border border-white/[0.14] bg-[#08090C] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.95)] text-center select-none"
          >
            {/* Halo sutil estelar superior */}
            <div className="absolute -top-14 left-1/2 h-28 w-56 -translate-x-1/2 rounded-full bg-white/[0.08] blur-3xl pointer-events-none" />

            {/* Badge Eyebrow */}
            <motion.div
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/15 bg-white/[0.05] text-xs font-semibold uppercase tracking-[0.08em] text-white/90"
            >
              <Sparkles className="w-3.5 h-3.5 text-white" />
              <span id="level-up-title">Subiu de Nível</span>
            </motion.div>

            {/* Ícone de Troféu em Nó Luminoso */}
            <div className="relative my-6 flex justify-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 24, delay: 0.15 }}
                className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.06] shadow-[0_0_35px_rgba(255,255,255,0.15)]"
              >
                <Trophy className="h-10 w-10 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
              </motion.div>
            </div>

            {/* Trilha Linear de Constelação (Nó Anterior -> Conector -> Novo Nó) */}
            <div className="my-4 flex items-center justify-center gap-3 px-4">
              <div className="flex flex-col items-center">
                <span className="text-xs font-mono font-medium text-white/50">Nv. {oldLevel}</span>
                <div className="mt-1 h-3 w-3 rounded-full border border-white/30 bg-white/10" />
              </div>

              {/* Linha conectora de constelação */}
              <div className="relative h-px flex-1 bg-gradient-to-r from-white/20 via-white/60 to-white/90">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                  className="h-full w-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] origin-left"
                />
              </div>

              <div className="flex flex-col items-center">
                <span className="text-sm font-mono font-bold text-white">Nv. {newLevel}</span>
                <div className="mt-1 h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] ring-2 ring-white/40" />
              </div>
            </div>

            {/* Nome da Patente / Tier */}
            <motion.div
              initial={{ y: 4, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold tracking-tight text-white/80"
            >
              <ShieldCheck className="w-4 h-4 text-white" />
              <span>{rankName}</span>
            </motion.div>

            {/* Barra de Progresso do Próximo Nível */}
            {levelInfo && (
              <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-left">
                <div className="flex justify-between text-xs font-medium text-white/70 mb-1.5">
                  <span>Próximo marco: Nível {newLevel + 1}</span>
                  <span className="font-mono text-white/90">
                    {levelInfo.currentLevelXp} / {levelInfo.xpForNextLevel} XP ({levelInfo.progress}%)
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: `${levelInfo.progress}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.35 }}
                    className="h-full rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                  />
                </div>
              </div>
            )}

            {/* Botão de Continuar — Stellar Action Button */}
            <button
              type="button"
              onClick={handleClose}
              className="mt-6 w-full h-11 rounded-lg bg-white hover:bg-white/90 active:scale-[0.99] font-semibold text-xs text-[#030405] transition-all duration-160 shadow-[0_4px_20px_rgba(0,0,0,0.5)] cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090C]"
            >
              <span>Continuar Jornada</span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/15 text-black font-bold">
                Enter / [A]
              </span>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
