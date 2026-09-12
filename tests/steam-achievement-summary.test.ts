import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "supa-token" } },
      }),
    },
  },
}));

import { fetchSteamAchievementSummary } from "../src/services/steam";

describe("fetchSteamAchievementSummary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("divide bibliotecas grandes em lotes de no máximo 250 jogos", async () => {
    const requestedChunks: string[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as { appIds?: string[] };
      const chunk = body.appIds || [];
      requestedChunks.push(chunk);
      const stats = Object.fromEntries(
        chunk.map((appId) => [appId, { total: 10, unlocked: 4 }]),
      );
      return new Response(JSON.stringify({ stats }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const appIds = Array.from({ length: 501 }, (_, index) => String(index + 1));
    const result = await fetchSteamAchievementSummary(appIds);

    expect(requestedChunks.map((chunk) => chunk.length)).toEqual([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 1]);
    expect(result).toMatchObject({ requested: 501, resolved: 501, failedAppIds: [] });
    expect(result.stats["501"]).toEqual({ total: 10, unlocked: 4 });
  });

  it("preserva lotes válidos quando uma requisição isolada falha", async () => {
    let requestNumber = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      requestNumber += 1;
      const body = JSON.parse(String(init?.body || "{}")) as { appIds?: string[] };
      const chunk = body.appIds || [];
      if (requestNumber === 2) return new Response(null, { status: 503 });
      return new Response(JSON.stringify({
        stats: Object.fromEntries(chunk.map((appId) => [appId, { total: 2, unlocked: 1 }])),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const appIds = Array.from({ length: 251 }, (_, index) => String(index + 1));
    const result = await fetchSteamAchievementSummary(appIds);

    expect(result.resolved).toBe(201);
    expect(result.failedAppIds.length).toBe(50);
    expect(result.stats["1"]).toEqual({ total: 2, unlocked: 1 });
  });
});
