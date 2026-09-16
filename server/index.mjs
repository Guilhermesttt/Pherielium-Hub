import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import path from "path";
import os from "node:os";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { getGamingNews } from "./gaming-news.mjs";
import { AccessToken } from "livekit-server-sdk";

export const app = express();

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const supabasePublishableKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || ""
).trim();
const supabaseAnonKey = (
  process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || ""
).trim();
const supabasePublicKey = supabasePublishableKey || supabaseAnonKey;
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const isValidUrl = (url) => typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));

export const supabaseAdmin = (isValidUrl(supabaseUrl) && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null;

export const supaAuthClient = (isValidUrl(supabaseUrl) && supabasePublicKey)
  ? createClient(supabaseUrl, supabasePublicKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null;

const updateLinkedAccountProfile = async (uid, patch) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase Admin nao configurado.");
  }

  const updatedAt = new Date().toISOString();
  const { data: updatedProfile, error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ ...patch, updated_at: updatedAt })
    .eq("uid", uid)
    .select("uid")
    .maybeSingle();

  if (updateError) throw updateError;
  if (updatedProfile) return;

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(uid);
  if (authError) throw authError;

  const authUser = authData?.user;
  const displayName = String(
    authUser?.user_metadata?.full_name
    || authUser?.user_metadata?.name
    || authUser?.email?.split("@")[0]
    || "Jogador",
  ).trim();

  const { error: insertError } = await supabaseAdmin.from("profiles").insert({
    uid,
    email: authUser?.email || null,
    display_name: displayName,
    ...patch,
    updated_at: updatedAt,
  });
  if (insertError) throw insertError;
};

const port = Number(process.env.PORT ?? 8787);
const frontendUrl = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);
const parseOrigins = (...values) =>
  values
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

const allowedFrontendOrigins = new Set(
  parseOrigins(
    frontendUrl,
    process.env.FRONTEND_URLS,
    "https://checkpoint-launcher.netlify.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ),
);
const backendPublicUrl = (
  process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${port}`
).replace(/\/$/, "");
const steamApiKey = process.env.STEAM_API_KEY?.trim();
const epicSandboxId = process.env.EPIC_SANDBOX_ID?.trim();
const discordClientId = process.env.DISCORD_CLIENT_ID?.trim();
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
const discordOauthScope = process.env.DISCORD_OAUTH_SCOPE?.trim() || "identify";
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
export const resolveChatRetentionDays = (value) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 365 ? parsed : 7;
};
const CHAT_RETENTION_DAYS = resolveChatRetentionDays(process.env.CHAT_RETENTION_DAYS);
const CHAT_RETENTION_MS = CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const CHAT_CLEANUP_BATCH_SIZE = 200;
const CHAT_CLEANUP_MAX_BATCHES = 10;
const CHAT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let chatCleanupTail = Promise.resolve();

const runChatRetentionCleanup = async ({
  chatId = "",
  now = Date.now(),
} = {}) => {
  if (!supabaseAdmin) return { deletedMessages: 0, deletedAttachments: 0 };

  const cutoff = new Date(now - CHAT_RETENTION_MS).toISOString();
  let deletedMessages = 0;
  let deletedAttachments = 0;

  for (let batch = 0; batch < CHAT_CLEANUP_MAX_BATCHES; batch += 1) {
    let query = supabaseAdmin
      .from("chat_messages")
      .select("id,attachment_path")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(CHAT_CLEANUP_BATCH_SIZE);
    if (chatId) query = query.eq("chat_id", chatId);

    let { data: expiredMessages, error: selectError } = await query;
    if (selectError && /attachment_path/i.test(selectError.message)) {
      const fallbackQuery = await supabaseAdmin
        .from("chat_messages")
        .select("id")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(CHAT_CLEANUP_BATCH_SIZE);
      expiredMessages = fallbackQuery.data;
      selectError = fallbackQuery.error;
    }
    if (selectError) throw selectError;
    if (!expiredMessages?.length) break;

    const attachmentPaths = [...new Set(expiredMessages
      .map((message) => String(message.attachment_path || "").trim())
      .filter(Boolean))];
    let attachmentsRemoved = true;
    if (attachmentPaths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("attachments")
        .remove(attachmentPaths);
      if (storageError) {
        attachmentsRemoved = false;
        console.error("Falha ao limpar anexos expirados do chat:", storageError.message);
      } else {
        deletedAttachments += attachmentPaths.length;
      }
    }

    const deletableIds = expiredMessages
      .filter((message) => attachmentsRemoved || !message.attachment_path)
      .map((message) => message.id);
    if (deletableIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("chat_messages")
        .delete()
        .in("id", deletableIds);
      if (deleteError) throw deleteError;
      deletedMessages += deletableIds.length;
    }

    if (!attachmentsRemoved || expiredMessages.length < CHAT_CLEANUP_BATCH_SIZE) break;
  }

  return { deletedMessages, deletedAttachments };
};

export const cleanupExpiredChatData = (options = {}) => {
  const queuedCleanup = chatCleanupTail.then(() => runChatRetentionCleanup(options));
  chatCleanupTail = queuedCleanup.catch(() => undefined);
  return queuedCleanup;
};

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        mediaSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: [
          "'self'",
          "https://*.supabase.co",
          "wss://*.supabase.co",
          "https://*.livekit.cloud",
          "wss://*.livekit.cloud",
          "https://api.nexusmods.com",
          "https://steamcommunity.com",
          "https://checkpoint-launcher.onrender.com",
          "http://localhost:*",
          "ws://localhost:*",
          "http://127.0.0.1:*",
          "ws://127.0.0.1:*",
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedFrontendOrigins.has(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use((err, _req, res, next) => {
  if (err && (err.type === "entity.too.large" || err instanceof SyntaxError)) {
    return res.status(err.status || 413).json({ error: err.message || "Payload da requisição muito grande." });
  }
  next(err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "..", "public")));

const steamOpenIdEndpoint = "https://steamcommunity.com/openid/login";
const epicStoreGraphqlEndpoint = "https://store.epicgames.com/graphql";
const discordAuthorizeEndpoint = "https://discord.com/oauth2/authorize";
const discordTokenEndpoint = "https://discord.com/api/oauth2/token";
const discordCurrentUserEndpoint = "https://discord.com/api/users/@me";
const discordRelationshipsEndpoint = "https://discord.com/api/users/@me/relationships";
const pendingStates = new Map();
const pendingDiscordStates = new Map();
const pendingDesktopGoogleStates = new Map();

const appDetailsCache = new Map();
const achievementsCache = new Map();
const achievementSummaryCache = new Map();
const achievementSchemaCache = new Map();
const steamPresenceCache = new Map();
const steamOwnedGamesCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hora
const STEAM_PRESENCE_CACHE_TTL = 10 * 1000;
const STEAM_OWNED_GAMES_CACHE_TTL = 10 * 60 * 1000;
const STEAM_API_TIMEOUT_MS = 8 * 1000;
const ACHIEVEMENT_SUMMARY_REQUEST_BUDGET_MS = 45 * 1000;
const MAX_ACHIEVEMENT_CACHE_ENTRIES = 5000;
const MAX_STEAM_OWNED_GAMES_CACHE_ENTRIES = 200;
const MAX_ACHIEVEMENT_SUMMARY_APP_IDS = 250;
const FRIEND_PROFILE_GAME_LIMIT = 500;
const ACTIVITY_AUDIENCE_REVOKE_BATCH_SIZE = 400;
const STEAM_AUTH_STATE_TTL = 1000 * 60 * 10; // 10 minutos
const DISCORD_AUTH_STATE_TTL = 1000 * 60 * 10; // 10 minutos
const DESKTOP_GOOGLE_AUTH_STATE_TTL = 1000 * 60 * 5; // 5 minutos

const steamAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const steamPublicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 250,
  standardHeaders: true,
  legacyHeaders: false,
});

const steamPrivateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false,
});

const steamAchievementSummaryLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => String(req.authUid || req.user?.id || req.supabaseUser?.uid || "unauthenticated"),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
});

const setBoundedCacheEntry = (cache, key, value, maxEntries = MAX_ACHIEVEMENT_CACHE_ENTRIES) => {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
};

const isSteamTimeoutError = (error) =>
  error?.name === "AbortError" || error?.name === "TimeoutError";

const fetchSteamWithTimeout = async (url, options = {}, timeoutMs = STEAM_API_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1, Math.min(STEAM_API_TIMEOUT_MS, Number(timeoutMs) || STEAM_API_TIMEOUT_MS)),
  );
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

export const normalizeSteamPlayerProfile = (steamId, payload) => {
  const normalizedSteamId = String(steamId || "").trim();
  const player = Array.isArray(payload?.response?.players)
    ? payload.response.players.find(
      (candidate) => String(candidate?.steamid || "").trim() === normalizedSteamId,
    )
    : null;
  if (!player) return null;

  const username = String(player.personaname || "").trim().slice(0, 80);
  const rawAvatar = String(
    player.avatarfull || player.avatarmedium || player.avatar || "",
  ).trim();
  const avatar = rawAvatar.replace(/^http:\/\//i, "https://");

  return {
    steam_id: normalizedSteamId,
    steam_username: username || null,
    steam_avatar: /^https:\/\//i.test(avatar) ? avatar : null,
  };
};

const fetchSteamPlayerProfile = async (steamId) => {
  if (!steamApiKey) return null;

  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/");
  url.searchParams.set("key", steamApiKey);
  url.searchParams.set("steamids", steamId);
  url.searchParams.set("format", "json");

  const response = await fetchSteamWithTimeout(url.toString());
  if (!response.ok) {
    throw new Error(`Falha ao consultar perfil Steam (status ${response.status}).`);
  }
  return normalizeSteamPlayerProfile(steamId, await response.json());
};

const normalizeSteamAppIds = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value?.appid ?? value).trim())
    .filter((value) => /^\d+$/.test(value)),
));

const cacheOwnedSteamAppIds = (steamId, games) => {
  const appIds = new Set(normalizeSteamAppIds(games));
  setBoundedCacheEntry(
    steamOwnedGamesCache,
    steamId,
    { appIds, timestamp: Date.now() },
    MAX_STEAM_OWNED_GAMES_CACHE_ENTRIES,
  );
  return appIds;
};

const fetchOwnedSteamAppIds = async (steamId) => {
  const cached = steamOwnedGamesCache.get(steamId);
  if (cached && Date.now() - cached.timestamp < STEAM_OWNED_GAMES_CACHE_TTL) {
    return cached.appIds;
  }

  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/");
  url.searchParams.set("key", steamApiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "0");
  url.searchParams.set("include_played_free_games", "1");
  url.searchParams.set("format", "json");

  const response = await fetchSteamWithTimeout(url.toString());
  if (!response.ok) {
    const error = new Error(`Falha ao validar biblioteca Steam (status ${response.status}).`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  if (!payload?.response || (
    payload.response.games !== undefined && !Array.isArray(payload.response.games)
  )) {
    const error = new Error("A Steam retornou uma biblioteca inválida.");
    error.statusCode = 502;
    throw error;
  }

  return cacheOwnedSteamAppIds(steamId, payload.response.games || []);
};

export const partitionOwnedSteamAppIds = (requestedAppIds, ownedAppIds) => {
  const owned = ownedAppIds instanceof Set ? ownedAppIds : new Set(normalizeSteamAppIds(ownedAppIds));
  const requested = normalizeSteamAppIds(requestedAppIds);
  return {
    allowedAppIds: requested.filter((appId) => owned.has(appId)),
    rejectedAppIds: requested.filter((appId) => !owned.has(appId)),
  };
};

const buildSteamReturnTo = (token) =>
  `${backendPublicUrl}/auth/steam/callback?token=${encodeURIComponent(token)}`;

const buildLauncherAuthCallback = (provider, status) => {
  const callbackUrl = new URL("phelierium://auth/callback");
  callbackUrl.searchParams.set(`${provider}Status`, status);
  return callbackUrl.toString();
};

export const buildDiscordRedirectUri = () => {
  const configured = process.env.DISCORD_REDIRECT_URI?.trim();
  let redirectUri = "";
  if (configured && !configured.includes("localhost")) {
    redirectUri = configured.replace(/\/$/, "");
  } else if (backendPublicUrl && !backendPublicUrl.includes("localhost")) {
    redirectUri = `${backendPublicUrl}/auth/discord/callback`;
  } else {
    redirectUri = (configured || `${backendPublicUrl}/auth/discord/callback`).replace(/\/$/, "");
  }

  if (/\.supabase\.co\/auth\/v1\/callback$/i.test(redirectUri)) {
    throw new Error(
      "DISCORD_REDIRECT_URI deve apontar para /auth/discord/callback do backend, nao para o callback do Supabase.",
    );
  }

  return redirectUri;
};

export const buildGoogleRedirectUri = () => {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured && !configured.includes("localhost")) {
    return configured.replace(/\/$/, "");
  }
  if (backendPublicUrl && !backendPublicUrl.includes("localhost")) {
    return `${backendPublicUrl}/auth/google/callback`;
  }
  return (configured || `${backendPublicUrl}/auth/google/callback`).replace(/\/$/, "");
};

const createGoogleOauthClient = () => {
  if (!googleClientId || !googleClientSecret) {
    throw new Error("GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET nao configurado no backend.");
  }
  return new OAuth2Client(googleClientId, googleClientSecret, buildGoogleRedirectUri());
};

const buildAuthCallbackHtml = ({ platform, launcherCallbackUrl }) => {
  const platformColors = {
    steam: "#ffffff",
    discord: "#ffffff",
    playstation: "#ffffff",
    google: "#ffffff",
    github: "#ffffff",
  };
  const color = platformColors[String(platform).toLowerCase()] || "#ffffff";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Phelierium Game Hub</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Unbounded:wght@500;700&display=swap" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html { color-scheme: dark; }

      body {
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #030405;
        color: #ffffff;
        font-family: 'Inter', system-ui, sans-serif;
        position: relative;
        overflow: hidden;
        opacity: 0;
        animation: pageIn 0.6s ease-out forwards;
        transition: opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1);
      }
      @keyframes pageIn { from { opacity: 0; } to { opacity: 1; } }

      /* Cosmic Deep Space Background */
      .cosmos-bg {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.07) 0%, transparent 60%),
          radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.04) 0%, transparent 50%),
          radial-gradient(circle at 20% 70%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
          #030405;
        z-index: 0;
        pointer-events: none;
      }
      .stars {
        position: absolute;
        inset: 0;
        background-image:
          radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.7), rgba(0,0,0,0)),
          radial-gradient(1.5px 1.5px at 100px 150px, rgba(255,255,255,0.8), rgba(0,0,0,0)),
          radial-gradient(1px 1px at 240px 90px, rgba(255,255,255,0.6), rgba(0,0,0,0)),
          radial-gradient(2px 2px at 320px 280px, rgba(255,255,255,0.9), rgba(0,0,0,0)),
          radial-gradient(1px 1px at 450px 200px, rgba(255,255,255,0.5), rgba(0,0,0,0));
        background-size: 500px 500px;
        opacity: 0;
        z-index: 1;
        animation: starsIn 1.6s ease-out 0.1s forwards;
      }
      @keyframes starsIn { to { opacity: 0.55; } }

      /* Marca no canto, igual à tela de login */
      .brand-corner {
        position: absolute;
        top: 28px;
        left: 32px;
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 6px;
        opacity: 0;
        animation: fadeInUp 0.5s ease-out 0.15s forwards;
      }
      .brand-corner .brand-name {
        font-family: 'Unbounded', system-ui, sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.1em;
        color: #ffffff;
      }
      .brand-corner .reg { font-size: 13px; color: rgba(255,255,255,0.4); }

      /* Palco central: sem cartão, logo flutuando com anéis orbitais */
      .stage {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 24px;
      }

      .orbit-wrap {
        position: relative;
        width: 300px;
        height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
      }
      .ring {
        position: absolute;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.07);
        opacity: 0;
        animation: ringIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards, spin linear infinite;
      }
      .ring--outer { width: 300px; height: 300px; animation-delay: 0.25s, 0s; animation-duration: 0.8s, 46s; }
      .ring--mid   { width: 240px; height: 240px; border-style: dashed; border-color: rgba(255,255,255,0.09); animation-delay: 0.35s, 0s; animation-duration: 0.8s, 30s; animation-direction: normal, reverse; }
      .ring--inner { width: 190px; height: 190px; animation-delay: 0.45s, 0s; animation-duration: 0.8s, 20s; }
      @keyframes ringIn { to { opacity: 1; } }
      @keyframes spin { to { transform: rotate(360deg); } }

      .core-glow {
        position: absolute;
        width: 170px;
        height: 170px;
        border-radius: 50%;
        background: #ffffff;
        filter: blur(60px);
        opacity: 0;
        animation: glowIn 0.9s ease-out 0.4s forwards, glowPulse 4s ease-in-out 1.3s infinite;
      }
      @keyframes glowIn { to { opacity: 0.22; } }
      @keyframes glowPulse { 0%, 100% { opacity: 0.18; transform: scale(1); } 50% { opacity: 0.32; transform: scale(1.12); } }

      .status-burst {
        position: absolute;
        width: 118px;
        height: 118px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.35);
        opacity: 0;
        animation: burst 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.55s forwards;
      }
      @keyframes burst {
        0% { opacity: 0.9; transform: scale(0.4); }
        100% { opacity: 0; transform: scale(2.1); }
      }

      .logo-badge {
        position: relative;
        z-index: 1;
        opacity: 0;
        transform: scale(0.5) rotate(-8deg);
        animation: logoIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s forwards, floatY 5s ease-in-out 1.1s infinite;
      }
      @keyframes logoIn { to { opacity: 1; transform: scale(1) rotate(0deg); } }
      @keyframes floatY { 0%, 100% { transform: translateY(-6px); } 50% { transform: translateY(6px); } }

      .logo-img {
        display: block;
        width: 104px;
        height: 104px;
        object-fit: contain;
        filter: drop-shadow(0 0 40px rgba(255,255,255,0.55));
      }

      .check-badge {
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 18px rgba(255,255,255,0.6);
        opacity: 0;
        transform: scale(0);
        animation: badgeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.75s forwards;
      }
      @keyframes badgeIn { to { opacity: 1; transform: scale(1); } }

      .check-path {
        stroke-dasharray: 40;
        stroke-dashoffset: 40;
        animation: draw 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.85s;
      }
      @keyframes draw { to { stroke-dashoffset: 0; } }

      h1 {
        font-family: 'Unbounded', system-ui, sans-serif;
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.01em;
        margin-bottom: 10px;
        opacity: 0;
        transform: translateY(8px);
        animation: fadeInUp 0.5s ease-out 0.95s forwards;
      }
      p.sub {
        font-size: 13.5px;
        color: rgba(255, 255, 255, 0.55);
        line-height: 1.6;
        max-width: 340px;
        margin-bottom: 24px;
        opacity: 0;
        transform: translateY(8px);
        animation: fadeInUp 0.5s ease-out 1.05s forwards;
      }
      @keyframes fadeInUp { to { opacity: 1; transform: translateY(0); } }

      .divider {
        width: 100%;
        max-width: 220px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
        margin-bottom: 18px;
        transform: scaleX(0);
        animation: divIn 0.6s ease-out 1.15s forwards;
      }
      @keyframes divIn { to { transform: scaleX(1); } }

      .footer {
        font-size: 12.5px;
        color: rgba(255, 255, 255, 0.45);
        opacity: 0;
        animation: fadeIn 0.5s ease-out 1.25s forwards;
      }
      @keyframes fadeIn { to { opacity: 1; } }

      @media (prefers-reduced-motion: reduce) {
        body, .stars, .brand-corner, .ring, .core-glow, .status-burst, .logo-badge, h1, p.sub, .divider, .footer {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
        .check-path { animation: none; stroke-dashoffset: 0; }
      }
    </style>
  </head>
  <body>
    <div class="cosmos-bg"></div>
    <div class="stars"></div>

    <div class="brand-corner">
      <span class="brand-name">PHELIERIUM</span>
      <span class="reg">®</span>
    </div>

    <main class="stage">
      <div class="orbit-wrap">
        <div class="ring ring--outer"></div>
        <div class="ring ring--mid"></div>
        <div class="ring ring--inner"></div>
        <div class="core-glow"></div>
        <div class="status-burst"></div>
        <div class="logo-badge">
          <img class="logo-img" src="${backendPublicUrl}/Pherielium_logo.png" alt="Phelierium" />
          <div class="check-badge">
            <svg width="16" height="16" viewBox="0 0 52 52">
              <path class="check-path" d="M15 27 L23 35 L38 17" fill="none" stroke="#000000" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      <h1>${platform} conectado.</h1>
      <p class="sub">Sua conta foi vinculada com sucesso.<br/>Você pode fechar esta página.</p>

      <div class="divider"></div>

      <p class="footer">
        Você já pode fechar esta aba com segurança.
      </p>
    </main>

    <script>
      const launcherCallbackUrl = ${JSON.stringify(launcherCallbackUrl)};
      if (launcherCallbackUrl) {
        try { window.location.assign(launcherCallbackUrl); } catch (e) {}
      }
    </script>
  </body>
</html>
`;
};

const cleanupPendingStates = () => {
  const now = Date.now();
  for (const [token, pending] of pendingStates.entries()) {
    if (now - pending.createdAt > STEAM_AUTH_STATE_TTL) {
      pendingStates.delete(token);
    }
  }
};

const cleanupPendingDiscordStates = () => {
  const now = Date.now();
  for (const [state, pending] of pendingDiscordStates.entries()) {
    if (now - pending.createdAt > DISCORD_AUTH_STATE_TTL) {
      pendingDiscordStates.delete(state);
    }
  }
};

const cleanupPendingDesktopGoogleStates = () => {
  const now = Date.now();
  for (const [state, pending] of pendingDesktopGoogleStates.entries()) {
    if (now - pending.createdAt > DESKTOP_GOOGLE_AUTH_STATE_TTL) {
      pendingDesktopGoogleStates.delete(state);
    }
  }
};

const buildSteamOpenIdUrl = (token) => {
  const returnTo = buildSteamReturnTo(token);
  const realm = backendPublicUrl;
  const openIdUrl = new URL(steamOpenIdEndpoint);

  openIdUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  openIdUrl.searchParams.set("openid.mode", "checkid_setup");
  openIdUrl.searchParams.set("openid.return_to", returnTo);
  openIdUrl.searchParams.set("openid.realm", realm);
  openIdUrl.searchParams.set(
    "openid.identity",
    "http://specs.openid.net/auth/2.0/identifier_select",
  );
  openIdUrl.searchParams.set(
    "openid.claimed_id",
    "http://specs.openid.net/auth/2.0/identifier_select",
  );

  return openIdUrl.toString();
};

const buildDiscordAuthorizeUrl = (state) => {
  if (!discordClientId) {
    throw new Error("DISCORD_CLIENT_ID nao configurado no backend.");
  }
  const authorizeUrl = new URL(discordAuthorizeEndpoint);
  authorizeUrl.searchParams.set("client_id", discordClientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", discordOauthScope);
  authorizeUrl.searchParams.set("redirect_uri", buildDiscordRedirectUri());
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "consent");
  return authorizeUrl.toString();
};

const buildGoogleAuthorizeUrl = (state) => {
  const client = createGoogleOauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
  });
};

const requestDiscordToken = async (code) => {
  if (!discordClientId || !discordClientSecret) {
    throw new Error("Credenciais Discord nao configuradas no backend.");
  }

  const body = new URLSearchParams();
  body.set("client_id", discordClientId);
  body.set("client_secret", discordClientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", buildDiscordRedirectUri());

  const response = await fetch(discordTokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const discordAvatarUrl = (discordUser) => {
  if (!discordUser?.id || !discordUser?.avatar) return "";
  const extension = String(discordUser.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${extension}`;
};

const discordDisplayName = (discordUser) =>
  discordUser?.discriminator && discordUser.discriminator !== "0"
    ? `${discordUser.username}#${discordUser.discriminator}`
    : String(discordUser?.global_name || discordUser?.username || "Discord");

const fetchDiscordFriends = async (accessToken, tokenType = "Bearer") => {
  try {
    const response = await fetch(discordRelationshipsEndpoint, {
      headers: { Authorization: `${tokenType} ${accessToken}` },
    });
    if (!response.ok) return [];
    const relationships = await response.json().catch(() => []);
    if (!Array.isArray(relationships)) return [];

    return relationships
      .filter((relationship) => relationship?.user?.id)
      .map((relationship) => ({
        id: String(relationship.user.id),
        username: discordDisplayName(relationship.user),
        avatar: discordAvatarUrl(relationship.user),
        relationshipType: relationship.type ?? null,
      }))
      .slice(0, 250);
  } catch {
    return [];
  }
};

const normalizeOpenIdBody = (query) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    const normalizedKey = key.replace(/^openid\./, "openid.");
    const finalValue = Array.isArray(value) ? value[0] : String(value ?? "");
    params.append(normalizedKey, finalValue);
  });
  params.set("openid.mode", "check_authentication");
  return params;
};

const steamStoreFetchHeaders = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const STORE_LOCALES = {
  "pt-BR": { locale: "pt-BR", steam: "brazilian", country: "BR" },
  "en-US": { locale: "en-US", steam: "english", country: "US" },
  "es-ES": { locale: "es-ES", steam: "spanish", country: "ES" },
  "fr-FR": { locale: "fr-FR", steam: "french", country: "FR" },
  "de-DE": { locale: "de-DE", steam: "german", country: "DE" },
  "it-IT": { locale: "it-IT", steam: "italian", country: "IT" },
};

const resolveStoreLocale = (value) =>
  STORE_LOCALES[String(value || "").trim()] || STORE_LOCALES["pt-BR"];

const EPIC_CATALOG_ITEM_QUERY = `
query catalogItemQuery($namespace: String!, $id: String!, $locale: String, $withOffers: Boolean!) {
  Catalog {
    catalogItem(namespace: $namespace, id: $id, locale: $locale) {
      id
      namespace
      title
      description
      releaseDate
      seller {
        name
      }
      keyImages {
        type
        url
      }
      categories {
        path
      }
      releaseInfo {
        appId
        platform
      }
      customAttributes {
        key
        value
      }
      dlcItemList {
        id
      }
      mainGameItem {
        id
      }
      offers @include(if: $withOffers) {
        urlSlug
      }
    }
  }
}
`;

const EPIC_SEARCH_STORE_QUERY = `
query searchStoreQuery($keywords: String, $locale: String, $country: String!, $count: Int, $start: Int) {
  Catalog {
    searchStore(keywords: $keywords, locale: $locale, country: $country, count: $count, start: $start) {
      elements {
        id
        namespace
        title
        description
        productSlug
        urlSlug
        seller {
          name
        }
        keyImages {
          type
          url
        }
        customAttributes {
          key
          value
        }
      }
    }
  }
}
`;

const pickEpicImage = (images, preferredTypes) => {
  if (!Array.isArray(images) || images.length === 0) return "";
  const normalized = images.filter((image) => typeof image?.url === "string" && image.url);
  for (const preferredType of preferredTypes) {
    const found = normalized.find(
      (image) =>
        typeof image.type === "string" &&
        image.type.toLowerCase().includes(preferredType.toLowerCase()),
    );
    if (found?.url) return found.url;
  }
  return normalized[0]?.url || "";
};

const extractEpicCustomAttributes = (customAttributes) => {
  if (!Array.isArray(customAttributes)) return {};
  return customAttributes.reduce((acc, entry) => {
    if (entry?.key) {
      acc[entry.key] = entry?.value ?? "";
    }
    return acc;
  }, {});
};

const fetchEpicCatalogItem = async (namespace, itemId, locale = "pt-BR") => {
  const response = await fetch(epicStoreGraphqlEndpoint, {
    method: "POST",
    headers: {
      ...steamStoreFetchHeaders,
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify({
      query: EPIC_CATALOG_ITEM_QUERY,
      variables: {
        namespace,
        id: itemId,
        locale,
        withOffers: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar catálogo Epic (status ${response.status}).`);
  }

  const payload = await response.json().catch(() => ({}));
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error("GraphQL da Epic retornou erros ao consultar o catálogo.");
  }

  return payload?.data?.Catalog?.catalogItem ?? null;
};

const postEpicGraphql = async (query, variables) => {
  const headers = {
    ...steamStoreFetchHeaders,
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Origin: "https://store.epicgames.com",
    Referer: "https://store.epicgames.com/",
  };
  const body = JSON.stringify({ query, variables });

  const response = await fetch(epicStoreGraphqlEndpoint, {
    method: "POST",
    headers,
    body,
  });

  if (response.ok) {
    return { ok: true, status: response.status, payload: await response.json().catch(() => ({})) };
  }

  return { ok: false, status: response.status, payload: null };
};

export const buildEpicDetails = (catalogId, namespace, catalogItem) => {
  const customAttributes = extractEpicCustomAttributes(catalogItem?.customAttributes);
  const keyImages = Array.isArray(catalogItem?.keyImages) ? catalogItem.keyImages : [];
  const releaseInfo = Array.isArray(catalogItem?.releaseInfo) ? catalogItem.releaseInfo : [];
  const preferredRelease = releaseInfo.find(
    (release) => /win/i.test(String(release?.platform || "")) && String(release?.appId || "").trim(),
  ) || releaseInfo.find((release) => String(release?.appId || "").trim());
  const appName = String(preferredRelease?.appId || "").trim();

  let screenshots = keyImages
    .filter(
      (image) =>
        typeof image?.url === "string" &&
        typeof image?.type === "string" &&
        (image.type.toLowerCase().includes("screenshot") ||
          image.type.toLowerCase().includes("gallery") ||
          image.type.toLowerCase().includes("wide") ||
          image.type.toLowerCase().includes("hero") ||
          image.type.toLowerCase().includes("vault") ||
          image.type.toLowerCase().includes("featuredmedia"))
    )
    .map((image) => image.url);

  if (screenshots.length === 0) {
    screenshots = keyImages
      .filter(
        (image) =>
          typeof image?.url === "string" &&
          typeof image?.type === "string" &&
          !image.type.toLowerCase().includes("logo")
      )
      .map((image) => image.url);
  }

  const sellerName = String(catalogItem?.seller?.name ?? "").trim();
  const rawReleaseDate = catalogItem?.releaseDate || customAttributes?.releaseDate || "";

  return {
    catalogId,
    namespace,
    appName,
    title:
      String(catalogItem?.title ?? "").trim() ||
      String(customAttributes?.productName ?? "").trim() ||
      catalogId,
    image:
      pickEpicImage(keyImages, ["wide", "hero", "vault", "offerimagewide"]) ||
      pickEpicImage(keyImages, ["thumbnail", "dieselgameboxtall"]),
    backgroundImage: pickEpicImage(keyImages, ["wide", "hero", "vault", "offerimagewide"]),
    cardImage: pickEpicImage(keyImages, ["tall", "thumbnail", "box"]),
    logoImage: pickEpicImage(keyImages, ["logo"]),
    description:
      String(customAttributes?.shortDescription ?? "").trim() ||
      String(catalogItem?.description ?? "").trim(),
    aboutTheGame:
      String(customAttributes?.aboutThisGame ?? "").trim() ||
      String(catalogItem?.description ?? "").trim(),
    releaseDate: String(rawReleaseDate).trim(),
    developer:
      String(customAttributes?.developerName ?? "").trim() ||
      String(customAttributes?.developerDisplayName ?? "").trim() ||
      sellerName,
    publisher:
      String(customAttributes?.publisherName ?? "").trim() ||
      String(customAttributes?.publisherDisplayName ?? "").trim() ||
      sellerName,
    tags: Array.isArray(catalogItem?.categories)
      ? catalogItem.categories
        .map((category) => String(category?.path ?? "").split("/").pop())
        .filter(Boolean)
      : [],
    screenshots,
  };
};

const pickSteamTrailerUrl = (movies) => {
  if (!Array.isArray(movies) || movies.length === 0) return null;
  const list = [...movies].sort(
    (a, b) => Number(Boolean(b?.highlight)) - Number(Boolean(a?.highlight)),
  );
  for (const m of list) {
    const mp4 = m?.mp4;
    const webm = m?.webm;
    let u = null;
    if (mp4 && typeof mp4 === "object") {
      u = mp4.max || mp4["480"];
    }
    if (!u && webm && typeof webm === "object") {
      u = webm.max || webm["480"];
    }
    if (u) return { url: u, thumbnail: m?.thumbnail || null };
  }
  return null;
};

const achievementPercentagesCache = new Map();
const ACHIEVEMENT_PERCENTAGES_TTL = 60 * 60 * 1000;

const fetchSteamAchievementPercentages = async (appId) => {
  const cacheKey = `pct_${appId}`;
  const cached = achievementPercentagesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ACHIEVEMENT_PERCENTAGES_TTL) {
    return cached.data;
  }

  const url = new URL(
    "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/",
  );
  url.searchParams.set("gameappid", appId);
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return {};
    const payload = await response.json();
    const raw = payload?.achievementpercentages?.achievements;
    if (!Array.isArray(raw)) return {};

    const map = {};
    for (const item of raw) {
      const name = String(item?.name ?? "").trim();
      const pct = Number(item?.percent ?? 0);
      if (name && pct > 0) {
        map[name] = pct;
      }
    }

    achievementPercentagesCache.set(cacheKey, { data: map, timestamp: Date.now() });
    return map;
  } catch {
    return {};
  }
};

const fetchSteamAchievementSchema = async (appId, language = "pt-BR") => {
  const storeLocale = resolveStoreLocale(language);
  const cacheKey = `${appId}:${storeLocale.locale}`;
  const cached = achievementSchemaCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = new URL(
    "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/",
  );
  url.searchParams.set("key", steamApiKey);
  url.searchParams.set("appid", appId);
  url.searchParams.set("l", storeLocale.steam);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Falha ao consultar schema de conquistas (status ${response.status}).`);
  }

  const payload = await response.json();
  const rawAchievements = payload?.game?.availableGameStats?.achievements;
  const schema = Array.isArray(rawAchievements)
    ? rawAchievements.map((achievement) => ({
      apiName: String(achievement?.name ?? "").trim(),
      displayName: String(
        achievement?.displayName ?? achievement?.name ?? "",
      ).trim(),
      description: String(achievement?.description ?? "").trim(),
      icon: String(achievement?.icon ?? "").trim(),
      iconGray: String(achievement?.icongray ?? "").trim(),
      hidden: Number(achievement?.hidden ?? 0) === 1,
    }))
    : [];

  achievementSchemaCache.set(cacheKey, {
    data: schema,
    timestamp: Date.now(),
  });

  return schema;
};

const parseDiskSizeGb = (text) => {
  if (!text) return null;

  const plain = String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(li|p|div|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ");

  const storageLabels =
    /(storage|hard\s*drive|disk\s*space|available\s*space|drive\s*space|armazenamento|espa[çc]o\s+em\s+disco|espa[çc]o\s+dispon[ií]vel)/i;
  const nonStorageLabels =
    /(memory|mem[oó]ria|ram|vram|video|graphics|gpu|placa\s+de\s+v[ií]deo)/i;

  const values = [];
  const lines = plain
    .split(/\n|(?=\b(?:storage|hard\s*drive|disk\s*space|armazenamento|espa[çc]o\s+em\s+disco)\b)/i)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!storageLabels.test(line) || nonStorageLabels.test(line)) continue;

    for (const match of line.matchAll(/(\d+(?:[.,]\d+)?)\s*(GB|MB)\b/gi)) {
      const amount = Number(match[1].replace(",", "."));
      if (!Number.isFinite(amount)) continue;
      values.push(match[2].toUpperCase() === "MB" ? amount / 1024 : amount);
    }
  }

  if (values.length === 0) return null;
  return Number(Math.max(...values).toFixed(1));
};

const requireAuth = async (req, res, next) => {
  const header = String(req.headers.authorization ?? "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  let bodyToken = null;
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      bodyToken = typeof parsed?.token === "string" ? parsed.token.trim() : null;
    } catch { }
  } else if (req.body && typeof req.body.token === "string") {
    bodyToken = req.body.token.trim();
  }
  const queryToken = typeof req.query?.token === "string" ? req.query.token.trim() : null;
  const token = match ? match[1] : (bodyToken || queryToken || null);

  if (!token) {
    res.status(401).json({ error: "Token de autenticacao ausente." });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: "Servico de autenticacao Supabase nao configurado no servidor." });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ error: "Token de autenticacao invalido." });
      return;
    }

    const user = data.user;
    req.user = user;
    req.supabaseUser = user;
    req.supabaseUser = {
      uid: user.id,
      email: user.email || "",
      name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      picture: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    };
    next();
  } catch {
    res.status(401).json({ error: "Erro ao verificar autenticacao." });
  }
};

app.post("/api/chat/open", steamPrivateLimiter, requireAuth, async (req, res) => {
  const currentUid = req.supabaseUser.uid;
  const friendUid = String(req.body?.friendUid || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(friendUid) || friendUid === currentUid) {
    res.status(400).json({ error: "Usuario invalido." });
    return;
  }

  try {
    const { data: friendship, error: friendshipError } = await supabaseAdmin
      .from("friendships")
      .select("requester_id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${currentUid},addressee_id.eq.${friendUid}),`
        + `and(requester_id.eq.${friendUid},addressee_id.eq.${currentUid})`,
      )
      .maybeSingle();
    if (friendshipError) throw friendshipError;
    if (!friendship) {
      res.status(403).json({ error: "Chat disponivel apenas para amigos." });
      return;
    }

    // 1. Verificar se já existe chat com ambos os usuários vinculados
    let chatId = null;
    const { data: myChats } = await supabaseAdmin
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", currentUid);

    if (myChats && myChats.length > 0) {
      const myChatIds = myChats.map((c) => c.chat_id).filter(Boolean);
      if (myChatIds.length > 0) {
        const { data: sharedChat } = await supabaseAdmin
          .from("chat_participants")
          .select("chat_id")
          .eq("user_id", friendUid)
          .in("chat_id", myChatIds)
          .limit(1)
          .maybeSingle();

        if (sharedChat?.chat_id) {
          chatId = sharedChat.chat_id;
        }
      }
    }

    // 2. Se não existir, criar novo chat
    if (!chatId) {
      const directKey = [currentUid, friendUid].sort().join(":");
      let createdChat = null;

      // Tentativa 1: upsert por direct_key (se a coluna existir na base)
      try {
        const directAttempt = await supabaseAdmin
          .from("chats")
          .upsert({ direct_key: directKey }, { onConflict: "direct_key" })
          .select("id")
          .maybeSingle();

        if (!directAttempt.error && directAttempt.data?.id) {
          createdChat = directAttempt.data;
        }
      } catch {
        // Coluna direct_key ausente no schema cache
      }

      // Tentativa 2: fallback para inserção direta em chats
      if (!createdChat?.id) {
        const fallbackInsert = await supabaseAdmin
          .from("chats")
          .insert({})
          .select("id")
          .single();
        if (fallbackInsert.error || !fallbackInsert.data?.id) {
          throw fallbackInsert.error || new Error("Chat não criado.");
        }
        createdChat = fallbackInsert.data;
      }

      chatId = createdChat.id;

      const { error: participantsError } = await supabaseAdmin
        .from("chat_participants")
        .upsert(
          [
            { chat_id: chatId, user_id: currentUid },
            { chat_id: chatId, user_id: friendUid },
          ],
          { onConflict: "chat_id,user_id" },
        );
      if (participantsError) {
        console.warn("[/api/chat/open] Aviso participantes:", participantsError.message);
      }
    }

    await cleanupExpiredChatData({ chatId }).catch(() => undefined);

    res.json({ chatId });
  } catch (error) {
    console.error("Erro ao abrir chat:", error);
    res.status(500).json({ error: "Erro ao abrir conversa." });
  }
});

export const resolveLinkedSteamId = (linkedValue, requestedValue) => {
  const linkedSteamId = String(linkedValue ?? "").trim();
  const requestedSteamId = String(requestedValue ?? "").trim();
  if (requestedSteamId && !/^\d+$/.test(requestedSteamId)) {
    return { ok: false, status: 400, error: "steamId inválido." };
  }
  if (!/^\d+$/.test(linkedSteamId)) {
    return { ok: false, status: 409, error: "Nenhuma conta Steam está vinculada ao perfil." };
  }
  if (requestedSteamId && requestedSteamId !== linkedSteamId) {
    return {
      ok: false,
      status: 403,
      error: "Steam ID não pertence ao usuário autenticado.",
    };
  }
  return { ok: true, steamId: linkedSteamId };
};

const steamIdCache = new Map();

const getLocalDatabasePath = () => {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "checkpoint", "checkpoint-library.sqlite");
  } else if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "checkpoint", "checkpoint-library.sqlite");
  } else {
    return path.join(home, ".config", "checkpoint", "checkpoint-library.sqlite");
  }
};

const getLocalSteamId = (uid) => {
  const dbPath = getLocalDatabasePath();
  if (!fs.existsSync(dbPath)) return null;

  let db = null;
  try {
    db = new DatabaseSync(dbPath);
    const columns = db.prepare("PRAGMA table_info(library_state)").all();
    const hasSteamIdCol = columns.some((col) => col.name === "steam_id");
    if (!hasSteamIdCol) {
      db.close();
      return null;
    }

    const row = db.prepare("SELECT steam_id FROM library_state WHERE owner_uid = ?").get(uid);
    db.close();
    return row?.steam_id || null;
  } catch (error) {
    console.error("Erro ao ler SteamID do SQLite local:", error);
    if (db) {
      try { db.close(); } catch { }
    }
    return null;
  }
};

const saveLocalSteamId = (uid, steamId) => {
  const dbPath = getLocalDatabasePath();
  if (!fs.existsSync(dbPath)) return;

  let db = null;
  try {
    db = new DatabaseSync(dbPath);
    try {
      db.exec("ALTER TABLE library_state ADD COLUMN steam_id TEXT;");
    } catch {
      // Ignora se a coluna já existir
    }

    db.prepare(`
    INSERT INTO library_state (owner_uid, device_id, steam_id)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_uid) DO UPDATE SET steam_id = excluded.steam_id
  `).run(uid, crypto.randomUUID(), steamId);
    db.close();
  } catch (error) {
    console.error("Erro ao salvar SteamID no SQLite local:", error);
    if (db) {
      try { db.close(); } catch { }
    }
  }
};

const clearLocalSteamId = (uid) => {
  const dbPath = getLocalDatabasePath();
  if (!fs.existsSync(dbPath)) return;

  let db = null;
  try {
    db = new DatabaseSync(dbPath);
    try {
      db.exec("ALTER TABLE library_state ADD COLUMN steam_id TEXT;");
    } catch {
      // Ignora se a coluna já existir
    }
    db.prepare(`
    UPDATE library_state SET steam_id = NULL WHERE owner_uid = ?
  `).run(uid);
    db.close();
  } catch (error) {
    console.error("Erro ao limpar SteamID no SQLite local:", error);
    if (db) {
      try { db.close(); } catch { }
    }
  }
};

const requireLinkedSteamId = async (req, res, next) => {
  const requestedSteamId = String(req.query.steamId ?? "").trim();
  if (requestedSteamId && !/^\d+$/.test(requestedSteamId)) {
    res.status(400).json({ error: "steamId inválido." });
    return;
  }

  const uid = req.supabaseUser.uid;

  // 🔥 PASSO 1: Verifica se este usuário já foi validado e está no cache de memória
  const cacheKey = `${uid}_${requestedSteamId}`;
  if (steamIdCache.has(cacheKey)) {
    req.steamId = steamIdCache.get(cacheKey);
    return next();
  }

  // 🔥 PASSO 1.5: Verifica se o SteamID já existe no SQLite local
  const cachedLocalSteamId = getLocalSteamId(uid);
  if (cachedLocalSteamId) {
    const resolution = resolveLinkedSteamId(cachedLocalSteamId, requestedSteamId);
    if (resolution.ok) {
      steamIdCache.set(cacheKey, resolution.steamId);
      req.steamId = resolution.steamId;
      return next();
    }
  }

  try {
    let steamIdFromDb = null;
    if (supabaseAdmin) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("steam_id")
        .eq("uid", uid)
        .maybeSingle();
      steamIdFromDb = profile?.steam_id;
    }

    const resolution = resolveLinkedSteamId(
      steamIdFromDb,
      requestedSteamId,
    );

    if (!resolution.ok) {
      res.status(resolution.status).json({ error: resolution.error });
      return;
    }

    steamIdCache.set(cacheKey, resolution.steamId);
    saveLocalSteamId(uid, resolution.steamId);

    req.steamId = resolution.steamId;
    next();
  } catch (error) {
    console.error("Erro interno no requireLinkedSteamId:", error);
    res.status(500).json({ error: "Erro ao validar vínculo Steam." });
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/rum", (req, res) => {
  res.status(204).end();
});

let cachedTurnCredentials = null;
let turnCacheExpiry = 0;
const TURN_CACHE_TTL_MS = 10 * 60 * 1000;

const FALLBACK_STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelay",
    credential: "openrelay",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelay",
    credential: "openrelay",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelay",
    credential: "openrelay",
  },
  {
    urls: "turns:openrelay.metered.ca:443?transport=tcp",
    username: "openrelay",
    credential: "openrelay",
  },
];

app.get("/api/voice/turn-credentials", steamPrivateLimiter, async (_req, res) => {
  const meteredApiKey = (process.env.METERED_API_KEY || "").trim();
  const meteredAppName = (process.env.METERED_APP_NAME || "").trim();

  if (!meteredApiKey || !meteredAppName) {
    return res.json({ iceServers: FALLBACK_STUN_SERVERS });
  }

  const now = Date.now();
  if (cachedTurnCredentials && now < turnCacheExpiry) {
    return res.json({ iceServers: cachedTurnCredentials });
  }

  try {
    const url = `https://${meteredAppName}.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`Metered API retornou status ${response.status}`);
    }
    const servers = await response.json();
    if (Array.isArray(servers) && servers.length > 0) {
      cachedTurnCredentials = servers;
      turnCacheExpiry = now + TURN_CACHE_TTL_MS;
      return res.json({ iceServers: servers });
    }
    return res.json({ iceServers: FALLBACK_STUN_SERVERS });
  } catch (error) {
    console.warn("[TURN] Falha ao obter credenciais Metered no backend, usando STUN fallback:", error?.message);
    return res.json({ iceServers: FALLBACK_STUN_SERVERS });
  }
});

app.post("/api/voice/livekit-token", steamPrivateLimiter, requireAuth, async (req, res) => {
  try {
    const { roomName, name, metadata } = req.body || {};
    const effectiveRoom = String(roomName || "").trim();
    const uid = req.supabaseUser.uid;

    if (!effectiveRoom) {
      return res.status(400).json({ error: "roomName é obrigatório." });
    }

    const apiKey = (process.env.LIVEKIT_API_KEY || "").trim();
    const apiSecret = (process.env.LIVEKIT_API_SECRET || "").trim();
    const livekitUrl = (process.env.LIVEKIT_URL || "").trim();

    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(200).json({ disabled: true, error: "LiveKit não configurado no servidor." });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: uid,
      name: String(name || req.supabaseUser.name || uid),
      metadata: typeof metadata === "string" ? metadata : JSON.stringify(metadata || {}),
      ttl: "24h",
    });

    at.addGrant({
      roomJoin: true,
      room: effectiveRoom,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    return res.json({ token, serverUrl: livekitUrl });
  } catch (err) {
    console.error("[LiveKit Token Endpoint Error]", err);
    return res.status(500).json({ error: "Falha ao gerar token LiveKit." });
  }
});

// ─── Voice Rooms Governance & State Endpoints ─────────────────────────────────

function hashVoiceRoomPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyVoiceRoomPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, originalHash] = storedHash.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
  } catch {
    return false;
  }
}

// Criar sala de voz
app.post("/api/voice/rooms", steamPrivateLimiter, requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
  }

  const uid = req.supabaseUser.uid;
  const {
    name,
    category = "resenha_games",
    isPrivate = false,
    password = "",
    maxParticipants = 4,
    icon = "🎮",
    avatarUrl,
    themeColor = "#8B5CF6",
  } = req.body || {};

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName || trimmedName.length > 80) {
    return res.status(400).json({ error: "O nome da sala deve ter entre 1 e 80 caracteres." });
  }

  const validCategories = ["resenha_games", "gameplay_foco", "estudos_foco", "casual_chat"];
  const finalCategory = validCategories.includes(category) ? category : "resenha_games";
  const finalMax = Math.max(2, Math.min(4, Number(maxParticipants) || 4));

  try {
    // Regra: 1 sala pública ativa por conta no v1
    if (!isPrivate) {
      const { data: existingPublic, error: checkError } = await supabaseAdmin
        .from("voice_rooms")
        .select("id")
        .eq("host_uid", uid)
        .eq("is_private", false)
        .eq("status", "active")
        .limit(1);

      if (checkError) {
        console.warn("[VoiceRooms] Erro ao checar sala pública existente:", checkError);
      } else if (existingPublic && existingPublic.length > 0) {
        return res.status(409).json({ error: "Você já possui uma sala pública ativa. Encerre-a antes de criar outra." });
      }
    }

    let passwordHash = null;
    if (isPrivate && typeof password === "string" && password.trim().length > 0) {
      passwordHash = hashVoiceRoomPassword(password.trim());
    }

    const { data: room, error: insertError } = await supabaseAdmin
      .from("voice_rooms")
      .insert({
        host_uid: uid,
        room_name: trimmedName,
        category: finalCategory,
        is_private: Boolean(isPrivate),
        password_hash: passwordHash,
        icon: typeof icon === "string" ? icon : "🎮",
        avatar_url: typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null,
        theme_color: typeof themeColor === "string" ? themeColor : "#8B5CF6",
        max_participants: finalMax,
        status: "active",
      })
      .select("id, host_uid, room_name, category, is_private, icon, avatar_url, theme_color, max_participants, status, created_at, updated_at")
      .single();

    if (insertError || !room) {
      console.error("[VoiceRooms] Erro ao criar sala:", insertError);
      return res.status(500).json({ error: "Não foi possível criar a sala de voz." });
    }

    res.status(201).json({
      room: {
        id: room.id,
        hostUid: room.host_uid,
        name: room.room_name,
        category: room.category,
        isPrivate: room.is_private,
        hasPassword: Boolean(passwordHash),
        icon: room.icon || "🎮",
        avatarUrl: room.avatar_url || undefined,
        themeColor: room.theme_color || "#8B5CF6",
        maxParticipants: room.max_participants,
        status: room.status,
        createdAt: room.created_at,
        updatedAt: room.updated_at,
        participantsCount: 0,
        participants: [],
      },
    });
  } catch (err) {
    console.error("[VoiceRooms] Exception ao criar sala:", err);
    res.status(500).json({ error: "Erro interno ao processar criação de sala." });
  }
});

// Listar salas públicas ativas
app.get("/api/voice/rooms/public", steamPrivateLimiter, requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
  }

  const { category, search } = req.query || {};

  try {
    let query = supabaseAdmin
      .from("voice_rooms")
      .select(`
      id,
      host_uid,
      room_name,
      category,
      is_private,
      icon,
      avatar_url,
      theme_color,
      max_participants,
      status,
      created_at,
      updated_at,
      members:voice_room_members(user_id, display_name, avatar_url, joined_at, removed_at)
    `)
      .eq("is_private", false)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (category && typeof category === "string" && category !== "all") {
      query = query.eq("category", category);
    }
    if (search && typeof search === "string" && search.trim()) {
      query = query.ilike("room_name", `%${search.trim()}%`);
    }

    let { data: rooms, error } = await query;
    if (error && (/column .* does not exist/i.test(error.message) || /icon|avatar_url|theme_color/i.test(error.message))) {
      const fallbackQuery = await supabaseAdmin
        .from("voice_rooms")
        .select(`
        id,
        host_uid,
        room_name,
        category,
        is_private,
        max_participants,
        status,
        created_at,
        updated_at,
        members:voice_room_members(user_id, display_name, avatar_url, joined_at, removed_at)
      `)
        .eq("is_private", false)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      rooms = fallbackQuery.data;
      error = fallbackQuery.error;
    }
    if (error) {
      console.error("[VoiceRooms] Erro ao listar salas públicas:", error);
      return res.status(500).json({ error: "Erro ao carregar salas públicas." });
    }

    const formatted = (rooms || []).map((r) => {
      const activeMembers = (r.members || [])
        .filter((m) => !m.removed_at)
        .map((m) => ({
          uid: m.user_id,
          name: m.display_name,
          avatar: m.avatar_url,
          joinedAt: m.joined_at,
        }));

      return {
        id: r.id,
        hostUid: r.host_uid,
        name: r.room_name,
        category: r.category,
        isPrivate: false,
        hasPassword: false,
        icon: r.icon || "🎮",
        avatarUrl: r.avatar_url || undefined,
        themeColor: r.theme_color || "#8B5CF6",
        maxParticipants: r.max_participants,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        participantsCount: activeMembers.length,
        participants: activeMembers,
      };
    });

    res.json({ rooms: formatted });
  } catch (err) {
    console.error("[VoiceRooms] Exception ao listar salas públicas:", err);
    res.status(500).json({ error: "Erro interno ao listar salas públicas." });
  }
});

// Listar minhas salas (host ou participante)
app.get("/api/voice/rooms/my", steamPrivateLimiter, requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
  }

  const uid = req.supabaseUser.uid;

  try {
    let { data: hostedRooms, error: hostError } = await supabaseAdmin
      .from("voice_rooms")
      .select(`
      id,
      host_uid,
      room_name,
      category,
      is_private,
      password_hash,
      icon,
      avatar_url,
      theme_color,
      max_participants,
      status,
      created_at,
      updated_at,
      members:voice_room_members(user_id, display_name, avatar_url, joined_at, removed_at)
    `)
      .eq("host_uid", uid)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (hostError && (/column .* does not exist/i.test(hostError.message) || /icon|avatar_url|theme_color/i.test(hostError.message))) {
      const fallbackQuery = await supabaseAdmin
        .from("voice_rooms")
        .select(`
        id,
        host_uid,
        room_name,
        category,
        is_private,
        password_hash,
        max_participants,
        status,
        created_at,
        updated_at,
        members:voice_room_members(user_id, display_name, avatar_url, joined_at, removed_at)
      `)
        .eq("host_uid", uid)
        .eq("status", "active")
        .order("updated_at", { ascending: false });
      hostedRooms = fallbackQuery.data;
      hostError = fallbackQuery.error;
    }

    if (hostError) {
      console.error("[VoiceRooms] Erro ao buscar minhas salas:", hostError);
      return res.status(500).json({ error: "Erro ao buscar salas do usuário." });
    }

    const formatted = (hostedRooms || []).map((r) => {
      const activeMembers = (r.members || [])
        .filter((m) => !m.removed_at)
        .map((m) => ({
          uid: m.user_id,
          name: m.display_name,
          avatar: m.avatar_url,
          joinedAt: m.joined_at,
        }));

      return {
        id: r.id,
        hostUid: r.host_uid,
        name: r.room_name,
        category: r.category,
        isPrivate: r.is_private,
        hasPassword: Boolean(r.password_hash),
        icon: r.icon || "🎮",
        avatarUrl: r.avatar_url || undefined,
        themeColor: r.theme_color || "#8B5CF6",
        maxParticipants: r.max_participants,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        participantsCount: activeMembers.length,
        participants: activeMembers,
        isHost: true,
      };
    });

    res.json({ rooms: formatted });
  } catch (err) {
    console.error("[VoiceRooms] Exception ao buscar minhas salas:", err);
    res.status(500).json({ error: "Erro interno ao buscar suas salas." });
  }
});

// Obter detalhes de uma sala
app.get("/api/voice/rooms/:roomId", steamPrivateLimiter, requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
  }

  const { roomId } = req.params;
  const uid = req.supabaseUser.uid;

  try {
    const { data: room, error } = await supabaseAdmin
      .from("voice_rooms")
      .select(`
      id,
      host_uid,
      room_name,
      category,
      is_private,
      password_hash,
      max_participants,
      status,
      created_at,
      updated_at,
      members:voice_room_members(user_id, display_name, avatar_url, joined_at, removed_at)
    `)
      .eq("id", roomId)
      .single();

    if (error || !room) {
      return res.status(404).json({ error: "Sala de voz não encontrada ou encerrada." });
    }

    const activeMembers = (room.members || [])
      .filter((m) => !m.removed_at)
      .map((m) => ({
        uid: m.user_id,
        name: m.display_name,
        avatar: m.avatar_url,
        joinedAt: m.joined_at,
      }));

    res.json({
      room: {
        id: room.id,
        hostUid: room.host_uid,
        name: room.room_name,
        category: room.category,
        isPrivate: room.is_private,
        hasPassword: Boolean(room.password_hash),
        maxParticipants: room.max_participants,
        status: room.status,
        createdAt: room.created_at,
        updatedAt: room.updated_at,
        participantsCount: activeMembers.length,
        participants: activeMembers,
        isHost: room.host_uid === uid,
      },
    });
  } catch (err) {
    console.error("[VoiceRooms] Exception ao obter sala:", err);
    res.status(500).json({ error: "Erro ao carregar detalhes da sala." });
  }
});

// Entrar em uma sala (Join com validação de senha server-side e trava de 4 pessoas)
app.post("/api/voice/rooms/:roomId/join", steamPrivateLimiter, requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
  }

  const { roomId } = req.params;
  const uid = req.supabaseUser.uid;
  const { password, fromInvite = false, displayName, avatarUrl } = req.body || {};

  try {
    const { data: room, error: roomError } = await supabaseAdmin
      .from("voice_rooms")
      .select("*")
      .eq("id", roomId)
      .eq("status", "active")
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: "Sala não encontrada ou já encerrada." });
    }

    // Buscar membros atualmente ativos
    const { data: activeMembers, error: membersError } = await supabaseAdmin
      .from("voice_room_members")
      .select("user_id, display_name, avatar_url, joined_at")
      .eq("room_id", roomId)
      .is("removed_at", null);

    if (membersError) {
      console.error("[VoiceRooms] Erro ao buscar membros:", membersError);
      return res.status(500).json({ error: "Erro ao verificar membros da sala." });
    }

    const currentMembers = activeMembers || [];
    const isAlreadyMember = currentMembers.some((m) => m.user_id === uid);

    // Se não for membro ativo atual, checar limite estrito de participantes (4 no v1)
    if (!isAlreadyMember && currentMembers.length >= room.max_participants) {
      return res.status(409).json({ error: `Sala cheia (${currentMembers.length}/${room.max_participants}).` });
    }

    // Validação de senha para salas privadas (bypass se for o host ou vier de convite direto aceito)
    if (room.is_private && room.host_uid !== uid && !fromInvite) {
      if (room.password_hash) {
        const inputPassword = typeof password === "string" ? password.trim() : "";
        if (!inputPassword || !verifyVoiceRoomPassword(inputPassword, room.password_hash)) {
          return res.status(403).json({ error: "Senha incorreta para esta sala." });
        }
      }
    }

    // Registrar ou reativar membro
    const name = displayName || req.supabaseUser.name || "Jogador";
    const avatar = avatarUrl || req.supabaseUser.picture || null;

    const { error: upsertError } = await supabaseAdmin
      .from("voice_room_members")
      .upsert({
        room_id: roomId,
        user_id: uid,
        display_name: name,
        avatar_url: avatar,
        joined_at: new Date().toISOString(),
        removed_at: null,
      }, { onConflict: "room_id, user_id" });

    if (upsertError) {
      console.error("[VoiceRooms] Erro ao registrar membro:", upsertError);
      return res.status(500).json({ error: "Não foi possível ingressar na sala." });
    }

    // Retornar lista atualizada de peers para Mesh WebRTC
    const updatedMembersList = [
      ...currentMembers.filter((m) => m.user_id !== uid),
      { uid, name, avatar, joinedAt: new Date().toISOString() },
    ].map((m) => ({
      uid: m.uid || m.user_id,
      name: m.name || m.display_name,
      avatar: m.avatar || m.avatar_url,
      joinedAt: m.joinedAt || m.joined_at,
    }));

    res.json({
      success: true,
      room: {
        id: room.id,
        hostUid: room.host_uid,
        name: room.room_name,
        category: room.category,
        isPrivate: room.is_private,
        hasPassword: Boolean(room.password_hash),
        maxParticipants: room.max_participants,
        status: room.status,
        createdAt: room.created_at,
        updatedAt: room.updated_at,
      },
      participants: updatedMembersList,
    });
  } catch (err) {
    console.error("[VoiceRooms] Exception ao entrar na sala:", err);
    res.status(500).json({ error: "Erro interno ao entrar na sala." });
  }
});

// Sair de uma sala
app.post("/api/voice/rooms/:roomId/leave", steamPrivateLimiter, requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
  }

  const { roomId } = req.params;
  const uid = req.supabaseUser.uid;

  try {
    const { error } = await supabaseAdmin
      .from("voice_room_members")
      .update({ removed_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", uid);

    if (error) {
      console.warn("[VoiceRooms] Erro ao marcar saída de membro:", error);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[VoiceRooms] Exception ao sair da sala:", err);
    res.status(500).json({ error: "Erro ao registrar saída da sala." });
  }
});

// Encerrar / Deletar sala (Apenas Host)
app.delete("/api/voice/rooms/:roomId", steamPrivateLimiter, requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
  }

  const { roomId } = req.params;
  const uid = req.supabaseUser.uid;

  try {
    const { data: room, error: fetchError } = await supabaseAdmin
      .from("voice_rooms")
      .select("id, host_uid")
      .eq("id", roomId)
      .single();

    if (fetchError || !room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    if (room.host_uid !== uid) {
      return res.status(403).json({ error: "Apenas o host pode encerrar esta sala." });
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("voice_rooms")
      .update({ status: "ended", ended_at: now })
      .eq("id", roomId);

    await supabaseAdmin
      .from("voice_room_members")
      .update({ removed_at: now })
      .eq("room_id", roomId)
      .is("removed_at", null);

    res.json({ success: true });
  } catch (err) {
    console.error("[VoiceRooms] Exception ao encerrar sala:", err);
    res.status(500).json({ error: "Erro ao encerrar sala." });
  }
});

app.get("/api/gaming/news", steamPublicLimiter, async (_req, res) => {
  try {
    const result = await getGamingNews();
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
    res.json({
      items: result.items,
      sources: result.sources,
      cached: result.cached,
      stale: Boolean(result.stale),
    });
  } catch {
    res.status(502).json({ error: "As fontes de notícias estão indisponíveis agora." });
  }
});

// Image proxy — bypasses hotlinking/referer restrictions on news sources
const ALLOWED_IMAGE_HOSTS = [
  "gamevicio.com",
  "adrenaline.com.br",
  "i.imgur.com",
  "imgur.com",
  "cdn.gamevicio.com",
  "sm.ign.com",
  "assets.gamevicio.com",
  "youtube.com",
  "img.youtube.com",
  "i.ytimg.com",
  "ytimg.com",
  "wp.com",
  "i0.wp.com",
  "i1.wp.com",
  "i2.wp.com",
  "ign.com",
  "assets-prd.ignimgs.com",
  "oyster.ignimgs.com",
  "media.ign.com",
  "ignimgs.com",
  "steamcommunity.com",
  "steamstatic.com",
  "akamaihd.net",
  "steampowered.com",
  "nexusmods.com",
  "theenemy.com.br",
  "jovemnerd.com.br",
  "voxel.com.br",
  "tecmundo.com.br",
  "googleusercontent.com",
  "ggpht.com",
  "twimg.com",
  "pbs.twimg.com",
];
app.get("/api/proxy/image", steamPublicLimiter, async (req, res) => {
  const raw = String(req.query.url || "").trim();
  if (!raw) return res.status(400).end();
  let target;
  try {
    let normalizedRaw = raw;
    const ytEmbedMatch = raw.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/i);
    if (ytEmbedMatch?.[1]) {
      normalizedRaw = `https://img.youtube.com/vi/${ytEmbedMatch[1]}/hqdefault.jpg`;
    }
    target = new URL(normalizedRaw);
    if (target.protocol !== "https:") return res.status(400).end();
    const hostOk = ALLOWED_IMAGE_HOSTS.some(
      (h) => target.hostname === h || target.hostname.endsWith("." + h),
    );
    if (!hostOk) return res.status(403).end();
  } catch {
    return res.status(400).end();
  }
  try {
    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: `https://${target.hostname}/`,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!upstream.ok) return res.status(502).end();
    const ct = upstream.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return res.status(502).end();
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (contentLength > 10 * 1024 * 1024) return res.status(413).end();
    res.set("Content-Type", ct);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("Access-Control-Allow-Origin", "*");
    const MAX_PROXY_BYTES = 10 * 1024 * 1024;
    const chunks = [];
    let totalBytes = 0;
    const reader = upstream.body.getReader();
    for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > MAX_PROXY_BYTES) { reader.cancel(); return res.status(413).end(); }
      chunks.push(value);
    }
    return res.send(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  } catch {
    return res.status(502).end();
  }
});

export const normalizeNexusTrendingMods = (payload) => {
  const mods = Array.isArray(payload?.data?.mods) ? payload.data.mods : [];
  return mods.slice(0, 12).map((mod, index) => {
    const modPageUrl = String(mod?.mod_page_url || "").trim();
    const pictureUrl = String(mod?.picture_url || "").trim();
    return {
      id: modPageUrl || `nexus-trending-${index}`,
      name: String(mod?.name || "Mod sem nome").trim().slice(0, 160),
      author: String(mod?.author || "").trim().slice(0, 100),
      summary: String(mod?.summary || "").trim().slice(0, 800),
      pictureUrl: /^https:\/\//i.test(pictureUrl) ? pictureUrl : "",
      modPageUrl: /^https:\/\/(?:www\.)?nexusmods\.com\//i.test(modPageUrl)
        ? modPageUrl
        : "",
    };
  }).filter((mod) => mod.name && mod.modPageUrl);
};

app.get("/api/nexus/games/:gameDomain/trending-mods", steamPublicLimiter, async (req, res) => {
  const gameDomain = String(req.params.gameDomain || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(gameDomain)) {
    res.status(400).json({ error: "Dominio Nexus invalido." });
    return;
  }

  try {
    const response = await fetch(
      `https://api.nexusmods.com/v3/games/${encodeURIComponent(gameDomain)}/trending-mods`,
      {
        headers: {
          Accept: "application/json",
          "Application-Name": "Phelierium Game Hub",
          "Application-Version": "3.0.0",
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (response.status === 404) {
      res.status(404).json({ error: "Jogo nao encontrado no Nexus Mods." });
      return;
    }
    if (!response.ok) {
      res.status(502).json({ error: `Nexus Mods respondeu com status ${response.status}.` });
      return;
    }
    res.json({ mods: normalizeNexusTrendingMods(await response.json()) });
  } catch (error) {
    res.status(error?.name === "TimeoutError" ? 504 : 502).json({
      error: error?.name === "TimeoutError"
        ? "A Nexus Mods demorou demais para responder."
        : "Nao foi possivel consultar a Nexus Mods.",
    });
  }
});

const publicProfile = (id, data = {}) => ({
  uid: String(id || data.uid || ""),
  email: data.email || "",
  displayName: data.displayName || data.email?.split("@")[0] || "User",
  photoURL: data.photoURL || data.discordAvatar || data.steamAvatar || "",
  discordAvatar: data.discordAvatar || "",
  discordUsername: data.discordUsername || "",
  status: resolvePresence(data.presence).status,
  playing: resolvePresence(data.presence).playing,
});

const compactFriendProfile = (profile) => ({
  uid: profile.uid,
  displayName: profile.displayName,
  photoURL: profile.photoURL || null,
  status: profile.status || "offline",
  playing: profile.playing || null,
  updatedAt: profile.updatedAt || null,
});

const profileRowToPublic = (row = {}) => {
  const presenceUpdatedAt = Date.parse(String(row.presence_updated_at || ""));
  // 75s staleness window: client heartbeat is 25s, so 75s allows 2-3 missed heartbeats before marking offline
  const presenceIsFresh =
    Number.isFinite(presenceUpdatedAt) && Date.now() - presenceUpdatedAt < 75 * 1000;
  const status = presenceIsFresh && ["online", "playing"].includes(row.status)
    ? row.status
    : "offline";

  return {
    uid: String(row.uid || ""),
    displayName: String(
      row.display_name || row.discord_username || row.steam_username || "Jogador",
    ),
    photoURL: row.photo_url || row.discord_avatar || row.steam_avatar || "",
    discordAvatar: row.discord_avatar || "",
    discordUsername: row.discord_username || "",
    steamAvatar: row.steam_avatar || "",
    steamUsername: row.steam_username || "",
    status,
    playing: status === "playing" ? row.playing || null : null,
    updatedAt: status === "offline" && !presenceIsFresh
      ? new Date().toISOString()
      : row.presence_updated_at || null,
  };
};

export const canViewDetailedProfile = ({
  visibility,
  isSelf,
  isAcceptedFriend,
}) => visibility !== "private" || Boolean(isSelf) || Boolean(isAcceptedFriend);

export const projectSearchProfile = (row = {}) => {
  const profileVisibility = row.profile_visibility === "private" ? "private" : "public";
  const identity = {
    uid: String(row.uid || ""),
    displayName: String(row.display_name || "Jogador"),
    photoURL: row.photo_url || row.discord_avatar || row.steam_avatar || "",
    profileVisibility,
  };
  if (profileVisibility === "private") return identity;
  return { ...profileRowToPublic(row), profileVisibility };
};

const nonNegativeFiniteNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export const projectFriendGame = (id, data = {}) => {
  const steamAppId = /^\d+$/.test(String(data.steamAppId || ""))
    ? String(data.steamAppId)
    : "";
  const steamCover = steamAppId
    ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900_2x.jpg`
    : "";
  const steamBackground = steamAppId
    ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`
    : "";
  const unlocked = nonNegativeFiniteNumber(data.completedAchievements);
  const available = Math.max(unlocked, nonNegativeFiniteNumber(data.totalAchievements));

  return {
    id: String(id || ""),
    title: String(data.title || "Jogo").trim().slice(0, 160) || "Jogo",
    image: steamCover,
    backgroundImage: steamBackground,
    cardImage: steamCover,
    logoImage: "",
    category: String(data.category || "").trim().slice(0, 80),
    isFavorite: Boolean(data.isFavorite),
    hoursPlayed: nonNegativeFiniteNumber(data.hoursPlayed),
    launcherType: ["steam", "epic", "local"].includes(data.launcherType)
      ? data.launcherType
      : "local",
    steamAppId,
    totalAchievements: available,
    completedAchievements: unlocked,
  };
};

export const normalizeFriendAchievementAggregate = (aggregate = {}, gamesWithAchievements = 0) => {
  const unlocked = nonNegativeFiniteNumber(aggregate.unlocked);
  return {
    unlocked,
    available: Math.max(unlocked, nonNegativeFiniteNumber(aggregate.available)),
    gamesWithAchievements: Math.floor(nonNegativeFiniteNumber(gamesWithAchievements)),
    totalGames: Math.floor(nonNegativeFiniteNumber(aggregate.totalGames)),
  };
};

const resolvePresence = (presence = {}) => {
  const updatedAtMs = Date.parse(String(presence.updatedAt || ""));
  const isFresh = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < 75 * 1000;
  if (!isFresh) return { status: "offline", playing: null };
  if (presence.status === "offline") return { status: "offline", playing: null };
  const currentGameTitle = String(presence.currentGameTitle || "").trim();
  if (presence.status === "playing" && currentGameTitle) {
    return { status: "playing", playing: currentGameTitle };
  }
  return { status: "online", playing: null };
};

const withUniqueProfile = (items, profile, extra = {}) => [
  { ...compactFriendProfile(profile), ...extra },
  ...(Array.isArray(items) ? items : []).filter((item) => item?.uid !== profile.uid),
];

const withoutProfileUid = (items, uid) =>
  (Array.isArray(items) ? items : []).filter((item) => item?.uid !== uid);

export const revokeActivityAudience = async (_unused, ownerUid, removedUid) => {
  if (!ownerUid || !removedUid || ownerUid === removedUid) return 0;

  if (supabaseAdmin) {
    const { data: activities } = await supabaseAdmin
      .from("activities")
      .select("id, audience_ids")
      .eq("user_id", ownerUid);

    if (activities) {
      for (const item of activities) {
        const currentAudience = Array.isArray(item.audience_ids) ? item.audience_ids : [];
        if (currentAudience.includes(removedUid)) {
          const updated = currentAudience.filter((id) => id !== removedUid);
          await supabaseAdmin
            .from("activities")
            .update({ audience_ids: updated })
            .eq("id", item.id);
        }
      }
    }
  }
  return 0;
};

const SOCIAL_ACTIVITY_KINDS = new Set(["game-start", "achievement"]);

const socialText = (value, maxLength) =>
  (typeof value === "string" ? value.trim() : "").slice(0, maxLength);

const socialImageUrl = (value) => {
  const raw = socialText(value, 2048);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

export const normalizeSocialActivityInput = (value) => {
  const input = value && typeof value === "object" ? value : {};
  const kind = socialText(input.kind, 32);
  if (!SOCIAL_ACTIVITY_KINDS.has(kind)) {
    throw new Error("Tipo de atividade inválido.");
  }

  const normalized = {
    kind,
    gameId: socialText(input.gameId, 160),
    gameTitle: socialText(input.gameTitle, 160),
    gameImage: socialImageUrl(input.gameImage),
    achievementId: socialText(input.achievementId, 160),
    achievementName: socialText(input.achievementName, 160),
    achievementIcon: socialImageUrl(input.achievementIcon),
    caption: socialText(input.caption, 500),
  };

  if (kind === "game-start" && (!normalized.gameId || !normalized.gameTitle)) {
    throw new Error("Jogo inválido para a atividade.");
  }
  if (
    kind === "achievement"
    && (!normalized.gameId || !normalized.gameTitle || !normalized.achievementId)
  ) {
    throw new Error("Conquista inválida para a atividade.");
  }

  return Object.fromEntries(
    Object.entries(normalized).filter(([, fieldValue]) => fieldValue !== ""),
  );
};

const isAlreadyExistsError = (error) =>
  error?.code === 6
  || error?.code === "6"
  || error?.code === "already-exists"
  || /already exists/i.test(String(error?.message || ""));

app.post("/api/social/activity", steamPrivateLimiter, requireAuth, async (req, res) => {
  let activity;
  try {
    activity = normalizeSocialActivityInput(req.body);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Atividade inválida.",
    });
    return;
  }

  try {
    const uid = req.supabaseUser.uid;
    const [{ data: profile, error: profileError }, { data: friendships, error: friendsError }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("uid", uid).single(),
        supabaseAdmin
          .from("friendships")
          .select("requester_id,addressee_id")
          .eq("status", "accepted")
          .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      ]);
    if (profileError) throw profileError;
    if (friendsError) throw friendsError;

    const friendIds = (friendships || []).map((friendship) =>
      friendship.requester_id === uid
        ? friendship.addressee_id
        : friendship.requester_id,
    );
    const audienceIds = [uid, ...friendIds].slice(0, 200);
    const userName = socialText(
      profile.display_name
      || profile.discord_username
      || req.supabaseUser.name
      || req.supabaseUser.email?.split("@")[0]
      || "Jogador",
      80,
    ) || "Jogador";
    const userAvatar = socialImageUrl(
      profile.discord_avatar
      || profile.photo_url
      || profile.steam_avatar
      || req.supabaseUser.picture,
    );
    const payload = {
      user_id: uid,
      user_name: userName,
      user_avatar: userAvatar || null,
      audience_ids: audienceIds,
      kind: activity.kind,
      game_id: activity.gameId || null,
      game_title: activity.gameTitle || null,
      game_image: activity.gameImage || null,
      achievement_id: activity.achievementId || null,
      achievement_name: activity.achievementName || null,
      achievement_icon: activity.achievementIcon || null,
      caption: activity.caption || null,
    };

    const { data: created, error: insertError } = await supabaseAdmin
      .from("activities")
      .insert(payload)
      .select("id")
      .single();
    if (insertError?.code === "23505" && activity.kind === "achievement") {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    if (insertError) throw insertError;

    res.status(201).json({ ok: true, id: created.id, duplicate: false });
  } catch (error) {
    console.error("Erro ao publicar atividade social:", error);
    res.status(500).json({ error: "Não foi possível publicar a atividade." });
  }
});

app.get("/api/friends/search", steamPrivateLimiter, requireAuth, async (req, res) => {
  const term = String(req.query.q ?? "").trim();
  if (term.length < 2) {
    res.status(400).json({ error: "Informe pelo menos 2 caracteres." });
    return;
  }

  try {
    const safeTerm = term.replace(/[%_,()]/g, " ").trim();
    const found = new Map();
    const columns = "uid,display_name,photo_url,discord_username,discord_avatar,steam_username,steam_avatar,status,playing,presence_updated_at,profile_visibility";
    const nameQuery = supabaseAdmin
      .from("profiles")
      .select(columns)
      .neq("uid", req.supabaseUser.uid)
      .or(`display_name.ilike.%${safeTerm}%,discord_username.ilike.%${safeTerm}%,steam_username.ilike.%${safeTerm}%`)
      .limit(25);
    const emailQuery = term.includes("@")
      ? supabaseAdmin
        .from("profiles")
        .select(columns)
        .neq("uid", req.supabaseUser.uid)
        .eq("email", term)
        .limit(1)
      : Promise.resolve({ data: [], error: null });
    const [nameResult, emailResult] = await Promise.all([nameQuery, emailQuery]);
    if (nameResult.error) throw nameResult.error;
    if (emailResult.error) throw emailResult.error;
    [...(emailResult.data || []), ...(nameResult.data || [])].forEach((row) => {
      found.set(row.uid, projectSearchProfile(row));
    });
    const users = Array.from(found.values()).slice(0, 25);

    res.json({ users });
  } catch (error) {
    console.error("Erro ao buscar usuarios:", error);
    res.status(500).json({ error: "Erro ao buscar usuários." });
  }
});

let serverPresenceChannel = null;
const getServerPresenceChannel = () => {
  if (!serverPresenceChannel && supabaseAdmin) {
    serverPresenceChannel = supabaseAdmin.channel("checkpoint_presence_bus");
    serverPresenceChannel.subscribe();
  }
  return serverPresenceChannel;
};

app.post("/api/presence", steamPrivateLimiter, requireAuth, async (req, res) => {
  let bodyData = req.body;
  if (typeof bodyData === "string") {
    try {
      bodyData = JSON.parse(bodyData);
    } catch { }
  }
  const requestedStatus = String(bodyData?.status || req.query?.status || "online");
  const status =
    requestedStatus === "playing"
      ? "playing"
      : requestedStatus === "offline"
        ? "offline"
        : "online";
  const currentGameTitle = String(bodyData?.currentGameTitle || req.query?.currentGameTitle || "").trim().slice(0, 120);
  const nowIso = new Date().toISOString();

  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        status,
        playing: status === "playing" ? currentGameTitle : null,
        presence_updated_at: nowIso,
      })
      .eq("uid", req.supabaseUser.uid);
    if (error) throw error;

    if (supabaseAdmin && status === "offline") {
      try {
        const presenceBus = getServerPresenceChannel();
        if (presenceBus) {
          void presenceBus.send({
            type: "broadcast",
            event: "presence:status_update",
            payload: {
              uid: req.supabaseUser.uid,
              status: "offline",
              playing: null,
              updatedAt: Date.now(),
            },
          }).catch(() => { });
        }
      } catch { }
    }

    res.json({ ok: true, status, updatedAt: nowIso });
  } catch (error) {
    console.error("Erro ao atualizar presenca:", error);
    res.status(500).json({ error: "Erro ao atualizar presença." });
  }
});

app.get("/api/friends/status", steamPrivateLimiter, requireAuth, async (req, res) => {
  try {
    const uid = req.supabaseUser.uid;
    const { data: friendships, error: friendshipsError } = await supabaseAdmin
      .from("friendships")
      .select("requester_id,addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
    if (friendshipsError) throw friendshipsError;
    const friendRefs = (friendships || []).map((friendship) =>
      friendship.requester_id === uid
        ? friendship.addressee_id
        : friendship.requester_id,
    );

    if (friendRefs.length === 0) {
      res.json({ friends: [] });
      return;
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("uid,display_name,photo_url,discord_username,discord_avatar,steam_username,steam_avatar,status,playing,presence_updated_at")
      .in("uid", friendRefs);
    if (profilesError) throw profilesError;
    res.json({
      friends: (profiles || []).map((profile) =>
        compactFriendProfile(profileRowToPublic(profile)),
      ),
    });
  } catch (error) {
    console.error("Erro ao consultar presenca:", error);
    res.status(500).json({ error: "Erro ao consultar presença dos amigos." });
  }
});

app.get("/api/friends/:uid/profile", steamPrivateLimiter, requireAuth, async (req, res) => {
  const friendUid = String(req.params.uid || "").trim();
  if (!friendUid || friendUid === req.supabaseUser.uid) {
    res.status(400).json({ error: "Usuário inválido." });
    return;
  }

  try {
    const currentUid = req.supabaseUser.uid;
    const isSelf = currentUid === friendUid;

    // 1. Carregar perfil completo do usuário alvo a partir de profiles
    const [profileResult, friendshipResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("uid", friendUid)
        .maybeSingle(),
      isSelf
        ? Promise.resolve({ data: null, error: null })
        : supabaseAdmin
          .from("friendships")
          .select("requester_id")
          .eq("status", "accepted")
          .or(
            `and(requester_id.eq.${currentUid},addressee_id.eq.${friendUid}),`
            + `and(requester_id.eq.${friendUid},addressee_id.eq.${currentUid})`,
          )
          .maybeSingle(),
    ]);

    const { data: profileRow, error: profileError } = profileResult;
    if (profileError) throw profileError;
    if (!profileRow) {
      res.status(404).json({ error: "Perfil não encontrado." });
      return;
    }

    const isAcceptedFriend = Boolean(friendshipResult.data);
    const profileVisibility = profileRow.profile_visibility === "private" ? "private" : "public";

    // Se o perfil for privado e não for o próprio usuário:
    if (profileVisibility === "private" && !isSelf) {
      const visibleProfile = profileRowToPublic(profileRow);
      res.json({
        profile: {
          ...visibleProfile,
          uid: friendUid,
          displayName: profileRow.display_name || "Jogador",
          photoURL: profileRow.photo_url || "",
          profileVisibility: "private",
          bio: "",
          website: "",
          favoriteGenres: [],
          steamId: "",
          steamUsername: "",
          steamAvatar: "",
          discordId: "",
          discordUsername: "",
          discordAvatar: "",
          achievementSummary: {},
          librarySummary: {
            games: 0,
            steamGames: 0,
            epicGames: 0,
            localGames: 0,
            favorites: 0,
            minutesPlayed: 0,
          },
        },
        games: [],
        isPrivate: true,
      });
      return;
    }

    // 2. Perfil público (ou próprio usuário): buscar jogos reais, troféus reais e estatísticas
    const [userGamesResult, trophiesResult, levelResult, publicProfileResult] = await Promise.all([
      supabaseAdmin
        .from("user_games")
        .select("id,title,launcher_type,hours_played,steam_app_id,epic_catalog_id,is_favorite,data,updated_at")
        .eq("user_id", friendUid)
        .order("hours_played", { ascending: false })
        .limit(FRIEND_PROFILE_GAME_LIMIT),
      supabaseAdmin
        .from("user_trophies")
        .select("trophy_id,progress,unlocked_at,trophy_definitions(tier,title,xp_value)")
        .eq("user_id", friendUid)
        .not("unlocked_at", "is", null),
      supabaseAdmin
        .from("level_progress")
        .select("current_level,current_level_xp,total_xp,tier")
        .eq("user_id", friendUid)
        .maybeSingle(),
      supabaseAdmin
        .from("public_profiles")
        .select("*")
        .eq("uid", friendUid)
        .maybeSingle(),
    ]);

    const userGames = userGamesResult.data || [];
    const publicRow = publicProfileResult.data;

    let games = userGames.map((row) => {
      const dataObj = row.data || {};
      const calculatedHours = Number(
        dataObj.hoursPlayed ?? row.hours_played ?? (dataObj.minutesPlayed ? dataObj.minutesPlayed / 60 : 0),
      );
      return {
        ...dataObj,
        id: String(row.id),
        title: String(dataObj.title || row.title || "Jogo"),
        launcherType: dataObj.launcherType || row.launcher_type || "local",
        hoursPlayed: calculatedHours,
        steamAppId: dataObj.steamAppId || row.steam_app_id || undefined,
        epicCatalogId: dataObj.epicCatalogId || row.epic_catalog_id || undefined,
        isFavorite: Boolean(dataObj.isFavorite ?? row.is_favorite),
        cardImage: dataObj.cardImage || dataObj.image || dataObj.imageUrl || "",
        image: dataObj.image || dataObj.cardImage || dataObj.imageUrl || "",
      };
    });

    // Fallback: se user_games estiver vazio, mesclar top_games / favorite_games de public_profiles se houver
    if (games.length === 0 && publicRow) {
      const sqlTopGames = Array.isArray(publicRow.top_games) ? publicRow.top_games : [];
      const sqlFavoriteGames = Array.isArray(publicRow.favorite_games) ? publicRow.favorite_games : [];
      games = Array.from(
        new Map(
          [
            ...sqlTopGames.map((g) => ({
              ...g,
              hoursPlayed: Number(g?.hoursPlayed ?? (g?.minutesPlayed ? g.minutesPlayed / 60 : 0)),
              cardImage: g?.imageUrl || g?.cardImage || g?.image || "",
              image: g?.imageUrl || g?.image || g?.cardImage || "",
              isFavorite: Boolean(g?.isFavorite),
            })),
            ...sqlFavoriteGames.map((g) => ({
              ...g,
              hoursPlayed: Number(g?.hoursPlayed ?? (g?.minutesPlayed ? g.minutesPlayed / 60 : 0)),
              cardImage: g?.imageUrl || g?.cardImage || g?.image || "",
              image: g?.imageUrl || g?.image || g?.cardImage || "",
              isFavorite: true,
            })),
          ].map((g) => [String(g?.id || ""), g]),
        ).values(),
      ).filter((g) => g?.id).slice(0, FRIEND_PROFILE_GAME_LIMIT);
    }

    // Calcular estatísticas agregadas a partir dos jogos reais
    let totalMinutesPlayed = 0;
    let steamGamesCount = 0;
    let epicGamesCount = 0;
    let localGamesCount = 0;
    let favoritesCount = 0;

    for (const game of games) {
      const hours = Number(game.hoursPlayed || (game.minutesPlayed ? game.minutesPlayed / 60 : 0));
      totalMinutesPlayed += Math.round(hours * 60);
      if (game.isFavorite) favoritesCount++;
      const launcher = String(game.launcherType || "").toLowerCase();
      if (launcher === "steam") steamGamesCount++;
      else if (launcher === "epic") epicGamesCount++;
      else localGamesCount++;
    }

    // Contagem de troféus desbloqueados por tier
    const unlockedTrophies = trophiesResult.data || [];
    let bronze = 0;
    let silver = 0;
    let gold = 0;
    let platinum = 0;

    for (const tr of unlockedTrophies) {
      const tier = tr.trophy_definitions?.tier;
      if (tier === "bronze") bronze++;
      else if (tier === "silver") silver++;
      else if (tier === "gold") gold++;
      else if (tier === "platinum") platinum++;
    }

    const storedAchievementSummary = profileRow.achievement_summary || publicRow?.achievements || {};
    const finalAchievementSummary = {
      unlocked: unlockedTrophies.length || Number(storedAchievementSummary.unlocked || 0),
      available: Math.max(Number(storedAchievementSummary.available || 0), unlockedTrophies.length),
      bronze: bronze || Number(storedAchievementSummary.bronze || 0),
      silver: silver || Number(storedAchievementSummary.silver || 0),
      gold: gold || Number(storedAchievementSummary.gold || 0),
      platinum: platinum || Number(storedAchievementSummary.platinum || 0),
    };

    const storedLibrarySummary = profileRow.library_summary || publicRow?.stats || {};
    const finalLibrarySummary = {
      games: Math.max(games.length, Number(storedLibrarySummary.games || 0)),
      steamGames: Math.max(steamGamesCount, Number(storedLibrarySummary.steamGames || storedLibrarySummary.steamGameCount || 0)),
      epicGames: Math.max(epicGamesCount, Number(storedLibrarySummary.epicGames || storedLibrarySummary.epicGameCount || 0)),
      localGames: Math.max(localGamesCount, Number(storedLibrarySummary.localGames || storedLibrarySummary.localGameCount || 0)),
      favorites: Math.max(favoritesCount, Number(storedLibrarySummary.favorites || 0)),
      minutesPlayed: Math.max(totalMinutesPlayed, Number(storedLibrarySummary.minutesPlayed || 0)),
    };

    const visibleProfile = profileRowToPublic(profileRow);

    res.json({
      profile: {
        ...visibleProfile,
        uid: friendUid,
        displayName: profileRow.display_name || publicRow?.display_name || "Jogador",
        photoURL: profileRow.photo_url || publicRow?.photo_url || "",
        profileVisibility: "public",
        bio: profileRow.bio || publicRow?.bio || "",
        website: profileRow.website || publicRow?.website || "",
        location: profileRow.location || "",
        favoriteGenres: profileRow.favorite_genres || publicRow?.favorite_genres || [],
        steamId: profileRow.steam_id || "",
        steamUsername: profileRow.steam_username || "",
        steamAvatar: profileRow.steam_avatar || "",
        discordId: profileRow.discord_id || "",
        discordUsername: profileRow.discord_username || "",
        discordAvatar: profileRow.discord_avatar || "",
        achievementSummary: finalAchievementSummary,
        librarySummary: finalLibrarySummary,
        levelProgress: levelResult.data || null,
        level: levelResult.data?.current_level || profileRow.level || 1,
      },
      games,
      gamesTruncated: false,
      isPrivate: false,
    });
  } catch (err) {
    console.error("Erro ao carregar perfil completo do amigo:", err);
    res.status(500).json({ error: "Erro ao carregar perfil do amigo." });
  }
});

app.post("/api/friends/request", steamPrivateLimiter, requireAuth, async (req, res) => {
  const friendUid = String(req.body?.uid ?? "").trim();
  if (!friendUid || friendUid === req.supabaseUser.uid) {
    res.status(400).json({ error: "Usuário inválido." });
    return;
  }

  try {
    const currentUid = req.supabaseUser.uid;
    const { data: target, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("uid,display_name,photo_url,discord_username,discord_avatar,steam_username,steam_avatar,status,playing,presence_updated_at")
      .eq("uid", friendUid)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("friendships")
      .select("requester_id,addressee_id,status")
      .or(
        `and(requester_id.eq.${currentUid},addressee_id.eq.${friendUid}),`
        + `and(requester_id.eq.${friendUid},addressee_id.eq.${currentUid})`,
      )
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "accepted") {
      res.status(409).json({ error: "Usuário já está na sua lista de amigos." });
      return;
    }
    if (existing) {
      res.status(409).json({ error: "Já existe uma solicitação entre estes usuários." });
      return;
    }

    const { error: insertError } = await supabaseAdmin.from("friendships").insert({
      requester_id: currentUid,
      addressee_id: friendUid,
      status: "pending",
    });
    if (insertError) throw insertError;
    res.status(201).json({
      request: {
        ...compactFriendProfile(profileRowToPublic(target)),
        createdAt: new Date().toISOString(),
      },
    });
  } catch {
    res.status(500).json({ error: "Erro ao enviar solicitação." });
  }
});

app.post("/api/friends/accept", steamPrivateLimiter, requireAuth, async (req, res) => {
  const requesterUid = String(req.body?.uid ?? "").trim();
  if (!requesterUid || requesterUid === req.supabaseUser.uid) {
    res.status(400).json({ error: "Usuário inválido." });
    return;
  }

  try {
    const currentUid = req.supabaseUser.uid;
    const { data: accepted, error: acceptError } = await supabaseAdmin
      .from("friendships")
      .update({ status: "accepted" })
      .eq("requester_id", requesterUid)
      .eq("addressee_id", currentUid)
      .eq("status", "pending")
      .select("requester_id")
      .maybeSingle();
    if (acceptError) throw acceptError;
    if (!accepted) {
      res.status(404).json({ error: "Solicitação não encontrada." });
      return;
    }
    const { data: requester, error: requesterError } = await supabaseAdmin
      .from("profiles")
      .select("uid,display_name,photo_url,discord_username,discord_avatar,steam_username,steam_avatar,status,playing,presence_updated_at")
      .eq("uid", requesterUid)
      .single();
    if (requesterError) throw requesterError;
    res.json({ friend: compactFriendProfile(profileRowToPublic(requester)) });
  } catch {
    res.status(500).json({ error: "Erro ao aceitar solicitação." });
  }
});

app.post("/api/friends/reject", steamPrivateLimiter, requireAuth, async (req, res) => {
  const targetUid = String(req.body?.uid ?? "").trim();
  const currentUid = req.supabaseUser.uid;
  if (!targetUid || targetUid === currentUid) {
    res.status(400).json({ error: "Usuário inválido." });
    return;
  }

  try {
    // 1. Delete pending request in Supabase in either direction
    await Promise.allSettled([
      supabaseAdmin
        .from("friendships")
        .delete()
        .eq("status", "pending")
        .match({ requester_id: targetUid, addressee_id: currentUid }),
      supabaseAdmin
        .from("friendships")
        .delete()
        .eq("status", "pending")
        .match({ requester_id: currentUid, addressee_id: targetUid }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[reject error]", err);
    res.status(500).json({ error: "Erro ao rejeitar/cancelar solicitação." });
  }
});

app.post("/api/friends/unfriend", steamPrivateLimiter, requireAuth, async (req, res) => {
  const friendUid = String(req.body?.uid ?? "").trim();
  const currentUid = req.supabaseUser.uid;
  if (!friendUid || friendUid === currentUid) {
    res.status(400).json({ error: "Usuário inválido." });
    return;
  }

  try {
    // 1. Delete friendship in Supabase (both directions)
    await Promise.allSettled([
      supabaseAdmin
        .from("friendships")
        .delete()
        .match({ requester_id: currentUid, addressee_id: friendUid }),
      supabaseAdmin
        .from("friendships")
        .delete()
        .match({ requester_id: friendUid, addressee_id: currentUid }),
    ]);

    // 2. Revoke activity audience
    await Promise.allSettled([
      revokeActivityAudience(null, currentUid, friendUid),
      revokeActivityAudience(null, friendUid, currentUid),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[unfriend error]", err);
    res.status(500).json({ error: "Erro ao remover amigo." });
  }
});

app.post("/api/friends/add", steamPrivateLimiter, requireAuth, async (req, res) => {
  const friendUid = String(req.body?.uid ?? "").trim();
  if (!friendUid || friendUid === req.supabaseUser.uid) {
    res.status(400).json({ error: "Usuário inválido." });
    return;
  }

  try {
    const currentUid = req.supabaseUser.uid;
    const { data: target, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("uid,display_name,photo_url,discord_username,discord_avatar,steam_username,steam_avatar,status,playing,presence_updated_at")
      .eq("uid", friendUid)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }
    const { error: friendshipError } = await supabaseAdmin.from("friendships").upsert(
      {
        requester_id: currentUid,
        addressee_id: friendUid,
        status: "accepted",
      },
      { onConflict: "requester_id,addressee_id" },
    );
    if (friendshipError) throw friendshipError;
    res.json({ friend: compactFriendProfile(profileRowToPublic(target)) });
  } catch {
    res.status(500).json({ error: "Erro ao adicionar amigo." });
  }
});

app.post("/api/friends/remove", steamPrivateLimiter, requireAuth, async (req, res) => {
  const friendUid = String(req.body?.uid ?? "").trim();
  if (!friendUid) {
    res.status(400).json({ error: "Usuário inválido." });
    return;
  }

  try {
    const currentUid = req.supabaseUser.uid;
    const { error } = await supabaseAdmin
      .from("friendships")
      .delete()
      .or(
        `and(requester_id.eq.${currentUid},addressee_id.eq.${friendUid}),`
        + `and(requester_id.eq.${friendUid},addressee_id.eq.${currentUid})`,
      );
    if (error) throw error;
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao remover amigo." });
  }
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const uid = req.supabaseUser.uid;

  for (const key of steamIdCache.keys()) {
    if (key.startsWith(`${uid}_`)) {
      steamIdCache.delete(key);
    }
  }

  clearLocalSteamId(uid);
  res.json({ ok: true });
});

app.post("/auth/steam/start", steamAuthLimiter, requireAuth, (req, res) => {
  cleanupPendingStates();
  const token = crypto.randomUUID();
  pendingStates.set(token, {
    userUid: req.authUid || req.user?.id || req.supabaseUser?.uid,
    createdAt: Date.now(),
  });

  res.json({ url: buildSteamOpenIdUrl(token) });
});

app.post("/auth/discord/start", steamAuthLimiter, requireAuth, (req, res) => {
  cleanupPendingDiscordStates();
  if (!discordClientId || !discordClientSecret) {
    res.status(500).json({ error: "Credenciais Discord nao configuradas no backend." });
    return;
  }

  const state = crypto.randomUUID();
  pendingDiscordStates.set(state, {
    userUid: req.authUid || req.user?.id || req.supabaseUser?.uid,
    createdAt: Date.now(),
  });

  try {
    res.json({ url: buildDiscordAuthorizeUrl(state) });
  } catch (error) {
    pendingDiscordStates.delete(state);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao iniciar autenticacao Discord.",
    });
  }
});

const buildOAuthSuccessPage = (platform = "Conta", launcherCallbackUrl = "") =>
  buildAuthCallbackHtml({ platform, launcherCallbackUrl });

const renderAuthSuccessScreen = (serviceName = "Conta", launcherCallbackUrl = "") =>
  buildAuthCallbackHtml({ platform: serviceName, launcherCallbackUrl });

app.get("/auth/google/start", steamAuthLimiter, (req, res) => {
  cleanupPendingDesktopGoogleStates();

  const state = String(req.query.state ?? "").trim();
  if (!state) {
    res.status(400).send("state ausente.");
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).send("Supabase Admin nao configurado no backend.");
    return;
  }

  pendingDesktopGoogleStates.set(state, {
    createdAt: Date.now(),
  });

  try {
    res.redirect(buildGoogleAuthorizeUrl(state));
  } catch (error) {
    pendingDesktopGoogleStates.delete(state);
    res
      .status(500)
      .send(error instanceof Error ? error.message : "Falha ao iniciar login Google.");
  }
});

app.get("/auth/google/callback", steamAuthLimiter, async (req, res) => {
  cleanupPendingDesktopGoogleStates();

  const state = String(req.query.state ?? "").trim();
  const code = String(req.query.code ?? "").trim();
  const oauthError = String(req.query.error ?? "").trim();
  const pending = pendingDesktopGoogleStates.get(state);

  if (!state || !pending) {
    res.status(400).send("Sessao de login invalida ou expirada. Volte ao app e tente novamente.");
    return;
  }

  if (oauthError) {
    pendingDesktopGoogleStates.set(state, {
      status: "error",
      error: "Login Google cancelado ou negado.",
      createdAt: Date.now(),
    });
    res.status(400).send("Login Google cancelado ou negado.");
    return;
  }

  if (!code) {
    pendingDesktopGoogleStates.set(state, {
      status: "error",
      error: "Codigo Google ausente.",
      createdAt: Date.now(),
    });
    res.status(400).send("Codigo Google ausente.");
    return;
  }

  if (!supabaseAdmin) {
    pendingDesktopGoogleStates.set(state, {
      status: "error",
      error: "Supabase Admin nao configurado no backend.",
      createdAt: Date.now(),
    });
    res.status(500).send("Supabase Admin nao configurado no backend.");
    return;
  }

  try {
    const client = createGoogleOauthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.id_token) {
      throw new Error("Google nao retornou id_token.");
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    const userEmail = payload?.email;

    if (!userEmail) {
      throw new Error("Google nao retornou email.");
    }

    let supaUid = null;
    let accessToken = null;
    let refreshToken = null;

    if (!supaAuthClient) {
      throw new Error(
        "Cliente publico do Supabase Auth nao configurado. "
        + "Defina SUPABASE_PUBLISHABLE_KEY (preferencial) ou SUPABASE_ANON_KEY.",
      );
    }

    let linkData;
    let linkErr;
    ({ data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    }));

    if (linkErr) {
      console.warn(
        "[google-oauth] generateLink falhou; tentando garantir o usuario antes de repetir:",
        linkErr.message,
      );

      const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: userEmail,
        email_confirm: true,
        user_metadata: {
          full_name: payload.name || payload.given_name || userEmail.split("@")[0],
          name: payload.name || userEmail.split("@")[0],
          avatar_url: payload.picture || null,
        },
      });

      if (createErr && !/already been registered|already registered|already exists/i.test(createErr.message || "")) {
        console.error("[google-oauth] Erro ao criar usuario:", {
          message: createErr.message,
          code: createErr.code || null,
        });
        throw createErr;
      }

      ({ data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: userEmail,
      }));
      if (linkErr) throw linkErr;
    }

    const hashedToken = linkData?.properties?.hashed_token || null;
    supaUid = linkData?.user?.id || null;

    if (!hashedToken || !supaUid) {
      throw new Error("Supabase nao retornou credenciais validas para concluir o login Google.");
    }

    /*
     * O token hash e one-time. Ele e consumido EXATAMENTE UMA VEZ no backend.
     * O renderer recebe apenas access_token + refresh_token e nunca tenta verifyOtp.
     */
    const { data: verifyData, error: verifyErr } = await supaAuthClient.auth.verifyOtp({
      token_hash: hashedToken,
      type: "email",
    });

    if (verifyErr || !verifyData?.session) {
      console.error("[google-oauth] Falha ao criar sessao Supabase:", {
        message: verifyErr?.message || "Sessao ausente.",
        status: verifyErr?.status || null,
        code: verifyErr?.code || null,
      });
      throw new Error(
        `Falha ao criar sessao Supabase para o Google: ${verifyErr?.message || "sessao ausente"}`,
      );
    }

    accessToken = verifyData.session.access_token;
    refreshToken = verifyData.session.refresh_token;

    if (!accessToken || !refreshToken) {
      throw new Error("Supabase criou a sessao sem access token ou refresh token.");
    }

    try {
      const updatedAt = new Date().toISOString();

      // Mantem os metadados do Auth coerentes com a identidade atual do Google.
      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(supaUid, {
        email: userEmail,
        email_confirm: true,
        user_metadata: {
          full_name: payload.name || payload.given_name || userEmail.split("@")[0],
          name: payload.name || userEmail.split("@")[0],
          avatar_url: payload.picture || null,
          picture: payload.picture || null,
        },
      });
      if (metadataError) {
        console.warn("[google-oauth] Aviso ao atualizar metadata do usuario:", metadataError.message);
      }

      const { data: existingProfile, error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          email: userEmail,
          display_name: payload.name || payload.given_name || userEmail.split("@")[0],
          photo_url: payload.picture || null,
          updated_at: updatedAt,
        })
        .eq("uid", supaUid)
        .select("uid")
        .maybeSingle();

      if (updateError) throw updateError;

      if (!existingProfile) {
        const { error: insertError } = await supabaseAdmin.from("profiles").upsert(
          {
            uid: supaUid,
            email: userEmail,
            display_name: payload.name || payload.given_name || userEmail.split("@")[0],
            photo_url: payload.picture || null,
            updated_at: updatedAt,
          },
          {
            onConflict: "uid",
            ignoreDuplicates: false,
          },
        );
        if (insertError) throw insertError;
      }
    } catch (err) {
      /*
       * Nao invalida a sessao Google se apenas a sincronizacao do perfil falhar.
       * O AuthProvider buscara o profile novamente depois que a sessao for estabelecida.
       */
      console.warn("[google-oauth] Aviso ao atualizar perfil:", {
        message: err?.message || String(err),
        code: err?.code || null,
      });
    }

    pendingDesktopGoogleStates.set(state, {
      status: "complete",
      email: userEmail,
      accessToken,
      refreshToken,
      uid: supaUid,
      createdAt: Date.now(),
    });

    res.type("html").send(renderAuthSuccessScreen("Google"));
  } catch (error) {
    pendingDesktopGoogleStates.set(state, {
      status: "error",
      error: error instanceof Error ? error.message : "Falha ao concluir login Google.",
      createdAt: Date.now(),
    });
    res
      .status(500)
      .send(error instanceof Error ? error.message : "Falha ao concluir login Google.");
  }
});

app.post("/auth/desktop/google/complete", steamAuthLimiter, async (req, res) => {
  res.json({ ok: true });
});

app.get("/auth/desktop/google/status", steamPublicLimiter, (req, res) => {
  cleanupPendingDesktopGoogleStates();
  res.setHeader("Cache-Control", "no-store");

  const state = String(req.query.state ?? "").trim();
  if (!state) {
    res.status(400).json({ error: "state ausente." });
    return;
  }

  const pending = pendingDesktopGoogleStates.get(state);
  if (!pending) {
    res.json({ status: "pending" });
    return;
  }

  if (pending.status === "error") {
    pendingDesktopGoogleStates.delete(state);
    res.json({ status: "error", error: pending.error || "Falha no login Google." });
    return;
  }

  if (
    pending.status !== "complete"
    || !pending.accessToken
    || !pending.refreshToken
    || !pending.uid
  ) {
    res.json({ status: "pending" });
    return;
  }

  /*
   * A sessao ja foi criada e validada no backend. O renderer deve apenas
   * persistir esses tokens via supabase.auth.setSession().
   *
   * Nao retornamos hashed_token, email_otp ou action_link: sao credenciais
   * one-time e nao devem ter um segundo consumidor.
   */
  pendingDesktopGoogleStates.delete(state);
  res.json({
    status: "complete",
    email: pending.email,
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    uid: pending.uid,
  });
});


app.get("/auth/steam/callback", steamAuthLimiter, async (req, res) => {
  cleanupPendingStates();
  const token = String(req.query.token ?? "");
  const pending = pendingStates.get(token);
  if (!pending) {
    res.redirect(buildLauncherAuthCallback("steam", "invalid_state"));
    return;
  }
  pendingStates.delete(token);

  try {
    const body = normalizeOpenIdBody(req.query);
    const validation = await fetch(steamOpenIdEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await validation.text();
    const isValid = text.includes("is_valid:true");
    if (!isValid) {
      res.redirect(buildLauncherAuthCallback("steam", "invalid"));
      return;
    }

    const claimedId = String(req.query["openid.claimed_id"] ?? "");
    const match = claimedId.match(/\/id\/(\d+)$/);
    const steamId = match?.[1];
    if (!steamId) {
      res.redirect(buildLauncherAuthCallback("steam", "missing_id"));
      return;
    }

    if (!supabaseAdmin) {
      res.redirect(buildLauncherAuthCallback("steam", "server_not_configured"));
      return;
    }

    const steamProfile = await fetchSteamPlayerProfile(steamId).catch((error) => {
      console.warn("[steam] Perfil publico indisponivel durante a vinculacao:", error?.message || error);
      return null;
    });
    await updateLinkedAccountProfile(
      pending.userUid,
      steamProfile || { steam_id: steamId },
    );

    res.type("html").send(
      renderAuthSuccessScreen("Steam", buildLauncherAuthCallback("steam", "ok")),
    );
  } catch (error) {
    console.error("[steam] Falha ao concluir vinculacao:", error);
    res.redirect(buildLauncherAuthCallback("steam", "error"));
  }
});

app.get("/auth/discord/callback", steamAuthLimiter, async (req, res) => {
  cleanupPendingDiscordStates();

  const state = String(req.query.state ?? "").trim();
  const pending = pendingDiscordStates.get(state);

  if (!pending) {
    console.warn("[discord-oauth] callback rejeitado: state ausente, expirado ou desconhecido.");
    res.redirect(buildLauncherAuthCallback("discord", "invalid_state"));
    return;
  }

  // State e one-time: depois que o callback valido chega, ele nao pode ser reutilizado.
  pendingDiscordStates.delete(state);

  const linkedUserUid = String(pending.userUid || "").trim();
  if (!linkedUserUid) {
    console.error("[discord-oauth] callback sem UID Pherielium associado.");
    res.redirect(buildLauncherAuthCallback("discord", "invalid_state"));
    return;
  }

  const oauthError = String(req.query.error ?? "").trim();
  if (oauthError) {
    console.warn("[discord-oauth] autorizacao negada/cancelada:", oauthError.slice(0, 120));
    res.redirect(buildLauncherAuthCallback("discord", "denied"));
    return;
  }

  const code = String(req.query.code ?? "").trim();
  if (!code) {
    console.warn("[discord-oauth] callback sem authorization code.");
    res.redirect(buildLauncherAuthCallback("discord", "missing_code"));
    return;
  }

  if (!discordClientId || !discordClientSecret) {
    console.error("[discord-oauth] DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET ausentes.");
    res.redirect(buildLauncherAuthCallback("discord", "client_not_configured"));
    return;
  }

  if (!supabaseAdmin) {
    console.error("[discord-oauth] Supabase Admin nao configurado.");
    res.redirect(buildLauncherAuthCallback("discord", "server_not_configured"));
    return;
  }

  try {
    const { response: tokenResponse, payload: tokenPayload } =
      await requestDiscordToken(code);

    if (!tokenResponse.ok || !tokenPayload?.access_token) {
      console.error("[discord-oauth] token exchange falhou:", {
        status: tokenResponse.status,
        error: String(tokenPayload?.error || "unknown").slice(0, 120),
        description: String(tokenPayload?.error_description || "").slice(0, 240),
      });
      res.redirect(buildLauncherAuthCallback("discord", "token_error"));
      return;
    }

    const tokenType = String(tokenPayload.token_type || "Bearer");
    const userResponse = await fetch(discordCurrentUserEndpoint, {
      headers: {
        Authorization: `${tokenType} ${tokenPayload.access_token}`,
      },
    });
    const discordUser = await userResponse.json().catch(() => ({}));

    if (!userResponse.ok || !discordUser?.id) {
      console.error("[discord-oauth] /users/@me falhou:", {
        status: userResponse.status,
        discordError: String(discordUser?.message || "").slice(0, 240),
      });
      res.redirect(buildLauncherAuthCallback("discord", "missing_id"));
      return;
    }

    const username = discordDisplayName(discordUser);
    const avatar = discordAvatarUrl(discordUser);

    // Falha ao ler relationships nao deve impedir a vinculacao da conta.
    const discordFriends = await fetchDiscordFriends(
      tokenPayload.access_token,
      tokenType,
    );

    try {
      await updateLinkedAccountProfile(linkedUserUid, {
        discord_id: String(discordUser.id),
        discord_username: username,
        discord_avatar: avatar,
        discord_friends: discordFriends,
      });
    } catch (profileError) {
      const isDuplicateDiscord =
        String(profileError?.code || "") === "23505"
        && /discord|profiles_discord_id_unique/i.test(
          `${profileError?.message || ""} ${profileError?.details || ""} ${profileError?.hint || ""}`,
        );

      console.error("[discord-oauth] Falha ao persistir conta vinculada:", {
        code: profileError?.code || null,
        message: String(profileError?.message || profileError).slice(0, 300),
        userUid: linkedUserUid,
      });

      if (isDuplicateDiscord) {
        res.redirect(buildLauncherAuthCallback("discord", "already_linked"));
        return;
      }

      throw profileError;
    }

    console.info("[discord-oauth] conta vinculada com sucesso:", {
      userUid: linkedUserUid,
      friendsImported: discordFriends.length,
    });

    res.type("html").send(
      renderAuthSuccessScreen("Discord", buildLauncherAuthCallback("discord", "ok")),
    );
  } catch (error) {
    console.error("[discord-oauth] Falha ao concluir vinculacao:", {
      code: error?.code || null,
      message: String(error?.message || error).slice(0, 300),
    });
    res.redirect(buildLauncherAuthCallback("discord", "error"));
  }
});


app.post("/api/steam/disconnect", steamPrivateLimiter, requireAuth, async (req, res) => {
  try {
    await updateLinkedAccountProfile(req.supabaseUser.uid, {
      steam_id: null,
      steam_username: null,
      steam_avatar: null,
      last_steam_sync_at: null,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao desconectar Steam." });
  }
});

app.post("/api/discord/disconnect", steamPrivateLimiter, requireAuth, async (req, res) => {
  try {
    await updateLinkedAccountProfile(req.supabaseUser.uid, {
      discord_id: null,
      discord_username: null,
      discord_avatar: null,
      discord_friends: [],
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao desconectar Discord." });
  }
});

app.get("/api/steam/library", steamPrivateLimiter, requireAuth, requireLinkedSteamId, async (req, res) => {
  if (!steamApiKey) {
    res
      .status(500)
      .json({ error: "STEAM_API_KEY não configurada no backend." });
    return;
  }

  const steamId = req.steamId;

  try {
    const url = new URL(
      "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/",
    );
    url.searchParams.set("key", steamApiKey);
    url.searchParams.set("steamid", steamId);
    url.searchParams.set("include_appinfo", "1");
    url.searchParams.set("include_played_free_games", "1");
    url.searchParams.set("format", "json");

    const response = await fetchSteamWithTimeout(url.toString());
    if (!response.ok) {
      res.status(502).json({
        error: `Falha ao consultar Steam API (status ${response.status}).`,
      });
      return;
    }

    const payload = await response.json();
    if (!payload?.response) {
      res.status(502).json({ error: "Resposta inválida da Steam API." });
      return;
    }

    const games = payload.response.games ?? [];
    if (!Array.isArray(games)) {
      res
        .status(502)
        .json({ error: "Biblioteca Steam retornou formato inesperado." });
      return;
    }
    cacheOwnedSteamAppIds(steamId, games);

    const steamProfile = await fetchSteamPlayerProfile(steamId).catch((error) => {
      console.warn("[steam] Nao foi possivel atualizar nome/avatar:", error?.message || error);
      return null;
    });
    if (steamProfile) {
      await updateLinkedAccountProfile(req.supabaseUser.uid, steamProfile);
    }

    res.json({
      steamId,
      gameCount: payload.response.game_count ?? games.length,
      games,
    });
  } catch (error) {
    res.status(isSteamTimeoutError(error) ? 504 : 500).json({
      error: isSteamTimeoutError(error)
        ? "A Steam demorou demais para responder."
        : "Erro interno ao consultar Steam.",
    });
  }
});

app.get("/api/steam/current-game", steamPrivateLimiter, requireAuth, requireLinkedSteamId, async (req, res) => {
  if (!steamApiKey) {
    res.status(500).json({ error: "STEAM_API_KEY não configurada no backend." });
    return;
  }

  try {
    const cached = steamPresenceCache.get(req.steamId);
    if (cached && Date.now() - cached.timestamp < STEAM_PRESENCE_CACHE_TTL) {
      res.json(cached.data);
      return;
    }

    const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/");
    url.searchParams.set("key", steamApiKey);
    url.searchParams.set("steamids", req.steamId);
    const response = await fetchSteamWithTimeout(url.toString());
    if (!response.ok) {
      res.status(502).json({ error: `Falha ao consultar presença Steam (status ${response.status}).` });
      return;
    }

    const payload = await response.json();
    const player = Array.isArray(payload?.response?.players)
      ? payload.response.players[0]
      : null;
    if (!player) {
      res.status(502).json({ error: "A Steam não retornou o perfil conectado." });
      return;
    }

    const appId = /^\d+$/.test(String(player.gameid || ""))
      ? String(player.gameid)
      : null;
    const visibilityState = Number(player.communityvisibilitystate || 0);
    const data = {
      observable: visibilityState >= 3 || Boolean(appId),
      appId,
      title: appId ? String(player.gameextrainfo || "").slice(0, 160) : null,
      visibilityState,
    };
    setBoundedCacheEntry(steamPresenceCache, req.steamId, { data, timestamp: Date.now() });
    res.json(data);
  } catch (error) {
    res.status(isSteamTimeoutError(error) ? 504 : 500).json({
      error: isSteamTimeoutError(error)
        ? "A Steam demorou demais para informar o jogo atual."
        : "Erro interno ao consultar presença Steam.",
    });
  }
});

app.post("/api/steam/achievement-summary", steamPrivateLimiter, requireAuth, steamAchievementSummaryLimiter, requireLinkedSteamId, async (req, res) => {
  if (!steamApiKey) {
    res.status(500).json({ error: "STEAM_API_KEY não configurada no backend." });
    return;
  }

  const appIds = normalizeSteamAppIds(req.body?.appIds);

  if (appIds.length === 0) {
    res.status(400).json({ error: "Lista de appIds inválida." });
    return;
  }

  if (appIds.length > MAX_ACHIEVEMENT_SUMMARY_APP_IDS) {
    res.status(413).json({
      error: `Envie no máximo ${MAX_ACHIEVEMENT_SUMMARY_APP_IDS} appIds por requisição.`,
    });
    return;
  }

  const steamId = req.steamId;
  let allowedAppIds;
  try {
    const ownedAppIds = await fetchOwnedSteamAppIds(steamId);
    ({ allowedAppIds } = partitionOwnedSteamAppIds(appIds, ownedAppIds));
  } catch (error) {
    res.status(isSteamTimeoutError(error) ? 504 : Number(error?.statusCode || 502)).json({
      error: isSteamTimeoutError(error)
        ? "A Steam demorou demais para validar a biblioteca."
        : String(error?.message || "Não foi possível validar a biblioteca Steam."),
    });
    return;
  }

  const stats = {};
  let cursor = 0;
  const requestDeadline = Date.now() + ACHIEVEMENT_SUMMARY_REQUEST_BUDGET_MS;

  const loadNext = async () => {
    while (cursor < allowedAppIds.length && Date.now() < requestDeadline) {
      const appId = allowedAppIds[cursor++];
      const cacheKey = `${steamId}_${appId}`;
      const detailedCached = achievementsCache.get(cacheKey);
      if (detailedCached && Date.now() - detailedCached.timestamp < CACHE_TTL) {
        const unlocked = nonNegativeFiniteNumber(detailedCached.data?.unlocked);
        stats[appId] = {
          total: Math.max(unlocked, nonNegativeFiniteNumber(detailedCached.data?.total)),
          unlocked,
        };
        continue;
      }

      const cached = achievementSummaryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        stats[appId] = cached.data;
        continue;
      }

      try {
        const url = new URL("https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/");
        url.searchParams.set("key", steamApiKey);
        url.searchParams.set("steamid", steamId);
        url.searchParams.set("appid", appId);
        const remainingBudget = requestDeadline - Date.now();
        if (remainingBudget <= 0) return;
        const response = await fetchSteamWithTimeout(url.toString(), {}, remainingBudget);
        if (!response.ok) {
          if (response.status === 400 || response.status === 404) {
            const data = { total: 0, unlocked: 0 };
            setBoundedCacheEntry(achievementSummaryCache, cacheKey, { data, timestamp: Date.now() });
            stats[appId] = data;
          }
          continue;
        }
        const payload = await response.json();
        if (payload?.playerstats?.success === false) continue;
        const achievements = Array.isArray(payload?.playerstats?.achievements)
          ? payload.playerstats.achievements
          : [];
        const data = {
          total: achievements.length,
          unlocked: achievements.filter((achievement) => Number(achievement?.achieved || 0) === 1).length,
        };
        setBoundedCacheEntry(achievementSummaryCache, cacheKey, { data, timestamp: Date.now() });
        stats[appId] = data;
      } catch {
        // Uma falha isolada não deve impedir os totais dos outros jogos.
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(12, allowedAppIds.length) }, () => loadNext()));
  const failedAppIds = appIds.filter((appId) => !Object.hasOwn(stats, appId));
  res.json({
    stats,
    requested: appIds.length,
    resolved: Object.keys(stats).length,
    failedAppIds,
  });
});

const fetchSteamSearchItems = async (query, language = "pt-BR") => {
  const storeLocale = resolveStoreLocale(language);
  const url = new URL("https://store.steampowered.com/api/storesearch/");
  url.searchParams.set("term", query);
  url.searchParams.set("l", storeLocale.steam);
  url.searchParams.set("cc", storeLocale.country);
  const response = await fetch(url.toString(), { headers: steamStoreFetchHeaders });
  if (!response.ok) {
    throw new Error(`Falha na busca Steam Store (status ${response.status}).`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.items) ? payload.items : [];
};

const handleSteamSearch = async (req, res) => {
  const query = String(req.query.query ?? "").trim();
  if (query.length < 2) {
    res.status(400).json({ error: "Query de busca muito curta." });
    return;
  }

  try {
    res.json({ items: await fetchSteamSearchItems(query, req.query.language) });
  } catch {
    res
      .status(500)
      .json({ error: "Erro interno ao buscar jogos da Steam Store." });
  }
};

app.get("/api/steam/search", steamPublicLimiter, handleSteamSearch);
app.get("/api/steam/search-games", steamPublicLimiter, handleSteamSearch);

app.get("/api/epic/search", steamPublicLimiter, async (req, res) => {
  const query = String(req.query.query ?? "").trim();
  if (query.length < 2) {
    res.status(400).json({ error: "Query de busca muito curta." });
    return;
  }

  try {
    const result = await postEpicGraphql(EPIC_SEARCH_STORE_QUERY, {
      keywords: query,
      locale: "pt-BR",
      country: "BR",
      count: 12,
      start: 0,
    }).catch(() => ({ ok: false, status: 0, payload: null }));

    const payload = result.payload ?? {};
    if (!result.ok || (Array.isArray(payload?.errors) && payload.errors.length > 0)) {
      res.status(502).json({
        error: `Falha na busca da Epic Games Store (status ${result.status}).`,
      });
      return;
    }

    const items = (payload?.data?.Catalog?.searchStore?.elements ?? [])
      .filter((item) => item?.id && item?.title)
      .map((item) => {
        const keyImages = Array.isArray(item?.keyImages) ? item.keyImages : [];
        const namespace = String(item?.namespace ?? "").trim();
        const catalogId = String(item?.id ?? "").trim();
        const image =
          pickEpicImage(keyImages, ["wide", "hero", "vault", "offerimagewide"]) ||
          pickEpicImage(keyImages, ["thumbnail", "dieselgameboxtall"]);
        const cardImage = pickEpicImage(keyImages, ["tall", "thumbnail", "box"]) || image;
        const slug = String(item?.productSlug ?? item?.urlSlug ?? "")
          .replace(/^\/?([a-z]{2}-[A-Z]{2}\/)?p\//, "")
          .replace(/\/home$/, "")
          .replace(/^\/+|\/+$/g, "")
          .trim();
        const productUrl = slug ? `https://store.epicgames.com/p/${slug}` : "";

        return {
          id: catalogId,
          catalogId,
          namespace,
          name: String(item.title).trim(),
          title: String(item.title).trim(),
          image,
          backgroundImage: image,
          tiny_image: cardImage,
          cardImage,
          description: String(item?.description ?? "").trim(),
          productSlug: slug,
          productUrl,
        };
      });

    res.json({ items });
  } catch {
    res.status(500).json({ error: "Erro interno ao buscar jogos da Epic Games Store." });
  }
});

app.get("/api/epic/app-details", steamPublicLimiter, async (req, res) => {
  const catalogId = String(req.query.catalogId ?? "").trim();
  const namespace = String(req.query.namespace ?? req.query.sandboxId ?? "").trim();
  const storeLocale = resolveStoreLocale(req.query.language);
  if (!catalogId || !namespace) {
    res.status(400).json({ error: "catalogId ou namespace inválido." });
    return;
  }

  const cacheKey = `epic_${namespace}_${catalogId}_${storeLocale.locale}`;
  const cached = appDetailsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    const catalogItem = await fetchEpicCatalogItem(
      namespace,
      catalogId,
      storeLocale.locale,
    ).catch(() => null);

    if (!catalogItem) {
      res.status(404).json({ error: "Detalhes não encontrados para este item Epic." });
      return;
    }

    const result = buildEpicDetails(catalogId, namespace, catalogItem);
    appDetailsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: "Detalhes não encontrados." });
  }
});

app.get("/api/steam/app-size", steamPublicLimiter, async (req, res) => {
  const appId = String(req.query.appId ?? "").trim();
  if (!/^\d+$/.test(appId)) {
    res.status(400).json({ error: "appId inválido." });
    return;
  }

  try {
    const url = new URL("https://store.steampowered.com/api/appdetails");
    url.searchParams.set("appids", appId);
    url.searchParams.set("l", "brazilian");
    url.searchParams.set("cc", "BR");

    const response = await fetch(url.toString(), {
      headers: steamStoreFetchHeaders,
    });
    if (!response.ok) {
      res.status(502).json({
        error: `Falha ao consultar detalhes do app (status ${response.status}).`,
      });
      return;
    }

    const payload = await response.json();
    const appEntry = payload?.[appId];
    if (!appEntry?.success || !appEntry?.data) {
      res.json({ appId, sizeGB: null });
      return;
    }
    const data = appEntry.data;
    const requirements = `${data?.pc_requirements?.minimum ?? ""} ${data?.pc_requirements?.recommended ?? ""}`;
    const sizeGB = parseDiskSizeGb(requirements);
    res.json({ appId, sizeGB: sizeGB ?? null });
  } catch {
    res.status(500).json({ error: "Erro interno ao buscar tamanho do jogo." });
  }
});

app.get("/api/steam/achievements", steamPrivateLimiter, requireAuth, requireLinkedSteamId, async (req, res) => {
  if (!steamApiKey) {
    res
      .status(500)
      .json({ error: "STEAM_API_KEY não configurada no backend." });
    return;
  }

  const steamId = req.steamId;
  const appId = String(req.query.appId ?? "").trim();
  const storeLocale = resolveStoreLocale(req.query.language);

  if (!/^\d+$/.test(appId)) {
    res.status(400).json({ error: "appId inválido." });
    return;
  }

  const cacheKey = `${steamId}_${appId}_${storeLocale.locale}`;
  const cached = achievementsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    const url = new URL("https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/");
    url.searchParams.set("key", steamApiKey);
    url.searchParams.set("steamid", steamId);
    url.searchParams.set("appid", appId);
    url.searchParams.set("l", storeLocale.steam);

    const [response, schema, percentages] = await Promise.all([
      fetch(url.toString()),
      fetchSteamAchievementSchema(appId, storeLocale.locale).catch(() => []),
      fetchSteamAchievementPercentages(appId).catch(() => ({})),
    ]);
    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        const data = { achievements: [], total: 0, unlocked: 0 };
        setBoundedCacheEntry(achievementsCache, cacheKey, { data, timestamp: Date.now() });
        res.json(data);
        return;
      }
      res
        .status(502)
        .json({
          error: `Falha ao consultar conquistas (status ${response.status}).`,
        });
      return;
    }

    const payload = await response.json();
    const playerAchievements = Array.isArray(payload?.playerstats?.achievements)
      ? payload.playerstats.achievements
      : [];
    const schemaByApiName = new Map(
      schema.map((achievement) => [achievement.apiName, achievement]),
    );
    const achievements = playerAchievements.map((achievement) => {
      const apiName = String(achievement?.apiname ?? "").trim();
      const schemaItem = schemaByApiName.get(apiName);
      return {
        apiName,
        achieved: Number(achievement?.achieved ?? 0) === 1,
        unlockTime: Number(achievement?.unlocktime ?? 0) || 0,
        name: String(
          achievement?.name ??
          schemaItem?.displayName ??
          apiName,
        ).trim(),
        description: String(
          achievement?.description ?? schemaItem?.description ?? "",
        ).trim(),
        icon: String(schemaItem?.icon ?? "").trim(),
        iconGray: String(schemaItem?.iconGray ?? "").trim(),
        hidden: Boolean(schemaItem?.hidden),
        percent: percentages[apiName] ?? 0,
      };
    });
    const total = achievements.length;
    const unlocked = achievements.filter((a) => a.achieved).length;

    const data = {
      achievements,
      total,
      unlocked,
    };

    setBoundedCacheEntry(achievementsCache, cacheKey, { data, timestamp: Date.now() });
    res.json(data);
  } catch {
    res.status(500).json({ error: "Erro interno ao buscar conquistas." });
  }
});

app.get("/api/steam/achievement-schema", steamPublicLimiter, async (req, res) => {
  if (!steamApiKey) {
    res
      .status(500)
      .json({ error: "STEAM_API_KEY nao configurada no backend." });
    return;
  }

  const appId = String(req.query.appId ?? "").trim();
  const storeLocale = resolveStoreLocale(req.query.language);
  if (!/^\d+$/.test(appId)) {
    res.status(400).json({ error: "appId invalido." });
    return;
  }

  try {
    const [schema, percentages] = await Promise.all([
      fetchSteamAchievementSchema(appId, storeLocale.locale),
      fetchSteamAchievementPercentages(appId).catch(() => ({})),
    ]);
    const achievements = schema.map((achievement) => ({
      apiName: achievement.apiName,
      achieved: false,
      unlockTime: 0,
      name: achievement.displayName || achievement.apiName,
      description: achievement.description || "",
      icon: achievement.icon || "",
      iconGray: achievement.iconGray || "",
      hidden: Boolean(achievement.hidden),
      percent: percentages[achievement.apiName] ?? 0,
    }));

    res.json({
      achievements,
      total: achievements.length,
      unlocked: 0,
    });
  } catch {
    res.status(500).json({ error: "Erro interno ao buscar schema de conquistas." });
  }
});

app.get("/api/steam/app-details", steamPublicLimiter, async (req, res) => {
  const appId = String(req.query.appId ?? "").trim();
  const storeLocale = resolveStoreLocale(req.query.language);
  if (!/^\d+$/.test(appId)) {
    res.status(400).json({ error: "appId inválido." });
    return;
  }

  const cacheKey = `steam:${appId}:${storeLocale.locale}`;
  const cached = appDetailsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    const url = new URL("https://store.steampowered.com/api/appdetails");
    url.searchParams.set("appids", appId);
    url.searchParams.set("l", storeLocale.steam);
    url.searchParams.set("cc", storeLocale.country);

    const response = await fetch(url.toString(), {
      headers: steamStoreFetchHeaders,
    });
    if (!response.ok) {
      res
        .status(502)
        .json({
          error: `Falha ao consultar detalhes do app (status ${response.status}).`,
        });
      return;
    }

    const payload = await response.json();
    const appEntry = payload?.[appId];
    if (!appEntry?.success || !appEntry?.data) {
      res
        .status(200)
        .json({ error: "Detalhes não encontrados para este appId." });
      return;
    }
    const data = appEntry.data;

    const requirements = `${data?.pc_requirements?.minimum ?? ""} ${data?.pc_requirements?.recommended ?? ""}`;
    const trailerUrl = pickSteamTrailerUrl(data?.movies);

    const result = {
      appId,
      title: data?.name ?? null,
      cardImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
      headerImage: data?.header_image ?? null,
      backgroundImage: data?.background_raw ?? data?.background ?? null,
      logoImage: data?.capsule_imagev5 ?? data?.capsule_image ?? null,
      description: data?.short_description ?? null,
      aboutTheGame: data?.about_the_game ?? null,
      screenshots: Array.isArray(data?.screenshots)
        ? data.screenshots.map((s) => s.path_full)
        : [],
      releaseDate: data?.release_date?.date ?? null,
      developer: Array.isArray(data?.developers)
        ? data.developers.join(", ")
        : null,
      publisher: Array.isArray(data?.publishers)
        ? data.publishers.join(", ")
        : null,
      tags: [
        ...(Array.isArray(data?.genres)
          ? data.genres.map((g) => g.description)
          : []),
        ...(Array.isArray(data?.categories)
          ? data.categories.map((c) => c.description)
          : []),
      ],
      trailerUrl: trailerUrl?.url || null,
      trailerThumbnail: trailerUrl?.thumbnail || null,
      sizeGB: parseDiskSizeGb(requirements),
      pcRequirements: data?.pc_requirements ?? null,
      supportedLanguages: data?.supported_languages ?? null,
      metacritic: data?.metacritic ?? null,
      priceOverview: data?.price_overview ?? null,
      dlc: data?.dlc ?? [],
    };

    appDetailsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch {
    res.status(500).json({ error: "Erro interno ao buscar detalhes do jogo." });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Rota nao encontrada." });
});

export const startServer = ({ host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1" } = {}) => {
  const server = app.listen(port, host, () => {
    console.log(`Backend ativo em http://${host}:${port}`);
    void cleanupExpiredChatData()
      .then(({ deletedMessages, deletedAttachments }) => {
        if (deletedMessages > 0 || deletedAttachments > 0) {
          console.log(
            `[chat-retention] Removidas ${deletedMessages} mensagens e ${deletedAttachments} imagens expiradas.`,
          );
        }
      })
      .catch((error) => {
        console.error("[chat-retention] Falha na limpeza inicial:", error);
      });
  });

  const cleanupTimer = setInterval(() => {
    void cleanupExpiredChatData().catch((error) => {
      console.error("[chat-retention] Falha na limpeza periodica:", error);
    });
  }, CHAT_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  return server;
};

if (process.env.NODE_ENV !== "test") {
  startServer();
}
