"use strict";

const fs = require("node:fs");
const path = require("node:path");

class AsyncRingBufferLogger {
  constructor(logFilePath, flushIntervalMs = 2000, maxBufferSize = 100) {
    this.logFilePath = logFilePath ? path.resolve(logFilePath) : null;
    this.flushIntervalMs = Math.max(250, flushIntervalMs);
    this.maxBufferSize = Math.max(10, maxBufferSize);
    this.buffer = [];
    this.isFlushing = false;

    if (this.logFilePath) {
      this.timer = setInterval(() => {
        this.flush().catch(() => {});
      }, this.flushIntervalMs);
      if (typeof this.timer.unref === "function") {
        this.timer.unref();
      }
    }
  }

  log(level, message, meta = {}) {
    if (process.env.NODE_ENV === "production" && (level === "DEBUG" || level === "INFO")) {
      return;
    }

    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    }) + "\n";

    this.buffer.push(payload);

    if (this.buffer.length >= this.maxBufferSize) {
      setImmediate(() => {
        this.flush().catch(() => {});
      });
    }
  }

  info(message, meta) {
    this.log("INFO", message, meta);
  }

  warn(message, meta) {
    this.log("WARN", message, meta);
  }

  error(message, meta) {
    this.log("ERROR", message, meta);
  }

  async flush() {
    if (!this.logFilePath || this.isFlushing || this.buffer.length === 0) return;
    this.isFlushing = true;

    const chunk = this.buffer.splice(0, this.buffer.length);
    try {
      await fs.promises.mkdir(path.dirname(this.logFilePath), { recursive: true });
      await fs.promises.appendFile(this.logFilePath, chunk.join(""), "utf8");
    } catch {
      // Silently swallow log errors to ensure zero crash or performance penalty
    } finally {
      this.isFlushing = false;
    }
  }
}

module.exports = { AsyncRingBufferLogger };
