import React from "react";
import { createOrb, createOrbTheme, type OrbController, type OrbState } from "orbloom";
import "orbloom/styles.css";

export type OrbloomCallState = "idle" | "ringing" | "connecting" | "active-speaking" | "active-quiet" | "muted" | "error";

interface OrbloomOrbProps {
  /** Estado semântico da chamada já mapeado pelo componente pai */
  orbState?: OrbState;
  /** Stream de áudio para reatividade real (local ou remoto). Se ausente, usa animação idle. */
  audioStream?: MediaStream | null;
  /** Nível manual 0..1 (fallback quando não há stream). Ignorado se audioStream existir. */
  level?: number;
  /** Diâmetro em px (vira --orb-diameter) */
  size?: number;
  quality?: "low" | "balanced" | "high";
  className?: string;
  label?: string;
  /**
   * Identificador estável do participante (uid, feed id, nome).
   * Gera uma cor de accents determinística por usuário — cada pessoa
   * da call tem o próprio tingimento no orb.
   */
  participantId?: string | null;
  /**
   * Flutuação ambiente (sobe/desce via CSS). Desligue nas superfícies
   * de chamada para o orb ficar estático (o interior continua vivo e
   * reativo à voz — só a posição para de flutuar).
   */
  ambientMotion?: boolean;
}

/**
 * Mapeia estado da chamada Phelierium -> estado semântico do Orbloom.
 * Mantém o vocabulário do orbloom: idle | listening | thinking | speaking | success | error
 */
export function mapCallToOrbState(opts: {
  isRinging?: boolean;
  isConnecting?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  isSpeaking?: boolean;
  callActive?: boolean;
}): OrbState {
  if (opts.isConnecting) return "thinking";
  if (opts.isRinging) return "idle";
  if (opts.isMuted || opts.isDeafened) return "idle";
  if (opts.isSpeaking) return "speaking";
  if (opts.callActive) return "listening";
  return "idle";
}

/**
 * Trios de accents calibrados para o vidro escuro (highlight branco
 * preserva os glints do glass). O índice vem do hash do participantId,
 * então cada usuário da call tem uma cor estável e distinta.
 */
const PARTICIPANT_ACCENTS: ReadonlyArray<readonly [string, string, string]> = [
  ["#D2D2D2", "#6C6C6C", "#FFFFFF"], // neutro (padrão do hub)
  ["#22D3EE", "#0E7490", "#FFFFFF"], // cyan
  ["#A78BFA", "#7C3AED", "#FFFFFF"], // violeta
  ["#34D399", "#047857", "#FFFFFF"], // esmeralda
  ["#FBBF24", "#B45309", "#FFFFFF"], // âmbar
  ["#F472B6", "#DB2777", "#FFFFFF"], // rosa
  ["#60A5FA", "#1D4ED8", "#FFFFFF"], // azul
  ["#A3E635", "#4D7C0F", "#FFFFFF"], // lima
  ["#FB923C", "#C2410C", "#FFFFFF"], // laranja
  ["#F87171", "#B91C1C", "#FFFFFF"], // vermelho
];

function hashParticipantId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function accentsForParticipant(participantId?: string | null): {
  accents: readonly [string, string, string];
  seed: number;
  index: number;
} {
  if (!participantId) return { accents: PARTICIPANT_ACCENTS[0], seed: 2.4, index: 0 };
  const hash = hashParticipantId(participantId);
  const index = hash % PARTICIPANT_ACCENTS.length;
  // seed estável por usuário: mesma pessoa, mesmo arranjo de estrelas
  const seed = 1 + ((hash % 1000) / 1000) * 10;
  return { accents: PARTICIPANT_ACCENTS[index], seed, index };
}

/**
 * Tema Checkpoint/Orbloom — fundação deep-field (bolha escura com estrelas,
 * igual ao print de referência) tingida por participante:
 * fundo #0F0F0F, superfície #161616, accents por usuário.
 */
function getCheckpointTheme(participantId?: string | null) {
  const { accents, seed, index } = accentsForParticipant(participantId);
  return createOrbTheme({
    preset: "deep-field-blue-01",
    id: `checkpoint-u${index}`,
    seed,
    colors: {
      base: "#161616",
      interior: "#0F0F0F",
      accents,
    },
    appearance: {
      intensity: 1.15,
      detail: 0.7,
      glass: 0.4,
      glow: 1.0,
    },
    motion: {
      speed: 0.7,
      drift: 0.6,
    },
    // Resposta de voz no máximo: brightness 2 = brilho forte ao falar,
    // motion 2 = órbita interna acelera/gira com a voz, pulse 1.8 = aurora reativa.
    audioResponse: {
      brightness: 2,
      motion: 2,
      pulse: 1.8,
    },
  });
}

const themeCache = new Map<string, ReturnType<typeof createOrbTheme>>();
function checkpointTheme(participantId?: string | null) {
  const key = participantId ?? "default";
  let theme = themeCache.get(key);
  if (!theme) {
    theme = getCheckpointTheme(participantId);
    themeCache.set(key, theme);
  }
  return theme;
}

export const OrbloomOrb: React.FC<OrbloomOrbProps> = ({
  orbState = "idle",
  audioStream = null,
  level,
  size = 180,
  quality = "balanced",
  className = "",
  label = "Atividade de voz",
  participantId = null,
  ambientMotion = true,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const controllerRef = React.useRef<OrbController | null>(null);
  const audioCleanupRef = React.useRef<(() => void) | null>(null);
  const [webglFailed, setWebglFailed] = React.useState(false);
  const theme = React.useMemo(() => checkpointTheme(participantId), [participantId]);

  // Lifecycle: create / destroy
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof window === "undefined") return;

    // Respeita prefers-reduced-motion via modo "user" do próprio orbloom
    let controller: OrbController | null = null;
    try {
      controller = createOrb(canvas, {
        theme,
        quality,
        state: orbState,
        reducedMotion: "user",
        onError: () => setWebglFailed(true),
      });
    } catch {
      setWebglFailed(true);
      return;
    }
    controllerRef.current = controller;

    const handleHide = () => {
      if (document.hidden) controller?.pause();
      else controller?.resume();
    };
    document.addEventListener("visibilitychange", handleHide);
    window.addEventListener("pagehide", () => controller?.destroy(), { once: true });

    return () => {
      document.removeEventListener("visibilitychange", handleHide);
      audioCleanupRef.current?.();
      audioCleanupRef.current = null;
      controller?.destroy();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tema por participante (cor de cada usuário da call)
  React.useEffect(() => {
    try {
      controllerRef.current?.setTheme(theme);
    } catch {
      /* mantém o tema atual em caso de falha */
    }
  }, [theme]);

  // Estado semântico
  React.useEffect(() => {
    controllerRef.current?.setState(orbState);
  }, [orbState]);

  // Qualidade
  React.useEffect(() => {
    controllerRef.current?.setQuality(quality);
  }, [quality]);

  // Fonte de áudio: stream real -> analyser; senão nível manual; senão idle (0 -> animação procedural)
  React.useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;

    // limpa fonte anterior
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
    controller.disconnectAudio();

    if (audioStream && audioStream.getAudioTracks().length > 0) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) {
          controller.setAudioLevel(level ?? 0);
          return;
        }
        const ctx = new Ctx();
        const src = ctx.createMediaStreamSource(audioStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.55;
        src.connect(analyser);
        void ctx.resume().catch(() => {});
        const disconnect = controller.attachAudioSource(analyser);
        audioCleanupRef.current = () => {
          disconnect();
          try { src.disconnect(); } catch { /* noop */ }
          void ctx.close().catch(() => {});
        };
        return () => {
          audioCleanupRef.current?.();
          audioCleanupRef.current = null;
        };
      } catch {
        controller.setAudioLevel(level ?? 0);
        return;
      }
    }

    controller.setAudioLevel(level ?? 0);
  }, [audioStream, level]);

  return (
    <div
      className={`orb-motion ${webglFailed ? "orb-no-webgl" : ""} ${className}`}
      data-ambient-motion={ambientMotion ? "true" : "false"}
      style={{ ["--orb-diameter" as string]: `${size}px`, width: size, height: size }}
    >
      <div className="orb-shell">
        <div className="orb-clip">
          <canvas ref={canvasRef} className="orb-canvas" aria-label={label} role="img" />
          <div className="orb-fallback" aria-hidden="true" />
        </div>
        <div className="orb-chrome" aria-hidden="true" />
      </div>
    </div>
  );
};

export default OrbloomOrb;
