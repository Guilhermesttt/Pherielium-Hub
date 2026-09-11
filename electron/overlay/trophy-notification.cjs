// electron/trophy-notification.cjs
// In-app push for trophy unlocks using Electron's native Notification API.
// We do not call the system notification if the renderer is visible (the
// in-page toast already covers that case); the system tray call is reserved
// for the moment the user has the app backgrounded.
//
// Designed for testability: the `NotificationCtor` and the window-visibility
// probe are injected so unit tests can use a fake class + fake window.

"use strict";

/**
 * @typedef {Object} TrophyPushInput
 * @property {string} trophyTitle
 * @property {string} trophyDescription
 * @property {"platinum"|"gold"|"silver"|"bronze"} tier
 * @property {number} xp
 * @property {string} [iconUrl]
 */

/**
 * @typedef {Object} TrophyNotificationDeps
 * @property {typeof Notification} NotificationCtor
 * @property {() => boolean} isWindowVisible   Returns true if the BrowserWindow is the focused/visible one.
 * @property {(text: string) => void} [logger]  Optional logger; defaults to no-op.
 */

/**
 * @param {TrophyPushInput} input
 * @param {TrophyNotificationDeps} deps
 * @returns {{ shown: boolean, reason?: string }}
 */
function showTrophyNotification(input, deps) {
  if (!deps || typeof deps.NotificationCtor !== "function") {
    return { shown: false, reason: "missing NotificationCtor" };
  }
  if (deps.isWindowVisible()) {
    // The in-page toast already covers this case; system notification would
    // be redundant. Skip without an error.
    return { shown: false, reason: "window-visible" };
  }

  const tier = ["platinum", "gold", "silver", "bronze"].includes(input.tier) ? input.tier : "bronze";
  const tierLabel = { platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze" }[tier];

  try {
    const n = new deps.NotificationCtor({
      title: `${tierLabel} · ${input.trophyTitle}`,
      body: `${input.trophyDescription}\n+${input.xp} XP`,
      silent: false,
      icon: input.iconUrl || undefined,
    });
    n.show();
    return { shown: true };
  } catch (err) {
    if (deps.logger) deps.logger(`trophy notification failed: ${(err && err.message) || err}`);
    return { shown: false, reason: "throw" };
  }
}

/**
 * Build a default deps object using the Electron globals available in main.cjs.
 * Kept separate so unit tests can call showTrophyNotification directly with
 * a fake NotificationCtor + isWindowVisible probe.
 */
function createDefaultDeps({ BrowserWindow, logger } = {}) {
  const isWindowVisible = () => {
    try {
      if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== "function") return false;
      const wins = BrowserWindow.getAllWindows();
      return wins.some(
        (w) => !w.isDestroyed() && (w.isFocused() || w.isVisible()),
      );
    } catch {
      return false;
    }
  };
  // Lazily import Notification at call time so test environments without
  // electron can still require this module.
  const NotificationCtor = (() => {
    try {
      // eslint-disable-next-line global-require
      return require("electron").Notification;
    } catch {
      return undefined;
    }
  })();
  return { NotificationCtor, isWindowVisible, logger };
}

module.exports = {
  showTrophyNotification,
  createDefaultDeps,
};
