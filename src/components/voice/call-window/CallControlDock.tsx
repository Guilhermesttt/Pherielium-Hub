import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  Settings,
  UserPlus,
  PhoneOff,
  Sparkles,
  Hand,
  SmilePlus,
} from "lucide-react";
import { CallControlButton } from "./CallControlButton";
import { popIn } from "./motionTokens";

const QUICK_REACTIONS = ["👍", "🎉", "😂", "❤️", "👏", "😮"];

interface CallControlDockProps {
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn?: boolean;
  isSharingScreen: boolean;
  isSettingsOpen: boolean;
  isOnlyOnePerson: boolean;
  isHandRaised?: boolean;
  onToggleRaiseHand?: () => void;
  onSendReaction?: (emoji: string) => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  onToggleSettings: () => void;
  onOpenInvite?: () => void;
  onOpenOrbloomCustomizer?: () => void;
  onHangUp?: () => void;
}

export const CallControlDock: React.FC<CallControlDockProps> = ({
  isMuted,
  isDeafened,
  isCameraOn = false,
  isSharingScreen,
  isSettingsOpen,
  isOnlyOnePerson,
  isHandRaised = false,
  onToggleRaiseHand,
  onSendReaction,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onToggleSettings,
  onOpenInvite,
  onOpenOrbloomCustomizer,
  onHangUp,
}) => {
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);

  return (
    <nav
      aria-label="Controles da chamada"
      style={{
        cornerShape: "squircle",
      } as React.CSSProperties}
      className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-[22px] bg-[#0F0F0F]/80 border border-[#161616] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] select-none shrink-0"
    >
      {/* Grupo Primário: Comunicação (Mic, Som, Câmera, Tela) */}
      <div className="flex items-center gap-1.5">
        <CallControlButton
          icon={isMuted ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
          tooltip={isMuted ? "Ativar microfone (Desmutar)" : "Silenciar microfone (Mutar)"}
          variant={isMuted ? "muted" : "default"}
          onClick={onToggleMute}
        />

        <CallControlButton
          icon={isDeafened ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
          tooltip={isDeafened ? "Reativar áudio da chamada" : "Silenciar todo o áudio (Deafen)"}
          variant={isDeafened ? "muted" : "default"}
          onClick={onToggleDeafen}
        />

        {onToggleCamera && (
          <CallControlButton
            icon={isCameraOn ? <Video className="h-4.5 w-4.5" /> : <VideoOff className="h-4.5 w-4.5" />}
            tooltip={isCameraOn ? "Desligar câmera" : "Ligar câmera"}
            variant={isCameraOn ? "active" : "default"}
            onClick={onToggleCamera}
          />
        )}

        {onToggleScreenShare && (
          <CallControlButton
            icon={isSharingScreen ? <MonitorOff className="h-4.5 w-4.5" /> : <MonitorUp className="h-4.5 w-4.5" />}
            tooltip={isSharingScreen ? "Interromper transmissão de tela" : "Transmitir tela ou aplicativo"}
            variant={isSharingScreen ? "active" : "default"}
            onClick={onToggleScreenShare}
          />
        )}
      </div>

      {/* Divisor Visual Sutil Base 4/8 */}
      <div className="w-px h-6 bg-[#161616] mx-1 shrink-0" />

      {/* Grupo Secundário: Interação & Ajustes */}
      <div className="flex items-center gap-1.5">
        {onToggleRaiseHand && (
          <CallControlButton
            icon={<Hand className="h-4 w-4" />}
            tooltip={isHandRaised ? "Abaixar a mão" : "Levantar a mão"}
            variant={isHandRaised ? "active" : "default"}
            onClick={onToggleRaiseHand}
          />
        )}

        {onSendReaction && (
          <div className="relative">
            <CallControlButton
              icon={<SmilePlus className="h-4 w-4" />}
              tooltip="Enviar reação"
              variant={isReactionsOpen ? "active" : "default"}
              onClick={() => setIsReactionsOpen((prev) => !prev)}
            />

            <AnimatePresence>
              {isReactionsOpen && (
                <motion.div
                  initial={popIn.initial}
                  animate={popIn.animate}
                  exit={popIn.exit}
                  transition={popIn.transition}
                  style={{ cornerShape: "squircle" } as React.CSSProperties}
                  className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex items-center gap-1 p-2 rounded-[18px] bg-[#0F0F0F]/95 border border-[#161616] shadow-2xl backdrop-blur-2xl z-40"
                >
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onSendReaction(emoji);
                        setIsReactionsOpen(false);
                      }}
                      className="h-9 w-9 flex items-center justify-center rounded-xl text-lg hover:bg-white/10 transition cursor-pointer active:scale-90"
                      title={`Reagir com ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {onOpenInvite && (
          <CallControlButton
            icon={<UserPlus className="h-4 w-4" />}
            tooltip="Convidar amigos para a chamada"
            variant="default"
            onClick={onOpenInvite}
            className="hidden sm:inline-flex"
          />
        )}

        {onOpenOrbloomCustomizer && (
          <CallControlButton
            icon={<Sparkles className="h-4 w-4" />}
            tooltip="Personalizar Orbloom"
            variant="default"
            onClick={onOpenOrbloomCustomizer}
          />
        )}

        <CallControlButton
          icon={<Settings className="h-4 w-4" />}
          tooltip="Ajustes de Áudio & Vídeo"
          variant={isSettingsOpen ? "active" : "default"}
          onClick={onToggleSettings}
        />
      </div>

      {/* Divisor Visual Sutil */}
      <div className="w-px h-6 bg-[#161616] mx-1 shrink-0" />

      {/* Grupo Destrutivo: Sair / Encerrar Chamada */}
      <CallControlButton
        icon={<PhoneOff className="h-4 w-4" />}
        label={isOnlyOnePerson ? "Encerrar" : "Desconectar"}
        tooltip={isOnlyOnePerson ? "Encerrar chamada" : "Desconectar da chamada"}
        variant="danger"
        size="lg"
        onClick={onHangUp}
      />
    </nav>
  );
};
