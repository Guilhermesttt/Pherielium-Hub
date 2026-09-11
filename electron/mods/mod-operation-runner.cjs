"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const IDLE_TIMEOUT_MS = 15_000;
let worker = null;
let idleTimer = null;
const pending = new Map();

const clearIdleTimer = () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
};

const rejectPending = (error) => {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
};

const scheduleIdleShutdown = () => {
  clearIdleTimer();
  if (pending.size > 0 || !worker) return;
  idleTimer = setTimeout(() => {
    const idleWorker = worker;
    worker = null;
    idleTimer = null;
    void idleWorker?.terminate();
  }, IDLE_TIMEOUT_MS);
  idleTimer.unref?.();
};

const getWorker = () => {
  if (worker) return worker;
  const nextWorker = new Worker(path.join(__dirname, "mod-operation-worker.cjs"));
  nextWorker.on("message", (message) => {
    const request = pending.get(message?.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.result);
    else {
      const error = new Error(message.error?.message || "A operacao de mod falhou.");
      if (message.error?.code) error.code = message.error.code;
      if (message.error?.stack) error.stack = message.error.stack;
      request.reject(error);
    }
    scheduleIdleShutdown();
  });
  nextWorker.on("error", (error) => {
    if (worker === nextWorker) worker = null;
    rejectPending(error);
    clearIdleTimer();
  });
  nextWorker.on("exit", (code) => {
    if (worker === nextWorker) worker = null;
    if (code !== 0 && pending.size > 0) {
      rejectPending(new Error(`O worker de mods encerrou inesperadamente (codigo ${code}).`));
    }
    clearIdleTimer();
  });
  worker = nextWorker;
  return worker;
};

const runModOperation = (operation, payload) => new Promise((resolve, reject) => {
  clearIdleTimer();
  const id = crypto.randomUUID();
  pending.set(id, { resolve, reject });
  try {
    getWorker().postMessage({ id, operation, payload });
  } catch (error) {
    pending.delete(id);
    reject(error);
    scheduleIdleShutdown();
  }
});

const shutdownModOperationWorker = async () => {
  clearIdleTimer();
  const current = worker;
  worker = null;
  rejectPending(new Error("O launcher esta sendo encerrado."));
  if (current) await current.terminate();
};

module.exports = { runModOperation, shutdownModOperationWorker };
