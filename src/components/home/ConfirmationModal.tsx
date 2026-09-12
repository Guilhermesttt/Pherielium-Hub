import React from "react";
import ModalShell from "../ui/ModalShell";
import GlassButton, { type GlassButtonProps } from "../ui/GlassButton";
import type { SoundEffectType } from "../../hooks/useSoundEffects";

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: GlassButtonProps["variant"];
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
        maxWidthClassName="max-w-md"
        zIndexClassName="z-[170]"
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e0f13]/95 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-3xl"
      >
        {/* Subtle top ambient glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <h3 className="text-xl font-bold tracking-tight text-white">{title}</h3>
        <p className="mt-2.5 text-sm leading-relaxed text-white/70">
          {description}
        </p>

        <div className="mt-7 flex items-center justify-end gap-3">
          <GlassButton
            type="button"
            onClick={handleCloseAction}
            onMouseEnter={() => playSound("hover")}
            variant="outline"
            className="h-10 px-5 text-xs font-semibold uppercase tracking-wider text-white/80 hover:text-white"
          >
            {cancelLabel}
          </GlassButton>
          <GlassButton
            type="button"
            onClick={handleConfirmAction}
            onMouseEnter={() => playSound("hover")}
            variant={confirmVariant}
            className="h-10 px-5 text-xs font-bold uppercase tracking-wider"
          >
            {confirmLabel}
          </GlassButton>
        </div>
      </ModalShell>
    );
  },
);

ConfirmationModal.displayName = "ConfirmationModal";

