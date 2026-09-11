"use strict";

const fs = require("node:fs");
const path = require("node:path");

const isInside = (parent, candidate) => {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const removeEmptyParents = async (startDirectory, stopDirectory) => {
  let current = path.resolve(startDirectory);
  const stop = path.resolve(stopDirectory);
  while (current !== stop && isInside(stop, current)) {
    const entries = await fs.promises.readdir(current).catch(() => null);
    if (!entries || entries.length > 0) break;
    await fs.promises.rmdir(current).catch(() => {});
    current = path.dirname(current);
  }
};

const assertAllowedArchive = (archivePath, downloadRoots) => {
  const resolved = path.resolve(String(archivePath || ""));
  if (!(downloadRoots || []).some((root) => isInside(root, resolved) && resolved !== path.resolve(root))) {
    throw new Error("O arquivo do mod nao pertence a uma pasta de downloads do Phelierium.");
  }
  return resolved;
};

const uninstallNexusMod = async ({
  manifestPath,
  archivePath,
  removeArchive = false,
  installationsRoot,
  backupRoot,
  downloadRoots,
}) => {
  const resolvedArchive = archivePath
    ? assertAllowedArchive(archivePath, downloadRoots)
    : "";

  if (manifestPath) {
    const resolvedManifest = path.resolve(String(manifestPath));
    if (!isInside(installationsRoot, resolvedManifest) || path.extname(resolvedManifest) !== ".json") {
      throw new Error("O manifesto de instalacao do mod e invalido.");
    }
    const raw = await fs.promises.readFile(resolvedManifest, "utf8");
    const manifest = JSON.parse(raw);
    // Compat v1 -> v2: v1 has files [{relativePath, backupPath}], v2 adds staging fields
    const gameRoot = path.resolve(String(manifest.gameRoot || ""));
    if (!path.isAbsolute(String(manifest.gameRoot || "")) || !Array.isArray(manifest.files)) {
      throw new Error("O manifesto de instalacao esta corrompido.");
    }

    const usedBackups = [];
    for (const item of [...manifest.files].reverse()) {
      const destination = path.resolve(gameRoot, String(item.relativePath || ""));
      if (!isInside(gameRoot, destination) || destination === gameRoot) {
        throw new Error("O manifesto tentou alterar um arquivo fora da pasta do jogo.");
      }
      if (item.backupPath) {
        const backupPath = path.resolve(String(item.backupPath));
        if (!isInside(backupRoot, backupPath)) throw new Error("O backup do mod e invalido.");
        const backupStats = await fs.promises.stat(backupPath).catch(() => null);
        if (!backupStats?.isFile()) throw new Error("Um backup necessario para remover o mod nao foi encontrado.");
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        await fs.promises.copyFile(backupPath, destination);
        usedBackups.push(backupPath);
      } else {
        await fs.promises.rm(destination, { force: true });
        await removeEmptyParents(path.dirname(destination), gameRoot);
      }
    }

    await fs.promises.rm(resolvedManifest, { force: true });
    await removeEmptyParents(path.dirname(resolvedManifest), installationsRoot);
    for (const backupPath of usedBackups) {
      await fs.promises.rm(backupPath, { force: true });
      await removeEmptyParents(path.dirname(backupPath), backupRoot);
    }
    // Cleanup v2 staging folder if present
    if (manifest.stagingPath) {
      const stagingPath = path.resolve(String(manifest.stagingPath));
      // Only remove if inside userData/mod-staging or sibling of backupRoot
      const allowedStagingParents = [path.resolve(backupRoot, "..", "mod-staging"), path.resolve(installationsRoot, "..", "mod-staging")];
      if (allowedStagingParents.some((p) => isInside(p, stagingPath)) || stagingPath.includes("mod-staging")) {
        await fs.promises.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
        // cleanup empty parents up to staging root
        const stagingRoot = path.resolve(backupRoot, "..", "mod-staging");
        if (isInside(stagingRoot, stagingPath)) {
          await removeEmptyParents(path.dirname(stagingPath), stagingRoot);
        }
      }
    }
  }

  if (removeArchive && resolvedArchive) {
    await fs.promises.rm(resolvedArchive, { force: true });
    const root = downloadRoots.find((candidate) => isInside(candidate, resolvedArchive));
    if (root) await removeEmptyParents(path.dirname(resolvedArchive), root);
  }

  return { removedFromGame: Boolean(manifestPath), archiveRemoved: removeArchive && Boolean(resolvedArchive) };
};

module.exports = { assertAllowedArchive, isInside, uninstallNexusMod };
