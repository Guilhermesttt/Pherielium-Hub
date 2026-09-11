const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const LEGENDARY_VERSION = "0.21.0";
const LEGENDARY_DOWNLOAD_URL =
  "https://github.com/legendary-gl/legendary/releases/download/0.21.0/legendary_windows_x64.exe";
const LEGENDARY_SHA256 =
  "4c01a14c0acb0c46069b197ae7212ea4ea6b861661126ca0593cdac31658fb01";
const LEGENDARY_ASSET_SIZE = 17610944;
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2 MiB

const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const createLegendaryManager = ({
  userDataPath,
  fetchImpl = globalThis.fetch,
  spawnImpl = spawn,
  fsImpl = fs,
  expectedSha256 = LEGENDARY_SHA256,
  expectedAssetSize = LEGENDARY_ASSET_SIZE,
}) => {
  if (!userDataPath) {
    throw new Error("userDataPath e obrigatorio para o LegendaryManager.");
  }

  const toolsDir = path.join(userDataPath, "tools", "legendary", LEGENDARY_VERSION);
  const installedExePath = path.join(toolsDir, "legendary.exe");

  let inFlightInstallPromise = null;

  const verifyBuffer = (buffer) => {
    if (
      buffer.length !== expectedAssetSize ||
      digest(buffer) !== expectedSha256
    ) {
      throw new Error("Falha na verificacao do Legendary.");
    }
  };

  const isInstalledBinaryValid = async () => {
    try {
      if (!fsImpl.existsSync(installedExePath)) return false;
      const buffer = await fsImpl.promises.readFile(installedExePath);
      verifyBuffer(buffer);
      return true;
    } catch {
      return false;
    }
  };

  const performInstall = async (options = {}) => {
    const force = Boolean(options.force);
    if (!force && (await isInstalledBinaryValid())) {
      return installedExePath;
    }

    await fsImpl.promises.mkdir(toolsDir, { recursive: true });

    const response = await fetchImpl(LEGENDARY_DOWNLOAD_URL);
    if (!response || !response.ok) {
      throw new Error(`Falha ao baixar o Legendary: status ${response?.status || "desconhecido"}.`);
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    verifyBuffer(buffer);

    const tempName = `legendary.exe.download-${crypto.randomBytes(6).toString("hex")}`;
    const tempFilePath = path.join(toolsDir, tempName);

    await fsImpl.promises.writeFile(tempFilePath, buffer);

    try {
      await fsImpl.promises.rename(tempFilePath, installedExePath);
    } catch (renameErr) {
      // On Windows rename over existing may fail, so unlink and rename
      try {
        if (fsImpl.existsSync(installedExePath)) {
          await fsImpl.promises.unlink(installedExePath);
        }
        await fsImpl.promises.rename(tempFilePath, installedExePath);
      } catch (finalErr) {
        if (fsImpl.existsSync(tempFilePath)) {
          await fsImpl.promises.unlink(tempFilePath).catch(() => {});
        }
        throw finalErr;
      }
    }

    return installedExePath;
  };

  const ensureInstalled = (options = {}) => {
    if (inFlightInstallPromise) return inFlightInstallPromise;
    inFlightInstallPromise = performInstall(options).finally(() => {
      inFlightInstallPromise = null;
    });
    return inFlightInstallPromise;
  };

  const validateArgs = (args) => {
    if (!Array.isArray(args) || args.length === 0 || args.length > 32) {
      throw new Error("Argumentos invalidos para o Legendary.");
    }
    const forbiddenControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
    for (const arg of args) {
      if (
        typeof arg !== "string" ||
        arg.length > 4096 ||
        forbiddenControlChars.test(arg)
      ) {
        throw new Error("Argumentos invalidos para o Legendary.");
      }
    }
  };

  const run = async (args, options = {}) => {
    validateArgs(args);

    const exePath = await ensureInstalled();
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = Number(options.maxOutputBytes) || DEFAULT_MAX_OUTPUT_BYTES;

    return new Promise((resolve, reject) => {
      let child = null;
      let stdoutAccum = "";
      let stderrAccum = "";
      let totalBytes = 0;
      let timedOut = false;
      let killedForOverflow = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child?.kill?.("SIGKILL");
        } catch {}
        reject(new Error("Tempo limite atingido para o Legendary."));
      }, timeoutMs);

      try {
        child = spawnImpl(exePath, args, {
          shell: false,
          windowsHide: true,
        });
      } catch (err) {
        clearTimeout(timer);
        return reject(new Error("Falha ao iniciar processo do Legendary."));
      }

      child.stdout?.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxOutputBytes && !killedForOverflow) {
          killedForOverflow = true;
          clearTimeout(timer);
          try {
            child?.kill?.("SIGKILL");
          } catch {}
          return reject(new Error("Saida do Legendary excedeu o limite permitido."));
        }
        stdoutAccum += chunk.toString("utf8");
      });

      child.stderr?.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxOutputBytes && !killedForOverflow) {
          killedForOverflow = true;
          clearTimeout(timer);
          try {
            child?.kill?.("SIGKILL");
          } catch {}
          return reject(new Error("Saida do Legendary excedeu o limite permitido."));
        }
        stderrAccum += chunk.toString("utf8");
      });

      child.on("error", () => {
        if (timedOut || killedForOverflow) return;
        clearTimeout(timer);
        reject(new Error("Falha ao executar o comando do Legendary."));
      });

      child.on("close", (code) => {
        if (timedOut || killedForOverflow) return;
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdoutAccum);
        } else {
          reject(new Error("Falha ao executar o comando do Legendary."));
        }
      });
    });
  };

  const logout = async () => {
    try {
      await run(["auth", "--delete"], { timeoutMs: 2500 });
    } catch {}

    const possibleDirs = [
      path.join(os.homedir(), ".config", "legendary"),
      ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "legendary")] : []),
      ...(process.env.APPDATA ? [path.join(process.env.APPDATA, "legendary")] : []),
    ];

    for (const dir of possibleDirs) {
      try {
        if (fsImpl.existsSync(dir)) {
          const userFile = path.join(dir, "user.json");
          const tokenFile = path.join(dir, "token.json");
          const configFile = path.join(dir, "config.ini");
          if (fsImpl.existsSync(userFile)) {
            await fsImpl.promises.unlink(userFile).catch(() => {});
          }
          if (fsImpl.existsSync(tokenFile)) {
            await fsImpl.promises.unlink(tokenFile).catch(() => {});
          }
          if (fsImpl.existsSync(configFile)) {
            await fsImpl.promises.unlink(configFile).catch(() => {});
          }
          await fsImpl.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      } catch {}
    }
  };

  return {
    ensureInstalled,
    run,
    logout,
  };
};

module.exports = {
  createLegendaryManager,
  LEGENDARY_VERSION,
  LEGENDARY_DOWNLOAD_URL,
  LEGENDARY_SHA256,
  LEGENDARY_ASSET_SIZE,
};
