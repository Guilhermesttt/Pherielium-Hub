import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  assertTrustedIpcEvent,
  createSecureIpcRegistrar,
  getIpcSenderUrl,
  isTrustedIpcEvent,
} = require("../electron/core/ipc-security.cjs");

const allowed = (url: string) => new URL(url).origin === "https://checkpoint.example";

describe("seguranca IPC", () => {
  it("prefere a URL do frame que originou a chamada", () => {
    const event = {
      senderFrame: { url: "https://checkpoint.example/app" },
      sender: { getURL: () => "https://evil.example" },
    };
    expect(getIpcSenderUrl(event)).toBe("https://checkpoint.example/app");
  });

  it("aceita apenas origem e webContents esperados", () => {
    const sender = { getURL: () => "https://checkpoint.example/home" };
    const event = { senderFrame: { url: "https://checkpoint.example/home" }, sender };
    expect(isTrustedIpcEvent(event, { isAllowedUrl: allowed, expectedWebContents: sender })).toBe(true);
    expect(isTrustedIpcEvent(event, { isAllowedUrl: allowed, expectedWebContents: {} })).toBe(false);
  });

  it("bloqueia frames remotos e eventos sem remetente", () => {
    expect(() => assertTrustedIpcEvent({ senderFrame: { url: "https://evil.example" }, sender: {} }, { isAllowedUrl: allowed }))
      .toThrow(/origem/i);
    expect(isTrustedIpcEvent({}, { isAllowedUrl: allowed })).toBe(false);
  });

  it("envolve handlers e nunca executa a acao para origem hostil", async () => {
    let registered: ((event: unknown, ...args: unknown[]) => Promise<unknown>) | undefined;
    const ipcMain = { handle: vi.fn((_channel, handler) => { registered = handler; }) };
    const action = vi.fn((_: unknown, value: string) => `ok:${value}`);
    const sender = { getURL: () => "https://checkpoint.example" };
    const register = createSecureIpcRegistrar({
      ipcMain,
      isAllowedUrl: allowed,
      getExpectedWebContents: () => sender,
    });
    register("safe:action", action);

    await expect(registered?.({ senderFrame: { url: "https://evil.example" }, sender }, "x"))
      .rejects.toMatchObject({ code: "ERR_IPC_UNTRUSTED_ORIGIN" });
    expect(action).not.toHaveBeenCalled();

    await expect(registered?.({ senderFrame: { url: "https://checkpoint.example/app" }, sender }, "x"))
      .resolves.toBe("ok:x");
  });
});
