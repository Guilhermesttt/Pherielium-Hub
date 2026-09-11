"use strict";

const fs = require("node:fs");
const path = require("node:path");

function getStoreFilePath(userDataPath, gameId) {
  const safeGameId = String(gameId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const profilesDir = path.join(userDataPath, "mod_profiles");
  fs.mkdirSync(profilesDir, { recursive: true });
  return path.join(profilesDir, `${safeGameId}.json`);
}

function loadModProfiles(userDataPath, gameId) {
  const filePath = getStoreFilePath(userDataPath, gameId);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveModProfile(userDataPath, gameId, profileName, activeInstallIds, options = {}) {
  const profiles = loadModProfiles(userDataPath, gameId);
  const now = new Date().toISOString();
  const cleanName = String(profileName || "").trim() || "Perfil Personalizado";
  // Load-order: order in array defines priority (0 = lowest, last = highest/winner)
  const orderedIds = Array.isArray(activeInstallIds) ? [...activeInstallIds] : [];
  const loadOrder = options.loadOrder && Array.isArray(options.loadOrder) ? [...options.loadOrder] : orderedIds;
  const priorityMap = new Map(loadOrder.map((id, idx) => [String(id), idx]));

  const existingIndex = profiles.findIndex((p) => String(p.name).toLowerCase() === cleanName.toLowerCase());
  if (existingIndex >= 0) {
    profiles[existingIndex].activeInstallIds = orderedIds;
    profiles[existingIndex].loadOrder = loadOrder;
    profiles[existingIndex].priorityMap = Object.fromEntries(priorityMap);
    profiles[existingIndex].updatedAt = now;
  } else {
    profiles.push({
      id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      gameId,
      activeInstallIds: orderedIds,
      loadOrder,
      priorityMap: Object.fromEntries(priorityMap),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 2,
    });
  }

  const filePath = getStoreFilePath(userDataPath, gameId);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(profiles, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
  return profiles;
}

function deleteModProfile(userDataPath, gameId, profileId) {
  let profiles = loadModProfiles(userDataPath, gameId);
  profiles = profiles.filter((p) => p.id !== profileId);
  const filePath = getStoreFilePath(userDataPath, gameId);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(profiles, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
  return profiles;
}

function applyModProfile(userDataPath, gameId, profileId) {
  const profiles = loadModProfiles(userDataPath, gameId);
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error("Perfil de mods não encontrado.");
  return profile;
}

function getProfileLoadOrder(profile) {
  if (Array.isArray(profile.loadOrder) && profile.loadOrder.length > 0) return profile.loadOrder;
  if (Array.isArray(profile.activeInstallIds)) return profile.activeInstallIds;
  return [];
}

module.exports = {
  loadModProfiles,
  saveModProfile,
  deleteModProfile,
  applyModProfile,
  getProfileLoadOrder,
};
