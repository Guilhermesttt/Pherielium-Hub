"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const {
  normalizeGameDomain,
  normalizeModId,
  normalizeNexusDownloadExpiry,
  normalizeNexusDownloadToken,
} = require("./nexus-api.cjs");

const MAX_FILENAME_LENGTH = 180;

const parseNxmUrl = (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ""));
  } catch {
    throw new Error("O link NXM recebido é inválido.");
  }
  if (parsed.protocol !== "nxm:") {
    throw new Error("O link recebido não usa o protocolo NXM.");
  }
  const pathMatch = parsed.pathname.match(/^\/mods\/([1-9][0-9]*)\/files\/([1-9][0-9]*)\/?$/i);
  if (!pathMatch) {
    throw new Error("O link NXM não identifica um arquivo de mod válido.");
  }
  return {
    gameDomain: normalizeGameDomain(parsed.hostname),
    modId: normalizeModId(pathMatch[1]),
    fileId: normalizeModId(pathMatch[2]),
    downloadKey: normalizeNexusDownloadToken(parsed.searchParams.get("key")),
    expires: normalizeNexusDownloadExpiry(parsed.searchParams.get("expires")),
    userId: String(parsed.searchParams.get("user_id") || "").replace(/[^0-9]/g, "").slice(0, 20),
  };
};

const filenameFromDisposition = (value) => {
  const encoded = String(value || "").match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return String(value || "").match(/filename="?([^";]+)"?/i)?.[1] || "";
};

const sanitizeDownloadFilename = (rawName, fallback) => {
  const basename = path.basename(String(rawName || "").replace(/\0/g, ""));
  const sanitized = basename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  return sanitized || fallback;
};

const chooseAvailablePath = (directory, filename) => {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(directory, filename);
  let suffix = 2;
  while (fs.existsSync(candidate) || fs.existsSync(`${candidate}.part`)) {
    candidate = path.join(directory, `${stem} (${suffix})${extension}`);
    suffix += 1;
  }
  return candidate;
};

const downloadNexusFile = async ({
  uri,
  destinationRoot,
  gameDomain,
  modId,
  fileId,
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
}) => {
  const sourceUrl = new URL(String(uri || ""));
  if (sourceUrl.protocol !== "https:") {
    throw new Error("A Nexus retornou um endereço de download inseguro.");
  }
  if (!path.isAbsolute(destinationRoot)) {
    throw new Error("A pasta de downloads do Phelierium é inválida.");
  }

  const response = await fetchImpl(sourceUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "Phelierium",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`O servidor de download respondeu com o status ${response.status}.`);
  }

  const directory = path.resolve(
    destinationRoot,
    normalizeGameDomain(gameDomain),
    normalizeModId(modId),
  );
  const root = path.resolve(destinationRoot);
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) {
    throw new Error("A pasta de destino do mod é inválida.");
  }
  await fs.promises.mkdir(directory, { recursive: true });

  const urlFilename = decodeURIComponent(path.basename(sourceUrl.pathname));
  const headerFilename = filenameFromDisposition(response.headers.get("content-disposition"));
  const fallback = `nexus-${normalizeModId(modId)}-${normalizeModId(fileId)}.download`;
  const filename = sanitizeDownloadFilename(headerFilename || urlFilename, fallback);
  const finalPath = chooseAvailablePath(directory, filename);
  const partialPath = `${finalPath}.part`;
  const totalBytes = Math.max(0, Number(response.headers.get("content-length")) || 0);
  let receivedBytes = 0;
  let lastNotification = 0;

  const progressStream = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      const now = Date.now();
      if (now - lastNotification >= 200 || (totalBytes > 0 && receivedBytes >= totalBytes)) {
        lastNotification = now;
        onProgress({ receivedBytes, totalBytes });
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      progressStream,
      fs.createWriteStream(partialPath, { flags: "wx" }),
    );
    await fs.promises.rename(partialPath, finalPath);
  } catch (error) {
    await fs.promises.rm(partialPath, { force: true }).catch(() => {});
    throw error;
  }

  return {
    filePath: finalPath,
    filename: path.basename(finalPath),
    bytes: receivedBytes,
  };
};

module.exports = {
  downloadNexusFile,
  parseNxmUrl,
  sanitizeDownloadFilename,
};
