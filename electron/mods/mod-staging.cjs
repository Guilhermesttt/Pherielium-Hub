"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STAGING_DIR_NAME = "mod-staging";

function getStagingRoot(userDataPath, gameDomain) {
  return path.join(
    path.resolve(String(userDataPath || "")),
    STAGING_DIR_NAME,
    String(gameDomain || "").toLowerCase().trim() || "unknown"
  );
}

function getStagingModDir(userDataPath, gameDomain, modId, installId) {
  return path.join(getStagingRoot(userDataPath, gameDomain), String(modId), String(installId));
}

async function computeFileHash(filePath, algo = "sha256") {
  const hash = crypto.createHash(algo);
  const stream = fs.createReadStream(filePath);
  await new Promise((resolve, reject) => {
    stream.on("data", (d) => hash.update(d));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

async function computeBufferHash(buffer, algo = "sha256") {
  return crypto.createHash(algo).update(buffer).digest("hex");
}

// Decide deploy method: hardlink if same volume, fallback copy
async function deployFile(stagingFile, destination, preferred = "hardlink") {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  // Remove existing symlink/hardlink/file before new deploy
  await fs.promises.rm(destination, { force: true }).catch(() => {});

  if (preferred === "hardlink") {
    try {
      await fs.promises.link(stagingFile, destination);
      return "hardlink";
    } catch {
      // cross-device or permission -> fallback copy
    }
  }
  if (preferred === "symlink") {
    try {
      // junction for dirs, file symlink needs admin on windows; try then fallback
      await fs.promises.symlink(stagingFile, destination);
      return "symlink";
    } catch {
      // fallback copy
    }
  }
  await fs.promises.copyFile(stagingFile, destination);
  return "copy";
}

async function mkdirClean(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  await fs.promises.mkdir(dir, { recursive: true });
}

module.exports = {
  STAGING_DIR_NAME,
  getStagingRoot,
  getStagingModDir,
  computeFileHash,
  computeBufferHash,
  deployFile,
  mkdirClean,
};
