"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CACHE_TTL_MS = 60 * 60 * 1000;

const readJson = async (filePath, fsImpl) => {
  const raw = await fsImpl.promises.readFile(filePath, "utf8");
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
};

const writeJsonAtomic = async (filePath, data, fsImpl) => {
  const dir = path.dirname(filePath);
  await fsImpl.promises.mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fsImpl.promises.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  try {
    await fsImpl.promises.rename(tempPath, filePath);
  } catch {
    try {
      if (fsImpl.existsSync(filePath)) await fsImpl.promises.unlink(filePath);
      await fsImpl.promises.rename(tempPath, filePath);
    } catch {
      try { await fsImpl.promises.unlink(tempPath); } catch {}
      throw new Error("Falha ao gravar cache de conquistas Epic.");
    }
  }
};

const sanitizeCacheKey = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "_")
    .slice(0, 200);

const createEpicAchievementsCache = ({ userDataPath, fsImpl = fs, nowImpl = () => Date.now() }) => {
  if (!userDataPath) {
    throw new Error("userDataPath e obrigatorio para o EpicAchievementsCache.");
  }

  const cacheDir = path.join(userDataPath, "achievements", "epic-cache");

  const getCachePath = (appName) =>
    path.join(cacheDir, `${sanitizeCacheKey(appName)}.json`);

  const readCache = async (appName) => {
    try {
      const cachePath = getCachePath(appName);
      if (!fsImpl.existsSync(cachePath)) return null;
      const cached = await readJson(cachePath, fsImpl);
      if (!cached || typeof cached !== "object") return null;
      if (cached.expiresAt && nowImpl() > cached.expiresAt) return null;
      return cached.data || null;
    } catch {
      return null;
    }
  };

  const writeCache = async (appName, data) => {
    try {
      const cachePath = getCachePath(appName);
      await writeJsonAtomic(cachePath, {
        data,
        cachedAt: new Date().toISOString(),
        expiresAt: nowImpl() + CACHE_TTL_MS,
      }, fsImpl);
    } catch {}
  };

  const invalidateCache = async (appName) => {
    try {
      const cachePath = getCachePath(appName);
      if (fsImpl.existsSync(cachePath)) {
        await fsImpl.promises.unlink(cachePath);
      }
    } catch {}
  };

  const clearAll = async () => {
    try {
      if (fsImpl.existsSync(cacheDir)) {
        const files = await fsImpl.promises.readdir(cacheDir);
        for (const file of files) {
          if (String(file).toLowerCase().endsWith(".json")) {
            await fsImpl.promises
              .unlink(path.join(cacheDir, String(file)))
              .catch(() => {});
          }
        }
      }
    } catch {}
  };

  return {
    readCache,
    writeCache,
    invalidateCache,
    clearAll,
    cacheDir,
  };
};

module.exports = {
  createEpicAchievementsCache,
  CACHE_TTL_MS,
};
