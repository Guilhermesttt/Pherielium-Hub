const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, dialog, screen, Tray, globalShortcut, desktopCapturer, Notification, safeStorage, nativeImage, protocol, net } = require("electron");

const crypto = require("node:crypto");
const { z } = require("zod");
// ── GPU Hardware Acceleration & Video Decode & Memory Limits ─────────────────
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
app.commandLine.appendSwitch("enable-accelerated-video-decode");
app.commandLine.appendSwitch("enable-accelerated-mjpeg-decode");
app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,VaapiVideoEncoder,WebRtcHWEncoding,WebRtcHWDecoding,CanvasOopRasterization,DirectCompositionVideoOverlays");
app.commandLine.appendSwitch("force-fieldtrials", "WebRTC-H264HighProfile/Enabled/");
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");
app.commandLine.appendSwitch("disable-background-timer-throttling", "false");
app.commandLine.appendSwitch("disable-renderer-backgrounding", "false");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL, fileURLToPath } = require("node:url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "cp-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);
// ── Achievements ─────────────────────────────────────────────────────────────
const { createAchievementBridge } = require("./achievements/achievement-bridge.cjs");
const { readAchievementLibrarySummary } = require("./achievements/achievement-summary.cjs");
// ── Overlay ───────────────────────────────────────────────────────────────────
const { sanitizeOverlayImageSource } = require("./overlay/overlay-image.cjs");
const { showTrophyNotification, createDefaultDeps: createTrophyNotificationDeps } = require("./overlay/trophy-notification.cjs");
// ── Epic Games ────────────────────────────────────────────────────────────────
const { readInstalledEpicGames } = require("./epic-games/epic-manifests.cjs");
const { readEpicLocalAchievements } = require("./epic-games/epic-local-achievements.cjs");
const {
  EPIC_STORE_CARD_EXTRACTOR,
  EPIC_STORE_GRAPHQL_QUERY,
  normalizeEpicGraphqlElements,
  normalizeEpicStoreDetails,
  normalizeEpicStoreCards,
} = require("./epic-games/epic-store-search.cjs");
const { createLegendaryManager } = require("./epic-games/legendary-manager.cjs");
const { createEpicAccount } = require("./epic-games/epic-account.cjs");
const { createEpicCredentialVault } = require("./epic-games/epic-credential-vault.cjs");
const { createEpicSession } = require("./epic-games/epic-session.cjs");
const { migrateEpicAccountMetadata } = require("./epic-games/epic-credential-migration.cjs");
// ── Games / Process Monitor ───────────────────────────────────────────────────
const { normalizeLaunchProfile } = require("./games/launch-profile.cjs");
const { createLocalGameLibrary } = require("./games/local-game-library.cjs");
const {
  createGameProcessTracker,
  normalizeWindowsPath,
  parseTasklistProcessNames,
  parseProcessSnapshot,
} = require("./games/game-process-monitor.cjs");
const {
  detectEmulator,
  parseAchievementState,
  getGoldbergV1Paths,
  getAchievementAliases,
  resolveEmulatorAchievementId,
  detectKnownEmulatorSave,
} = require("./games/emulator-detector.cjs");
// ── Core / Utilities ──────────────────────────────────────────────────────────
const { createSecureIpcRegistrar } = require("./core/ipc-security.cjs");
const { cleanupPlatformAchievementFiles } = require("./core/platform-data-cleanup.cjs");
const { createWindowBehaviorController } = require("./core/window-behavior.cjs");
// ── Hardware ──────────────────────────────────────────────────────────────────
const { queryWindowsControllerBattery } = require("./hardware/controller-battery.cjs");
// ── Nexus Mods ────────────────────────────────────────────────────────────────
const { createNexusCredentialStore } = require("./mods/nexus-credential-store.cjs");
const {
  getNexusDownloadLinks,
  getNexusModCatalog,
  getNexusModDetails,
  getNexusModFiles,
  normalizeGameDomain,
  normalizeModId,
  validateNexusApiKey,
} = require("./mods/nexus-api.cjs");
const { downloadNexusFile, parseNxmUrl } = require("./mods/nexus-download-manager.cjs");
const { assertAllowedArchive } = require("./mods/nexus-installation-manager.cjs");
const { selectModGameDirectory } = require("./mods/mod-game-directory.cjs");
const { runModOperation, shutdownModOperationWorker } = require("./mods/mod-operation-runner.cjs");
const { detectModConflicts } = require("./mods/mod-conflict-detector.cjs");
const { loadModProfiles, saveModProfile, deleteModProfile } = require("./mods/mod-profile-store.cjs");

// Backend de produção (Render). Pode ser sobrescrito via env BACKEND_PUBLIC_URL
// se um dia você quiser apontar pra outro ambiente sem mexer no código.
const PROD_BACKEND_URL = "https://checkpoint-launcher.onrender.com";
const resolveAppUrl = () => {
  const envUrl = (process.env.VITE_BACKEND_URL || process.env.BACKEND_PUBLIC_URL || "").replace(/\/$/, "");
  if (app.isPackaged) {
    if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1") && !envUrl.includes("0.0.0.0")) {
      return envUrl;
    }
    return PROD_BACKEND_URL;
  }
  return envUrl || PROD_BACKEND_URL;
};
const APP_URL = resolveAppUrl();
const APP_PROTOCOLS = new Set(["phelierium:", "pherielium:", "checkpoint:"]);
const REGISTERED_PROTOCOLS = ["phelierium", "pherielium", "checkpoint", "nxm"];
const ACCOUNT_AUTH_CALLBACK_TTL_MS = 10 * 60 * 1000;
const AUTH_PROVIDER_START_TIMEOUT_MS = 35_000;
const AUTH_PROVIDER_START_PATHS = Object.freeze({
  steam: "/auth/steam/start",
  discord: "/auth/discord/start",
});
const IS_SMOKE_TEST = process.argv.includes("--smoke-test");
const AUTO_START_ARG = "--checkpoint-autostart";
const IS_AUTO_START = process.argv.includes(AUTO_START_ARG);
const ENABLE_EMULATOR_FILE_INJECTION = process.env.CHECKPOINT_ENABLE_EMULATOR_INJECTION === "1";

// ─── Registro de watchers ativos por jogo (gameId → FSWatcher) ───────────────
// Garante que nunca tenhamos dois watchers para o mesmo jogo.
const activeWatchers = new Map();
const activeGameMonitors = new Map();
const activeRescanTimers = new Map();

/**
 * Para e remove o watcher ativo de um jogo, se existir.
 * @param {string} gameId
 */
const stopGameWatcher = (gameId) => {
  const entry = activeWatchers.get(gameId);
  if (!entry) return;
  try { if (entry.watcher) entry.watcher.close(); } catch { /* ignore */ }
  clearTimeout(entry.debounceTimer);
  clearInterval(entry.intervalTimer);
  activeWatchers.delete(gameId);
  console.info(`[achievement-watcher] Watcher encerrado para jogo ${gameId}`);
};

// Em modo dev o ELECTRON_START_URL aponta para o Vite (porta diferente)
const DEV_ORIGIN = process.env.ELECTRON_START_URL
  ? (() => {
    try {
      const u = new URL(process.env.ELECTRON_START_URL);
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  })()
  : null;

const APP_ORIGIN = (() => {
  try {
    const u = new URL(APP_URL);
    return `${u.protocol}//${u.host}`;
  } catch {
    return APP_URL;
  }
})();

const STARTUP_LOG_FILE = "desktop-startup.log";

// Render free tier "dorme" após inatividade; cold start pode levar bastante tempo.
const HEALTH_CHECK_MAX_ATTEMPTS = 120; // 120 * 500ms = ~60s de tolerância
const HEALTH_CHECK_INTERVAL_MS = 500;

let isQuitting = false;
let isQuittingConfirmed = false;
let quitSafetyTimer = null;
let activePresenceSession = null;

const sendDirectOfflineSync = () => {
  if (!activePresenceSession?.uid) return;
  const { token, apiUrl } = activePresenceSession;
  const baseUrl = (apiUrl || APP_URL).replace(/\/$/, "");
  const url = `${baseUrl}/api/presence?status=offline`;
  const body = JSON.stringify({ status: "offline" });
  try {
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    }).catch((error) => {
      appendStartupLog("Presence offline sync failed.", error);
    });
  } catch (error) {
    appendStartupLog("Presence offline sync threw before fetch.", error);
  }
};

let mainWindow;
let splashWindow = null;

const createSplashWindow = () => {
  if (IS_AUTO_START || IS_SMOKE_TEST) return;
  if (splashWindow && !splashWindow.isDestroyed()) return;
  try {
    splashWindow = new BrowserWindow({
      width: 440,
      height: 480,
      frame: false,
      transparent: true,
      center: true,
      alwaysOnTop: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: "#00000000",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        spellcheck: false,
      },
    });

    splashWindow.webContents.setAudioMuted(false);

    const splashPath = path.join(__dirname, "splash.html");

    splashWindow.once("ready-to-show", () => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.show();
        splashWindow.focus();
        splashWindow.webContents.executeJavaScript("window.startSplashAppearance?.();").catch(() => { });
      }
    });

    splashWindow.loadFile(splashPath).catch((err) => {
      console.warn("[splash] Falha ao carregar splash:", err);
    });

    splashWindow.on("closed", () => {
      splashWindow = null;
    });
  } catch (err) {
    console.warn("[splash] Falha ao criar splashWindow:", err);
  }
};

const windowBehaviorController = createWindowBehaviorController({
  hideWindow: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  },
  showWindow: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(false);
    }
  },
  requestConfirmation: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("system:exit-confirmation-requested");
      mainWindow.webContents.send("overlay:panel-action", { kind: "request-exit-confirmation" });
    }
  },
  quitApp: () => {
    isQuitting = true;
    app.quit();
  },
});

let overlayWindow;
let overlayReady = false;
let overlayDisplayId = null;
let overlayPanelOpen = false;
const OVERLAY_GAMEPAD_TOGGLE_COOLDOWN_MS = 650;
let lastOverlayGamepadToggleAt = 0;
let inGameOverlayActive = false;
let overlayPanelState = {
  language: "pt-BR",
  friends: [],
  achievements: { unlocked: 0, available: 0, items: [], loading: false },
  currentGame: null,
  captures: [],
  settings: {
    captureShortcut: "F8",
    achievementVolume: 22,
    achievementSoundTheme: "ps5",
    achievementNotificationsEnabled: true,
    customAchievementNotifications: true,
    achievementNotificationPosition: "top-right",
  },
  chat: null,
  profile: { name: "Jogador", avatar: "", discordConnected: false, discordUsername: "", achievements: 0 },
};
const overlayEventCopy = {
  "pt-BR": { enjoy: "Divirta-se", active: "O overlay está ativo enquanto você joga.", playing: "Você está jogando agora", open: "Abra sem sair do jogo", shortcut: "Use o botão central do controle ou Ctrl + Shift + O.", player: "Jogador", now: "agora", friendPlaying: "Está jogando agora", request: "Enviou um pedido de amizade", accepted: "Aceitou seu pedido de amizade", firstKill: "Primeiro Abate", testAchievement: "Teste visual do overlay do Phelierium.", newMessage: "Nova mensagem", newImage: "Nova imagem", imageMessage: "Enviou uma nova imagem", captureSaved: "Captura salva" },
  "en-US": { enjoy: "Have fun", active: "The overlay is active while you play.", playing: "You are now playing", open: "Open without leaving the game", shortcut: "Use the controller’s center button or Ctrl + Shift + O.", player: "Player", now: "now", friendPlaying: "Is now playing", request: "Sent you a friend request", accepted: "Accepted your friend request", firstKill: "First Kill", testAchievement: "Phelierium overlay visual test.", newMessage: "New message", newImage: "New image", imageMessage: "Sent a new image", captureSaved: "Capture saved" },
  "es-ES": { enjoy: "Diviértete", active: "El overlay está activo mientras juegas.", playing: "Ahora estás jugando a", open: "Ábrelo sin salir del juego", shortcut: "Usa el botón central del mando o Ctrl + Shift + O.", player: "Jugador", now: "ahora", friendPlaying: "Está jugando ahora a", request: "Te envió una solicitud de amistad", accepted: "Aceptó tu solicitud de amistad", firstKill: "Primera baja", testAchievement: "Prueba visual del overlay de Phelierium.", newMessage: "Nuevo mensaje", captureSaved: "Captura guardada" },
  "fr-FR": { enjoy: "Amusez-vous", active: "L’overlay est actif pendant que vous jouez.", playing: "Vous jouez maintenant à", open: "Ouvrez-le sans quitter le jeu", shortcut: "Utilisez le bouton central de la manette ou Ctrl + Shift + O.", player: "Joueur", now: "maintenant", friendPlaying: "Joue maintenant à", request: "Vous a envoyé une demande d’ami", accepted: "A accepté votre demande d’ami", firstKill: "Première élimination", testAchievement: "Test visuel de l’overlay Phelierium.", newMessage: "Nouveau message", captureSaved: "Capture enregistrée" },
  "de-DE": { enjoy: "Viel Spaß", active: "Das Overlay ist während des Spielens aktiv.", playing: "Du spielst jetzt", open: "Öffnen, ohne das Spiel zu verlassen", shortcut: "Verwende die mittlere Controllertaste oder Strg + Umschalt + O.", player: "Spieler", now: "jetzt", friendPlaying: "Spielt jetzt", request: "Hat dir eine Freundschaftsanfrage gesendet", accepted: "Hat deine Freundschaftsanfrage angenommen", firstKill: "Erster Abschuss", testAchievement: "Visueller Test des Phelierium-Overlays.", newMessage: "Neue Nachricht", captureSaved: "Aufnahme gespeichert" },
  "it-IT": { enjoy: "Buon divertimento", active: "L’overlay è attivo mentre giochi.", playing: "Ora stai giocando a", open: "Apri senza uscire dal gioco", shortcut: "Usa il pulsante centrale del controller o Ctrl + Maiusc + O.", player: "Giocatore", now: "ora", friendPlaying: "Sta giocando ora a", request: "Ti ha inviato una richiesta di amicizia", accepted: "Ha accettato la tua richiesta di amicizia", firstKill: "Prima eliminazione", testAchievement: "Test visivo dell’overlay Phelierium.", newMessage: "Nuovo messaggio", captureSaved: "Cattura salvata" },
};
const getOverlayEventCopy = () => overlayEventCopy[overlayPanelState.language] || overlayEventCopy["pt-BR"];
const nativeAchievementFallbackCopy = {
  "pt-BR": "Conquista desbloqueada",
  "en-US": "Achievement unlocked",
  "es-ES": "Logro desbloqueado",
  "fr-FR": "Succès déverrouillé",
  "de-DE": "Erfolg freigeschaltet",
  "it-IT": "Obiettivo sbloccato",
};
let captureShortcut = "F8";
let achievementVolume = 22;
let achievementSoundTheme = "ps5";
let achievementNotificationsEnabled = true;
let customAchievementNotifications = true;
let achievementNotificationPosition = "top-right";
let recentCaptures = [];
let captureInProgress = false;
const activeNativeNotifications = new Set();
const CAPTURE_HISTORY_LIMIT = 60;

const normalizeCaptureShortcut = (value) => {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 64) return null;
  const parts = raw.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const rawKey = parts.at(-1);
  const modifiers = new Set(parts.slice(0, -1));
  if ([...modifiers].some((modifier) => !["CommandOrControl", "Alt", "Shift"].includes(modifier))) return null;
  const key = /^(?:[A-Z]|[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|Backspace|PrintScreen)$/.test(rawKey || "")
    ? rawKey
    : null;
  if (!key) return null;
  if (modifiers.size === 0 && !/^(?:F(?:[1-9]|1[0-9]|2[0-4])|PrintScreen)$/.test(key)) return null;
  const normalized = [
    modifiers.has("CommandOrControl") ? "CommandOrControl" : "",
    modifiers.has("Alt") ? "Alt" : "",
    modifiers.has("Shift") ? "Shift" : "",
    key,
  ].filter(Boolean).join("+");
  return normalized === "CommandOrControl+Shift+O" ? null : normalized;
};
const pendingOverlayEvents = [];
let achievementBridge;
let startupErrorShown = false;
let tray = null;
let localGameLibrary = null;
let pendingAccountAuthCallback = null;
let nexusCredentialStore = null;
let pendingNexusDownload = null;
let nexusDownloadState = null;
let nexusDownloadInProgress = false;

const getOverlayIconDataUri = () => {
  const candidatePaths = [
    path.join(__dirname, "..", "assets", "icon.png"),
    path.join(app.getAppPath(), "assets", "icon.png"),
    path.join(process.resourcesPath, "assets", "icon.png"),
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString("base64")}`;
      }
    } catch { }
  }
  return "";
};

const overlayIconUrl = () => getOverlayIconDataUri();

const profileArg = process.argv.find((arg) => arg.startsWith("--profile="))?.split("=")[1] || process.env.CHECKPOINT_PROFILE;
if (profileArg) {
  try {
    const customUserData = path.join(app.getPath("appData"), `checkpoint-profile-${profileArg}`);
    app.setPath("userData", customUserData);
  } catch (err) {
    console.warn("[electron/main] Failed to set custom userData for profile:", err);
  }
}

const hasSingleInstanceLock = IS_SMOKE_TEST || Boolean(profileArg) || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

Menu.setApplicationMenu(null);
if (process.platform === "win32") {
  app.setAppUserModelId("com.phelierium.launcher");
}

if (!IS_SMOKE_TEST) {
  for (const protocol of REGISTERED_PROTOCOLS) {
    if (!app.isPackaged) {
      app.setAsDefaultProtocolClient(protocol, process.execPath, [
        path.resolve(app.getAppPath()),
      ]);
    } else {
      app.setAsDefaultProtocolClient(protocol);
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

const appendStartupLog = (message, error) => {
  const timestamp = new Date().toISOString();
  const lines = [`[${timestamp}] ${message}`];
  if (error) {
    lines.push(error instanceof Error ? error.stack || error.message : String(error));
  }
  const content = `${lines.join("\n")}\n`;

  try {
    const logPath = path.join(app.getPath("userData"), STARTUP_LOG_FILE);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, content, "utf8");
  } catch {
    // Ignore logging failures.
  }

  console.error(content.trimEnd());
};

const sanitizeAuthStatus = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 40) return null;
  return /^[a-z0-9_-]+$/i.test(normalized) ? normalized : null;
};

const parseAccountAuthCallback = (rawUrl) => {
  try {
    const callbackUrl = new URL(String(rawUrl || ""));
    if (!APP_PROTOCOLS.has(callbackUrl.protocol) || callbackUrl.hostname !== "auth") {
      return null;
    }
    if (callbackUrl.pathname.replace(/\/$/, "") !== "/callback") {
      return null;
    }

    const steamStatus = sanitizeAuthStatus(callbackUrl.searchParams.get("steamStatus"));
    const discordStatus = sanitizeAuthStatus(callbackUrl.searchParams.get("discordStatus"));
    if (!steamStatus && !discordStatus) return null;

    return {
      ...(steamStatus ? { steamStatus } : {}),
      ...(discordStatus ? { discordStatus } : {}),
    };
  } catch {
    return null;
  }
};

const findAccountAuthCallback = (args) =>
  (Array.isArray(args) ? args : [])
    .map(parseAccountAuthCallback)
    .find(Boolean) || null;

const getPendingAccountAuthCallback = () => {
  if (!pendingAccountAuthCallback) return null;
  if (Date.now() - pendingAccountAuthCallback.receivedAt > ACCOUNT_AUTH_CALLBACK_TTL_MS) {
    pendingAccountAuthCallback = null;
    return null;
  }
  return pendingAccountAuthCallback;
};

const publishPendingAccountAuthCallback = () => {
  const pending = getPendingAccountAuthCallback();
  if (!pending || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    return false;
  }
  mainWindow.webContents.send("auth:account-callback", {
    ...pending.payload,
    callbackId: pending.id,
    receivedAt: pending.receivedAt,
  });
  return true;
};

const deliverAccountAuthCallback = (payload) => {
  if (!payload) return;
  pendingAccountAuthCallback = {
    id: crypto.randomUUID(),
    payload,
    receivedAt: Date.now(),
  };

  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  publishPendingAccountAuthCallback();
};

const fetchJsonFromBackend = async (pathname, options = {}, timeoutMs = AUTH_PROVIDER_START_TIMEOUT_MS) => {
  const requestId = crypto.randomUUID();
  const url = new URL(pathname, APP_URL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const rawBody = await response.text();
    let payload = null;
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = new Error(
        String(payload?.error || payload?.message || `Backend respondeu HTTP ${response.status}.`).slice(0, 300),
      );
      error.statusCode = response.status;
      error.requestId = requestId;
      throw error;
    }

    console.info(`[auth-network] ${requestId} ${options.method || "GET"} ${url.pathname} -> ${response.status} (${Date.now() - startedAt}ms)`);
    return { payload, response, requestId };
  } catch (error) {
    const kind = error?.name === "AbortError" ? "timeout" : "network";
    appendStartupLog(
      `[auth-network] ${requestId} ${kind} ${options.method || "GET"} ${url.pathname} after ${Date.now() - startedAt}ms`,
      error,
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const validateProviderAuthUrl = (provider, rawUrl) => {
  try {
    const url = new URL(String(rawUrl || ""));
    if (url.protocol !== "https:") return null;
    if (provider === "steam" && url.hostname !== "steamcommunity.com") return null;
    if (provider === "discord" && url.hostname !== "discord.com") return null;
    return url.toString();
  } catch {
    return null;
  }
};

const isLocalAppUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "file:") {
      return true;
    }
    const origin = `${url.protocol}//${url.host}`;
    // Aceita tanto a origem do backend de produção quanto do Vite em modo dev
    const backendOk = origin === APP_ORIGIN;
    const devOk = DEV_ORIGIN ? origin === DEV_ORIGIN : false;
    return backendOk || devOk;
  } catch {
    return false;
  }
};

const registerSecureIpcHandler = createSecureIpcRegistrar({
  ipcMain,
  isAllowedUrl: isLocalAppUrl,
  getExpectedWebContents: () => mainWindow?.webContents ?? null,
});

const NEXUS_DOWNLOAD_REQUEST_TTL_MS = 15 * 60 * 1000;

const getNexusCredentialStore = () => {
  if (!nexusCredentialStore) {
    nexusCredentialStore = createNexusCredentialStore({
      userDataPath: app.getPath("userData"),
      safeStorage,
    });
  }
  return nexusCredentialStore;
};

const getNexusApiKey = async () => {
  const apiKey = await getNexusCredentialStore().read();
  if (!apiKey) {
    throw new Error("Conecte uma chave pessoal Nexus antes de continuar.");
  }
  return apiKey;
};

const getNexusDownloadRoot = () =>
  path.join(app.getPath("documents"), "Checkpoint", "Mods");
const getLegacyNexusDownloadRoot = () =>
  path.join(app.getPath("downloads"), "Checkpoint", "Nexus Mods");
const getAllowedNexusDownloadRoots = () => [
  getNexusDownloadRoot(),
  getLegacyNexusDownloadRoot(),
];

let nexusDownloadMigrationPromise = null;
const pathExists = async (targetPath) => Boolean(
  await fs.promises.stat(targetPath).catch(() => null),
);
const ensureNexusDownloadRoot = async () => {
  if (nexusDownloadMigrationPromise) return nexusDownloadMigrationPromise;
  nexusDownloadMigrationPromise = (async () => {
    const destination = getNexusDownloadRoot();
    const legacy = getLegacyNexusDownloadRoot();
    const migrationMarker = path.join(destination, ".legacy-downloads-imported");
    await fs.promises.mkdir(destination, { recursive: true });
    const [migrationComplete, legacyExists] = await Promise.all([
      pathExists(migrationMarker),
      pathExists(legacy),
    ]);
    if (migrationComplete || !legacyExists) return destination;
    try {
      await fs.promises.cp(legacy, destination, {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
      await fs.promises.writeFile(migrationMarker, new Date().toISOString(), "utf8");
    } catch (error) {
      console.warn("[nexus] Nao foi possivel importar os downloads antigos:", error);
    }
    return destination;
  })();
  return nexusDownloadMigrationPromise;
};

const getNexusStagingRoot = () => path.join(app.getPath("userData"), "mod-staging");

const installSupportedNexusZip = async ({
  gameDomain,
  archivePath,
  gameFolder,
  modId,
  fileId,
  modName,
  modVersion,
  modAuthor,
  priority,
}) => {
  return runModOperation("install", {
    gameDomain,
    archivePath,
    gameRoot: gameFolder,
    backupRoot: path.join(app.getPath("userData"), "nexus-backups"),
    manifestRoot: path.join(app.getPath("userData"), "nexus-installations"),
    stagingRoot: getNexusStagingRoot(),
    modId,
    fileId,
    modName,
    modVersion,
    modAuthor,
    priority,
  });
};

const activeModOperations = new Set();
const runExclusiveModOperation = async (operationKey, operation) => {
  const key = String(operationKey || "");
  if (activeModOperations.has(key)) {
    throw new Error("Ja existe uma operacao em andamento para este mod.");
  }
  activeModOperations.add(key);
  try {
    return await operation();
  } finally {
    activeModOperations.delete(key);
  }
};

const publishNexusDownloadState = (patch) => {
  nexusDownloadState = {
    ...(nexusDownloadState || {}),
    ...patch,
    updatedAt: Date.now(),
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("nexus:download-state", nexusDownloadState);
  }
  return nexusDownloadState;
};

const findNxmUrl = (args) =>
  (Array.isArray(args) ? args : [])
    .find((arg) => typeof arg === "string" && /^nxm:\/\//i.test(arg)) || null;

const handleNexusDownloadUrl = async (rawUrl) => {
  if (!rawUrl) return false;
  let parsed;
  try {
    parsed = parseNxmUrl(rawUrl);
  } catch (error) {
    publishNexusDownloadState({
      status: "error",
      error: error instanceof Error ? error.message : "O link NXM recebido e invalido.",
    });
    return false;
  }

  const pending = pendingNexusDownload;
  if (
    !pending
    || pending.expiresAt < Date.now()
    || pending.gameDomain !== parsed.gameDomain
    || pending.modId !== parsed.modId
    || pending.fileId !== parsed.fileId
  ) {
    publishNexusDownloadState({
      status: "error",
      gameDomain: parsed.gameDomain,
      modId: parsed.modId,
      fileId: parsed.fileId,
      error: "Este download nao foi iniciado pelo Checkpoint ou a solicitacao expirou.",
    });
    return false;
  }
  if (Number(parsed.expires) * 1000 <= Date.now()) {
    publishNexusDownloadState({
      status: "error",
      gameDomain: parsed.gameDomain,
      modId: parsed.modId,
      fileId: parsed.fileId,
      error: "A autorizacao temporaria de download da Nexus expirou.",
    });
    return false;
  }
  if (nexusDownloadInProgress) {
    publishNexusDownloadState({
      status: "error",
      error: "Aguarde o download Nexus atual terminar.",
    });
    return false;
  }

  pendingNexusDownload = null;
  nexusDownloadInProgress = true;
  const downloadId = crypto.randomUUID();
  const baseState = {
    id: downloadId,
    gameDomain: parsed.gameDomain,
    modId: parsed.modId,
    fileId: parsed.fileId,
    modName: pending.modName,
    modAuthor: pending.modAuthor,
    pictureUrl: pending.pictureUrl,
    version: pending.version,
  };
  publishNexusDownloadState({
    ...baseState,
    status: "resolving",
    error: "",
    receivedBytes: 0,
    totalBytes: 0,
  });

  try {
    await ensureNexusDownloadRoot();
    const links = await getNexusDownloadLinks({
      apiKey: await getNexusApiKey(),
      appVersion: app.getVersion(),
      ...parsed,
    });
    const mirror = links.mirrors[0];
    if (!mirror) {
      throw new Error("A Nexus nao retornou um servidor de download disponivel.");
    }
    publishNexusDownloadState({
      ...baseState,
      status: "downloading",
      mirror: mirror.name,
    });

    let lastProgressPublishedAt = 0;
    const downloaded = await downloadNexusFile({
      uri: mirror.uri,
      destinationRoot: getNexusDownloadRoot(),
      gameDomain: parsed.gameDomain,
      modId: parsed.modId,
      fileId: parsed.fileId,
      onProgress: ({ receivedBytes, totalBytes }) => {
        const now = Date.now();
        if (receivedBytes < totalBytes && now - lastProgressPublishedAt < 80) return;
        lastProgressPublishedAt = now;
        publishNexusDownloadState({
          ...baseState,
          status: "downloading",
          mirror: mirror.name,
          receivedBytes,
          totalBytes,
        });
      },
    });

    let installation = null;
    let installationError = "";
    if (
      pending.autoInstall
      && path.extname(downloaded.filePath).toLowerCase() === ".zip"
    ) {
      publishNexusDownloadState({
        ...baseState,
        ...downloaded,
        status: "installing",
      });
      try {
        installation = await runExclusiveModOperation(
          `${parsed.gameDomain}:${parsed.modId}`,
          () => installSupportedNexusZip({
            gameDomain: parsed.gameDomain,
            archivePath: downloaded.filePath,
            gameFolder: pending.gameFolder,
            modId: parsed.modId,
            fileId: parsed.fileId,
            modName: pending.modName,
          }),
        );
      } catch (error) {
        installationError = error instanceof Error
          ? error.message
          : "A instalacao automatica falhou.";
      }
    }

    publishNexusDownloadState({
      ...baseState,
      ...downloaded,
      ...(installation || {}),
      status: "completed",
      installed: Boolean(installation),
      installationError,
      error: "",
    });
    return true;
  } catch (error) {
    publishNexusDownloadState({
      ...baseState,
      status: "error",
      error: error instanceof Error ? error.message : "O download Nexus falhou.",
    });
    return false;
  } finally {
    nexusDownloadInProgress = false;
  }
};

registerSecureIpcHandler("nexus:get-status", () =>
  getNexusCredentialStore().getStatus());

registerSecureIpcHandler("nexus:connect-personal-key", async (_event, apiKey) => {
  const account = await validateNexusApiKey({
    apiKey,
    appVersion: app.getVersion(),
  });
  await getNexusCredentialStore().save(apiKey);
  return {
    ...(await getNexusCredentialStore().getStatus()),
    account,
  };
});

registerSecureIpcHandler("nexus:validate-connection", async () => {
  const store = getNexusCredentialStore();
  const apiKey = await store.read();
  if (!apiKey) return { ...(await store.getStatus()), account: null };
  const account = await validateNexusApiKey({
    apiKey,
    appVersion: app.getVersion(),
  });
  return { ...(await store.getStatus()), account };
});

registerSecureIpcHandler("nexus:disconnect", async () => {
  await getNexusCredentialStore().clear();
  pendingNexusDownload = null;
  return getNexusCredentialStore().getStatus();
});

registerSecureIpcHandler("nexus:get-mod-catalog", async (_event, request) =>
  getNexusModCatalog({
    apiKey: await getNexusApiKey(),
    appVersion: app.getVersion(),
    gameDomain: request?.gameDomain,
  }));

registerSecureIpcHandler("nexus:get-mod-details", async (_event, request) =>
  getNexusModDetails({
    apiKey: await getNexusApiKey(),
    appVersion: app.getVersion(),
    gameDomain: request?.gameDomain,
    modId: request?.modId,
  }));

registerSecureIpcHandler("nexus:get-mod-files", async (_event, request) =>
  getNexusModFiles({
    apiKey: await getNexusApiKey(),
    appVersion: app.getVersion(),
    gameDomain: request?.gameDomain,
    modId: request?.modId,
  }));

registerSecureIpcHandler("nexus:get-download-state", () => nexusDownloadState);

registerSecureIpcHandler("nexus:list-downloaded-files", async (_event, rawGameDomain) => {
  await ensureNexusDownloadRoot();
  const gameDomain = normalizeGameDomain(rawGameDomain);
  const gameRoot = path.join(getNexusDownloadRoot(), gameDomain);
  const modDirectories = await fs.promises.readdir(gameRoot, { withFileTypes: true })
    .catch((error) => {
      if (error?.code === "ENOENT") return [];
      throw error;
    });
  const downloads = [];
  for (const modDirectory of modDirectories) {
    if (!modDirectory.isDirectory()) continue;
    let modId;
    try {
      modId = normalizeModId(modDirectory.name);
    } catch {
      continue;
    }
    const modRoot = path.join(gameRoot, modId);
    const files = await fs.promises.readdir(modRoot, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || file.name.endsWith(".part")) continue;
      const filePath = path.join(modRoot, file.name);
      const stats = await fs.promises.stat(filePath);
      downloads.push({
        id: `${gameDomain}:${modId}`,
        gameDomain,
        modId,
        filename: file.name,
        filePath,
        bytes: stats.size,
        downloadedAt: stats.mtimeMs,
      });
    }
  }
  return downloads.sort((left, right) => right.downloadedAt - left.downloadedAt);
});

registerSecureIpcHandler("nexus:prepare-free-download", async (_event, request) => {
  const gameDomain = normalizeGameDomain(request?.gameDomain);
  const modId = normalizeModId(request?.modId);
  const fileId = normalizeModId(request?.fileId);
  await getNexusApiKey();
  const expiresAt = Date.now() + NEXUS_DOWNLOAD_REQUEST_TTL_MS;
  pendingNexusDownload = {
    gameDomain,
    modId,
    fileId,
    gameFolder: String(request?.gameFolder || "").slice(0, 2048),
    modName: String(request?.modName || "").slice(0, 240),
    modAuthor: String(request?.modAuthor || "").slice(0, 120),
    pictureUrl: /^https:\/\//i.test(String(request?.pictureUrl || ""))
      ? String(request.pictureUrl).slice(0, 2048)
      : "",
    version: String(request?.version || "").slice(0, 80),
    autoInstall: Boolean(request?.gameFolder),
    expiresAt,
  };
  return {
    prepared: true,
    autoInstall: pendingNexusDownload.autoInstall,
    expiresAt,
  };
});

registerSecureIpcHandler("nexus:install-downloaded-mod", async (_event, request) => {
  const gameDomain = normalizeGameDomain(request?.gameDomain);
  const modId = normalizeModId(request?.modId);
  const fileId = normalizeModId(request?.fileId || request?.modId);
  const archivePath = assertAllowedArchive(
    request?.filePath,
    getAllowedNexusDownloadRoots(),
  );
  const baseState = {
    id: crypto.randomUUID(),
    gameDomain,
    modId,
    fileId,
    filename: path.basename(archivePath),
    filePath: archivePath,
    modName: String(request?.modName || "").slice(0, 240),
    error: "",
  };
  publishNexusDownloadState({ ...baseState, status: "installing" });
  try {
    const installation = await runExclusiveModOperation(
      `${gameDomain}:${modId}`,
      () => installSupportedNexusZip({
        gameDomain,
        archivePath,
        gameFolder: String(request?.gameFolder || "").slice(0, 2048),
        modId,
        fileId,
        modName: baseState.modName,
        modVersion: String(request?.modVersion || "").slice(0, 80),
        modAuthor: String(request?.modAuthor || "").slice(0, 120),
        priority: Number(request?.priority) || 0,
      }),
    );
    return publishNexusDownloadState({
      ...baseState,
      ...installation,
      status: "completed",
      installed: true,
      installationError: installation.warnings?.length ? installation.warnings.join(" | ") : "",
    });
  } catch (error) {
    publishNexusDownloadState({
      ...baseState,
      status: "error",
      installed: false,
      error: error instanceof Error ? error.message : "A instalacao do mod falhou.",
    });
    throw error;
  }
});

registerSecureIpcHandler("nexus:preview-mod", async (_event, request) => {
  const gameDomain = normalizeGameDomain(request?.gameDomain);
  const archivePath = assertAllowedArchive(request?.filePath, getAllowedNexusDownloadRoots());
  return runModOperation("preview", { archivePath, gameDomain });
});

registerSecureIpcHandler("nexus:adopt-installed-mod", async (_event, request) => {
  const gameDomain = normalizeGameDomain(request?.gameDomain);
  const modId = normalizeModId(request?.modId);
  const fileId = normalizeModId(request?.fileId || request?.modId);
  const archivePath = assertAllowedArchive(
    request?.filePath,
    getAllowedNexusDownloadRoots(),
  );
  return runExclusiveModOperation(`${gameDomain}:${modId}`, () => runModOperation("adopt", {
    archivePath,
    gameRoot: String(request?.gameFolder || "").slice(0, 2048),
    manifestRoot: path.join(app.getPath("userData"), "nexus-installations"),
    stagingRoot: getNexusStagingRoot(),
    gameDomain,
    modId,
    fileId,
    modName: String(request?.modName || "").slice(0, 240),
  }));
});

registerSecureIpcHandler("nexus:remove-installed-mod", async (_event, request) => {
  await ensureNexusDownloadRoot();
  const manifestPath = String(request?.manifestPath || "");
  const archivePath = String(request?.filePath || "");
  return runExclusiveModOperation(manifestPath || archivePath, () => runModOperation("uninstall", {
    manifestPath,
    archivePath,
    removeArchive: Boolean(request?.removeArchive),
    installationsRoot: path.join(app.getPath("userData"), "nexus-installations"),
    backupRoot: path.join(app.getPath("userData"), "nexus-backups"),
    downloadRoots: getAllowedNexusDownloadRoots(),
  }));
});

registerSecureIpcHandler("nexus:open-download-location", async (_event, rawGameDomain) => {
  await ensureNexusDownloadRoot();
  if (rawGameDomain) {
    const gameDownloadDirectory = path.join(
      getNexusDownloadRoot(),
      normalizeGameDomain(rawGameDomain),
    );
    await fs.promises.mkdir(gameDownloadDirectory, { recursive: true });
    const openError = await shell.openPath(gameDownloadDirectory);
    if (openError) throw new Error(`Nao foi possivel abrir a pasta de mods: ${openError}`);
    return true;
  }
  if (nexusDownloadState?.filePath && fs.existsSync(nexusDownloadState.filePath)) {
    shell.showItemInFolder(nexusDownloadState.filePath);
    return true;
  }
  await fs.promises.mkdir(getNexusDownloadRoot(), { recursive: true });
  const openError = await shell.openPath(getNexusDownloadRoot());
  if (openError) throw new Error(`Nao foi possivel abrir a pasta de mods: ${openError}`);
  return true;
});

const isExternalProtocol = (rawUrl) => {
  try {
    const protocol = new URL(rawUrl).protocol;
    return (
      protocol === "steam:" ||
      protocol === "com.epicgames.launcher:" ||
      APP_PROTOCOLS.has(protocol)
    );
  } catch {
    return false;
  }
};

const isSafeOpenExternalUrl = (rawUrl) => {
  try {
    const raw = String(rawUrl || "").trim();
    if (/[\x00-\x1F\x7F]/.test(raw)) return false;
    const url = new URL(raw);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:") return isLocalAppUrl(url.toString());
    return (
      url.protocol === "steam:" ||
      url.protocol === "com.epicgames.launcher:" ||
      APP_PROTOCOLS.has(url.protocol) ||
      url.protocol === "nxm:"
    );
  } catch {
    return false;
  }
};

const configureHidAccess = (electronSession) => {
  const SONY_VENDOR_ID = 0x054c;
  const ALLOWED_PERMISSIONS = new Set([
    "hid",
    "media",
    "microphone",
    "camera",
    "audioCapture",
    "videoCapture",
    "speaker-selection",
    "mediaKeySystem",
    "display-capture",
    "screen",
    "notifications",
    "fullscreen",
    "accessibility-events",
    "clipboard-read",
    "clipboard-sanitized-write",
    "idle-detection",
    "window-management",
  ]);

  electronSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  if (typeof electronSession.setPermissionCheckHandler === "function") {
    electronSession.setPermissionCheckHandler((_webContents, permission) =>
      ALLOWED_PERMISSIONS.has(permission),
    );
  }

  if (typeof electronSession.setDevicePermissionHandler === "function") {
    electronSession.setDevicePermissionHandler((details) => {
      const device = details?.device;
      return details?.deviceType === "hid" && device?.vendorId === SONY_VENDOR_ID;
    });
  }

  if (electronSession.listenerCount("select-hid-device") === 0) {
    electronSession.on("select-hid-device", (event, details, callback) => {
      event.preventDefault();
      const devices = details?.deviceList ?? [];
      const device = devices.find((candidate) => candidate.vendorId === SONY_VENDOR_ID) ?? devices[0];
      callback(device?.deviceId ?? "");
    });
  }
};

const isAuthPopupUrl = (rawUrl) => {
  if (rawUrl === "about:blank") return true;

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    return (
      host === "accounts.google.com" ||
      host === "ssl.gstatic.com" ||
      host.endsWith(".google.com") ||
      host.endsWith(".gstatic.com") ||
      host.endsWith(".firebaseapp.com") ||
      host.endsWith(".web.app") ||
      url.pathname.startsWith("/__/auth/")
    );
  } catch {
    return false;
  }
};

const fetchHealth = async () => {
  try {
    const response = await fetch(`${APP_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForServer = async () => {
  const BASE_MS = 500;
  const MAX_DELAY_MS = 5_000;
  const TOTAL_TIMEOUT_MS = 30_000;
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  let attempt = 0;
  while (Date.now() < deadline) {
    if (await fetchHealth()) return;
    const base = Math.min(BASE_MS * 2 ** attempt, MAX_DELAY_MS);
    const jitter = base * (0.8 + Math.random() * 0.4);
    await sleep(Math.round(jitter));
    attempt++;
  }

  const isDev = !!process.env.ELECTRON_START_URL;
  const message = isDev
    ? `Servidor de desenvolvimento nao respondeu em ${TOTAL_TIMEOUT_MS / 1000}s. Verifique se o Vite esta rodando (npm run dev).`
    : `Backend nao respondeu em ${APP_URL}/health apos ${TOTAL_TIMEOUT_MS / 1000}s. Verifique sua conexao com a internet.`;
  throw new Error(message);
};


const getLocalDistIndexPath = () => {
  const possiblePaths = [
    path.join(__dirname, "..", "dist", "index.html"),
    path.join(app.getAppPath(), "dist", "index.html"),
  ];
  return possiblePaths.find((p) => fs.existsSync(p)) || null;
};

const loadMainWindow = async () => {
  if (process.env.ELECTRON_START_URL) {
    try {
      await mainWindow.loadURL(process.env.ELECTRON_START_URL);
      return;
    } catch (error) {
      appendStartupLog(`Failed to load dev server: ${process.env.ELECTRON_START_URL}`, error);
    }
  }

  const localDistPath = getLocalDistIndexPath();
  if (localDistPath) {
    try {
      await mainWindow.loadFile(localDistPath);
      return;
    } catch (error) {
      appendStartupLog(`Failed to load local dist index.html: ${localDistPath}`, error);
    }
  }

  const preferredUrl = APP_URL;
  try {
    await mainWindow.loadURL(preferredUrl);
    return;
  } catch (error) {
    appendStartupLog(`Failed to load window URL: ${preferredUrl}`, error);
  }

  throw new Error("Falha ao carregar a janela principal (arquivos locais ou backend indisponíveis).");
};

const showFatalStartupError = (error) => {
  if (startupErrorShown) {
    return;
  }
  startupErrorShown = true;
  appendStartupLog("Fatal desktop startup error.", error);
  dialog.showErrorBox(
    "Phelierium",
    [
      "O app nao conseguiu iniciar.",
      error instanceof Error ? error.message : String(error),
      `Log: ${path.join(app.getPath("userData"), STARTUP_LOG_FILE)}`,
    ].join("\n\n"),
  );
};

const createWindow = async () => {
  createSplashWindow();

  const hasLocalDist = Boolean(getLocalDistIndexPath());
  if (!process.env.ELECTRON_START_URL && !hasLocalDist) {
    await waitForServer();
  }

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: "#05070a",
    icon: path.join(app.getAppPath(), "assets", "icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      spellcheck: false,
      navigateOnDragDrop: false,
      v8CacheOptions: "code",
    },
  });

  configureHidAccess(mainWindow.webContents.session);

  // Permite que o renderer carregue imagens diretamente de CDNs externas sem bloqueio de CORS
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    {
      urls: [
        "https://archive.org/*",
        "https://*.archive.org/*",
        "https://*.steamstatic.com/*",
        "https://*.epicgames.com/*",
        "https://*.akamaized.net/*",
      ],
    },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      headers["Access-Control-Allow-Origin"] = ["*"];
      headers["Access-Control-Allow-Methods"] = ["GET, HEAD"];
      headers["Cross-Origin-Resource-Policy"] = ["cross-origin"];
      callback({ responseHeaders: headers });
    },
  );

  let mainReady = false;
  let minSplashDurationPassed = false;
  let splashTransitioned = false;

  const tryTransitionFromSplash = () => {
    if (splashTransitioned) return;
    if (!mainReady || !minSplashDurationPassed) return;
    splashTransitioned = true;

    if (splashWindow && !splashWindow.isDestroyed()) {
      try {
        splashWindow.webContents.executeJavaScript(
          "document.getElementById('splashCard')?.classList.add('fading-out');"
        ).catch(() => { });
      } catch { }

      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.destroy();
          splashWindow = null;
        }
        if (!IS_AUTO_START && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      }, 420);
    } else {
      if (!IS_AUTO_START && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  };

  const minSplashTimeMs = splashWindow ? 4500 : 0;
  setTimeout(() => {
    minSplashDurationPassed = true;
    tryTransitionFromSplash();
  }, minSplashTimeMs);

  mainWindow.once("ready-to-show", () => {
    mainReady = true;
    tryTransitionFromSplash();
  });

  // Fallback: se ready-to-show demorar mais de 7.5s, força exibicao
  setTimeout(() => {
    if (!splashTransitioned) {
      console.warn("[main] Fallback de transicao do splash disparado");
      mainReady = true;
      minSplashDurationPassed = true;
      tryTransitionFromSplash();
    }
  }, 7500);

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) {
        return;
      }
      appendStartupLog(
        `Renderer failed to load URL ${validatedURL} (code=${errorCode}).`,
        new Error(errorDescription),
      );
    },
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    appendStartupLog(
      `Renderer process exited (${details.reason}).`,
      details.exitCode ? new Error(`exitCode=${details.exitCode}`) : undefined,
    );
  });
  mainWindow.webContents.on("did-finish-load", () => {
    publishPendingAccountAuthCallback();
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown") {
      if (input.key === "F11") {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        event.preventDefault();
      } else if (
        !app.isPackaged &&
        (input.key === "F12" ||
          ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i"))
      ) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      } else if (
        app.isPackaged &&
        (input.key === "F12" ||
          ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i"))
      ) {
        event.preventDefault();
      } else if ((input.control || input.meta) && input.key.toLowerCase() === "r" && !app.isPackaged) {
        mainWindow.webContents.reload();
        event.preventDefault();
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthPopupUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          parent: mainWindow,
          modal: false,
          backgroundColor: "#ffffff",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }

    if (isSafeOpenExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isExternalProtocol(url)) {
      event.preventDefault();
      void shell.openExternal(url);
      return;
    }

    if (!isLocalAppUrl(url)) {
      event.preventDefault();
      if (isSafeOpenExternalUrl(url)) {
        void shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (isLocalAppUrl(url)) {
      return;
    }

    event.preventDefault();
    if (isSafeOpenExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  mainWindow.on("close", (event) => {
    const action = windowBehaviorController.handleWindowClose(isQuitting);
    if (action !== "quit") {
      event.preventDefault();
      return;
    }
    if (isQuittingConfirmed) {
      return;
    }

    event.preventDefault();
    isQuitting = true;

    // Dispara offline imediatamente pelo processo principal Node.js
    sendDirectOfflineSync();

    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("app:quitting");
      }
    } catch { }

    // Timer de segurança de 400ms caso o renderer não responda a tempo
    if (!quitSafetyTimer) {
      quitSafetyTimer = setTimeout(() => {
        isQuittingConfirmed = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy();
        }
        app.quit();
      }, 400);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }

    if (process.platform !== "darwin" && !isQuitting) {
      isQuitting = true;
      app.quit();
    }
  });

  await loadMainWindow();

  // Checa atualizações de forma silenciosa na inicialização
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error("[AutoUpdater] Erro ao buscar atualizações automáticas:", err);
      });
    }, 10_000); // aguarda 10s após abrir a janela principal para não sobrecarregar a inicialização

    // Checa por atualizações a cada 4 horas (reduzido de 2h para reduzir chamadas)
    const updateCheckInterval = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        clearInterval(updateCheckInterval);
        return;
      }
      autoUpdater.checkForUpdates().catch((err) => {
        console.error("[AutoUpdater] Erro ao buscar atualizações periódicas:", err);
      });
    }, 4 * 60 * 60 * 1000);
    updateCheckInterval.unref?.();
  }
};

const syncOverlayBounds = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const displays = screen.getAllDisplays();
  const display = displays.find((candidate) => candidate.id === overlayDisplayId)
    || (mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getPrimaryDisplay());
  overlayDisplayId = display.id;
  overlayWindow.setBounds(display.bounds);
};

const selectOverlayDisplayFromLauncher = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  overlayDisplayId = screen.getDisplayMatching(mainWindow.getBounds()).id;
  syncOverlayBounds();
};

const applyWindowProfile = (executablePath, launchProfile) => {
  if (!launchProfile || launchProfile.windowMode === "default") return;
  const display = screen.getAllDisplays().find((candidate) => candidate.id === launchProfile.monitorId)
    || screen.getPrimaryDisplay();
  const targetBounds = launchProfile.windowMode === "borderless" ? display.bounds : display.workArea;
  const width = launchProfile.resolutionWidth || targetBounds.width;
  const height = launchProfile.resolutionHeight || targetBounds.height;
  const x = targetBounds.x + Math.max(0, Math.floor((targetBounds.width - width) / 2));
  const y = targetBounds.y + Math.max(0, Math.floor((targetBounds.height - height) / 2));
  execFile("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", path.join(__dirname, "apply-window-profile.ps1"),
    "-ExecutablePath", executablePath,
    "-WindowMode", launchProfile.windowMode,
    "-X", String(x),
    "-Y", String(y),
    "-Width", String(width),
    "-Height", String(height),
  ], { windowsHide: true }, (error) => {
    if (error) console.warn("[launcher] Perfil de janela nao foi aplicado:", error.message);
  });
};

const createOverlayWindow = () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const initialDisplay = (overlayDisplayId
    ? screen.getAllDisplays().find((candidate) => candidate.id === overlayDisplayId)
    : null)
    || (mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getPrimaryDisplay());
  const initialBounds = initialDisplay.bounds;

  overlayReady = false;
  overlayWindow = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    type: "toolbar",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreen: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "overlay", "overlay-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver", 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  syncOverlayBounds();
  const createdOverlayWindow = overlayWindow;
  createdOverlayWindow.loadFile(path.join(__dirname, 'overlay', "overlay.html"));
  createdOverlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeOpenExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  createdOverlayWindow.webContents.once("did-finish-load", () => {
    if (createdOverlayWindow.isDestroyed() || overlayWindow !== createdOverlayWindow) return;
    overlayReady = true;
    createdOverlayWindow.webContents.send("overlay:panel-visibility", {
      open: overlayPanelOpen,
      state: overlayPanelState,
    });
    pendingOverlayEvents.splice(0).forEach(({ channel, payload }) => {
      createdOverlayWindow.webContents.send(channel, payload);
    });
  });
  createdOverlayWindow.once("ready-to-show", () => {
    if (!createdOverlayWindow.isDestroyed() && overlayPanelOpen) {
      createdOverlayWindow.showInactive();
    }
  });
  createdOverlayWindow.on("closed", () => {
    if (overlayWindow === createdOverlayWindow) {
      overlayWindow = null;
      overlayReady = false;
    }
  });

  return overlayWindow;
};

const revealOverlayForToast = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try {
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
    overlayWindow.moveTop();
    if (!overlayPanelOpen) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.setFocusable(false);
    }
    overlayWindow.showInactive();
  } catch (error) {
    console.warn("[overlay] Nao foi possivel reafirmar a ordem da janela:", error);
  }
};

const sendOverlayEvent = (channel, payload) => {
  createOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.warn("[overlay] Janela de overlay nao disponivel para:", channel);
    return;
  }

  if (channel === "overlay:social" || channel === "achievement:unlock") {
    revealOverlayForToast();
  }

  if (!overlayReady || overlayWindow.webContents.isLoadingMainFrame()) {
    pendingOverlayEvents.push({ channel, payload });
    if (pendingOverlayEvents.length > 100) {
      console.warn("[overlay] Fila de eventos do overflow, removendo mais antigos");
      pendingOverlayEvents.shift();
    }
    return;
  }

  try {
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
    overlayWindow.moveTop();
    if (!overlayPanelOpen) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.setFocusable(false);
    }
    overlayWindow.showInactive();
  } catch (error) {
    console.warn("[overlay] Nao foi possivel reafirmar a ordem da janela:", error);
  }
  try {
    overlayWindow.webContents.send(channel, payload);
  } catch (sendError) {
    console.error("[overlay] Falha ao enviar evento para renderer:", sendError);
  }
};

let lastOverlayKeyboardToggleAt = 0;
const OVERLAY_KEYBOARD_TOGGLE_COOLDOWN_MS = 250;

const setOverlayPanelOpen = (open) => {
  createOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayPanelOpen = Boolean(open);

  const hasRunningGame = inGameOverlayActive
    || activeGameMonitors.size > 0
    || Boolean(overlayPanelState?.currentGame);

  if (overlayPanelOpen) {
    overlayWindow.setSkipTaskbar(true);
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.setAlwaysOnTop(true, "screen-saver", 1);
    overlayWindow.moveTop();
    overlayWindow.showInactive();


    if (!hasRunningGame) {
      overlayWindow.setFocusable(true);
      overlayWindow.focus();
    }
    overlayWindow.setSkipTaskbar(true);
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setFocusable(false);
    overlayWindow.blur();
    overlayWindow.setSkipTaskbar(true);
    overlayWindow.hide();

    if (!hasRunningGame && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      setTimeout(() => {
        const stillHasGame = inGameOverlayActive
          || activeGameMonitors.size > 0
          || Boolean(overlayPanelState?.currentGame);
        if (!stillHasGame && mainWindow && !mainWindow.isDestroyed() && !overlayPanelOpen) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.setAlwaysOnTop(true);
          mainWindow.show();
          mainWindow.focus();
          mainWindow.setAlwaysOnTop(false);
        }
      }, 50);
    }
  }

  sendOverlayEvent("overlay:panel-visibility", {
    open: overlayPanelOpen,
    state: overlayPanelState,
  });

  // Notifica a janela principal para bloquear/desbloquear inputs do controle
  // enquanto o overlay in-game estiver aberto.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("overlay:hub-input-lock", { locked: overlayPanelOpen });
  }
};


const requestOverlayPanelToggle = (source = "unknown") => {
  const normalizedSource = String(source || "unknown");
  const now = Date.now();
  if (
    normalizedSource === "gamepad"
    && now - lastOverlayGamepadToggleAt < OVERLAY_GAMEPAD_TOGGLE_COOLDOWN_MS
  ) {
    return overlayPanelOpen;
  }
  if (normalizedSource === "gamepad") lastOverlayGamepadToggleAt = now;

  if (
    normalizedSource === "keyboard"
    && now - lastOverlayKeyboardToggleAt < OVERLAY_KEYBOARD_TOGGLE_COOLDOWN_MS
  ) {
    return overlayPanelOpen;
  }
  if (normalizedSource === "keyboard") lastOverlayKeyboardToggleAt = now;

  setOverlayPanelOpen(!overlayPanelOpen);
  return overlayPanelOpen;
};

const overlaySettingsFile = () => path.join(app.getPath("userData"), "overlay-settings.json");
const captureDirectory = () => path.join(app.getPath("pictures"), "Phelierium Captures");

// Debounce de 500ms para salvar configurações do overlay — evita múltiplas
// escritas síncronas consecutivas quando várias configs mudam de uma vez.
let _saveOverlaySettingsTimer = null;
const saveOverlaySettings = () => {
  if (_saveOverlaySettingsTimer) clearTimeout(_saveOverlaySettingsTimer);
  _saveOverlaySettingsTimer = setTimeout(async () => {
    _saveOverlaySettingsTimer = null;
    try {
      const file = overlaySettingsFile();
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const tmpPath = `${file}.tmp`;
      await fs.promises.writeFile(
        tmpPath,
        JSON.stringify({
          captureShortcut,
          achievementVolume,
          achievementSoundTheme,
          achievementNotificationsEnabled,
          customAchievementNotifications,
          achievementNotificationPosition,
        }, null, 2),
        "utf8",
      );
      await fs.promises.rename(tmpPath, file);
    } catch (error) {
      console.warn("[overlay] Nao foi possivel salvar as configuracoes:", error);
    }
  }, 500);
};

const loadRecentCaptures = async () => {
  try {
    const baseDir = captureDirectory();
    await fs.promises.mkdir(baseDir, { recursive: true });
    const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });

    let allFiles = [];
    for (const entry of entries) {
      if (entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name)) {
        allFiles.push({ path: path.join(baseDir, entry.name), name: entry.name });
      } else if (entry.isDirectory()) {
        const subDir = path.join(baseDir, entry.name);
        const subEntries = await fs.promises.readdir(subDir, { withFileTypes: true }).catch(() => []);
        for (const sub of subEntries) {
          if (sub.isFile() && /\.(png|jpe?g)$/i.test(sub.name)) {
            allFiles.push({ path: path.join(subDir, sub.name), name: sub.name });
          }
        }
      }
    }

    const withStats = await Promise.all(
      allFiles.map(async (fileObj) => {
        const stat = await fs.promises.stat(fileObj.path).catch(() => null);
        if (!stat) return null;
        return {
          id: `${stat.mtimeMs}:${fileObj.name}`,
          name: fileObj.name,
          url: pathToFileURL(fileObj.path).toString(),
          createdAt: stat.mtime.toISOString(),
        };
      })
    );
    recentCaptures = withStats
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, CAPTURE_HISTORY_LIMIT);
  } catch (error) {
    console.warn("[overlay] Nao foi possivel carregar as capturas:", error);
    recentCaptures = [];
  }
};

const captureCurrentDisplay = async () => {
  const display = overlayDisplayId != null
    ? screen.getAllDisplays().find((candidate) => candidate.id === overlayDisplayId)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const targetDisplay = display || screen.getPrimaryDisplay();
  const shouldTemporarilyHideOverlay = process.platform !== "win32"
    && Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible());
  const restorePanel = overlayPanelOpen;

  try {
    if (shouldTemporarilyHideOverlay) {
      overlayWindow.hide();
      await sleep(120);
    }
    const scaleFactor = Math.max(1, Number(targetDisplay.scaleFactor) || 1);
    const captureSize = {
      width: Math.max(1, Math.round(targetDisplay.size.width * scaleFactor)),
      height: Math.max(1, Math.round(targetDisplay.size.height * scaleFactor)),
    };
    let source = null;
    let lastCaptureError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: captureSize,
        });
        source = sources.find((candidate) => String(candidate.display_id) === String(targetDisplay.id))
          || sources[0]
          || null;
        if (source && !source.thumbnail.isEmpty()) break;
        source = null;
        lastCaptureError = new Error("Nenhuma imagem de tela foi retornada.");
      } catch (error) {
        lastCaptureError = error;
      }
      await sleep(100 + attempt * 80);
    }
    if (!source) {
      throw lastCaptureError || new Error("Nenhuma imagem de tela foi retornada.");
    }

    const gameTitle = String(overlayPanelState.currentGame?.title || "Desktop")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70) || "Desktop";
    const directory = path.join(captureDirectory(), gameTitle);
    await fs.promises.mkdir(directory, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${gameTitle} ${stamp}.png`;
    const filePath = path.join(directory, fileName);
    // Escrita assíncrona para não bloquear o event loop
    await fs.promises.writeFile(filePath, source.thumbnail.toPNG());
    const capture = {
      id: `${Date.now()}:${fileName}`,
      name: fileName,
      url: pathToFileURL(filePath).toString(),
      createdAt: new Date().toISOString(),
      gameId: String(overlayPanelState.currentGame?.id || ""),
      gameTitle: String(overlayPanelState.currentGame?.title || ""),
    };
    recentCaptures = [capture, ...recentCaptures.filter((item) => item.url !== capture.url)]
      .slice(0, CAPTURE_HISTORY_LIMIT);
    overlayPanelState = { ...overlayPanelState, captures: recentCaptures };
    return capture;
  } finally {
    if (shouldTemporarilyHideOverlay && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.showInactive();
      overlayWindow.setAlwaysOnTop(true, "screen-saver");
      if (restorePanel) {
        overlayWindow.setFocusable(true);
        overlayWindow.focus();
      }
    }
  }
};

const runCapture = async () => {
  if (captureInProgress) return { ok: false, error: "Uma captura ja esta em andamento." };
  captureInProgress = true;
  try {
    playOverlaySound("screenshot-trigger");
    const capture = await captureCurrentDisplay();
    if (overlayPanelOpen) sendOverlayEvent("overlay:panel-state", overlayPanelState);
    sendOverlayEvent("overlay:social", {
      kind: "capture-saved",
      title: getOverlayEventCopy().captureSaved,
      description: capture.name,
    });
    playOverlaySound("screenshot");
    return { ok: true, capture };
  } catch (error) {
    console.error("[overlay] Falha ao capturar a tela:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao capturar a tela." };
  } finally {
    captureInProgress = false;
  }
};

const deleteCapture = async (captureId) => {
  const normalizedId = String(captureId || "").slice(0, 256);
  const capture = recentCaptures.find((item) => item.id === normalizedId);
  if (!capture) return { ok: false, error: "Captura nao encontrada." };

  try {
    const directory = path.resolve(captureDirectory());
    const isFileURL = capture.url.startsWith("file:");
    const filePath = path.resolve(isFileURL ? fileURLToPath(capture.url) : decodeURIComponent(capture.url.replace(/^cp-media:\/\/(?:local\/)?/i, "")));
    const relativePath = path.relative(directory, filePath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return { ok: false, error: "Arquivo de captura invalido." };
    }
    if (fs.existsSync(filePath)) await shell.trashItem(filePath);
    recentCaptures = recentCaptures.filter((item) => item.id !== normalizedId);
    overlayPanelState = { ...overlayPanelState, captures: recentCaptures };
    if (overlayPanelOpen) sendOverlayEvent("overlay:panel-state", overlayPanelState);
    return { ok: true, trashed: true };
  } catch (error) {
    console.error("[overlay] Falha ao excluir a captura:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao excluir a captura." };
  }
};

const registerCaptureShortcut = (requestedShortcut) => {
  const nextShortcut = normalizeCaptureShortcut(requestedShortcut);
  if (!nextShortcut) return false;
  const previousShortcut = captureShortcut;
  if (nextShortcut === previousShortcut && globalShortcut.isRegistered(nextShortcut)) return true;
  if (previousShortcut && globalShortcut.isRegistered(previousShortcut)) {
    globalShortcut.unregister(previousShortcut);
  }
  let registered = false;
  try {
    registered = globalShortcut.register(nextShortcut, () => { void runCapture(); });
  } catch (error) {
    console.warn(`[overlay] Atalho de captura invalido: ${nextShortcut}`, error);
  }
  if (!registered) {
    if (previousShortcut && previousShortcut !== nextShortcut) {
      try {
        globalShortcut.register(previousShortcut, () => { void runCapture(); });
      } catch (error) {
        console.warn(`[overlay] Nao foi possivel restaurar o atalho ${previousShortcut}:`, error);
      }
    }
    return false;
  }
  captureShortcut = nextShortcut;
  overlayPanelState = {
    ...overlayPanelState,
    settings: { ...overlayPanelState.settings, captureShortcut },
  };
  saveOverlaySettings();
  return true;
};

const activateInGameOverlay = () => {
  inGameOverlayActive = true;
  createOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;

  if (!globalShortcut.isRegistered(captureShortcut) && !registerCaptureShortcut(captureShortcut)) {
    console.warn(`[overlay] O atalho de captura ${captureShortcut} nao pode ser ativado para a sessao atual.`);
  }

  try {
    syncOverlayBounds();
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setAlwaysOnTop(true, "screen-saver");
    overlayWindow.moveTop();
    overlayWindow.showInactive();
  } catch (error) {
    console.warn("[overlay] Nao foi possivel ativar a janela para a sessao do jogo:", error);
  }
  return true;
};

const deactivateInGameOverlay = () => {
  inGameOverlayActive = false;
  if (overlayPanelOpen) setOverlayPanelOpen(false);
};

const applyAchievementNotificationSettings = (requestedSettings) => {
  const supportedPositions = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
  achievementNotificationsEnabled = requestedSettings?.enabled !== false;
  customAchievementNotifications = requestedSettings?.custom !== false;
  achievementNotificationPosition = supportedPositions.has(requestedSettings?.position)
    ? requestedSettings.position
    : achievementNotificationPosition;
  overlayPanelState = {
    ...overlayPanelState,
    settings: {
      ...overlayPanelState.settings,
      achievementNotificationsEnabled,
      customAchievementNotifications,
      achievementNotificationPosition,
    },
  };
  saveOverlaySettings();
  if (overlayReady && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay:panel-state", overlayPanelState);
  }
  return {
    enabled: achievementNotificationsEnabled,
    custom: customAchievementNotifications,
    position: achievementNotificationPosition,
  };
};

registerSecureIpcHandler("overlay:update-panel", async (_event, payload) => {
  const previouslyHadRunningGame = Boolean(overlayPanelState.currentGame);
  const friends = Array.isArray(payload?.friends) ? payload.friends.slice(0, 30).map((friend) => ({
    id: String(friend?.id || "").slice(0, 128),
    name: String(friend?.name || "Jogador").slice(0, 80),
    status: ["online", "playing", "offline"].includes(friend?.status) ? friend.status : "offline",
    playing: String(friend?.playing || "").slice(0, 120),
    avatar: sanitizeOverlayImageSource(friend?.avatar),
    unread: Math.max(0, Number(friend?.unread) || 0),
    canChat: Boolean(friend?.canChat),
  })).filter((friend) => friend.id) : [];
  const achievementItems = Array.isArray(payload?.achievements?.items)
    ? payload.achievements.items.slice(0, 300).map((achievement) => ({
      id: String(achievement?.id || "").slice(0, 160),
      name: String(achievement?.name || "Conquista").slice(0, 160),
      description: String(achievement?.description || "").slice(0, 500),
      icon: String(achievement?.icon || "").slice(0, 2048),
      achieved: Boolean(achievement?.achieved),
      unlockedAt: String(achievement?.unlockedAt || "").slice(0, 64),
    })).filter((achievement) => achievement.id)
    : [];
  const messages = Array.isArray(payload?.chat?.messages)
    ? payload.chat.messages.slice(-80).map((message) => ({
      id: String(message?.id || "").slice(0, 180),
      text: String(message?.text || "").slice(0, 2000),
      attachmentUrl: String(message?.attachmentUrl || "").slice(0, 4096),
      attachmentName: String(message?.attachmentName || "").slice(0, 160),
      createdAt: String(message?.createdAt || "").slice(0, 64),
      mine: Boolean(message?.mine),
      pending: Boolean(message?.pending),
    })).filter((message) => message.id && (message.text || message.attachmentUrl))
    : [];
  overlayPanelState = {
    language: ["pt-BR", "en-US", "es-ES", "fr-FR", "de-DE", "it-IT"].includes(payload?.language)
      ? payload.language
      : "pt-BR",
    friends,
    achievements: {
      unlocked: Math.max(0, Number(payload?.achievements?.unlocked) || 0),
      available: Math.max(0, Number(payload?.achievements?.available) || 0),
      loading: Boolean(payload?.achievements?.loading),
      items: achievementItems,
    },
    currentGame: payload?.currentGame ? {
      id: String(payload.currentGame.id || "").slice(0, 160),
      title: String(payload.currentGame.title || "").slice(0, 160),
      image: sanitizeOverlayImageSource(payload.currentGame.image),
      platform: String(payload.currentGame.platform || "").slice(0, 40),
      category: String(payload.currentGame.category || "").slice(0, 80),
      developer: String(payload.currentGame.developer || "").slice(0, 120),
      releaseDate: String(payload.currentGame.releaseDate || "").slice(0, 80),
      executableName: String(payload.currentGame.executableName || "").slice(0, 160),
      totalPlaytimeMinutes: Math.max(0, Number(payload.currentGame.totalPlaytimeMinutes) || 0),
      sessionStartedAt: String(payload.currentGame.sessionStartedAt || "").slice(0, 64),
      windowMode: String(payload.currentGame.windowMode || "").slice(0, 40),
      resolution: String(payload.currentGame.resolution || "").slice(0, 40),
      monitoring: payload.currentGame.monitoring === "verified" ? "verified" : "unverified",
    } : null,
    captures: recentCaptures,
    settings: {
      captureShortcut,
      achievementVolume,
      achievementSoundTheme,
      achievementNotificationsEnabled,
      customAchievementNotifications,
      achievementNotificationPosition,
    },
    chat: payload?.chat ? {
      friendId: String(payload.chat.friendId || "").slice(0, 128),
      friendName: String(payload.chat.friendName || "Amigo").slice(0, 80),
      friendAvatar: sanitizeOverlayImageSource(payload.chat.friendAvatar),
      typing: Boolean(payload.chat.typing),
      sending: Boolean(payload.chat.sending),
      error: String(payload.chat.error || "").slice(0, 300),
      messages,
    } : null,
    profile: {
      name: String(payload?.profile?.name || "Jogador").slice(0, 80),
      avatar: sanitizeOverlayImageSource(payload?.profile?.avatar),
      discordConnected: Boolean(payload?.profile?.discordConnected),
      discordUsername: String(payload?.profile?.discordUsername || "").slice(0, 80),
      achievements: Math.max(0, Number(payload?.profile?.achievements) || 0),
    },
    gamepad: payload?.gamepad ? {
      connected: Boolean(payload.gamepad.connected),
      family: String(payload.gamepad.family || "generic"),
      batteryLevel: payload.gamepad.batteryLevel != null ? Number(payload.gamepad.batteryLevel) : null,
      isCharging: Boolean(payload.gamepad.isCharging),
      connectionType: String(payload.gamepad.connectionType || "unknown"),
    } : null,
    voiceCall: payload?.voiceCall ? {
      inCall: Boolean(payload.voiceCall.inCall),
      channelName: String(payload.voiceCall.channelName || "Chamada de Voz").slice(0, 80),
      isMuted: Boolean(payload.voiceCall.isMuted),
      isDeafened: Boolean(payload.voiceCall.isDeafened),
      participantsCount: Math.max(0, Number(payload.voiceCall.participantsCount) || 0),
      speakingUserNames: Array.isArray(payload.voiceCall.speakingUserNames)
        ? payload.voiceCall.speakingUserNames.slice(0, 5).map((n) => String(n).slice(0, 60))
        : [],
    } : null,
    playerLevel: payload?.playerLevel ? {
      level: Math.max(1, Number(payload.playerLevel.level) || 1),
      xp: Math.max(0, Number(payload.playerLevel.xp) || 0),
      progress: Math.min(100, Math.max(0, Number(payload.playerLevel.progress) || 0)),
      tierName: String(payload.playerLevel.tierName || "Bronze").slice(0, 40),
      rankColor: String(payload.playerLevel.rankColor || "#EAB308").slice(0, 20),
    } : null,
  };
  const hasRunningGame = Boolean(overlayPanelState.currentGame);
  if (hasRunningGame && (!previouslyHadRunningGame || !inGameOverlayActive)) {
    activateInGameOverlay();
  } else if (!hasRunningGame && previouslyHadRunningGame) {
    deactivateInGameOverlay();
  }
  if (overlayPanelOpen) sendOverlayEvent("overlay:panel-state", overlayPanelState);
});

const getLocalGameLibrary = () => {
  if (!localGameLibrary) {
    localGameLibrary = createLocalGameLibrary(app.getPath("userData"));
  }
  return localGameLibrary;
};

registerSecureIpcHandler("library:list", async (_event, uid) =>
  getLocalGameLibrary().list(uid));
registerSecureIpcHandler("library:create", async (_event, uid, game) =>
  getLocalGameLibrary().create(uid, game));
registerSecureIpcHandler("library:update", async (_event, uid, gameId, patch) =>
  getLocalGameLibrary().update(uid, gameId, patch));
registerSecureIpcHandler("library:delete", async (_event, uid, gameId) =>
  getLocalGameLibrary().remove(uid, gameId));
registerSecureIpcHandler("library:delete-by-launcher", async (_event, uid, launcherType) =>
  getLocalGameLibrary().removeByLauncher(uid, launcherType));
registerSecureIpcHandler("library:record-session", async (_event, uid, gameId, session) =>
  getLocalGameLibrary().recordSession(uid, gameId, session));
registerSecureIpcHandler("library:bulk-upsert", async (_event, uid, games) =>
  getLocalGameLibrary().bulkUpsert(uid, games));
registerSecureIpcHandler("library:import-legacy", async (_event, uid, games) =>
  getLocalGameLibrary().importLegacy(uid, games));
registerSecureIpcHandler("library:needs-legacy-import", async (_event, uid) =>
  getLocalGameLibrary().needsLegacyImport(uid));
registerSecureIpcHandler("library:get-summary", async (_event, uid) =>
  getLocalGameLibrary().getSummary(uid));
registerSecureIpcHandler("library:mark-summary-synced", async (_event, uid, revision) =>
  getLocalGameLibrary().markSummarySynced(uid, revision));
registerSecureIpcHandler("library:clear-steam-id", async (_event, uid) =>
  getLocalGameLibrary().clearSteamId(uid));

ipcMain.handle("overlay:panel-action", async (event, action) => {
  if (!overlayWindow || event.sender !== overlayWindow.webContents) {
    throw new Error("Origem do overlay nao autorizada.");
  }
  const kind = String(action?.kind || "");
  if (kind === "toggle") {
    const open = requestOverlayPanelToggle(action?.source);
    return { ok: true, open };
  }
  if (kind === "close") {
    setOverlayPanelOpen(false);
    return;
  }
  if (kind === "set-toast-interactive") {
    if (!overlayPanelOpen && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(!Boolean(action?.interactive), { forward: true });
    }
    return { ok: true };
  }
  if (kind === "toasts-cleared") {
    if (!overlayPanelOpen && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.hide();
    }
    return { ok: true };
  }
  if (kind === "request-input-focus") {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setFocusable(true);
      overlayWindow.focus();
    }
    return { ok: true };
  }
  if (kind === "open-launcher-chat" || kind === "open-launcher-friends" || kind === "open-launcher-call") {
    const payload = { kind };
    if (kind === "open-launcher-chat" || kind === "open-launcher-call") {
      payload.friendId = String(action?.friendId || "").slice(0, 128);
    }
    if (kind === "open-launcher-chat" && inGameOverlayActive && payload.friendId) {
      setOverlayPanelOpen(true);
      mainWindow?.webContents.send("overlay:panel-action", {
        kind: "select-chat",
        friendId: payload.friendId,
      });
      sendOverlayEvent("overlay:panel-command", { kind: "open-chat" });
      return { ok: true, target: "in-game-chat" };
    }
    if (overlayWindow && !overlayWindow.isDestroyed() && !overlayPanelOpen) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("overlay:panel-action", payload);
    }
    return { ok: true, target: kind === "open-launcher-chat" ? "launcher-chat" : kind === "open-launcher-call" ? "launcher-call" : "launcher-friends" };
  }
  if (kind === "capture-screen") {
    return runCapture();
  }
  if (kind === "open-captures-folder") {
    fs.mkdirSync(captureDirectory(), { recursive: true });
    const error = await shell.openPath(captureDirectory());
    return { ok: !error, error };
  }
  if (kind === "delete-capture") {
    return deleteCapture(action?.captureId);
  }
  if (kind === "set-capture-shortcut") {
    const shortcut = String(action?.shortcut || "");
    const ok = registerCaptureShortcut(shortcut);
    if (ok && overlayPanelOpen) sendOverlayEvent("overlay:panel-state", overlayPanelState);
    return { ok, shortcut: captureShortcut };
  }
  if (kind === "set-achievement-notifications") {
    return applyAchievementNotificationSettings({
      enabled: action?.enabled,
      custom: action?.custom,
      position: action?.position,
    });
  }
  if (["media-play-pause", "media-next", "media-previous"].includes(kind)) {
    const keyCode = kind === "media-play-pause" ? 179 : kind === "media-next" ? 176 : 177;
    execFile("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command",
      `$shell = New-Object -ComObject WScript.Shell; $shell.SendKeys([char]${keyCode})`,
    ], { windowsHide: true }, () => undefined);
    return;
  }
  if (["select-chat", "close-chat", "send-message", "send-image", "set-typing", "voice-call", "voice-accept", "voice-reject", "voice-hangup", "voice-mute", "voice-deafen"].includes(kind)) {
    const payload = { kind };
    if (kind === "select-chat" || kind === "voice-call") {
      payload.friendId = String(action?.friendId || "").slice(0, 128);
      if (action?.friendName) payload.friendName = String(action.friendName).slice(0, 128);
      if (action?.friendAvatar) payload.friendAvatar = String(action.friendAvatar).slice(0, 512);
      if (action?.friendUid) payload.friendUid = String(action.friendUid).slice(0, 128);
    }
    if (kind === "send-message") payload.text = String(action?.text || "").trim().slice(0, 2000);
    if (kind === "set-typing") payload.typing = Boolean(action?.typing);
    if (kind === "send-image") {
      const type = String(action?.type || "").toLowerCase();
      const data = Buffer.from(action?.data || []);
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type) || data.length === 0 || data.length > 8 * 1024 * 1024) {
        return { ok: false, error: "Use uma imagem JPG, PNG, WEBP ou GIF de ate 8 MB." };
      }
      payload.name = String(action?.name || "imagem").slice(0, 160);
      payload.type = type;
      payload.data = data;
    }
    mainWindow?.webContents.send("overlay:panel-action", payload);
    return { ok: true };
  }
});

const playOverlaySound = (sound) => {
  createOverlayWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    throw new Error("Overlay indisponivel.");
  }

  sendOverlayEvent("overlay:play-sound", {
    sound,
    volume: achievementVolume,
    theme: achievementSoundTheme,
  });
};

const showNativeAchievementNotification = (payload) => {
  if (!Notification.isSupported()) {
    console.warn("[overlay] Notificacoes nativas nao sao suportadas neste sistema.");
    return false;
  }
  const achievement = payload?.achievement || {};
  let iconPath = "";
  try {
    const candidate = path.join(__dirname, "..", "assets", "icon.png");
    if (fs.existsSync(candidate)) {
      iconPath = candidate;
    } else if (app.isPackaged) {
      const asarPath = path.join(process.resourcesPath, "assets", "icon.png");
      if (fs.existsSync(asarPath)) iconPath = asarPath;
    } else {
      const devPath = path.join(app.getAppPath(), "assets", "icon.png");
      if (fs.existsSync(devPath)) iconPath = devPath;
    }
  } catch {
    // ignore icon resolution errors
  }

  const notification = new Notification({
    title: String(achievement.name || payload?.achievementId || getOverlayEventCopy().firstKill).slice(0, 160),
    body: String(
      achievement.description
      || nativeAchievementFallbackCopy[overlayPanelState.language]
      || nativeAchievementFallbackCopy["pt-BR"],
    ).slice(0, 500),
    icon: iconPath || undefined,
    silent: true,
  });
  activeNativeNotifications.add(notification);
  notification.on("close", () => activeNativeNotifications.delete(notification));
  notification.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  notification.on("show", () => {
    console.info("[overlay] Notificacao nativa exibida:", notification.title);
  });
  notification.on("error", (err) => {
    console.warn("[overlay] Erro na notificacao nativa:", err);
  });
  try {
    notification.show();
  } catch (err) {
    console.error("[overlay] Falha ao mostrar notificacao nativa:", err);
    activeNativeNotifications.delete(notification);
    return false;
  }
  return true;
};

const dispatchAchievementNotification = (payload) => {
  if (!achievementNotificationsEnabled) return false;
  if (customAchievementNotifications) {
    sendOverlayEvent("achievement:unlock", {
      ...payload,
      position: achievementNotificationPosition,
    });
  } else {
    showNativeAchievementNotification(payload);
  }
  const rawTier = String(payload?.tier || payload?.achievement?.tier || "").toLowerCase();
  const soundName = rawTier === "platinum" || rawTier === "platina"
    ? "achievement-unlock-platinum"
    : rawTier === "gold" || rawTier === "ouro"
      ? "achievement-unlock-gold"
      : "achievement-unlock";
  playOverlaySound(soundName);
  // Phase 4: also fire a system-level push when the app is backgrounded.
  // Skip when the window is visible (the in-page toast already covers that case)
  // and when the payload does not look like a trophy unlock.
  if (payload && payload.tier && payload.trophyTitle) {
    try {
      const result = showTrophyNotification(
        {
          trophyTitle: payload.trophyTitle,
          trophyDescription: payload.trophyDescription || "",
          tier: payload.tier,
          xp: Number.isFinite(payload.xp) ? payload.xp : 0,
          iconUrl: payload.iconUrl,
        },
        createTrophyNotificationDeps({ BrowserWindow, logger: console }),
      );
      if (result && result.shown) {
        console.info("[trophy] system push delivered:", payload.trophyTitle);
      } else if (result && result.reason) {
        console.debug("[trophy] system push skipped:", result.reason);
      }
    } catch (err) {
      console.warn("[trophy] system push dispatch failed:", err);
    }
  }
  return true;
};

const steamAppIdFromGameKey = (gameId) => {
  const value = String(gameId || "").trim();
  return value.match(/^steam_(\d+)$/i)?.[1] || value.match(/_steam_(\d+)$/i)?.[1] ||
    (/^\d+$/.test(value) ? value : null);
};

const startAchievementBridge = async () => {
  achievementBridge = createAchievementBridge({
    userDataPath: app.getPath("userData"),
    appUrl: APP_URL,
    logger: console,
    normalizeAchievementId: async (gameId, rawAchievementId) => {
      const appId = steamAppIdFromGameKey(gameId);
      return appId
        ? resolveEmulatorAchievementId(appId, rawAchievementId)
        : rawAchievementId;
    },
    onAchievementUnlocked: async (payload) => {
      // payload vem do emulador como { gameId, achievementId, unlockedAt, duplicate }
      if (payload.duplicate) return;

      const schema = await getSchemaByAppIdOrGameId(payload.gameId);
      if (schema) {
        const ach = schema.find(a => String(a.id).toLowerCase() === String(payload.achievementId).toLowerCase());
        if (ach) {
          payload.achievement = {
            id: ach.id,
            name: ach.name,
            description: ach.description || "",
            icon: ach.icon || "",
          };
        }
      }

      // Fallback para caso não consigamos ler o schema
      if (!payload.achievement) {
        payload.achievement = {
          id: payload.achievementId,
          name: payload.achievementId,
          description: "",
          icon: ""
        };
      }

      dispatchAchievementNotification(payload);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("achievement:realtime-unlock", {
          gameId: payload.gameId,
          achievementId: payload.achievementId,
          achievement: payload.achievement,
          earnedTime: Math.floor(new Date(payload.unlockedAt).getTime() / 1000),
          unlockedAt: payload.unlockedAt,
        });
      }
    },
  });

  return achievementBridge.start();
};

const migrateKnownAchievementProgress = async () => {
  if (!achievementBridge) return;
  const userDataPath = app.getPath("userData");
  let files = [];
  try {
    files = await fs.promises.readdir(userDataPath);
  } catch {
    return;
  }

  for (const file of files) {
    const appId = file.match(/^user_progress_steam_(\d+)\.json$/i)?.[1];
    if (!appId) continue;
    const detected = detectKnownEmulatorSave(appId);
    if (!detected) continue;
    const aliases = getAchievementAliases(detected);
    if (Object.keys(aliases).length === 0) continue;
    try {
      const result = await achievementBridge.migrateAchievementAliases(`steam_${appId}`, aliases);
      if (result.migrated > 0) {
        console.info(`[achievement-migration] ${result.migrated} IDs migrados para steam_${appId}.`);
      }
    } catch (error) {
      console.error(`[achievement-migration] Falha em steam_${appId}:`, error);
    }
  }
};

registerSecureIpcHandler("achievement:get-definitions", async (_event, gameId) => {
  try {
    const achievementsDir = path.join(app.getPath("userData"), "achievements");
    const definitionsPath = path.join(achievementsDir, `${gameId}.json`);
    if (fs.existsSync(definitionsPath)) {
      const content = await fs.promises.readFile(definitionsPath, "utf8");
      const trimmed = (content || "").trim();
      if (!trimmed) {
        // Arquivo vazio corrompido — remove para evitar erros repetidos de parse
        void fs.promises.unlink(definitionsPath).catch(() => undefined);
        return null;
      }
      return JSON.parse(trimmed);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(`[achievement] Arquivo de definições corrompido para ${gameId} (descartando):`, error.message);
      try {
        const achievementsDir = path.join(app.getPath("userData"), "achievements");
        await fs.promises.unlink(path.join(achievementsDir, `${gameId}.json`));
      } catch { }
    } else {
      console.error("Error reading achievement definitions:", error);
    }
  }
  return null;
});

registerSecureIpcHandler("achievement:get-progress", async (_event, gameId) => {
  try {
    const progressPath = path.join(app.getPath("userData"), `user_progress_${gameId}.json`);
    if (fs.existsSync(progressPath)) {
      const content = await fs.promises.readFile(progressPath, "utf8");
      const trimmed = (content || "").trim();
      if (!trimmed) {
        void fs.promises.unlink(progressPath).catch(() => undefined);
        return null;
      }
      return JSON.parse(trimmed);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(`[achievement] Progresso corrompido para ${gameId} (descartando):`, error.message);
      try {
        await fs.promises.unlink(path.join(app.getPath("userData"), `user_progress_${gameId}.json`));
      } catch { }
    } else {
      console.error("Error reading achievement progress:", error);
    }
  }
  return null;
});

/**
 * Phase 4 — Phase 3 trophy-system hook.
 * Renderer (or services) calls this when a server-side trophy unlock is
 * confirmed (e.g., from a Supabase Realtime channel). The handler delegates
 * to `trophy-notification.cjs`, which decides whether to surface a native
 * system push (window hidden) or skip silently (toast already covers it).
 */
registerSecureIpcHandler("trophy:notify-unlock", async (_event, payload) => {
  if (!payload || typeof payload !== "object") {
    return { shown: false, reason: "invalid-payload" };
  }
  const title = String(payload.trophyTitle || "").slice(0, 200);
  const description = String(payload.trophyDescription || "").slice(0, 500);
  const tier = ["platinum", "gold", "silver", "bronze"].includes(payload.tier)
    ? payload.tier
    : "bronze";
  const xp = Number.isFinite(payload.xp) ? payload.xp : 0;
  const iconUrl = typeof payload.iconUrl === "string" ? payload.iconUrl : undefined;
  try {
    return showTrophyNotification(
      { trophyTitle: title, trophyDescription: description, tier, xp, iconUrl },
      createTrophyNotificationDeps({ BrowserWindow, logger: console }),
    );
  } catch (err) {
    console.warn("[trophy] IPC trophy:notify-unlock failed:", err);
    return { shown: false, reason: "throw" };
  }
});

const { readLocalSavesRetroactive } = require("./games/emulator-detector.cjs");
registerSecureIpcHandler("achievement:get-local-state", async (_event, appId) => {
  try {
    if (!appId) return {};
    return readLocalSavesRetroactive(appId);
  } catch (error) {
    console.error("Error reading retroactive achievement state:", error);
    return {};
  }
});

registerSecureIpcHandler("achievement:get-epic-local", async (_event, request) => {
  try {
    const result = readEpicLocalAchievements({
      title: String(request?.title || "").slice(0, 180),
      epicCatalogId: String(request?.epicCatalogId || "").slice(0, 300),
      epicLaunchId: String(request?.epicLaunchId || "").slice(0, 800),
      executablePath: String(request?.executablePath || "").slice(0, 2_000),
    });
    const gameId = String(request?.gameId || "").trim();
    if (/^[a-zA-Z0-9_-]{1,220}$/.test(gameId) && result.achievements.length > 0) {
      const achievementsDir = path.join(app.getPath("userData"), "achievements");
      const definitionsPath = path.join(achievementsDir, `${gameId}.json`);
      const progressPath = path.join(app.getPath("userData"), `user_progress_${gameId}.json`);
      await fs.promises.mkdir(achievementsDir, { recursive: true });
      await Promise.all([
        fs.promises.writeFile(definitionsPath, JSON.stringify({
          source: "epic-local",
          achievements: result.achievements.map((achievement) => ({
            id: achievement.apiName,
            name: achievement.name,
            description: achievement.description,
            icon: achievement.icon,
          })),
        }, null, 2), "utf8"),
        fs.promises.writeFile(progressPath, JSON.stringify({
          gameId,
          unlockedAchievements: Object.fromEntries(
            result.achievements
              .filter((achievement) => achievement.achieved)
              .map((achievement) => [achievement.apiName, {
                id: achievement.apiName,
                name: achievement.name,
                description: achievement.description,
                icon: achievement.icon,
                unlockedAt: achievement.unlockTime > 0
                  ? new Date(achievement.unlockTime * 1_000).toISOString()
                  : new Date().toISOString(),
              }]),
          ),
          updatedAt: new Date().toISOString(),
        }, null, 2), "utf8"),
      ]);
    }
    return result;
  } catch (error) {
    console.error("Error reading Epic local achievements:", error);
    return {
      source: "epic-local",
      status: "no-readable-files",
      installed: false,
      installLocation: "",
      achievements: [],
      total: 0,
      unlocked: 0,
      readableFileCount: 0,
      binarySaveDetected: false,
      scanTruncated: false,
    };
  }
});

registerSecureIpcHandler("achievement:get-library-summary", async () => {
  try {
    return await readAchievementLibrarySummary(app.getPath("userData"));
  } catch (error) {
    console.error("Error reading achievement library summary:", error);
    return { byGameId: {}, bySteamAppId: {}, updatedAt: new Date().toISOString() };
  }
});

registerSecureIpcHandler("achievement:get-diagnostics", async () => ({
  bridgePort: Number(achievementBridge?.getAddress?.()?.port || 0),
  watcherKeys: Array.from(activeWatchers.keys()),
  monitoredGameKeys: Array.from(activeGameMonitors.keys()),
  pendingRescanKeys: Array.from(activeRescanTimers.keys()),
  overlayReady,
  overlayDisplayId,
  overlayVisible: Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()),
}));

registerSecureIpcHandler("achievement:save-definitions", async (_event, gameId, definitions, steamAppId) => {
  try {
    const achievementsDir = path.join(app.getPath("userData"), "achievements");
    const definitionsPath = path.join(achievementsDir, `${gameId}.json`);

    await fs.promises.mkdir(achievementsDir, { recursive: true });
    const payload = { steamAppId, achievements: definitions };
    await fs.promises.writeFile(definitionsPath, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving achievement definitions:", error);
    throw error;
  }
});

registerSecureIpcHandler("achievement:unlock", async (_event, gameId, achievementId) => {
  try {
    if (achievementBridge) {
      return await achievementBridge.unlockAchievement(gameId, achievementId);
    }
    throw new Error("Achievement bridge nao iniciada.");
  } catch (error) {
    console.error("Error unlocking achievement:", error);
    throw error;
  }
});

registerSecureIpcHandler("overlay:show-friend-message", async (_event, payload) => {
  const copy = getOverlayEventCopy();
  const senderName = String(payload?.senderName || "").trim() || copy.player;
  const contentKind = payload?.contentKind === "image" ? "image" : "text";
  const imageMessage = {
    "pt-BR": "Enviou uma nova imagem",
    "en-US": "Sent a new image",
    "es-ES": "Envió una nueva imagen",
    "fr-FR": "A envoyé une nouvelle image",
    "de-DE": "Hat ein neues Bild gesendet",
    "it-IT": "Ha inviato una nuova immagine",
  }[overlayPanelState.language] || "Enviou uma nova imagem";
  const messageText = contentKind === "image"
    ? imageMessage
    : String(payload?.messageText || "").trim() || copy.newMessage;
  const avatarUrl = sanitizeOverlayImageSource(payload?.avatarUrl);
  const friendId = String(payload?.friendId || "").trim().slice(0, 128);

  sendOverlayEvent("overlay:social", {
    kind: "friend-message",
    title: senderName,
    description: messageText,
    avatarUrl: avatarUrl || overlayIconUrl(),
    friendId,
  });
});

async function getSchemaByAppIdOrGameId(key) {
  const achievementsDir = path.join(app.getPath("userData"), "achievements");
  if (!fs.existsSync(achievementsDir)) return null;

  const isSteamAppId = String(key).startsWith("steam_");
  const targetAppId = isSteamAppId ? key.replace("steam_", "") : null;

  const files = await fs.promises.readdir(achievementsDir);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const gameId = path.basename(file, ".json");
    if (!isSteamAppId && gameId === key) {
      try {
        const content = await fs.promises.readFile(path.join(achievementsDir, file), "utf8");
        return JSON.parse(content).achievements;
      } catch { /* ignora */ }
    }

    if (isSteamAppId) {
      try {
        const content = await fs.promises.readFile(path.join(achievementsDir, file), "utf8");
        const parsed = JSON.parse(content);
        if (String(parsed.steamAppId) === String(targetAppId)) {
          return parsed.achievements;
        }
      } catch { /* ignora */ }
    }
  }
  return null;
}

async function injectGoldbergDefinitions(appId, settingsPath) {
  try {
    // 1. Procurar o schema salvo usando o steamAppId
    const targetSchema = await getSchemaByAppIdOrGameId(`steam_${appId}`);
    if (!targetSchema || targetSchema.length === 0) return;

    // 2. Gerar steam_settings/achievements.json
    const steamSettingsPath = path.join(settingsPath, "achievements.json");
    if (!fs.existsSync(steamSettingsPath)) {
      const goldbergSettings = targetSchema.map(ach => ({
        name: ach.id, // O ID técnico do Steam que o jogo requisitará
        hidden: false,
        icon: "",
        icon_gray: "",
        display_name: { english: ach.name },
        description: { english: ach.description || "" }
      }));
      await fs.promises.writeFile(steamSettingsPath, JSON.stringify(goldbergSettings, null, 4), "utf8");
      console.info(`[goldberg-injector] Arquivo steam_settings/achievements.json criado para o AppID ${appId}.`);
    }

    // 3. Inicializar progresso vazio no AppData
    const paths = getGoldbergV1Paths(appId);
    if (!fs.existsSync(paths.watchDir)) {
      await fs.promises.mkdir(paths.watchDir, { recursive: true });
    }

    let currentSaves = {};
    if (fs.existsSync(paths.savePath)) {
      try {
        const raw = await fs.promises.readFile(paths.savePath, "utf8");
        const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
        currentSaves = JSON.parse(normalized);
      } catch (e) {
        console.error(`[goldberg-injector] Erro de parse no save atual:`, e);
      }
    }

    let modified = false;
    for (const ach of targetSchema) {
      if (!currentSaves[ach.id]) {
        currentSaves[ach.id] = { earned: false, earned_time: 0 };
        modified = true;
      }
    }

    if (modified || Object.keys(currentSaves).length === 0) {
      await fs.promises.writeFile(paths.savePath, JSON.stringify(currentSaves, null, 2), "utf8");
      console.info(`[goldberg-injector] Arquivo de progresso inicializado no AppData para o AppID ${appId}.`);
    }
  } catch (error) {
    console.error(`[goldberg-injector] Falha ao injetar conquistas:`, error);
  }
}

const parseIniSectionsForMerge = (content) => {
  const sections = new Map();
  let currentSection = "";
  sections.set(currentSection, new Map());

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!sections.has(currentSection)) sections.set(currentSection, new Map());
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) sections.get(currentSection).set(key, value);
  }

  return sections;
};

const serializeIniSections = (sections) => {
  const chunks = [];
  for (const [sectionName, values] of sections.entries()) {
    if (!sectionName) continue;

    chunks.push(`[${sectionName}]`);
    for (const [key, value] of values.entries()) {
      chunks.push(`${key}=${value}`);
    }
    chunks.push("");
  }

  return chunks.join("\n").trimEnd() + "\n";
};

async function injectGenericIniDefinitions(appId, savePath) {
  try {
    if (!appId || !savePath) return;

    const fileName = path.basename(savePath).toLowerCase();
    if (!fileName.includes("achiev")) return;

    const targetSchema = await getSchemaByAppIdOrGameId(`steam_${appId}`);
    if (!targetSchema || targetSchema.length === 0) return;

    let currentContent = "";
    if (fs.existsSync(savePath)) {
      currentContent = await fs.promises.readFile(savePath, "utf8");
    }

    const sections = parseIniSectionsForMerge(currentContent);
    const existingAchievements = sections.get("Achievements") || new Map();
    const existingSteamAchievements = sections.get("SteamAchievements") || new Map();
    const achievedIds = new Set();

    for (const [key, value] of existingAchievements.entries()) {
      if (!key || key.toLowerCase() === "count") continue;
      const normalizedValue = String(value || "").trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalizedValue)) {
        achievedIds.add(key);
      }
    }

    for (const [sectionName, values] of sections.entries()) {
      if (!sectionName || sectionName === "Achievements" || sectionName === "SteamAchievements") continue;
      for (const [key, value] of values.entries()) {
        if (key.toLowerCase() !== "achieved") continue;
        const normalizedValue = String(value || "").trim().toLowerCase();
        if (["1", "true", "yes", "on"].includes(normalizedValue)) {
          achievedIds.add(sectionName);
        }
      }
    }

    for (const [key, value] of existingSteamAchievements.entries()) {
      if (!/^Achievement\d+$/i.test(key)) continue;
      const normalizedId = String(value || "").trim();
      if (normalizedId) achievedIds.add(normalizedId);
    }

    const achievementIds = targetSchema
      .map((achievement) => String(achievement?.apiName || achievement?.id || "").trim())
      .filter(Boolean);
    if (achievementIds.length === 0) return;

    const achievements = new Map();
    achievements.set("Count", String(achievementIds.length));
    for (const id of achievementIds) {
      achievements.set(id, achievedIds.has(id) ? "1" : "0");
    }

    const nextSections = new Map([["Achievements", achievements]]);
    const nextContent = serializeIniSections(nextSections);
    if (currentContent.trim() !== nextContent.trim()) {
      await fs.promises.mkdir(path.dirname(savePath), { recursive: true });
      await fs.promises.writeFile(savePath, nextContent, "utf8");
      console.info(`[generic-ini-injector] Arquivo de conquistas inicializado para o AppID ${appId}: ${savePath}`);
    }
  } catch (error) {
    console.error(`[generic-ini-injector] Falha ao inicializar conquistas:`, error);
  }
}

registerSecureIpcHandler("launcher:get-displays", async () => screen.getAllDisplays().map((display, index) => ({
  id: display.id,
  label: `Monitor ${index + 1}`,
  primary: display.id === screen.getPrimaryDisplay().id,
  width: display.bounds.width,
  height: display.bounds.height,
})));

registerSecureIpcHandler("launcher:select-executable", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Selecione o executável ou ROM do jogo",
    properties: ["openFile"],
    buttonLabel: "Selecionar jogo / ROM",
    filters: [
      { name: "Executáveis e ROMs", extensions: ["exe", "iso", "bin", "chd", "cue", "sfc", "nes", "z64", "n64", "elf", "gcm", "wbfs", "xbe", "bat", "cmd", "lnk"] },
      { name: "Todos os Arquivos", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selectedPath = path.normalize(result.filePaths[0]);
  if (!path.isAbsolute(selectedPath)) {
    throw new Error("Selecione um caminho de arquivo válido.");
  }
  return selectedPath;
});



registerSecureIpcHandler("media:get-local-game-screenshots", async (_event, request) => {
  const { title, launcherType, steamAppId } = request;
  let results = [];

  // 1. Get from Hub captures
  try {
    const hubDir = captureDirectory();
    const safeTitle = String(title || "Desktop")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70) || "Desktop";
    const gameDir = path.join(hubDir, safeTitle);

    let allFiles = [];
    if (fs.existsSync(hubDir)) {
      const files = await fs.promises.readdir(hubDir);
      allFiles.push(...files.filter(f => f.startsWith(safeTitle) && /\.(png|jpe?g)$/i.test(f)).map(f => path.join(hubDir, f)));
    }
    if (fs.existsSync(gameDir)) {
      const files = await fs.promises.readdir(gameDir);
      allFiles.push(...files.filter(f => /\.(png|jpe?g)$/i.test(f)).map(f => path.join(gameDir, f)));
    }

    for (const filePath of allFiles) {
      const stat = await fs.promises.stat(filePath);
      results.push({
        url: `cp-media://local/${encodeURI(filePath.replace(/\\/g, "/"))}`,
        createdAt: stat.mtimeMs,
        source: 'hub'
      });
    }
  } catch (err) {
    console.warn("Failed to read hub screenshots", err);
  }

  // 2. Get from Steam if applicable
  if (launcherType === "steam" && steamAppId) {
    try {
      const mainSteamPath = "C:\\Program Files (x86)\\Steam";
      const userdataDir = path.join(mainSteamPath, "userdata");
      if (fs.existsSync(userdataDir)) {
        const userDirs = await fs.promises.readdir(userdataDir);
        for (const uid of userDirs) {
          const screenshotsDir = path.join(userdataDir, uid, "760", "remote", String(steamAppId), "screenshots");
          if (fs.existsSync(screenshotsDir)) {
            const files = await fs.promises.readdir(screenshotsDir);
            const imageFiles = files.filter(f => /\.(png|jpe?g)$/i.test(f) && !f.includes("_vr"));
            for (const f of imageFiles) {
              const filePath = path.join(screenshotsDir, f);
              const stat = await fs.promises.stat(filePath);
              results.push({
                url: `cp-media://local/${encodeURI(filePath.replace(/\\/g, "/"))}`,
                createdAt: stat.mtimeMs,
                source: 'steam'
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("Failed to read steam screenshots", err);
    }
  }

  results.sort((a, b) => b.createdAt - a.createdAt);
  return results.map(r => r.url);
});

registerSecureIpcHandler("media:get-screen-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
  }));
});

let pttShortcut = null;

const unregisterPtt = () => {
  if (pttShortcut) {
    try { globalShortcut.unregister(pttShortcut); } catch { }
    pttShortcut = null;
  }
};

ipcMain.handle("ptt:register", (_event, accelerator) => {
  unregisterPtt();
  if (!accelerator) return false;
  try {
    const ok = globalShortcut.register(accelerator, () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("ptt:press");
      }
    });
    if (ok) pttShortcut = accelerator;
    return ok;
  } catch {
    return false;
  }
});

ipcMain.handle("ptt:unregister", () => {
  unregisterPtt();
  return true;
});

// PTT key-up detection via renderer keyup (for non-modifier keys)
ipcMain.on("ptt:release", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ptt:release");
  }
});

registerSecureIpcHandler("mods:select-game-directory", async (_event, gameTitle) =>
  selectModGameDirectory({
    dialog,
    parentWindow: mainWindow,
    gameTitle,
  }));

const epicStoreSearchCache = new Map();
const epicStoreDetailsCache = new Map();
let epicStoreSearchWindow = null;
let epicStoreReadyPromise = null;
let epicStoreIdleTimer = null;

const scheduleEpicStoreWindowShutdown = () => {
  if (epicStoreIdleTimer) clearTimeout(epicStoreIdleTimer);
  epicStoreIdleTimer = setTimeout(() => {
    epicStoreIdleTimer = null;
    if (epicStoreSearchWindow && !epicStoreSearchWindow.isDestroyed()) {
      epicStoreSearchWindow.destroy();
    }
  }, 15_000);
  epicStoreIdleTimer.unref?.();
};

const ensureEpicStoreSearchWindow = async () => {
  if (epicStoreIdleTimer) clearTimeout(epicStoreIdleTimer);
  epicStoreIdleTimer = null;
  if (
    epicStoreSearchWindow
    && !epicStoreSearchWindow.isDestroyed()
    && epicStoreReadyPromise
  ) {
    await epicStoreReadyPromise;
    return epicStoreSearchWindow;
  }

  const searchWindow = new BrowserWindow({
    show: false,
    width: 1100,
    height: 800,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false,
      partition: "persist:epic-store-search",
    },
  });
  epicStoreSearchWindow = searchWindow;
  searchWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  searchWindow.on("closed", () => {
    if (epicStoreSearchWindow === searchWindow) {
      epicStoreSearchWindow = null;
      epicStoreReadyPromise = null;
      if (epicStoreIdleTimer) {
        clearTimeout(epicStoreIdleTimer);
        epicStoreIdleTimer = null;
      }
    }
  });
  try {
    epicStoreReadyPromise = searchWindow.loadURL(
      "https://store.epicgames.com/pt-BR/browse?sortBy=relevancy&sortDir=DESC&count=12",
    );
    await epicStoreReadyPromise;
  } catch (error) {
    if (!searchWindow.isDestroyed()) searchWindow.destroy();
    epicStoreSearchWindow = null;
    epicStoreReadyPromise = null;
    throw error;
  }
  return searchWindow;
};

const searchEpicGamesStore = async (rawQuery) => {
  const searchQuery = String(rawQuery || "").trim().slice(0, 100);
  if (searchQuery.length < 2) return [];
  const cacheKey = searchQuery.toLocaleLowerCase("pt-BR");
  const cached = epicStoreSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 5 * 60 * 1_000) return cached.items;

  const searchWindow = await ensureEpicStoreSearchWindow();
  const graphqlBody = JSON.stringify({
    query: EPIC_STORE_GRAPHQL_QUERY,
    variables: {
      keywords: searchQuery,
      locale: "pt-BR",
      country: "BR",
      count: 12,
      start: 0,
    },
  });
  const graphqlResult = await searchWindow.webContents.executeJavaScript(`(async () => {
    const response = await fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: ${JSON.stringify(graphqlBody)}
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: await response.json().catch(() => ({}))
    };
  })()`, true).catch(() => ({ ok: false, status: 0, payload: null }));

  const graphqlElements =
    graphqlResult?.payload?.data?.Catalog?.searchStore?.elements;
  const graphqlAvailable = graphqlResult?.ok && Array.isArray(graphqlElements);
  let items = graphqlAvailable
    ? normalizeEpicGraphqlElements(graphqlElements, readInstalledEpicGames())
    : [];

  if (!graphqlAvailable) {
    const targetUrl = new URL("https://store.epicgames.com/pt-BR/browse");
    targetUrl.searchParams.set("q", searchQuery);
    targetUrl.searchParams.set("sortBy", "relevancy");
    targetUrl.searchParams.set("sortDir", "DESC");
    targetUrl.searchParams.set("count", "12");
    await searchWindow.loadURL(targetUrl.toString());
    const deadline = Date.now() + 15_000;
    let cards = [];
    while (Date.now() < deadline && cards.length === 0 && !searchWindow.isDestroyed()) {
      cards = await searchWindow.webContents
        .executeJavaScript(EPIC_STORE_CARD_EXTRACTOR, true)
        .catch(() => []);
      if (cards.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    items = normalizeEpicStoreCards(cards, readInstalledEpicGames());
  }

  items = items.slice(0, 12);
  epicStoreSearchCache.set(cacheKey, { createdAt: Date.now(), items });
  if (epicStoreSearchCache.size > 50) {
    epicStoreSearchCache.delete(epicStoreSearchCache.keys().next().value);
  }
  scheduleEpicStoreWindowShutdown();
  return items;
};

registerSecureIpcHandler("launcher:open-epic-login-window", async () => {
  return new Promise((resolve) => {
    let resolved = false;
    const authWindow = new BrowserWindow({
      width: 580,
      height: 720,
      show: false,
      autoHideMenuBar: true,
      title: "Checkpoint - Conectar Epic Games",
      backgroundColor: "#0a0b10",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    const EPIC_OAUTH_URL = "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode";

    authWindow.loadURL(EPIC_OAUTH_URL);

    authWindow.once('ready-to-show', () => {
      authWindow.show();
    });

    authWindow.webContents.on('did-finish-load', async () => {
      const url = authWindow.webContents.getURL();
      if (url.startsWith('https://www.epicgames.com/id/api/redirect')) {
        try {
          const jsonText = await authWindow.webContents.executeJavaScript('document.body ? document.body.innerText : ""');
          let data = null;
          try {
            data = JSON.parse(jsonText);
          } catch {
            data = null;
          }

          if (data && (data.authorizationCode || data.sid)) {
            const authCode = String(data.authorizationCode || data.sid);
            await authWindow.webContents.executeJavaScript(`
              document.head.innerHTML = \`
                <title>Checkpoint - Epic Games Conectada</title>
                <style>
                  body {
                    margin: 0;
                    padding: 0;
                    background: radial-gradient(circle at top, #141724 0%, #07080c 100%);
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    overflow: hidden;
                    user-select: none;
                  }
                  .card {
                    background: rgba(255, 255, 255, 0.035);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 28px;
                    padding: 36px 28px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    max-width: 420px;
                    width: 90%;
                    box-shadow: 0 24px 70px rgba(0,0,0,0.8);
                    backdrop-filter: blur(20px);
                  }
                  .badge {
                    width: 56px;
                    height: 56px;
                    border-radius: 18px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 18px;
                    box-shadow: 0 0 28px rgba(16, 185, 129, 0.4);
                  }
                  .check-icon {
                    width: 28px;
                    height: 28px;
                    stroke: white;
                    stroke-width: 2.5;
                    fill: none;
                  }
                  h1 { font-size: 20px; font-weight: 800; margin: 0 0 6px 0; letter-spacing: -0.02em; }
                  p { font-size: 13px; color: rgba(255, 255, 255, 0.55); margin: 0 0 20px 0; line-height: 1.5; }
                  .code-container {
                    width: 100%;
                    box-sizing: border-box;
                    background: rgba(0, 0, 0, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 14px;
                    padding: 12px 14px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    margin-bottom: 20px;
                  }
                  .code-text {
                    font-family: monospace;
                    font-size: 13px;
                    color: #38bdf8;
                    letter-spacing: 0.05em;
                    word-break: break-all;
                    text-align: left;
                  }
                  .copy-btn {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    color: #fff;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 6px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: all 0.2s;
                  }
                  .copy-btn:hover {
                    background: #fff;
                    color: #000;
                  }
                  .status-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #34d399;
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.2);
                    padding: 4px 12px;
                    border-radius: 20px;
                  }
                  .spinner-mini {
                    width: 10px;
                    height: 10px;
                    border: 2px solid rgba(52, 211, 153, 0.3);
                    border-top-color: #34d399;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                  }
                  @keyframes spin { to { transform: rotate(360deg); } }
                </style>
              \`;
              document.body.innerHTML = \`
                <div class="card">
                  <div class="badge">
                    <svg class="check-icon" viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                  <h1>Conta Epic Games Conectada!</h1>
                  <p>Seu código de autorização foi gerado e validado com sucesso.</p>
                  <div class="code-container">
                    <span class="code-text" id="auth-code">\${authCode}</span>
                    <button class="copy-btn" id="copy-btn" type="button">Copiar</button>
                  </div>
                  <div class="status-pill">
                    <div class="spinner-mini"></div>
                    Sincronizando com o Launcher...
                  </div>
                </div>
              \`;
              document.getElementById('copy-btn')?.addEventListener('click', () => {
                navigator.clipboard.writeText('\${authCode}');
                const btn = document.getElementById('copy-btn');
                if (btn) btn.innerText = 'Copiado!';
              });
            `).catch(() => undefined);

            if (!resolved) {
              resolved = true;
              setTimeout(() => {
                try {
                  authWindow.close();
                } catch { }
                resolve(authCode);
              }, 1200);
            }
            return;
          } else if (data && (data.errorCode || data.message)) {
            await authWindow.webContents.executeJavaScript(`
              document.head.innerHTML = \`
                <style>
                  body {
                    margin: 0;
                    padding: 0;
                    background: radial-gradient(circle at top, #1c1316 0%, #08090d 100%);
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    overflow: hidden;
                  }
                  .card {
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    border-radius: 24px;
                    padding: 40px 32px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    max-width: 360px;
                  }
                  .badge {
                    width: 52px;
                    height: 52px;
                    border-radius: 16px;
                    background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 20px;
                    font-size: 24px;
                    box-shadow: 0 0 24px rgba(239, 68, 68, 0.4);
                  }
                  h1 { font-size: 18px; font-weight: 700; margin: 0 0 8px 0; }
                  p { font-size: 13px; color: rgba(255, 255, 255, 0.7); margin: 0; }
                </style>
              \`;
              document.body.innerHTML = \`
                <div class="card">
                  <div class="badge">✕</div>
                  <h1>Falha na Autenticação</h1>
                  <p>\${${JSON.stringify(data.message || "Erro desconhecido ao autenticar.")}}</p>
                </div>
              \`;
            `).catch(() => undefined);
          }
        } catch (e) {
          console.error("Failed to parse Epic login JSON:", e);
        }
      }
    });

    authWindow.on('closed', () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
});

let legendaryManager = null;
let epicAccount = null;
let epicSession = null;
let epicMigrationDone = false;

const ensureEpicMigration = async () => {
  if (epicMigrationDone) return;
  epicMigrationDone = true;
  try {
    const result = await migrateEpicAccountMetadata({
      userDataPath: app.getPath("userData"),
    });
    if (result.migrated) {
      console.info(
        `[epic-session] migrated account metadata for ${result.accountId} from ${result.source}`,
      );
    }
  } catch (err) {
    console.warn(`[epic-session] migration failed: ${err.message}`);
  }
};

const getEpicAccount = () => {
  if (!epicAccount) {
    if (!legendaryManager) {
      legendaryManager = createLegendaryManager({
        userDataPath: app.getPath("userData"),
      });
    }
    epicAccount = createEpicAccount({
      legendary: legendaryManager,
      emitProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("epic:progress", progress);
        }
      },
    });
  }
  return epicAccount;
};

const getEpicSession = async () => {
  await ensureEpicMigration();
  if (!epicSession) {
    const vault = createEpicCredentialVault({
      userDataPath: app.getPath("userData"),
    });
    if (!legendaryManager) {
      legendaryManager = createLegendaryManager({
        userDataPath: app.getPath("userData"),
      });
    }
    epicSession = createEpicSession({
      vault,
      legendary: legendaryManager,
      logger: console,
    });
  }
  return epicSession;
};

registerSecureIpcHandler("epic:get-status", () => getEpicAccount().getStatus());
registerSecureIpcHandler("epic:authenticate", (_event, request) => getEpicAccount().authenticate(request));
registerSecureIpcHandler("epic:list-library", () => getEpicAccount().listLibrary());
registerSecureIpcHandler("epic:get-achievements", (_event, request) => getEpicAccount().getAchievements(request));
registerSecureIpcHandler("epic:logout", async () => {
  try {
    const session = await getEpicSession();
    if (session && typeof session.clear === "function") {
      await session.clear();
    }
  } catch (err) {
    console.warn("[epic-logout] error clearing session:", err);
  }
  return getEpicAccount().logout();
});
registerSecureIpcHandler("epic:validate-session", async () => {
  const session = await getEpicSession();
  return session.validate();
});

registerSecureIpcHandler("library:purge-platform", async (_event, uid, platform) => {
  const result = getLocalGameLibrary().purgePlatform(uid, platform);
  const cleanupRes = await cleanupPlatformAchievementFiles({
    userDataPath: app.getPath("userData"),
    steamAppIds: result.steamAppIds,
    epicCatalogIds: result.epicCatalogIds,
    platform,
  });
  return {
    ...result,
    deletedFiles: cleanupRes.deletedFiles,
  };
});

registerSecureIpcHandler("library:get-platform-cleanup", (_event, uid, platform) =>
  getLocalGameLibrary().getPlatformCleanup(uid, platform));

registerSecureIpcHandler("library:set-platform-cleanup-phase", (_event, uid, platform, operationId, phase) =>
  getLocalGameLibrary().setPlatformCleanupPhase(uid, platform, operationId, phase));

registerSecureIpcHandler("library:complete-platform-cleanup", (_event, uid, platform, operationId) =>
  getLocalGameLibrary().completePlatformCleanup(uid, platform, operationId));

registerSecureIpcHandler("launcher:search-epic-store", async (_event, query) =>
  searchEpicGamesStore(query));

const fetchEpicGamesStoreDetails = async (rawRequest) => {
  const supportedLocales = new Set(["pt-BR", "en-US", "es-ES", "fr-FR", "de-DE", "it-IT"]);
  const locale = supportedLocales.has(rawRequest?.language) ? rawRequest.language : "pt-BR";

  let productSlug = String(rawRequest?.productSlug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/home$/i, "");

  const titleQuery = String(rawRequest?.title || rawRequest?.appName || "").trim();
  const catalogId = String(rawRequest?.catalogId || "").trim();
  const namespace = String(rawRequest?.namespace || "").trim();

  let searchFallbackItem = null;
  if (!productSlug && titleQuery) {
    const cacheKeyByTitle = `${locale}:title:${titleQuery.toLowerCase()}`;
    const cachedByTitle = epicStoreDetailsCache.get(cacheKeyByTitle);
    if (cachedByTitle && Date.now() - cachedByTitle.createdAt < 15 * 60 * 1_000) {
      return cachedByTitle.details;
    }

    try {
      const searchResults = await searchEpicGamesStore(titleQuery);
      if (Array.isArray(searchResults) && searchResults.length > 0) {
        const normalizedQuery = titleQuery.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match =
          (catalogId ? searchResults.find((item) => item.catalogId && item.catalogId.toLowerCase() === catalogId.toLowerCase()) : null) ||
          searchResults.find((item) => {
            const normTitle = String(item.title || item.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!normTitle || !normalizedQuery) return false;
            if (normTitle === normalizedQuery) return true;
            if (normTitle.length >= 4 && normalizedQuery.length >= 4) {
              if (normTitle.startsWith(normalizedQuery) || normalizedQuery.startsWith(normTitle)) return true;
              if (normTitle.includes(normalizedQuery) && normalizedQuery.length / normTitle.length > 0.65) return true;
              if (normalizedQuery.includes(normTitle) && normTitle.length / normalizedQuery.length > 0.65) return true;
            }
            return false;
          });

        if (match) {
          searchFallbackItem = match;
          if (match.productSlug) {
            productSlug = match.productSlug;
          }
        }
      }
    } catch (searchErr) {
      console.warn("[EpicStore] Erro ao buscar produto por título:", searchErr?.message || searchErr);
    }
  }

  if (productSlug && /^[a-z0-9][a-z0-9-_.]{0,199}$/i.test(productSlug)) {
    const cacheKey = `${locale}:${productSlug.toLocaleLowerCase("en-US")}`;
    const cached = epicStoreDetailsCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < 15 * 60 * 1_000) return cached.details;

    try {
      const url = `https://store-content-ipv4.ak.epicgames.com/api/${locale}/content/products/${encodeURIComponent(productSlug)}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": `${locale},en;q=0.8`,
          Referer: `https://store.epicgames.com/${locale}/p/${productSlug}`,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const payload = await response.json();
        const details = normalizeEpicStoreDetails(
          payload,
          {
            productSlug,
            catalogId: catalogId || searchFallbackItem?.catalogId,
            namespace: namespace || searchFallbackItem?.namespace,
          },
          readInstalledEpicGames(),
        );

        if (details) {
          epicStoreDetailsCache.set(cacheKey, { createdAt: Date.now(), details });
          if (titleQuery) {
            epicStoreDetailsCache.set(`${locale}:title:${titleQuery.toLowerCase()}`, { createdAt: Date.now(), details });
          }
          if (epicStoreDetailsCache.size > 100) {
            epicStoreDetailsCache.delete(epicStoreDetailsCache.keys().next().value);
          }
          return details;
        }
      }
    } catch (contentErr) {
      console.warn("[EpicStore] Erro ao buscar endpoint de conteúdo:", contentErr?.message || contentErr);
    }
  }

  if (searchFallbackItem) {
    const cardDetails = {
      catalogId: searchFallbackItem.catalogId || catalogId,
      namespace: searchFallbackItem.namespace || namespace,
      appName: searchFallbackItem.appName || String(rawRequest?.appName || ""),
      title: searchFallbackItem.title || searchFallbackItem.name || titleQuery,
      image: searchFallbackItem.backgroundImage || searchFallbackItem.image || searchFallbackItem.cardImage || "",
      cardImage: searchFallbackItem.cardImage || searchFallbackItem.image || "",
      backgroundImage: searchFallbackItem.backgroundImage || searchFallbackItem.image || searchFallbackItem.cardImage || "",
      logoImage: "",
      description: searchFallbackItem.description || "",
      aboutTheGame: searchFallbackItem.description ? `<p>${searchFallbackItem.description}</p>` : "",
      screenshots: searchFallbackItem.backgroundImage ? [searchFallbackItem.backgroundImage] : (searchFallbackItem.cardImage ? [searchFallbackItem.cardImage] : []),
      releaseDate: "",
      developer: "",
      publisher: "",
      tags: searchFallbackItem.category ? [searchFallbackItem.category] : [],
      trailerUrl: "",
      productSlug: searchFallbackItem.productSlug || "",
      productUrl: searchFallbackItem.productUrl || (searchFallbackItem.productSlug ? `https://store.epicgames.com/p/${searchFallbackItem.productSlug}` : ""),
      epicLaunchId: searchFallbackItem.epicLaunchId || (namespace && catalogId ? `${namespace}:${catalogId}` : catalogId),
      executablePath: searchFallbackItem.executablePath || "",
      source: "epic-store",
    };
    if (titleQuery) {
      epicStoreDetailsCache.set(`${locale}:title:${titleQuery.toLowerCase()}`, { createdAt: Date.now(), details: cardDetails });
    }
    return cardDetails;
  }

  return null;
};

registerSecureIpcHandler("launcher:fetch-epic-store-details", async (_event, request) =>
  fetchEpicGamesStoreDetails(request));

registerSecureIpcHandler("system:set-open-at-login", async (_event, open) => {
  const shouldOpen = Boolean(open);

  if (process.platform === "win32") {
    app.setLoginItemSettings({ openAtLogin: false });
    app.setLoginItemSettings({
      openAtLogin: false,
      path: process.execPath,
      args: [AUTO_START_ARG],
    });

    if (shouldOpen && app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: [AUTO_START_ARG],
      });
    }

    return {
      openAtLogin: shouldOpen && app.isPackaged,
      supported: app.isPackaged,
    };
  }

  app.setLoginItemSettings({ openAtLogin: shouldOpen });
  return { openAtLogin: shouldOpen, supported: true };
});

registerSecureIpcHandler("system:set-window-behavior", (_event, requested) =>
  windowBehaviorController.setBehavior(requested));

registerSecureIpcHandler("system:request-app-quit", () =>
  windowBehaviorController.requestAppQuit());

registerSecureIpcHandler("system:confirm-app-quit", () => {
  if (quitSafetyTimer) {
    clearTimeout(quitSafetyTimer);
    quitSafetyTimer = null;
  }
  isQuittingConfirmed = true;
  sendDirectOfflineSync();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  windowBehaviorController.confirmAppQuit();
});

registerSecureIpcHandler("presence:set-session", (_event, session) => {
  activePresenceSession = session && typeof session === "object" ? session : null;
  return true;
});

registerSecureIpcHandler("window:fullscreen-toggle", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

registerSecureIpcHandler("window:fullscreen-set", (_event, flag) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setFullScreen(Boolean(flag));
  return mainWindow.isFullScreen();
});

registerSecureIpcHandler("window:fullscreen-get", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isFullScreen();
});

registerSecureIpcHandler("launcher:open-executable", async (
  _event,
  executablePath,
  rawLaunchProfile,
  rawLaunchOptions,
) => {
  const target = String(executablePath || "").trim();
  if (!target) {
    throw new Error("Caminho do executavel vazio.");
  }

  const normalizedTarget = path.normalize(target);
  if (!path.isAbsolute(normalizedTarget)) {
    throw new Error("Caminho do executavel invalido.");
  }

  if (path.extname(normalizedTarget).toLowerCase() !== ".exe") {
    throw new Error("Apenas arquivos .exe podem ser iniciados.");
  }

  let stats;
  try {
    stats = fs.statSync(normalizedTarget);
  } catch {
    throw new Error("Executavel nao encontrado.");
  }

  if (!stats.isFile()) {
    throw new Error("Executavel invalido.");
  }

  const defaultWorkingDirectory = path.dirname(normalizedTarget);
  const launchProfile = normalizeLaunchProfile(rawLaunchProfile, defaultWorkingDirectory);
  const hideLauncher = rawLaunchOptions?.hideLauncher !== false;
  if (!fs.existsSync(launchProfile.workingDirectory) || !fs.statSync(launchProfile.workingDirectory).isDirectory()) {
    launchProfile.workingDirectory = defaultWorkingDirectory;
  }
  if (launchProfile.monitorId != null && screen.getAllDisplays().some((display) => display.id === launchProfile.monitorId)) {
    overlayDisplayId = launchProfile.monitorId;
    syncOverlayBounds();
  }

  if (ENABLE_EMULATOR_FILE_INJECTION) {

    // Autoconfiguração de ponte de conquistas para emuladores Steam locais (Goldberg)
    try {
      const gameDir = path.dirname(normalizedTarget);
      const parentDir = path.dirname(gameDir);

      const pathsToCheck = [
        path.join(gameDir, "steam_settings"),
        path.join(parentDir, "steam_settings")
      ];

      const [hasDll64, hasDll32] = await Promise.all([
        fs.promises.access(path.join(gameDir, "steam_api64.dll")).then(() => true).catch(() => false),
        fs.promises.access(path.join(gameDir, "steam_api.dll")).then(() => true).catch(() => false),
      ]);
      const hasSteamDll = hasDll64 || hasDll32;

      let settingsPath = null;
      for (const p of pathsToCheck) {
        const exists = await fs.promises.access(p).then(() => true).catch(() => false);
        if (exists) { settingsPath = p; break; }
      }

      if (!settingsPath && hasSteamDll) {
        settingsPath = path.join(gameDir, "steam_settings");
        await fs.promises.mkdir(settingsPath, { recursive: true });
      }

      if (settingsPath) {
        const bridgeAddress = achievementBridge?.getAddress?.();
        const bridgePort = Number(bridgeAddress?.port || 3000);
        await fs.promises.writeFile(
          path.join(settingsPath, "achievements_receiver.txt"),
          `http://127.0.0.1:${bridgePort}`,
          "utf8",
        );

        let appId = null;
        const appidPaths = [
          path.join(gameDir, "steam_appid.txt"),
          path.join(settingsPath, "steam_appid.txt")
        ];
        for (const ap of appidPaths) {
          const content = await fs.promises.readFile(ap, "utf8").catch(() => null);
          if (content !== null && /^\d+$/.test(content.trim())) {
            appId = content.trim();
            break;
          }
        }

        if (appId) {
          // Injeta as definições das conquistas antes do jogo abrir

        }

        if (appId) {
          const achievementsDir = path.join(app.getPath("userData"), "achievements");
          let schemaAchievements = null;

          const files = await fs.promises.readdir(achievementsDir).catch(() => []);
          for (const file of files) {
            if (!file.endsWith(".json")) continue;
            const gameId = path.basename(file, ".json");
            try {
              const rawContent = await fs.promises.readFile(path.join(achievementsDir, file), "utf8");
              const parsed = JSON.parse(rawContent);
              if (
                gameId.endsWith(`_steam_${appId}`) ||
                gameId === appId ||
                String(parsed.steamAppId) === String(appId)
              ) {
                if (parsed && Array.isArray(parsed.achievements)) {
                  schemaAchievements = parsed.achievements;
                  break;
                }
              }
            } catch {
              // ignore
            }
          }

          if (schemaAchievements && schemaAchievements.length > 0) {
            const goldbergAchDir = path.join(settingsPath, "achievements");
            await fs.promises.mkdir(goldbergAchDir, { recursive: true });

            await Promise.all(
              schemaAchievements
                .map((ach) => ach.apiName || ach.id)
                .filter(Boolean)
                .map((apiName) => {
                  const achFilePath = path.join(goldbergAchDir, String(apiName).trim());
                  return fs.promises.writeFile(achFilePath, "", "utf8").catch(() => { });
                }),
            );
          }
        }
      }
    } catch (err) {
      console.error("Erro na autoconfiguração do receptor de conquistas:", err);
    }
  }

  const gameDir = path.dirname(normalizedTarget);

  let detectedGameAppId = null;
  {
    const appidCandidates = [
      path.join(gameDir, "steam_appid.txt"),
      path.join(gameDir, "steam_settings", "steam_appid.txt"),
      path.join(gameDir, "steam_emu.ini"),
      path.join(gameDir, "tenoke.ini"),
      path.join(gameDir, "ALI213.ini")
    ];
    for (const ap of appidCandidates) {
      const raw = await fs.promises.readFile(ap, "utf8").catch(() => null);
      if (raw === null) continue;
      const trimmed = raw.trim();
      if (ap.endsWith(".txt")) {
        if (/^\d+$/.test(trimmed)) { detectedGameAppId = trimmed; break; }
      } else {
        const match = trimmed.match(/AppId\s*=\s*(\d+)/i);
        if (match && match[1]) {
          detectedGameAppId = match[1];
          break;
        }
      }
    }
  }

  const watcherKey = detectedGameAppId ? `steam_${detectedGameAppId}` : path.basename(normalizedTarget, ".exe");

  stopGameProcessMonitor(watcherKey);
  stopGameWatcher(watcherKey);

  const handleAchievementFileChange = async (detectedEmulator) => {
    try {
      const newState = parseAchievementState(detectedEmulator);
      const entry = activeWatchers.get(watcherKey);
      if (!entry) return;

      const prevState = entry.lastState;
      const newlyUnlocked = [];

      for (const [id, current] of Object.entries(newState)) {
        const previous = prevState[id];
        const justUnlocked = current.earned && (!previous || !previous.earned);
        if (justUnlocked) {
          newlyUnlocked.push({ id, earnedTime: current.earnedTime });
        }
      }


      if (Object.keys(newState).length > 0) {
        entry.lastState = newState;
      }

      if (newlyUnlocked.length === 0) return;

      // Uma única entrada para persistência, metadados, dedupe, overlay e IPC.
      for (const { id } of newlyUnlocked) {
        if (!achievementBridge) continue;
        await achievementBridge.unlockAchievement(watcherKey, id);
      }
    } catch (err) {
      console.error("[achievement-watcher] Erro em handleAchievementFileChange:", err);
    }
  };

  /**
   * @param {object} detectedEmulator
   * @param {Function|null} onExit
   */
  const startGameWatcher = (detectedEmulator, onExit) => {
    if (!detectedEmulator) return;

    if (!fs.existsSync(detectedEmulator.watchDir) || !fs.existsSync(detectedEmulator.savePath)) return;

    const initialState = parseAchievementState(detectedEmulator);

    let debounceTimer = null;
    let watcher = null;
    let intervalTimer = null;

    // Se for emulador genérico (.ini como RUNE/CODEX), fs.watch falha. Usamos Polling!
    if (detectedEmulator.emulatorType === "generic_ini") {
      console.info(`[achievement-watcher] Usando Polling de 3s para o emulador INI em: ${detectedEmulator.savePath}`);
      intervalTimer = setInterval(() => {
        handleAchievementFileChange(detectedEmulator).catch(
          (err) => console.error("[achievement-watcher] Polling error:", err)
        );
      }, 3000);
    } else {
      try {
        watcher = fs.watch(detectedEmulator.watchDir, { persistent: false }, (_event, filename) => {
          const saveFile = path.basename(detectedEmulator.savePath);
          if (filename && filename !== saveFile) return;

          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            handleAchievementFileChange(detectedEmulator).catch(
              (err) => console.error("[achievement-watcher] Watch error:", err)
            );
          }, 300);

          const entry = activeWatchers.get(watcherKey);
          if (entry) entry.debounceTimer = debounceTimer;
        });
      } catch (watchErr) {
        console.error("[achievement-watcher] Falha ao iniciar fs.watch:", watchErr);
        return;
      }

      watcher.on("error", (err) => {
        console.error("[achievement-watcher] Erro no watcher:", err);
        stopGameWatcher(watcherKey);
      });
    }

    activeWatchers.set(watcherKey, {
      watcher,
      intervalTimer,
      debounceTimer: null,
      lastState: initialState,
    });

    console.info(
      `[achievement-watcher] Monitorando conquistas do jogo ${watcherKey}` +
      ` em ${detectedEmulator.watchDir}` +
      ` (emulador: ${detectedEmulator.emulatorType})`
    );

    if (onExit) {
      onExit(() => stopGameWatcher(watcherKey));
    }
  };

  const injectAchievementDefinitions = async (appId, emulator, settingsPath) => {
    if (!ENABLE_EMULATOR_FILE_INJECTION) return;
    if (!appId) return;
    if (emulator?.emulatorType === "generic_ini") {
      await injectGenericIniDefinitions(appId, emulator.savePath);
    } else if (settingsPath) {
      await injectGoldbergDefinitions(appId, settingsPath);
    }
  };

  let detectedEmulator = detectedGameAppId
    ? detectEmulator(gameDir, detectedGameAppId)
    : null;

  if (detectedEmulator && achievementBridge) {
    const aliases = getAchievementAliases(detectedEmulator);
    const migration = await achievementBridge.migrateAchievementAliases(watcherKey, aliases);
    if (migration.migrated > 0) {
      console.info(`[achievement-migration] ${migration.migrated} IDs legados migrados em ${watcherKey}.`);
    }
  }

  // Resolve o settingsPath novamente (já foi calculado acima no bloco de autoconfig)
  const _settingsPathForInject = (() => {
    const candidates = [
      path.join(gameDir, "steam_settings"),
      path.join(path.dirname(gameDir), "steam_settings"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  })();

  await injectAchievementDefinitions(detectedGameAppId, detectedEmulator, _settingsPathForInject);

  // A baseline lets the monitor distinguish a process started by this launch
  // from another executable that was already open in the same directory.
  const launchProcessBaseline = await getRunningProcesses({ forceRefresh: true }).catch(() => []);

  try {
    const child = spawn(normalizedTarget, launchProfile.arguments, {
      cwd: launchProfile.workingDirectory,
      detached: true,
      stdio: "ignore",
    });

    // A sessao passa a ser acompanhada pelo executavel real depois do spawn.
    child.once("spawn", () => {
      if (launchProfile.monitorId == null) selectOverlayDisplayFromLauncher();
      try {
        const priority = launchProfile.processPriority === "high"
          ? (os.constants?.priority?.PRIORITY_HIGH ?? -14)
          : launchProfile.processPriority === "above-normal"
            ? (os.constants?.priority?.PRIORITY_ABOVE_NORMAL ?? -7)
            : (os.constants?.priority?.PRIORITY_NORMAL ?? 0);
        os.setPriority(child.pid, priority);
      } catch (error) {
        console.warn("[launcher] Nao foi possivel aplicar prioridade ao processo:", error);
      }
      applyWindowProfile(normalizedTarget, launchProfile);
      startGameProcessMonitor(watcherKey, normalizedTarget, {
        rootPid: child.pid,
        baselineProcesses: launchProcessBaseline,
        restoreLauncher: hideLauncher,
      });
      if (hideLauncher && mainWindow) {
        mainWindow.hide();
      }
    });

    // O watcher nao depende do evento de saida do processo retornado por spawn:
    // launchers intermediarios podem encerrar antes do executavel real do jogo.
    if (detectedEmulator) {
      startGameWatcher(detectedEmulator, null);
    } else if (detectedGameAppId) {
      // ── Re-scan loop: emuladores como RUNE/CODEX criam o arquivo de save ──────
      // somente APÓS o jogo inicializar (2-5s de delay típico). Tentamos
      // re-detectar a cada 3s por até 30s antes de desistir.
      console.info(`[achievement-watcher] Emulador não encontrado imediatamente para appId ${detectedGameAppId}. Iniciando re-scan por 30s...`);
      const RESCAN_INTERVAL_MS = 3000;
      const RESCAN_MAX_ATTEMPTS = 10; // 10 * 3s = 30s
      let rescanAttempt = 0;
      const rescanTimer = setInterval(() => {
        rescanAttempt++;
        const found = detectEmulator(gameDir, detectedGameAppId);
        if (found) {
          clearInterval(rescanTimer);
          activeRescanTimers.delete(watcherKey);
          console.info(`[achievement-watcher] Emulador encontrado após ${rescanAttempt * RESCAN_INTERVAL_MS / 1000}s: ${found.emulatorType}`);
          // Injeta definições agora que o arquivo de save foi criado
          injectAchievementDefinitions(detectedGameAppId, found, _settingsPathForInject).catch(() => { });
          const aliases = getAchievementAliases(found);
          achievementBridge?.migrateAchievementAliases(watcherKey, aliases).catch(
            (error) => console.error("[achievement-migration] Falha:", error),
          );
          startGameWatcher(found, null);
        } else if (rescanAttempt >= RESCAN_MAX_ATTEMPTS) {
          clearInterval(rescanTimer);
          activeRescanTimers.delete(watcherKey);
          console.warn(`[achievement-watcher] Re-scan encerrado: nenhum emulador encontrado para appId ${detectedGameAppId} após 30s.`);
        }
      }, RESCAN_INTERVAL_MS);
      activeRescanTimers.set(watcherKey, rescanTimer);
    }

    child.on("error", async (err) => {
      console.error("Falha ao iniciar via spawn (child_process), tentando shell.openPath:", err);
      // NÃO paramos o watcher aqui: shell.openPath vai abrir o jogo com as
      // permissões corretas (UAC/admin) e o watcher deve continuar monitorando.
      // Só paramos se shell.openPath também falhar.
      const openError = await shell.openPath(normalizedTarget);
      if (openError) {
        console.error("Falha ao iniciar pelo shell.openPath:", openError);
        // Ambos os métodos falharam: o jogo não iniciou, encerra o watcher.
        stopGameWatcher(watcherKey);
      } else {
        console.info("[achievement-watcher] Jogo aberto via shell.openPath — watcher mantido ativo.");
        if (launchProfile.monitorId == null) selectOverlayDisplayFromLauncher();
        applyWindowProfile(normalizedTarget, launchProfile);
        startGameProcessMonitor(watcherKey, normalizedTarget, {
          baselineProcesses: launchProcessBaseline,
          restoreLauncher: hideLauncher,
        });
        if (hideLauncher && mainWindow) mainWindow.hide();
      }
    });

    child.unref();
  } catch (spawnError) {
    console.error("Falha síncrona ao iniciar via spawn, tentando shell.openPath:", spawnError);
    // Na exceção síncrona do spawn também tentamos shell.openPath antes de desistir.
    const openError = await shell.openPath(normalizedTarget);
    if (openError) {
      stopGameWatcher(watcherKey);
      throw new Error(openError);
    } else {
      console.info("[achievement-watcher] Jogo aberto via shell.openPath (fallback síncrono) — watcher mantido ativo.");
      if (launchProfile.monitorId == null) selectOverlayDisplayFromLauncher();
      applyWindowProfile(normalizedTarget, launchProfile);
      startGameProcessMonitor(watcherKey, normalizedTarget, {
        baselineProcesses: launchProcessBaseline,
        restoreLauncher: hideLauncher,
      });
      if (hideLauncher && mainWindow) mainWindow.hide();
    }
  }
});

// ─── Cache de processos em execução (TTL 1.5s) ─────────────────────────────────────────
let _processListCache = { names: new Set(), expiresAt: 0 };

const getRunningProcessNames = async () => {
  if (Date.now() < _processListCache.expiresAt) {
    return _processListCache.names;
  }

  const output = await new Promise((resolve, reject) => {
    execFile("tasklist", ["/fo", "csv", "/nh"], { windowsHide: true }, (error, stdout = "") => {
      if (error) { reject(error); return; }
      resolve(stdout);
    });
  }).catch(() => "");

  const names = parseTasklistProcessNames(output);

  _processListCache = { names, expiresAt: Date.now() + 1500 };
  return names;
};

let _processSnapshotCache = { processes: [], expiresAt: 0, pending: null };
let _wmicAvailability = "unknown";
let _processSnapshotFallbackLogged = false;

const getRunningProcesses = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && Date.now() < _processSnapshotCache.expiresAt) {
    return _processSnapshotCache.processes;
  }
  if (_processSnapshotCache.pending) return _processSnapshotCache.pending;

  const pending = new Promise((resolve, reject) => {
    execFile(
      "wmic.exe",
      ["process", "get", "ProcessId,ParentProcessId,Name,ExecutablePath", "/FORMAT:CSV"],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout = "") => {
        if (error) {
          if (error.code === "ENOENT") _wmicAvailability = "unavailable";
          reject(error);
          return;
        }

        try {
          const lines = stdout.split(/\r?\n/).filter((line) => line.trim());
          const processes = [];

          if (lines.length > 1) {
            const header = lines[0].split(",");
            const pathIdx = header.findIndex((h) => h.toLowerCase().includes("executablepath"));
            const nameIdx = header.findIndex((h) => h.toLowerCase().includes("name"));
            const parentIdx = header.findIndex((h) => h.toLowerCase().includes("parentprocessid"));
            const pidIdx = header.findIndex((h) => h.toLowerCase().includes("processid"));

            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(",");
              if (cols.length < header.length) continue;

              const pid = parseInt(cols[pidIdx], 10);
              const parentPid = parseInt(cols[parentIdx], 10);
              const name = (cols[nameIdx] || "").trim().toLowerCase();
              const execPath = (cols[pathIdx] || "").trim();

              if (pid > 0 && name) {
                processes.push({
                  pid,
                  parentPid: Number.isInteger(parentPid) ? parentPid : 0,
                  name,
                  executablePath: execPath ? path.normalize(execPath).toLowerCase() : "",
                });
              }
            }
          }
          _wmicAvailability = "available";
          resolve(processes);
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });

  _processSnapshotCache.pending = pending;
  try {
    const processes = await pending;
    _processSnapshotCache = {
      processes,
      expiresAt: Date.now() + 2500,
      pending: null,
    };
    return processes;
  } catch (error) {
    _processSnapshotCache.pending = null;
    throw error;
  }
};

const getProcessSnapshotWithFallback = async ({ forceRefresh = false } = {}) => {
  const getFallbackSnapshot = async () => {
    const runningNames = await getRunningProcessNames().catch(() => new Set());
    return Array.from(runningNames, (name) => ({
      pid: 0,
      parentPid: 0,
      name,
      executablePath: "",
    }));
  };

  // WMIC foi removido das versoes atuais do Windows. Depois do primeiro ENOENT,
  // nao tentamos mais criar um processo que sabemos nao existir.
  if (_wmicAvailability === "unavailable") return getFallbackSnapshot();

  try {
    return await getRunningProcesses({ forceRefresh });
  } catch (error) {
    if (!_processSnapshotFallbackLogged) {
      _processSnapshotFallbackLogged = true;
      console.info("[launcher] WMIC indisponivel; monitoramento usando tasklist nesta sessao.");
    }
    return getFallbackSnapshot();
  }
};

const stopGameProcessMonitor = (watcherKey) => {
  const monitor = activeGameMonitors.get(watcherKey);
  if (monitor) {
    clearInterval(monitor.timer);
    activeGameMonitors.delete(watcherKey);
  }
  const rescanTimer = activeRescanTimers.get(watcherKey);
  if (rescanTimer) {
    clearInterval(rescanTimer);
    activeRescanTimers.delete(watcherKey);
  }
};

const runFocusOptimizer = (action) => {
  try {
    const { execFile } = require("node:child_process");
    const scriptPath = path.join(__dirname, "scripts", "focus-optimizer.ps1");
    const processes = ["chrome", "msedge", "Spotify", "Discord", "ms-teams", "slack"];
    execFile("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", scriptPath,
      "-Action", action,
      "-ProcessNames", processes.join(",")
    ], (err) => {
      if (err) console.error(`[focus-optimizer] Error running ${action}:`, err);
      else console.info(`[focus-optimizer] ${action} executed.`);
    });
  } catch (e) { }
};

const finishMonitoredGameSession = (watcherKey) => {
  const restoreLauncher = activeGameMonitors.get(watcherKey)?.restoreLauncher === true;
  stopGameProcessMonitor(watcherKey);
  stopGameWatcher(watcherKey);
  runFocusOptimizer("resume");
  if (restoreLauncher && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
};

const runGameMacros = (gameId) => {
  try {
    const { execFile } = require("node:child_process");
    const fs = require("node:fs");
    const scriptsDir = path.join(app.getPath("userData"), "scripts");
    const macroPath = path.join(scriptsDir, `${gameId}.ps1`);
    if (fs.existsSync(macroPath)) {
      execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", macroPath], (err) => {
        if (err) console.error(`[macros] Error running macro for ${gameId}:`, err);
        else console.info(`[macros] Macro executed for ${gameId}.`);
      });
    }
  } catch (e) { }
};

const startGameProcessMonitor = (watcherKey, executablePath, options = {}) => {
  runFocusOptimizer("suspend");
  runGameMacros(watcherKey);
  const existingMonitor = activeGameMonitors.get(watcherKey);
  if (existingMonitor) {
    clearInterval(existingMonitor.timer);
    activeGameMonitors.delete(watcherKey);
  }
  const tracker = createGameProcessTracker({
    targetPath: executablePath,
    rootPid: options.rootPid,
    baselineProcesses: options.baselineProcesses || [],
    startedAt: Date.now(),
  });
  const monitor = {
    timer: null,
    checking: false,
    requestedExecutablePath: normalizeWindowsPath(executablePath),
    activeExecutablePath: normalizeWindowsPath(executablePath),
    lastStatus: "starting",
    restoreLauncher: options.restoreLauncher === true,
    tracker,
  };

  const check = async () => {
    if (monitor.checking) return;
    monitor.checking = true;
    try {
      const processes = await getProcessSnapshotWithFallback({ forceRefresh: true });
      const previousActivePath = monitor.activeExecutablePath;
      const result = tracker.observe(processes, Date.now());
      monitor.lastStatus = result.status;
      monitor.activeExecutablePath = result.activeExecutablePath;

      if (result.adopted && previousActivePath !== result.activeExecutablePath) {
        console.info(
          `[launcher] Processo real adotado para ${watcherKey}: ${result.activeExecutablePath}`,
        );
      }
      if (result.status === "finished") finishMonitoredGameSession(watcherKey);
    } finally {
      monitor.checking = false;
    }
  };

  monitor.timer = setInterval(() => void check(), 3000);
  activeGameMonitors.set(watcherKey, monitor);
  void check();
};

const isManagedExecutableActive = (executablePath) => {
  const normalizedTarget = normalizeWindowsPath(executablePath);
  if (!normalizedTarget) return false;
  return Array.from(activeGameMonitors.values()).some((monitor) => (
    monitor.requestedExecutablePath === normalizedTarget
    && monitor.lastStatus !== "finished"
  ));
};

registerSecureIpcHandler("launcher:is-executable-running", async (_event, executablePath) => {
  const target = String(executablePath || "").trim();
  if (!target) return false;

  const normalizedTarget = path.normalize(target);
  const executableName = path.basename(normalizedTarget);
  if (!executableName || path.extname(executableName).toLowerCase() !== ".exe") return false;

  // The configured launcher may have exited after spawning the real game.
  // Keep renderer presence qualified while the managed replacement is alive.
  if (isManagedExecutableActive(normalizedTarget)) return true;

  const runningNames = await getRunningProcessNames().catch(() => new Set());
  return runningNames.has(executableName.toLowerCase());
});

registerSecureIpcHandler("launcher:detect-running-games", async (_event, executablePaths) => {
  const normalizedTargets = Array.isArray(executablePaths)
    ? executablePaths
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => path.normalize(value))
      .filter((value) => path.isAbsolute(value) && path.extname(value).toLowerCase() === ".exe")
    : [];

  if (normalizedTargets.length === 0) return [];

  const runningNames = await getRunningProcessNames().catch(() => new Set());
  return normalizedTargets.filter((target) => (
    isManagedExecutableActive(target)
    || runningNames.has(path.basename(target).toLowerCase())
  ));
});

registerSecureIpcHandler("auth:start-google-browser", async () => {
  const state = crypto.randomUUID();
  const authUrl = new URL("/auth/google/start", APP_URL);
  authUrl.searchParams.set("state", state);
  await shell.openExternal(authUrl.toString());
  return { state };
});

registerSecureIpcHandler("auth:start-linked-account-browser", async (_event, request) => {
  const provider = String(request?.provider || "").trim().toLowerCase();
  const accessToken = String(request?.accessToken || "").trim();
  const openBrowser = request?.openBrowser !== false;
  const pathname = AUTH_PROVIDER_START_PATHS[provider];

  if (!pathname) {
    throw new Error("Provedor de autenticacao invalido.");
  }
  if (!accessToken || accessToken.length > 8192 || /[\r\n]/.test(accessToken)) {
    throw new Error("Sessao do usuario ausente ou invalida.");
  }

  const { payload, requestId } = await fetchJsonFromBackend(pathname, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  const providerUrl = validateProviderAuthUrl(provider, payload?.url);
  if (!providerUrl) {
    appendStartupLog(`[auth-network] ${requestId} backend returned invalid ${provider} auth URL.`);
    throw new Error(`O backend retornou uma URL de autenticacao ${provider} invalida.`);
  }

  // `openBrowser: false` exists for backward compatibility with the current
  // renderer services: main performs the authenticated backend request, returns
  // the validated provider URL, and the renderer opens it through shell IPC.
  // Newer callers can omit the flag and let main open the browser directly.
  if (openBrowser) {
    await shell.openExternal(providerUrl);
  }

  return {
    ok: true,
    provider,
    requestId,
    url: providerUrl,
    opened: openBrowser,
  };
});

registerSecureIpcHandler("auth:get-pending-account-callback", () => {
  const pending = getPendingAccountAuthCallback();
  if (!pending) return null;
  return {
    callbackId: pending.id,
    receivedAt: pending.receivedAt,
    ...pending.payload,
  };
});

registerSecureIpcHandler("auth:ack-account-callback", (_event, callbackId) => {
  const pending = getPendingAccountAuthCallback();
  if (!pending) return false;
  if (String(callbackId || "") !== pending.id) return false;
  pendingAccountAuthCallback = null;
  return true;
});

registerSecureIpcHandler("auth:poll-google-status", async (_event, state) => {
  if (!state || typeof state !== "string") {
    return { status: "error", error: "State invalido." };
  }
  try {
    const { payload } = await fetchJsonFromBackend(
      `/auth/desktop/google/status?state=${encodeURIComponent(state)}`,
      { method: "GET" },
      12_000,
    );
    return payload || { status: "pending" };
  } catch (error) {
    if (Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 500) {
      return { status: "error", error: error.message || "Falha ao consultar login Google." };
    }
    return { status: "pending" };
  }
});

registerSecureIpcHandler("shell:open-path", async (_event, pathStr) => {
  let target = String(pathStr || "").trim();
  if (target.startsWith("cp-media://")) {
    try {
      let rawPath = decodeURIComponent(target.replace(/^cp-media:\/\/(?:local\/)?/i, ""));
      if (process.platform === "win32") {
        rawPath = rawPath.replace(/^\/+([a-zA-Z]:)/, "$1");
      }
      target = path.resolve(rawPath);
    } catch {
      // fallback to original target
    }
  }
  return shell.openPath(target);
});

registerSecureIpcHandler("shell:open-external", async (_event, url) => {
  const rawUrl = String(url || "").trim();
  if (!isSafeOpenExternalUrl(rawUrl)) {
    throw new Error("Protocolo nao permitido.");
  }
  await shell.openExternal(rawUrl);
});

registerSecureIpcHandler("system:copy-to-clipboard", async (_event, value) => {
  const text = String(value ?? "").slice(0, 512);
  if (!text) throw new Error("Nenhum texto para copiar.");
  clipboard.writeText(text, "clipboard");
  return { ok: true };
});

registerSecureIpcHandler("controller:get-battery", async () => {
  try {
    return await queryWindowsControllerBattery();
  } catch (err) {
    console.warn("[controller] Falha ao consultar bateria do controle:", err);
    return { batteryLevel: null, isCharging: false, connectionType: "unknown", deviceName: null };
  }
});

registerSecureIpcHandler("overlay:test-welcome", async () => {
  const copy = getOverlayEventCopy();
  selectOverlayDisplayFromLauncher();
  sendOverlayEvent("overlay:social", {
    kind: "game-start",
    title: copy.enjoy,
    description: copy.active,
  });
});

registerSecureIpcHandler("overlay:test-achievement", async (_event, requestedTier) => {
  const copy = getOverlayEventCopy();
  selectOverlayDisplayFromLauncher();
  const tier = requestedTier === "platinum" ? "platinum" : requestedTier === "gold" ? "gold" : requestedTier === "silver" ? "silver" : "bronze";
  const xp = tier === "platinum" ? 300 : tier === "gold" ? 90 : tier === "silver" ? 30 : 15;
  const name =
    tier === "platinum" ? "Troféu de Platina Desbloqueado" :
      tier === "gold" ? "Troféu de Ouro Conquistado" :
        tier === "silver" ? "Troféu de Prata Conquistado" :
          copy.firstKill;
  const description =
    tier === "platinum" ? "Parabéns! Você completou 100% de todas as conquistas deste jogo." :
      tier === "gold" ? "Conquista de alto valor desbloqueada com maestria." :
        tier === "silver" ? "Excelente progresso em sua jornada." :
          copy.testAchievement;

  // Sempre envia direto para o overlay visual, independente das preferências do usuário
  sendOverlayEvent("achievement:unlock", {
    gameId: "checkpoint-lab",
    achievementId: `overlay-test-${tier}`,
    achievement: {
      id: `overlay-test-${tier}`,
      name,
      description,
      icon: overlayIconUrl(),
      tier,
      xp,
    },
    tier,
    xp,
    unlockedAt: new Date().toISOString(),
    duplicate: false,
    position: achievementNotificationPosition,
  });
  playOverlaySound(
    tier === "platinum"
      ? "achievement-unlock-platinum"
      : tier === "gold"
        ? "achievement-unlock-gold"
        : "achievement-unlock"
  );
});

registerSecureIpcHandler("overlay:set-achievement-volume", async (_event, requestedVolume) => {
  const numericVolume = Number(requestedVolume);
  achievementVolume = Number.isFinite(numericVolume)
    ? Math.min(100, Math.max(0, Math.round(numericVolume)))
    : 22;
  overlayPanelState = {
    ...overlayPanelState,
    settings: { ...overlayPanelState.settings, achievementVolume },
  };
  saveOverlaySettings();
  if (overlayReady && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay:panel-state", overlayPanelState);
  }
  return { volume: achievementVolume };
});

registerSecureIpcHandler("overlay:set-achievement-sound-theme", async (_event, requestedTheme) => {
  const normalized = requestedTheme === "playstation" ? "ps2" : requestedTheme === "phelierium" ? "default" : requestedTheme;
  const supportedThemes = new Set(["default", "ps5", "ps4", "psp", "ps2", "gamecube", "xbox360", "cyberpunk"]);
  achievementSoundTheme = supportedThemes.has(normalized) ? normalized : "default";
  overlayPanelState = {
    ...overlayPanelState,
    settings: { ...overlayPanelState.settings, achievementSoundTheme },
  };
  saveOverlaySettings();
  if (overlayReady && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay:panel-state", overlayPanelState);
  }
  return { theme: achievementSoundTheme };
});

registerSecureIpcHandler("overlay:set-achievement-notification-settings", async (_event, requestedSettings) => {
  return applyAchievementNotificationSettings(requestedSettings);
});

const OverlayPayloadSchema = z.object({
  type: z.string().max(32).optional(),
  title: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  duration: z.number().optional(),
  sound: z.boolean().optional(),
  imageUrl: z.string().max(2048).optional(),
  friendId: z.string().max(128).optional(),
  action: z
    .object({
      actionId: z.string().max(64),
      label: z.string().max(100).optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

const OVERLAY_ALLOWED_ACTIONS = new Set(["open-friend", "accept-request", "open-chat", "custom"]);

registerSecureIpcHandler("overlay:show-notification", async (_event, payload) => {
  const parsed = OverlayPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn("[overlay] invalid payload", parsed.error);
    throw new Error("Invalid payload");
  }
  const data = parsed.data;

  const type = data.type ?? "info";
  const defaultTitle =
    type === "error"
      ? "Erro"
      : type === "success"
        ? "Sucesso"
        : type === "achievement"
          ? "Conquista Desbloqueada"
          : type === "incoming-call"
            ? "Chamada de Voz"
            : "Notificação";
  const title = data.title ?? defaultTitle;
  const message = data.message ?? "";
  const duration = typeof data.duration === "number" ? data.duration : undefined;
  const sound = typeof data.sound === "boolean" ? data.sound : undefined;
  const friendId = data.friendId;
  const avatarUrl = data.imageUrl ? sanitizeOverlayImageSource(data.imageUrl) : undefined;

  let action;
  if (data.action) {
    const actionId = OVERLAY_ALLOWED_ACTIONS.has(data.action.actionId) ? data.action.actionId : "custom";
    action = { actionId, label: data.action.label ?? undefined };
  }

  sendOverlayEvent("overlay:social", {
    kind: type,
    title,
    message,
    description: message,
    avatarUrl: avatarUrl || (type === "achievement" ? undefined : overlayIconUrl()),
    friendId,
    duration,
    sound,
    action,
    metadata: data.metadata,
  });

  if (type === "achievement" && sound !== false) {
    const rawTier = String(data.metadata?.tier || "").toLowerCase();
    const soundName = rawTier === "platinum" || rawTier === "platina"
      ? "achievement-unlock-platinum"
      : rawTier === "gold" || rawTier === "ouro"
        ? "achievement-unlock-gold"
        : "achievement-unlock";
    playOverlaySound(soundName);
  }
});

registerSecureIpcHandler("overlay:dismiss-notification", async (_event, payload) => {
  sendOverlayEvent("overlay:social", {
    kind: "dismiss",
    notificationId: payload?.id ? String(payload.id) : undefined,
    dismissAll: Boolean(payload?.dismissAll),
  });
});

registerSecureIpcHandler("overlay:toggle-panel", async () => {
  return { open: requestOverlayPanelToggle("gamepad") };
});

// ─ Battery warning notification ───────────────────────────────────────────────
registerSecureIpcHandler("system:show-battery-warning", async (_event, requestedLevel) => {
  const level = Math.min(100, Math.max(0, Math.round(Number(requestedLevel) || 0)));
  sendOverlayEvent("overlay:social", {
    kind: "info",
    title: `🔋 Bateria em ${level}%`,
    message: "Conecte o cabo para não perder a sessão de jogo!",
    duration: 7000,
    sound: true,
  });
});

registerSecureIpcHandler("overlay:show-game-start", async (_event, payload) => {
  const copy = getOverlayEventCopy();
  selectOverlayDisplayFromLauncher();
  activateInGameOverlay();
  const gameTitle = String(payload?.gameTitle || "").trim();
  sendOverlayEvent("overlay:social", {
    kind: "game-start",
    title: copy.enjoy,
    description: gameTitle
      ? `${copy.playing} ${gameTitle}`
      : copy.active,
  });
  setTimeout(() => {
    sendOverlayEvent("overlay:social", {
      kind: "overlay-hint",
      title: copy.open,
      description: copy.shortcut,
    });
  }, 1400);
});

registerSecureIpcHandler("overlay:show-friend-playing", async (_event, payload) => {
  const copy = getOverlayEventCopy();
  const playerName = String(payload?.playerName || "").trim() || copy.player;
  const gameTitle = String(payload?.gameTitle || "").trim() || copy.now;
  const avatarUrl = sanitizeOverlayImageSource(payload?.avatarUrl);

  sendOverlayEvent("overlay:social", {
    kind: "friend-playing",
    title: playerName,
    description: `${copy.friendPlaying} ${gameTitle}`,
    avatarUrl: avatarUrl || overlayIconUrl(),
  });
});

registerSecureIpcHandler("overlay:show-friend-request", async (_event, payload) => {
  const copy = getOverlayEventCopy();
  const playerName = String(payload?.playerName || "").trim() || copy.player;
  const avatarUrl = sanitizeOverlayImageSource(payload?.avatarUrl);
  const friendId = String(payload?.friendId || "").trim().slice(0, 128);
  const contentKind = payload?.contentKind === "image" ? "image" : "text";

  sendOverlayEvent("overlay:social", {
    kind: "friend-request",
    title: playerName,
    description: copy.request,
    avatarUrl: avatarUrl || overlayIconUrl(),
    friendId,
    contentKind,
  });
});

registerSecureIpcHandler("mods:detect-conflicts", async (_event, manifestRoot) => {
  return detectModConflicts(String(manifestRoot || "").trim());
});

registerSecureIpcHandler("mods:load-profiles", async (_event, gameId) => {
  return loadModProfiles(app.getPath("userData"), String(gameId || "").trim());
});

registerSecureIpcHandler("mods:save-profile", async (_event, payload) => {
  const gameId = String(payload?.gameId || "").trim();
  const profileName = String(payload?.profileName || "").trim();
  const activeInstallIds = Array.isArray(payload?.activeInstallIds)
    ? payload.activeInstallIds.map((id) => String(id))
    : [];
  return saveModProfile(app.getPath("userData"), gameId, profileName, activeInstallIds);
});

registerSecureIpcHandler("mods:delete-profile", async (_event, payload) => {
  const gameId = String(payload?.gameId || "").trim();
  const profileId = String(payload?.profileId || "").trim();
  return deleteModProfile(app.getPath("userData"), gameId, profileId);
});

// ─── Auto-Updater ───────────────────────────────────────────────────────────
const { autoUpdater } = require("electron-updater");

// Suporte a servidor de atualizações próprio / privado (ex: R2, S3, Firebase ou site)
if (process.env.CHECKPOINT_UPDATE_URL) {
  try {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: process.env.CHECKPOINT_UPDATE_URL,
    });
  } catch (err) {
    console.warn("[AutoUpdater] Não foi possível definir feed genérico:", err);
  }
}

// O usuário escolhe quando iniciar o download. Depois de baixada, escolhe quando reiniciar.
autoUpdater.autoDownload = false;
let updaterState = {
  status: "idle",
  info: null,
  progress: null,
  error: "",
};

const formatUpdaterError = (error) => {
  const rawMessage = String(error?.stack || error?.message || error || "");
  if (/YAMLException|cannot read a block mapping entry|multiline key|end of the stream or a document separator is expected/i.test(rawMessage)) {
    return "O servidor de atualizações retornou uma página HTML/inválida em vez do arquivo de release YAML (latest.yml). Verifique as rotas do servidor de download ou tente novamente.";
  }
  if (
    /\b404\b/.test(rawMessage)
    && /github\.com\/Guilhermesttt\/Checkpoint---Launcher\/releases/i.test(rawMessage)
  ) {
    return [
      "Nao foi possivel acessar os releases do Checkpoint no GitHub.",
      "O repositorio esta privado ou nao possui uma release publica com latest.yml.",
    ].join(" ");
  }
  if (/401|bad credentials|authentication token/i.test(rawMessage)) {
    return "O servidor de atualizacoes recusou a autenticacao.";
  }
  const firstLine = rawMessage.split(/\r?\n/, 1)[0]
    .replace(/\b(?:authorization|cookie|set-cookie)\b\s*[:=][^,}]+/gi, "$1: [oculto]")
    .trim();
  return firstLine.slice(0, 500) || "Erro desconhecido ao verificar atualizacoes.";
};

const sendUpdaterMessage = (message, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:message", message, data);
  }
};

// Repassa eventos do autoUpdater para a interface de usuário (Vite/React)
autoUpdater.on("checking-for-update", () => {
  if (updaterState.status === "downloaded") return;
  updaterState = { ...updaterState, status: "checking", error: "" };
  sendUpdaterMessage("checking-for-update");
});

autoUpdater.on("update-available", (info) => {
  if (updaterState.status === "downloaded") return;
  updaterState = { status: "available", info, progress: null, error: "" };
  sendUpdaterMessage("update-available", info);
});

autoUpdater.on("update-not-available", (info) => {
  if (updaterState.status === "downloaded") return;
  updaterState = { status: "not-available", info, progress: null, error: "" };
  sendUpdaterMessage("update-not-available", info);
});

autoUpdater.on("error", (err) => {
  const message = formatUpdaterError(err);
  updaterState = { ...updaterState, status: "error", error: message };
  sendUpdaterMessage("error", message);
});

autoUpdater.on("download-progress", (progressObj) => {
  updaterState = { ...updaterState, status: "downloading", progress: progressObj, error: "" };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:download-progress", progressObj);
  }
});

autoUpdater.on("update-downloaded", (info) => {
  updaterState = { status: "downloaded", info, progress: { percent: 100 }, error: "" };
  sendUpdaterMessage("update-downloaded", info);
});

registerSecureIpcHandler("app:get-version", () => {
  return app.getVersion();
});

registerSecureIpcHandler("update:get-state", () => updaterState);

registerSecureIpcHandler("update:check-for-updates", async () => {
  try {
    if (!app.isPackaged) {
      return { status: "development", message: "O atualizador não funciona em ambiente de desenvolvimento." };
    }
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (error) {
    console.error("[auto-updater] Erro ao checar atualizações:", error);
    throw new Error(formatUpdaterError(error));
  }
});

registerSecureIpcHandler("update:download", async () => {
  if (!app.isPackaged) {
    return { status: "development", message: "O atualizador não funciona em ambiente de desenvolvimento." };
  }
  if (updaterState.status === "downloaded" || updaterState.status === "downloading") {
    return updaterState;
  }
  if (updaterState.status !== "available") {
    throw new Error("Nenhuma atualização está pronta para download.");
  }

  updaterState = {
    ...updaterState,
    status: "downloading",
    progress: { percent: 0 },
    error: "",
  };
  sendUpdaterMessage("download-started", updaterState.info);
  await autoUpdater.downloadUpdate();
  return updaterState;
});

registerSecureIpcHandler("update:quit-and-install", () => {
  isQuitting = true;
  autoUpdater.quitAndInstall();
});

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

app.whenReady().then(async () => {
  protocol.handle("cp-media", async (request) => {
    try {
      let rawPath = decodeURIComponent(request.url.replace(/^cp-media:\/\/(?:local\/)?/i, ""));
      if (process.platform === "win32") {
        rawPath = rawPath.replace(/^\/+([a-zA-Z]:)/, "$1");
      }
      const normalized = path.resolve(rawPath);
      if (!fs.existsSync(normalized)) {
        return new Response("Not found", { status: 404 });
      }
      try {
        return await net.fetch(pathToFileURL(normalized).toString());
      } catch {
        const ext = path.extname(normalized).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.mp4': 'video/mp4',
          '.webm': 'video/webm'
        };
        const buffer = await fs.promises.readFile(normalized);
        return new Response(buffer, {
          status: 200,
          headers: { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' }
        });
      }
    } catch (e) {
      console.error("[cp-media] Error fetching media file:", request.url, e);
      return new Response("Not found", { status: 404 });
    }
  });
  try {
    if (IS_SMOKE_TEST) {
      const requiredFiles = [
        path.join(app.getAppPath(), "dist", "index.html"),
        path.join(app.getAppPath(), "electron", "preload.cjs"),
        path.join(app.getAppPath(), "assets", "icon.png"),
      ];
      const missingFiles = requiredFiles.filter((filePath) => !fs.existsSync(filePath));
      if (missingFiles.length > 0) {
        throw new Error(`Smoke test falhou; arquivos ausentes: ${missingFiles.join(", ")}`);
      }
      console.log(`[smoke] Checkpoint Launcher ${app.getVersion()} validado.`);
      app.exit(0);
      return;
    }

    try {
      const rawSettings = await fs.promises.readFile(overlaySettingsFile(), "utf8").catch(() => null);
      const saved = rawSettings ? JSON.parse(rawSettings) : null;
      if (saved) {
        const savedShortcut = normalizeCaptureShortcut(saved?.captureShortcut);
        if (savedShortcut) captureShortcut = savedShortcut;
        const savedAchievementVolume = Number(saved?.achievementVolume);
        if (Number.isFinite(savedAchievementVolume)) {
          achievementVolume = Math.min(100, Math.max(0, Math.round(savedAchievementVolume)));
        }
        if (["default", "phelierium", "ps5", "ps4", "psp", "ps2", "playstation", "gamecube", "xbox360", "cyberpunk"].includes(saved?.achievementSoundTheme)) {
          const s = saved.achievementSoundTheme;
          achievementSoundTheme = s === "playstation" ? "ps2" : s === "phelierium" ? "default" : s;
        }
        achievementNotificationsEnabled = saved?.achievementNotificationsEnabled !== false;
        customAchievementNotifications = saved?.customAchievementNotifications !== false;
        if (["top-left", "top-right", "bottom-left", "bottom-right"].includes(saved?.achievementNotificationPosition)) {
          achievementNotificationPosition = saved.achievementNotificationPosition;
        }
      }
    } catch {
      // Primeira execucao ou configuracao ainda nao criada.
    }
    await loadRecentCaptures();
    overlayPanelState = {
      ...overlayPanelState,
      captures: recentCaptures,
      settings: {
        captureShortcut,
        achievementVolume,
        achievementSoundTheme,
        achievementNotificationsEnabled,
        customAchievementNotifications,
        achievementNotificationPosition,
      },
    };

    try {
      const getTrayIcon = () => {
        const candidatePaths = [
          path.join(__dirname, "..", "assets", "icon.ico"),
          path.join(app.getAppPath(), "assets", "icon.ico"),
          path.join(process.resourcesPath, "assets", "icon.ico"),
          path.join(__dirname, "..", "assets", "icon.png"),
          path.join(app.getAppPath(), "assets", "icon.png"),
          path.join(process.resourcesPath, "assets", "icon.png"),
        ];
        for (const p of candidatePaths) {
          try {
            if (fs.existsSync(p)) {
              const img = nativeImage.createFromPath(p);
              if (!img.isEmpty()) {
                return img.resize({ width: 16, height: 16 });
              }
            }
          } catch {
            // Continua procurando nos outros caminhos
          }
        }
        return null;
      };

      const trayIcon = getTrayIcon();
      if (trayIcon && !trayIcon.isEmpty()) {
        tray = new Tray(trayIcon);
        const contextMenu = Menu.buildFromTemplate([
          { label: "Abrir Phelierium", click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
          { label: "Sair", click: () => { windowBehaviorController.requestAppQuit(); } }
        ]);
        tray.setToolTip("Phelierium");
        tray.setContextMenu(contextMenu);
        const openMainWindow = () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        };
        tray.on("click", openMainWindow);
        tray.on("double-click", openMainWindow);
      } else {
        console.warn("[SystemTray] Nenhum icone valido encontrado para a bandeja.");
      }
    } catch (e) {
      console.warn("Não foi possível inicializar a System Tray:", e);
    }

    try {
      const registeredShiftTab = globalShortcut.register("Shift+Tab", () => requestOverlayPanelToggle("keyboard"));
      if (!registeredShiftTab) {
        console.warn("[overlay] Global shortcut Shift+Tab could not be registered (may conflict), falling back to CommandOrControl+Shift+O");
      }
    } catch (shortcutErr) {
      console.warn("[overlay] Falha ao registrar Shift+Tab:", shortcutErr);
    }
    try {
      globalShortcut.register("CommandOrControl+Shift+O", () => requestOverlayPanelToggle("keyboard"));
    } catch (shortcutErr) {
      console.warn("[overlay] Falha ao registrar CommandOrControl+Shift+O:", shortcutErr);
    }
    if (!registerCaptureShortcut(captureShortcut)) {
      console.warn(`[overlay] O atalho de captura ${captureShortcut} ja esta em uso.`);
    }
    screen.on("display-metrics-changed", syncOverlayBounds);
    screen.on("display-added", syncOverlayBounds);
    screen.on("display-removed", syncOverlayBounds);
    await startAchievementBridge();
    await migrateKnownAchievementProgress();
    await createWindow();
    deliverAccountAuthCallback(findAccountAuthCallback(process.argv));
    void handleNexusDownloadUrl(findNxmUrl(process.argv));
  } catch (error) {
    showFatalStartupError(error);
    app.quit();
  }
});

app.on("second-instance", (_event, commandLine) => {
  deliverAccountAuthCallback(findAccountAuthCallback(commandLine));
  void handleNexusDownloadUrl(findNxmUrl(commandLine));
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (/^nxm:\/\//i.test(String(url || ""))) {
    void handleNexusDownloadUrl(url);
  } else {
    deliverAccountAuthCallback(parseAccountAuthCallback(url));
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  process.exit(0);
});

app.on("before-quit", () => {
  isQuitting = true;
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy();
    splashWindow = null;
  }
  sendDirectOfflineSync();
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app:quitting");
    }
  } catch { }
  void shutdownModOperationWorker();
  if (localGameLibrary) {
    try {
      localGameLibrary.close();
    } catch (error) {
      appendStartupLog("Failed to close local game library.", error);
    }
    localGameLibrary = null;
  }
  for (const watcherKey of Array.from(activeGameMonitors.keys())) {
    stopGameProcessMonitor(watcherKey);
  }
  for (const watcherKey of Array.from(activeWatchers.keys())) {
    stopGameWatcher(watcherKey);
  }
  screen.removeListener("display-metrics-changed", syncOverlayBounds);
  screen.removeListener("display-added", syncOverlayBounds);
  screen.removeListener("display-removed", syncOverlayBounds);
  if (achievementBridge) {
    achievementBridge.stop().catch((error) => {
      appendStartupLog("Failed to stop achievement bridge.", error);
    });
  }
});

process.on("unhandledRejection", (reason) => {
  appendStartupLog("Unhandled promise rejection in Electron main.", reason);
});

process.on("uncaughtException", (error) => {
  appendStartupLog("Uncaught exception in Electron main.", error);
});
