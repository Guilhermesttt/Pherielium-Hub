const fs = require("node:fs");
const path = require("node:path");

/**
 * Lê os manifestos salvos na pasta de manifestos de um jogo e identifica
 * arquivos destino comuns afetados por mais de um mod ativo simultaneamente.
 *
 * @param {string} manifestRoot Caminho absoluto da pasta de manifestos
 * @returns {Array<{ relativePath: string, mods: Array<{ installId: string, modId: string, name: string }> }>}
 */
function collectManifestPaths(root, out) {
  let dirents;
  try {
    dirents = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirents) {
    const p = path.join(root, d.name);
    if (d.isDirectory()) collectManifestPaths(p, out);
    else if (d.isFile() && d.name.endsWith(".json")) out.push(p);
  }
}

function detectModConflicts(manifestRoot) {
  if (!manifestRoot || typeof manifestRoot !== "string" || !fs.existsSync(manifestRoot)) {
    return [];
  }

  const fileToModsMap = new Map();
  const manifestPaths = [];
  collectManifestPaths(path.resolve(manifestRoot), manifestPaths);

  try {
    for (const manifestPath of manifestPaths) {
      try {
        const raw = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(raw);

        if (manifest && manifest.enabled !== false && Array.isArray(manifest.files)) {
          const modMeta = {
            installId: manifest.id || manifest.installId || path.basename(manifestPath, ".json"),
            modId: manifest.modId || "",
            name: manifest.modName || manifest.name || path.basename(manifestPath, ".json"),
            priority: Number(manifest.priority) || 0,
            stagingPath: manifest.stagingPath || "",
            warnings: Array.isArray(manifest.warnings) ? manifest.warnings : [],
          };

          for (const fileItem of manifest.files) {
            if (!fileItem || !fileItem.relativePath) continue;
            const normPath = String(fileItem.relativePath).replace(/\\/g, "/").toLowerCase();
            const existing = fileToModsMap.get(normPath) || [];
            existing.push(modMeta);
            fileToModsMap.set(normPath, existing);
          }
        }
      } catch {
        // Ignora manifestos corrompidos silenciosamente
      }
    }
  } catch {
    return [];
  }

  const conflicts = [];
  for (const [relativePath, mods] of fileToModsMap.entries()) {
    if (mods.length > 1) {
      // Ordena por prioridade para UI saber quem vence
      const sorted = [...mods].sort((a, b) => (a.priority - b.priority) || a.installId.localeCompare(b.installId));
      conflicts.push({ relativePath, mods: sorted, winner: sorted.at(-1) });
    }
  }
  // Ordena conflitos por criticidade (mais mods envolvidos primeiro)
  conflicts.sort((a, b) => b.mods.length - a.mods.length);

  return conflicts;
}

module.exports = {
  detectModConflicts,
};
