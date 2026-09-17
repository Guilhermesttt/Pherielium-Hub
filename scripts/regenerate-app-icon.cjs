#!/usr/bin/env node
/**
 * Regenerates Windows app icons from src/assets/Pherielium_Desktop_icon.png
 * into assets/icon.png + assets/icon.ico (and build/*.ico mirrors).
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "src", "assets", "Pherielium_Desktop_icon.png");
const assetsPng = path.join(root, "assets", "icon.png");
const assetsIco = path.join(root, "assets", "icon.ico");
const buildTargets = [
  path.join(root, "build", "icon.ico"),
  path.join(root, "build", "installerIcon.ico"),
  path.join(root, "build", "uninstallerIcon.ico"),
];

async function main() {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing source icon: ${source}`);
  }

  fs.mkdirSync(path.dirname(assetsPng), { recursive: true });

  const squarePng = await sharp(source)
    .resize(1024, 1024, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  fs.writeFileSync(assetsPng, squarePng);
  console.log("wrote assets/icon.png");

  // Multi-size ICO for Windows shell / installer
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const sizedBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(squarePng)
        .resize(size, size, { fit: "cover" })
        .png()
        .toBuffer()
    )
  );

  const icoBuffer = await (pngToIco.default || pngToIco)(sizedBuffers);
  fs.writeFileSync(assetsIco, icoBuffer);
  console.log("wrote assets/icon.ico");

  for (const target of buildTargets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(assetsIco, target);
    console.log(`wrote ${path.relative(root, target)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
