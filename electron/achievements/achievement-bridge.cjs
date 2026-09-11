const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PORT = 3000;
const MAX_PORT = 3010;
const LOCAL_HOST = "127.0.0.1";
const progressWriteQueues = new Map();

const extractSteamAppId = (gameId) => {
  const value = String(gameId || "").trim();
  return value.match(/^steam_(\d+)$/i)?.[1] ||
    value.match(/_steam_(\d+)$/i)?.[1] ||
    (/^\d+$/.test(value) ? value : null);
};

const sanitizeId = (value, label) => {
  const id = String(value || "").trim();
  if (!id) {
    throw new Error(`${label} ausente.`);
  }

  if (!/^[a-zA-Z0-9 ._\-:{}[\]()%#@!]+$/.test(id)) {
    throw new Error(`${label} invalido.`);
  }

  return id;
};

const readJsonFile = async (filePath) => {
  const raw = await fs.promises.readFile(filePath, "utf8");
  const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(normalized);
};

const ensureDir = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const writeJsonAtomic = async (filePath, payload) => {
  const directory = path.dirname(filePath);
  const tempFilePath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  await ensureDir(directory);
  await fs.promises.writeFile(tempFilePath, serialized, "utf8");
  await fs.promises.rename(tempFilePath, filePath);
};

const withQueuedProgressWrite = async (filePath, writer) => {
  const previousJob = progressWriteQueues.get(filePath) || Promise.resolve();
  const nextJob = previousJob
    .catch(() => undefined)
    .then(writer)
    .finally(() => {
      if (progressWriteQueues.get(filePath) === nextJob) {
        progressWriteQueues.delete(filePath);
      }
    });

  progressWriteQueues.set(filePath, nextJob);
  return nextJob;
};

const normalizeAchievementRecord = (achievementId, record) => {
  if (!record || typeof record !== "object") {
    return null;
  }

  const resolvedId = String(record.id || achievementId).trim();
  if (!resolvedId) {
    return null;
  }

  return {
    id: resolvedId,
    name: String(record.name || record.title || resolvedId),
    description: String(record.description || record.desc || ""),
    icon: String(record.icon || record.iconPath || ""),
  };
};

const findAchievementDefinition = (definitionFile, achievementId) => {
  const normalizedId = String(achievementId || "").trim().toLowerCase();
  if (Array.isArray(definitionFile?.achievements)) {
    const matched = definitionFile.achievements.find(
      (achievement) =>
        String(achievement?.id || achievement?.apiName || "").trim().toLowerCase() === normalizedId,
    );
    return normalizeAchievementRecord(achievementId, matched);
  }

  if (definitionFile?.achievements && typeof definitionFile.achievements === "object") {
    const key = Object.keys(definitionFile.achievements).find(
      (candidate) => candidate.toLowerCase() === normalizedId,
    );
    return normalizeAchievementRecord(achievementId, definitionFile.achievements[key || achievementId]);
  }

  if (definitionFile && typeof definitionFile === "object") {
    const key = Object.keys(definitionFile).find((candidate) => candidate.toLowerCase() === normalizedId);
    return normalizeAchievementRecord(achievementId, definitionFile[key || achievementId]);
  }

  return null;
};

const findDefinitionFile = async (achievementsDir, gameId) => {
  const exactPath = path.join(achievementsDir, `${gameId}.json`);
  try {
    return await readJsonFile(exactPath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }

  const appId = extractSteamAppId(gameId);
  if (!appId) return null;
  let files = [];
  try {
    files = await fs.promises.readdir(achievementsDir);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = await readJsonFile(path.join(achievementsDir, file));
      if (String(parsed?.steamAppId || "") === appId) return parsed;
    } catch {
      // Um cache corrompido não impede a busca nos demais arquivos.
    }
  }
  return null;
};

const createAchievementBridge = ({
  userDataPath,
  appUrl,
  logger = console,
  onAchievementUnlocked,
  normalizeAchievementId,
}) => {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  const unlockAchievement = async (gameId, achievementId) => {
    const cleanedGameId = sanitizeId(gameId, "gameId");
    const rawAchievementId = sanitizeId(achievementId, "achievementId");
    const normalizedAchievementId = normalizeAchievementId
      ? await normalizeAchievementId(cleanedGameId, rawAchievementId)
      : rawAchievementId;
    const cleanedAchievementId = sanitizeId(normalizedAchievementId, "achievementId");
    const achievementsDir = path.join(userDataPath, "achievements");
    const definitionsPath = path.join(achievementsDir, `${cleanedGameId}.json`);
    const progressPath = path.join(userDataPath, `user_progress_${cleanedGameId}.json`);

    let definitionFile = null;
    try {
      definitionFile = await findDefinitionFile(achievementsDir, cleanedGameId);
      if (!definitionFile) {
        const missing = new Error("Schema local ausente.");
        missing.code = "ENOENT";
        throw missing;
      }
    } catch (err) {
      if (err && err.code === "ENOENT" && appUrl) {
        const appid = extractSteamAppId(cleanedGameId);

        if (appid) {
          try {
            const schemaRes = await fetch(`${appUrl}/api/steam/achievement-schema?appId=${appid}`);
            if (schemaRes.ok) {
              const schemaData = await schemaRes.json();
              if (schemaData && Array.isArray(schemaData.achievements)) {
                await ensureDir(achievementsDir);
                await writeJsonAtomic(definitionsPath, { achievements: schemaData.achievements });
                definitionFile = { achievements: schemaData.achievements };
              }
            }
          } catch (fetchErr) {
            logger.error?.("[achievement-bridge] falha ao buscar definições online:", fetchErr);
          }
        }
      }
      
      if (!definitionFile) {
        definitionFile = { achievements: [] };
      }
    }

    let achievement = findAchievementDefinition(definitionFile, cleanedAchievementId);
    if (!achievement) {
      achievement = {
        id: cleanedAchievementId,
        name: cleanedAchievementId,
        description: "Conquista desbloqueada localmente.",
        icon: "",
      };
    }

    const unlockedAt = new Date().toISOString();
    const updatedProgress = await withQueuedProgressWrite(progressPath, async () => {
      let existingProgress = {
        gameId: cleanedGameId,
        unlockedAchievements: {},
        updatedAt: unlockedAt,
      };

      try {
        const current = await readJsonFile(progressPath);
        if (current && typeof current === "object") {
          existingProgress = {
            gameId: cleanedGameId,
            unlockedAchievements:
              current.unlockedAchievements && typeof current.unlockedAchievements === "object"
                ? current.unlockedAchievements
                : {},
            updatedAt: String(current.updatedAt || unlockedAt),
          };
        }
      } catch (error) {
        if (error && error.code !== "ENOENT") {
          throw error;
        }
      }

      const canonicalRecord = existingProgress.unlockedAchievements[cleanedAchievementId];
      const legacyRecord = rawAchievementId !== cleanedAchievementId
        ? existingProgress.unlockedAchievements[rawAchievementId]
        : null;
      const wasAlreadyUnlocked = Boolean(canonicalRecord || legacyRecord);
      existingProgress.unlockedAchievements[cleanedAchievementId] = {
        ...(legacyRecord || {}),
        ...achievement,
        unlockedAt,
      };
      if (rawAchievementId !== cleanedAchievementId) {
        delete existingProgress.unlockedAchievements[rawAchievementId];
      }
      existingProgress.updatedAt = unlockedAt;

      await writeJsonAtomic(progressPath, existingProgress);
      return { progress: existingProgress, duplicate: wasAlreadyUnlocked };
    });

    await onAchievementUnlocked({
      gameId: cleanedGameId,
      achievementId: cleanedAchievementId,
      achievement,
      unlockedAt,
      duplicate: updatedProgress.duplicate,
    });

    return {
      duplicate: updatedProgress.duplicate,
      achievementId: cleanedAchievementId,
      achievement,
      unlockedAt,
    };
  };

  const migrateAchievementAliases = async (gameId, aliases) => {
    const cleanedGameId = sanitizeId(gameId, "gameId");
    if (!aliases || typeof aliases !== "object") return { migrated: 0 };
    const achievementsDir = path.join(userDataPath, "achievements");
    const progressPath = path.join(userDataPath, `user_progress_${cleanedGameId}.json`);
    const definitionFile = await findDefinitionFile(achievementsDir, cleanedGameId).catch(() => null);

    return withQueuedProgressWrite(progressPath, async () => {
      let progress;
      try {
        progress = await readJsonFile(progressPath);
      } catch (error) {
        if (error && error.code === "ENOENT") return { migrated: 0 };
        throw error;
      }
      if (!progress?.unlockedAchievements || typeof progress.unlockedAchievements !== "object") {
        return { migrated: 0 };
      }

      let migrated = 0;
      for (const [rawId, targetId] of Object.entries(aliases)) {
        const legacy = progress.unlockedAchievements[rawId];
        const canonicalId = sanitizeId(targetId, "achievementId");
        if (!legacy || rawId === canonicalId) continue;
        const definition = findAchievementDefinition(definitionFile, canonicalId) || {
          id: canonicalId,
          name: canonicalId,
          description: "Conquista desbloqueada localmente.",
          icon: "",
        };
        const existingCanonical = progress.unlockedAchievements[canonicalId];
        progress.unlockedAchievements[canonicalId] = {
          ...legacy,
          ...(existingCanonical || {}),
          ...definition,
          unlockedAt: existingCanonical?.unlockedAt || legacy.unlockedAt || new Date().toISOString(),
        };
        delete progress.unlockedAchievements[rawId];
        migrated += 1;
      }

      if (migrated > 0) {
        progress.updatedAt = new Date().toISOString();
        await writeJsonAtomic(progressPath, progress);
      }
      return { migrated };
    });
  };

  app.post("/unlock", async (request, response) => {
    try {
      const gameId = request.body?.gameId;
      const achievementId = request.body?.achievementId;
      const result = await unlockAchievement(gameId, achievementId);
      response.json({
        ok: true,
        duplicate: result.duplicate,
        port: bridge?.address?.port,
      });
    } catch (error) {
      logger.error?.("[achievement-bridge] unlock failed", error);
      response.status(400).json({
        error: error instanceof Error ? error.message : "Falha ao desbloquear achievement.",
      });
    }
  });

  app.post("/", async (request, response) => {
    try {
      const appid = request.body?.appid;
      const achievementId = request.body?.achievement || request.body?.achievement_name || request.body?.achievementId;
      if (!appid || !achievementId) {
        response.status(400).json({ error: "Parâmetros appid ou achievement inválidos." });
        return;
      }

      // Toda origem usa a mesma chave para que watcher, receiver e polling
      // compartilhem progresso e deduplicação.
      const result = await unlockAchievement(`steam_${appid}`, achievementId);
      response.json({ ok: true, duplicate: result.duplicate });
    } catch (error) {
      logger.error?.("[achievement-bridge] Goldberg emulator post failed", error);
      response.status(400).json({
        error: error instanceof Error ? error.message : "Falha ao desbloquear achievement.",
      });
    }
  });

  let bridge = null;

  const start = async () => {
    for (let port = DEFAULT_PORT; port <= MAX_PORT; port += 1) {
      try {
        const server = await new Promise((resolve, reject) => {
          const httpServer = app.listen(port, LOCAL_HOST, () => resolve(httpServer));
          httpServer.once("error", reject);
        });

        bridge = {
          address: {
            host: LOCAL_HOST,
            port,
          },
          server,
        };

        logger.info?.(`[achievement-bridge] listening on http://${LOCAL_HOST}:${port}`);
        return bridge.address;
      } catch (error) {
        if (error && error.code === "EADDRINUSE" && port < MAX_PORT) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("Nenhuma porta livre encontrada para a achievement bridge.");
  };

  const stop = async () => {
    if (!bridge?.server) {
      return;
    }

    const server = bridge.server;
    bridge = null;

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  return {
    start,
    stop,
    unlockAchievement,
    migrateAchievementAliases,
    getAddress: () => bridge?.address || null,
  };
};

module.exports = {
  DEFAULT_PORT,
  MAX_PORT,
  createAchievementBridge,
};
