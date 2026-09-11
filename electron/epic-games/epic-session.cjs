"use strict";
/**
 * Epic session lifecycle.
 *
 * Sits on top of the credential vault. Tracks token expiry, refreshes
 * proactively (5 minutes before expiry) via the Legendary CLI, and surfaces
 * the current token set without ever putting it in logs.
 *
 * Public surface:
 *   createEpicSession({ vault, legendary, now?, refreshLeadMs?, logger? })
 *     .get()      -> Promise<TokenSet | null>
 *     .validate() -> Promise<{ valid: boolean, reason?: 'missing' | 'expired' | 'network' }>
 *     .refresh()  -> Promise<TokenSet>
 *     .setFromAuthCode(code) -> Promise<TokenSet>
 *     .clear()    -> Promise<void>
 *     .getAccountSummary() -> Promise<{ accountId, displayName } | null>
 */

const REFRESH_LEAD_MS = 5 * 60 * 1000;
const ACCOUNT_RE = /"account_id"\s*:\s*"([^"]+)"/;
const DISPLAY_RE = /"display_name"\s*:\s*"([^"]+)"/;
const TOKEN_RE = /\beg1~[A-Za-z0-9_\-]+/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-]+/gi;

const redact = (value) => {
  if (typeof value !== "string" || value.length === 0) return value;
  return value
    .replace(TOKEN_RE, "eg1~[redacted]")
    .replace(BEARER_RE, "Bearer [redacted]");
};

const safeLog = (logger, level, message) => {
  if (!logger || typeof logger[level] !== "function") return;
  try {
    logger[level](redact(String(message)));
  } catch {
    /* never let logging break the flow */
  }
};

const parseAuthOutput = (output) => {
  if (typeof output !== "string" || output.length === 0) {
    return { accountId: "", displayName: "" };
  }
  const accountMatch = output.match(ACCOUNT_RE);
  const displayMatch = output.match(DISPLAY_RE);
  return {
    accountId: accountMatch ? accountMatch[1] : "",
    displayName: displayMatch ? displayMatch[1] : "",
  };
};

const isTokenSet = (value) =>
  value &&
  typeof value === "object" &&
  typeof value.accessToken === "string" &&
  typeof value.refreshToken === "string" &&
  typeof value.accountId === "string";

const createEpicSession = ({
  vault,
  legendary,
  now = () => Date.now(),
  refreshLeadMs = REFRESH_LEAD_MS,
  logger,
} = {}) => {
  if (!vault || typeof vault.read !== "function" || typeof vault.write !== "function") {
    throw new TypeError("Vault de credenciais invalido.");
  }
  if (!legendary || typeof legendary.run !== "function") {
    throw new TypeError("Legendary manager invalido.");
  }

  const isExpiringSoon = (tokenSet) => {
    if (!tokenSet || !Number.isFinite(tokenSet.expiresAt) || tokenSet.expiresAt === 0) {
      return true;
    }
    return tokenSet.expiresAt - now() <= refreshLeadMs;
  };

  const performRefresh = async (currentSet) => {
    if (!currentSet || typeof currentSet.refreshToken !== "string") {
      throw new Error("Refresh token ausente. Reautenticacao obrigatoria.");
    }
    const output = await legendary.run([
      "auth",
      "--refresh-token",
      currentSet.refreshToken,
      "-y",
    ]);
    if (typeof output !== "string" || output.length === 0) {
      throw new Error("Falha ao atualizar token: Legendary sem saida.");
    }
    const parsed = parseAuthOutput(output);
    const next = {
      accessToken: output.trim(),
      refreshToken: currentSet.refreshToken,
      accountId: parsed.accountId || currentSet.accountId || "",
      displayName: parsed.displayName || currentSet.displayName || "",
      // Legendary does not return expires_in for refresh; assume 2h validity.
      expiresAt: now() + 2 * 60 * 60 * 1000,
      scope: currentSet.scope || "",
    };
    if (!isTokenSet(next)) {
      throw new Error("Resposta de refresh incompleta.");
    }
    vault.write(next);
    return next;
  };

  const performAuth = async (code) => {
    const trimmed = String(code || "").trim();
    if (trimmed.length < 8) {
      throw new Error("Codigo de autorizacao invalido.");
    }
    const output = await legendary.run(["auth", "--code", trimmed, "-y"]);
    if (typeof output !== "string" || output.trim().length === 0) {
      throw new Error("Falha na autenticacao: Legendary sem saida.");
    }
    const parsed = parseAuthOutput(output);
    const tokenSet = {
      accessToken: output.trim(),
      refreshToken: output.trim(),
      accountId: parsed.accountId,
      displayName: parsed.displayName,
      expiresAt: now() + 2 * 60 * 60 * 1000,
      scope: "",
    };
    if (!isTokenSet(tokenSet)) {
      throw new Error("Resposta de autenticacao incompleta.");
    }
    vault.write(tokenSet);
    return tokenSet;
  };

  const get = async () => {
    const stored = vault.read();
    if (!stored) return null;
    if (isExpiringSoon(stored)) {
      try {
        return await performRefresh(stored);
      } catch (err) {
        safeLog(logger, "warn", `[epic-session] refresh failed: ${err.message}`);
        return stored;
      }
    }
    return stored;
  };

  const validate = async () => {
    const stored = vault.read();
    if (!stored) return { valid: false, reason: "missing" };
    if (isExpiringSoon(stored)) {
      try {
        const refreshed = await performRefresh(stored);
        return refreshed ? { valid: true } : { valid: false, reason: "expired" };
      } catch (err) {
        safeLog(logger, "warn", `[epic-session] validate refresh failed: ${err.message}`);
        return { valid: false, reason: "network" };
      }
    }
    return { valid: true };
  };

  const refresh = async () => {
    const stored = vault.read();
    if (!stored) {
      throw new Error("Nenhum token armazenado para atualizar.");
    }
    return performRefresh(stored);
  };

  const setFromAuthCode = async (code) => performAuth(code);

  const clear = async () => {
    vault.clear();
    if (typeof legendary.logout === "function") {
      try {
        await legendary.logout();
      } catch {
        /* ignore — vault already cleared */
      }
    }
  };

  const getAccountSummary = async () => {
    const stored = vault.read();
    if (!stored) return null;
    return {
      accountId: stored.accountId,
      displayName: stored.displayName || "",
    };
  };

  return {
    get,
    validate,
    refresh,
    setFromAuthCode,
    clear,
    getAccountSummary,
  };
};

module.exports = {
  createEpicSession,
  REFRESH_LEAD_MS,
};
