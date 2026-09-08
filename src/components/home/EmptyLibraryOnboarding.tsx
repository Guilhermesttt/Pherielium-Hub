import React, { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Check, Plus, Link2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { SoundEffectType } from "../../hooks/useSoundEffects";
import { PHERIELIUM_LOGO_PATH } from "../../constants/assets";

export interface EmptyStateProps {
  searchTerm: string;
  activeCategory?: string;
  onAddGame: () => void;
  onConnect?: () => void;
  steamConnected?: boolean;
  onSyncSteam?: () => void;
  onConnectEpic?: () => void;
  onSyncEpic?: () => void;
  epicConnected?: boolean;
  isSyncingSteam?: boolean;
  isSyncingEpic?: boolean;
  isConnectingSteam?: boolean;
  isConnectingEpic?: boolean;
}

const CATEGORY_META: Record<string, { label: string; preposition: string }> = {
  ALL: { label: "Biblioteca", preposition: "na" },
  FAVORITES: { label: "Favoritos", preposition: "nos" },
  STEAM: { label: "Steam", preposition: "da" },
  EPIC: { label: "Epic Games", preposition: "da" },
  EA: { label: "EA App", preposition: "da" },
  UBISOFT: { label: "Ubisoft", preposition: "da" },
  GOG: { label: "GOG", preposition: "do" },
  XBOX: { label: "Xbox", preposition: "do" },
  RIOT: { label: "Riot Games", preposition: "da" },
  BATTLENET: { label: "Battle.net", preposition: "da" },
  ROCKSTAR: { label: "Rockstar", preposition: "da" },
  LOCAL: { label: "Jogos Locais", preposition: "em" },
};

export const EmptyState: React.FC<EmptyStateProps> = React.memo(
  ({
    searchTerm,
    activeCategory = "ALL",
    onAddGame,
    onConnect,
    steamConnected = false,
    onSyncSteam,
    onConnectEpic,
    onSyncEpic,
    epicConnected = false,
    isSyncingSteam = false,
    isSyncingEpic = false,
    isConnectingSteam = false,
    isConnectingEpic = false,
  }) => {
    const meta = CATEGORY_META[activeCategory] || {
      label: activeCategory,
      preposition: "em",
    };

    let title = "Biblioteca vazia";
    let description = "Você não possui jogos salvos. Adicione um jogo executável manualmente.";

    if (searchTerm) {
      title = "Nenhum jogo encontrado";
      description = "Não encontramos nenhum jogo correspondente à sua busca.";
    } else if (activeCategory === "STEAM") {
      if (steamConnected) {
        title = "Nenhum jogo da Steam";
        description = "Sua conta Steam está conectada. Sincronize sua biblioteca ou adicione um jogo manualmente.";
      } else {
        title = "Steam desconectada";
        description = "Conecte sua conta Steam para sincronizar seus jogos automaticamente ou adicione manualmente.";
      }
    } else if (activeCategory === "EPIC") {
      if (epicConnected) {
        title = "Nenhum jogo da Epic Games";
        description = "Sua conta Epic Games está conectada. Sincronize sua biblioteca ou adicione um jogo manualmente.";
      } else {
        title = "Epic Games desconectada";
        description = "Conecte sua conta Epic Games para sincronizar seus jogos automaticamente ou adicione manualmente.";
      }
    } else if (activeCategory === "FAVORITES") {
      title = "Nenhum favorito ainda";
      description = "Marque seus jogos preferidos na biblioteca para encontrá-los facilmente aqui.";
    } else if (activeCategory !== "ALL") {
      title = `Nenhum jogo ${meta.preposition} ${meta.label}`;
      description = `Você não possui jogos salvos ${meta.preposition} ${meta.label}. Adicione um executável ou atalho para esta categoria.`;
    }

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-[20px] p-8 text-center bg-[rgba(14,16,24,0.42)] border border-white/[0.10] shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      >
        <div
          className="w-12 h-12 mx-auto mb-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shadow-sm"
        >
          <img
            src={PHERIELIUM_LOGO_PATH}
            alt="Pherielium"
            className="w-6 h-6 object-contain opacity-75"
            draggable={false}
          />
        </div>

        <h3 className="mb-1.5 text-lg font-display font-semibold tracking-tight text-white">
          {title}
        </h3>
        <p className="mb-6 text-[13px] font-body text-white/70 leading-relaxed">
          {description}
        </p>

        {!searchTerm && (
          <div className="flex flex-wrap justify-center gap-2.5">
            {activeCategory === "STEAM" ? (
              steamConnected ? (
                <button
                  type="button"
                  onClick={onSyncSteam}
                  disabled={isSyncingSteam}
                  className="cursor-pointer h-10 rounded-lg px-4 text-xs font-body font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white transition-all duration-160 flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSteam ? "animate-spin" : ""}`} />
                  {isSyncingSteam ? "Sincronizando..." : "Sincronizar Steam"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConnect}
                  disabled={isConnectingSteam}
                  className="cursor-pointer h-10 rounded-lg px-4 text-xs font-body font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white transition-all duration-160 flex items-center gap-2 disabled:opacity-60"
                >
                  {isConnectingSteam ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  {isConnectingSteam ? "Conectando..." : "Conectar Steam"}
                </button>
              )
            ) : activeCategory === "EPIC" ? (
              epicConnected ? (
                <button
                  type="button"
                  onClick={onSyncEpic}
                  disabled={isSyncingEpic}
                  className="cursor-pointer h-10 rounded-lg px-4 text-xs font-body font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white transition-all duration-160 flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingEpic ? "animate-spin" : ""}`} />
                  {isSyncingEpic ? "Sincronizando..." : "Sincronizar Epic"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConnectEpic}
                  disabled={isConnectingEpic}
                  className="cursor-pointer h-10 rounded-lg px-4 text-xs font-body font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white transition-all duration-160 flex items-center gap-2 disabled:opacity-60"
                >
                  {isConnectingEpic ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  {isConnectingEpic ? "Conectando..." : "Conectar Epic"}
                </button>
              )
            ) : null}

            <button
              type="button"
              onClick={onAddGame}
              className="cursor-pointer h-10 rounded-lg bg-white hover:bg-white/90 px-5 text-xs font-body font-semibold text-black transition-all duration-160 flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4 text-black" />
              <span>
                {activeCategory !== "ALL" && activeCategory !== "FAVORITES"
                  ? `Novo Jogo (${meta.label})`
                  : "Adicionar jogo"}
              </span>
            </button>
          </div>
        )}
      </motion.div>
    );
  },
);

EmptyState.displayName = "EmptyState";

export interface EmptyLibraryOnboardingProps {
  onConnectSteam: () => void;
  onOpenAddGame: () => void;
  onComplete: () => void | Promise<void>;
  playSound: (type: SoundEffectType) => void;
}

export const EmptyLibraryOnboarding: React.FC<EmptyLibraryOnboardingProps> = React.memo(
  ({ onConnectSteam, onOpenAddGame, onComplete, playSound }) => {
    const [step, setStep] = useState(0);

    const handleNext = () => {
      if (step < 2) {
        playSound("navigate");
        setStep((prev) => prev + 1);
      } else {
        playSound("select");
        void onComplete();
      }
    };

    const handleBack = () => {
      if (step > 0) {
        playSound("navigate");
        setStep((prev) => prev - 1);
      }
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl rounded-2xl p-8 md:p-10 bg-[rgba(14,16,24,0.34)] border border-white/[0.08] shadow-[0_25px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl font-sans"
      >
        <div className="flex items-center justify-between mb-8">
          <p className="text-xs font-semibold tracking-wider uppercase text-white/60">
            Primeiros passos • Etapa {step + 1} de 3
          </p>
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === step
                    ? "w-6 bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]"
                    : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="min-h-[150px]">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <h3 className="text-2xl md:text-3xl font-display font-semibold tracking-tight text-white">
                  Sua biblioteca está vazia
                </h3>
                <p className="text-xs md:text-sm font-body text-white/50 leading-relaxed">
                  Centralize todos os seus jogos, mods e acompanhe estatísticas em um único hub limpo e veloz.
                </p>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <h3 className="text-2xl md:text-3xl font-display font-semibold tracking-tight text-white">
                  Conecte com a Steam
                </h3>
                <p className="text-xs md:text-sm font-body text-white/50 leading-relaxed">
                  Vincule sua conta para importar seus jogos e conquistas automaticamente em segundos.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={onConnectSteam}
                    className="cursor-pointer h-11 rounded-full px-6 text-xs font-body font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white transition-all duration-200 flex items-center gap-2"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Conectar Steam
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <h3 className="text-2xl md:text-3xl font-display font-semibold tracking-tight text-white">
                  Adicione manualmente
                </h3>
                <p className="text-xs md:text-sm font-body text-white/50 leading-relaxed">
                  Cadastre qualquer jogo local, instalador ou emulador diretamente no seu launcher.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      playSound("select");
                      onOpenAddGame();
                    }}
                    className="cursor-pointer h-11 rounded-full bg-white hover:bg-white/90 px-6 text-xs font-body font-semibold text-black transition-all duration-200 flex items-center gap-2 shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Jogo
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between pt-6 border-t border-white/[0.08] mt-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0}
            className="cursor-pointer flex items-center gap-1.5 text-xs font-body font-medium text-white/40 hover:text-white disabled:opacity-0 transition-all duration-200"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="cursor-pointer flex items-center gap-1.5 h-10 rounded-full bg-white hover:bg-white/90 px-6 text-xs font-body font-semibold text-black transition-all duration-200 shadow-[0_4px_20px_rgba(255,255,255,0.12)]"
          >
            {step === 2 ? (
              <>Concluir <Check className="h-3.5 w-3.5" /></>
            ) : (
              <>Próximo <ChevronRight className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>

        <p className="mt-6 flex items-center gap-2 text-[11px] font-body text-white/35">
          <CheckCircle2 className="h-3.5 w-3.5 text-white/60" />
          Após a sincronização, seus jogos aparecem automaticamente na biblioteca.
        </p>
      </motion.div>
    );
  },
);

EmptyLibraryOnboarding.displayName = "EmptyLibraryOnboarding";
