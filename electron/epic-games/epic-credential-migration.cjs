"use strict";
/**
 * One-shot metadata migration from Legendary's `user.json` to the launcher's vault.
 *
 * The launcher keeps a cached copy of the Epic account id and display name so that
 * the UI can render "logged in" state instantly without shelling out to Legendary.
 * Token bytes are not migrated (Legendary continues to own its own credential
 * store via its own refresh flow); only the user-facing metadata is captured.
 *
 * Behavior:
 *   - If the vault already has tokens, do nothing.
 *   - If a legacy `user.json` is found, read its `account_id` and `display_name`,
 *     store them in the vault as a marker entry, and return.
 *   - Never log token contents; only the file paths and the migration outcome.
 *
 * Public surface: `migrateEpicAccountMetadata({ userDataPath, fileSystem? })`
 * returns `Promise<{ migrated: boolean, source: 'vault' | 'user.json' | 'none', accountId?: string, displayName?: string }>`.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createEpicCredentialVault } = require("./epic-credential-vault.cjs");

const LEGENDARY_CANDIDATES = () => {
  const list = [
    path.join(os.homedir(), ".config", "legendary", "user.json"),
  ];
  if (process.env.LOCALAPPDATA) {
    list.push(path.join(process.env.LOCALAPPDATA, "legendary", "user.json"));
  }
  if (process.env.APPDATA) {
    list.push(path.join(process.env.APPDATA, "legendary", "user.json"));
  }
  return list;
};

const safeReadJson = (fileSystem, filePath) => {
  try {
    const raw = fileSystem.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const migrateEpicAccountMetadata = async ({
  userDataPath,
  fileSystem = fs,
} = {}) => {
  if (!userDataPath) {
    return { migrated: false, source: "none" };
  }
  const vault = createEpicCredentialVault({ userDataPath, fileSystem });
  if (vault.exists()) {
    return { migrated: false, source: "vault" };
  }
  for (const candidate of LEGENDARY_CANDIDATES()) {
    const legacy = safeReadJson(fileSystem, candidate);
    if (!legacy || typeof legacy !== "object") continue;
    const accountId =
      legacy.account_id || legacy.accountId || "";
    const displayName = legacy.displayName || legacy.display_name || "";
    if (!accountId) continue;
    try {
      // The vault is still AES-256-GCM; the token bytes are placeholders that
      // mark "metadata migrated". They are not used for any API call.
      vault.write({
        accessToken: "metadata-marker",
        refreshToken: "metadata-marker",
        accountId,
        displayName,
        // expiresAt = 0 means "expiry unknown" — the session will treat this
        // as "needs verification" and fall back to `legendary status`.
        expiresAt: 0,
        scope: "",
      });
      return { migrated: true, source: "user.json", accountId, displayName };
    } catch {
      return { migrated: false, source: "user.json" };
    }
  }
  return { migrated: false, source: "none" };
};

module.exports = {
  migrateEpicAccountMetadata,
  LEGENDARY_CANDIDATES,
};

