import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Volume1,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  Phone,
  PhoneOff,
  Minimize2,
  Maximize,
  Maximize2,
  Radio,
  Settings,
  X,
  Keyboard,
  Sliders,
  Check,
  Activity,
  Headphones,
  Camera,
  Pin,
  PinOff,
  LayoutGrid,
  PictureInPicture2,
  Scaling,
  Scan,
  Tv,
  Link2,
  UserPlus,
  Gamepad2,
  Swords,
  Lock,
  Unlock,
  Palette,
  Sparkles,
  Loader2,
  BookOpen,
  MessageSquare,
} from "lucide-react";
import type { SocialFriend, UserProfile, VoiceCallSession, CallState } from "../../types/domain";
import type { CallRoomConfig } from "../../types/voice-governance";
import { Button } from "@/components/ui/Shandc/button";
import { Badge } from "@/components/ui/Shandc/badge";
import { ParticipantContextMenu } from "./ParticipantContextMenu";
import { ChannelInviteModal } from "./ChannelInviteModal";
import { CallPrivacyPanel } from "./CallPrivacyPanel";
import { CreateChannelModal } from "./CreateChannelModal";
import { CallTelemetryLeft, CallTelemetryRight } from "./CallTelemetryOverlay";
import spaceBgVideo from "../../assets/Space-BG.webm";
import friendCallingVideo from "../../assets/BG-Video-Calling.webm";
import friendConnectedVideo from "../../assets/BG-Video-Friend.webm";

interface VoiceCallWindowProps {
  isOpen: boolean;
  onClose: () => void;
  session: VoiceCallSession | null;
  userProfile: UserProfile | null;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  localCameraStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  duration: number;
  callState?: CallState;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeakingLocal: boolean;
  isSpeakingRemote: boolean;
  isRemoteMuted?: boolean;
  isRemoteDeafened?: boolean;
  isCameraOn?: boolean;
  isRemoteCameraOn?: boolean;
  isSharingScreen: boolean;
  isRemoteSharingScreen: boolean;
  remoteVolume?: number;
  onChangeRemoteVolume?: (val: number) => void;
  peerVolumes?: Record<string, number>;
  onSetPeerVolume?: (peerId: string, val: number) => void;
  isReconnecting?: boolean;
  inputMode?: "voice-activity" | "push-to-talk";
  setInputMode?: (mode: "voice-activity" | "push-to-talk") => void;
  pushToTalkKey?: string;
  setPushToTalkKey?: (key: string) => void;
  isPttPressed?: boolean;
  isMicMonitoring?: boolean;
  onChangeMicMonitoring?: (val: boolean) => void;
  audioInputDevices?: MediaDeviceInfo[];
  audioOutputDevices?: MediaDeviceInfo[];
  videoInputDevices?: MediaDeviceInfo[];
  selectedAudioInput?: string;
  selectedAudioOutput?: string;
  selectedVideoInput?: string;
  onChangeAudioInputDevice?: (deviceId: string) => void;
  onChangeAudioOutputDevice?: (deviceId: string) => void;
  onChangeVideoInputDevice?: (deviceId: string) => void;
  voiceSensitivity?: number;
  onChangeVoiceSensitivity?: (val: number) => void;
  echoCancellation?: boolean;
  onChangeEchoCancellation?: (val: boolean) => void;
  noiseSuppression?: boolean;
  onChangeNoiseSuppression?: (val: boolean) => void;
  advancedNoiseSuppression?: boolean;
  onChangeAdvancedNoiseSuppression?: (val: boolean) => void;
  autoGainControl?: boolean;
  onChangeAutoGainControl?: (val: boolean) => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  onHangUp?: () => void;
  onKickParticipant?: (targetUserId: string) => void;
  onUpdateRoomPrivacy?: (isPrivate: boolean, password?: string) => Promise<void> | void;
  onUpdateRoomAppearance?: (config: CallRoomConfig) => Promise<void> | void;
  onEndCallForEveryone?: () => void;
  socialFriends?: SocialFriend[];
  roomConfig?: CallRoomConfig | null;
  notify?: (msg: string, type: "success" | "error" | "info") => void;
  remoteSpeakingStates?: Map<string, boolean>;
  remoteStreams?: Map<string, MediaStream>;
  remoteStatesMap?: Map<string, any>;
  micGain?: number;
  onChangeMicGain?: (val: number) => void;
  noiseGateEnabled?: boolean;
  onChangeNoiseGateEnabled?: (val: boolean) => void;
  onCalibrateNoise?: () => Promise<any>;
  isCalibratingNoise?: boolean;
  currentNoiseFloor?: number;
}

export type CallFeedId =
  | "remote-screen"
  | "remote-camera"
  | "remote-user"
  | "local-screen"
  | "local-camera"
  | "local-user"
  | string;

export interface CallFeed {
  id: CallFeedId;
  type: "video" | "voice";
  stream?: MediaStream | null;
  /** Camera stream rendered inside the avatar circle on voice cards */
  cameraStream?: MediaStream | null;
  title: string;
  subtitle?: string;
  tag?: string;
  avatar?: string | null;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isScreen?: boolean;
  isCamera?: boolean;
  isRinging?: boolean;
  isConnecting?: boolean;
  isDisconnected?: boolean;
}

const formatDuration = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

/**
 * Reusable video element for WebRTC / MediaStream rendering
 */
const VideoRenderer: React.FC<{
  stream: MediaStream | null;
  fitMode?: "contain" | "cover";
  muted?: boolean;
  className?: string;
  onVideoElement?: (el: HTMLVideoElement | null) => void;
}> = ({ stream, fitMode = "contain", muted = true, className = "", onVideoElement }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncVideo = () => {
      if (!stream || stream.getVideoTracks().length === 0) {
        video.srcObject = null;
        return;
      }
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      video.play().catch(() => { });
    };

    syncVideo();

    if (stream) {
      stream.addEventListener("addtrack", syncVideo);
      stream.addEventListener("removetrack", syncVideo);
      const tracks = stream.getVideoTracks();
      tracks.forEach((t) => {
        t.addEventListener("unmute", syncVideo);
        t.addEventListener("ended", syncVideo);
      });
      return () => {
        stream.removeEventListener("addtrack", syncVideo);
        stream.removeEventListener("removetrack", syncVideo);
        tracks.forEach((t) => {
          t.removeEventListener("unmute", syncVideo);
          t.removeEventListener("ended", syncVideo);
        });
      };
    }
  }, [stream]);

  return (
    <video
      ref={(el) => {
        videoRef.current = el;
        onVideoElement?.(el);
      }}
      autoPlay
      playsInline
      muted={true}
      className={`h-full w-full ${fitMode === "cover" ? "object-cover" : "object-contain"} ${className}`}
    />
  );
};

export const VoiceCallWindow: React.FC<VoiceCallWindowProps> = ({
  isOpen,
  onClose,
  session,
  userProfile,
  remoteStream,
  localStream,
  localCameraStream,
  localScreenStream,
  duration,
  callState,
  isMuted,
  isDeafened,
  isSpeakingLocal,
  isSpeakingRemote,
  isRemoteMuted = false,
  isRemoteDeafened = false,
  isCameraOn = false,
  isRemoteCameraOn = false,
  isSharingScreen,
  isRemoteSharingScreen,
  remoteVolume = 100,
  onChangeRemoteVolume,
  peerVolumes = {},
  onSetPeerVolume,
  isReconnecting = false,
  inputMode = "voice-activity",
  setInputMode,
  pushToTalkKey = "F8",
  setPushToTalkKey,
  isPttPressed = false,
  isMicMonitoring = false,
  onChangeMicMonitoring,
  audioInputDevices = [],
  audioOutputDevices = [],
  videoInputDevices = [],
  selectedAudioInput = "default",
  selectedAudioOutput = "default",
  selectedVideoInput = "default",
  onChangeAudioInputDevice,
  onChangeAudioOutputDevice,
  onChangeVideoInputDevice,
  voiceSensitivity = 35,
  onChangeVoiceSensitivity,
  echoCancellation = true,
  onChangeEchoCancellation,
  noiseSuppression = true,
  onChangeNoiseSuppression,
  advancedNoiseSuppression = true,
  onChangeAdvancedNoiseSuppression,
  autoGainControl = true,
  onChangeAutoGainControl,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onKickParticipant,
  onHangUp,
  onEndCallForEveryone,
  socialFriends = [],
  roomConfig,
  onUpdateRoomPrivacy,
  onUpdateRoomAppearance,
  notify = () => { },
  remoteSpeakingStates,
  remoteStreams,
  remoteStatesMap,
  micGain,
  onChangeMicGain,
  noiseGateEnabled,
  onChangeNoiseGateEnabled,
  onCalibrateNoise,
  isCalibratingNoise,
  currentNoiseFloor,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeVideoElRef = useRef<HTMLVideoElement | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecordingKey, setIsRecordingKey] = useState(false);
  const [isVolumeSliderOpen, setIsVolumeSliderOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isEditAppearanceModalOpen, setIsEditAppearanceModalOpen] = useState(false);

  // Focus & Display Controls (Discord style Spotlight / Grid)
  const [focusedFeedId, setFocusedFeedId] = useState<CallFeedId | null>(null);
  const [videoFitMode, setVideoFitMode] = useState<"contain" | "cover">("contain");
  const [isStreamFullscreen, setIsStreamFullscreen] = useState(false);
  const [showControlsInStreamFullscreen, setShowControlsInStreamFullscreen] = useState(true);
  const controlsTimeoutRef = useRef<number | null>(null);

  const handleStreamMouseMove = () => {
    setShowControlsInStreamFullscreen(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      setShowControlsInStreamFullscreen(false);
    }, 3000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isStreamFullscreen) {
        setIsStreamFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isStreamFullscreen]);

  // Live test meter level (RMS) for Settings popover with strict AudioContext cleanup
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    feed: CallFeed;
  } | null>(null);
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
  const [locallyMutedFeeds, setLocallyMutedFeeds] = useState<Record<string, boolean>>({});

  // On-Demand Stream Watching state (Requirement 3)
  const [watchedStreams, setWatchedStreams] = useState<Record<string, boolean>>({
    "local-screen": true,
    "local-camera": true,
  });

  // Invite Link Copy state (Requirement 4)
  const [isCopiedInvite, setIsCopiedInvite] = useState(false);

  // Sync native Electron fullscreen state on mount
  useEffect(() => {
    if (window.electronAPI?.isFullScreen) {
      void window.electronAPI.isFullScreen().then((full) => {
        setIsFullscreen(Boolean(full));
      });
    }
  }, [isOpen]);

  // Discord-style Auto-Focus Logic
  // When a remote user starts sharing screen, auto-spotlight their stream
  const prevRemoteSharingRef = useRef(isRemoteSharingScreen);
  useEffect(() => {
    if (!prevRemoteSharingRef.current && isRemoteSharingScreen) {
      setFocusedFeedId("remote-screen");
    } else if (prevRemoteSharingRef.current && !isRemoteSharingScreen) {
      if (focusedFeedId === "remote-screen") {
        // Camera is now embedded in remote-user card, return to grid
        setFocusedFeedId(null);
      }
    }
    prevRemoteSharingRef.current = isRemoteSharingScreen;
  }, [isRemoteSharingScreen, focusedFeedId]);

  // Clean up focus if the focused feed is turned off
  useEffect(() => {
    if (focusedFeedId === "local-screen" && !isSharingScreen) {
      setFocusedFeedId(null);
    }
    if (focusedFeedId === "remote-screen" && !isRemoteSharingScreen) {
      setFocusedFeedId(null);
    }
  }, [focusedFeedId, isRemoteSharingScreen, isSharingScreen]);

  // Live Microphone Test Level inside Settings with thorough AudioContext cleanup
  useEffect(() => {
    if (!isSettingsOpen || !localStream) {
      setMicVolumeLevel(0);
      return;
    }

    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let animId: number | null = null;
    let isCancelled = false;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
        source = ctx.createMediaStreamSource(localStream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        const data = new Float32Array(analyser.fftSize);

        const tick = () => {
          if (isCancelled || !analyser) return;
          analyser.getFloatTimeDomainData(data);
          let sumSquares = 0;
          for (let i = 0; i < data.length; i += 1) {
            sumSquares += data[i] * data[i];
          }
          const rms = Math.sqrt(sumSquares / data.length);
          const level = Math.min(100, Math.round(rms * 700));
          setMicVolumeLevel(level);
          animId = requestAnimationFrame(tick);
        };

        animId = requestAnimationFrame(tick);
      }
    } catch (e) {
      console.warn("[VoiceCallWindow] Mic test analyser error:", e);
    }

    return () => {
      isCancelled = true;
      if (animId) cancelAnimationFrame(animId);
      if (source) {
        try {
          source.disconnect();
        } catch { }
      }
      if (analyser) {
        try {
          analyser.disconnect();
        } catch { }
      }
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => { });
      }
      setMicVolumeLevel(0);
    };
  }, [isSettingsOpen, localStream]);



  const defaultInputLabel =
    audioInputDevices.find((d) => d.deviceId === "default" && d.label)?.label ||
    audioInputDevices[0]?.label ||
    "";

  const defaultOutputLabel =
    audioOutputDevices.find((d) => d.deviceId === "default" && d.label)?.label ||
    audioOutputDevices[0]?.label ||
    "";

  const defaultVideoLabel =
    videoInputDevices.find((d) => d.deviceId === "default" && d.label)?.label ||
    videoInputDevices[0]?.label ||
    "";

  // Build the list of active feeds for Grid & Focus mode
  const isRoomSession = Boolean(session?.roomName || (session?.participants && session.participants.length > 0));

  const activeFeeds: CallFeed[] = useMemo(() => {
    if (!session) return [];
    const feeds: CallFeed[] = [];

    const isRoom = Boolean(session.roomName || (session.participants && session.participants.length > 0));
    const remoteParticipants = (session.participants || []).filter((p) => p.uid !== userProfile?.uid);

    const isRingingOut = callState === "ringing-out";
    const isConnecting = callState === "connecting";

    if (isRoom) {
      // 1. Participantes remotos reais da sala (apenas quem está na lista de participantes da sala ou com stream ativo)
      const activeUids = new Set<string>();
      (session.participants || []).forEach((p) => {
        if (p.uid && p.uid !== userProfile?.uid) activeUids.add(p.uid);
      });
      if (remoteStreams && remoteStreams instanceof Map) {
        remoteStreams.forEach((stream, peerId) => {
          if (peerId && peerId !== userProfile?.uid && peerId !== "local-user" && stream && stream.active) {
            activeUids.add(peerId);
          }
        });
      }

      const participantList = Array.from(activeUids).map((uid) => {
        const explicit = (session.participants || []).find((p) => p.uid === uid);
        const social = socialFriends?.find((f) => f.id === uid || f.id === `cp-friend:${uid}`);
        return {
          uid,
          name: explicit?.name || social?.name || (uid === session.friendUid ? session.friendName : `Jogador ${uid.slice(0, 4)}`),
          avatar: explicit?.avatar || social?.avatar || (uid === session.friendUid ? session.friendAvatar : undefined),
        };
      });

      participantList.forEach((p) => {
        const stream = remoteStreams?.get(p.uid) || (p.uid === session.friendUid ? remoteStream : null);
        const isSpeaking = remoteSpeakingStates?.get(p.uid) ?? false;
        const remoteState = remoteStatesMap?.get(p.uid);

        feeds.push({
          id: `remote-user:${p.uid}`,
          type: "voice",
          title: p.name,
          subtitle: isRingingOut
            ? "Chamando..."
            : isConnecting
              ? "Conectando..."
              : isSpeaking
                ? "Falando..."
                : "Conectado",
          avatar: p.avatar,
          stream,
          cameraStream: remoteState?.isCameraOn && !remoteState?.isSharingScreen ? stream : null,
          isLocal: false,
          isSpeaking,
          isMuted: remoteState?.isMuted ?? false,
          isDeafened: remoteState?.isDeafened ?? false,
          isCamera: remoteState?.isCameraOn ?? false,
          isRinging: isRingingOut,
          isConnecting: isConnecting,
        });

        if (remoteState?.isSharingScreen && stream) {
          feeds.push({
            id: `remote-screen:${p.uid}`,
            type: "video",
            stream,
            title: `Tela de ${p.name}`,
            subtitle: "Transmissão de Tela",
            tag: "AO VIVO",
            isLocal: false,
            isSpeaking,
            isMuted: remoteState?.isMuted ?? false,
            isDeafened: remoteState?.isDeafened ?? false,
            isScreen: true,
          });
        }
      });
    } else if (session.friendUid && session.friendUid !== userProfile?.uid) {
      // 2. Chamada 1:1 direta
      feeds.push({
        id: "remote-user",
        type: "voice",
        title: session.friendName,
        subtitle: isRingingOut
          ? "Chamando..."
          : isConnecting
            ? "Conectando..."
            : isSpeakingRemote
              ? "Falando..."
              : "Conectado",
        avatar: session.friendAvatar,
        cameraStream: isRemoteCameraOn && !isRemoteSharingScreen ? remoteStream : null,
        isLocal: false,
        isSpeaking: isSpeakingRemote,
        isMuted: isRemoteMuted,
        isDeafened: isRemoteDeafened,
        isCamera: isRemoteCameraOn && !isRemoteSharingScreen,
        isRinging: isRingingOut,
        isConnecting: isConnecting,
      });
    }

    // 3. Remote Screen Share Feed
    if (isRemoteSharingScreen && remoteStream) {
      feeds.push({
        id: "remote-screen",
        type: "video",
        stream: remoteStream,
        title: isRoom ? "Transmissão da Sala" : `Tela de ${session.friendName}`,
        subtitle: "Transmissão de Tela",
        tag: "AO VIVO",
        isLocal: false,
        isSpeaking: isSpeakingRemote,
        isMuted: isRemoteMuted,
        isDeafened: isRemoteDeafened,
        isScreen: true,
      });
    }

    // 4. Local Screen Share Feed
    if (isSharingScreen && localScreenStream) {
      feeds.push({
        id: "local-screen",
        type: "video",
        stream: localScreenStream,
        title: "Sua Transmissão",
        subtitle: "Visualização da sua tela",
        tag: "AO VIVO • VOCÊ",
        isLocal: true,
        isSpeaking: isSpeakingLocal,
        isMuted: isMuted,
        isDeafened: isDeafened,
        isScreen: true,
      });
    }

    // 5. Local Participant Voice Card
    feeds.push({
      id: "local-user",
      type: "voice",
      title: userProfile?.displayName || "Você",
      subtitle: isConnecting ? "Conectando..." : isSpeakingLocal ? "Falando..." : "Conectado",
      avatar: userProfile?.photoURL,
      cameraStream: isCameraOn ? localCameraStream : null,
      isLocal: true,
      isSpeaking: isSpeakingLocal,
      isMuted: isMuted,
      isDeafened: isDeafened,
      isCamera: isCameraOn,
      isConnecting: isConnecting,
    });

    return feeds;
  }, [
    session,
    callState,
    isRemoteSharingScreen,
    remoteStream,
    remoteStreams,
    remoteStatesMap,
    remoteSpeakingStates,
    isSpeakingRemote,
    isRemoteMuted,
    isRemoteDeafened,
    isRemoteCameraOn,
    isSharingScreen,
    localScreenStream,
    isSpeakingLocal,
    isMuted,
    isDeafened,
    isCameraOn,
    localCameraStream,
    userProfile?.displayName,
    userProfile?.photoURL,
    userProfile?.uid,
    socialFriends,
  ]);

  // Identify remote participant count and if user is alone in room
  const remoteParticipantsCount = activeFeeds.filter((f) => !f.isLocal && !f.isScreen && !f.isRinging && !f.isConnecting).length;
  const isOnlyOnePersonInRoom = remoteParticipantsCount === 0;

  // Identify currently focused feed
  const focusedFeed = activeFeeds.find((f) => f.id === focusedFeedId) || null;
  const isFocusedMode = Boolean(focusedFeed);

  const handleCopyInviteLink = () => {
    if (!session?.chatId) return;
    const inviteUrl = `https://phelierium.com/call?id=${session.chatId}`;
    void navigator.clipboard.writeText(inviteUrl);
    setIsCopiedInvite(true);
    setTimeout(() => setIsCopiedInvite(false), 2500);
  };

  const categoryPresets: Record<string, { label: string; icon: React.ReactNode }> = {
    resenha_games: { label: "Resenha & Games", icon: <Gamepad2 className="h-3 w-3 text-white" /> },
    gameplay_foco: { label: "Só Gameplay", icon: <Swords className="h-3 w-3 text-white" /> },
    estudos_foco: { label: "Foco & Estudos", icon: <BookOpen className="h-3 w-3 text-white" /> },
    casual_chat: { label: "Conversa Livre", icon: <MessageSquare className="h-3 w-3 text-white" /> },
  };

  const currentCategory = categoryPresets[session?.category || "resenha_games"] || categoryPresets.resenha_games;

  const handleFeedContextMenu = (e: React.MouseEvent, feed: CallFeed) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      feed,
    });
  };

  // Toggle focus on click / double click
  const handleToggleFocus = (feedId: CallFeedId) => {
    if (focusedFeedId === feedId) {
      setFocusedFeedId(null);
    } else {
      setFocusedFeedId(feedId);
      // Auto-watch stream when focused
      setWatchedStreams((prev) => ({ ...prev, [feedId]: true }));
    }
  };

  // Picture-in-Picture helper
  const handleTogglePip = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (activeVideoElRef.current && document.pictureInPictureEnabled) {
        await activeVideoElRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("[VoiceCallWindow] PiP failed:", err);
    }
  };

  const toggleFullscreen = async () => {
    if (window.electronAPI?.toggleFullScreen) {
      const isFull = await window.electronAPI.toggleFullScreen();
      setIsFullscreen(Boolean(isFull));
      return;
    }
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (!isOpen || !session) return null;

  const AudioFader: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    unit?: string;
    onChange: (val: number) => void;
    marks?: number[];
    accentClass?: string;
  }> = ({ label, value, min, max, unit = "%", onChange, marks, accentClass = "accent-white" }) => {
    const pct = ((value - min) / (max - min)) * 100;
    const scaleMarks = marks || [min, min + (max - min) * 0.5, max];

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/50">
          <span>{label}</span>
          <span className="font-mono text-xs text-white/90 tabular-nums">
            {value}
            <span className="text-white/40">{unit}</span>
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, currentColor ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
          }}
          className={`w-full h-1.5 rounded-full ${accentClass} text-white cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,255,255,0.5)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black/50 [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110`}
        />
        <div className="flex justify-between px-0.5">
          {scaleMarks.map((m, i) => (
            <span key={i} className="text-[10px] font-medium font-mono text-white/25">
              {Math.round(m)}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9995] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl select-none">
        <motion.div
          ref={containerRef}
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="relative flex flex-col w-full max-w-6xl h-[88vh] overflow-hidden rounded-[22px] border border-white/10 bg-[#080808] shadow-[0_30px_90px_rgba(0,0,0,0.9)]"
        >
          {/* Top Bar Header — h-14 consistent */}
          <div className="flex items-center justify-between h-14 px-6 border-b border-white/[0.08] bg-[#0a0a0a] z-20">
            {/* Left Info: Friend & Duration & Focus Indicator & Category */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/15">
                <Radio className="h-4.5 w-4.5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                  {callState === "ringing-out" ? (
                    <span className="text-[11px] font-bold text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 animate-pulse flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                      <Phone className="h-3 w-3 animate-bounce" /> Chamando...
                    </span>
                  ) : callState === "connecting" ? (
                    <span className="text-[11px] font-bold text-sky-300 bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-500/30 animate-pulse flex items-center gap-1.5 shadow-[0_0_12px_rgba(14,165,233,0.2)]">
                      <Loader2 className="h-3 w-3 animate-spin text-sky-300" /> Conectando...
                    </span>
                  ) : (
                    <span className="text-xs font-mono font-medium text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded-md border border-emerald-500/30 flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{formatDuration(duration)}</span>
                    </span>
                  )}
                  {isFocusedMode && focusedFeed && (
                    <Badge
                      variant="secondary"
                      className="hidden sm:inline-flex h-6 gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 text-[10px] font-semibold text-white/90"
                    >
                      <Pin className="h-3 w-3 fill-white" />
                      <span>Focado: {focusedFeed.title}</span>
                    </Badge>
                  )}
                  {/* Room-specific badges (Only for persistent voice rooms / channels) */}
                  {isRoomSession && (
                    <>
                      {/* Category Pill */}
                      <Badge
                        variant="outline"
                        className="hidden lg:inline-flex h-6 gap-1.5 rounded-full border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-semibold text-white/70"
                      >
                        {currentCategory.icon}
                        <span>{currentCategory.label}</span>
                      </Badge>

                      {/* Room Privacy Button */}
                      <button
                        type="button"
                        onClick={() => setIsPrivacyModalOpen(true)}
                        className={`hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md border transition cursor-pointer ${session?.isPrivate || roomConfig?.isPrivate
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
                          : "bg-white/5 border-white/8 text-white/70 hover:bg-white/10 hover:text-white"
                          }`}
                        title={
                          session?.isPrivate || roomConfig?.isPrivate
                            ? "Chamada Privada (requer senha) - Clique para gerenciar"
                            : "Chamada Aberta - Clique para privar com senha"
                        }
                      >
                        {session?.isPrivate || roomConfig?.isPrivate ? (
                          <>
                            <Lock className="h-3 w-3 text-amber-400" />
                            <span>Privada</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="h-3 w-3 text-white/60" />
                            <span>Pública</span>
                          </>
                        )}
                      </button>

                      {/* Edit Appearance Button (Admin only) */}
                      {Boolean(session?.adminId === userProfile?.uid || roomConfig?.adminId === userProfile?.uid || !session?.adminId) && (
                        <button
                          type="button"
                          onClick={() => setIsEditAppearanceModalOpen(true)}
                          className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/12 border border-white/8 text-white/80 hover:text-white transition cursor-pointer"
                          title="Editar aparência e configurações do canal (Nome, Ícone, Cor)"
                        >
                          <Palette className="h-3 w-3 text-white/70" />
                          <span>Editar Canal</span>
                        </button>
                      )}
                    </>
                  )}
                </h2>
                <p className="text-[10px] text-white/35 mt-0.5">
                  {isRoomSession ? (session.roomName || "Canal de Voz Phelierium") : "Chamada Direta Phelierium"}
                </p>
              </div>
            </div>

            {/* Right Actions: Invite Friends Button, View Mode Switcher, Fullscreen, Minimize */}
            <div className="flex items-center gap-2">
              {/* Invite Friends Modal Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsInviteModalOpen(true)}
                title="Convidar amigos para a chamada"
                className="h-9 gap-1.5 rounded-xl border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white shadow-none hover:bg-white/[0.09] hover:text-white"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Convidar</span>
              </Button>

              {/* View Switcher: Grid vs Focus — Grade active white pill, Foco ghost per audit */}
              <div className="flex items-center gap-1 bg-white/6 p-1 rounded-full border border-white/8">
                <Button
                  type="button"
                  variant={!isFocusedMode ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFocusedFeedId(null)}
                  title="Visualização em Grade (Todos os participantes)"
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-colors ${!isFocusedMode
                    ? "bg-white text-black font-bold hover:!bg-white hover:!text-black"
                    : "text-white/60 hover:text-white/85 hover:bg-white/10 font-medium"
                    }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Grade</span>
                </Button>
                <Button
                  type="button"
                  variant={isFocusedMode ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    if (!isFocusedMode) {
                      const firstVideo = activeFeeds.find((f) => f.type === "video") || activeFeeds[0];
                      if (firstVideo) setFocusedFeedId(firstVideo.id);
                    }
                  }}
                  title="Modo Foco / Destaque"
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-colors ${isFocusedMode
                    ? "bg-white text-black font-bold hover:!bg-white hover:!text-black"
                    : "text-white/60 hover:text-white/85 hover:bg-white/10 font-medium"
                    }`}
                >
                  <Pin className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Foco</span>
                </Button>
              </div>

              {/* Fullscreen Button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void toggleFullscreen()}
                title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                className="h-9 w-9 rounded-xl text-white/60 hover:bg-white/[0.08] hover:text-white"
              >
                <Maximize className="h-4 w-4" />
              </Button>

              {/* Minimize Call Button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                title="Minimizar chamada"
                className="h-9 w-9 rounded-xl text-white/60 hover:bg-white/[0.08] hover:text-white"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Reconnection Alert Banner */}
          {isReconnecting && (
            <div className="flex items-center justify-center gap-2 bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 text-amber-300 text-xs font-bold animate-pulse z-10">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <span>Conexão de voz instável. Reconectando via ICE restart...</span>
            </div>
          )}

          {/* Global Connecting Status Bar — consolidated, replaces per-card duplicates */}
          {callState === "connecting" && !isReconnecting && (
            <div className="flex items-center justify-center gap-2 bg-white/[0.04] border-b border-white/10 px-4 py-2 text-white/80 text-xs font-medium z-10">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white/70" />
              <span>Conectando...</span>
            </div>
          )}

          {/* Main Stage & Content Area */}
          <div className="relative flex-1 overflow-hidden p-4 sm:p-5 flex flex-col items-center justify-center">
            {isFocusedMode && focusedFeed ? (
              /* ========================================================================= */
              /* FOCUS / STAGE VIEW MODE (Discord Style Spotlight + Top Thumbnail Gallery) */
              /* ========================================================================= */
              <div className="flex flex-col h-full w-full gap-3 overflow-hidden">
                {/* Top Thumbnail Gallery Strip of Other Feeds */}
                <div className="flex items-center gap-3 overflow-x-auto pb-1 px-1 scrollbar-thin scrollbar-thumb-white/10 shrink-0 min-h-[90px] max-h-[110px]">
                  {activeFeeds.map((feed) => {
                    const isCurrent = feed.id === focusedFeed.id;
                    return (
                      <motion.div
                        key={feed.id}
                        layout
                        onClick={() => handleToggleFocus(feed.id)}
                        onContextMenu={(e) => handleFeedContextMenu(e, feed)}
                        className={`group relative flex items-center justify-center rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 shrink-0 w-36 sm:w-44 h-20 sm:h-24 bg-black/60 border ${isCurrent
                          ? "border-white ring-2 ring-white/40 shadow-[0_0_20px_rgba(255,255,255,0.25)]"
                          : feed.isSpeaking
                            ? "border-white/80 ring-2 ring-white/30 hover:border-white"
                            : "border-white/10 hover:border-white/30 hover:bg-white/5"
                          }`}
                        title={`Clique para focar em ${feed.title}`}
                      >
                        {feed.type === "video" && feed.stream ? (
                          <div className="h-full w-full bg-black/80">
                            <VideoRenderer stream={feed.stream} fitMode="cover" />
                          </div>
                        ) : feed.cameraStream ? (
                          <div className="h-full w-full bg-black/80">
                            <VideoRenderer stream={feed.cameraStream} fitMode="cover" muted={feed.isLocal} />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-2 gap-1.5 text-center">
                            <div
                              className={`h-9 w-9 rounded-full overflow-hidden border transition-all duration-150 ${feed.isSpeaking
                                ? "border-white ring-2 ring-white/60 scale-105"
                                : "border-white/15"
                                }`}
                            >
                              {feed.avatar ? (
                                <img src={feed.avatar} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-white/10 text-xs font-bold text-white">
                                  {feed.title.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <span className="text-[11px] font-bold text-white/90 truncate max-w-[120px]">
                              {feed.title}
                            </span>
                          </div>
                        )}

                        {/* Top Badge on Thumbnail */}
                        <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                          {feed.tag && (
                            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 text-white border border-white/15 backdrop-blur-md">
                              {feed.tag}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-white text-black shadow-sm">
                              <Pin className="h-2.5 w-2.5 fill-black" />
                              <span>Focado</span>
                            </span>
                          )}
                        </div>

                        {/* Bottom Status / Name on Thumbnail */}
                        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between px-1.5 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-[10px] text-white">
                          <span className="truncate font-semibold text-[10px]">{feed.title}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {feed.isDeafened ? (
                              <VolumeX className="h-3 w-3 text-rose-400" />
                            ) : feed.isMuted ? (
                              <MicOff className="h-3 w-3 text-rose-400" />
                            ) : null}
                          </div>
                        </div>

                        {/* Hover Overlay Spotlight Action */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-white text-black font-black text-[10px] shadow-lg">
                            <Pin className="h-3 w-3" />
                            <span>{isCurrent ? "Desafixar" : "Focar"}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Big Main Spotlight Stage */}
                <div
                  onDoubleClick={() => {
                    if ((focusedFeed.type === "video" && focusedFeed.stream) || Boolean(focusedFeed.cameraStream)) {
                      setIsStreamFullscreen(true);
                    } else {
                      handleToggleFocus(focusedFeed.id);
                    }
                  }}
                  onContextMenu={(e) => handleFeedContextMenu(e, focusedFeed)}
                  className="group relative flex-1 w-full rounded-2xl overflow-hidden bg-[#050505] border border-white/10 shadow-2xl flex items-center justify-center"
                >
                  {(focusedFeed.type === "video" && focusedFeed.stream) || Boolean(focusedFeed.cameraStream) ? (
                    // Video Feed Stage (Screen Share or Camera)
                    <div className="relative h-full w-full flex items-center justify-center">
                      <VideoRenderer
                        stream={focusedFeed.stream || focusedFeed.cameraStream!}
                        fitMode={videoFitMode}
                        muted={focusedFeed.isLocal}
                        onVideoElement={(el) => {
                          activeVideoElRef.current = el;
                        }}
                      />

                      {/* Top Overlay Controls Bar (Visible on hover) */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                        {/* Title & Live Badge */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/75 border border-white/10 backdrop-blur-md pointer-events-auto">
                          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                          <span className="text-xs font-bold text-white">{focusedFeed.title}</span>
                          {focusedFeed.tag && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white/15 text-white/90">
                              {focusedFeed.tag}
                            </span>
                          )}
                        </div>

                        {/* Stream Action Toolbar */}
                        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/75 border border-white/10 backdrop-blur-md opacity-90 group-hover:opacity-100 transition-opacity pointer-events-auto">
                          {/* Remote Participant / Stream Volume Control */}
                          {!focusedFeed.isLocal && (
                            <div className="relative">
                              {(() => {
                                const getFeedVol = (feedId: string) => {
                                  if (userVolumes[feedId] !== undefined) return userVolumes[feedId];
                                  if (peerVolumes[feedId] !== undefined) return peerVolumes[feedId];
                                  const rawId = feedId.replace(/^remote-user:/, "").replace(/^remote-screen:/, "");
                                  if (peerVolumes[rawId] !== undefined) return peerVolumes[rawId];
                                  if (feedId.startsWith("remote-screen") && peerVolumes[`screen:${rawId}`] !== undefined) {
                                    return peerVolumes[`screen:${rawId}`];
                                  }
                                  return remoteVolume ?? 100;
                                };

                                const currentFeedVol = getFeedVol(focusedFeed.id);

                                const handleVolChange = (newVol: number) => {
                                  setUserVolumes((prev) => ({
                                    ...prev,
                                    [focusedFeed.id]: newVol,
                                  }));
                                  const rawPeerId = focusedFeed.id.startsWith("remote-screen:")
                                    ? `screen:${focusedFeed.id.replace("remote-screen:", "")}`
                                    : focusedFeed.id === "remote-screen"
                                      ? "remote-screen"
                                      : focusedFeed.id.startsWith("remote-user:")
                                        ? focusedFeed.id.replace("remote-user:", "")
                                        : focusedFeed.id;

                                  if (onSetPeerVolume) {
                                    onSetPeerVolume(rawPeerId, newVol);
                                    onSetPeerVolume(focusedFeed.id, newVol);
                                    if (focusedFeed.id === "remote-user" && session?.friendUid) {
                                      onSetPeerVolume(session.friendUid, newVol);
                                    }
                                  }
                                  if (onChangeRemoteVolume && (focusedFeed.id === "remote-user" || !focusedFeed.id.includes(":"))) {
                                    onChangeRemoteVolume(newVol);
                                  }
                                };

                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setIsVolumeSliderOpen((prev) => !prev)}
                                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${isVolumeSliderOpen
                                        ? "bg-white text-black"
                                        : "text-white/70 hover:text-white hover:bg-white/10"
                                        }`}
                                      title={`Ajustar volume de ${focusedFeed.title} (${currentFeedVol}%)`}
                                    >
                                      {currentFeedVol === 0 ? (
                                        <VolumeX className="h-4 w-4 text-rose-400" />
                                      ) : currentFeedVol < 60 ? (
                                        <Volume1 className="h-4 w-4" />
                                      ) : (
                                        <Volume2 className="h-4 w-4" />
                                      )}
                                    </button>

                                    {/* Volume Slider Popover */}
                                    <AnimatePresence>
                                      {isVolumeSliderOpen && (
                                        <motion.div
                                          initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                          animate={{ opacity: 1, scale: 1, y: 0 }}
                                          exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                          className="absolute top-10 right-0 p-3.5 w-52 rounded-2xl bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1c1d28]/98 via-[#111218]/99 to-[#08090c] border border-white/12 shadow-[0_20px_60px_rgba(0,0,0,0.92)] backdrop-blur-2xl z-50 space-y-2.5"
                                        >
                                          <div className="flex items-center justify-between text-[11px] font-bold text-white">
                                            <span>Volume Individual</span>
                                            <span className="font-mono text-white/90">{currentFeedVol}%</span>
                                          </div>
                                          <input
                                            type="range"
                                            min={0}
                                            max={200}
                                            value={currentFeedVol}
                                            onChange={(e) => handleVolChange(Number(e.target.value))}
                                            className="w-full accent-white cursor-pointer h-1.5"
                                          />
                                          <div className="flex justify-between text-[9px] font-bold text-white/40">
                                            <span
                                              onClick={() => handleVolChange(0)}
                                              className="cursor-pointer hover:text-white"
                                            >
                                              Mudo
                                            </span>
                                            <span
                                              onClick={() => handleVolChange(100)}
                                              className="cursor-pointer hover:text-white"
                                            >
                                              100%
                                            </span>
                                            <span
                                              onClick={() => handleVolChange(200)}
                                              className="cursor-pointer hover:text-white"
                                            >
                                              200%
                                            </span>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* Streamer Audio Toggle (Mute/Unmute Screen Share Audio on the fly) */}
                          {focusedFeed.isLocal && focusedFeed.isScreen && localScreenStream && (
                            <button
                              type="button"
                              onClick={() => {
                                const audioTracks = localScreenStream.getAudioTracks();
                                if (audioTracks.length === 0) return;
                                const nextState = !audioTracks[0].enabled;
                                audioTracks.forEach((t) => { t.enabled = nextState; });
                                notify?.(nextState ? "Áudio da tela ativado" : "Áudio da tela silenciado", "info");
                              }}
                              className="flex h-8 items-center gap-1.5 px-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs font-bold"
                              title="Silenciar / Ativar áudio transmitido da tela"
                            >
                              {localScreenStream.getAudioTracks().length === 0 ? (
                                <span className="text-[10px] text-white/40">Sem áudio de tela</span>
                              ) : localScreenStream.getAudioTracks()[0]?.enabled === false ? (
                                <>
                                  <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                                  <span className="text-[10px] text-rose-300">Tela Muda</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-[10px] text-emerald-300">Tela c/ Som</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Aspect Ratio Mode (Contain vs Cover) */}
                          <button
                            type="button"
                            onClick={() => setVideoFitMode((prev) => (prev === "contain" ? "cover" : "contain"))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            title={videoFitMode === "contain" ? "Preencher janela (Zoom)" : "Ajustar à janela"}
                          >
                            {videoFitMode === "contain" ? <Scan className="h-4 w-4" /> : <Scaling className="h-4 w-4" />}
                          </button>

                          {/* Picture-in-Picture (PiP) */}
                          <button
                            type="button"
                            onClick={() => void handleTogglePip()}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            title="Mini-player flutuante (PiP)"
                          >
                            <PictureInPicture2 className="h-4 w-4" />
                          </button>

                          {/* Fullscreen Button (Stream Fullscreen) */}
                          <button
                            type="button"
                            onClick={() => setIsStreamFullscreen(true)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            title="Tela cheia da transmissão"
                          >
                            <Maximize2 className="h-4 w-4" />
                          </button>

                          {/* Unpin / Return to Grid */}
                          <button
                            type="button"
                            onClick={() => setFocusedFeedId(null)}
                            className="flex items-center gap-1 px-2.5 h-8 rounded-lg bg-white/10 text-white font-bold text-xs hover:bg-white/20 transition-colors cursor-pointer ml-1"
                            title="Desafixar e voltar para a Grade"
                          >
                            <PinOff className="h-3.5 w-3.5" />
                            <span>Desafixar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Voice Card Stage (Focused on User's Voice Profile)
                    <div className="relative flex flex-col items-center justify-center p-8 text-center space-y-6 w-full h-full overflow-hidden rounded-2xl">
                      {!isRoomSession && (
                        <video
                          key={focusedFeed.isLocal ? "local-focus-bg" : (focusedFeed.isRinging || focusedFeed.isConnecting || callState === "ringing-out" || callState === "connecting") ? "calling-focus-bg" : "friend-focus-bg"}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-45 transition-opacity duration-700"
                          src={
                            focusedFeed.isLocal
                              ? spaceBgVideo
                              : (focusedFeed.isRinging || focusedFeed.isConnecting || callState === "ringing-out" || callState === "connecting")
                                ? friendCallingVideo
                                : friendConnectedVideo
                          }
                        />
                      )}

                      <div className="relative flex items-center justify-center">
                        {/* Animated Calling / Connecting Radar Rings in Stage */}
                        {(focusedFeed.isRinging || focusedFeed.isConnecting) && (
                          <>
                            <motion.div
                              animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                              className={`absolute h-48 w-48 rounded-full ${focusedFeed.isConnecting ? "bg-sky-500/15" : "bg-white/10"}`}
                            />
                            <motion.div
                              animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.1, 0.7] }}
                              transition={{ repeat: Infinity, duration: 2, delay: 0.3, ease: "easeInOut" }}
                              className={`absolute h-40 w-40 rounded-full border ${focusedFeed.isConnecting ? "border-sky-400/30" : "border-white/30"}`}
                            />
                          </>
                        )}

                        {/* Big Glowing Speaking Ring */}
                        <div
                          className={`relative h-36 w-36 rounded-full overflow-hidden border-4 transition-all duration-200 ${focusedFeed.isRinging
                            ? "border-amber-500/30 opacity-60 grayscale-[20%]"
                            : focusedFeed.isConnecting
                              ? "border-sky-400/50 ring-4 ring-sky-400/25 shadow-[0_0_25px_rgba(56,189,248,0.25)] opacity-90 animate-pulse"
                              : focusedFeed.isSpeaking
                                ? "border-white ring-8 ring-white/30 shadow-[0_0_35px_rgba(255,255,255,0.35)] scale-[1.04] opacity-100"
                                : "border-white/15 opacity-100"
                            }`}
                        >
                          {focusedFeed.avatar ? (
                            <img src={focusedFeed.avatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-white/10 text-4xl font-black text-white">
                              {focusedFeed.title.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Mute/Deafen Badge */}
                        {focusedFeed.isDeafened ? (
                          <div
                            className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-white border-2 border-[#12131a] shadow-lg animate-pulse"
                            title="Mutou tudo (Microfone e Som desativados)"
                          >
                            <VolumeX className="h-4.5 w-4.5" />
                          </div>
                        ) : focusedFeed.isMuted ? (
                          <div
                            className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-white border-2 border-[#12131a] shadow-lg"
                            title="Microfone Mutado"
                          >
                            <MicOff className="h-4.5 w-4.5" />
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="text-xl font-black text-white tracking-tight">{focusedFeed.title}</h3>
                        <p className="text-xs text-white/50 flex items-center justify-center gap-1.5">
                          {focusedFeed.isRinging ? (
                            <span className="text-amber-300 font-bold flex items-center gap-1.5 animate-pulse">
                              <Phone className="h-3.5 w-3.5 animate-bounce text-amber-300" /> Chamando...
                            </span>
                          ) : focusedFeed.isConnecting ? (
                            <span className="text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-white/70 flex items-center gap-1.5">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-white/60" /> Conectando...
                            </span>
                          ) : focusedFeed.isDeafened ? (
                            <span className="text-rose-400 font-bold flex items-center gap-1.5">
                              <VolumeX className="h-3.5 w-3.5 text-rose-400" /> Mutou tudo (Som & Mic)
                            </span>
                          ) : focusedFeed.isMuted ? (
                            <span className="text-rose-400 font-bold flex items-center gap-1.5">
                              <MicOff className="h-3.5 w-3.5 text-rose-400" /> Microfone mutado
                            </span>
                          ) : focusedFeed.isSpeaking ? (
                            <span className="text-white font-bold flex items-center gap-1">
                              <Activity className="h-3.5 w-3.5 animate-pulse" /> Falando ao vivo
                            </span>
                          ) : (
                            <span>Em chamada</span>
                          )}
                        </p>
                      </div>

                      {/* Discord-style User Volume Slider for Remote Participant in Stage */}
                      {!focusedFeed.isLocal && onChangeRemoteVolume && (
                        <div className="w-64 p-3 rounded-2xl bg-white/5 border border-white/8 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-white">
                            <span>Volume de {focusedFeed.title}</span>
                            <span className="font-mono text-white/90">{remoteVolume}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={200}
                            value={remoteVolume}
                            onChange={(e) => onChangeRemoteVolume(Number(e.target.value))}
                            className="w-full accent-white cursor-pointer"
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setFocusedFeedId(null)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition cursor-pointer"
                      >
                        <LayoutGrid className="h-4 w-4" />
                        <span>Voltar para Modo Grade</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ========================================================================= */
              /* GRID VIEW MODE (Discord Style Balanced Equal Tiles & Fluid Layout)        */
              /* ========================================================================= */
              <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden flex items-center justify-center p-2 sm:p-4">
                <motion.div
                  layout
                  className={`grid gap-4 sm:gap-5 w-full h-full max-h-[76vh] items-stretch justify-items-stretch transition-all duration-300 ${activeFeeds.length <= 1
                    ? "grid-cols-1 max-w-3xl"
                    : activeFeeds.length === 2
                      ? "grid-cols-1 md:grid-cols-2 max-w-5xl"
                      : activeFeeds.length === 3
                        ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 max-w-6xl"
                        : activeFeeds.length === 4
                          ? "grid-cols-2 max-w-5xl"
                          : activeFeeds.length <= 6
                            ? "grid-cols-2 md:grid-cols-3 max-w-6xl"
                            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 max-w-7xl"
                    }`}
                >
                  <AnimatePresence mode="popLayout">
                    {isRoomSession && activeFeeds.length === 1 && (
                      <motion.div
                        key="waiting-room-card"
                        layout
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.75, transition: { duration: 0.2 } }}
                        transition={{ layout: { type: "spring", stiffness: 350, damping: 28 } }}
                        className="flex flex-col items-center justify-center rounded-[26px] border border-dashed border-white/10 bg-[#1e1f22]/60 p-8 text-center space-y-4 w-full h-full min-h-[240px]"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/50 border border-white/10 shadow-inner">
                          <UserPlus className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-white/80">Ninguém mais está aqui ainda</p>
                          <p className="text-xs text-white/40 max-w-[240px]">
                            Convide seus amigos para conversar nesta chamada!
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsInviteModalOpen(true)}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all duration-200 hover:scale-105 active:scale-95 shadow-md cursor-pointer flex items-center gap-1.5"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          <span>Convidar Amigos</span>
                        </button>
                      </motion.div>
                    )}

                    {activeFeeds.map((feed, idx) => {
                      const hasCameraFill = feed.type === "voice" && Boolean(feed.cameraStream);
                      const isSpeaking = Boolean(feed.isSpeaking);

                      // Neutral dark surface tints
                      const cardBgTints = [
                        "bg-[#0e0e0e]",
                        "bg-[#121212]",
                        "bg-[#101010]",
                        "bg-[#141414]",
                      ];
                      const assignedBg = cardBgTints[idx % cardBgTints.length];

                      return (
                        <motion.div
                          key={feed.id}
                          layout
                          initial={{ opacity: 0, scale: 0.82, y: 15 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            scale: 0.72,
                            transition: { duration: 0.22, ease: "easeInOut" },
                          }}
                          transition={{
                            layout: { type: "spring", stiffness: 350, damping: 28 },
                            opacity: { duration: 0.2 },
                            scale: { type: "spring", stiffness: 380, damping: 26 },
                          }}
                          onDoubleClick={() => handleToggleFocus(feed.id)}
                          onContextMenu={(e) => handleFeedContextMenu(e, feed)}
                          className={`group relative flex flex-col items-center justify-center rounded-[26px] border transition-[transform,border-color,box-shadow,background-color] duration-200 ease-out transform-gpu will-change-transform w-full h-full min-h-[220px] overflow-hidden select-none ${feed.type === "video" || hasCameraFill
                            ? "bg-black/90 border-white/10 shadow-2xl p-0"
                            : `${assignedBg} border-white/[0.08] hover:border-white/[0.18] shadow-xl p-6`
                            } ${isSpeaking
                              ? "ring-[3px] ring-[#23a55a] border-[#23a55a] shadow-[0_0_30px_rgba(35,165,90,0.35)] scale-[1.01]"
                              : ""
                            }`}
                        >
                          {hasCameraFill ? (
                            // ── Camera ON: fills entire card rectangle (Discord-style video tile) ──
                            <div className="relative h-full w-full">
                              <VideoRenderer
                                stream={feed.cameraStream!}
                                fitMode="cover"
                                muted={feed.isLocal}
                              />

                              {/* Bottom gradient overlay: name + status */}
                              <div className="absolute bottom-0 inset-x-0 flex items-end justify-between px-3 py-2.5 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none">
                                <div className="flex items-center gap-1.5">
                                  {isSpeaking && (
                                    <span className="h-2 w-2 rounded-full bg-[#23a55a] animate-pulse shrink-0" />
                                  )}
                                  <span className="text-xs font-bold text-white drop-shadow truncate max-w-[130px]">
                                    {feed.title}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {feed.isDeafened ? (
                                    <span className="flex items-center gap-1 rounded bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-black uppercase text-white shadow">
                                      <VolumeX className="h-3 w-3" /> Mutou Tudo
                                    </span>
                                  ) : feed.isMuted ? (
                                    <span className="flex items-center gap-1 rounded bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-black uppercase text-white shadow">
                                      <MicOff className="h-3 w-3" /> Mutado
                                    </span>
                                  ) : (
                                    <Camera className="h-3 w-3 text-white/50" />
                                  )}
                                </div>
                              </div>

                              {/* PTT badge top-right */}
                              {feed.isLocal && inputMode === "push-to-talk" && (
                                <div className="absolute top-2 right-2 pointer-events-none">
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${isPttPressed
                                      ? "bg-white/20 text-white border-white/40 animate-pulse"
                                      : "bg-black/60 text-white/50 border-white/10"
                                      }`}
                                  >
                                    PTT [{pushToTalkKey}]
                                  </span>
                                </div>
                              )}

                              {/* Hover overlay: Focus button */}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => handleToggleFocus(feed.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black font-black text-xs shadow-lg hover:scale-105 transition cursor-pointer"
                                >
                                  <Pin className="h-3.5 w-3.5" />
                                  <span>Focar no Palco</span>
                                </button>
                              </div>
                            </div>

                          ) : feed.type === "video" && feed.stream ? (
                            feed.id === "remote-screen" && !watchedStreams["remote-screen"] ? (
                              // On-Demand Screen Share Placeholder
                              <div className="relative h-full w-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-black/85">
                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-black uppercase text-white">
                                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                                  <span>Transmissão Ao Vivo</span>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-sm font-black text-white">{feed.title}</p>
                                  <p className="text-[11px] text-white/40 max-w-[200px]">Economizando banda e GPU em segundo plano.</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWatchedStreams((prev) => ({ ...prev, [feed.id]: true }));
                                  }}
                                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black font-black text-xs hover:scale-105 active:scale-95 shadow-lg transition cursor-pointer"
                                >
                                  <Tv className="h-4 w-4" />
                                  <span>Assistir Transmissão</span>
                                </button>
                              </div>
                            ) : (
                              // Live Video Tile (screen share)
                              <div className="relative h-full w-full flex items-center justify-center">
                                <VideoRenderer stream={feed.stream} fitMode="contain" />
                                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/80 border border-white/10 backdrop-blur-md">
                                  <span className="h-2 w-2 rounded-full bg-[#23a55a] animate-pulse" />
                                  <span className="text-xs font-bold text-white truncate max-w-[130px]">{feed.title}</span>
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleFocus(feed.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black font-black text-xs shadow-lg hover:scale-105 transition cursor-pointer"
                                  >
                                    <Pin className="h-3.5 w-3.5" />
                                    <span>Focar no Palco</span>
                                  </button>
                                  {feed.id === "remote-screen" && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setWatchedStreams((prev) => ({ ...prev, [feed.id]: false }));
                                      }}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/80 hover:bg-black text-white/80 hover:text-white font-bold text-xs border border-white/15 transition cursor-pointer"
                                    >
                                      <Tv className="h-3.5 w-3.5" />
                                      <span>Pausar</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          ) : (
                            // ── Voice-only card: Discord-style avatar with bottom-left pill badge ──
                            <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[26px]">
                              {/* Direct 1-on-1 Call Cosmic Background Video */}
                              {!isRoomSession && (
                                <video
                                  key={feed.isLocal ? "local-bg" : (feed.isRinging || feed.isConnecting || callState === "ringing-out" || callState === "connecting") ? "calling-bg" : "friend-bg"}
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-45 transition-opacity duration-700"
                                  src={
                                    feed.isLocal
                                      ? spaceBgVideo
                                      : (feed.isRinging || feed.isConnecting || callState === "ringing-out" || callState === "connecting")
                                        ? friendCallingVideo
                                        : friendConnectedVideo
                                  }
                                />
                              )}

                              {/* Animated Calling / Connecting Radar Rings */}
                              {(feed.isRinging || feed.isConnecting) && (
                                <>
                                  <motion.div
                                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                    className={`absolute h-36 w-36 rounded-full ${feed.isConnecting ? "bg-sky-500/15" : "bg-white/10"}`}
                                  />
                                  <motion.div
                                    animate={{ scale: [1, 1.18, 1], opacity: [0.7, 0.1, 0.7] }}
                                    transition={{ repeat: Infinity, duration: 2, delay: 0.3, ease: "easeInOut" }}
                                    className={`absolute h-30 w-30 rounded-full border ${feed.isConnecting ? "border-sky-400/30" : "border-white/30"}`}
                                  />
                                </>
                              )}

                              {/* Center Large Avatar */}
                              <div
                                className={`relative h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 rounded-full overflow-hidden border-[3px] transition-[transform,border-color,box-shadow,opacity] duration-200 ease-out transform-gpu will-change-transform ${feed.isRinging
                                  ? "border-amber-500/30 opacity-60 grayscale-[20%]"
                                  : feed.isConnecting
                                    ? "border-sky-400/50 ring-4 ring-sky-400/25 shadow-[0_0_20px_rgba(56,189,248,0.25)] opacity-90 animate-pulse"
                                    : isSpeaking
                                      ? "border-[#23a55a] ring-4 ring-[#23a55a]/35 shadow-[0_0_25px_rgba(35,165,90,0.4)] scale-105 opacity-100"
                                      : "border-white/10 opacity-100"
                                  }`}
                              >
                                {feed.avatar ? (
                                  <img src={feed.avatar} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-white/10 text-2xl sm:text-3xl md:text-4xl font-black text-white border border-white/10">
                                    {feed.title.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              {/* Discord-style Top-Left Name & Status Pill */}
                              {feed.isConnecting ? (
                                <div className="absolute top-3.5 left-3.5 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-lg pointer-events-none max-w-[calc(100%-110px)] z-10">
                                  <Loader2 className="h-3.5 w-3.5 text-white/60 animate-spin shrink-0" />
                                  <span className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                                    {feed.title}
                                  </span>
                                  <span className="text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-white/70 shrink-0">
                                    Conectando...
                                  </span>
                                </div>
                              ) : feed.isRinging ? (
                                <div className="absolute top-3.5 left-3.5 flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-400/40 shadow-[0_0_15px_rgba(251,191,36,0.2)] pointer-events-none max-w-[calc(100%-110px)] z-10">
                                  <Phone className="h-3.5 w-3.5 text-amber-300 animate-bounce shrink-0" />
                                  <span className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                                    {feed.title}
                                  </span>
                                  <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-400/30 shrink-0">
                                    Chamando...
                                  </span>
                                </div>
                              ) : (
                                <div className="absolute top-3.5 left-3.5 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-lg pointer-events-none max-w-[calc(100%-110px)] z-10">
                                  {isSpeaking && (
                                    <span className="h-2 w-2 rounded-full bg-[#23a55a] animate-pulse shrink-0" />
                                  )}
                                  <span className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                                    {feed.title}
                                  </span>
                                  {feed.isDeafened ? (
                                    <span className="flex items-center text-rose-400 shrink-0" title="Áudio e Mic Desativados">
                                      <VolumeX className="h-3.5 w-3.5" />
                                    </span>
                                  ) : feed.isMuted ? (
                                    <span className="flex items-center text-rose-400 shrink-0" title="Microfone Mutado">
                                      <MicOff className="h-3.5 w-3.5" />
                                    </span>
                                  ) : null}
                                </div>
                              )}

                              {/* Telemetry HUD Cards at the Bottom */}
                              <div className="absolute bottom-3.5 inset-x-3.5 flex items-center justify-center z-10 pointer-events-none">
                                {activeFeeds.length === 1 && feed.isLocal ? (
                                  <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                                    <CallTelemetryLeft
                                      duration={duration}
                                      stream={localStream}
                                      isSpeaking={isSpeakingLocal}
                                      className="pointer-events-auto"
                                    />
                                    <CallTelemetryRight
                                      stream={localStream}
                                      isSpeaking={isSpeakingLocal}
                                      className="pointer-events-auto"
                                    />
                                  </div>
                                ) : feed.isLocal ? (
                                  <CallTelemetryLeft
                                    duration={duration}
                                    stream={localStream}
                                    isSpeaking={isSpeakingLocal}
                                    className="pointer-events-auto"
                                  />
                                ) : (
                                  <CallTelemetryRight
                                    stream={feed.stream || remoteStream}
                                    isSpeaking={feed.isSpeaking || isSpeakingRemote}
                                    className="pointer-events-auto"
                                  />
                                )}
                              </div>

                              {/* PTT Indicator (Top Right) */}
                              {feed.isLocal && inputMode === "push-to-talk" && (
                                <div className="absolute top-3.5 right-3.5 pointer-events-none">
                                  <span
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${isPttPressed
                                      ? "bg-[#23a55a]/30 text-[#23a55a] border-[#23a55a]/50 animate-pulse"
                                      : "bg-black/60 text-white/50 border-white/10"
                                      }`}
                                  >
                                    PTT [{pushToTalkKey}]
                                  </span>
                                </div>
                              )}

                              {/* Hover Focus Button (Top-Right) */}
                              <div className="absolute top-3.5 right-3.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => handleToggleFocus(feed.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/70 hover:bg-white text-white/80 hover:text-black font-bold text-xs border border-white/10 transition cursor-pointer shadow-md"
                                  title="Focar no palco"
                                >
                                  <Pin className="h-3 w-3" />
                                  <span className="hidden sm:inline">Focar</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              </div>
            )}
          </div>

          {/* Voice & Devices Settings Modal */}
          <AnimatePresence>
            {isSettingsOpen && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md">
                {/* Backdrop Click Dismiss */}
                <div
                  className="absolute inset-0"
                  onClick={() => setIsSettingsOpen(false)}
                />

                <motion.div
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className="relative flex flex-col w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-[26px] border border-white/[0.12] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1c1d28]/98 via-[#111218]/99 to-[#08090c] shadow-[0_35px_110px_rgba(0,0,0,0.95)] backdrop-blur-2xl z-10"
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/8 bg-black/35 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07] text-white border border-white/[0.1] shadow-sm">
                        <Sliders className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-[13px] font-black text-white tracking-tight uppercase">
                          Configurações de Voz & Dispositivos
                        </h3>
                        <p className="text-[11px] text-white/40">
                          Ajuste dispositivos, sensibilidade e filtros de áudio
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(false)}
                      className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/[0.04] text-white/45 hover:!bg-white/[0.09] hover:!text-white transition cursor-pointer border border-white/[0.06]"
                      title="Fechar configurações"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Modal Body Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 custom-scrollbar pr-2">
                    {/* 1. Device Selectors Card */}
                    <div className="p-3.5 sm:p-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] space-y-3">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45 flex items-center gap-2">
                        <Headphones className="h-3.5 w-3.5 text-white/70" />
                        <span>Dispositivos de Entrada & Saída</span>
                      </h4>

                      {/* Microfone */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-white/55 flex items-center gap-1.5">
                          <Mic className="h-3.5 w-3.5 text-white/70" />
                          <span>Dispositivo de Microfone</span>
                        </label>
                        <select
                          value={selectedAudioInput}
                          onChange={(e) => onChangeAudioInputDevice?.(e.target.value)}
                          className="w-full h-10 rounded-xl border border-white/[0.1] bg-[#15161e] px-3.5 text-[11px] font-semibold text-white/90 outline-none transition focus:border-white/25 focus:ring-2 focus:ring-white/[0.06] cursor-pointer hover:bg-[#191a23]"
                        >
                          <option value="default" className="bg-[#181922] text-white">
                            {defaultInputLabel && defaultInputLabel !== "default"
                              ? `Padrão do Sistema (${defaultInputLabel.replace(/^Padrão - /i, "")})`
                              : "Padrão do Sistema (Detectado)"}
                          </option>
                          {audioInputDevices.map((dev) => (
                            <option key={dev.deviceId} value={dev.deviceId} className="bg-[#181922] text-white">
                              {dev.label || `Microfone (${dev.deviceId.slice(0, 8)}...)`}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Teste de Microfone em Tempo Real com RMS */}
                      <div className="space-y-2 bg-black/25 p-3 rounded-xl border border-white/[0.07]">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-white/60 flex items-center gap-1">
                            <Activity className="h-3 w-3 text-white/70" />
                            Nível de Entrada
                          </span>
                          <span
                            className={`font-mono transition-colors ${micVolumeLevel > 85
                              ? "text-rose-400"
                              : micVolumeLevel > 60
                                ? "text-amber-300"
                                : "text-white/80"
                              }`}
                          >
                            {micVolumeLevel}%
                          </span>
                        </div>
                        {/* Segmented VU meter — 20 barras, zonas verde/amber/vermelho como um console real */}
                        <div className="flex items-center gap-1 h-2.5">
                          {Array.from({ length: 20 }).map((_, i) => {
                            const threshold = (i + 1) * 5;
                            const isLit = micVolumeLevel >= threshold;
                            const zoneColor =
                              threshold > 85 ? "bg-rose-500" : threshold > 60 ? "bg-amber-400" : "bg-emerald-400";
                            return (
                              <div
                                key={i}
                                className={`flex-1 h-full rounded-[2px] transition-all duration-75 ${isLit ? `${zoneColor} shadow-[0_0_4px_rgba(255,255,255,0.3)]` : "bg-white/8"
                                  }`}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {/* Retorno de Microfone / Ouvir Própria Voz (Sidetone) */}
                      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/[0.07] bg-black/20 cursor-pointer hover:!bg-white/[0.035] transition">
                        <div className="flex items-center gap-2.5">
                          <Headphones className="h-4 w-4 text-white/70" />
                          <div>
                            <p className="text-xs font-bold text-white">Ouvir minha própria voz (Retorno)</p>
                            <p className="text-[10px] text-white/40">Reproduz seu microfone nos fones para você se escutar</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(isMicMonitoring)}
                          onChange={(e) => onChangeMicMonitoring?.(e.target.checked)}
                          className="h-4 w-4 rounded-md accent-white cursor-pointer"
                        />
                      </label>

                      {/* Alto-Falante */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-white/55 flex items-center gap-1.5">
                          <Headphones className="h-3.5 w-3.5 text-white/70" />
                          <span>Dispositivo de Saída (Alto-Falante)</span>
                        </label>
                        <select
                          value={selectedAudioOutput}
                          onChange={(e) => onChangeAudioOutputDevice?.(e.target.value)}
                          className="w-full h-10 rounded-xl border border-white/[0.1] bg-[#15161e] px-3.5 text-[11px] font-semibold text-white/90 outline-none transition focus:border-white/25 focus:ring-2 focus:ring-white/[0.06] cursor-pointer hover:bg-[#191a23]"
                        >
                          <option value="default" className="bg-[#181922] text-white">
                            {defaultOutputLabel && defaultOutputLabel !== "default"
                              ? `Padrão do Sistema (${defaultOutputLabel.replace(/^Padrão - /i, "")})`
                              : "Padrão do Sistema (Detectado)"}
                          </option>
                          {audioOutputDevices.map((dev) => (
                            <option key={dev.deviceId} value={dev.deviceId} className="bg-[#181922] text-white">
                              {dev.label || `Alto-Falante (${dev.deviceId.slice(0, 8)}...)`}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Câmera */}
                      {videoInputDevices.length > 0 && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-white/55 flex items-center gap-1.5">
                            <Camera className="h-3.5 w-3.5 text-white/70" />
                            <span>Câmera de Vídeo</span>
                          </label>
                          <select
                            value={selectedVideoInput}
                            onChange={(e) => onChangeVideoInputDevice?.(e.target.value)}
                            className="w-full h-10 rounded-xl border border-white/[0.1] bg-[#15161e] px-3.5 text-[11px] font-semibold text-white/90 outline-none transition focus:border-white/25 focus:ring-2 focus:ring-white/[0.06] cursor-pointer hover:bg-[#191a23]"
                          >
                            <option value="default" className="bg-[#181922] text-white">
                              {defaultVideoLabel && defaultVideoLabel !== "default"
                                ? `Padrão do Sistema (${defaultVideoLabel.replace(/^Padrão - /i, "")})`
                                : "Padrão do Sistema (Detectado)"}
                            </option>
                            {videoInputDevices.map((dev) => (
                              <option key={dev.deviceId} value={dev.deviceId} className="bg-[#181922] text-white">
                                {dev.label || `Câmera (${dev.deviceId.slice(0, 8)}...)`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* 2. Sensibilidade de Atividade de Voz Card */}
                    {typeof micGain === "number" && onChangeMicGain && (
                      <div className="space-y-2.5 bg-black/25 p-3 rounded-xl border border-white/[0.07]">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-white/60 flex items-center gap-1">
                            <Volume2 className="h-3 w-3 text-white/70" />
                            Volume do Microfone
                          </span>
                          <span className="font-mono text-white/80">{micGain}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={micGain}
                          onChange={(e) => onChangeMicGain(Number(e.target.value))}
                          className="w-full accent-white cursor-pointer"
                        />
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-white/30">
                          <span>Mudo (0%)</span>
                          <span onClick={() => onChangeMicGain(100)} className="cursor-pointer hover:text-white/60">
                            Normal (100%)
                          </span>
                          <span>Amplificado (200%)</span>
                        </div>
                        {micGain > 130 && (
                          <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                            Acima de 130% pode captar mais ruído de fundo junto com a voz.
                          </p>
                        )}
                      </div>
                    )}

                    {onCalibrateNoise && (
                      <button
                        type="button"
                        disabled={isCalibratingNoise}
                        onClick={() => void onCalibrateNoise()}
                        className="w-full h-9 flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] hover:!bg-white/[0.1] border border-white/[0.07] text-white/80 text-[10px] font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                      >
                        <Activity className="h-3.5 w-3.5" />
                        <span>{isCalibratingNoise ? "Calibrando... (fique em silêncio)" : "Calibrar ruído ambiente automaticamente"}</span>
                      </button>
                    )}

                    {/* 3. Toggles de Processamento de Áudio Card */}
                    <div className="p-3.5 sm:p-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] space-y-0.5">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45 mb-3 flex items-center gap-2">
                        <Sliders className="h-3.5 w-3.5 text-white/70" />
                        <span>Cadeia de Processamento</span>
                        <span className="text-[9px] font-medium normal-case text-white/30">— mic → saída</span>
                      </h4>

                      {/* Stage 1: Anti-Eco */}
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-0.5">
                          <div
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black transition-colors ${echoCancellation ? "bg-white text-black" : "bg-white/10 text-white/40"
                              }`}
                          >
                            1
                          </div>
                          <div className="w-px flex-1 min-h-[18px] bg-white/10 my-1" />
                        </div>
                        <button
                          type="button"
                          onClick={() => onChangeEchoCancellation?.(!echoCancellation)}
                          className={`flex-1 mb-2 flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${echoCancellation
                            ? "bg-white/[0.07] border-white/[0.16] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
                            : "bg-transparent border-white/[0.07] hover:!bg-white/[0.035]"
                            }`}
                        >
                          <div>
                            <p className="text-xs font-bold text-white">Anti-Eco</p>
                            <p className="text-[10px] text-white/40">Remove eco do próprio alto-falante</p>
                          </div>
                          {echoCancellation && <Check className="h-4 w-4 text-white shrink-0" />}
                        </button>
                      </div>

                      {/* Stage 2: Supressão Nativa */}
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-0.5">
                          <div
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black transition-colors ${noiseSuppression ? "bg-white text-black" : "bg-white/10 text-white/40"
                              }`}
                          >
                            2
                          </div>
                          <div className="w-px flex-1 min-h-[18px] bg-white/10 my-1" />
                        </div>
                        <button
                          type="button"
                          onClick={() => onChangeNoiseSuppression?.(!noiseSuppression)}
                          className={`flex-1 mb-2 flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${noiseSuppression
                            ? "bg-white/[0.07] border-white/[0.16]"
                            : "bg-transparent border-white/[0.07] hover:!bg-white/[0.035]"
                            }`}
                        >
                          <div>
                            <p className="text-xs font-bold text-white">Supressão Nativa</p>
                            <p className="text-[10px] text-white/40">Filtro de ruído estacionário do sistema</p>
                          </div>
                          {noiseSuppression && <Check className="h-4 w-4 text-white shrink-0" />}
                        </button>
                      </div>

                      {/* Stage 3: Ganho Automático */}
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-0.5">
                          <div
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black transition-colors ${autoGainControl ? "bg-white text-black" : "bg-white/10 text-white/40"
                              }`}
                          >
                            3
                          </div>
                          <div className="w-px flex-1 min-h-[18px] bg-white/10 my-1" />
                        </div>
                        <button
                          type="button"
                          onClick={() => onChangeAutoGainControl?.(!autoGainControl)}
                          className={`flex-1 mb-2 flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${autoGainControl
                            ? "bg-white/[0.07] border-white/[0.16]"
                            : "bg-transparent border-white/[0.07] hover:!bg-white/[0.035]"
                            }`}
                        >
                          <div>
                            <p className="text-xs font-bold text-white">Ganho Automático</p>
                            <p className="text-[10px] text-white/40">Equaliza o volume da sua voz</p>
                          </div>
                          {autoGainControl && <Check className="h-4 w-4 text-white shrink-0" />}
                        </button>
                      </div>

                      {/* Stage 4 (final): RNNoise IA — estágio de destaque, sem linha de continuação */}
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-0.5">
                          <div
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black transition-colors ${advancedNoiseSuppression
                              ? "bg-emerald-400 text-black"
                              : "bg-white/10 text-white/40"
                              }`}
                          >
                            4
                          </div>
                        </div>
                        <div
                          className={`flex-1 flex items-center justify-between p-3 rounded-xl border transition-all ${advancedNoiseSuppression
                            ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.08)]"
                            : "bg-transparent border-white/8"
                            }`}
                        >
                          <div className="pr-2">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className={`h-3.5 w-3.5 ${advancedNoiseSuppression ? "text-emerald-400" : "text-white/40"}`} />
                              <span className="text-xs font-bold text-white">Supressão de Ruído IA</span>
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                RNNoise
                              </span>
                            </div>
                            <p className="text-[10px] text-white/40 mt-0.5">
                              Filtro neural final — elimina teclado, cliques e ruído ambiente
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onChangeAdvancedNoiseSuppression?.(!advancedNoiseSuppression)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${advancedNoiseSuppression ? "bg-emerald-500" : "bg-white/10"
                              }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${advancedNoiseSuppression ? "translate-x-5" : "translate-x-0"
                                }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 4. Modo de Entrada Card */}
                    <div className="p-3.5 sm:p-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] space-y-3">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">
                        Modo de Transmissão
                      </h4>
                      <div className="grid grid-cols-2 gap-1 bg-black/25 p-1 rounded-xl border border-white/[0.08]">
                        <button
                          type="button"
                          onClick={() => setInputMode?.("voice-activity")}
                          className={`py-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${inputMode === "voice-activity"
                            ? "bg-white text-black font-black shadow-sm"
                            : "text-white/50 hover:!text-white hover:!bg-white/[0.05]"
                            }`}
                        >
                          Atividade de Voz
                        </button>
                        <button
                          type="button"
                          onClick={() => setInputMode?.("push-to-talk")}
                          className={`py-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${inputMode === "push-to-talk"
                            ? "bg-white text-black font-black shadow-sm"
                            : "text-white/50 hover:!text-white hover:!bg-white/[0.05]"
                            }`}
                        >
                          Push-to-Talk
                        </button>
                      </div>

                      {inputMode === "push-to-talk" && setPushToTalkKey && (
                        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/8 bg-black/20">
                          <div>
                            <p className="text-xs font-bold text-white flex items-center gap-1.5">
                              <Keyboard className="h-3.5 w-3.5 text-white/70" />
                              Atalho Push-to-Talk
                            </p>
                            <p className="text-[10px] text-white/40">Segure a tecla para falar no jogo ou aplicativo</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsRecordingKey(true);
                              const onKey = (e: KeyboardEvent) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
                                setPushToTalkKey(key);
                                setIsRecordingKey(false);
                                window.removeEventListener("keydown", onKey, true);
                              };
                              window.addEventListener("keydown", onKey, true);
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${isRecordingKey
                              ? "bg-white/20 text-white border-white/40 animate-pulse"
                              : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                              }`}
                          >
                            {isRecordingKey ? "Pressione tecla..." : pushToTalkKey}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-end px-5 sm:px-6 py-3 border-t border-white/[0.08] bg-black/25">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsSettingsOpen(false)}
                      className="h-9 rounded-xl bg-white px-5 text-[11px] font-black text-black hover:!bg-white/90 hover:!text-black shadow-sm"
                    >
                      Concluído
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Bottom Call Controls Dock — gap-3, h-10 w-10 rounded-full, end call #FF2B55 per audit */}
          <div className="flex items-center justify-center gap-3 p-3.5 sm:p-4 border-t border-white/[0.08] bg-black/50 backdrop-blur-2xl z-20">
            {/* 1. Mute Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleMute}
              className={`h-10 w-10 rounded-full border flex items-center justify-center transition-colors ${isMuted
                ? "bg-[#FF2B55] border-[#FF2B55] text-white shadow-[0_4px_16px_rgba(255,43,85,0.35)]"
                : "bg-white/[0.06] hover:bg-white/10 border-white/10 text-white"
                }`}
              title={isMuted ? "Desmutar microfone" : "Mutar microfone"}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>

            {/* 2. Video / Camera Button */}
            {onToggleCamera && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleCamera}
                className={`h-10 w-10 rounded-full border flex items-center justify-center transition-colors ${isCameraOn
                  ? "bg-white border-white text-black shadow-md"
                  : "bg-white/[0.06] hover:bg-white/10 border-white/10 text-white"
                  }`}
                title={isCameraOn ? "Desligar câmera" : "Ligar câmera"}
              >
                {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </Button>
            )}

            {/* 3. Share Screen Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleScreenShare}
              className={`h-10 w-10 rounded-full border flex items-center justify-center transition-colors ${isSharingScreen
                ? "bg-white border-white text-black shadow-md"
                : "bg-white/[0.06] hover:bg-white/10 border-white/10 text-white"
                }`}
              title={isSharingScreen ? "Parar transmissão" : "Transmitir tela ou jogo"}
            >
              {isSharingScreen ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
            </Button>

            {/* 4. Deafen Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleDeafen}
              className={`h-10 w-10 rounded-full border flex items-center justify-center transition-colors ${isDeafened
                ? "bg-[#FF2B55] border-[#FF2B55] text-white shadow-[0_4px_16px_rgba(255,43,85,0.35)]"
                : "bg-white/[0.06] hover:bg-white/10 border-white/10 text-white"
                }`}
              title={isDeafened ? "Desativar silêncio total" : "Silenciar tudo (Deafen)"}
            >
              {isDeafened ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>

            {/* 5. Voice Settings Button (Gear) */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className={`h-10 w-10 rounded-full border flex items-center justify-center transition-colors ${isSettingsOpen
                ? "bg-white border-white text-black shadow-md"
                : "bg-white/[0.06] hover:bg-white/10 border-white/10 text-white"
                }`}
              title="Ajustes de voz & entrada"
            >
              <Settings className="h-5 w-5" />
            </Button>

            {/* Unified Disconnect / End Call Button — h-10 px-6 rounded-full bg-[#FF2B55] hover:bg-[#FF1A45] */}
            <Button
              type="button"
              variant="destructive"
              onClick={onHangUp}
              className="h-10 px-6 rounded-full bg-[#FF2B55] hover:bg-[#FF1A45] text-white font-bold text-xs tracking-wide shadow-[0_4px_16px_rgba(255,43,85,0.35)] flex items-center justify-center gap-2 transition-colors ml-2"
              title={isOnlyOnePersonInRoom ? "Encerrar chamada" : "Desconectar da chamada"}
            >
              <PhoneOff className="h-4 w-4" />
              <span>{isOnlyOnePersonInRoom ? "ENCERRAR CHAMADA" : "Desconectar"}</span>
            </Button>
          </div>

          {/* Right-Click Participant Context Menu */}
          {contextMenu && contextMenu.isOpen && (
            <ParticipantContextMenu
              feed={{
                ...contextMenu.feed,
                isScreenLiveAvailable: contextMenu.feed.id === "remote-screen",
                isCurrentlyWatched: Boolean(watchedStreams[contextMenu.feed.id]),
              }}
              x={contextMenu.x}
              y={contextMenu.y}
              volume={(() => {
                if (contextMenu.feed.isLocal) return 100;
                const feedId = contextMenu.feed.id;
                if (userVolumes[feedId] !== undefined) return userVolumes[feedId];
                if (peerVolumes[feedId] !== undefined) return peerVolumes[feedId];
                const rawId = feedId.replace(/^remote-user:/, "").replace(/^remote-screen:/, "");
                if (peerVolumes[rawId] !== undefined) return peerVolumes[rawId];
                if (feedId.startsWith("remote-screen") && peerVolumes[`screen:${rawId}`] !== undefined) {
                  return peerVolumes[`screen:${rawId}`];
                }
                return remoteVolume ?? 100;
              })()}
              isLocallyMuted={locallyMutedFeeds[contextMenu.feed.id]}
              isLocalAdmin={Boolean(isRoomSession && (session?.adminId === userProfile?.uid || roomConfig?.adminId === userProfile?.uid || (!session?.adminId && !session?.friendUid)))}
              onVolumeChange={(newVol) => {
                setUserVolumes((prev) => ({
                  ...prev,
                  [contextMenu.feed.id]: newVol,
                }));
                const rawPeerId = contextMenu.feed.id.startsWith("remote-screen:")
                  ? `screen:${contextMenu.feed.id.replace("remote-screen:", "")}`
                  : contextMenu.feed.id === "remote-screen"
                    ? "remote-screen"
                    : contextMenu.feed.id.startsWith("remote-user:")
                      ? contextMenu.feed.id.replace("remote-user:", "")
                      : contextMenu.feed.id;

                if (onSetPeerVolume) {
                  onSetPeerVolume(rawPeerId, newVol);
                  onSetPeerVolume(contextMenu.feed.id, newVol);
                  if (contextMenu.feed.id === "remote-user" && session?.friendUid) {
                    onSetPeerVolume(session.friendUid, newVol);
                  }
                }
                if (!contextMenu.feed.isLocal && onChangeRemoteVolume && (contextMenu.feed.id === "remote-user" || !contextMenu.feed.id.includes(":"))) {
                  onChangeRemoteVolume(newVol);
                }
              }}
              onToggleLocalMute={() => {
                const nextMuted = !locallyMutedFeeds[contextMenu.feed.id];
                setLocallyMutedFeeds((prev) => ({
                  ...prev,
                  [contextMenu.feed.id]: nextMuted,
                }));
                const rawPeerId = contextMenu.feed.id.startsWith("remote-screen:")
                  ? `screen:${contextMenu.feed.id.replace("remote-screen:", "")}`
                  : contextMenu.feed.id === "remote-screen"
                    ? "remote-screen"
                    : contextMenu.feed.id.startsWith("remote-user:")
                      ? contextMenu.feed.id.replace("remote-user:", "")
                      : contextMenu.feed.id;
                const currVol = userVolumes[contextMenu.feed.id] ?? (contextMenu.feed.isLocal ? 100 : (remoteVolume ?? 100));
                if (onSetPeerVolume) {
                  onSetPeerVolume(rawPeerId, nextMuted ? 0 : currVol);
                  onSetPeerVolume(contextMenu.feed.id, nextMuted ? 0 : currVol);
                }
              }}
              onToggleWatchStream={() => {
                const nextState = !watchedStreams[contextMenu.feed.id];
                setWatchedStreams((prev) => ({
                  ...prev,
                  [contextMenu.feed.id]: nextState,
                }));
                if (nextState) {
                  handleToggleFocus(contextMenu.feed.id as CallFeedId);
                }
              }}
              onKickParticipant={(targetUserId) => {
                if (onKickParticipant) {
                  onKickParticipant(targetUserId);
                }
              }}
              onClose={() => setContextMenu(null)}
            />
          )}

          {/* Channel Friends Invite Modal */}
          <ChannelInviteModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            session={session}
            userProfile={userProfile}
            friends={socialFriends}
            notify={notify}
          />

          {/* Call Privacy & Password Panel */}
          <CallPrivacyPanel
            isOpen={isPrivacyModalOpen}
            onClose={() => setIsPrivacyModalOpen(false)}
            isPrivate={Boolean(session?.isPrivate || roomConfig?.isPrivate)}
            currentPassword={session?.password || roomConfig?.password || ""}
            currentCategory={session?.category || roomConfig?.category}
            onSavePrivacy={(isPriv, pwd) => {
              if (onUpdateRoomPrivacy) {
                return onUpdateRoomPrivacy(isPriv, pwd);
              }
            }}
          />

          {/* Edit Channel Appearance Modal */}
          {isEditAppearanceModalOpen && (
            <CreateChannelModal
              isOpen={isEditAppearanceModalOpen}
              onClose={() => setIsEditAppearanceModalOpen(false)}
              userProfile={userProfile}
              isEditing={true}
              initialConfig={{
                roomName: session?.roomName || roomConfig?.roomName || session?.friendName,
                category: session?.category || roomConfig?.category || "resenha_games",
                icon: session?.icon || roomConfig?.icon || "🎮",
                avatarUrl: session?.avatarUrl || roomConfig?.avatarUrl,
                themeColor: session?.themeColor || roomConfig?.themeColor || "#8B5CF6",
                isPrivate: Boolean(session?.isPrivate || roomConfig?.isPrivate),
                password: session?.password || roomConfig?.password,
              }}
              onCreateChannel={(updatedConfig) => {
                void onUpdateRoomAppearance?.(updatedConfig);
                setIsEditAppearanceModalOpen(false);
              }}
            />
          )}
        </motion.div>

        {/* Dedicated Stream Fullscreen Cinematic Mode */}
        {isStreamFullscreen && focusedFeed && ((focusedFeed.type === "video" && focusedFeed.stream) || focusedFeed.cameraStream) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseMove={handleStreamMouseMove}
            className="fixed inset-0 z-[100000] bg-black flex items-center justify-center select-none"
          >
            {/* The Fullscreen Video */}
            <div
              onDoubleClick={() => setIsStreamFullscreen(false)}
              className="relative w-full h-full flex items-center justify-center cursor-default"
            >
              <VideoRenderer
                stream={focusedFeed.stream || focusedFeed.cameraStream!}
                fitMode={videoFitMode}
                muted={focusedFeed.isLocal}
                onVideoElement={(el) => {
                  activeVideoElRef.current = el;
                }}
              />
            </div>

            {/* Floating Top Bar Header */}
            <AnimatePresence>
              {showControlsInStreamFullscreen && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-auto z-20"
                >
                  <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/80 border border-white/10 backdrop-blur-xl shadow-2xl">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-bold text-white">{focusedFeed.title}</span>
                    {focusedFeed.tag && (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-white/20 text-white">
                        {focusedFeed.tag}
                      </span>
                    )}
                    <span className="text-xs font-mono text-white/50">{formatDuration(duration)}</span>
                  </div>

                  <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-black/80 border border-white/10 backdrop-blur-xl shadow-2xl">
                    {/* Aspect ratio toggle */}
                    <button
                      type="button"
                      onClick={() => setVideoFitMode((prev) => (prev === "contain" ? "cover" : "contain"))}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title={videoFitMode === "contain" ? "Preencher tela (Zoom)" : "Ajustar à tela"}
                    >
                      {videoFitMode === "contain" ? <Scan className="h-4 w-4" /> : <Scaling className="h-4 w-4" />}
                    </button>

                    {/* PiP */}
                    <button
                      type="button"
                      onClick={() => void handleTogglePip()}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Mini-player flutuante (PiP)"
                    >
                      <PictureInPicture2 className="h-4 w-4" />
                    </button>

                    {/* Exit Fullscreen */}
                    <button
                      type="button"
                      onClick={() => setIsStreamFullscreen(false)}
                      className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-white text-black font-bold text-xs hover:bg-white/90 transition-colors cursor-pointer"
                      title="Sair da tela cheia (ESC)"
                    >
                      <Minimize2 className="h-4 w-4" />
                      <span>Sair da Tela Cheia</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating Bottom Control Bar */}
            <AnimatePresence>
              {showControlsInStreamFullscreen && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 p-2 rounded-2xl bg-black/85 border border-white/15 backdrop-blur-2xl shadow-2xl pointer-events-auto z-20 transform-gpu"
                >
                  {/* Mute Mic */}
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors cursor-pointer ${isMuted ? "bg-rose-500 text-white shadow-lg" : "bg-white/10 text-white hover:bg-white/20"
                      }`}
                    title={isMuted ? "Desmutar microfone" : "Mutar microfone"}
                  >
                    {isMuted ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
                  </button>

                  {/* Deafen */}
                  <button
                    type="button"
                    onClick={onToggleDeafen}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors cursor-pointer ${isDeafened ? "bg-rose-500 text-white shadow-lg" : "bg-white/10 text-white hover:bg-white/20"
                      }`}
                    title={isDeafened ? "Reativar áudio" : "Desativar áudio"}
                  >
                    {isDeafened ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
                  </button>

                  {/* Stop screen share */}
                  {focusedFeed.isLocal && (
                    <button
                      type="button"
                      onClick={onToggleScreenShare}
                      className="flex h-11 items-center gap-2 px-4 rounded-xl bg-white text-black text-xs font-bold shadow-lg hover:bg-white/90 cursor-pointer"
                    >
                      <MonitorOff className="h-4 w-4" />
                      <span>Parar Transmissão</span>
                    </button>
                  )}

                  {/* Hang up */}
                  <button
                    type="button"
                    onClick={onHangUp}
                    className="flex h-11 items-center gap-2 px-5 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-lg hover:bg-rose-500 cursor-pointer"
                  >
                    <PhoneOff className="h-4 w-4" />
                    <span>Desconectar</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
};
