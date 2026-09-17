import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  app,
  buildDiscordRedirectUri,
  buildEpicDetails,
  buildGoogleRedirectUri,
  canViewDetailedProfile,
  normalizeFriendAchievementAggregate,
  normalizeNexusTrendingMods,
  normalizeSocialActivityInput,
  normalizeSteamPlayerProfile,
  partitionOwnedSteamAppIds,
  projectFriendGame,
  projectSearchProfile,
  resolveChatRetentionDays,
  resolveLinkedSteamId,
} from "../server/index.mjs";

describe("API publica", () => {
  it.each([
    ["public", false, false, true],
    ["private", true, false, true],
    ["private", false, true, true],
    ["private", false, false, false],
  ])(
    "aplica a matriz de visibilidade do perfil",
    (visibility, isSelf, isAcceptedFriend, expected) => {
      expect(canViewDetailedProfile({ visibility, isSelf, isAcceptedFriend })).toBe(expected);
    },
  );

  it("projeta somente identidade basica na busca de um perfil privado", () => {
    expect(projectSearchProfile({
      uid: "user-private",
      display_name: "Jogador Privado",
      photo_url: "https://img.example/avatar.png",
      profile_visibility: "private",
      status: "playing",
      playing: "Portal 2",
      discord_username: "segredo",
      steam_username: "segredo-steam",
    })).toEqual({
      uid: "user-private",
      displayName: "Jogador Privado",
      photoURL: "https://img.example/avatar.png",
      profileVisibility: "private",
    });
  });

  it("usa sete dias como retencao padrao do chat", () => {
    expect(resolveChatRetentionDays(undefined)).toBe(7);
    expect(resolveChatRetentionDays("7")).toBe(7);
    expect(resolveChatRetentionDays("30")).toBe(30);
    expect(resolveChatRetentionDays("0")).toBe(7);
    expect(resolveChatRetentionDays("invalido")).toBe(7);
  });

  it("responde ao health check com headers de seguranca", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("recusa busca Steam curta sem chamar servicos externos", async () => {
    const response = await request(app).get("/api/steam/search?q=a").expect(400);
    expect(response.body.error).toMatch(/curta/i);
  });

  it("recusa parametros invalidos nas rotas de catalogo", async () => {
    await request(app).get("/api/steam/app-size?appId=abc").expect(400);
    await request(app).get("/api/epic/app-details").expect(400);
  });

  it("consulta e separa os detalhes da Steam pelo idioma selecionado", async () => {
    const steamPayload = {
      "987654": {
        success: true,
        data: {
          name: "Jeu localisé",
          short_description: "Description française",
          genres: [{ description: "Aventure" }],
        },
      },
    };
    // Fresh Response per call — mockResolvedValue(shared Response) breaks when
    // supabaseAdmin steam_store_cache runs first and consumes the body.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(steamPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const response = await request(app)
        .get("/api/steam/app-details?appId=987654&language=fr-FR")
        .expect(200);

      expect(response.body.description).toBe("Description française");
      expect(response.body.tags).toContain("Aventure");
      const steamCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes("store.steampowered.com/api/appdetails"),
      );
      expect(String(steamCall?.[0])).toContain("l=french");
      expect(String(steamCall?.[0])).toContain("cc=FR");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("nao mistura resultados de outra loja quando o GraphQL da Epic e bloqueado", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 403 }));
    try {
      const response = await request(app)
        .get("/api/epic/search?query=portal")
        .expect(502);

      expect(response.body.items).toBeUndefined();
      expect(response.body.error).toMatch(/Epic Games Store/i);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("nao permite origem CORS desconhecida", async () => {
    const response = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example")
      .expect(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("aceita apenas campos sociais permitidos e URLs HTTPS", () => {
    expect(normalizeSocialActivityInput({
      kind: "achievement",
      gameId: "portal-2",
      gameTitle: "Portal 2",
      gameImage: "https://cdn.example.com/portal.jpg",
      achievementId: "FIRST_PORTAL",
      achievementName: "Primeiro portal",
      achievementIcon: "data:image/png;base64,AAAA",
      userId: "usuario-forjado",
      userName: "Administrador",
      audienceIds: ["vitima"],
      createdAt: "2999-01-01T00:00:00.000Z",
    })).toEqual({
      kind: "achievement",
      gameId: "portal-2",
      gameTitle: "Portal 2",
      gameImage: "https://cdn.example.com/portal.jpg",
      achievementId: "FIRST_PORTAL",
      achievementName: "Primeiro portal",
    });
  });

  it("rejeita atividades sociais incompletas", () => {
    expect(() => normalizeSocialActivityInput({ kind: "achievement" })).toThrow(/conquista/i);
    expect(() => normalizeSocialActivityInput({ kind: "admin-event" })).toThrow(/tipo/i);
  });

  it("deriva o Steam ID vinculado e usa a query apenas para validacao", () => {
    expect(resolveLinkedSteamId("76561198000000000", undefined)).toEqual({
      ok: true,
      steamId: "76561198000000000",
    });
    expect(resolveLinkedSteamId("76561198000000000", "76561198000000000").ok).toBe(true);
    expect(resolveLinkedSteamId("76561198000000000", "123")).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(resolveLinkedSteamId("", undefined)).toMatchObject({ ok: false, status: 409 });
  });

  it("normaliza nome e avatar retornados pelo perfil Steam", () => {
    expect(normalizeSteamPlayerProfile("76561198000000000", {
      response: {
        players: [{
          steamid: "76561198000000000",
          personaname: "Checkpoint Player",
          avatarfull: "http://avatars.steamstatic.com/avatar.jpg",
        }],
      },
    })).toEqual({
      steam_id: "76561198000000000",
      steam_username: "Checkpoint Player",
      steam_avatar: "https://avatars.steamstatic.com/avatar.jpg",
    });

    expect(normalizeSteamPlayerProfile("76561198000000000", {
      response: { players: [] },
    })).toBeNull();
  });

  it("normaliza o feed público de mods da Nexus sem aceitar URLs inseguras", () => {
    expect(normalizeNexusTrendingMods({
      data: {
        mods: [{
          name: "Unofficial Patch",
          author: "Mod Author",
          summary: "Corrige problemas do jogo.",
          picture_url: "https://staticdelivery.nexusmods.com/mod.jpg",
          mod_page_url: "https://www.nexusmods.com/skyrimspecialedition/mods/1",
        }, {
          name: "URL inválida",
          mod_page_url: "https://example.com/mods/2",
        }],
      },
    })).toEqual([{
      id: "https://www.nexusmods.com/skyrimspecialedition/mods/1",
      name: "Unofficial Patch",
      author: "Mod Author",
      summary: "Corrige problemas do jogo.",
      pictureUrl: "https://staticdelivery.nexusmods.com/mod.jpg",
      modPageUrl: "https://www.nexusmods.com/skyrimspecialedition/mods/1",
    }]);
  });

  it("processa no resumo apenas jogos presentes na biblioteca vinculada", () => {
    expect(partitionOwnedSteamAppIds(
      ["10", "20", "20", "30"],
      new Set(["10", "30"]),
    )).toEqual({
      allowedAppIds: ["10", "30"],
      rejectedAppIds: ["20"],
    });
  });

  it("projeta jogos de amigos sem carregar data URLs", () => {
    const game = projectFriendGame("game-1", {
      title: "Portal 2",
      launcherType: "steam",
      steamAppId: "620",
      image: "data:image/png;base64,AAAA",
      cardImage: "data:image/png;base64,BBBB",
      completedAchievements: 12,
      totalAchievements: 10,
    });
    expect(JSON.stringify(game)).not.toContain("data:image");
    expect(game.cardImage).toContain("/620/");
    expect(game).toMatchObject({ completedAchievements: 12, totalAchievements: 12 });
    expect(normalizeFriendAchievementAggregate({
      totalGames: 80,
      unlocked: 25,
      available: 20,
    }, 4)).toEqual({
      totalGames: 80,
      unlocked: 25,
      available: 25,
      gamesWithAchievements: 4,
    });
  });

  it("devolve o appName executavel informado pelo releaseInfo da Epic", () => {
    const details = buildEpicDetails("catalog-1", "namespace-1", {
      title: "Control",
      releaseInfo: [
        { platform: "Mac", appId: "ControlMac" },
        { platform: "Windows", appId: "Control" },
      ],
    });
    expect(details.appName).toBe("Control");
  });

  it("garante que buildGoogleRedirectUri e buildDiscordRedirectUri apontam para endpoints corretos do backend", () => {
    const googleUri = buildGoogleRedirectUri();
    const discordUri = buildDiscordRedirectUri();
    expect(googleUri).toContain("/auth/google/callback");
    expect(discordUri).toContain("/auth/discord/callback");
  });

  it("responde com erro para status de autenticacao Google desktop sem credenciais", async () => {
    await request(app).get("/auth/desktop/google/status").expect(400);
    await request(app).get("/auth/desktop/google/status?state=fake-state").expect(400);
    const res = await request(app)
      .get("/auth/desktop/google/status?state=fake-state&pollSecret=fake-secret")
      .expect(401);
    expect(res.body).toEqual({ error: "Sessao de login invalida." });
  });

  it("emite state e pollSecret server-side no start do Google desktop", async () => {
    const start = await request(app).post("/auth/desktop/google/start");
    // Sem Supabase Admin o endpoint pode falhar com 500; com ele, retorna 200.
    if (start.status === 500) {
      expect(start.body.error).toMatch(/Supabase|configurado/i);
      return;
    }
    expect(start.status).toBe(200);
    expect(start.body.state).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(typeof start.body.pollSecret).toBe("string");
    expect(start.body.pollSecret.length).toBeGreaterThanOrEqual(32);
    expect(String(start.body.url)).toContain("/auth/google/start");
    expect(String(start.body.url)).toContain(`state=${start.body.state}`);

    const pending = await request(app)
      .get(
        `/auth/desktop/google/status?state=${encodeURIComponent(start.body.state)}&pollSecret=${encodeURIComponent(start.body.pollSecret)}`,
      )
      .expect(200);
    expect(pending.body).toEqual({ status: "pending" });

    const wrongSecret = await request(app)
      .get(
        `/auth/desktop/google/status?state=${encodeURIComponent(start.body.state)}&pollSecret=wrong-secret-value-xxxxxxxx`,
      )
      .expect(401);
    expect(wrongSecret.body.error).toBe("Sessao de login invalida.");
  });
});
