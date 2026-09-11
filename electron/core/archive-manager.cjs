"use strict";

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");
const StreamZip = require("node-stream-zip");

const execFileAsync = util.promisify(execFile);

const getTarPath = () => {
  const systemTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  if (fs.existsSync(systemTar)) return systemTar;
  return "tar";
};

/**
 * Lista as entradas de um arquivo (.zip, .rar, .7z)
 */
async function listArchiveEntries(archivePath) {
  const resolved = path.resolve(archivePath);
  const ext = path.extname(resolved).toLowerCase();

  if (ext === ".zip") {
    try {
      const zip = new StreamZip.async({ file: resolved });
      const entriesMap = await zip.entries();
      const entries = Object.values(entriesMap).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory,
        size: Number(entry.size || 0),
      }));
      await zip.close();
      return { type: "zip", entries, archivePath: resolved };
    } catch {
      // Fallback para tar.exe se o .zip estiver corrompido ou com cabeçalho não-padrão
    }
  }

  // Fallback via bsdtar (nativo do Windows 10/11) para .rar, .7z, etc.
  const tarPath = getTarPath();
  const { stdout } = await execFileAsync(tarPath, ["-tf", resolved], {
    maxBuffer: 20 * 1024 * 1024,
  });
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries = lines.map((line) => {
    const isDirectory = line.endsWith("/") || line.endsWith("\\");
    return {
      name: line.replace(/\\/g, "/"),
      isDirectory,
      size: 0,
    };
  });

  return { type: "tar", entries, archivePath: resolved };
}

/**
 * Extrai entradas de um arquivo (.zip, .rar, .7z) com baixo consumo de memória
 */
async function extractArchiveEntry(archiveContext, entryName, destinationPath) {
  const { type, archivePath } = archiveContext;
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });

  if (type === "zip") {
    const zip = new StreamZip.async({ file: archivePath });
    try {
      await zip.extract(entryName, destinationPath);
    } finally {
      await zip.close();
    }
    return;
  }

  // Para .rar ou .7z via tar.exe
  const tarPath = getTarPath();
  const tempExtractDir = await fs.promises.mkdtemp(path.join(path.dirname(destinationPath), ".extract-temp-"));
  try {
    const normalizedEntry = entryName.replace(/\//g, path.sep);
    await execFileAsync(tarPath, ["-xf", archivePath, "-C", tempExtractDir, normalizedEntry]);
    const extractedFile = path.join(tempExtractDir, normalizedEntry);

    if (fs.existsSync(extractedFile)) {
      await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.promises.copyFile(extractedFile, destinationPath);
    }
  } finally {
    await fs.promises.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  extractArchiveEntry,
  listArchiveEntries,
};
