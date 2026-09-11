const path = require("node:path");

const PRIORITY_VALUES = new Set(["normal", "above-normal", "high"]);
const WINDOW_MODES = new Set(["default", "borderless", "windowed"]);

const parseArgumentString = (value) => {
  const source = String(value || "").trim();
  if (!source) return [];

  const result = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (
      character === "\\"
      && quote === '"'
      && (source[index + 1] === '"' || source[index + 1] === "\\")
    ) {
      current += source[index + 1];
      index += 1;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (quote) throw new Error("Argumentos possuem aspas sem fechamento.");
  if (current) result.push(current);
  if (result.length > 32 || result.some((argument) => argument.length > 512)) {
    throw new Error("Argumentos de inicializacao excedem o limite permitido.");
  }
  return result;
};

const optionalDimension = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 640 && number <= 16384 ? number : null;
};

const optionalMonitorId = (value) => {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const normalizeLaunchProfile = (value, defaultDirectory) => {
  const profile = value && typeof value === "object" ? value : {};
  const requestedDirectory = String(profile.workingDirectory || "").trim();
  const workingDirectory = requestedDirectory && path.isAbsolute(requestedDirectory)
    ? path.normalize(requestedDirectory)
    : defaultDirectory;

  return {
    arguments: parseArgumentString(profile.arguments),
    workingDirectory,
    monitorId: optionalMonitorId(profile.monitorId),
    windowMode: WINDOW_MODES.has(profile.windowMode) ? profile.windowMode : "default",
    resolutionWidth: optionalDimension(profile.resolutionWidth),
    resolutionHeight: optionalDimension(profile.resolutionHeight),
    processPriority: PRIORITY_VALUES.has(profile.processPriority)
      ? profile.processPriority
      : "normal",
  };
};

module.exports = { normalizeLaunchProfile, parseArgumentString };
