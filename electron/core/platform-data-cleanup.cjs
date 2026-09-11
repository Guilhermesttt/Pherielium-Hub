const fs = require("node:fs");
const path = require("node:path");

const isSafeSubpath = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};

const cleanupPlatformAchievementFiles = async ({
  userDataPath,
  fsImpl = fs,
  steamAppIds = [],
  epicCatalogIds = [],
  platform,
}) => {
  if (!userDataPath) {
    throw new Error("userDataPath e obrigatorio.");
  }

  const deletedFiles = [];
  const safeUserData = path.resolve(userDataPath);
  const achievementsDir = path.join(safeUserData, "achievements");

  const candidateAppIds = new Set(
    (Array.isArray(steamAppIds) ? steamAppIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );

  const candidateEpicIds = new Set(
    (Array.isArray(epicCatalogIds) ? epicCatalogIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );

  const filesToDelete = [];

  if (platform === "steam") {
    for (const appId of candidateAppIds) {
      filesToDelete.push(path.join(achievementsDir, `steam_${appId}.json`));
      filesToDelete.push(path.join(safeUserData, `user_progress_steam_${appId}.json`));
      filesToDelete.push(path.join(safeUserData, `user_progress_${appId}.json`));
    }
  } else if (platform === "epic") {
    for (const catalogId of candidateEpicIds) {
      filesToDelete.push(path.join(achievementsDir, `epic_${catalogId}.json`));
      filesToDelete.push(path.join(achievementsDir, `${catalogId}.json`));
      filesToDelete.push(path.join(safeUserData, `user_progress_epic_${catalogId}.json`));
    }
  }

  for (const filePath of filesToDelete) {
    const resolvedPath = path.resolve(filePath);
    if (!isSafeSubpath(safeUserData, resolvedPath)) {
      continue;
    }

    try {
      if (fsImpl.existsSync(resolvedPath)) {
        await fsImpl.promises.unlink(resolvedPath);
        deletedFiles.push(resolvedPath);
      }
    } catch (err) {
      console.warn(`[platform-cleanup] Falha ao excluir arquivo ${resolvedPath}:`, err);
    }
  }

  return { deletedFiles };
};

module.exports = {
  cleanupPlatformAchievementFiles,
};
