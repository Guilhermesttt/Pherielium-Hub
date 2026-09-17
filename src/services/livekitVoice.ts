/**
 * livekitVoice.ts
 * High-performance, low-latency WebRTC SFU client powered by LiveKit Cloud.
 */
import {
  Room,
  RoomEvent,
  Track,
  AudioPresets,
  LocalTrackPublication,
  RemoteTrackPublication,
  Participant,
  RemoteParticipant,
  LocalAudioTrack,
  LocalVideoTrack,
  createLocalAudioTrack,
  createLocalVideoTrack,
  createLocalScreenTracks,
  type VideoCaptureOptions,
} from "livekit-client";
import { apiUrl, getUsableSession } from "./api";

export interface LiveKitTokenResponse {
  token: string;
  serverUrl: string;
}

/**
 * Obtém token JWT assinado para ingressar na sala do LiveKit SFU
 */
export const fetchLiveKitToken = async (
  roomName: string,
  identity: string,
  name?: string,
  metadata?: any,
): Promise<LiveKitTokenResponse> => {
  const session = await getUsableSession();
  const token = session?.access_token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl("/api/voice/livekit-token"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      roomName: String(roomName).trim(),
      identity: String(identity).trim(),
      name: String(name || identity).trim(),
      metadata,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ao obter token do LiveKit (${response.status})`);
  }

  const payload = (await response.json()) as (LiveKitTokenResponse & { disabled?: boolean; error?: string });
  if (payload.disabled) {
    throw new Error("LiveKit não habilitado no backend. Usando WebRTC P2P.");
  }
  const serverUrl =
    String(payload.serverUrl || import.meta.env.VITE_LIVEKIT_URL || "").trim();
  if (!serverUrl) {
    throw new Error("URL do servidor LiveKit não configurada.");
  }
  if (!payload.token) {
    throw new Error("Token LiveKit inválido.");
  }

  return { token: payload.token, serverUrl };
};

export {
  Room,
  RoomEvent,
  Track,
  AudioPresets,
  LocalTrackPublication,
  RemoteTrackPublication,
  Participant,
  RemoteParticipant,
  LocalAudioTrack,
  LocalVideoTrack,
  createLocalAudioTrack,
  createLocalVideoTrack,
  createLocalScreenTracks,
};
