"use strict";

const fs = require("node:fs");
const path = require("node:path");

const extractSteamAppId = (value) => {
  const normalized = String(value || "").trim();
  return normalized.match(/^steam_(\d+)$/i)?.[1]
    || normalized.match(/_steam_(\d+)$/i)?.[1]
    || (/^\d+$/.test(normalized) ? normalized : null);
};

const readJson = async (filePath) => {
  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
};

const achievementIdsFromDefinitions = (definitions) => {
  if (Array.isArray(definitions)) {
    return definitions
      .map((achievement) => String(achievement?.id || achievement?.apiName || "").trim())
      .filter(Boolean);
  }
  if (definitions && typeof definitions === "object") {
    return Object.keys(definitions).filter(Boolean);
  }
  return [];
};

const unlockedIdsFromProgress = (progress) => {
  if (!progress?.unlockedAchievements || typeof progress.unlockedAchievements !== "object") {
    return [];
  }
  return Object.keys(progress.unlockedAchievements).filter(Boolean);
};

const createAggregate = () => ({
  definitionIds: new Set(),
  unlockedIds: new Set(),
});

const publicAggregate = (aggregate) => ({
  total: aggregate.definitionIds.size,
  unlocked: aggregate.unlockedIds.size,
});

const readAchievementLibrarySummary = async (userDataPath) => {
  const achievementsDir = path.join(userDataPath, "achievements");
  const epicCacheDir = path.join(achievementsDir, "epic-cache");
  const byGameIdInternal = new Map();
  const bySteamAppIdInternal = new Map();
  const byEpicAppNameInternal = new Map();
  const steamAppIdByGameId = new Map();
  const gameIdsBySteamAppId = new Map();

  let definitionFiles = [];
  try {
    definitionFiles = await fs.promises.readdir(achievementsDir);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  for (const file of definitionFiles) {
    if (!file.toLowerCase().endsWith(".json")) continue;
    const gameId = path.basename(file, ".json");
    try {
      const definition = await readJson(path.join(achievementsDir, file));
      const steamAppId = String(definition?.steamAppId || extractSteamAppId(gameId) || "").trim();
      const ids = achievementIdsFromDefinitions(definition?.achievements);
      const gameAggregate = byGameIdInternal.get(gameId) || createAggregate();
      ids.forEach((id) => gameAggregate.definitionIds.add(id));
      byGameIdInternal.set(gameId, gameAggregate);

      if (steamAppId) {
        steamAppIdByGameId.set(gameId, steamAppId);
        const linkedGameIds = gameIdsBySteamAppId.get(steamAppId) || new Set();
        linkedGameIds.add(gameId);
        gameIdsBySteamAppId.set(steamAppId, linkedGameIds);
        const steamAggregate = bySteamAppIdInternal.get(steamAppId) || createAggregate();
        ids.forEach((id) => steamAggregate.definitionIds.add(id));
        bySteamAppIdInternal.set(steamAppId, steamAggregate);
      }
    } catch {
      // Um cache corrompido nao deve impedir a reconciliacao dos outros jogos.
    }
  }

  let epicCacheFiles = [];
  try {
    epicCacheFiles = await fs.promises.readdir(epicCacheDir);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  for (const file of epicCacheFiles) {
    if (!file.toLowerCase().endsWith(".json")) continue;
    const epicAppName = path.basename(file, ".json");
    try {
      const cached = await readJson(path.join(epicCacheDir, file));
      const list = cached?.data?.list || cached?.list || [];
      if (!Array.isArray(list) || list.length === 0) continue;

      const ids = list
        .map((ach) => String(ach?.apiName || "").trim())
        .filter(Boolean);
      const epicAggregate = byEpicAppNameInternal.get(epicAppName) || createAggregate();
      ids.forEach((id) => epicAggregate.definitionIds.add(id));
      list
        .filter((ach) => ach?.achieved)
        .forEach((ach) => epicAggregate.unlockedIds.add(String(ach.apiName).trim()));
      byEpicAppNameInternal.set(epicAppName, epicAggregate);

      const gameAggregate = byGameIdInternal.get(`epic_${epicAppName}`) || createAggregate();
      ids.forEach((id) => gameAggregate.definitionIds.add(id));
      list
        .filter((ach) => ach?.achieved)
        .forEach((ach) => gameAggregate.unlockedIds.add(String(ach.apiName).trim()));
      byGameIdInternal.set(`epic_${epicAppName}`, gameAggregate);
    } catch {
      // Cache corrompido nao deve impedir outros.
    }
  }

  let progressFiles = [];
  try {
    progressFiles = await fs.promises.readdir(userDataPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  for (const file of progressFiles) {
    const match = file.match(/^user_progress_(.+)\.json$/i);
    if (!match) continue;
    const gameId = match[1];
    try {
      const progress = await readJson(path.join(userDataPath, file));
      const unlockedIds = unlockedIdsFromProgress(progress);
      const gameAggregate = byGameIdInternal.get(gameId) || createAggregate();
      unlockedIds.forEach((id) => gameAggregate.unlockedIds.add(id));
      byGameIdInternal.set(gameId, gameAggregate);

      const steamAppId = String(
        steamAppIdByGameId.get(gameId) || extractSteamAppId(gameId) || "",
      ).trim();
      if (steamAppId) {
        const steamAggregate = bySteamAppIdInternal.get(steamAppId) || createAggregate();
        unlockedIds.forEach((id) => steamAggregate.unlockedIds.add(id));
        bySteamAppIdInternal.set(steamAppId, steamAggregate);

        for (const linkedGameId of gameIdsBySteamAppId.get(steamAppId) || []) {
          const linkedAggregate = byGameIdInternal.get(linkedGameId) || createAggregate();
          unlockedIds.forEach((id) => linkedAggregate.unlockedIds.add(id));
          byGameIdInternal.set(linkedGameId, linkedAggregate);
        }
      }
    } catch {
      // Um progresso corrompido nao deve apagar os demais totais.
    }
  }

  const byGameId = Object.fromEntries(
    Array.from(byGameIdInternal, ([gameId, aggregate]) => [gameId, publicAggregate(aggregate)]),
  );
  const bySteamAppId = Object.fromEntries(
    Array.from(bySteamAppIdInternal, ([appId, aggregate]) => [appId, publicAggregate(aggregate)]),
  );
  const byEpicAppName = Object.fromEntries(
    Array.from(byEpicAppNameInternal, ([appName, aggregate]) => [appName, publicAggregate(aggregate)]),
  );

  return {
    byGameId,
    bySteamAppId,
    byEpicAppName,
    updatedAt: new Date().toISOString(),
  };
};

module.exports = {
  extractSteamAppId,
  readAchievementLibrarySummary,
};
