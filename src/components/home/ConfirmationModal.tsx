import React from "react";
import ModalShell from "../ui/ModalShell";
import GlassButton from "../ui/GlassButton";
import type { SoundEffectType } from "../../hooks/useSoundEffects";

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  playSound: (type: SoundEffectType) => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = React.memo(
  ({ isOpen, title, description, confirmLabel, onClose, onConfirm, playSound }) => {
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
        className="rounded-[22px] border border-white/10 bg-[#0a0a0c]/95 p-8 shadow-2xl backdrop-blur-3xl"
      >
        <h3 className="mb-2 text-xl font-semibold text-white">{title}</h3>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          {description}
        </p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <GlassButton
            type="button"
            onClick={handleCloseAction}
            onMouseEnter={() => playSound("hover")}
            variant="outline"
          >
            Cancelar
          </GlassButton>
          <GlassButton
            type="button"
            onClick={handleConfirmAction}
            onMouseEnter={() => playSound("hover")}
            variant="white"
          >
            {confirmLabel}
          </GlassButton>
        </div>
      </ModalShell>
    );
  },
);

ConfirmationModal.displayName = "ConfirmationModal";
