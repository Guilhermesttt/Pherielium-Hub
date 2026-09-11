const fs = require("node:fs");
const path = require("node:path");

const MAX_MANIFEST_FILES = 2_000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

const clean = (value, maxLength = 500) =>
  String(value ?? "").replace(/\0/g, "").trim().slice(0, maxLength);

const resolveExecutable = (installLocation, launchExecutable) => {
  const root = clean(installLocation, 2_000);
  const executable = clean(launchExecutable, 2_000);
  if (!root || !executable) return "";
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, executable);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative) || path.extname(resolved).toLowerCase() !== ".exe") {
    return "";
  }
  return resolved;
};

const normalizeEpicManifest = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = clean(raw.DisplayName || raw.AppName || raw.ArtifactId, 160);
  const appName = clean(raw.AppName || raw.ArtifactId, 200);
  const namespace = clean(raw.NamespaceId || raw.Namespace, 200);
  const catalogId = clean(raw.CatalogItemId || raw.ItemId, 200);
  if (!title || (!appName && !catalogId)) return null;
  const installLocation = clean(raw.InstallLocation, 2_000);
  const executablePath = resolveExecutable(installLocation, raw.LaunchExecutable);
  const id = catalogId || appName;
  const epicLaunchId = namespace && catalogId && appName
    ? `${namespace}:${catalogId}:${appName}`
    : (catalogId || appName);

  return {
    id,
    catalogId,
    namespace,
    name: title,
    title,
    appName,
    epicLaunchId,
    executablePath,
    installLocation,
    source: "installed",
  };
};

const readJsonFile = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_MANIFEST_BYTES) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const readInstalledEpicGames = (programData = process.env.ProgramData || process.env.ALLUSERSPROFILE || "C:\\ProgramData") => {
  const games = [];
  const manifestsDirectory = path.join(
    programData,
    "Epic",
    "EpicGamesLauncher",
    "Data",
    "Manifests",
  );
  try {
    const files = fs.readdirSync(manifestsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".item"))
      .slice(0, MAX_MANIFEST_FILES);
    for (const entry of files) {
      const game = normalizeEpicManifest(readJsonFile(path.join(manifestsDirectory, entry.name)));
      if (game) games.push(game);
    }
  } catch {
    // Epic Games Launcher may not be installed for this Windows user.
  }

  const launcherInstalledPath = path.join(
    programData,
    "Epic",
    "UnrealEngineLauncher",
    "LauncherInstalled.dat",
  );
  const installedPayload = readJsonFile(launcherInstalledPath);
  for (const raw of Array.isArray(installedPayload?.InstallationList)
    ? installedPayload.InstallationList
    : []) {
    const game = normalizeEpicManifest(raw);
    if (game) games.push(game);
  }

  const deduplicated = new Map();
  for (const game of games) {
    const key = `${game.catalogId || game.id}:${game.appName}`.toLowerCase();
    const current = deduplicated.get(key);
    if (!current) {
      deduplicated.set(key, game);
      continue;
    }
    const currentNameIsOpaque =
      /^[a-f0-9]{24,}$/i.test(current.name)
      || current.name.toLowerCase() === current.appName.toLowerCase();
    const nextNameIsOpaque =
      /^[a-f0-9]{24,}$/i.test(game.name)
      || game.name.toLowerCase() === game.appName.toLowerCase();
    const preferredName = currentNameIsOpaque && !nextNameIsOpaque
      ? game.name
      : current.name;
    deduplicated.set(key, {
      ...current,
      name: preferredName,
      title: preferredName,
      namespace: current.namespace || game.namespace,
      catalogId: current.catalogId || game.catalogId,
      epicLaunchId:
        current.namespace && current.catalogId && current.appName
          ? current.epicLaunchId
          : game.epicLaunchId,
      executablePath: current.executablePath || game.executablePath,
      installLocation: current.installLocation || game.installLocation,
    });
  }
  return [...deduplicated.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
};

const searchInstalledEpicGames = (query, programData) => {
  const normalizedQuery = clean(query, 160).toLocaleLowerCase("pt-BR");
  if (normalizedQuery.length < 2) return [];
  return readInstalledEpicGames(programData)
    .filter((game) =>
      [game.name, game.appName, game.catalogId]
        .some((value) => clean(value).toLocaleLowerCase("pt-BR").includes(normalizedQuery)))
    .slice(0, 25);
};

module.exports = {
  normalizeEpicManifest,
  readInstalledEpicGames,
  searchInstalledEpicGames,
};
