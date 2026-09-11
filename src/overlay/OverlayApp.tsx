import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Users,
  MessageSquare,
  Gamepad2,
  Camera,
  Settings,
  X,
  Sparkles,
  Send,
  Loader2,
  ZoomIn,
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  CheckCircle2,
  Info,
  UserPlus,
  ChevronLeft,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
} from "lucide-react";

import achievementUnlockDefault from "../sounds/Phelierium Default/Achievment_Unlock.mp3";
import achievementUnlockGold from "../sounds/Phelierium Default/Achievment_Unlock_Gold.mp3";
import achievementUnlockPlatinum from "../sounds/Phelierium Default/Achievment_Unlock_Platinum.mp3";
import { Button } from "@/components/ui/Shandc/button";
import { useGamepadButton } from "../context/GamepadContext";
import { useGamepadFocusNavigation } from "../hooks/useGamepadFocusNavigation";

// ─── Logger Estruturado ────────────────────────────────────────────────────────
const overlayLogger = {
  info: (...args: unknown[]) => console.info("[overlay:app]", ...args),
  warn: (...args: unknown[]) => console.warn("[overlay:app]", ...args),
  error: (...args: unknown[]) => console.error("[overlay:app]", ...args),
};

// ─── Tipos do Assistente por Estados ──────────────────────────────────────────
export type OverlayMode = "passive" | "quick" | "full";
export type OverlayView = "home" | "friends" | "chat" | "achievements" | "call" | "media" | "settings";
export type InteractionSource = "keyboard" | "gamepad" | "mouse";
export type CallConnectionState = "connected" | "degraded" | "reconnecting" | "failed";

export interface AchievementToast {
  id: string;
  kind: "achievement";
  title: string;
  description: string;
  icon?: string;
  gameTitle?: string;
  percent?: number;
  unlockedAt?: string;
  tier?: "platinum" | "gold" | "silver" | "bronze";
  xpGained?: number;
  currentLevel?: number;
  currentXP?: number;
}

export interface SocialToast {
  id: string;
  kind:
    | "friend-playing"
    | "friend-request"
    | "friend-accepted"
    | "message"
    | "capture"
    | "hint"
    | "incoming-call"
    | "success"
    | "error"
    | "info"
    | string;
  title: string;
  subtitle?: string;
  description?: string;
  avatar?: string;
  message?: string;
  gameTitle?: string;
  screenshotUrl?: string;
  callerUid?: string;
  friendId?: string;
  messageCount?: number;
}

export type AnyOverlayToast = AchievementToast | SocialToast;

export interface OverlayChatMessage {
  id: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt: string;
  mine: boolean;
  pending?: boolean;
}

export interface OverlayChatSession {
  friendId: string;
  friendName: string;
  friendAvatar?: string;
  typing?: boolean;
  sending?: boolean;
  error?: string;
  messages: OverlayChatMessage[];
}

export interface ActiveCallState {
  active: boolean;
  friendId?: string;
  friendName?: string;
  friendAvatar?: string;
  muted?: boolean;
  deafened?: boolean;
  connectionState?: CallConnectionState;
  durationSeconds?: number;
}

export interface CommandPanelState {
  gameTitle?: string;
  userDisplay?: string;
  userAvatar?: string;
  playerLevel?: number;
  playerXP?: number;
  playerNextLevelXP?: number;
  playingGame?: any;
  achievements?: any[];
  friends?: any[];
  chat?: OverlayChatSession | null;
  activeCall?: ActiveCallState | null;
  screenshots?: string[];
  settings?: {
    achievementVolume?: number;
    achievementSoundTheme?: string;
    autoContrast?: boolean;
  };
}

// ─── Gerenciamento de Sons ─────────────────────────────────────────────────────
const playOverlaySound = (type: "unlock" | "welcome" | "toast" | "toggle" | "unlockGold" | "unlockPlatinum") => {
  try {
    if (type === "unlock" || type === "unlockGold" || type === "unlockPlatinum") {
      const src =
        type === "unlockPlatinum"
          ? achievementUnlockPlatinum
          : type === "unlockGold"
          ? achievementUnlockGold
          : achievementUnlockDefault;
      const audio = new Audio(src);
      audio.volume = 0.5;
      audio.play().catch((e) => overlayLogger.warn("Falha ao tocar som de conquista:", e));
      return;
    }
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === "welcome" || type === "toast") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === "toggle") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch (err) {
    overlayLogger.warn("AudioContext error:", err);
  }
};

// ─── Componente Principal ──────────────────────────────────────────────────────
const OverlayApp: React.FC = () => {
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("passive");
  const [activeView, setActiveView] = useState<OverlayView>("home");
  const [interactionSource, setInteractionSource] = useState<InteractionSource>("mouse");
  const [panelData, setPanelData] = useState<CommandPanelState>({});
  const [toasts, setToasts] = useState<AnyOverlayToast[]>([]);
  const [inputText, setInputText] = useState("");
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [autoContrast, setAutoContrast] = useState(false);

  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);

  // ─── Toast Manager Centralizado ──────────────────────────────────────────────
  const removeToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        (window as any).achievementOverlay?.panelAction?.({ kind: "toasts-cleared" });
      }
      return remaining;
    });
  }, []);

  const addToast = useCallback(
    (toast: AnyOverlayToast, durationMs = 5000) => {
      // Agrupamento inteligente para mensagens repetidas do mesmo amigo
      if (toast.kind === "message" && "friendId" in toast && toast.friendId) {
        setToasts((prev) => {
          const existing = prev.find((t) => t.kind === "message" && (t as SocialToast).friendId === toast.friendId) as
            | SocialToast
            | undefined;
          if (existing) {
            const count = (existing.messageCount || 1) + 1;
            const updated: SocialToast = {
              ...existing,
              title: `${toast.title} (${count})`,
              message: (toast as SocialToast).message,
              messageCount: count,
            };
            return prev.map((t) => (t.id === existing.id ? updated : t));
          }
          return [...prev, toast];
        });
      } else {
        setToasts((prev) => [...prev, toast]);
      }

      const timerId = window.setTimeout(() => {
        removeToast(toast.id);
      }, durationMs);
      toastTimersRef.current.set(toast.id, timerId);
    },
    [removeToast]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current.clear();
    };
  }, []);

  // ─── Conexão com IPC nativo do Electron ──────────────────────────────────────
  useEffect(() => {
    const api = (window as any).achievementOverlay;
    if (!api) {
      overlayLogger.warn("API achievementOverlay não encontrada.");
      return;
    }

    const unbindUnlock = api.onUnlock?.((payload: any) => {
      const percent = payload.percent ?? 50;
      const tier: AchievementToast["tier"] =
        percent <= 5 ? "platinum" : percent <= 20 ? "gold" : percent <= 50 ? "silver" : "bronze";
      const xpMap = { platinum: 500, gold: 200, silver: 100, bronze: 50 };
      const xpGained = xpMap[tier];

      const toast: AchievementToast = {
        id: String(Date.now() + Math.random()),
        kind: "achievement",
        title: payload.title || "Conquista Desbloqueada",
        description: payload.description || "",
        icon: payload.icon,
        gameTitle: payload.gameTitle,
        percent: payload.percent,
        unlockedAt: payload.unlockedAt,
        tier,
        xpGained,
        currentLevel: payload.currentLevel,
        currentXP: payload.currentXP,
      };
      playOverlaySound(tier === "platinum" ? "unlockPlatinum" : tier === "gold" ? "unlockGold" : "unlock");
      addToast(toast, 6500);
    });

    const unbindWelcome = api.onWelcome?.((payload: any) => {
      const toast: SocialToast = {
        id: String(Date.now() + Math.random()),
        kind: "hint",
        title: `Bem-vindo a ${payload.gameTitle || "Phelierium"}`,
        subtitle: payload.userDisplay ? `Jogando como ${payload.userDisplay}` : "Overlay ativo",
        avatar: payload.userAvatar,
      };
      playOverlaySound("welcome");
      addToast(toast, 4500);
    });

    const unbindSocial = api.onSocial?.((payload: any) => {
      const toast: SocialToast = {
        id: String(Date.now() + Math.random()),
        kind: payload.kind || "message",
        title: payload.title || "Notificação",
        subtitle: payload.subtitle,
        avatar: payload.avatar,
        message: payload.message || payload.description,
        gameTitle: payload.gameTitle,
        screenshotUrl: payload.screenshotUrl,
        callerUid: payload.callerUid,
        friendId: payload.friendId,
      };
      if (payload.kind !== "game-start") {
        playOverlaySound("toast");
      }
      addToast(toast, payload.kind === "incoming-call" ? 15000 : 5000);
    });

    const unbindVisibility = api.onPanelVisibility?.((payload: any) => {
      const shouldOpen = Boolean(payload.open || payload.visible);
      if (shouldOpen) {
        setOverlayMode((prev) => (prev === "passive" ? "quick" : prev));
      } else {
        setOverlayMode("passive");
      }
      if (payload.state) {
        setPanelData((prev) => ({ ...prev, ...payload.state }));
        if (payload.state.activeCall) setActiveCall(payload.state.activeCall);
      }
    });

    const unbindState = api.onPanelState?.((payload: any) => {
      setPanelData((prev) => ({ ...prev, ...payload }));
      if (payload.activeCall !== undefined) setActiveCall(payload.activeCall);
    });

    const unbindCommand = api.onPanelCommand?.((payload: any) => {
      playOverlaySound("toggle");
      if (payload.kind === "open-chat") {
        setOverlayMode("full");
        setActiveView("chat");
      } else if (payload.kind === "toggle") {
        setOverlayMode((prev) => (prev === "passive" ? "quick" : "passive"));
      } else if (payload.kind === "expand") {
        setOverlayMode("full");
      }
    });

    return () => {
      unbindUnlock?.();
      unbindWelcome?.();
      unbindSocial?.();
      unbindVisibility?.();
      unbindState?.();
      unbindCommand?.();
    };
  }, [addToast]);

  // Scroll chat messages to bottom
  useEffect(() => {
    if (activeView === "chat" && panelData.chat?.messages?.length) {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeView, panelData.chat?.messages]);

  // ─── Ações do Overlay ────────────────────────────────────────────────────────
  const closeOverlay = useCallback(() => {
    setOverlayMode("passive");
    (window as any).achievementOverlay?.panelAction?.({ kind: "close" });
  }, []);

  const handleStepBack = useCallback(() => {
    if (viewingImage) {
      setViewingImage(null);
    } else if (overlayMode === "full") {
      setOverlayMode("quick");
    } else if (overlayMode === "quick") {
      closeOverlay();
    }
  }, [closeOverlay, overlayMode, viewingImage]);

  // ─── Teclado & Hotkeys ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      setInteractionSource("keyboard");
      if (e.key === "Escape") {
        handleStepBack();
      } else if (e.key === "Enter" && !e.shiftKey) {
        if (
          document.activeElement &&
          document.activeElement !== document.body &&
          (document.activeElement as HTMLElement).tagName !== "INPUT" &&
          (document.activeElement as HTMLElement).tagName !== "TEXTAREA"
        ) {
          (document.activeElement as HTMLElement).click?.();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleStepBack]);

  // ─── Navegação por Gamepad ───────────────────────────────────────────────────
  const { moveSystemFocus } = useGamepadFocusNavigation({
    playSound: () => playOverlaySound("toggle"),
    activeCategory: activeView,
    isSystemCategory: true,
  });

  const isInteractive = overlayMode !== "passive";

  useGamepadButton("DPAD_UP", () => { setInteractionSource("gamepad"); moveSystemFocus("up"); }, isInteractive, 100);
  useGamepadButton("DPAD_DOWN", () => { setInteractionSource("gamepad"); moveSystemFocus("down"); }, isInteractive, 100);
  useGamepadButton("DPAD_LEFT", () => { setInteractionSource("gamepad"); moveSystemFocus("left"); }, isInteractive, 100);
  useGamepadButton("DPAD_RIGHT", () => { setInteractionSource("gamepad"); moveSystemFocus("right"); }, isInteractive, 100);
  useGamepadButton("O", () => { setInteractionSource("gamepad"); handleStepBack(); }, isInteractive, 100);
  useGamepadButton("X", () => {
    setInteractionSource("gamepad");
    const active = document.activeElement as HTMLElement | null;
    active?.click?.();
  }, isInteractive, 100);

  // ─── Handlers de Ação Social / Chamada ───────────────────────────────────────
  const handleSelectChat = (friendId: string) => {
    setOverlayMode("full");
    setActiveView("chat");
    (window as any).achievementOverlay?.panelAction?.({
      kind: "select-chat",
      friendId,
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || panelData.chat?.sending) return;

    (window as any).achievementOverlay?.panelAction?.({
      kind: "send-message",
      text,
    });
    setInputText("");
  };

  const handleCloseChat = () => {
    (window as any).achievementOverlay?.panelAction?.({ kind: "close-chat" });
  };

  const handleVoiceCall = (friendId: string, friendName: string, friendAvatar?: string) => {
    setActiveCall({
      active: true,
      friendId,
      friendName,
      friendAvatar,
      muted: false,
      deafened: false,
      connectionState: "connected",
    });
    (window as any).achievementOverlay?.panelAction?.({
      kind: "voice-call",
      friendId,
      friendName,
      friendAvatar,
    });
  };

  const handleEndCall = () => {
    setActiveCall(null);
    (window as any).achievementOverlay?.panelAction?.({ kind: "voice-reject" });
  };

  const toggleMute = () => {
    setActiveCall((prev) => (prev ? { ...prev, muted: !prev.muted } : null));
    (window as any).achievementOverlay?.panelAction?.({ kind: "voice-mute-toggle" });
  };

  const toggleDeafen = () => {
    setActiveCall((prev) => (prev ? { ...prev, deafened: !prev.deafened } : null));
    (window as any).achievementOverlay?.panelAction?.({ kind: "voice-deafen-toggle" });
  };

  // Cálculos de Conquistas e Progresso
  const achievementList = React.useMemo(() => {
    const raw = panelData.achievements;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray((raw as any).items)) return (raw as any).items;
    return [];
  }, [panelData.achievements]);

  const unlockedCount = React.useMemo(() => {
    const raw = panelData.achievements as any;
    if (typeof raw?.unlocked === "number") return raw.unlocked;
    return achievementList.filter((a: any) => a.achieved).length;
  }, [panelData.achievements, achievementList]);

  const totalCount = React.useMemo(() => {
    const raw = panelData.achievements as any;
    if (typeof raw?.available === "number" && raw.available > 0) return raw.available;
    return achievementList.length;
  }, [panelData.achievements, achievementList]);

  const achievementsLoading = Boolean((panelData.achievements as any)?.loading);
  const hasCurrentGame = Boolean(panelData.gameTitle || panelData.playingGame?.title);
  const progressPercent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  const onlineFriends = (panelData.friends || []).filter((f: any) => f.status === "online" || f.status === "playing");

  return (
    <div
      data-overlay-mode={overlayMode}
      data-interaction-source={interactionSource}
      onPointerDown={() => setInteractionSource("mouse")}
      className={`fixed inset-0 pointer-events-none z-[9999] select-none overflow-hidden bg-transparent font-sans text-white ${
        autoContrast ? "drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]" : ""
      }`}
    >
      {/* ─── TOASTS FLUTUANTES ──────────────────────────────────────────────── */}
      {/* Top Right: Toasts de Conquistas */}
      <div className="fixed top-6 right-6 flex flex-col gap-3 z-[10000] max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts
            .filter((t): t is AchievementToast => t.kind === "achievement")
            .map((toast) => {
              const tierStyles = {
                platinum: {
                  color: "#38bdf8",
                  border: "rgba(56,189,248,0.4)",
                  bg: "rgba(56,189,248,0.1)",
                  glow: "0 0 24px rgba(56,189,248,0.2)",
                  label: "PLATINA",
                },
                gold: {
                  color: "#eab308",
                  border: "rgba(234,179,8,0.4)",
                  bg: "rgba(234,179,8,0.1)",
                  glow: "0 0 20px rgba(234,179,8,0.15)",
                  label: "OURO",
                },
                silver: {
                  color: "#a3a3a3",
                  border: "rgba(163,163,163,0.3)",
                  bg: "rgba(163,163,163,0.08)",
                  glow: "",
                  label: "PRATA",
                },
                bronze: {
                  color: "#cd7f32",
                  border: "rgba(205,127,50,0.3)",
                  bg: "rgba(205,127,50,0.08)",
                  glow: "",
                  label: "BRONZE",
                },
              };
              const tier = tierStyles[toast.tier || "bronze"];
              return (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, x: 80, scale: 0.92 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 80, scale: 0.92 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col gap-2 rounded-2xl border p-3.5 backdrop-blur-xl shadow-2xl bg-black/85 pointer-events-auto"
                  style={{
                    borderColor: tier.border,
                    boxShadow: `${tier.glow}, 0 20px 50px rgba(0,0,0,0.85)`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                      style={{ borderColor: tier.border, backgroundColor: tier.bg }}
                    >
                      {toast.icon ? (
                        <img src={toast.icon} alt="" className="h-full w-full object-cover rounded-xl" />
                      ) : (
                        <Trophy className="h-5 w-5" style={{ color: tier.color }} fill="currentColor" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: tier.color }}>
                          {tier.label}
                        </span>
                        {toast.gameTitle && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-white/30" />
                            <span className="text-[10px] font-bold text-white/50 truncate">{toast.gameTitle}</span>
                          </>
                        )}
                      </div>
                      <h4 className="truncate text-xs font-bold text-white mt-0.5">{toast.title}</h4>
                      <p className="line-clamp-1 text-[11px] text-white/60">{toast.description}</p>
                    </div>
                    {toast.xpGained && (
                      <div className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 border border-emerald-500/30 bg-emerald-500/10">
                        <Sparkles className="h-3 w-3 text-emerald-400" />
                        <span className="text-[10px] font-black text-emerald-400">+{toast.xpGained}</span>
                      </div>
                    )}
                  </div>
                  {/* Contextual CTA */}
                  <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOverlayMode("full");
                        setActiveView("achievements");
                        removeToast(toast.id);
                      }}
                      className="min-h-9 rounded-lg px-3 text-[10px] font-bold uppercase tracking-wider text-sky-400 transition-colors hover:bg-white/10 hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-white"
                    >
                      Ver Detalhes →
                    </button>
                  </div>
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>

      {/* Bottom Left: Toasts Sociais e de Chamada */}
      <div className="fixed bottom-6 left-6 flex flex-col-reverse gap-3 z-[10000] max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts
            .filter((t): t is SocialToast => t.kind !== "achievement")
            .map((toast) => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: -40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -40, scale: 0.95 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-black/90 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-xl pointer-events-auto"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 border border-white/10">
                    {toast.avatar && !toast.avatar.includes("icon.ico") ? (
                      <img src={toast.avatar} alt="" className="h-full w-full object-cover" />
                    ) : toast.kind === "incoming-call" ? (
                      <PhoneIncoming className="h-5 w-5 text-emerald-400 animate-pulse" />
                    ) : toast.kind === "friend-request" ? (
                      <UserPlus className="h-5 w-5 text-sky-400" />
                    ) : toast.kind === "friend-accepted" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Info className="h-5 w-5 text-white/70" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {toast.kind === "message" && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-0.5">
                        Mensagem
                      </span>
                    )}
                    <h4 className="truncate text-xs font-bold text-white">{toast.title}</h4>
                    <p className="line-clamp-1 text-[11px] text-white/70 mt-0.5">
                      {toast.message || toast.description || toast.subtitle}
                    </p>
                  </div>
                </div>

                {/* Ações Rápidas nos Toasts */}
                {toast.kind === "incoming-call" && (
                  <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-2.5">
                    <Button
                      type="button"
                      onClick={() => {
                        (window as any).achievementOverlay?.panelAction?.({ kind: "voice-accept" });
                        removeToast(toast.id);
                      }}
                      className="h-8 rounded-xl bg-emerald-500 text-black text-xs font-black hover:bg-emerald-400"
                    >
                      <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
                      Atender
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        (window as any).achievementOverlay?.panelAction?.({ kind: "voice-reject" });
                        removeToast(toast.id);
                      }}
                      className="h-8 rounded-xl border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-black hover:bg-rose-500/20"
                    >
                      <PhoneOff className="mr-1.5 h-3.5 w-3.5" />
                      Recusar
                    </Button>
                  </div>
                )}

                {toast.kind === "message" && toast.friendId && (
                  <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectChat(toast.friendId!);
                        removeToast(toast.id);
                      }}
                      className="min-h-9 rounded-lg px-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400 transition-colors hover:bg-white/10 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-white"
                    >
                      Responder →
                    </button>
                  </div>
                )}

                {toast.kind === "friend-request" && (
                  <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOverlayMode("full");
                        setActiveView("friends");
                        removeToast(toast.id);
                      }}
                      className="min-h-9 rounded-lg px-3 text-[10px] font-bold uppercase tracking-wider text-sky-400 transition-colors hover:bg-white/10 hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-white"
                    >
                      Ver Pedido →
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* ─── MINI BARRA PERSISTENTE DE CHAMADA DE VOZ ───────────────────────── */}
      <AnimatePresence>
        {activeCall?.active && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[10020] flex items-center gap-3 rounded-full border border-emerald-500/30 bg-black/90 px-4 py-2 shadow-2xl backdrop-blur-xl pointer-events-auto"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-black text-white">{activeCall.friendName || "Em Chamada"}</span>
            </div>

            <div className="h-3.5 w-px bg-white/20" />

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={activeCall.muted ? "Ativar microfone" : "Desativar microfone"}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                  activeCall.muted ? "bg-rose-500/20 text-rose-400" : "hover:bg-white/10 text-white"
                }`}
                title={activeCall.muted ? "Microfone Desativado" : "Desativar Microfone"}
              >
                {activeCall.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={toggleDeafen}
                aria-label={activeCall.deafened ? "Ativar áudio" : "Silenciar áudio"}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                  activeCall.deafened ? "bg-rose-500/20 text-rose-400" : "hover:bg-white/10 text-white"
                }`}
                title={activeCall.deafened ? "Áudio Silenciado" : "Silenciar Áudio"}
              >
                {activeCall.deafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleEndCall}
                aria-label="Desconectar chamada"
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white transition-colors hover:bg-rose-500"
                title="Desconectar"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── QUICK DOCK LATERAL (Assistente Compacto) ────────────────────────── */}
      <AnimatePresence>
        {overlayMode === "quick" && (
          <motion.div
            initial={{ opacity: 0, x: -80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -80 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-6 top-1/2 z-[10040] flex max-h-[calc(100vh-40px)] w-[min(320px,calc(100vw-40px))] -translate-y-1/2 flex-col justify-between rounded-3xl border border-white/15 bg-[#08090c] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.88)] pointer-events-auto"
          >
            {/* Header: Usuário & Nível */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/10 overflow-hidden flex items-center justify-center">
                    {panelData.userAvatar ? (
                      <img src={panelData.userAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Gamepad2 className="h-5 w-5 text-white/70" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white">{panelData.userDisplay || "Jogador"}</h3>
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Em jogo
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeOverlay}
                  aria-label="Fechar overlay"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/60 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Game Card Resumo */}
              <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Jogo Atual</span>
                <h4 className="truncate text-sm font-black text-white">{panelData.gameTitle || "Nenhum jogo em execução"}</h4>
                {!hasCurrentGame && (
                  <p className="text-[11px] leading-relaxed text-white/60">
                    Abra um jogo pela biblioteca para acompanhar a sessão e suas conquistas.
                  </p>
                )}
                {totalCount > 0 && (
                  <div className="mt-1">
                    <div className="flex justify-between text-[10px] font-bold text-white/60 mb-1">
                      <span>Troféus: {unlockedCount} / {totalCount}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-label={`${progressPercent}% das conquistas desbloqueadas`}>
                      <div
                        className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Actions Pills */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40 px-1">Menu Rápido</span>
                <button
                  type="button"
                  onClick={() => { setActiveView("achievements"); setOverlayMode("full"); }}
                  className="flex min-h-10 items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-white/80 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  <div className="flex items-center gap-2.5">
                    <Trophy className="h-4 w-4 text-yellow-400" /> Conquistas
                  </div>
                  <span className="text-[10px] font-black text-white/40">{unlockedCount}/{totalCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveView("friends"); setOverlayMode("full"); }}
                  className="flex min-h-10 items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-white/80 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 text-sky-400" /> Amigos
                  </div>
                  <span className="text-[10px] font-black text-emerald-400">{onlineFriends.length} online</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveView("chat"); setOverlayMode("full"); }}
                  className="flex min-h-10 items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-white/80 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  <div className="flex items-center gap-2.5">
                    <MessageSquare className="h-4 w-4 text-emerald-400" /> Bate-papo
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveView("media"); setOverlayMode("full"); }}
                  className="flex min-h-10 items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-white/80 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  <div className="flex items-center gap-2.5">
                    <Camera className="h-4 w-4 text-purple-400" /> Capturas
                  </div>
                </button>
              </div>
            </div>

            {/* Footer do Quick Dock */}
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => setOverlayMode("full")}
                className="mt-3 min-h-10 w-full rounded-xl bg-white text-xs font-black text-black hover:bg-white/90"
              >
                <Maximize2 className="h-3.5 w-3.5 mr-1.5" />
                Expandir Assistente
              </Button>
              <div className="flex items-center justify-between px-1 text-[10px] text-white/40">
                <span>Shift+Tab ou Esc para sair</span>
                <button
                  type="button"
                  onClick={() => setAutoContrast((p) => !p)}
                  className="min-h-10 rounded-xl px-2 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  Contraste: {autoContrast ? "Alto" : "Padrão"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── FULL COMMAND CENTER OVERLAY ────────────────────────────────────── */}
      <AnimatePresence>
        {overlayMode === "full" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Central de comando do overlay"
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-[#030405]/95 p-6 backdrop-blur-md pointer-events-auto md:p-10"
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 15 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex h-[min(760px,calc(100vh-80px))] w-[min(1180px,calc(100vw-80px))] max-w-none overflow-hidden rounded-3xl border border-white/[0.14] bg-[#08090c] shadow-[0_30px_100px_rgba(0,0,0,0.92)]"
              data-system-page="true"
            >
              {/* Sidebar do Full Panel */}
              <div className="flex w-[216px] flex-col border-r border-white/[0.08] bg-white/[0.025] p-4 shrink-0">
                <div className="flex items-center justify-between pb-5 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 border border-white/10">
                      {panelData.userAvatar ? (
                        <img src={panelData.userAvatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Gamepad2 className="h-4 w-4 text-white/70" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-black text-white">{panelData.userDisplay || "Jogador"}</h3>
                      <p className="truncate text-[10px] font-bold text-emerald-400">Em Jogo</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverlayMode("quick")}
                    aria-label="Recolher para o dock rápido"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                    title="Recolher para Dock Lateral"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                </div>

                <nav className="mt-5 flex flex-col gap-1 flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveView("home")}
                    aria-current={activeView === "home" ? "page" : undefined}
                    className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-white ${
                      activeView === "home" ? "bg-white text-black shadow-md" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Gamepad2 className="h-4 w-4" /> Visão Geral
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("achievements")}
                    aria-current={activeView === "achievements" ? "page" : undefined}
                    className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-white ${
                      activeView === "achievements" ? "bg-white text-black shadow-md" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Trophy className="h-4 w-4" /> Conquistas
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("friends")}
                    aria-current={activeView === "friends" ? "page" : undefined}
                    className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-white ${
                      activeView === "friends" ? "bg-white text-black shadow-md" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Users className="h-4 w-4" /> Amigos
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("chat")}
                    aria-current={activeView === "chat" ? "page" : undefined}
                    className={`flex min-h-10 items-center justify-between rounded-xl px-3 py-2 text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-white ${
                      activeView === "chat" ? "bg-white text-black shadow-md" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4" /> Bate-papo
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("media")}
                    aria-current={activeView === "media" ? "page" : undefined}
                    className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-white ${
                      activeView === "media" ? "bg-white text-black shadow-md" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Camera className="h-4 w-4" /> Capturas
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("settings")}
                    aria-current={activeView === "settings" ? "page" : undefined}
                    className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-white ${
                      activeView === "settings" ? "bg-white text-black shadow-md" : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Settings className="h-4 w-4" /> Ajustes
                  </button>
                </nav>

                <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={closeOverlay}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <X className="h-4 w-4" /> Fechar Overlay (Esc)
                  </button>
                </div>
              </div>

              {/* Área Central de Conteúdo */}
              <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6 md:p-8 thin-scrollbar">
                {activeView === "home" && (
                  <div className="flex flex-col gap-6">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                        {hasCurrentGame ? "Jogo ativo" : "Nenhuma sessão ativa"}
                      </span>
                      <h2 className="mt-1 truncate text-2xl font-bold tracking-tight text-white md:text-3xl">
                        {panelData.gameTitle || "Nenhum jogo em execução"}
                      </h2>
                      {!hasCurrentGame && (
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">
                          Abra um jogo pela biblioteca para acompanhar a sessão, conquistas e amigos jogando.
                        </p>
                      )}
                    </div>
                    {!hasCurrentGame && (
                      <Button
                        type="button"
                        onClick={closeOverlay}
                        className="min-h-10 w-fit rounded-xl bg-white px-4 text-xs font-black text-black hover:bg-white/90"
                      >
                        Voltar à biblioteca
                      </Button>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Sessão atual</span>
                        <p className="mt-2 text-base font-semibold text-white">{hasCurrentGame ? "Em andamento" : "Aguardando jogo"}</p>
                      </div>
                      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Conquistas</span>
                        <p className="mt-2 text-base font-semibold text-white">{unlockedCount} / {totalCount}</p>
                      </div>
                      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Amigos online</span>
                        <p className="mt-2 text-base font-semibold text-white">{onlineFriends.length}</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeView === "achievements" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-black text-white">Conquistas do Jogo</h3>
                      <span className="text-xs font-bold text-white/60">{unlockedCount} de {totalCount} desbloqueadas</span>
                    </div>

                    {achievementsLoading ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center" aria-busy="true">
                        <Loader2 className="mb-3 h-8 w-8 animate-spin text-white/60" aria-hidden="true" />
                        <p className="text-sm font-bold text-white/70">Carregando conquistas…</p>
                      </div>
                    ) : achievementList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
                        <Trophy className="h-10 w-10 text-white/20 mb-2" />
                        <p className="text-sm font-bold text-white/70">
                          {hasCurrentGame ? "Nenhuma conquista disponível" : "Inicie um jogo para ver conquistas"}
                        </p>
                        <p className="mt-1 max-w-xs text-xs text-white/50">
                          {hasCurrentGame ? "Este jogo ainda não possui dados de conquistas para exibir." : "A biblioteca mostrará os dados assim que uma sessão começar."}
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-2.5">
                        {achievementList.map((ach: any, idx: number) => (
                          <div
                            key={ach.apiName || ach.id || idx}
                            className="flex items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3.5"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 overflow-hidden border border-white/10">
                              {ach.icon ? (
                                <img src={ach.icon} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Trophy className="h-5 w-5 text-white/70" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-white truncate">{ach.name || ach.displayName || "Conquista"}</h4>
                              <p className="text-[11px] text-white/50 mt-0.5 line-clamp-1">{ach.description || "Sem descrição"}</p>
                            </div>
                            <span
                              className={`rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-wider shrink-0 ${
                                ach.achieved
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                                  : "bg-white/5 text-white/40 border border-white/10"
                              }`}
                            >
                              {ach.achieved ? "Desbloqueada" : "Bloqueada"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeView === "friends" && (
                  <div className="flex flex-col gap-4">
                    <h3 className="text-base font-black text-white">Amigos</h3>
                    {(panelData.friends || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-14 px-6 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white/40 mb-3">
                          <Users className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <h4 className="text-sm font-bold text-white">Nenhum amigo está jogando agora</h4>
                        <p className="mt-1 max-w-xs text-xs text-white/50">
                          Você pode abrir um chat ou adicionar novos amigos para jogar junto.
                        </p>
                        <Button
                          type="button"
                          onClick={() => {
                            (window as any).achievementOverlay?.panelAction?.({ kind: "open-launcher-friends" });
                          }}
                          className="mt-4 min-h-10 rounded-xl bg-white px-5 text-xs font-bold text-black hover:bg-white/90"
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Adicionar amigo
                        </Button>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {(panelData.friends || []).map((friend: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3.5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative h-10 w-10 rounded-xl bg-white/10 shrink-0 overflow-hidden">
                              {friend.avatar ? (
                                <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-white/70">
                                  <Users className="h-5 w-5" />
                                </div>
                              )}
                              <span
                                className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-black ${
                                  friend.status === "playing"
                                    ? "bg-green-500 animate-pulse"
                                    : friend.status === "online"
                                    ? "bg-green-400"
                                    : "bg-white/20"
                                }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{friend.name || "Amigo"}</p>
                              <p className="text-[10px] text-white/40 truncate">
                                {friend.status === "playing"
                                  ? `Jogando ${friend.playing || ""}`
                                  : friend.status === "online"
                                  ? "Online"
                                  : "Offline"}
                              </p>
                            </div>
                          </div>
                          {friend.canChat && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleVoiceCall(friend.id, friend.name, friend.avatar)}
                                className="flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 px-2.5 py-1.5 text-xs font-bold transition-all"
                                title="Ligar para amigo"
                              >
                                <Phone className="h-3.5 w-3.5" /> Ligar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectChat(friend.id)}
                                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 transition-all"
                              >
                                <MessageSquare className="h-3.5 w-3.5" /> Chat
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                )}

                {activeView === "chat" && (
                  <div className="flex flex-col h-full gap-4">
                    {panelData.chat ? (
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08] mb-4">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={handleCloseChat}
                              aria-label="Voltar para amigos"
                              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <div className="h-9 w-9 rounded-xl bg-white/10 overflow-hidden shrink-0">
                              {panelData.chat.friendAvatar ? (
                                <img src={panelData.chat.friendAvatar} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-white/60">
                                  <Users className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">{panelData.chat.friendName}</h4>
                              <p className="text-[10px] text-emerald-400 font-bold">
                                {panelData.chat.typing ? "Digitando..." : "Em conversa"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleVoiceCall(
                                panelData.chat?.friendId || "",
                                panelData.chat?.friendName || "",
                                panelData.chat?.friendAvatar
                              )
                            }
                            className="flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 px-3 py-1.5 text-xs font-bold transition-all"
                          >
                            <Phone className="h-3.5 w-3.5" /> Ligar
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 thin-scrollbar">
                          {panelData.chat.messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-xs text-white/50">
                              <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                              <span>Nenhuma mensagem anterior.</span>
                              <span className="mt-1 text-[11px] text-white/40">Envie uma mensagem para iniciar a conversa.</span>
                            </div>
                          ) : (
                            panelData.chat.messages.map((msg) => (
                              <div key={msg.id} className={`flex ${msg.mine ? "justify-end" : "justify-start"}`}>
                                <div
                                  className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-md ${
                                    msg.mine
                                      ? "bg-white text-black font-medium"
                                      : "bg-white/[0.07] border border-white/10 text-white"
                                  }`}
                                >
                                  {msg.attachmentUrl && (
                                    <div className="mb-2 overflow-hidden rounded-xl border border-black/10">
                                      <button
                                        type="button"
                                        onClick={() => setViewingImage(msg.attachmentUrl!)}
                                        className="relative group block w-full cursor-pointer"
                                      >
                                        <img src={msg.attachmentUrl} alt="Anexo" className="max-h-48 w-full object-cover rounded-xl" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity">
                                          <ZoomIn className="h-6 w-6 text-white" />
                                        </div>
                                      </button>
                                    </div>
                                  )}
                                  {msg.text && <p className="break-words leading-relaxed">{msg.text}</p>}
                                  <span className={`mt-1 block text-right text-[9px] font-bold ${msg.mine ? "text-black/50" : "text-white/40"}`}>
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                          <div ref={chatMessagesEndRef} />
                        </div>

                        <form onSubmit={handleSendMessage} className="mt-4 flex items-center gap-2">
                          <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder={`Enviar mensagem para ${panelData.chat.friendName}...`}
                            aria-label={`Mensagem para ${panelData.chat.friendName}`}
                            className="min-h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={!inputText.trim() || panelData.chat.sending}
                            aria-label={panelData.chat.sending ? "Enviando mensagem" : "Enviar mensagem"}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-40"
                          >
                            {panelData.chat.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <h3 className="text-base font-black text-white">Selecione um Amigo para Conversar</h3>
                        {(panelData.friends || []).filter((f: any) => f.canChat).length === 0 ? (
                          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
                            <MessageSquare className="mb-3 h-9 w-9 text-white/20" aria-hidden="true" />
                            <p className="text-sm font-bold text-white/70">Nenhuma conversa disponível</p>
                            <p className="mt-1 max-w-xs text-xs text-white/50">Quando um amigo estiver disponível, você poderá iniciar um chat aqui.</p>
                          </div>
                        ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {(panelData.friends || [])
                            .filter((f: any) => f.canChat)
                            .map((friend: any, idx: number) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleSelectChat(friend.id)}
                                className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4 text-left transition-all hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white"
                              >
                                <div className="h-9 w-9 rounded-xl bg-white/10 overflow-hidden shrink-0">
                                  {friend.avatar ? (
                                    <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-white/60">
                                      <Users className="h-4 w-4" />
                                    </div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-white truncate">{friend.name}</p>
                                  <p className="text-[10px] text-white/40 truncate">Clique para abrir chat</p>
                                </div>
                              </button>
                            ))}
                         </div>
                         )}
                       </div>
                     )}
                   </div>
                 )}

                {activeView === "media" && (
                  <div className="flex flex-col gap-4">
                    <h3 className="text-base font-black text-white">Capturas de Tela</h3>
                    {(panelData.screenshots || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
                        <Camera className="mb-3 h-9 w-9 text-white/20" aria-hidden="true" />
                        <p className="text-sm font-bold text-white/70">Nenhuma captura ainda</p>
                        <p className="mt-1 max-w-xs text-xs text-white/50">As capturas feitas durante a partida aparecerão aqui.</p>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {(panelData.screenshots || []).map((url: string, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setViewingImage(url)}
                          aria-label={`Abrir captura ${idx + 1}`}
                          className="relative h-32 cursor-pointer overflow-hidden rounded-xl border border-white/10 text-left transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-white"
                        >
                          <img src={url} alt="Captura" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <ZoomIn className="h-6 w-6 text-white drop-shadow-md" />
                          </div>
                        </button>
                      ))}
                    </div>
                   )}
                  </div>
                )}

                {activeView === "settings" && (
                  <div className="flex flex-col gap-4 max-w-lg">
                    <h3 className="text-base font-black text-white">Ajustes do Overlay</h3>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-white block">Modo Alto Contraste</span>
                          <span className="text-[10px] text-white/50">Melhora legibilidade sobre jogos com fundos claros</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAutoContrast((p) => !p)}
                          aria-pressed={autoContrast}
                          className={`min-h-10 rounded-xl px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-white ${
                            autoContrast ? "bg-emerald-500 text-black" : "bg-white/10 text-white/60"
                          }`}
                        >
                          {autoContrast ? "Ativado" : "Desativado"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── VISUALIZADOR DE IMAGEM LIGHTBOX ─────────────────────────────────── */}
      <AnimatePresence>
        {viewingImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10100] flex items-center justify-center bg-black/90 backdrop-blur-2xl pointer-events-auto p-8"
            onClick={() => setViewingImage(null)}
          >
            <div
              className="relative max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/15 bg-black/80 shadow-2xl p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setViewingImage(null)}
                aria-label="Fechar imagem"
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white transition-all hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
              >
                <X className="h-5 w-5" />
              </button>
              <img src={viewingImage} alt="Captura ampliada" className="max-h-[80vh] max-w-full rounded-xl object-contain" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OverlayApp;
