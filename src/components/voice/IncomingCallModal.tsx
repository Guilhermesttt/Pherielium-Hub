import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, Signal, ShieldCheck, Activity } from "lucide-react";
import { PHERIELIUM_LOGO_PATH } from "../../constants/assets";
import type { CallInvitePayload } from "../../services/voiceCall";

interface IncomingCallModalProps {
  isOpen: boolean;
  invite: CallInvitePayload | null;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  isOpen,
  invite,
  onAccept,
  onReject,
}) => {
  if (!isOpen || !invite) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 26 }}
          className="glass-panel relative w-full max-w-[440px] overflow-hidden rounded-[22px] border border-white/[0.08] shadow-[0_30px_120px_rgba(0,0,0,0.9)] flex flex-col"
        >
          {/* Top Atmospheric Glow */}
          <div className="pointer-events-none absolute left-1/2 top-[-100px] h-64 w-64 -translate-x-1/2 rounded-full bg-white/[0.06] blur-[90px]" />

          <div className="p-7">
            {/* Top Bar: Call status and Brand */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2.5">
                <div className="h-6 w-6 rounded-full bg-white/[0.08] border border-white/20 flex items-center justify-center text-white">
                  <Phone className="h-3 w-3 animate-pulse" />
                </div>
                <span className="text-xs font-body font-bold uppercase tracking-wider text-white">
                  CHAMADA RECEBIDA
                </span>
                <Activity className="h-3.5 w-8 text-white/40 animate-pulse ml-1" />
              </div>

              <div className="flex items-center gap-1.5 opacity-50">
                <img src={PHERIELIUM_LOGO_PATH} alt="" className="h-3.5 w-3.5 object-contain" />
                <span className="text-[10px] font-display font-bold text-white tracking-widest uppercase">
                  PHERIELIUM
                </span>
              </div>
            </div>

            {/* Concentric Orbital Radar Avatar */}
            <div className="flex flex-col items-center text-center">
              <div className="relative my-2 flex h-36 w-36 items-center justify-center">
                {/* Outer rotating/pulsing rings */}
                <div className="absolute inset-0 rounded-full border border-white/10 animate-ping opacity-20 duration-1000" />
                <div className="absolute inset-2 rounded-full border border-white/15" />
                <div className="absolute inset-5 rounded-full border border-dashed border-white/25 animate-spin" style={{ animationDuration: "12s" }} />

                {/* Orbiting Radar Node */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                  className="absolute inset-2 pointer-events-none"
                >
                  <div className="h-2 w-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,1)] -translate-x-1/2" />
                </motion.div>

                {/* Avatar */}
                <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/30 bg-[#12131a] shadow-[0_0_40px_rgba(255,255,255,0.15)]">
                  {invite.callerAvatar ? (
                    <img
                      src={invite.callerAvatar}
                      alt={invite.callerName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/[0.06] text-2xl font-display font-black text-white">
                      {invite.callerName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              <h2 className="text-2xl font-display font-bold tracking-tight text-white mt-4">
                {invite.callerName}
              </h2>

              <p className="mt-1 text-xs font-body font-semibold tracking-widest text-white/60 uppercase">
                ESTÁ LIGANDO PARA VOCÊ...
              </p>

              {/* Call Details Pill Box */}
              <div className="mt-6 w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center justify-center gap-1 border-r border-white/[0.06] pr-1">
                  {invite.hasVideo ? (
                    <Video className="h-4 w-4 text-white/70" />
                  ) : (
                    <Phone className="h-4 w-4 text-white/70" />
                  )}
                  <span className="text-[10.5px] font-semibold text-white">
                    {invite.hasVideo ? "Chamada de vídeo" : "Chamada de voz"}
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center gap-1 border-r border-white/[0.06] px-1">
                  <Signal className="h-4 w-4 text-white" />
                  <span className="text-[9px] font-body text-white/40 uppercase">QUALIDADE</span>
                  <span className="text-[10.5px] font-semibold text-white">EXCELENTE</span>
                </div>

                <div className="flex flex-col items-center justify-center gap-1 pl-1">
                  <ShieldCheck className="h-4 w-4 text-white" />
                  <span className="text-[9px] font-body text-white/40 uppercase">CONEXÃO</span>
                  <span className="text-[10.5px] font-semibold text-white">SEGURA</span>
                </div>
              </div>

              {/* Action Buttons: Recusar & Atender */}
              <div className="mt-7 flex items-center justify-between gap-4 w-full">
                <button
                  type="button"
                  onClick={onReject}
                  className="cursor-pointer flex-1 h-18 py-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 active:scale-98 transition-all flex flex-col items-center justify-center gap-1 text-rose-400 shadow-lg group"
                >
                  <div className="h-8 w-8 rounded-full bg-rose-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <PhoneOff className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-display font-bold uppercase tracking-wider">RECUSAR</span>
                </button>

                {/* Sliding indicator */}
                <div className="flex items-center text-white/20 font-mono tracking-widest text-xs select-none">
                  &gt;&gt;&gt;
                </div>

                <button
                  type="button"
                  onClick={onAccept}
                  className="cursor-pointer flex-1 h-18 py-3 rounded-2xl bg-white hover:bg-white/90 active:scale-98 transition-all flex flex-col items-center justify-center gap-1 text-black shadow-[0_0_30px_rgba(255,255,255,0.25)] group"
                >
                  <div className="h-8 w-8 rounded-full bg-black/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Phone className="h-4 w-4 text-black" />
                  </div>
                  <span className="text-xs font-display font-bold uppercase tracking-wider">ATENDER</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Footnote */}
          <div className="border-t border-white/[0.06] bg-black/30 px-6 py-3 text-center">
            <span className="text-[10px] font-body text-white/30 tracking-wide">
              ⓘ VOCÊ PODE ACEITAR OU RECUSAR A CHAMADA
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default IncomingCallModal;
