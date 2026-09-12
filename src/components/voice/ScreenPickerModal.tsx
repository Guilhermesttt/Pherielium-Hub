import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  AppWindow,
  X,
  RefreshCw,
  Sparkles,
  Check,
  Volume2,
  Tv,
  Radio,
  Sliders,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { ScreenShareOptions } from "../../hooks/useVoiceCall";

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

interface ScreenPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSource: (options: ScreenShareOptions) => void;
}

export const ScreenPickerModal: React.FC<ScreenPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectSource,
}) => {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [activeTab, setActiveTab] = useState<"screens" | "windows">("screens");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<"720p" | "1080p" | "source">("1080p");
  const [fps, setFps] = useState<30 | 60>(60);
  const [withAudio, setWithAudio] = useState(true);
  const [callAudioBarrier, setCallAudioBarrier] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchSources = async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.getScreenSources) {
        const list = await window.electronAPI.getScreenSources();
        setSources(list);
        if (list.length > 0 && !selectedSourceId) {
          setSelectedSourceId(list[0].id);
        }
      } else {
        setSources([]);
      }
    } catch (err) {
      console.error("[ScreenPickerModal] Failed to get screen sources", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchSources();
    } else {
      setSelectedSourceId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const screens = sources.filter((s) => s.id.startsWith("screen:"));
  const windows = sources.filter((s) => !s.id.startsWith("screen:"));
  const displayedSources = activeTab === "screens" ? screens : windows;

  const handleGoLive = () => {
    if (!selectedSourceId) return;
    onSelectSource({
      sourceId: selectedSourceId,
      resolution,
      fps,
      withAudio,
      callAudioBarrier,
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="relative flex flex-col w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1f202b]/95 via-[#13141b]/98 to-[#0b0c10] shadow-[0_30px_90px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/8 px-6 py-4.5 bg-black/20">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white shadow-sm">
                <Radio className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black text-white tracking-tight">Compartilhar Tela</h3>
                <p className="text-xs font-normal text-white/50">Selecione uma janela de jogo ou tela inteira</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchSources}
                disabled={loading}
                className="flex h-8.5 w-8.5 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
                title="Atualizar janelas"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8.5 w-8.5 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Sub Tabs */}
          <div className="flex items-center gap-2 px-6 pt-4 pb-2 border-b border-white/5 bg-black/10">
            <button
              type="button"
              onClick={() => setActiveTab("screens")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "screens"
                  ? "bg-white text-black font-black shadow-sm"
                  : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              Telas Inteiras ({screens.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("windows")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "windows"
                  ? "bg-white text-black font-black shadow-sm"
                  : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
            >
              <AppWindow className="h-3.5 w-3.5" />
              Janelas & Jogos ({windows.length})
            </button>
          </div>

          {/* Grid of Available Sources */}
          <div className="flex-1 overflow-y-auto p-6 thin-scrollbar min-h-[220px]">
            {sources.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Monitor className="h-12 w-12 text-white/20 mb-3" />
                <p className="text-sm font-bold text-white/70">Nenhuma fonte detectada via Electron.</p>
                <p className="text-xs text-white/40 mt-1 mb-4">Você pode usar o seletor nativo do sistema operacional.</p>
                <button
                  type="button"
                  onClick={() => onSelectSource({})}
                  className="px-5 py-2.5 rounded-xl bg-white text-black font-black text-xs transition hover:bg-white/90 shadow-lg shadow-white/10 cursor-pointer"
                >
                  Selecionar pelo sistema
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {displayedSources.map((source) => {
                  const isSelected = selectedSourceId === source.id;
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => setSelectedSourceId(source.id)}
                      className={`group relative flex flex-col overflow-hidden rounded-2xl p-3 text-left transition-all duration-200 cursor-pointer ${isSelected
                          ? "border-2 border-white bg-white/10 ring-2 ring-white/20 shadow-[0_0_25px_rgba(255,255,255,0.15)] scale-[1.01]"
                          : "border border-white/8 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.06] hover:scale-[1.01]"
                        }`}
                    >
                      {/* Thumbnail Preview */}
                      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/60 border border-white/5">
                        {source.thumbnail ? (
                          <img
                            src={source.thumbnail}
                            alt={source.name}
                            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-white/20">
                            <Monitor className="h-8 w-8" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                        {isSelected && (
                          <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow-md">
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      {/* Source Title & App Icon */}
                      <div className="mt-2.5 flex items-center gap-2 min-w-0">
                        {source.appIcon && (
                          <img
                            src={source.appIcon}
                            alt=""
                            className="h-4 w-4 shrink-0 rounded object-contain"
                          />
                        )}
                        <span
                          className={`truncate text-xs font-bold transition-colors ${isSelected ? "text-white" : "text-white/80 group-hover:text-white"
                            }`}
                        >
                          {source.name}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quality & Audio Settings Bar */}
          <div className="border-t border-white/8 bg-black/30 p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              {/* Resolution Selector */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Qualidade</span>
                <div className="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-xl border border-white/8">
                  {(["720p", "1080p", "source"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${resolution === r
                          ? "bg-white text-black font-black shadow-sm"
                          : "text-white/50 hover:text-white hover:bg-white/5"
                        }`}
                    >
                      {r === "source" ? "Fonte" : r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Framerate Selector */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Taxa de Quadros</span>
                <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/8">
                  {([30, 60] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFps(f)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${fps === f
                          ? "bg-white text-black font-black shadow-sm"
                          : "text-white/50 hover:text-white hover:bg-white/5"
                        }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* System Audio Checkbox */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Áudio da Stream</span>
                <label className="flex items-center gap-2.5 h-[34px] px-3 rounded-xl border border-white/8 bg-white/5 cursor-pointer hover:bg-white/8 transition">
                  <input
                    type="checkbox"
                    checked={withAudio}
                    onChange={(e) => setWithAudio(e.target.checked)}
                    className="h-4 w-4 rounded accent-white cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white/90">
                    <Volume2 className="h-3.5 w-3.5 text-white/60" />
                    <span>Transmitir Sons do Computador / Jogo</span>
                  </div>
                </label>
                <p className="text-[9px] text-white/40 leading-tight">
                  Recomendado usar fones de ouvido para evitar que o microfone capture o áudio dos alto-falantes em eco.
                </p>
              </div>

              {/* Call Audio Barrier */}
              {withAudio && (
                <div className="flex flex-col gap-1.5 animate-fadeIn">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="h-3 w-3" />
                    Barreira de Áudio da Call
                  </span>
                  <label className="flex items-center gap-2.5 h-[34px] px-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 cursor-pointer hover:bg-emerald-500/15 transition">
                    <input
                      type="checkbox"
                      checked={callAudioBarrier}
                      onChange={(e) => setCallAudioBarrier(e.target.checked)}
                      className="h-4 w-4 rounded accent-emerald-400 cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white/95">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Isolar Vozes da Chamada (Anti-Vazamento)</span>
                    </div>
                  </label>
                  <p className="text-[9px] text-white/40 leading-tight">
                    Filtra e bloqueia em tempo real a voz dos seus amigos para não ecoar ou vazar na transmissão.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-xs text-white/40">
                {selectedSourceId
                  ? "Pronto para transmitir com hardware encoding"
                  : "Selecione uma janela acima para começar"}
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGoLive}
                  disabled={!selectedSourceId}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black font-black text-xs uppercase tracking-wider hover:bg-white/90 transition shadow-lg shadow-white/10 disabled:opacity-40 disabled:bg-white/20 disabled:text-white/40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <Radio className="h-4 w-4" />
                  <span>Transmitir Ao Vivo</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

