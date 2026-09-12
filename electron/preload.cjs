const { contextBridge, ipcRenderer } = require("electron");

// Allowed overlay action IDs to prevent arbitrary commands
const ALLOWED_OVERLAY_ACTION_IDS = new Set(["open-friend", "accept-request", "open-chat", "custom"]);

// Linked-account auth is intentionally restricted to providers supported by main.cjs.
const ALLOWED_LINKED_ACCOUNT_PROVIDERS = new Set(["steam", "discord"]);
const AUTH_STATUS_PATTERN = /^[a-z0-9_-]{1,40}$/i;
const AUTH_CALLBACK_ID_PATTERN = /^[a-f0-9-]{16,64}$/i;

function sanitizeLinkedAccountProvider(value) {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!ALLOWED_LINKED_ACCOUNT_PROVIDERS.has(provider)) {
    throw new TypeError("Provedor de autenticacao invalido.");
  }
  return provider;
}

function sanitizeAccessToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token || token.length > 8192 || /[\r\n]/.test(token)) {
    throw new TypeError("Sessao do usuario ausente ou invalida.");
  }
  return token;
}

function sanitizeCallbackId(value) {
  const callbackId = typeof value === "string" ? value.trim() : "";
  if (!AUTH_CALLBACK_ID_PATTERN.test(callbackId)) {
    throw new TypeError("Callback de autenticacao invalido.");
  }
  return callbackId;
}

function sanitizeAccountAuthCallback(payload) {
  if (!payload || typeof payload !== "object") return null;

  const steamStatus = typeof payload.steamStatus === "string" && AUTH_STATUS_PATTERN.test(payload.steamStatus)
    ? payload.steamStatus
    : undefined;
  const discordStatus = typeof payload.discordStatus === "string" && AUTH_STATUS_PATTERN.test(payload.discordStatus)
    ? payload.discordStatus
    : undefined;
  const callbackId = typeof payload.callbackId === "string" && AUTH_CALLBACK_ID_PATTERN.test(payload.callbackId)
    ? payload.callbackId
    : undefined;
  const receivedAt = Number.isFinite(Number(payload.receivedAt))
    ? Number(payload.receivedAt)
    : undefined;

  if (!steamStatus && !discordStatus) return null;

  return {
    ...(steamStatus ? { steamStatus } : {}),
    ...(discordStatus ? { discordStatus } : {}),
    ...(callbackId ? { callbackId } : {}),
    ...(receivedAt !== undefined ? { receivedAt } : {}),
  };
}

function sanitizeString(value, max = 1024) {
  if (typeof value !== "string") return undefined;
  return value.slice(0, max);
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return undefined;
  try {
    // shallow clone only JSON-serializable properties
    return JSON.parse(JSON.stringify(metadata));
  } catch {
    return undefined;
  }
}

contextBridge.exposeInMainWorld("electronAPI", {
  launchExecutable: (executablePath, launchProfile, launchOptions) =>
    ipcRenderer.invoke("launcher:open-executable", executablePath, launchProfile, launchOptions),
  selectExecutable: () => ipcRenderer.invoke("launcher:select-executable"),
  importRetroArtwork: (imageUrl) => ipcRenderer.invoke("retro:import-artwork", imageUrl),
  searchTheGamesDb: (request) => ipcRenderer.invoke("retro:search-thegamesdb", request),
  getTheGamesDbScreenshots: (request) => ipcRenderer.invoke("retro:thegamesdb-screenshots", request),
  getScreenSources: () => ipcRenderer.invoke("media:get-screen-sources"),
  getLocalGameScreenshots: (request) => ipcRenderer.invoke("media:get-local-game-screenshots", request),
  selectModGameDirectory: (gameTitle) =>
    ipcRenderer.invoke("mods:select-game-directory", gameTitle),
  getNexusStatus: () => ipcRenderer.invoke("nexus:get-status"),
  connectNexusPersonalKey: (apiKey) =>
    ipcRenderer.invoke("nexus:connect-personal-key", apiKey),
  validateNexusConnection: () => ipcRenderer.invoke("nexus:validate-connection"),
  disconnectNexus: () => ipcRenderer.invoke("nexus:disconnect"),
  getNexusModCatalog: (request) =>
    ipcRenderer.invoke("nexus:get-mod-catalog", request),
  getNexusModDetails: (request) =>
    ipcRenderer.invoke("nexus:get-mod-details", request),
  getNexusModFiles: (request) =>
    ipcRenderer.invoke("nexus:get-mod-files", request),
  getNexusDownloadState: () =>
    ipcRenderer.invoke("nexus:get-download-state"),
  listNexusDownloadedFiles: (gameDomain) => ipcRenderer.invoke("nexus:list-downloaded-files", gameDomain),
  prepareNexusFreeDownload: (request) => ipcRenderer.invoke("nexus:prepare-free-download", request),
  installNexusDownloadedMod: (request) => ipcRenderer.invoke("nexus:install-downloaded-mod", request),
  previewNexusMod: (request) => ipcRenderer.invoke("nexus:preview-mod", request),
  adoptNexusInstalledMod: (request) => ipcRenderer.invoke("nexus:adopt-installed-mod", request),
  removeNexusInstalledMod: (request) => ipcRenderer.invoke("nexus:remove-installed-mod", request),
  openNexusDownloadLocation: (gameDomain) => ipcRenderer.invoke("nexus:open-download-location", gameDomain),
  onNexusDownloadState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("nexus:download-state", handler);
    return () => ipcRenderer.removeListener("nexus:download-state", handler);
  },
  openEpicLoginWindow: () => ipcRenderer.invoke("launcher:open-epic-login-window"),
  getEpicStatus: () => ipcRenderer.invoke("epic:get-status"),
  authenticateEpic: (request) => ipcRenderer.invoke("epic:authenticate", request),
  getEpicLibrary: () => ipcRenderer.invoke("epic:list-library"),
  getEpicAchievements: (request) => ipcRenderer.invoke("epic:get-achievements", request),
  logoutEpic: () => ipcRenderer.invoke("epic:logout"),
  validateEpicSession: () => ipcRenderer.invoke("epic:validate-session"),
  onEpicProgress: (callback) => {
    if (typeof callback !== "function") return () => { };
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("epic:progress", handler);
    return () => ipcRenderer.removeListener("epic:progress", handler);
  },
  searchEpicStore: (query) => ipcRenderer.invoke("launcher:search-epic-store", query),
  fetchEpicStoreDetails: (request) => ipcRenderer.invoke("launcher:fetch-epic-store-details", request),
  getDisplays: () => ipcRenderer.invoke("launcher:get-displays"),
  isExecutableRunning: (executablePath) => ipcRenderer.invoke("launcher:is-executable-running", executablePath),
  detectRunningGames: (executablePaths) => ipcRenderer.invoke("launcher:detect-running-games", executablePaths),
  startGoogleBrowserAuth: () => ipcRenderer.invoke("auth:start-google-browser"),
  pollGoogleBrowserAuth: (state) => ipcRenderer.invoke("auth:poll-google-status", state),

  // Steam/Discord OAuth starts in main.cjs so packaged Electron does not depend on
  // renderer-origin CORS (file:// -> remote backend). The access token is only
  // forwarded over IPC to the trusted main process and is never persisted here.
  startLinkedAccountBrowser: (provider, accessToken, options = {}) =>
    ipcRenderer.invoke("auth:start-linked-account-browser", {
      provider: sanitizeLinkedAccountProvider(provider),
      accessToken: sanitizeAccessToken(accessToken),
      openBrowser: options?.openBrowser !== false,
    }),

  // Pull-based recovery for callbacks that arrived before React registered its
  // event listener. main.cjs keeps the callback pending until explicit ACK.
  getPendingAccountAuthCallback: async () =>
    sanitizeAccountAuthCallback(
      await ipcRenderer.invoke("auth:get-pending-account-callback"),
    ),

  ackAccountAuthCallback: (callbackId) =>
    ipcRenderer.invoke(
      "auth:ack-account-callback",
      sanitizeCallbackId(callbackId),
    ),

  onAccountAuthCallback: (callback) => {
    if (typeof callback !== "function") return () => { };

    let disposed = false;
    const deliveredCallbackIds = new Set();

    const deliver = async (payload) => {
      if (disposed) return;

      const sanitized = sanitizeAccountAuthCallback(payload);
      if (!sanitized) return;

      const callbackId = sanitized.callbackId;
      if (callbackId && deliveredCallbackIds.has(callbackId)) return;
      if (callbackId) deliveredCallbackIds.add(callbackId);

      try {
        await callback(sanitized);
        if (callbackId) {
          await ipcRenderer.invoke("auth:ack-account-callback", callbackId);
        }
      } catch (error) {
        // Keep callback pending in main when renderer processing fails so it can
        // be retried after reload/re-subscription.
        if (callbackId) deliveredCallbackIds.delete(callbackId);
        console.error("[preload/auth] Failed to process account auth callback:", error);
      }
    };

    const handler = (_event, payload) => {
      void deliver(payload);
    };

    ipcRenderer.on("auth:account-callback", handler);

    // Close the startup race: if OAuth completed before React subscribed, main
    // still owns the callback and we consume it now.
    void ipcRenderer
      .invoke("auth:get-pending-account-callback")
      .then((payload) => deliver(payload))
      .catch((error) => {
        console.warn("[preload/auth] Could not read pending auth callback:", error);
      });

    return () => {
      disposed = true;
      ipcRenderer.removeListener("auth:account-callback", handler);
    };
  },
  setOpenAtLogin: (open) => ipcRenderer.invoke("system:set-open-at-login", open),
  setWindowBehavior: (behavior) => ipcRenderer.invoke("system:set-window-behavior", behavior),
  requestAppQuit: () => ipcRenderer.invoke("system:request-app-quit"),
  confirmAppQuit: () => ipcRenderer.invoke("system:confirm-app-quit"),
  setPresenceSession: (session) => ipcRenderer.invoke("presence:set-session", session),
  onExitConfirmationRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("system:exit-confirmation-requested", handler);
    return () => ipcRenderer.removeListener("system:exit-confirmation-requested", handler);
  },
  openExternalUrl: (url) => ipcRenderer.invoke("shell:open-external", url),
  openPath: (path) => ipcRenderer.invoke("shell:open-path", path),
  copyToClipboard: (value) => ipcRenderer.invoke("system:copy-to-clipboard", value),
  scanLocalGames: () => ipcRenderer.invoke("game:scan-local"),
  listLocalGames: (uid) => ipcRenderer.invoke("library:list", uid),
  createLocalGame: (uid, game) => ipcRenderer.invoke("library:create", uid, game),
  updateLocalGame: (uid, gameId, patch) => ipcRenderer.invoke("library:update", uid, gameId, patch),
  deleteLocalGame: (uid, gameId) => ipcRenderer.invoke("library:delete", uid, gameId),
  deleteLocalGamesByLauncher: (uid, launcherType) => ipcRenderer.invoke("library:delete-by-launcher", uid, launcherType),
  recordLocalGameSession: (uid, gameId, session) => ipcRenderer.invoke("library:record-session", uid, gameId, session),
  bulkUpsertLocalGames: (uid, games) => ipcRenderer.invoke("library:bulk-upsert", uid, games),
  importLegacyGames: (uid, games) => ipcRenderer.invoke("library:import-legacy", uid, games),
  needsLegacyGameImport: (uid) => ipcRenderer.invoke("library:needs-legacy-import", uid),
  getLocalLibrarySummary: (uid) => ipcRenderer.invoke("library:get-summary", uid),
  markLocalLibrarySummarySynced: (uid, revision) => ipcRenderer.invoke("library:mark-summary-synced", uid, revision),
  clearLocalSteamId: (uid) => ipcRenderer.invoke("library:clear-steam-id", uid),
  purgeLocalPlatformData: (uid, platform) => ipcRenderer.invoke("library:purge-platform", uid, platform),
  getPlatformCleanupState: (uid, platform) => ipcRenderer.invoke("library:get-platform-cleanup", uid, platform),
  setPlatformCleanupPhase: (uid, platform, operationId, phase) => ipcRenderer.invoke("library:set-platform-cleanup-phase", uid, platform, operationId, phase),
  completePlatformCleanup: (uid, platform, operationId) => ipcRenderer.invoke("library:complete-platform-cleanup", uid, platform, operationId),
  testOverlayWelcome: () => ipcRenderer.invoke("overlay:test-welcome"),
  testOverlayAchievement: (tier) => ipcRenderer.invoke("overlay:test-achievement", tier),
  setAchievementVolume: (volume) => ipcRenderer.invoke("overlay:set-achievement-volume", volume),
  setAchievementSoundTheme: (theme) => ipcRenderer.invoke("overlay:set-achievement-sound-theme", theme),
  setAchievementNotificationSettings: (settings) => ipcRenderer.invoke("overlay:set-achievement-notification-settings", settings),
  toggleOverlayPanel: () => ipcRenderer.invoke("overlay:toggle-panel"),
  showNotificationOverlay: (payload) => ipcRenderer.invoke("overlay:show-notification", payload),
  dismissNotificationOverlay: (payload) => ipcRenderer.invoke("overlay:dismiss-notification", payload),
  showGameStartOverlay: (payload) => ipcRenderer.invoke("overlay:show-game-start", payload),
  showFriendPlayingOverlay: (payload) => ipcRenderer.invoke("overlay:show-friend-playing", payload),
  showFriendRequestOverlay: (payload) => ipcRenderer.invoke("overlay:show-friend-request", payload),
  showFriendAcceptedOverlay: (payload) => ipcRenderer.invoke("overlay:show-friend-accepted", payload),
  getLocalAchievementDefinitions: (gameId) => ipcRenderer.invoke("achievement:get-definitions", gameId),
  getLocalAchievementProgress: (gameId) => ipcRenderer.invoke("achievement:get-progress", gameId),
  saveLocalAchievementDefinitions: (gameId, definitions, steamAppId) => ipcRenderer.invoke("achievement:save-definitions", gameId, definitions, steamAppId),
  getAchievementProgress: (gameId) => ipcRenderer.invoke("achievement:get-progress", gameId),
  getLocalAchievementState: (appId) => ipcRenderer.invoke("achievement:get-local-state", appId),
  getEpicLocalAchievements: (request) => ipcRenderer.invoke("achievement:get-epic-local", request),
  getLocalAchievementLibrarySummary: () => ipcRenderer.invoke("achievement:get-library-summary"),
  getAchievementDiagnostics: () => ipcRenderer.invoke("achievement:get-diagnostics"),
  unlockAchievement: (gameId, achievementId) => ipcRenderer.invoke("achievement:unlock", gameId, achievementId),
  notifyTrophyUnlock: (payload) => ipcRenderer.invoke("trophy:notify-unlock", payload),
  showFriendMessageOverlay: (payload) => ipcRenderer.invoke("overlay:show-friend-message", payload),
  updateOverlayPanel: (payload) => ipcRenderer.invoke("overlay:update-panel", payload),
  onOverlayPanelAction: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("overlay:panel-action", handler);
    return () => ipcRenderer.removeListener("overlay:panel-action", handler);
  },
  onOverlayHubInputLock: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("overlay:hub-input-lock", handler);
    return () => ipcRenderer.removeListener("overlay:hub-input-lock", handler);
  },
  // ─ Auto-Updater APIs ────────────────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getUpdateState: () => ipcRenderer.invoke("update:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("update:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  quitAndInstallUpdate: () => ipcRenderer.invoke("update:quit-and-install"),
  onUpdateMessage: (callback) => {
    const handler = (_event, message, data) => callback(message, data);
    ipcRenderer.on("update:message", handler);
    return () => ipcRenderer.removeListener("update:message", handler);
  },
  onDownloadProgress: (callback) => {
    const handler = (_event, progressInfo) => callback(progressInfo);
    ipcRenderer.on("update:download-progress", handler);
    return () => ipcRenderer.removeListener("update:download-progress", handler);
  },
  // ─ Real-time achievement events (push from main → renderer) ─────────────────
  onRealtimeAchievementUnlock: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("achievement:realtime-unlock", handler);
    return handler;
  },
  removeRealtimeAchievementUnlock: (handler) => {
    ipcRenderer.removeListener("achievement:realtime-unlock", handler);
  },
  // ─ Push-to-Talk ─────────────────────────────────────────────────────────────
  registerPushToTalk: (accelerator) => ipcRenderer.invoke("ptt:register", accelerator),
  unregisterPushToTalk: () => ipcRenderer.invoke("ptt:unregister"),
  sendPttRelease: () => ipcRenderer.send("ptt:release"),
  onPttPress: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("ptt:press", handler);
    return () => ipcRenderer.removeListener("ptt:press", handler);
  },
  onPttRelease: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("ptt:release", handler);
    return () => ipcRenderer.removeListener("ptt:release", handler);
  },
  // ─ Fullscreen APIs ──────────────────────────────────────────────────────────
  toggleFullScreen: () => ipcRenderer.invoke("window:fullscreen-toggle"),
  setFullScreen: (flag) => ipcRenderer.invoke("window:fullscreen-set", flag),
  isFullScreen: () => ipcRenderer.invoke("window:fullscreen-get"),
  // ─ Battery / Controller warnings ────────────────────────────────────────────
  showBatteryWarning: (level) => ipcRenderer.invoke("system:show-battery-warning", level),
  getControllerBattery: () => ipcRenderer.invoke("controller:get-battery"),
  onAppQuitting: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("app:quitting", handler);
    return () => ipcRenderer.removeListener("app:quitting", handler);
  },
});
