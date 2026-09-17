import { supabase } from "./supabase";
import type { Game, UserProfile } from "../types/domain";
import { apiUrl, getUsableSession } from "./api";
import { broadcastPresenceStatus, getPresenceAudienceUids } from "./realtimeEventBus";

const friendAudienceForBroadcast = (): string[] | undefined => {
  const uids = getPresenceAudienceUids();
  return uids.length > 0 ? uids : undefined;
};

let cachedAccessToken: string | null = null;

export const getCachedAccessToken = () => cachedAccessToken;

if (supabase?.auth) {
  void getUsableSession().then((session) => {
    cachedAccessToken = session?.access_token ?? null;
  }).catch(() => {});

  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
  });
}

const getAuthHeaders = async () => {
  const session = await getUsableSession();
  if (session?.access_token) {
    cachedAccessToken = session.access_token;
  }
  if (!session?.access_token) throw new Error("Sessao expirada. Entre novamente.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
};

export const searchCheckpointFriends = async (query: string, signal?: AbortSignal): Promise<UserProfile[]> => {
  const response = await fetch(apiUrl(`/api/friends/search?q=${encodeURIComponent(query)}`), {
    headers: await getAuthHeaders(),
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    users?: UserProfile[];
  };
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao buscar usuarios.");
  }
  return payload.users ?? [];
};

export const sendCheckpointFriendRequest = async (uid: string) => {
  const response = await fetch(apiUrl("/api/friends/request"), {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ uid }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao enviar solicitacao.");
  }
};

export const acceptCheckpointFriendRequest = async (uid: string) => {
  const response = await fetch(apiUrl("/api/friends/accept"), {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ uid }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    friend?: UserProfile;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao aceitar solicitacao.");
  }
  return payload.friend;
};

export const rejectCheckpointFriendRequest = async (uid: string) => {
  const response = await fetch(apiUrl("/api/friends/reject"), {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ uid }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao rejeitar solicitacao.");
  }
};

export const removeCheckpointFriend = async (uid: string) => {
  const response = await fetch(apiUrl("/api/friends/unfriend"), {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ uid }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao remover amigo.");
  }
};

export const updateCheckpointPresence = async (
  status: "online" | "playing" | "offline",
  currentGameTitle?: string,
  customDisplayName?: string,
  customPhotoURL?: string | null,
) => {
  const session = await getUsableSession();
  if (!session?.user) {
    throw new Error("Sessao expirada. Entre novamente.");
  }

  const displayName =
    customDisplayName ||
    session.user.user_metadata?.displayName ||
    session.user.user_metadata?.display_name ||
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    session.user.user_metadata?.nickname ||
    "Jogador";

  // Fast-path via WebSocket Realtime Broadcast
  void broadcastPresenceStatus({
    uid: session.user.id,
    displayName,
    photoURL: customPhotoURL !== undefined ? customPhotoURL : (session.user.user_metadata?.photoURL || null),
    status,
    playing: currentGameTitle || null,
    updatedAt: Date.now(),
  }, friendAudienceForBroadcast()).catch(() => {});

  const response = await fetch(apiUrl("/api/presence"), {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ status, currentGameTitle }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao atualizar presenca.");
  }
};

/**
 * Marca o usuário como offline imediatamente e de forma síncrona/keepalive
 * para garantir envio no momento exato em que a janela ou o hub é fechado.
 */
export const markCheckpointOfflineSync = (
  uid: string,
  customDisplayName?: string,
  customPhotoURL?: string | null,
) => {
  try {
    const presencePayload = {
      uid,
      displayName: customDisplayName || "Jogador",
      photoURL: customPhotoURL || null,
      status: "offline" as const,
      playing: null,
      updatedAt: Date.now(),
    };

    // 1. Notificação instantânea via WebSocket para amigos conectados
    void broadcastPresenceStatus(presencePayload, friendAudienceForBroadcast()).catch(() => {});

    // 2. Persistência HTTP com keepalive para o backend registrar offline mesmo fechando o processo
    const token = cachedAccessToken;
    const tokenQuery = token
      ? `?token=${encodeURIComponent(token)}&status=offline`
      : `?status=offline`;
    const url = apiUrl(`/api/presence${tokenQuery}`);
    const body = JSON.stringify({ status: "offline", currentGameTitle: null, token });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon(url, blob);
      if (!sent && typeof fetch !== "undefined") {
        void fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } else if (typeof fetch !== "undefined") {
      void fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}
};

/**
 * Versão assíncrona para ser aguardada com precisão no handshake de encerramento
 */
export const markCheckpointOfflineAsync = async (
  uid: string,
  customDisplayName?: string,
  customPhotoURL?: string | null,
) => {
  const presencePayload = {
    uid,
    displayName: customDisplayName || "Jogador",
    photoURL: customPhotoURL || null,
    status: "offline" as const,
    playing: null,
    updatedAt: Date.now(),
  };

  const token = cachedAccessToken;
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}&status=offline` : `?status=offline`;
  const url = apiUrl(`/api/presence${tokenQuery}`);
  const body = JSON.stringify({ status: "offline", currentGameTitle: null, token });

  await Promise.allSettled([
    broadcastPresenceStatus(presencePayload, friendAudienceForBroadcast()),
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      keepalive: true,
    }),
  ]);
};

export const getCheckpointFriendStatuses = async (): Promise<UserProfile[]> => {
  const response = await fetch(apiUrl("/api/friends/status"), {
    headers: await getAuthHeaders(),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    friends?: UserProfile[];
  };
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao consultar presenca dos amigos.");
  }
  return payload.friends ?? [];
};

export const getCheckpointFriendProfile = async (
  uid: string,
): Promise<{ profile: UserProfile; games: Game[] }> => {
  const response = await fetch(apiUrl(`/api/friends/${encodeURIComponent(uid)}/profile`), {
    headers: await getAuthHeaders(),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    profile?: UserProfile;
    games?: Game[];
  };
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao carregar perfil do amigo.");
  }
  if (!payload.profile) {
    throw new Error("Perfil do amigo nao encontrado.");
  }
  return {
    profile: payload.profile,
    games: payload.games ?? [],
  };
};
