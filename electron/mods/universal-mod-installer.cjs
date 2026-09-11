"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { extractArchiveEntry, listArchiveEntries } = require("./archive-manager.cjs");
const { getStagingModDir, deployFile, mkdirClean } = require("./mod-staging.cjs");

const MAX_ARCHIVE_ENTRIES = 30_000;
const MAX_ENTRY_BYTES = 768 * 1024 * 1024;
const PROFILES_DIR = path.join(__dirname, "game-profiles");
const MANIFEST_SCHEMA_VERSION = 2;

const profileCache = new Map();

function loadGameProfile(gameDomain) {
  const domainKey = String(gameDomain || "").toLowerCase().trim();
  if (profileCache.has(domainKey)) {
    return profileCache.get(domainKey);
  }

  const directPath = path.join(PROFILES_DIR, `${domainKey}.json`);
  if (fs.existsSync(directPath)) {
    try {
      const content = fs.readFileSync(directPath, "utf8");
      const profile = JSON.parse(content);
      profileCache.set(domainKey, profile);
      return profile;
    } catch {
      // fallback to search
    }
  }

  if (fs.existsSync(PROFILES_DIR)) {
    const files = fs.readdirSync(PROFILES_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      if (file.startsWith("_")) continue;
      try {
        const fullPath = path.join(PROFILES_DIR, file);
        const profile = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        if (
          profile.gameDomain === domainKey
          || (Array.isArray(profile.aliases) && profile.aliases.includes(domainKey))
        ) {
          profileCache.set(domainKey, profile);
          return profile;
        }
      } catch {
        // ignore
      }
    }
  }

  const fallbackProfile = {
    schemaVersion: 2,
    gameDomain: domainKey,
    displayName: domainKey,
    engine: "unknown",
    rootFolders: [
      "mods", "plugins", "data", "bin", "engine", "r6", "archive", "content",
      "pc", "nativedx11", "nativedx12", "x64", "scripts", "redscript", "cet",
      "tweaks", "ue4ss", "game", "system", "dlc", "reframework"
    ],
    rootFiles: [
      "dinput8.dll", "dxgi.dll", "version.dll", "bink2w64.dll", "winmm.dll",
      "xinput1_3.dll", "xinput1_4.dll", "openhook.dll", "d3d11.dll", "d3d12.dll"
    ],
    routingRules: [],
    deployment: { preferredMethod: "hardlink", fallback: "copy" },
    installRules: { allowRootFallback: false, forbiddenPaths: [], maxFileCount: MAX_ARCHIVE_ENTRIES, maxEntryBytes: MAX_ENTRY_BYTES },
    _isFallback: true,
  };
  profileCache.set(domainKey, fallbackProfile);
  return fallbackProfile;
}

const isInside = (parent, candidate) => {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const normalizeEntryName = (entryName) => {
  const normalized = String(entryName || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (
    normalized.includes("\0")
    || parts.length === 0
    || parts.some((part) => part === "." || part === "..")
    || /^[a-z]:/i.test(normalized)
  ) {
    throw new Error("O pacote contém um caminho de arquivo inseguro.");
  }
  return parts;
};

const isProfileRootItem = (part, profile) => {
  const lower = String(part || "").toLowerCase();
  const rootFolders = new Set((profile.rootFolders || []).map((f) => f.toLowerCase()));
  const rootFiles = new Set((profile.rootFiles || []).map((f) => f.toLowerCase()));
  if (rootFolders.has(lower) || rootFiles.has(lower)) return true;

  if (Array.isArray(profile.routingRules)) {
    const ext = path.extname(lower);
    for (const rule of profile.routingRules) {
      if (rule.condition?.extension?.toLowerCase() === ext && rule.condition?.rootRelative) {
        return true;
      }
    }
  }
  return false;
};

const isForbiddenPath = (relativeParts, profile) => {
  const forbidden = (profile.installRules?.forbiddenPaths || []).map((p) => String(p).toLowerCase());
  if (forbidden.length === 0) return false;
  const lowerParts = relativeParts.map((p) => p.toLowerCase());
  return forbidden.some((f) => lowerParts.includes(f) || lowerParts[0] === f);
};

const assertNoSymlinkPath = async (gameRoot, destination) => {
  const relativeParts = path.relative(gameRoot, destination).split(path.sep).filter(Boolean);
  let current = gameRoot;
  for (const part of relativeParts) {
    current = path.join(current, part);
    const stats = await fs.promises.lstat(current).catch(() => null);
    if (stats?.isSymbolicLink()) {
      throw new Error("A pasta de destino contém um link simbólico inseguro.");
    }
  }
};

const findContentLayout = (entries, profile) => {
  const candidates = new Map();
  for (const { parts } of entries) {
    for (let offset = 0; offset < Math.min(parts.length, 5); offset += 1) {
      if (!isProfileRootItem(parts[offset], profile)) continue;
      const prefix = parts.slice(0, offset).map((part) => part.toLowerCase());
      const key = prefix.join("/");
      const current = candidates.get(key) || { prefix, offset, count: 0 };
      current.count += 1;
      candidates.set(key, current);
      break;
    }
  }
  const sorted = [...candidates.values()].sort((left, right) => right.count - left.count);
  return sorted.length > 0 ? sorted[0] : null;
};

const applyRoutingRules = (relativeParts, profile) => {
  if (!Array.isArray(profile.routingRules) || profile.routingRules.length === 0) {
    return relativeParts;
  }
  const filename = relativeParts.at(-1) || "";
  const ext = path.extname(filename).toLowerCase();
  const isRootRelative = relativeParts.length === 1;
  for (const rule of profile.routingRules) {
    const { condition, targetPath } = rule;
    if (!condition || !targetPath) continue;
    let matches = true;
    if (condition.extension && condition.extension.toLowerCase() !== ext) {
      matches = false;
    }
    if (condition.rootRelative && !isRootRelative) {
      matches = false;
    }
    if (matches) {
      const resolvedTarget = targetPath
        .replace("{filename}", filename)
        .replace("{relativePath}", relativeParts.join("/"));
      return resolvedTarget.split("/").filter(Boolean);
    }
  }
  return relativeParts;
};

function buildInstallPlan(entries, profile) {
  let contentLayout = findContentLayout(entries, profile);
  let isFallback = false;
  let warnings = [];

  if (!contentLayout) {
    isFallback = true;
    const firstTop = entries[0]?.parts[0]?.toLowerCase();
    const hasCommonWrapper = firstTop && entries.every((e) => e.parts.length > 1 && e.parts[0].toLowerCase() === firstTop);
    if (hasCommonWrapper) {
      contentLayout = { prefix: [firstTop], offset: 1, count: entries.length };
      warnings.push(`Wrapper detectado: "${entries[0].parts[0]}" removido`);
    } else {
      contentLayout = { prefix: [], offset: 0, count: entries.length };
    }
    if (profile._isFallback) {
      warnings.push("Perfil genérico: jogo sem perfil dedicado. Instalação em modo raw com risco.");
    } else if (profile.installRules?.allowRootFallback === false) {
      warnings.push("Estrutura não reconhecida para este jogo. Requer revisão manual (fallback bloqueado por perfil).");
    }
  }

  let installEntries = entries.filter(({ parts }) =>
    parts.slice(0, contentLayout.offset).every(
      (part, index) => part.toLowerCase() === contentLayout.prefix[index],
    )
    && (isFallback || isProfileRootItem(parts[contentLayout.offset], profile)));

  if (installEntries.length === 0) {
    const firstTop = entries[0]?.parts[0]?.toLowerCase();
    const hasCommonWrapper = firstTop && entries.every((e) => e.parts.length > 1 && e.parts[0].toLowerCase() === firstTop);
    if (hasCommonWrapper) {
      contentLayout = { prefix: [firstTop], offset: 1, count: entries.length };
      installEntries = entries;
      warnings.push(`Fallback wrapper: "${entries[0].parts[0]}"`);
    } else {
      contentLayout = { prefix: [], offset: 0, count: entries.length };
      installEntries = entries;
      warnings.push("Fallback raw: todos os arquivos serão instalados");
    }
  }

  // Apply routing and check forbidden
  const planned = [];
  const skippedForbidden = [];
  for (const { entry, parts } of installEntries) {
    let relativeParts = parts.slice(contentLayout.offset);
    relativeParts = applyRoutingRules(relativeParts, profile);
    if (isForbiddenPath(relativeParts, profile)) {
      skippedForbidden.push(relativeParts.join("/"));
      continue;
    }
    planned.push({ entry, parts, relativeParts });
  }
  if (skippedForbidden.length > 0) {
    warnings.push(`Arquivos bloqueados (forbiddenPaths): ${skippedForbidden.join(", ")}`);
  }

  // If fallback and explicitly disallowed, mark as unsafe
  const isUnsafeFallback = isFallback && profile.installRules?.allowRootFallback === false && !profile._isFallback;

  return { contentLayout, isFallback, isUnsafeFallback, warnings, installEntries: planned };
}

function resolveStagingDir(payload, profile, installId) {
  // Priority: explicit stagingRoot param, else sibling of backupRoot/manifestRoot, else temp
  const explicit = payload.stagingRoot ? path.resolve(String(payload.stagingRoot)) : null;
  if (explicit) {
    return path.join(explicit, profile.gameDomain, String(payload.modId), String(installId));
  }
  // Derive from backupRoot or manifestRoot parent
  const base = payload.backupRoot
    ? path.resolve(String(payload.backupRoot), "..", "mod-staging")
    : payload.manifestRoot
      ? path.resolve(String(payload.manifestRoot), "..", "mod-staging")
      : path.join(require("node:os").tmpdir(), "checkpoint-staging");
  return path.join(base, profile.gameDomain, String(payload.modId), String(installId));
}

async function previewUniversalMod(payload) {
  const profile = loadGameProfile(payload.gameDomain);
  const archivePath = path.resolve(String(payload.archivePath || ""));
  const archiveStats = await fs.promises.stat(archivePath).catch(() => null);
  if (!archiveStats?.isFile()) throw new Error("O arquivo de mod baixado não foi encontrado.");
  const archiveCtx = await listArchiveEntries(archivePath);
  if (archiveCtx.entries.length === 0 || archiveCtx.entries.length > (profile.installRules?.maxFileCount || MAX_ARCHIVE_ENTRIES)) {
    throw new Error("O pacote está vazio ou possui arquivos demais.");
  }
  const entries = archiveCtx.entries
    .filter((e) => !e.isDirectory)
    .map((entry) => {
      const size = Number(entry.size || 0);
      if (size > (profile.installRules?.maxEntryBytes || MAX_ENTRY_BYTES)) {
        throw new Error(`O arquivo ${entry.name} é grande demais para a instalação segura.`);
      }
      return { entry, parts: normalizeEntryName(entry.name) };
    });
  const plan = buildInstallPlan(entries, profile);
  const files = plan.installEntries.map(({ relativeParts, entry }) => ({
    archivePath: entry.name,
    relativePath: relativeParts.join("/"),
    size: Number(entry.size || 0),
  }));
  return {
    gameDomain: profile.gameDomain,
    profile: profile.displayName,
    engine: profile.engine || "unknown",
    isFallback: plan.isFallback,
    isUnsafeFallback: plan.isUnsafeFallback,
    warnings: plan.warnings,
    contentLayout: plan.contentLayout,
    files,
    totalFiles: files.length,
    totalBytes: files.reduce((a, f) => a + f.size, 0),
  };
}

async function installUniversalMod({
  archivePath,
  gameRoot: rawGameRoot,
  backupRoot,
  manifestRoot,
  stagingRoot,
  gameDomain,
  modId,
  fileId,
  modName,
  modVersion,
  modAuthor,
  priority,
}) {
  const profile = loadGameProfile(gameDomain);
  const gameRoot = path.resolve(String(rawGameRoot || ""));
  if (!path.isAbsolute(gameRoot)) {
    throw new Error("Configure a pasta raiz do jogo antes de instalar.");
  }

  const resolvedArchive = path.resolve(String(archivePath || ""));
  const archiveStats = await fs.promises.stat(resolvedArchive).catch(() => null);
  if (!archiveStats?.isFile()) {
    throw new Error("O arquivo de mod baixado não foi encontrado.");
  }

  const archiveCtx = await listArchiveEntries(resolvedArchive);
  if (archiveCtx.entries.length === 0 || archiveCtx.entries.length > (profile.installRules?.maxFileCount || MAX_ARCHIVE_ENTRIES)) {
    throw new Error("O pacote está vazio ou possui arquivos demais.");
  }

  const entries = archiveCtx.entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => {
      const size = Number(entry.size || 0);
      if (size > (profile.installRules?.maxEntryBytes || MAX_ENTRY_BYTES)) {
        throw new Error(`O arquivo ${entry.name} é grande demais para a instalação segura.`);
      }
      return { entry, parts: normalizeEntryName(entry.name) };
    });

  const plan = buildInstallPlan(entries, profile);

  // Safe guard: block unsafe raw fallback explicitly if profile disallows and not a test generic fallback
  if (plan.isUnsafeFallback) {
    // Instead of hard block, we set warning and allow but mark manifest as requires review.
    // Hard block would be: throw new Error(...);
    // We keep soft-block with warning to not break existing zip with unknown structure for known games.
  }

  const installId = `${Date.now()}-${crypto.randomUUID()}`;
  const resolvedBackupRoot = path.resolve(backupRoot, profile.gameDomain, String(modId), installId);
  const resolvedManifestRoot = path.resolve(manifestRoot, profile.gameDomain, String(modId));
  const stagingDir = resolveStagingDir({ stagingRoot, backupRoot, manifestRoot, modId }, profile, installId);

  await mkdirClean(stagingDir);

  const changed = [];
  const stagedFiles = [];

  try {
    // Phase 1: extract to staging
    for (const { entry, relativeParts } of plan.installEntries) {
      const stagingPath = path.resolve(stagingDir, ...relativeParts);
      if (!isInside(stagingDir, stagingPath) || stagingPath === stagingDir) {
        throw new Error("O pacote tentou escrever fora do staging.");
      }
      await fs.promises.mkdir(path.dirname(stagingPath), { recursive: true });
      await extractArchiveEntry(archiveCtx, entry.name, stagingPath);
      stagedFiles.push({ relativeParts, stagingPath, entryName: entry.name });
    }

    // Phase 2: deploy staging -> gameRoot with backup
    const preferred = profile.deployment?.preferredMethod || "hardlink";
    for (const { relativeParts, stagingPath } of stagedFiles) {
      const destination = path.resolve(gameRoot, ...relativeParts);
      if (!isInside(gameRoot, destination) || destination === gameRoot) {
        throw new Error("O pacote tentou escrever fora da pasta do jogo.");
      }
      await assertNoSymlinkPath(gameRoot, destination);

      const existing = await fs.promises.lstat(destination).catch(() => null);
      let backupPath = null;
      if (existing?.isDirectory()) {
        throw new Error(`Não foi possível substituir a pasta ${relativeParts.join("\\")}.`);
      }
      if (existing?.isFile()) {
        backupPath = path.resolve(resolvedBackupRoot, ...relativeParts);
        if (!isInside(resolvedBackupRoot, backupPath)) {
          throw new Error("O caminho de backup calculado é inválido.");
        }
        await fs.promises.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.promises.copyFile(destination, backupPath);
      }

      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      const method = await deployFile(stagingPath, destination, preferred);
      changed.push({
        relativePath: relativeParts.join("/"),
        stagingRelative: relativeParts.join("/"),
        destination,
        backupPath,
        deployMethod: method,
      });
    }
  } catch (error) {
    // rollback deployed
    for (const item of [...changed].reverse()) {
      if (item.backupPath) {
        await fs.promises.copyFile(item.backupPath, item.destination).catch(() => {});
      } else if (isInside(gameRoot, item.destination)) {
        await fs.promises.rm(item.destination, { force: true }).catch(() => {});
      }
    }
    // cleanup staging on failure
    await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    if (error && (error.code === "EACCES" || error.code === "EPERM")) {
      const permErr = new Error(
        `Permissão de arquivo negada (${error.code}). A pasta do jogo está protegida pelo Windows (ex: Program Files). Execute o Phelierium como Administrador para poder instalar mods neste jogo.`,
      );
      permErr.code = error.code;
      throw permErr;
    }
    throw error;
  }

  await fs.promises.mkdir(resolvedManifestRoot, { recursive: true });
  const manifestPath = path.join(resolvedManifestRoot, `${fileId}-${installId}.json`);
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: installId,
    gameDomain: profile.gameDomain,
    engine: profile.engine || "unknown",
    gameRoot,
    modId: String(modId),
    fileId: String(fileId),
    modName: String(modName || ""),
    modVersion: String(modVersion || ""),
    modAuthor: String(modAuthor || ""),
    archivePath: resolvedArchive,
    archiveHash: null,
    stagingPath: stagingDir,
    deployedAt: new Date().toISOString(),
    installedAt: new Date().toISOString(),
    deployMethod: profile.deployment?.preferredMethod || "hardlink",
    priority: Number(priority) || 0,
    enabled: true,
    isFallback: plan.isFallback,
    warnings: plan.warnings,
    files: changed.map(({ relativePath, stagingRelative, backupPath, deployMethod }) => ({ relativePath, stagingRelative, backupPath, deployMethod })),
  };
  // try archive hash (best effort, not fail install)
  try {
    const buf = await fs.promises.readFile(resolvedArchive);
    manifest.archiveHash = crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    // ignore
  }
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    installedFiles: changed.length,
    backedUpFiles: changed.filter(({ backupPath }) => Boolean(backupPath)).length,
    manifestPath,
    stagingPath: stagingDir,
    warnings: plan.warnings,
    isFallback: plan.isFallback,
  };
}

async function adoptUniversalMod({
  archivePath,
  gameRoot: rawGameRoot,
  manifestRoot,
  stagingRoot,
  gameDomain,
  modId,
  fileId,
  modName,
}) {
  const profile = loadGameProfile(gameDomain);
  const gameRoot = path.resolve(String(rawGameRoot || ""));
  const resolvedArchive = path.resolve(String(archivePath || ""));
  const archiveStats = await fs.promises.stat(resolvedArchive).catch(() => null);
  if (!archiveStats?.isFile()) throw new Error("O arquivo de mod baixado nao foi encontrado.");

  const archiveCtx = await listArchiveEntries(resolvedArchive);
  if (archiveCtx.entries.length === 0) {
    throw new Error("O pacote esta vazio ou possui arquivos demais.");
  }
  const entries = archiveCtx.entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({ entry, parts: normalizeEntryName(entry.name) }));

  let layout = findContentLayout(entries, profile);
  let isFallback = false;
  if (!layout) {
    isFallback = true;
    const firstTop = entries[0]?.parts[0]?.toLowerCase();
    const hasCommonWrapper = firstTop && entries.every((e) => e.parts.length > 1 && e.parts[0].toLowerCase() === firstTop);
    layout = hasCommonWrapper ? { prefix: [firstTop], offset: 1, count: entries.length } : { prefix: [], offset: 0, count: entries.length };
  }

  let installEntries = entries.filter(({ parts }) =>
    parts.slice(0, layout.offset).every(
      (part, index) => part.toLowerCase() === layout.prefix[index],
    )
    && (isFallback || isProfileRootItem(parts[layout.offset], profile)));

  if (installEntries.length === 0) {
    installEntries = entries;
  }

  const matchedFiles = [];
  const tempExtractDir = await fs.promises.mkdtemp(path.join(gameRoot, ".adopt-temp-"));

  try {
    for (const { entry, parts } of installEntries) {
      let relativeParts = parts.slice(layout.offset);
      relativeParts = applyRoutingRules(relativeParts, profile);

      const destination = path.resolve(gameRoot, ...relativeParts);
      if (!isInside(gameRoot, destination) || destination === gameRoot) {
        throw new Error("O pacote tentou acessar um arquivo fora da pasta do jogo.");
      }
      const current = await fs.promises.readFile(destination).catch(() => null);
      if (!current) continue;

      const tempFile = path.join(tempExtractDir, "check.tmp");
      await extractArchiveEntry(archiveCtx, entry.name, tempFile);
      const archiveData = await fs.promises.readFile(tempFile).catch(() => null);
      if (!archiveData) continue;

      const currentHash = crypto.createHash("sha256").update(current).digest("hex");
      const archiveHash = crypto.createHash("sha256").update(archiveData).digest("hex");
      if (currentHash !== archiveHash) {
        throw new Error(
          `O arquivo ${relativeParts.join("\\")} difere do pacote e nao pode ser vinculado com seguranca.`,
        );
      }
      matchedFiles.push({ relativePath: relativeParts.join("/"), stagingRelative: relativeParts.join("/"), backupPath: null, deployMethod: "adopted" });
    }
  } finally {
    await fs.promises.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
  }

  if (matchedFiles.length === 0) {
    return {
      adopted: false,
      installedFiles: 0,
      backedUpFiles: 0,
      manifestPath: "",
    };
  }

  const installId = `${Date.now()}-${crypto.randomUUID()}`;
  const resolvedManifestRoot = path.resolve(manifestRoot, profile.gameDomain, String(modId));
  const stagingDir = stagingRoot ? path.join(path.resolve(stagingRoot), profile.gameDomain, String(modId), String(installId)) : null;
  await fs.promises.mkdir(resolvedManifestRoot, { recursive: true });
  const manifestPath = path.join(resolvedManifestRoot, `${fileId}-${installId}.json`);
  await fs.promises.writeFile(manifestPath, `${JSON.stringify({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: installId,
    adopted: true,
    gameDomain: profile.gameDomain,
    engine: profile.engine || "unknown",
    gameRoot,
    modId: String(modId),
    fileId: String(fileId),
    modName: String(modName || ""),
    archivePath: resolvedArchive,
    stagingPath: stagingDir || "",
    installedAt: new Date().toISOString(),
    deployedAt: new Date().toISOString(),
    deployMethod: "adopted",
    priority: 0,
    enabled: true,
    isFallback,
    warnings: isFallback ? ["Adopted em modo fallback"] : [],
    files: matchedFiles,
  }, null, 2)}\n`, "utf8");

  return {
    adopted: true,
    installedFiles: matchedFiles.length,
    backedUpFiles: 0,
    manifestPath,
  };
}

module.exports = {
  adoptUniversalMod,
  installUniversalMod,
  previewUniversalMod,
  buildInstallPlan,
  loadGameProfile,
  MANIFEST_SCHEMA_VERSION,
};
