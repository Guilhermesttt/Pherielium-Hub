import React from "react";
import { ArrowRight, ExternalLink, Gamepad2, Sparkles, X, Mic } from "lucide-react";
import ModalShell from "./ui/ModalShell";
import { useGamepadButton } from "../context/GamepadContext";
import type { ReleaseHighlight, ReleaseHighlights } from "../releases/releaseHighlights";

interface WhatsNewModalProps {
  release: ReleaseHighlights;
  onClose: () => void;
}

const highlightIcons: Record<
  ReleaseHighlight["id"],
  React.ComponentType<{ className?: string }>
> = {
  controller: Gamepad2,
  stability: Sparkles,
  voice: Mic,
  platforms: Sparkles,
  search: Sparkles,
  mods: Sparkles,
};

const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ release, onClose }) => {
  // Atalhos de controle para fechar / começar (X = Confirmar/A, O = Voltar/B)
  useGamepadButton("X", onClose, true, 260);
  useGamepadButton("O", onClose, true, 260);

  const openReleaseNotes = async () => {
    if (window.electronAPI?.openExternalUrl) {
      await window.electronAPI.openExternalUrl(release.releaseUrl);
      return;
    }
    window.open(release.releaseUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      maxWidthClassName="max-w-2xl lg:max-w-3xl"
      zIndexClassName="z-[260]"
      backdropClassName="bg-black/85 backdrop-blur-md"
      ariaLabel={`Novidades da versão ${release.version}`}
      gamepadPriority={260}
    >
      <div className="glass-panel relative overflow-hidden rounded-[24px] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        {/* Botão Fechar (X) padrão da aplicação */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar novidades"
          className="absolute right-5 top-5 z-20 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 sm:p-8">
          {/* Header */}
          <header className="pr-10">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                VERSÃO {release.version}
              </span>
            </div>

            <h2 className="mt-3.5 text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {release.title}
            </h2>
            <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-white/50">
              {release.description}
            </p>
          </header>

          {/* Cards de Destaques no padrão Phelierium */}
          <section className="mt-6 space-y-2.5" aria-label="Destaques da atualização">
            {release.highlights.map((highlight, index) => {
              const Icon = highlightIcons[highlight.id] || Sparkles;

              return (
                <article
                  key={highlight.id}
                  data-testid="release-highlight"
                  className="flex items-start gap-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.045]"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-white/70">
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                        {highlight.title}
                      </h3>
                      <span className="text-[10px] font-black tracking-widest text-white/20">
                        0{index + 1}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">
                      {highlight.description}
                    </p>
                  </div>
                </article>
              );
            })}
          </section>

          {/* Footer */}
          <footer className="mt-6 flex flex-col-reverse items-stretch justify-between gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => void openReleaseNotes()}
              aria-label="Ver notas completas"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white/40 transition hover:bg-white/[0.04] hover:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
            >
              Ver notas completas
              <ExternalLink className="h-3 w-3" />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Começar"
              className="group inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-6 text-xs font-bold text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>Começar</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-black/10 text-[9px] font-bold text-black/60">
                A / ↵
              </span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </footer>
        </div>
      </div>
    </ModalShell>
  );
};

export default WhatsNewModal;
