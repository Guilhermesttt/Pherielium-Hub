#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const pngToIco = require("png-to-ico");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
};

const ensureFreshFile = (filePath) => {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
};

const sharp = require("sharp");

const regenerateWindowsIcon = async () => {
  const sourcePng = path.join(projectRoot, "src", "assets", "Pherielium_Desktop_icon.png");
  const assetsPng = path.join(projectRoot, "assets", "icon.png");
  const targetIco = path.join(projectRoot, "assets", "icon.ico");
  try {
    const squarePngBuffer = await sharp(sourcePng)
      .resize(1024, 1024, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    fs.writeFileSync(assetsPng, squarePngBuffer);
    const icoBuffer = await pngToIco.default(squarePngBuffer);
    fs.writeFileSync(targetIco, icoBuffer);
    console.log(`[build-portable] regenerated ${path.relative(projectRoot, targetIco)}`);
  } catch (err) {
    if (fs.existsSync(targetIco)) {
      console.warn(`[build-portable] using existing icon.ico (${err.message})`);
    } else {
      throw err;
    }
  }
};

const cleanReleaseDirectories = () => {
  for (const entryName of [
    "win-unpacked",
    "win-unpacked.tmp",
    "builder-debug.yml",
    "builder-effective-config.yaml",
    "Pherielium-Windows.zip",
    "Checkpoint-Launcher-Windows.zip",
  ]) {
    const target = path.join(projectRoot, "release", entryName);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
};

const runBuilder = (extraArgs = []) => {
  run(process.execPath, [
    path.join(projectRoot, "node_modules", "electron-builder", "cli.js"),
    "--win",
    "dir",
    ...extraArgs,
  ]);
};

const buildPortable = () => {
  try {
    const dotenvPath = path.join(projectRoot, ".env");
    if (fs.existsSync(dotenvPath)) {
      const dotenv = require("dotenv");
      dotenv.config({ path: dotenvPath });
    }
  } catch (e) {
    console.warn("[build-portable] AVISO: Não foi possível carregar o arquivo .env:", e.message);
  }

  if (
    !process.env.VITE_BACKEND_URL ||
    process.env.VITE_BACKEND_URL.includes("localhost") ||
    process.env.VITE_BACKEND_URL.includes("127.0.0.1") ||
    process.env.VITE_BACKEND_URL.includes("0.0.0.0")
  ) {
    process.env.VITE_BACKEND_URL = "https://checkpoint-launcher.onrender.com";
  }
  run(process.execPath, [path.join(projectRoot, "node_modules", "vite", "bin", "vite.js"), "build"]);
  cleanReleaseDirectories();

  try {
    runBuilder();
  } catch (error) {
    const fallbackElectronDist = path.dirname(require("electron"));
    console.log("[build-portable] electron-builder hit a Windows rename lock. Retrying...");
    runBuilder([`--config.electronDist=${fallbackElectronDist}`]);
  }
};

const zipPortable = () => {
  const releaseDir = path.join(projectRoot, "release");
  const unpackedDir = path.join(releaseDir, "win-unpacked");
  const zipPath = path.join(releaseDir, "Pherielium-Windows.zip");

  if (!fs.existsSync(unpackedDir)) {
    throw new Error(`Windows folder not found: ${unpackedDir}`);
  }

  ensureFreshFile(zipPath);

  run("tar.exe", ["-a", "-c", "-f", zipPath, path.basename(unpackedDir)], {
    cwd: releaseDir,
  });

  return { unpackedDir, zipPath };
};

const logArtifacts = ({ unpackedDir, zipPath }) => {
  console.log(`[build-portable] windows folder: ${path.relative(projectRoot, unpackedDir)}`);
  console.log(`[build-portable] windows zip: ${path.relative(projectRoot, zipPath)}`);
  console.log("[build-portable] upload the zip to GitHub Releases:");
  console.log(`  ${path.basename(zipPath)}`);
};

const main = async () => {
  await regenerateWindowsIcon();
  buildPortable();
  const artifacts = zipPortable();
  logArtifacts(artifacts);
};

main().catch((error) => {
  console.error("[build-portable] failed", error);
  process.exit(1);
});
