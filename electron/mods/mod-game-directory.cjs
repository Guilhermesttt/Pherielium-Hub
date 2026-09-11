"use strict";

const fs = require("node:fs");
const path = require("node:path");

const GAME_EXECUTABLES = {
  cyberpunk2077: path.join("bin", "x64", "Cyberpunk2077.exe"),
};

const autoDetectGameDirectory = async ({ gameDomain, gameTitle }) => {
  const normalizedDomain = String(gameDomain || "").toLowerCase();

  // 1. Verificar caminhos da Steam
  const steamRoots = [
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam",
    "D:\\SteamLibrary",
    "E:\\SteamLibrary",
    "F:\\SteamLibrary",
  ];

  for (const steamRoot of steamRoots) {
    const vdfPath = path.join(steamRoot, "steamapps", "libraryfolders.vdf");
    const vdfExists = await fs.promises.stat(vdfPath).then((s) => s.isFile()).catch(() => false);
    if (vdfExists) {
      const content = await fs.promises.readFile(vdfPath, "utf8").catch(() => "");
      const matches = [...content.matchAll(/"path"\s+"([^"]+)"/g)];
      for (const match of matches) {
        const libraryPath = match[1].replace(/\\\\/g, "\\");
        const candidateNames = [
          gameTitle,
          normalizedDomain === "cyberpunk2077" ? "Cyberpunk 2077" : "",
        ].filter(Boolean);

        for (const candidateName of candidateNames) {
          const candidatePath = path.join(libraryPath, "steamapps", "common", candidateName);
          const executableRelative = GAME_EXECUTABLES[normalizedDomain];

          if (executableRelative) {
            const exePath = path.join(candidatePath, executableRelative);
            const exeStats = await fs.promises.stat(exePath).catch(() => null);
            if (exeStats?.isFile()) return candidatePath;
          } else {
            const stats = await fs.promises.stat(candidatePath).catch(() => null);
            if (stats?.isDirectory()) return candidatePath;
          }
        }
      }
    }
  }

  // 2. Verificar caminhos da Epic Games (Manifests)
  const epicManifestDir = "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests";
  const epicDirExists = await fs.promises.stat(epicManifestDir).then((s) => s.isDirectory()).catch(() => false);
  if (epicDirExists) {
    const files = await fs.promises.readdir(epicManifestDir).catch(() => []);
    for (const file of files) {
      if (file.endsWith(".item")) {
        try {
          const raw = await fs.promises.readFile(path.join(epicManifestDir, file), "utf8");
          const manifest = JSON.parse(raw);
          const titleMatch = gameTitle && manifest.DisplayName?.toLowerCase() === String(gameTitle).toLowerCase();
          const domainMatch = normalizedDomain === "cyberpunk2077" && manifest.AppName?.toLowerCase().includes("cyberpunk");

          if ((titleMatch || domainMatch) && manifest.InstallLocation) {
            const candidatePath = path.normalize(manifest.InstallLocation);
            const executableRelative = GAME_EXECUTABLES[normalizedDomain];
            if (executableRelative) {
              const exePath = path.join(candidatePath, executableRelative);
              const exeStats = await fs.promises.stat(exePath).catch(() => null);
              if (exeStats?.isFile()) return candidatePath;
            } else {
              const stats = await fs.promises.stat(candidatePath).catch(() => null);
              if (stats?.isDirectory()) return candidatePath;
            }
          }
        } catch {
          // Ignora falhas de parse de manifestos individuais
        }
      }
    }
  }

  return null;
};

const selectModGameDirectory = async ({
  dialog,
  parentWindow,
  gameTitle,
  gameDomain,
  fsImpl = fs,
  autoDetect = false,
}) => {
  if (autoDetect) {
    const autoPath = await autoDetectGameDirectory({ gameDomain, gameTitle }).catch(() => null);
    if (autoPath) {
      return autoPath;
    }
  }

  const safeGameTitle = String(gameTitle || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 120);
  const result = await dialog.showOpenDialog(parentWindow, {
    title: safeGameTitle
      ? `Selecione a pasta de ${safeGameTitle}`
      : "Selecione a pasta do jogo",
    properties: ["openDirectory"],
    buttonLabel: "Selecionar pasta",
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const rawSelectedPath = String(result.filePaths[0] || "");
  if (!path.isAbsolute(rawSelectedPath)) {
    throw new Error("Selecione uma pasta de jogo valida.");
  }
  const selectedPath = path.resolve(rawSelectedPath);
  const stats = await fsImpl.promises.stat(selectedPath).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error("Selecione uma pasta de jogo valida.");
  }
  return path.normalize(selectedPath);
};

module.exports = { autoDetectGameDirectory, selectModGameDirectory };
