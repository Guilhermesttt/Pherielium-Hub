import React from "react";
import ModalShell from "../ui/ModalShell";
import GlassButton, { type GlassButtonProps } from "../ui/GlassButton";
import type { SoundEffectType } from "../../hooks/useSoundEffects";
import { motion } from "framer-motion";
import { LogOut, Unplug } from "lucide-react";

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: GlassButtonProps["variant"];
  variant?: "default" | "delete" | "logout" | "disconnect";
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  playSound: (type: SoundEffectType) => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = React.memo(
  ({
    isOpen,
    title,
    description,
    confirmLabel,
    cancelLabel = "Cancelar",
    confirmVariant = "white",
    variant = "default",
    onClose,
    onConfirm,
    playSound,
  }) => {
    const handleCloseAction = () => {
      playSound("back");
      onClose();
    };

    const handleConfirmAction = () => {
      playSound("select");
      void onConfirm();
    };

    return (
      <ModalShell
        isOpen={isOpen}
        onClose={handleCloseAction}
        maxWidthClassName={variant === "delete" ? "max-w-[340px]" : "max-w-md"}
        zIndexClassName="z-[170]"
        className={
          variant === "delete" || variant === "logout" || variant === "disconnect"
            ? "bg-[#0E0E0E] relative overflow-hidden rounded-[32px] border border-[var(--color-border)] p-8 shadow-[0_32px_64px_rgba(0,0,0,0.6)] flex flex-col items-center"
            : "bg-[#0E0E0E] relative overflow-hidden rounded-2xl border border-white/10 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
        }
      >
        {variant === "delete" || variant === "logout" || variant === "disconnect" ? (
          <>
            {/* Animated Icon Area */}
            <div className="relative w-32 h-32 flex items-center justify-center mb-2">
              <motion.div animate={{ y: [0, -8, 0], rotate: [10, 25, 10], opacity: [0.7, 1, 0.7] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.2 }} className="absolute top-6 left-2 w-5 h-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-sm shadow-sm" style={{ clipPath: "polygon(0 0, 100% 15%, 85% 100%, 15% 100%)" }} />
              <motion.div animate={{ y: [0, 12, 0], rotate: [-15, -30, -15], opacity: [0.5, 0.8, 0.5] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.8 }} className="absolute bottom-6 left-6 w-4 h-5 bg-white/[0.05] backdrop-blur-md border border-white/10 rounded-sm shadow-sm" style={{ clipPath: "polygon(10% 0, 100% 0, 90% 100%, 0 85%)" }} />
              <motion.div animate={{ y: [0, -15, 0], rotate: [45, 60, 45], opacity: [0.8, 1, 0.8] }} transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", delay: 0.5 }} className="absolute top-10 right-4 w-6 h-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-sm shadow-sm" style={{ clipPath: "polygon(0 15%, 100% 0, 85% 100%, 15% 85%)" }} />
              <motion.div animate={{ y: [0, 10, 0], rotate: [-20, -5, -20], opacity: [0.6, 0.9, 0.6] }} transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 1.2 }} className="absolute bottom-8 right-6 w-5 h-5 bg-white/[0.08] backdrop-blur-md border border-white/10 rounded-sm shadow-sm" style={{ clipPath: "polygon(15% 0, 100% 15%, 85% 100%, 0 85%)" }} />

              <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }} className="relative z-10 flex flex-col items-center drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)]">
                {variant === "delete" ? (
                  <>
                    <div className="w-8 h-1.5 bg-[#48484A] rounded-t-md absolute -top-1.5 z-10" />
                    <div className="w-[84px] h-3 bg-[#48484A] rounded-full border-[3px] border-[#2C2C2E] shadow-sm relative z-20" />
                    <div className="w-[68px] h-20 bg-gradient-to-b from-[#3A3A3C] to-[#1C1C1E] rounded-b-[18px] border-[3px] border-t-0 border-[#2C2C2E] relative -top-1 flex justify-evenly pt-2 pb-3 px-2">
                      <div className="w-1.5 h-full bg-black/40 rounded-full" />
                      <div className="w-1.5 h-full bg-black/40 rounded-full" />
                      <div className="w-1.5 h-full bg-black/40 rounded-full" />
                      <div className="w-1.5 h-full bg-black/40 rounded-full" />
                    </div>
                  </>
                ) : (
                  <div className="w-20 h-20 bg-gradient-to-b from-[#3A3A3C] to-[#1C1C1E] rounded-2xl border-[3px] border-[#2C2C2E] relative flex items-center justify-center shadow-lg">
                    {variant === "logout" ? (
                      <motion.div animate={{ x: [0, 6, 0], opacity: [0.7, 1, 0.7] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
                        <LogOut className="w-9 h-9 text-white/90 drop-shadow-md ml-1" />
                      </motion.div>
                    ) : (
                      <motion.div animate={{ y: [0, -4, 0], scale: [0.95, 1.05, 0.95] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
                        <Unplug className="w-9 h-9 text-[#FF453A] drop-shadow-[0_0_8px_rgba(255,69,58,0.5)]" />
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            </div>

            <h2 className="text-[19px] font-semibold text-white tracking-tight mb-2 text-center">{title}</h2>
            <p className="text-[13px] font-medium text-white/60 text-center leading-[1.4] mb-8 px-2 max-w-[240px]">{description}</p>

            <div className="flex gap-3 w-full">
              <button type="button" onClick={handleCloseAction} onMouseEnter={() => playSound("hover")} className="flex-1 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/5 text-[14px] font-medium text-white transition-all">
                {cancelLabel}
              </button>
              <button type="button" onClick={handleConfirmAction} onMouseEnter={() => playSound("hover")} className="flex-1 py-3 rounded-full bg-[#FF453A] hover:bg-[#FF5147] border border-[#FF453A]/50 text-[14px] font-medium text-white shadow-[0_4px_16px_rgba(255,69,58,0.4)] hover:shadow-[0_6px_20px_rgba(255,69,58,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all">
                {confirmLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <h3 className="text-xl font-bold tracking-tight text-white">{title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-white/70">{description}</p>
            <div className="mt-7 flex items-center justify-end gap-3">
              <GlassButton type="button" onClick={handleCloseAction} onMouseEnter={() => playSound("hover")} variant="outline" className="h-10 px-5 text-xs font-semibold uppercase tracking-wider text-white/80 hover:text-white">
                {cancelLabel}
              </GlassButton>
              <GlassButton type="button" onClick={handleConfirmAction} onMouseEnter={() => playSound("hover")} variant={confirmVariant} className="h-10 px-5 text-xs font-bold uppercase tracking-wider">
                {confirmLabel}
              </GlassButton>
            </div>
          </>
        )}
      </ModalShell>
    );
  },
);

ConfirmationModal.displayName = "ConfirmationModal";

