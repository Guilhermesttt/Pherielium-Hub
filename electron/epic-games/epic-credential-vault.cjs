"use strict";
/**
 * Epic credential vault.
 *
 * Stores Epic OAuth tokens in an AES-256-GCM encrypted envelope on disk instead
 * of relying on Legendary's plaintext `user.json`. The 32-byte master key lives
 * in a sibling file with restrictive permissions; together they are useless
 * without each other.
 *
 * Format (`epic-vault.enc`):
 *   { "v": 1, "iv": "<base64>", "tag": "<base64>", "data": "<base64>", "updatedAt": "<iso>" }
 *
 * Master key (`epic-vault.key`):
 *   32 random bytes written with mode 0o600. On Windows the OS ACL is best-effort.
 *
 * Public surface: `createEpicCredentialVault({ userDataPath, fileSystem?, crypto? })`
 * returns { read, write, clear, exists, paths }.
 */

const path = require("node:path");
const fs = require("node:fs");
const nodeCrypto = require("node:crypto");

const VAULT_FILE_NAME = "epic-vault.enc";
const KEY_FILE_NAME = "epic-vault.key";
const ENVELOPE_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_MODE = 0o600;

const SCHEMA_VERSION_SUPPORTED = [1];

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isValidTokenSet = (value) => {
  if (!isObject(value)) return false;
  if (typeof value.accessToken !== "string" || value.accessToken.length < 4) {
    return false;
  }
  if (typeof value.refreshToken !== "string" || value.refreshToken.length < 4) {
    return false;
  }
  if (typeof value.accountId !== "string" || value.accountId.length === 0) {
    return false;
  }
  if (
    value.expiresAt !== undefined &&
    value.expiresAt !== null &&
    (!Number.isFinite(Number(value.expiresAt)) || Number(value.expiresAt) < 0)
  ) {
    return false;
  }
  return true;
};

const decodeEnvelope = (raw) => {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  if (!SCHEMA_VERSION_SUPPORTED.includes(parsed.v)) return null;
  if (typeof parsed.iv !== "string" || typeof parsed.tag !== "string") return null;
  if (typeof parsed.data !== "string") return null;
  return parsed;
};

const createEpicCredentialVault = ({
  userDataPath,
  fileSystem = fs,
  crypto = nodeCrypto,
  randomBytes = (size) => new Uint8Array(crypto.randomBytes(size)),
  now = () => Date.now(),
} = {}) => {
  if (!userDataPath || typeof userDataPath !== "string") {
    throw new TypeError("Diretorio de dados do usuario invalido.");
  }

  const vaultPath = path.join(userDataPath, VAULT_FILE_NAME);
  const keyPath = path.join(userDataPath, KEY_FILE_NAME);

  let cachedKey = null;

  const ensureUserDataDir = () => {
    fileSystem.mkdirSync(userDataPath, { recursive: true });
  };

  const readMasterKey = () => {
    if (cachedKey) {
      // Verify the key file is still on disk before trusting the cache.
      try {
        const buf = fileSystem.readFileSync(keyPath);
        if (buf.length !== KEY_BYTES) {
          cachedKey = null;
          return null;
        }
        return cachedKey;
      } catch {
        cachedKey = null;
        return null;
      }
    }
    try {
      const buf = fileSystem.readFileSync(keyPath);
      if (buf.length !== KEY_BYTES) return null;
      cachedKey = Buffer.from(buf);
      return cachedKey;
    } catch {
      return null;
    }
  };

  const writeMasterKey = () => {
    const bytes = randomBytes(KEY_BYTES);
    const key = Buffer.from(bytes);
    ensureUserDataDir();
    const tmp = `${keyPath}.tmp`;
    fileSystem.writeFileSync(tmp, key, { mode: KEY_MODE });
    try {
      fileSystem.rmSync(keyPath, { force: true });
    } catch {
      /* ignore */
    }
    fileSystem.renameSync(tmp, keyPath);
    cachedKey = key;
    return key;
  };

  const decrypt = (key, envelope) => {
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    const data = Buffer.from(envelope.data, "base64");
    if (iv.length !== IV_BYTES) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let plaintext;
    try {
      plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    } catch {
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(plaintext.toString("utf8"));
    } catch {
      return null;
    }
    if (!isValidTokenSet(parsed)) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      accountId: parsed.accountId,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : "",
      expiresAt:
        parsed.expiresAt == null || Number(parsed.expiresAt) === 0
          ? 0
          : Number(parsed.expiresAt),
      scope: typeof parsed.scope === "string" ? parsed.scope : "",
    };
  };

  const read = () => {
    let raw;
    try {
      raw = fileSystem.readFileSync(vaultPath, "utf8");
    } catch {
      return null;
    }
    const envelope = decodeEnvelope(raw);
    if (!envelope) return null;
    const key = readMasterKey();
    if (!key) return null;
    return decrypt(key, envelope);
  };

  const write = (tokenSet) => {
    if (!isValidTokenSet(tokenSet)) {
      throw new Error("Conjunto de tokens invalido para o cofre.");
    }
    ensureUserDataDir();
    const key = readMasterKey() || writeMasterKey();
    const iv = Buffer.from(randomBytes(IV_BYTES));
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const payload = JSON.stringify({
      accessToken: tokenSet.accessToken,
      refreshToken: tokenSet.refreshToken,
      accountId: tokenSet.accountId,
      displayName: tokenSet.displayName || "",
      expiresAt: tokenSet.expiresAt || 0,
      scope: tokenSet.scope || "",
    });
    const encrypted = Buffer.concat([
      cipher.update(payload, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const envelope = JSON.stringify({
      v: ENVELOPE_VERSION,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: encrypted.toString("base64"),
      updatedAt: new Date(now()).toISOString(),
    });
    const tmp = `${vaultPath}.tmp`;
    fileSystem.writeFileSync(tmp, envelope, { encoding: "utf8", mode: 0o600 });
    try {
      fileSystem.rmSync(vaultPath, { force: true });
    } catch {
      /* ignore */
    }
    fileSystem.renameSync(tmp, vaultPath);
    return true;
  };

  const clear = () => {
    cachedKey = null;
    try {
      fileSystem.rmSync(vaultPath, { force: true });
    } catch {
      /* ignore */
    }
    try {
      fileSystem.rmSync(keyPath, { force: true });
    } catch {
      /* ignore */
    }
  };

  const exists = () => {
    try {
      fileSystem.statSync(vaultPath);
      fileSystem.statSync(keyPath);
      return true;
    } catch {
      return false;
    }
  };

  return {
    read,
    write,
    clear,
    exists,
    paths: { vaultPath, keyPath },
  };
};

module.exports = {
  createEpicCredentialVault,
  VAULT_FILE_NAME,
  KEY_FILE_NAME,
  ENVELOPE_VERSION,
};
