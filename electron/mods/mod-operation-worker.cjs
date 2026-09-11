"use strict";

const { parentPort } = require("node:worker_threads");
const {
  adoptUniversalMod,
  installUniversalMod,
  previewUniversalMod,
} = require("./universal-mod-installer.cjs");
const { uninstallNexusMod } = require("./nexus-installation-manager.cjs");

if (!parentPort) throw new Error("O worker de mods precisa ser iniciado por worker_threads.");

const operations = {
  install: installUniversalMod,
  adopt: adoptUniversalMod,
  uninstall: uninstallNexusMod,
  preview: previewUniversalMod,
};

const serializeError = (error) => ({
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : "",
  code: error && typeof error === "object" ? error.code : undefined,
});

// Um unico pipeline evita duas mutacoes simultaneas nos mesmos arquivos do jogo.
let operationQueue = Promise.resolve();

parentPort.on("message", (message) => {
  operationQueue = operationQueue.then(async () => {
    const operation = operations[message?.operation];
    if (!operation) throw new Error("Operacao de mod desconhecida.");
    return operation(message.payload || {});
  }).then(
    (result) => parentPort.postMessage({ id: message.id, ok: true, result }),
    (error) => parentPort.postMessage({ id: message.id, ok: false, error: serializeError(error) }),
  );
});
