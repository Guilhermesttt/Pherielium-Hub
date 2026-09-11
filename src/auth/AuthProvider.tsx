import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../services/supabase";
import { apiUrl } from "../services/api";
import { cleanupAllChannels } from "../services/voiceCall";
import { markCheckpointOfflineSync } from "../services/checkpointFriends";
import type { UserProfile } from "../types/domain";

export interface AuthUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<any>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const toProfile = (uid: string, data?: Record<string, any>): UserProfile => {
  const localAvatar = typeof window !== "undefined" ? localStorage.getItem(`phelierium_custom_avatar_${uid}`) : null;
  return {
    uid,
    email: data?.email ?? null,
    displayName: data?.displayName ?? data?.display_name ?? null,
    photoURL: localAvatar || (data?.photoURL ?? data?.photo_url ?? null),
    profileVisibility:
      data?.profileVisibility === "private" || data?.profile_visibility === "private"
        ? "private"
        : "public",
    bio: data?.bio,
    location: data?.location,
    pronouns: data?.pronouns,
    website: data?.website,
    favoriteGenres: data?.favoriteGenres ?? data?.favorite_genres,
    steamId: data?.steamId ?? data?.steam_id,
    steamAvatar: data?.steamAvatar ?? data?.steam_avatar,
    steamUsername: data?.steamUsername ?? data?.steam_username,
    discordId: data?.discordId ?? data?.discord_id,
    discordUsername: data?.discordUsername ?? data?.discord_username,
    discordAvatar: data?.discordAvatar ?? data?.discord_avatar,
    retroAchievementsUlid:
      data?.retroAchievementsUlid ?? data?.retroachievements_ulid,
    retroAchievementsUsername:
      data?.retroAchievementsUsername ?? data?.retroachievements_username,
    status: data?.status,
    playing: data?.playing,
    discordFriends: data?.discordFriends ?? data?.discord_friends,
    checkpointFriends: data?.checkpointFriends ?? data?.checkpoint_friends,
    checkpointFriendRequestsIncoming: data?.checkpointFriendRequestsIncoming ?? data?.checkpoint_friend_requests_incoming,
    checkpointFriendRequestsOutgoing: data?.checkpointFriendRequestsOutgoing ?? data?.checkpoint_friend_requests_outgoing,
    createdAt: data?.createdAt ?? data?.created_at,
    updatedAt: data?.updatedAt ?? data?.updated_at,
    lastSteamSyncAt: data?.lastSteamSyncAt ?? data?.last_steam_sync_at,
    gamesMigratedAt: data?.gamesMigratedAt ?? data?.games_migrated_at,
    onboardingCompletedAt: data?.onboardingCompletedAt ?? data?.onboarding_completed_at,
    achievementSummary: data?.achievementSummary ?? data?.achievement_summary,
    librarySummary: data?.librarySummary ?? data?.library_summary,
  };
};

const loadSocialGraph = async (uid: string) => {
  const { data: relationships, error } = await supabase
    .from("friendships")
    .select("requester_id,addressee_id,status,created_at")
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  if (error || !relationships) {
    return {
      checkpointFriends: [],
      checkpointFriendRequestsIncoming: [],
      checkpointFriendRequestsOutgoing: [],
    };
  }

  const relatedIds = [...new Set(relationships.map((relationship) =>
    relationship.requester_id === uid
      ? relationship.addressee_id
      : relationship.requester_id,
  ))];
  let publicProfiles: any[] = [];
  if (relatedIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("uid,display_name,photo_url,status,playing,presence_updated_at")
      .in("uid", relatedIds);
    if (profilesData && profilesData.length > 0) {
      publicProfiles = profilesData;
    } else {
      const { data: fallbackData } = await supabase
        .from("public_profiles")
        .select("uid,display_name,photo_url")
        .in("uid", relatedIds);
      publicProfiles = fallbackData || [];
    }
  }
  const profileById = new Map((publicProfiles || []).map((profile) => [profile.uid, profile]));
  const compact = (relatedUid: string, createdAt?: string) => {
    const profile = profileById.get(relatedUid);
    const presenceUpdatedAt = Date.parse(String(profile?.presence_updated_at || ""));
    const isFresh = Number.isFinite(presenceUpdatedAt) && Date.now() - presenceUpdatedAt < 75_000;
    const resolvedStatus: "online" | "playing" | "offline" =
      isFresh && (profile?.status === "online" || profile?.status === "playing")
        ? profile.status
        : "offline";
    const resolvedPlaying = resolvedStatus === "playing" ? (profile?.playing as any) || null : null;
    return {
      uid: relatedUid,
      displayName: String(profile?.display_name || "Jogador"),
      photoURL: profile?.photo_url || null,
      status: resolvedStatus,
      playing: resolvedPlaying,
      ...(createdAt ? { createdAt } : {}),
    };
  };

  return {
    checkpointFriends: relationships
      .filter((relationship) => relationship.status === "accepted")
      .map((relationship) => compact(
        relationship.requester_id === uid
          ? relationship.addressee_id
          : relationship.requester_id,
      )),
    checkpointFriendRequestsIncoming: relationships
      .filter((relationship) =>
        relationship.status === "pending" && relationship.addressee_id === uid,
      )
      .map((relationship) => compact(relationship.requester_id, relationship.created_at)),
    checkpointFriendRequestsOutgoing: relationships
      .filter((relationship) =>
        relationship.status === "pending" && relationship.requester_id === uid,
      )
      .map((relationship) => compact(relationship.addressee_id, relationship.created_at)),
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string, fallbackUser?: AuthUser): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("uid", uid)
        .maybeSingle();

      if (error || !data) {
        const fallback = toProfile(uid, {
          email: fallbackUser?.email,
          displayName: fallbackUser?.displayName || fallbackUser?.email?.split("@")[0] || "User",
          photoURL: fallbackUser?.photoURL,
        });
        setUserProfile(fallback);
        return fallback;
      }

      const socialGraph = await loadSocialGraph(uid);
      const prof = {
        ...toProfile(uid, data),
        ...socialGraph,
      };
      setUserProfile(prof);
      return prof;
    } catch (err) {
      console.error("[Auth] Falha ao carregar perfil do Supabase Postgres:", err);
      const fallback = toProfile(uid, {
        email: fallbackUser?.email,
        displayName: fallbackUser?.displayName || fallbackUser?.email?.split("@")[0] || "User",
        photoURL: fallbackUser?.photoURL,
      });
      setUserProfile(fallback);
      return fallback;
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!user?.uid) return null;
    return await fetchProfile(user.uid, user);
  }, [user, fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    if (window.electronAPI) {
      const res = await (window.electronAPI as any).startGoogleBrowserAuth();
      const state = res?.state;
      if (!state) throw new Error("Falha ao iniciar autenticação Google.");

      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          let data: any = null;
          if (typeof (window.electronAPI as any).pollGoogleBrowserAuth === "function") {
            data = await (window.electronAPI as any).pollGoogleBrowserAuth(state);
          } else {
            const statusRes = await fetch(apiUrl(`/auth/desktop/google/status?state=${encodeURIComponent(state)}`));
            if (statusRes.ok) {
              data = await statusRes.json();
            }
          }

          if (data?.status === "error") {
            throw new Error(data.error || "Falha na autenticação do Google.");
          }
          if (data?.status === "complete") {
            let sessionEstablished = false;

            // Prioridade Máxima: Tokens já autenticados e trocados diretamente pelo Backend
            if (data.accessToken && data.refreshToken) {
              const { error: sessionErr } = await supabase.auth.setSession({
                access_token: data.accessToken,
                refresh_token: data.refreshToken,
              });
              if (!sessionErr) {
                return;
              }
            }

            // Estratégia 1: token_hash com type 'email' (padrão GoTrue Supabase v2 para generateLink)
            if (data.hashedToken) {
              const { data: res, error: hashError } = await supabase.auth.verifyOtp({
                token_hash: data.hashedToken,
                type: "email",
              });
              if (!hashError && res?.session) {
                sessionEstablished = true;
              }
            }

            // Estratégia 2: token_hash com type 'magiclink'
            if (!sessionEstablished && data.hashedToken) {
              const { data: res, error: hashError } = await supabase.auth.verifyOtp({
                token_hash: data.hashedToken,
                type: "magiclink",
              });
              if (!hashError && res?.session) {
                sessionEstablished = true;
              }
            }

            // Estratégia 3: email_otp com type 'email'
            if (!sessionEstablished && data.email && data.emailOtp) {
              const { data: res, error: emailOtpError } = await supabase.auth.verifyOtp({
                email: data.email,
                token: data.emailOtp,
                type: "email",
              });
              if (!emailOtpError && res?.session) {
                sessionEstablished = true;
              }
            }

            // Estratégia 4: email_otp com type 'magiclink'
            if (!sessionEstablished && data.email && data.emailOtp) {
              const { data: res, error: magicOtpError } = await supabase.auth.verifyOtp({
                email: data.email,
                token: data.emailOtp,
                type: "magiclink",
              });
              if (!magicOtpError && res?.session) {
                sessionEstablished = true;
              }
            }

            if (sessionEstablished) {
              return;
            }
          }
        } catch (pollErr: any) {
          if (pollErr?.message && !pollErr.message.includes("Failed to fetch") && !pollErr.message.includes("NetworkError")) {
            throw pollErr;
          }
        }
      }
      throw new Error("Tempo limite excedido aguardando login do Google. Tente novamente.");
    } else {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, pass: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password: pass,
    });
    if (error) throw error;
  }, []);

  const signInWithEmail = useCallback(async (email: string, pass: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) throw error;
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      if (user?.uid) {
        markCheckpointOfflineSync(
          user.uid,
          userProfile?.displayName || user.displayName || undefined,
          userProfile?.photoURL || user.photoURL || null,
        );
        if (window.electronAPI && typeof (window.electronAPI as any).clearLocalSteamId === "function") {
          await (window.electronAPI as any).clearLocalSteamId(user.uid).catch((e: unknown) => console.warn("[Auth] clearLocalSteamId error:", e));
        }
        if (window.electronAPI && typeof (window.electronAPI as any).logoutEpic === "function") {
          await (window.electronAPI as any).logoutEpic().catch((e: unknown) => console.warn("[Auth] logoutEpic error:", e));
        }
        try {
          localStorage.removeItem("checkpoint_epic_linked_uid");
          localStorage.removeItem(`checkpoint_epic_user_${user.uid}`);
        } catch {}
      }
    } catch (e) {
      console.warn("Erro ao limpar cache de logout:", e);
    }
    await supabase.auth.signOut().catch((e) => console.warn("[Auth] signOut error:", e));
    cleanupAllChannels();
    setUser(null);
    setUserProfile(null);
  }, [user, userProfile]);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: nunca prender a interface em carregamento indefinido se o auth demorar
    const safetyTimeoutId = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 4000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      try {
        if (session?.user) {
          const authUser: AuthUser = {
            uid: session.user.id,
            email: session.user.email,
            displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || "User",
            photoURL: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
          };
          setUser(authUser);
          await fetchProfile(session.user.id, authUser);
        } else {
          setUser(null);
          setUserProfile(null);
        }
      } catch (err) {
        console.warn("[Auth] Erro ao sincronizar estado de autenticação:", err);
      } finally {
        if (isMounted) {
          clearTimeout(safetyTimeoutId);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeoutId);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  useEffect(() => {
    if (!user?.uid || typeof (supabase as any)?.channel !== "function") return;

    const channel = supabase
      .channel(`friendships_realtime_${user.uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `requester_id=eq.${user.uid}`,
        },
        () => {
          void refreshProfile();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${user.uid}`,
        },
        () => {
          void refreshProfile();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.uid, refreshProfile]);

  // Sincronização periódica inteligente de amizades e solicitações (fallback em caso de oscilação do WebSocket)
  useEffect(() => {
    if (!user?.uid) return;

    const interval = setInterval(() => {
      if (document.hasFocus()) {
        void refreshProfile();
      }
    }, 12_000);

    const onFocus = () => {
      void refreshProfile();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.uid, refreshProfile]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        uid: string;
        displayName?: string;
        photoURL?: string;
        bio?: string;
        favoriteGenres?: string[];
      }>;
      const detail = customEvent.detail;
      if (!detail) return;
      setUserProfile((prev) => {
        if (!prev) return prev;
        if (detail.uid && prev.uid && detail.uid !== prev.uid) return prev;
        return {
          ...prev,
          displayName: detail.displayName || prev.displayName,
          photoURL: detail.photoURL !== undefined ? detail.photoURL : prev.photoURL,
          bio: detail.bio !== undefined ? detail.bio : prev.bio,
          favoriteGenres: detail.favoriteGenres !== undefined ? detail.favoriteGenres : prev.favoriteGenres,
        };
      });
      setUser((prev) => {
        if (!prev) return prev;
        if (detail.uid && prev.uid && detail.uid !== prev.uid) return prev;
        return {
          ...prev,
          displayName: detail.displayName || prev.displayName,
          photoURL: detail.photoURL !== undefined ? detail.photoURL : prev.photoURL,
        };
      });
    };

    window.addEventListener("checkpoint:profile-updated", handleProfileUpdated);
    return () => {
      window.removeEventListener("checkpoint:profile-updated", handleProfileUpdated);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      userProfile,
      loading,
      signInWithGoogle,
      signUpWithEmail,
      signInWithEmail,
      signOutUser,
      refreshProfile,
    }),
    [user, userProfile, loading, signInWithGoogle, signUpWithEmail, signInWithEmail, signOutUser, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useOptionalAuth = () => {
  return useContext(AuthContext);
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Retorna fallback gracioso quando renderizado fora do AuthProvider (ex: testes unitários)
    return {
      user: null,
      userProfile: null,
      loading: false,
      signInWithGoogle: async () => { },
      signUpWithEmail: async () => { },
      signInWithEmail: async () => { },
      signOutUser: async () => { },
      refreshProfile: async () => null,
    };
  }
  return ctx;
};
