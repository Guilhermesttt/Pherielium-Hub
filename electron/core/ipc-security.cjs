"use strict";

const getIpcSenderUrl = (event) => {
  const frameUrl = event?.senderFrame?.url;
  if (typeof frameUrl === "string" && frameUrl) return frameUrl;

  try {
    return event?.sender?.getURL?.() || "";
  } catch {
    return "";
  }
};

const isTrustedIpcEvent = (event, options = {}) => {
  const { isAllowedUrl, expectedWebContents } = options;
  if (!event?.sender || typeof isAllowedUrl !== "function") return false;
  if (expectedWebContents && event.sender !== expectedWebContents) return false;
  return isAllowedUrl(getIpcSenderUrl(event));
};

const assertTrustedIpcEvent = (event, options = {}) => {
  if (!isTrustedIpcEvent(event, options)) {
    const error = new Error("IPC bloqueado: origem do renderer nao autorizada.");
    error.code = "ERR_IPC_UNTRUSTED_ORIGIN";
    throw error;
  }
};

const createSecureIpcRegistrar = ({ ipcMain, isAllowedUrl, getExpectedWebContents }) => {
  if (!ipcMain?.handle) throw new TypeError("ipcMain invalido.");

  return (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrustedIpcEvent(event, {
        isAllowedUrl,
        expectedWebContents: getExpectedWebContents?.() ?? null,
      });
      return handler(event, ...args);
    });
  };
};

module.exports = {
  assertTrustedIpcEvent,
  createSecureIpcRegistrar,
  getIpcSenderUrl,
  isTrustedIpcEvent,
};
