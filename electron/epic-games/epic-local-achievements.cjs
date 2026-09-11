const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  parseGenericIniAchievements,
} = require("../games/emulator-detector.cjs");
const { readInstalledEpicGames } = require("./epic-manifests.cjs");

const MAX_DEPTH = 7;
const MAX_ENTRIES = 25_000;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".json", ".ini", ".txt"]);
const BINARY_SAVE_EXTENSIONS = new Set([".bin", ".db", ".sav", ".save", ".sqlite", ".sqlite3"]);
const SKIPPED_DIRECTORIES = new Set([
  ".egstore",
  "binaries",
  "content",
  "engine",
  "movies",
  "redistributables",
]);

const clean = (value, maxLength = 1_000) =>
  String(value ?? "").replace(/\0/g, "").trim().slice(0, maxLength);

const normalizeLookup = (value) =>
  clean(value, 300)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();

const normalizePath = (value) => {
  const raw = clean(value, 2_000);
  if (!raw) return "";
  try {
    return path.resolve(raw).toLowerCase();
  } catch {
    return "";
  }
};

const asBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "unlocked", "earned", "completed"].includes(normalized)) return true;
    if (["0", "false", "no", "locked", "pending"].includes(normalized)) return false;
  }
  return false;
};

const asUnixTime = (value) => {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10_000_000_000 ? Math.floor(numeric / 1_000) : Math.floor(numeric);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : 0;
};

const localizedText = (value) => {
  if (typeof value === "string" || typeof value === "number") return clean(value, 500);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  for (const key of ["pt-BR", "pt_BR", "pt", "en-US", "en_US", "english", "en", "default"]) {
    if (value[key] != null) {
      const resolved = localizedText(value[key]);
      if (resolved) return resolved;
    }
  }
  for (const entry of Object.values(value)) {
    const resolved = localizedText(entry);
    if (resolved) return resolved;
  }
  return "";
};

const firstValue = (entry, names) => {
  const keys = new Map(Object.keys(entry).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const actual = keys.get(name.toLowerCase());
    if (actual) return entry[actual];
  }
  return undefined;
};

const resolveIcon = (value, sourcePath) => {
  const raw = clean(localizedText(value), 4_000);
  if (!raw) return "";
  if (/^(?:https?:|data:image\/)/i.test(raw)) return raw;

  const iconPath = path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.resolve(path.dirname(sourcePath), raw.replace(/[\\/]+/g, path.sep));
  try {
    const stats = fs.statSync(iconPath);
    if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_ICON_BYTES) return "";
    const extension = path.extname(iconPath).toLowerCase();
    const mime = {
      ".gif": "image/gif",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    }[extension];
    if (!mime) return "";
    return `data:${mime};base64,${fs.readFileSync(iconPath).toString("base64")}`;
  } catch {
    return "";
  }
};

const achievementFromEntry = (entry, fallbackId, sourcePath) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const rawId = firstValue(entry, [
    "achievementId",
    "achievement_id",
    "achievementName",
    "apiName",
    "api_name",
    "unlockId",
    "unlock_id",
    "id",
  ]);
  const hasAchievementFields = Object.keys(entry).some((key) =>
    /^(?:achievement|display.?name|unlock|earned|achieved|completed|icon.?gray|hidden)/i.test(key));
  const id = clean(rawId ?? (hasAchievementFields ? fallbackId : ""), 300);
  if (!id || /^(?:achievements?|items?|data|definitions?|records?|progress)$/i.test(id)) return null;

  const rawName = firstValue(entry, ["displayName", "display_name", "title", "label"]);
  const rawDescription = firstValue(entry, ["description", "desc", "details"]);
  const rawIcon = firstValue(entry, ["unlockedIcon", "unlocked_icon", "icon", "iconUrl", "icon_url"]);
  const rawGrayIcon = firstValue(entry, ["lockedIcon", "locked_icon", "iconGray", "icon_gray"]);
  const earnedValue = firstValue(entry, [
    "isUnlocked",
    "is_unlocked",
    "unlocked",
    "earned",
    "achieved",
    "completed",
  ]);
  const unlockTimeValue = firstValue(entry, [
    "unlockTime",
    "unlock_time",
    "unlockedAt",
    "unlocked_at",
    "earnedTime",
    "earned_time",
    "achievedAt",
  ]);

  return {
    apiName: id,
    name: localizedText(rawName) || clean(firstValue(entry, ["name"]), 500) || id,
    description: localizedText(rawDescription),
    icon: resolveIcon(rawIcon, sourcePath),
    iconGray: resolveIcon(rawGrayIcon, sourcePath),
    hidden: asBoolean(firstValue(entry, ["hidden", "isHidden", "is_hidden"])),
    achieved: asBoolean(earnedValue) || asUnixTime(unlockTimeValue) > 0,
    unlockTime: asUnixTime(unlockTimeValue),
  };
};

const looksLikeAchievementEntry = (entry) =>
  Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
  && Object.keys(entry).some((key) =>
    /^(?:achievement|api.?name|display.?name|unlock|is.?unlocked|earned|achieved|icon|hidden)/i.test(key));

const collectJsonAchievements = (data, sourcePath) => {
  const found = [];
  const visited = new Set();

  const walk = (value, fallbackId = "", depth = 0, achievementContext = false) => {
    if (depth > 8 || value == null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 5_000)) {
        const parsed = achievementFromEntry(entry, "", sourcePath);
        if (parsed && (achievementContext || looksLikeAchievementEntry(entry))) {
          found.push(parsed);
        } else {
          walk(entry, "", depth + 1, achievementContext);
        }
      }
      return;
    }

    const direct = achievementFromEntry(value, fallbackId, sourcePath);
    if (direct && (achievementContext || looksLikeAchievementEntry(value))) {
      found.push(direct);
    }

    for (const [key, child] of Object.entries(value)) {
      if (child == null || typeof child !== "object") continue;
      const nextContext = achievementContext
        || /(?:achievement|troph|unlock)/i.test(key);
      const childFallback = nextContext
        && !/^(?:achievements?|items?|data|definitions?|records?|progress)$/i.test(key)
        ? key
        : "";
      walk(child, childFallback, depth + 1, nextContext);
    }
  };

  walk(data, "", 0, false);
  return found;
};

const collectIniAchievements = (content, sourcePath) => {
  const state = parseGenericIniAchievements(content);
  const definitions = new Map();
  let currentSection = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      currentSection = clean(section[1], 300);
      continue;
    }
    const field = line.match(/^([^=;#]+?)\s*=\s*(.*?)\s*$/);
    if (!field || !currentSection || /^(?:Steam)?Achievements$/i.test(currentSection)) continue;
    const key = field[1].trim().toLowerCase();
    if (!["name", "displayname", "display_name", "description", "desc", "icon", "icon_gray"].includes(key)) continue;
    const current = definitions.get(currentSection) || {};
    current[key] = field[2].trim().replace(/^["']|["']$/g, "");
    definitions.set(currentSection, current);
  }

  const ids = new Set([...Object.keys(state), ...definitions.keys()]);
  return [...ids].map((id) => {
    const definition = definitions.get(id) || {};
    const progress = state[id] || { earned: false, earnedTime: 0 };
    return {
      apiName: id,
      name: clean(definition.name || definition.displayname || definition.display_name, 500) || id,
      description: clean(definition.description || definition.desc, 1_000),
      icon: resolveIcon(definition.icon, sourcePath),
      iconGray: resolveIcon(definition.icon_gray, sourcePath),
      hidden: false,
      achieved: Boolean(progress.earned),
      unlockTime: Number(progress.earnedTime || 0),
    };
  });
};

const mergeAchievements = (target, incoming) => {
  for (const achievement of incoming) {
    const key = achievement.apiName.toLowerCase();
    const current = target.get(key);
    if (!current) {
      target.set(key, achievement);
      continue;
    }
    target.set(key, {
      ...current,
      name: current.name !== current.apiName ? current.name : achievement.name,
      description: current.description || achievement.description,
      icon: current.icon || achievement.icon,
      iconGray: current.iconGray || achievement.iconGray,
      hidden: current.hidden || achievement.hidden,
      achieved: current.achieved || achievement.achieved,
      unlockTime: Math.max(current.unlockTime || 0, achievement.unlockTime || 0),
    });
  }
};

const matchesRequest = (game, request) => {
  const requestedCatalog = clean(request?.epicCatalogId || request?.catalogId, 300).toLowerCase();
  const requestedLaunch = clean(request?.epicLaunchId, 800).toLowerCase();
  const requestedExecutable = normalizePath(request?.executablePath);
  const requestedTitle = normalizeLookup(request?.title);
  if (requestedCatalog && clean(game.catalogId, 300).toLowerCase() === requestedCatalog) return true;
  if (requestedLaunch && clean(game.epicLaunchId, 800).toLowerCase() === requestedLaunch) return true;
  if (requestedExecutable && normalizePath(game.executablePath) === requestedExecutable) return true;
  return Boolean(requestedTitle && normalizeLookup(game.title) === requestedTitle);
};

const addExistingDirectory = (target, value) => {
  const candidate = clean(value, 2_000);
  if (!candidate) return;
  try {
    if (fs.statSync(candidate).isDirectory()) target.set(normalizePath(candidate), path.resolve(candidate));
  } catch {
    // Optional save directories are expected to be absent for many games.
  }
};

const titleVariants = (request, installed) => {
  const values = [
    request?.title,
    installed?.title,
    installed?.name,
    installed?.appName,
    path.basename(clean(request?.executablePath || installed?.executablePath), ".exe"),
  ];
  const result = new Set();
  for (const value of values) {
    const raw = clean(value, 180).replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim();
    if (raw.length >= 2) result.add(raw);
    const normalized = normalizeLookup(raw);
    if (normalized.length >= 2) result.add(normalized);
  }
  return [...result];
};

const collectRoots = (request, installed, options) => {
  const roots = new Map();
  const executablePath = clean(installed?.executablePath || request?.executablePath, 2_000);
  addExistingDirectory(roots, installed?.installLocation);
  if (executablePath) addExistingDirectory(roots, path.dirname(executablePath));

  const home = options.home || os.homedir();
  const localAppData = options.localAppData || process.env.LOCALAPPDATA;
  const appData = options.appData || process.env.APPDATA;
  const documents = options.documents || path.join(home, "Documents");
  const savedGames = options.savedGames || path.join(home, "Saved Games");
  const variants = titleVariants(request, installed);
  const parentRoots = [
    localAppData,
    appData,
    documents,
    path.join(documents, "My Games"),
    savedGames,
  ].filter(Boolean);

  for (const parent of parentRoots) {
    for (const variant of variants) addExistingDirectory(roots, path.join(parent, variant));
  }

  return [...roots.values()];
};

const isTextCandidate = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) return false;
  const basename = path.basename(filePath).toLowerCase();
  const parent = path.basename(path.dirname(filePath)).toLowerCase();
  return /(?:achievement|troph|unlock)/i.test(`${parent}/${basename}`)
    || /^(?:stats?|progress|profile)\.(?:json|ini|txt)$/i.test(basename);
};

const scanRoot = (root) => {
  const textFiles = [];
  const binarySaveFiles = [];
  const queue = [{ directory: root, depth: 0 }];
  let visitedEntries = 0;

  while (queue.length > 0 && visitedEntries < MAX_ENTRIES) {
    const current = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > MAX_ENTRIES) break;
      const fullPath = path.join(current.directory, entry.name);
      if (entry.isDirectory()) {
        if (current.depth >= MAX_DEPTH) continue;
        const normalizedName = entry.name.toLowerCase();
        const achievementDirectory = /(?:achievement|troph|save|profile|stat|config)/i.test(normalizedName);
        if (SKIPPED_DIRECTORIES.has(normalizedName) && !achievementDirectory) continue;
        queue.push({ directory: fullPath, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (isTextCandidate(fullPath)) {
        textFiles.push(fullPath);
      } else if (
        BINARY_SAVE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        && /(?:save|profile|progress|achievement|troph)/i.test(fullPath)
      ) {
        binarySaveFiles.push(fullPath);
      }
    }
  }

  return { textFiles, binarySaveFiles, truncated: visitedEntries >= MAX_ENTRIES };
};

const readEpicLocalAchievements = (request = {}, options = {}) => {
  const installedGames = options.installedGames || readInstalledEpicGames(options.programData);
  const installed = installedGames.find((game) => matchesRequest(game, request)) || null;
  const roots = collectRoots(request, installed, options);
  const achievementMap = new Map();
  const readableFiles = [];
  const binarySaveFiles = [];
  let scanTruncated = false;

  for (const root of roots) {
    const scanned = scanRoot(root);
    scanTruncated ||= scanned.truncated;
    binarySaveFiles.push(...scanned.binarySaveFiles);
    for (const filePath of scanned.textFiles) {
      let stats;
      try {
        stats = fs.statSync(filePath);
      } catch {
        continue;
      }
      if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_TEXT_BYTES) continue;

      try {
        const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
        const extension = path.extname(filePath).toLowerCase();
        const parsed = extension === ".json"
          ? collectJsonAchievements(JSON.parse(content), filePath)
          : collectIniAchievements(content, filePath);
        if (parsed.length === 0) continue;
        mergeAchievements(achievementMap, parsed);
        readableFiles.push(filePath);
      } catch {
        // Malformed, encrypted or unrelated candidate file.
      }
    }
  }

  const achievements = [...achievementMap.values()];
  const binarySaveDetected = binarySaveFiles.length > 0;
  const status = achievements.length > 0
    ? "ok"
    : roots.length === 0
      ? "not-installed"
      : binarySaveDetected
        ? "binary-save"
        : "no-readable-files";

  return {
    source: "epic-local",
    status,
    installed: Boolean(installed || roots.length > 0),
    installLocation: clean(installed?.installLocation || roots[0], 2_000),
    achievements,
    total: achievements.length,
    unlocked: achievements.filter((achievement) => achievement.achieved).length,
    readableFileCount: readableFiles.length,
    binarySaveDetected,
    scanTruncated,
  };
};

module.exports = {
  collectIniAchievements,
  collectJsonAchievements,
  readEpicLocalAchievements,
};
