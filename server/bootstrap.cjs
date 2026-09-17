process.on("uncaughtException", (error) => {
  console.error("[server bootstrap] uncaughtException", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server bootstrap] unhandledRejection", reason);
});

(async () => {
  // Quando empacotado com asar, os arquivos do server ficam em app.asar.unpacked/
  // O import() dinâmico de ESM não funciona de dentro do asar — usa o caminho desempacotado.
  const path = require("path");
  const currentFile = __filename; // bootstrap.cjs está dentro do asar
  const serverDir = currentFile.includes("app.asar")
    ? currentFile.replace("app.asar", "app.asar.unpacked").replace(/bootstrap\.cjs$/, "")
    : path.dirname(currentFile);

  const entryPath = path.join(serverDir, "index.mjs");
  const entryUrl = `file:///${entryPath.replace(/\\/g, "/")}`;

  await import(entryUrl);
})().catch((error) => {
  console.error("[server bootstrap] failed to import server/index.mjs", error);
  process.exit(1);
});
