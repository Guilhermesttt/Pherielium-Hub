/**
 * emulator-detector.cjs
 *
 * Implementa o Padrão Adapter para suportar múltiplos emuladores da cena
 * sem quebrar a assinatura original esperada pelo 'main.cjs'.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// ─── Emulator type identifiers ────────────────────────────────────────────────
const EMULATOR_TYPES = {
  RUNE: "rune",
  GOLDBERG_V1: "goldberg_v1",
  GOLDBERG_SOCIALCLUB: "goldberg_socialclub",
  TENOKE: "tenoke",
  GENERIC_INI: "generic_ini"
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const tryReadJson = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(normalized);
  } catch {
    return null;
  }
};

const parseJsonAchievementState = (data) => {
  if (!data || typeof data !== "object") return {};
  const source = data.achievements && typeof data.achievements === "object"
    ? data.achievements
    : data;
  const result = {};
  for (const [id, entry] of Object.entries(source)) {
    if (!id || entry == null) continue;
    if (typeof entry === "boolean" || typeof entry === "number") {
      result[id] = { earned: Boolean(entry), earnedTime: 0 };
      continue;
    }
    if (typeof entry !== "object" || Array.isArray(entry)) continue;
    const earnedValue = entry.earned ?? entry.achieved ?? entry.unlocked ?? false;
    const parsedEarned = parseBooleanLike(earnedValue);
    result[id] = {
      earned: parsedEarned ?? Boolean(earnedValue),
      earnedTime: Number(entry.earned_time ?? entry.earnedTime ?? entry.unlock_time ?? entry.unlockTime ?? 0),
    };
  }
  return result;
};

// ─── Estrutura de Adaptadores ───────────────────────────────────────────────

const readTextFile = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.toString("utf16le").replace(/^\uFEFF/, "");
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return Buffer.from(buffer).swap16().toString("utf16le").replace(/^\uFEFF/, "");
    }
  }
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
};

const parseIniSections = (content) => {
  const sections = new Map();
  let currentSection = "";
  sections.set(currentSection, new Map());

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!sections.has(currentSection)) sections.set(currentSection, new Map());
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) sections.get(currentSection).set(key, value);
  }

  return sections;
};

const parseBooleanLike = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
};

const getSectionValue = (section, names) => {
  if (!section) return undefined;
  for (const [key, value] of section.entries()) {
    if (names.some((name) => key.toLowerCase() === name.toLowerCase())) {
      return value;
    }
  }
  return undefined;
};

const parseGenericIniAchievements = (content) => {
  const sections = parseIniSections(content);
  const result = {};

  // ── Passo 1: seções nomeadas (cada seção = um achievement) ───────────────────
  for (const [sectionName, section] of sections.entries()) {
    if (!sectionName || /^(?:Steam)?Achievements$/i.test(sectionName) || /^UserStats$/i.test(sectionName)) {
      continue;
    }

    const achievedValue = getSectionValue(section, ["Achieved", "Earned", "Unlocked", "IsAchieved"]);
    const earned = parseBooleanLike(achievedValue);
    if (earned === null) continue;

    const unlockTimeValue = getSectionValue(section, [
      "UnlockTime",
      "UnlockTimestamp",
      "UnlockedAt",
      "earned_time",
      "earnedTime",
    ]);
    const unlockTime = Number(unlockTimeValue || 0);

    result[sectionName] = {
      earned,
      earnedTime: Number.isFinite(unlockTime) ? unlockTime : 0,
    };
  }

  // ── Passo 2: seção [Achievements] / [SteamAchievements] plana ───────────────
  // Suporta dois sub-formatos:
  //   a) KEY=1|0|true|false          (Goldberg legacy, CODEX, RUNE)
  //   b) Achievement0=ACH_ID         (índice numérico → earned=true)
  // Bonus: KEY_TIME=<unix>  para forks CODEX que emitem o timestamp separado.
  for (const [sectionName, section] of sections.entries()) {
    if (!/^(?:Steam)?Achievements$/i.test(sectionName)) continue;

    // Primeiro coletamos todos os timestamps disponíveis (KEY_TIME=unix)
    const timeMap = new Map();
    for (const [key, value] of section.entries()) {
      if (!key) continue;
      const timeMatch = key.match(/^(.+)_TIME$/i);
      if (timeMatch) {
        const baseKey = timeMatch[1];
        const ts = Number(value || 0);
        if (Number.isFinite(ts) && ts > 0) timeMap.set(baseKey.toLowerCase(), ts);
      }
    }

    for (const [key, value] of section.entries()) {
      if (!key || key.toLowerCase() === "count" || /_TIME$/i.test(key)) continue;

      const booleanValue = parseBooleanLike(value);
      if (booleanValue !== null) {
        const ts = timeMap.get(key.toLowerCase()) || (booleanValue ? Date.now() / 1000 : 0);
        const existing = result[key];
        result[key] = {
          earned: Boolean(existing?.earned || booleanValue),
          earnedTime: Number(existing?.earnedTime || ts || 0),
        };
        continue;
      }

      // Formato índice: Achievement0=ACH_ID
      if (!/^Achievement\d+$/i.test(key)) continue;
      const achievementId = String(value || "").trim();
      if (!achievementId || result[achievementId]) continue;
      result[achievementId] = { earned: true, earnedTime: Date.now() / 1000 };
    }
  }

  return result;
};

const parseRuneAchievementAliases = (content) => {
  const sections = parseIniSections(content);
  const aliases = {};
  const mapping = sections.get("SteamAchievements");
  if (!mapping) return aliases;

  for (const [rawKey, rawValue] of mapping.entries()) {
    if (!rawKey || rawKey.toLowerCase() === "count") continue;
    const canonicalId = String(rawValue || "").trim();
    if (!canonicalId) continue;

    const indexedKey = rawKey.match(/^Achievement(\d+)$/i)?.[1];
    const alias = indexedKey == null
      ? String(rawKey).trim()
      : String(indexedKey).padStart(5, "0");
    aliases[alias] = canonicalId;
  }
  return aliases;
};

const parseRuneAchievements = (content) => {
  const parsed = parseGenericIniAchievements(content);
  const aliases = parseRuneAchievementAliases(content);
  const normalized = {};

  for (const [rawId, state] of Object.entries(parsed)) {
    // Em RUNE, as chaves zero-padded de [SteamAchievements] são aliases,
    // não estados booleanos (mesmo quando o valor canônico é "1").
    if (aliases[rawId]) continue;
    const canonicalId = aliases[rawId] || rawId;
    const previous = normalized[canonicalId];
    normalized[canonicalId] = previous
      ? {
          earned: Boolean(previous.earned || state.earned),
          earnedTime: Math.max(Number(previous.earnedTime || 0), Number(state.earnedTime || 0)),
        }
      : state;
  }
  return normalized;
};

class RuneAdapter {
  constructor() {
    this.emulatorType = EMULATOR_TYPES.RUNE;
  }

  _getPaths(appId) {
    const publicDocs = path.join(process.env.PUBLIC || "C:\\Users\\Public", "Documents");
    const watchDir = path.join(publicDocs, "Steam", "RUNE", String(appId));
    return { watchDir, savePath: path.join(watchDir, "achievements.ini") };
  }

  detect(gamePath) {
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, "RUNE.ini")) ||
      fs.existsSync(path.join(gamePath, "rune.ini"));
  }

  readAchievements(appId, _gamePath, providedSavePath) {
    const savePath = providedSavePath || this._getPaths(appId).savePath;
    if (!savePath || !fs.existsSync(savePath)) return {};
    try {
      return parseRuneAchievements(readTextFile(savePath));
    } catch {
      return {};
    }
  }

  getAliases(appId, providedSavePath) {
    const savePath = providedSavePath || this._getPaths(appId).savePath;
    if (!savePath || !fs.existsSync(savePath)) return {};
    try {
      return parseRuneAchievementAliases(readTextFile(savePath));
    } catch {
      return {};
    }
  }

  getWatchInfo(appId) {
    return { emulatorType: this.emulatorType, ...this._getPaths(appId) };
  }
}

class GoldbergAdapter {
  constructor() {
    this.emulatorType = EMULATOR_TYPES.GOLDBERG_V1;
  }

  _getPaths(appId) {
    const appDataRoaming = path.join(os.homedir(), "AppData", "Roaming");
    const goldbergClassic = path.join(appDataRoaming, "Goldberg SteamEmu Saves", String(appId));
    const goldbergGse = path.join(appDataRoaming, "GSE Saves", String(appId));
    const appDataBase = fs.existsSync(goldbergGse) ? goldbergGse : goldbergClassic;
    return {
      watchDir: appDataBase,
      savePath: path.join(appDataBase, "achievements.json"),
    };
  }

  detect(gamePath) {
    if (!gamePath) return false;
    const hasSteamSettings = fs.existsSync(path.join(gamePath, "steam_settings"));
    if (!hasSteamSettings) return false;
    const settingsMarkers = [
      "steam_appid.txt",
      "configs.app.ini",
      "configs.user.ini",
      "steam_interfaces.txt",
    ];
    return settingsMarkers.some((name) => fs.existsSync(path.join(gamePath, "steam_settings", name)));
  }

  readAchievements(appId, gamePath, providedSavePath) {
    const savePath = providedSavePath || this._getPaths(appId).savePath;
    const data = tryReadJson(savePath);
    if (!data || typeof data !== "object") return {};

    return parseJsonAchievementState(data);
  }

  writeAchievements(appId, data, gamePath) {
    // Escrita é delegada no main.cjs
    return false;
  }

  watchSaves(appId, callback) {
    return null;
  }
  
  getWatchInfo(appId) {
    const paths = this._getPaths(appId);
    return {
      emulatorType: this.emulatorType,
      savePath: paths.savePath,
      watchDir: paths.watchDir
    };
  }
}

class GoldbergSocialClubAdapter {
  constructor() {
    this.emulatorType = EMULATOR_TYPES.GOLDBERG_SOCIALCLUB;
  }

  _getPaths(appId) {
    const appDataRoaming = path.join(os.homedir(), "AppData", "Roaming");
    const appDataBase = path.join(appDataRoaming, "Goldberg Socialclub Emu Saves", String(appId));
    return {
      watchDir: appDataBase,
      savePath: path.join(appDataBase, "achievements.json"),
    };
  }

  detect(gamePath) {
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, "socialclub_emu.ini")) || 
           fs.existsSync(path.join(gamePath, "socialclub.dll")) ||
           fs.existsSync(path.join(gamePath, "GTA5.exe")) ||
           fs.existsSync(path.join(gamePath, "RDR2.exe"));
  }

  readAchievements(appId, gamePath, providedSavePath) {
    const savePath = providedSavePath || this._getPaths(appId).savePath;
    const data = tryReadJson(savePath);
    if (!data || typeof data !== "object") return {};

    return parseJsonAchievementState(data);
  }

  writeAchievements(appId, data, gamePath) {
    return false;
  }

  watchSaves(appId, callback) {
    return null;
  }
  
  getWatchInfo(appId) {
    const paths = this._getPaths(appId);
    return {
      emulatorType: this.emulatorType,
      savePath: paths.savePath,
      watchDir: paths.watchDir
    };
  }
}

class TenokeAdapter {
  constructor() {
    this.emulatorType = EMULATOR_TYPES.TENOKE;
  }

  _getPaths(appId) {
    const appDataLocal = path.join(os.homedir(), "AppData", "Local");
    const appDataBase = path.join(appDataLocal, "TENOKE", String(appId));
    return {
      watchDir: appDataBase,
      savePath: path.join(appDataBase, "achievements.json"),
    };
  }

  detect(gamePath) {
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, "tenoke.ini"));
  }

  readAchievements(appId, gamePath, providedSavePath) {
    const savePath = providedSavePath || this._getPaths(appId).savePath;
    const data = tryReadJson(savePath);
    if (!data || typeof data !== "object") return {};

    return parseJsonAchievementState(data);
  }

  writeAchievements(appId, data, gamePath) {
    return false;
  }

  watchSaves(appId, callback) {
    return null;
  }
  
  getWatchInfo(appId) {
    const paths = this._getPaths(appId);
    return {
      emulatorType: this.emulatorType,
      savePath: paths.savePath,
      watchDir: paths.watchDir
    };
  }
}

class GenericIniAdapter {
  constructor() {
    this.emulatorType = EMULATOR_TYPES.GENERIC_INI;
  }

  _getPaths(appId, gamePath) {
    let iniPath = null;
    let watchDir = null;
    
    if (gamePath) {
      if (fs.existsSync(path.join(gamePath, "steam_emu.ini"))) {
        iniPath = path.join(gamePath, "steam_emu.ini");
      } else if (fs.existsSync(path.join(gamePath, "ALI213.ini"))) {
        iniPath = path.join(gamePath, "ALI213.ini");
      }
      if (iniPath) watchDir = path.dirname(iniPath);
    }
    
    const publicDocs = path.join(process.env.PUBLIC || "C:\\Users\\Public", "Documents");
    const runePath = path.join(publicDocs, "Steam", "RUNE", String(appId), "remote", "achievements.ini");
    const codexPath = path.join(publicDocs, "Steam", "CODEX", String(appId), "remote", "achievements.ini");
    
    if (fs.existsSync(runePath)) {
      return { watchDir: path.dirname(runePath), savePath: runePath };
    }
    if (fs.existsSync(codexPath)) {
      return { watchDir: path.dirname(codexPath), savePath: codexPath };
    }

    return {
      watchDir: watchDir || gamePath || "",
      savePath: iniPath || "",
    };
  }

  detect(gamePath) {
    if (!gamePath) return false;
    return fs.existsSync(path.join(gamePath, "steam_emu.ini")) || 
           fs.existsSync(path.join(gamePath, "ALI213.ini"));
  }

  readAchievements(appId, gamePath, providedSavePath) {
    const savePath = providedSavePath || this._getPaths(appId, gamePath).savePath;
    if (!savePath || !fs.existsSync(savePath)) return {};

    try {
      return parseGenericIniAchievements(readTextFile(savePath));
    } catch {
      return {};
    }
  }
  writeAchievements(appId, data, gamePath) {
    return false; // Modo Read-Only
  }

  watchSaves(appId, callback) {
    return null; // Modo Read-Only
  }
  
  getWatchInfo(appId, gamePath) {
    const paths = this._getPaths(appId, gamePath);
    return {
      emulatorType: this.emulatorType,
      savePath: paths.savePath,
      watchDir: paths.watchDir
    };
  }
}

// ─── Seletor Universal e Escaneamento de Caminhos (Baseado no Hydra) ──────────

const adapters = [
  new RuneAdapter(),
  new GoldbergSocialClubAdapter(), // Prioridade alta para testes de GTA
  new TenokeAdapter(),
  new GenericIniAdapter(),
  new GoldbergAdapter() // Fallback padrão
];

const _loggedDetectionPaths = new Set();

const getScannedEmulator = (appId, gameDir) => {
  if (!appId) return null;

  const appData = path.join(os.homedir(), "AppData", "Roaming");
  const localAppData = path.join(os.homedir(), "AppData", "Local");
  const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
  const publicDocs = path.join(process.env.PUBLIC || "C:\\Users\\Public", "Documents");
  const documents = path.join(os.homedir(), "Documents");

  const candidates = [
    // Goldberg
    {
      emulatorType: EMULATOR_TYPES.GOLDBERG_V1,
      savePath: path.join(appData, "Goldberg SteamEmu Saves", String(appId), "achievements.json"),
      watchDir: path.join(appData, "Goldberg SteamEmu Saves", String(appId))
    },
    {
      emulatorType: EMULATOR_TYPES.GOLDBERG_V1,
      savePath: path.join(appData, "GSE Saves", String(appId), "achievements.json"),
      watchDir: path.join(appData, "GSE Saves", String(appId))
    },
    // Goldberg Social Club
    {
      emulatorType: EMULATOR_TYPES.GOLDBERG_SOCIALCLUB,
      savePath: path.join(appData, "Goldberg Socialclub Emu Saves", String(appId), "achievements.json"),
      watchDir: path.join(appData, "Goldberg Socialclub Emu Saves", String(appId))
    },
    // Tenoke
    {
      emulatorType: EMULATOR_TYPES.TENOKE,
      savePath: path.join(localAppData, "TENOKE", String(appId), "achievements.json"),
      watchDir: path.join(localAppData, "TENOKE", String(appId))
    },
    // RUNE
    {
      emulatorType: EMULATOR_TYPES.RUNE,
      savePath: path.join(publicDocs, "Steam", "RUNE", String(appId), "achievements.ini"),
      watchDir: path.join(publicDocs, "Steam", "RUNE", String(appId))
    },
    {
      emulatorType: EMULATOR_TYPES.RUNE,
      savePath: path.join(publicDocs, "Steam", "RUNE", String(appId), "remote", "achievements.ini"),
      watchDir: path.join(publicDocs, "Steam", "RUNE", String(appId), "remote")
    },
    // CODEX
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(publicDocs, "Steam", "CODEX", String(appId), "achievements.ini"),
      watchDir: path.join(publicDocs, "Steam", "CODEX", String(appId))
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(publicDocs, "Steam", "CODEX", String(appId), "remote", "achievements.ini"),
      watchDir: path.join(publicDocs, "Steam", "CODEX", String(appId), "remote")
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(appData, "Steam", "CODEX", String(appId), "achievements.ini"),
      watchDir: path.join(appData, "Steam", "CODEX", String(appId))
    },
    // OnlineFix
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(publicDocs, "OnlineFix", String(appId), "Stats", "Achievements.ini"),
      watchDir: path.join(publicDocs, "OnlineFix", String(appId), "Stats")
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(publicDocs, "OnlineFix", String(appId), "Achievements.ini"),
      watchDir: path.join(publicDocs, "OnlineFix", String(appId))
    },
    // RLD! / DODI / PLAZA
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(programData, "RLD!", String(appId), "achievements.ini"),
      watchDir: path.join(programData, "RLD!", String(appId))
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(programData, "Steam", "Player", String(appId), "stats", "achievements.ini"),
      watchDir: path.join(programData, "Steam", "Player", String(appId), "stats")
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(programData, "Steam", "RLD!", String(appId), "stats", "achievements.ini"),
      watchDir: path.join(programData, "Steam", "RLD!", String(appId), "stats")
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(programData, "Steam", "dodi", String(appId), "stats", "achievements.ini"),
      watchDir: path.join(programData, "Steam", "dodi", String(appId), "stats")
    },
    // Skidrow
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(documents, "SKIDROW", String(appId), "SteamEmu", "UserStats", "achiev.ini"),
      watchDir: path.join(documents, "SKIDROW", String(appId), "SteamEmu", "UserStats")
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(documents, "Player", String(appId), "SteamEmu", "UserStats", "achiev.ini"),
      watchDir: path.join(documents, "Player", String(appId), "SteamEmu", "UserStats")
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(localAppData, "SKIDROW", String(appId), "SteamEmu", "UserStats", "achiev.ini"),
      watchDir: path.join(localAppData, "SKIDROW", String(appId), "SteamEmu", "UserStats")
    },
    // SmartSteamEmu
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(appData, "SmartSteamEmu", String(appId), "User", "Achievements.ini"),
      watchDir: path.join(appData, "SmartSteamEmu", String(appId), "User")
    },
    // CreamAPI
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(appData, "CreamAPI", String(appId), "stats", "CreamAPI.Achievements.cfg"),
      watchDir: path.join(appData, "CreamAPI", String(appId), "stats")
    },
    // RLE
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(appData, "RLE", String(appId), "achievements.ini"),
      watchDir: path.join(appData, "RLE", String(appId))
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(appData, "RLE", String(appId), "Achievements.ini"),
      watchDir: path.join(appData, "RLE", String(appId))
    },
    // 3DM
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(appData, "3DM", String(appId), "User", "achievements.ini"),
      watchDir: path.join(appData, "3DM", String(appId), "User")
    },
    {
      emulatorType: EMULATOR_TYPES.GOLDBERG_V1,
      savePath: path.join(appData, "3DM", String(appId), "achievements.json"),
      watchDir: path.join(appData, "3DM", String(appId))
    },
    // FLT (FearLess Revolution)
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(programData, "Steam", "FLT", String(appId), "stats", "achievements.ini"),
      watchDir: path.join(programData, "Steam", "FLT", String(appId), "stats")
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(programData, "Steam", "FLT", String(appId), "achievements.ini"),
      watchDir: path.join(programData, "Steam", "FLT", String(appId))
    },
    // CPY
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(programData, "Steam", "CPY", String(appId), "stats", "achievements.ini"),
      watchDir: path.join(programData, "Steam", "CPY", String(appId), "stats")
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(programData, "Steam", "CPY", String(appId), "achievements.ini"),
      watchDir: path.join(programData, "Steam", "CPY", String(appId))
    },
    // Empress
    {
      emulatorType: EMULATOR_TYPES.GOLDBERG_V1,
      savePath: path.join(appData, "Empress", String(appId), "achievements.json"),
      watchDir: path.join(appData, "Empress", String(appId))
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(appData, "Empress", String(appId), "stats", "achievements.ini"),
      watchDir: path.join(appData, "Empress", String(appId), "stats")
    },
    // Ali213 AppData (variante além da pasta do jogo)
    {
      emulatorType: EMULATOR_TYPES.GOLDBERG_V1,
      savePath: path.join(appData, "Ali213", String(appId), "achievements.json"),
      watchDir: path.join(appData, "Ali213", String(appId))
    },
    {
      emulatorType: EMULATOR_TYPES.GENERIC_INI,
      savePath: path.join(appData, "Ali213", String(appId), "stats", "achievements.ini"),
      watchDir: path.join(appData, "Ali213", String(appId), "stats")
    }
  ];

  // Adiciona caminhos internos da pasta do jogo se fornecida
  if (gameDir) {
    candidates.push(
      {
        emulatorType: EMULATOR_TYPES.GENERIC_INI,
        savePath: path.join(gameDir, "SteamData", "user_stats.ini"),
        watchDir: path.join(gameDir, "SteamData")
      },
      {
        emulatorType: EMULATOR_TYPES.GENERIC_INI,
        savePath: path.join(gameDir, "3DMGAME", "Player", "stats", "achievements.ini"),
        watchDir: path.join(gameDir, "3DMGAME", "Player", "stats")
      }
    );
  }

  // ── Passo 1: verifica caminhos exatos da lista de candidates ─────────────────
  for (const cand of candidates) {
    if (fs.existsSync(cand.savePath)) {
      if (!_loggedDetectionPaths.has(cand.savePath)) {
        _loggedDetectionPaths.add(cand.savePath);
        console.log(`[EmulatorDetector] Arquivo exato encontrado: ${cand.savePath} (Emulador: ${cand.emulatorType})`);
      }
      return { ...cand, detectionSource: "known-path", confidence: "high" };
    }
  }

  // ── Passo 2: busca em profundidade (depth 2) nos diretórios raiz conhecidos ──
  // Cobre variações de layout que não estão na lista estática (ex: RUNE/<id>/remote/stats/)
  const rootDirs = [
    { dir: path.join(appData, "Goldberg SteamEmu Saves", String(appId)), emulatorType: EMULATOR_TYPES.GOLDBERG_V1 },
    { dir: path.join(appData, "GSE Saves", String(appId)), emulatorType: EMULATOR_TYPES.GOLDBERG_V1 },
    { dir: path.join(appData, "Goldberg Socialclub Emu Saves", String(appId)), emulatorType: EMULATOR_TYPES.GOLDBERG_SOCIALCLUB },
    { dir: path.join(localAppData, "TENOKE", String(appId)), emulatorType: EMULATOR_TYPES.TENOKE },
    { dir: path.join(publicDocs, "Steam", "RUNE", String(appId)), emulatorType: EMULATOR_TYPES.RUNE },
    { dir: path.join(publicDocs, "Steam", "CODEX", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
    { dir: path.join(publicDocs, "Steam", "FLT", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
    { dir: path.join(publicDocs, "Steam", "CPY", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
    { dir: path.join(publicDocs, "OnlineFix", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
    { dir: path.join(programData, "RLD!", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
    { dir: path.join(appData, "SmartSteamEmu", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
    { dir: path.join(appData, "3DM", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
    { dir: path.join(appData, "Empress", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
    { dir: path.join(appData, "Ali213", String(appId)), emulatorType: EMULATOR_TYPES.GENERIC_INI },
  ];

  const ACH_FILENAMES = [
    "achievements.json", "achievements.ini", "Achievements.ini",
    "achiev.ini", "CreamAPI.Achievements.cfg", "user_stats.ini",
  ];

  const scanDepth = (dir, depth, emulatorType) => {
    if (depth > 2) return null;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return null; }

    // Primeiro checa arquivos no nível atual
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const lname = entry.name.toLowerCase();
      if (ACH_FILENAMES.some(n => n.toLowerCase() === lname)) {
        const fullPath = path.join(dir, entry.name);
        return {
          emulatorType,
          savePath: fullPath,
          watchDir: dir,
          detectionSource: "known-root-scan",
          confidence: "medium",
        };
      }
    }
    // Depois desce nos subdiretórios
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const found = scanDepth(path.join(dir, entry.name), depth + 1, emulatorType);
      if (found) return found;
    }
    return null;
  };

  for (const root of rootDirs) {
    if (!fs.existsSync(root.dir)) continue;
    const found = scanDepth(root.dir, 0, root.emulatorType);
    if (found) {
      if (!_loggedDetectionPaths.has(found.savePath)) {
        _loggedDetectionPaths.add(found.savePath);
        console.log(`[EmulatorDetector] Arquivo encontrado via busca profunda: ${found.savePath} (Emulador: ${found.emulatorType})`);
      }
      return found;
    }
  }

  return null;
};

const getEmulatorForGame = (gamePath) => {
  if (!gamePath) return null;
  console.log(`[EmulatorDetector] Procurando emulador na pasta do jogo: ${gamePath}`);
  for (const adapter of adapters) {
    if (adapter.detect(gamePath)) {
      console.log(`[EmulatorDetector] Emulador detectado via assinatura: ${adapter.emulatorType}`);
      return adapter;
    }
  }
  console.log(`[EmulatorDetector] Nenhum emulador específico detectado na raiz do jogo.`);
  return null;
};

// ─── Compatibilidade IPC (Retro-compatível com main.cjs) ─────────────────────

function detectEmulator(gameDir, appId) {
  if (!gameDir || !appId) return null;
  
  // 1. Tenta escaneamento global/Hydra para encontrar arquivos já criados
  const scanned = getScannedEmulator(appId, gameDir);
  if (scanned) {
    console.log(`[EmulatorDetector] Sucesso no escaneamento automático para appId ${appId}!`);
    return {
      ...scanned,
      appId,
      gameDir
    };
  }

  // 2. Fallback: detecção de emulador baseada nas DLLs do jogo para novos saves
  const adapter = getEmulatorForGame(gameDir);
  if (!adapter) return null;
  const watchInfo = adapter.getWatchInfo(appId, gameDir);
  if (!watchInfo?.savePath || !fs.existsSync(watchInfo.savePath)) return null;
  
  console.log(`[EmulatorDetector] Fallback de detecção de emulador para appId: ${appId} | Emulador: ${adapter.emulatorType}`);
  console.log(`[EmulatorDetector] Pasta de saves (watchDir): ${watchInfo.watchDir}`);
  console.log(`[EmulatorDetector] Arquivo alvo (savePath): ${watchInfo.savePath}`);

  return {
    ...watchInfo,
    appId,
    gameDir,
    detectionSource: "signature-and-existing-save",
    confidence: "high",
  };
}

function parseAchievementState(detectedEmulator) {
  if (!detectedEmulator || !detectedEmulator.savePath) return {};
  
  const adapter = adapters.find(a => a.emulatorType === detectedEmulator.emulatorType);
  if (!adapter) return {};

  return adapter.readAchievements(detectedEmulator.appId, detectedEmulator.gameDir, detectedEmulator.savePath);
}

function readLocalSavesRetroactive(appId, gameDir = null) {
  if (!appId) return {};

  const scanned = getScannedEmulator(appId, gameDir);
  if (scanned && fs.existsSync(scanned.savePath)) {
    const adapter = adapters.find(a => a.emulatorType === scanned.emulatorType);
    if (adapter) {
      return adapter.readAchievements(appId, gameDir, scanned.savePath);
    }
  }

  const adapter = gameDir ? getEmulatorForGame(gameDir) : null;
  if (!adapter) return {};
  const watchInfo = adapter.getWatchInfo(appId, gameDir);
  if (!watchInfo?.savePath || !fs.existsSync(watchInfo.savePath)) return {};
  return adapter.readAchievements(appId, gameDir, watchInfo.savePath);
}

function getAchievementAliases(detectedEmulator) {
  if (!detectedEmulator || detectedEmulator.emulatorType !== EMULATOR_TYPES.RUNE) return {};
  const adapter = adapters.find((candidate) => candidate.emulatorType === EMULATOR_TYPES.RUNE);
  return adapter?.getAliases(detectedEmulator.appId, detectedEmulator.savePath) || {};
}

function resolveEmulatorAchievementId(appId, rawAchievementId) {
  const rawId = String(rawAchievementId || "").trim();
  if (!appId || !rawId) return rawId;
  const scanned = getScannedEmulator(String(appId), null);
  if (!scanned || scanned.emulatorType !== EMULATOR_TYPES.RUNE) return rawId;
  const aliases = getAchievementAliases({ ...scanned, appId: String(appId) });
  return aliases[rawId] || rawId;
}

function detectKnownEmulatorSave(appId) {
  if (!appId) return null;
  const scanned = getScannedEmulator(String(appId), null);
  return scanned ? { ...scanned, appId: String(appId), gameDir: null } : null;
}
// Mantemos esse helper exportado solto para a autoconfiguração antiga no main.cjs
function getGoldbergV1Paths(appId) {
  return new GoldbergAdapter()._getPaths(appId);
}

/**
 * Lê o arquivo steam_settings/achievements.json gerado pelo Goldberg Emulator
 * (e compatíveis) a partir do diretório do jogo, extraindo nome, descrição e
 * ícone de cada conquista.
 *
 * Formatos suportados:
 *  - Goldberg: array de objetos com { name, display_name: { english }, description: { english }, icon }
 *  - Flat: array com { id/name, name/display_name (string), description (string), icon }
 *
 * @param {string|null} gameDir  Pasta raiz do executável do jogo.
 * @returns {Record<string, {id:string,name:string,description:string,icon:string}>|null}
 */
function readGoldbergSettingsAchievements(gameDir) {
  if (!gameDir) return null;

  // Procura em game_dir/steam_settings e em parent/steam_settings
  const candidates = [
    path.join(gameDir, "steam_settings", "achievements.json"),
    path.join(path.dirname(gameDir), "steam_settings", "achievements.json"),
  ];

  for (const filePath of candidates) {
    const data = tryReadJson(filePath);
    if (!data) continue;

    // Aceita tanto array direto quanto { achievements: [...] }
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data.achievements)
        ? data.achievements
        : null;
    if (!list || list.length === 0) continue;

    const result = {};
    for (const entry of list) {
      // ID técnico: campo "name" no Goldberg, "id" em outros
      const id = String(entry.name || entry.id || "").trim();
      if (!id) continue;

      // display_name pode ser objeto { english: "..." } ou string direta
      const rawName = entry.display_name;
      const name =
        typeof rawName === "object" && rawName !== null
          ? String(rawName.english || rawName.default || Object.values(rawName)[0] || id)
          : String(rawName || entry.display_name_en || id);

      // description também pode ser objeto ou string
      const rawDesc = entry.description;
      const description =
        typeof rawDesc === "object" && rawDesc !== null
          ? String(rawDesc.english || rawDesc.default || Object.values(rawDesc)[0] || "")
          : String(rawDesc || "");

      // Ícone: string relativa ("icons/ach.jpg") ou vazio
      const icon = String(entry.icon || "").trim();

      result[id] = { id, name, description, icon };
    }

    if (Object.keys(result).length > 0) {
      console.log(
        `[EmulatorDetector] readGoldbergSettingsAchievements: leu ${
          Object.keys(result).length
        } conquistas de ${filePath}`
      );
      return result;
    }
  }

  return null;
}

module.exports = {
  EMULATOR_TYPES,
  getGoldbergV1Paths,
  detectEmulator,
  parseAchievementState,
  parseGenericIniAchievements,
  parseJsonAchievementState,
  parseRuneAchievements,
  parseRuneAchievementAliases,
  readLocalSavesRetroactive,
  readGoldbergSettingsAchievements,
  getAchievementAliases,
  resolveEmulatorAchievementId,
  detectKnownEmulatorSave,
  getEmulatorForGame
};
