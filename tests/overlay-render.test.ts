// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type OverlayCallback = (payload: Record<string, unknown>) => void;

describe("overlay de conquistas", () => {
  let unlock: OverlayCallback;
  let social: OverlayCallback;
  let panelVisibility: OverlayCallback;
  let panelAction: ReturnType<typeof vi.fn>;
  let mediaPlay: ReturnType<typeof vi.fn>;
  let mediaPause: ReturnType<typeof vi.fn>;
  let gamepads: Array<Gamepad | null>;
  let animationFrames: FrameRequestCallback[];

  beforeEach(() => {
    vi.useFakeTimers();
    mediaPlay = vi.fn().mockResolvedValue(undefined);
    mediaPause = vi.fn();
    gamepads = [];
    animationFrames = [];
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: vi.fn(() => gamepads),
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: mediaPlay,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: mediaPause,
    });
    panelAction = vi.fn(() => Promise.resolve());
    const html = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error("Script do overlay nao encontrado.");
    window.eval(fs.readFileSync(path.resolve("electron/overlay-gamepad.js"), "utf8"));

    document.body.className = "";
    document.body.innerHTML = `
      <div id="achievement-stack"></div><div id="social-stack"></div>
      <section id="command-panel" aria-hidden="true">
        <div id="panel-game-backdrop"></div><span id="panel-game"></span>
        <nav>
          <button data-panel-tab="friends" class="panel-tab is-active">Inicio</button>
          <button data-panel-tab="chats" class="panel-tab">Chat</button>
          <button data-panel-tab="game" class="panel-tab">Jogo</button>
          <button data-panel-tab="media" class="panel-tab">Midia</button>
          <button data-panel-tab="achievements" class="panel-tab">Conquistas</button>
          <button data-panel-tab="spotify" class="panel-tab">Spotify</button>
          <button data-panel-tab="settings" class="panel-tab">Configuracoes</button>
          <button data-panel-tab="profile" class="panel-tab">Perfil</button>
        </nav>
        <div data-panel-view="friends" class="panel-view is-active"><button id="friend-action">Amigo</button></div>
        <div data-panel-view="chats" class="panel-view"></div>
        <div data-panel-view="game" class="panel-view"></div>
        <div data-panel-view="media" class="panel-view"></div>
        <div data-panel-view="achievements" class="panel-view"></div>
        <div data-panel-view="spotify" class="panel-view"></div>
        <div data-panel-view="settings" class="panel-view"></div>
        <div data-panel-view="profile" class="panel-view"></div>
        <span id="achievement-game-label"></span>
        <span id="panel-profile-name"></span><span id="sidebar-profile-name"></span>
        <img id="sidebar-profile-avatar" /><img id="panel-profile-avatar" /><img id="profile-page-avatar" />
        <span id="profile-page-name"></span><span id="profile-page-status"></span><div id="profile-discord"><span id="profile-discord-name"></span></div>
        <span id="profile-friends-total"></span><span id="profile-online-total"></span><span id="profile-achievements-total"></span>
        <span id="panel-friend-count"></span><span id="panel-online-count"></span>
        <span id="online-heading-count"></span><span id="offline-heading-count"></span><b id="nav-unread"></b>
        <input id="friend-search" /><button id="show-all-friends"></button>
        <div id="panel-friends-view"><div id="panel-friends-online"></div><div id="panel-friends-offline"></div></div>
        <div id="panel-chat-list"><div id="conversation-list"></div></div><div id="panel-chat-view"></div>
        <div id="context-game-card">
          <div id="context-game-art"></div>
          <span id="context-game-dot"></span><span id="context-game-status-text"></span>
          <span id="context-game-title"></span><span id="context-game-message"></span><span id="context-game-kicker"></span>
          <button id="context-game-action"></button><button id="context-game-retry"></button>
        </div>
        <div class="quick-access">
          <span id="quick-media-badge"></span><span id="quick-media-count"></span>
          <span id="quick-achievements-badge"></span><span id="quick-achievements-ratio"></span>
        </div>
        <div id="overlay-status-indicator"><span class="status-dot"></span><span id="overlay-status-text"></span></div>
        <div id="game-page-art"></div><span id="game-page-title"></span><span id="game-page-message"></span><span id="game-live-status"><span id="game-live-label"></span></span>
        <span id="game-session-duration"></span><span id="game-total-playtime"></span><span id="game-achievement-ratio"></span><span id="game-friends-playing"></span>
        <span id="game-platform"></span><span id="game-executable"></span><span id="game-developer"></span><span id="game-release-date"></span><span id="game-window-mode"></span><span id="game-resolution"></span>
        <span id="panel-unlocked"></span><span id="panel-available"></span>
        <div id="panel-achievement-progress"></div><div id="panel-achievements"></div>
        <button id="panel-close"></button><button id="panel-close-top"></button>
        <button id="panel-toggle-mode"><svg id="panel-toggle-mode-icon"><use /></svg></button>
        <button id="sidebar-mode-toggle"><svg id="sidebar-mode-icon"><use /></svg><span id="sidebar-mode-text"></span></button>
        <button id="sidebar-call-tab"></button>
        <button id="chat-back"></button><form id="chat-form"><button id="chat-attach" type="button"></button><input id="chat-input" /></form><input id="chat-image-input" type="file" />
        <button id="spotify-overlay-previous"></button><button id="spotify-overlay-toggle"></button><button id="spotify-overlay-next"></button>
        <input id="spotify-overlay-seek" type="range" min="0" max="1" value="0" /><span id="spotify-overlay-current"></span>
        <input id="spotify-overlay-volume" type="range" min="0" max="100" value="55" />
        <span id="chat-name"></span><img id="chat-avatar" /><span id="chat-status"></span>
        <span id="chat-typing"></span><span id="chat-error"></span><button id="chat-send"></button><div id="chat-messages"></div>
        <input id="setting-social" type="checkbox" /><input id="setting-achievements" type="checkbox" /><input id="setting-animations" type="checkbox" />
        <button id="record-capture-shortcut"><span id="record-shortcut-label"></span><kbd id="capture-shortcut-value"></kbd></button><span id="capture-shortcut-label"></span><span id="capture-setting-feedback"></span>
        <button id="capture-now"></button><button id="open-captures-folder"></button><div id="capture-gallery"></div>
      </section>
      <div id="capture-viewer" aria-hidden="true">
        <button id="capture-viewer-close"></button>
        <button id="capture-viewer-previous"></button>
        <img id="capture-viewer-image" />
        <button id="capture-viewer-next"></button>
        <span id="capture-viewer-name"></span><span id="capture-viewer-date"></span><span id="capture-viewer-counter"></span>
      </div>
    `;
    Object.defineProperty(window, "achievementOverlay", {
      configurable: true,
      value: {
        onUnlock: (callback: OverlayCallback) => { unlock = callback; },
        onWelcome: () => undefined,
        onSocial: (callback: OverlayCallback) => { social = callback; },
        onPlaySound: () => undefined,
        onPanelVisibility: (callback: OverlayCallback) => { panelVisibility = callback; },
        onPanelState: () => undefined,
        panelAction,
      },
    });
    window.eval(script);
  });

  const makeGamepad = (pressed: number[] = []) => ({
    id: "Xbox Wireless Controller",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: pressed.includes(index),
      touched: pressed.includes(index),
      value: pressed.includes(index) ? 1 : 0,
    })),
    vibrationActuator: null,
  } as unknown as Gamepad);

  const flushAnimationFrame = () => {
    const callbacks = animationFrames.splice(0);
    callbacks.forEach((callback) => callback(performance.now()));
  };

  const pressGamepadButton = (button: number) => {
    gamepads = [makeGamepad([button])];
    flushAnimationFrame();
    gamepads = [makeGamepad()];
    flushAnimationFrame();
  };

  it("mantem todas as paginas do painel no mesmo nivel de navegacao", () => {
    const html = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8");
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const content = parsed.querySelector(".panel-content");
    const views = ["friends", "chats", "game", "achievements", "media", "settings", "profile"];

    expect(content).not.toBeNull();
    views.forEach((view) => {
      expect(content?.querySelector(`:scope > [data-panel-view="${view}"]`)).not.toBeNull();
    });
  });

  it("toca hover e clique do overlay sem cortar o primeiro efeito", () => {
    panelVisibility({
      open: true,
      state: {
        settings: {
          achievementVolume: 35,
          achievementSoundTheme: "ps5",
        },
      },
    });
    mediaPlay.mockClear();
    mediaPause.mockClear();

    const button = document.getElementById("capture-now");
    button?.dispatchEvent(new Event("pointerover", { bubbles: true }));
    button?.click();

    expect(mediaPlay).toHaveBeenCalledTimes(2);
    expect(mediaPause).not.toHaveBeenCalled();
    mediaPlay.mock.instances.forEach((audio) => {
      expect((audio as HTMLAudioElement).volume).toBeGreaterThan(0);
      expect((audio as HTMLAudioElement).volume).toBeLessThanOrEqual(0.077);
    });
  });

  it("usa o som de retorno ao fechar ou voltar no overlay", () => {
    panelVisibility({
      open: true,
      state: {
        settings: {
          achievementVolume: 35,
          achievementSoundTheme: "ps5",
        },
      },
    });
    mediaPlay.mockClear();

    document.getElementById("chat-back")?.click();

    expect(mediaPlay).toHaveBeenCalled();
    expect(
      mediaPlay.mock.instances.some((audio) =>
        (audio as HTMLAudioElement).src.includes("PS5_Plus/deck_ui_out_of_game_detail.wav"),
      ),
    ).toBe(true);
  });

  it("dispara o som tematico depois de salvar uma captura", () => {
    const mainSource = fs.readFileSync(path.resolve("electron/main.cjs"), "utf8");
    const overlaySource = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8");

    expect(mainSource).toContain('playOverlaySound("screenshot")');
    expect(overlaySource).toContain('"screenshot": {');
    expect(overlaySource).toContain("Xbox One/deck_ui_toast.wav");
  });

  it("toca o efeito de disparo antes de processar a captura", () => {
    const mainSource = fs.readFileSync(path.resolve("electron/main.cjs"), "utf8");
    const overlaySource = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8");
    const triggerIndex = mainSource.indexOf('playOverlaySound("screenshot-trigger")');
    const captureIndex = mainSource.indexOf("await captureCurrentDisplay()", triggerIndex);

    expect(triggerIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeGreaterThan(triggerIndex);
    expect(overlaySource).toContain("37. Take Screenshot Psfx Take Screen.mp3");
  });

  it("ativa a janela e reafirma o atalho assim que um jogo e detectado", () => {
    const mainSource = fs.readFileSync(path.resolve("electron/main.cjs"), "utf8");

    expect(mainSource).toContain("const activateInGameOverlay = () =>");
    expect(mainSource).toContain("!globalShortcut.isRegistered(captureShortcut)");
    expect(mainSource).toContain("if (hasRunningGame && (!previouslyHadRunningGame || !inGameOverlayActive))");
    expect(mainSource).toContain("activateInGameOverlay();");
  });

  it("mantem os toasts compactos mesmo em uma janela fullscreen", () => {
    const html = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8");
    const cardRule = html.match(/\.overlay-card\s*\{([\s\S]*?)\}/)?.[1] || "";

    expect(html).toContain("--overlay-width: min(392px, calc(100vw - 32px))");
    expect(cardRule).toContain("container-type: inline-size");
    expect(cardRule).toContain("aspect-ratio: 447 / 157");
  });

  it("inicia a animacao somente depois que o toast entrou no DOM", () => {
    const html = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8").replace(/\r\n/g, "\n");

    expect(html).toContain(".overlay-card.is-entering");
    expect(html).toContain("const startCardAnimation = (card) =>");
    expect(html).toContain("card.classList.add(\"is-entering\")");
    expect(html).toContain("achievementStack.appendChild(card);\n      startCardAnimation(card);");
    expect(html).toContain("socialStack.appendChild(card);\n      startCardAnimation(card);");
    expect(html).toContain('localStorage.setItem("checkpoint-overlay-animations", "true")');
  });

  it("torna mensagens e pedidos clicaveis sem bloquear o jogo fora do card", () => {
    panelAction.mockClear();
    social({
      kind: "friend-message",
      title: "Mileide",
      description: "Bora jogar?",
      friendId: "cp-friend:friend-1",
    });

    const messageCard = document.querySelector<HTMLElement>(".kind-friend-message");
    messageCard?.dispatchEvent(new MouseEvent("mouseenter"));
    expect(panelAction).toHaveBeenCalledWith({
      kind: "set-toast-interactive",
      interactive: true,
    });
    messageCard?.click();
    expect(panelAction).toHaveBeenCalledWith({
      kind: "open-launcher-chat",
      friendId: "cp-friend:friend-1",
    });

    social({
      kind: "friend-message",
      title: "Mileide",
      description: "Enviou uma nova imagem",
      contentKind: "image",
      friendId: "cp-friend:friend-1",
    });
    expect(
      Array.from(document.querySelectorAll<HTMLElement>(".kind-friend-message .social-badge"))
        .at(-1)?.textContent,
    ).toBe("Nova imagem");

    social({
      kind: "friend-request",
      title: "Novo jogador",
      friendId: "cp-friend:friend-2",
    });
    document.querySelector<HTMLElement>(".kind-friend-request")?.click();
    expect(panelAction).toHaveBeenCalledWith({ kind: "open-launcher-friends" });

    const mainSource = fs.readFileSync(path.resolve("electron/main.cjs"), "utf8");
    const homeSource = fs.readFileSync(path.resolve("src/pages/Home.tsx"), "utf8");
    expect(mainSource).toContain('kind === "set-toast-interactive"');
    expect(mainSource).toContain('kind === "open-launcher-chat" || kind === "open-launcher-friends"');
    expect(mainSource).toContain('kind === "open-launcher-chat" && inGameOverlayActive');
    expect(mainSource).toContain('sendOverlayEvent("overlay:panel-command", { kind: "open-chat" })');
    expect(mainSource).toContain('payload?.contentKind === "image"');
    expect(homeSource).toContain("setActiveChatFriend(friend)");
  });

  it("identifica a troca de faixa do Spotify como tocando agora", () => {
    social({
      kind: "spotify-track",
      title: "Rotten Apple",
      description: "Alice in Chains",
      avatarUrl: "https://i.scdn.co/image/album-cover",
    });

    const card = document.querySelector<HTMLElement>(".kind-spotify-track");
    expect(card?.querySelector(".social-badge")?.textContent).toBe("Tocando agora");
    expect(card?.querySelector(".social-title")?.textContent).toBe("Rotten Apple");
    expect(card?.querySelector(".social-description")?.textContent).toBe("Alice in Chains");
  });

  it("usa no overlay um logo incluido no pacote do Electron", () => {
    const html = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8");
    const parsed = new DOMParser().parseFromString(html, "text/html");

    expect(parsed.querySelector(".panel-logo img")?.getAttribute("src")).toBe("../assets/icon.png");
  });

  it("renderiza nome, descricao e imagem recebidos do schema", () => {
    unlock({
      gameId: "steam_2050650",
      achievementId: "5",
      duplicate: false,
      achievement: {
        id: "5",
        name: "Minha obra-prima",
        description: "Obtenha a arma exclusiva.",
        icon: "https://cdn.example.com/re4-achievement.jpg",
      },
    });

    const card = document.querySelector(".achievement-card");
    expect(card?.querySelector(".achievement-title")?.textContent).toBe("Minha obra-prima");
    expect(card?.querySelector(".achievement-description")?.textContent).toBe("Obtenha a arma exclusiva.");
    expect(card?.querySelector("img")?.getAttribute("src")).toContain("re4-achievement.jpg");
  });

  it("aplica a posicao configurada ao toast de conquista", () => {
    unlock({
      gameId: "checkpoint-lab",
      achievementId: "position-test",
      position: "bottom-left",
      achievement: { id: "position-test", name: "Posicao", description: "" },
    });

    expect(document.getElementById("achievement-stack")?.dataset.position).toBe("bottom-left");
  });

  it("encaminha conquistas para o overlay customizado ou para a notificacao nativa", () => {
    const mainSource = fs.readFileSync(path.resolve("electron/main.cjs"), "utf8");

    expect(mainSource).toContain("const dispatchAchievementNotification = (payload) =>");
    expect(mainSource).toContain("if (!achievementNotificationsEnabled) return false");
    expect(mainSource).toContain('sendOverlayEvent("achievement:unlock"');
    expect(mainSource).toContain("showNativeAchievementNotification(payload)");
    expect(mainSource).toContain("silent: true");
  });

  it("torna toasts visiveis enquanto o estado do jogo esta sendo reconstruido", () => {
    const mainSource = fs.readFileSync(path.resolve("electron/main.cjs"), "utf8");
    const homeSource = fs.readFileSync(path.resolve("src/pages/Home.tsx"), "utf8");

    expect(mainSource).toContain("const revealOverlayForToast = () =>");
    expect(mainSource).toContain('channel === "overlay:social"');
    expect(mainSource).toContain('channel === "achievement:unlock"');
    expect(homeSource).toContain("lastOverlayWelcomeGameRef");
    expect(homeSource).toContain("gameTitle: currentPresenceGame");
  });

  it("substitui uma imagem quebrada pelo trofeu", () => {
    unlock({
      gameId: "steam_2050650",
      achievementId: "5",
      achievement: { id: "5", name: "Conquista", icon: "https://cdn.example.com/missing.jpg" },
    });

    const avatar = document.querySelector(".achievement-card .icon-avatar");
    avatar?.querySelector("img")?.dispatchEvent(new Event("error"));
    expect(avatar?.querySelector("svg")).not.toBeNull();
    expect(avatar?.querySelector("img")).toBeNull();
  });

  it("renderiza o painel interativo com amigos e progresso", () => {
    panelVisibility({
      open: true,
      state: {
        friends: [{ id: "friend-1", name: "Gui", status: "playing", playing: "Portal 2" }],
        achievements: { unlocked: 54, available: 1274 },
        currentGame: {
          id: "portal-2",
          title: "Portal 2",
          image: "",
          platform: "Steam",
          developer: "Valve",
          totalPlaytimeMinutes: 125,
          sessionStartedAt: "2026-07-16T12:00:00.000Z",
        },
        settings: { captureShortcut: "F8" },
        captures: [{ id: "capture-1", name: "Portal 2.png", url: "data:image/png;base64,AA==", createdAt: "2026-07-16T12:30:00.000Z" }],
      },
    });

    expect(document.getElementById("command-panel")?.classList.contains("is-open")).toBe(true);
    expect(document.querySelector(".friend-name")?.textContent).toBe("Gui");
    expect(document.getElementById("panel-unlocked")?.textContent).toBe("54");
    expect(document.getElementById("panel-game")?.textContent).toContain("Portal 2");
    expect(document.getElementById("game-platform")?.textContent).toBe("Steam");
    expect(document.getElementById("game-total-playtime")?.textContent).toBe("2h 5min");
    expect(document.querySelectorAll(".capture-card")).toHaveLength(1);
  });

  it("mantem avatar base64 completo e usa iniciais quando a imagem falha", () => {
    const avatarData = `data:image/webp;base64,${"A".repeat(8_000)}`;
    panelVisibility({
      open: true,
      state: {
        friends: [{
          id: "friend-avatar",
          name: "Gui Rosa",
          status: "online",
          avatar: avatarData,
        }],
      },
    });

    const avatar = document.querySelector<HTMLImageElement>(
      "#panel-friends-online .friend-avatar",
    );
    expect(avatar?.src).toBe(avatarData);

    avatar?.dispatchEvent(new Event("error"));
    expect(avatar?.src).toMatch(/^data:image\/svg\+xml/);
    expect(avatar?.src).toContain("GR");
  });

  it("mostra conquistas do jogo e permite conversar sem fechar o overlay", () => {
    panelVisibility({
      open: true,
      state: {
        friends: [{ id: "cp-friend:friend-1", name: "Mileide", status: "online", canChat: true, unread: 2 }],
        achievements: {
          unlocked: 1,
          available: 2,
          items: [
            { id: "A", name: "Primeira conquista", description: "Teste", achieved: true },
            { id: "B", name: "Conquista bloqueada", description: "Teste", achieved: false },
          ],
        },
        currentGame: { id: "re4", title: "Resident Evil 4", image: "" },
        chat: {
          friendId: "cp-friend:friend-1",
          friendName: "Mileide",
          messages: [{ id: "m1", text: "Bora jogar?", createdAt: "2026-07-16T12:00:00.000Z", mine: false }],
        },
      },
    });

    expect(document.querySelectorAll(".achievement-item")).toHaveLength(2);
    expect(document.querySelector(".achievement-item.is-locked")).not.toBeNull();
    expect(document.querySelector(".chat-message")?.textContent).toContain("Bora jogar?");

    const input = document.getElementById("chat-input") as HTMLInputElement;
    input.value = "Vamos";
    document.getElementById("chat-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(panelAction).toHaveBeenCalledWith({ kind: "send-message", text: "Vamos" });
  });

  it("mantem o compositor visivel, renderiza imagens e envia o estado de digitacao", () => {
    const html = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8");
    const chatViewRule = html.match(
      /\.panel-view\[data-panel-view="chats"\]\.is-active\s*\{([\s\S]*?)\}/,
    )?.[1] || "";

    expect(chatViewRule).toContain("height: 100%");
    expect(chatViewRule).toContain("min-height: 0");
    expect(chatViewRule).toContain("overflow: hidden");

    panelVisibility({
      open: true,
      state: {
        chat: {
          friendId: "cp-friend:friend-1",
          friendName: "Mileide",
          messages: [{
            id: "image-1",
            text: "",
            attachmentUrl: "https://cdn.example.com/image.png",
            attachmentName: "image.png",
            createdAt: "2026-07-16T12:00:00.000Z",
            mine: false,
          }],
        },
      },
    });

    expect(document.querySelector(".chat-message-image")?.getAttribute("src"))
      .toContain("cdn.example.com/image.png");

    const input = document.getElementById("chat-input") as HTMLInputElement;
    input.value = "Ola";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(panelAction).toHaveBeenCalledWith({ kind: "set-typing", typing: true });

    vi.advanceTimersByTime(2_500);
    expect(panelAction).toHaveBeenCalledWith({ kind: "set-typing", typing: false });
  });

  it("grava uma combinação personalizada para captura", async () => {
    panelVisibility({ open: true, state: { settings: { captureShortcut: "F8" } } });
    panelAction.mockResolvedValueOnce({ ok: true, shortcut: "CommandOrControl+K" });

    document.getElementById("record-capture-shortcut")?.click();
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    await Promise.resolve();

    expect(panelAction).toHaveBeenCalledWith({ kind: "set-capture-shortcut", shortcut: "CommandOrControl+K" });
    expect(document.getElementById("capture-shortcut-value")?.textContent).toBe("Ctrl + K");
  });

  it("pede confirmação e exclui uma captura pela galeria", async () => {
    panelVisibility({
      open: true,
      state: {
        settings: { captureShortcut: "F8" },
        captures: [{ id: "capture-1", name: "Portal 2.png", url: "data:image/png;base64,AA==", createdAt: "2026-07-16T12:30:00.000Z" }],
      },
    });
    panelAction.mockResolvedValueOnce({ ok: true });

    const deleteButton = document.querySelector<HTMLButtonElement>(".capture-delete");
    deleteButton?.click();
    expect(deleteButton?.classList.contains("is-confirming")).toBe(true);
    expect(panelAction).not.toHaveBeenCalledWith({ kind: "delete-capture", captureId: "capture-1" });
    deleteButton?.click();
    await Promise.resolve();

    expect(panelAction).toHaveBeenCalledWith({ kind: "delete-capture", captureId: "capture-1" });
  });

  it("abre, navega e fecha as capturas dentro do overlay", () => {
    panelVisibility({
      open: true,
      state: {
        settings: { captureShortcut: "F8" },
        captures: [
          { id: "capture-1", name: "Portal 2.png", url: "data:image/png;base64,AA==", createdAt: "2026-07-16T12:30:00.000Z" },
          { id: "capture-2", name: "Half-Life 2.png", url: "data:image/png;base64,BB==", createdAt: "2026-07-16T12:31:00.000Z" },
        ],
      },
    });

    document.querySelector<HTMLElement>(".capture-card")?.click();
    expect(document.getElementById("capture-viewer")?.classList.contains("is-open")).toBe(true);
    expect(document.getElementById("capture-viewer-name")?.textContent).toBe("Portal 2.png");
    expect(document.getElementById("capture-viewer-counter")?.textContent).toBe("1 de 2");

    // Navega para a proxima captura usando o botao ">"
    document.getElementById("capture-viewer-next")?.click();
    expect(document.getElementById("capture-viewer-name")?.textContent).toBe("Half-Life 2.png");
    expect(document.getElementById("capture-viewer-counter")?.textContent).toBe("2 de 2");

    // Navega de volta usando o botao "<"
    document.getElementById("capture-viewer-previous")?.click();
    expect(document.getElementById("capture-viewer-name")?.textContent).toBe("Portal 2.png");
    expect(document.getElementById("capture-viewer-counter")?.textContent).toBe("1 de 2");

    // Navega ciclicamente para a anterior (vai para a ultima)
    document.getElementById("capture-viewer-previous")?.click();
    expect(document.getElementById("capture-viewer-name")?.textContent).toBe("Half-Life 2.png");
    expect(document.getElementById("capture-viewer-counter")?.textContent).toBe("2 de 2");

    // Navega pelo teclado
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.getElementById("capture-viewer-name")?.textContent).toBe("Portal 2.png");
    expect(document.getElementById("capture-viewer-counter")?.textContent).toBe("1 de 2");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("capture-viewer")?.classList.contains("is-open")).toBe(false);
  });

  it("usa apenas o icone de camera no aviso de captura salva", () => {
    social({
      kind: "capture-saved",
      title: "Captura salva",
      description: "Desktop.png",
    });

    const card = document.querySelector(".social-card.kind-capture-saved");
    expect(card?.querySelector(".icon-avatar svg")?.classList.contains("animate-icon-camera")).toBe(true);
    expect(card?.querySelector(".icon-avatar img")).toBeNull();
    expect(card?.querySelector(".icon-ring")).toBeNull();

    social({
      kind: "controller-connected",
      title: "Controle conectado",
    });
    expect(document.querySelector(".kind-controller-connected .animate-icon-controller")).not.toBeNull();
  });

  it("carrega o motor de controle antes do script do overlay", () => {
    const html = fs.readFileSync(path.resolve("electron/overlay.html"), "utf8");
    expect(html).toContain('<script src="./overlay-gamepad.js"></script>');
    expect(html.indexOf("overlay-gamepad.js")).toBeLessThan(html.indexOf("<script>"));
  });

  it("troca abas em sequencia com L1 e R1", () => {
    panelVisibility({ open: true, state: {} });

    pressGamepadButton(5);
    expect(document.querySelector('[data-panel-tab="chats"]')).toHaveClass("is-active");

    pressGamepadButton(4);
    expect(document.querySelector('[data-panel-tab="friends"]')).toHaveClass("is-active");
  });

  it("confirma e volta pelo controle no overlay", () => {
    const friendAction = document.getElementById("friend-action");
    const friendClick = vi.fn();
    friendAction?.addEventListener("click", friendClick);
    panelVisibility({ open: true, state: {} });

    pressGamepadButton(0);
    expect(friendClick).toHaveBeenCalledOnce();

    panelAction.mockClear();
    pressGamepadButton(1);
    expect(panelAction).toHaveBeenCalledWith({ kind: "close" });
  });

  it("abre inicialmente no modo quick e permite alternar para full e voltar", () => {
    panelVisibility({ open: true, state: {} });
    expect(document.body.dataset.overlayMode).toBe("quick");

    // Alterna para Full
    document.getElementById("panel-toggle-mode")?.click();
    expect(document.body.dataset.overlayMode).toBe("full");

    // Alterna de volta para Quick
    document.getElementById("sidebar-mode-toggle")?.click();
    expect(document.body.dataset.overlayMode).toBe("quick");

    // Fecha o overlay
    panelVisibility({ open: false, state: {} });
    expect(document.body.dataset.overlayMode).toBe("passive");
  });

  it("renderiza empty state amigavel e acionavel com botao de adicionar amigo", () => {
    panelVisibility({ open: true, state: { friends: [] } });

    const emptyCard = document.querySelector(".friends-empty-card");
    expect(emptyCard).not.toBeNull();
    expect(emptyCard?.textContent).toContain("Nenhum amigo está jogando agora");
    expect(emptyCard?.querySelector(".btn-add-friend")).not.toBeNull();

    // Ao clicar em adicionar amigo, direciona ação
    const addBtn = emptyCard?.querySelector<HTMLButtonElement>(".btn-add-friend");
    addBtn?.click();
    expect(panelAction).toHaveBeenCalledWith({ kind: "open-launcher-friends" });
  });

  it("exibe estados explicitos de deteccao de jogo no card contextual", () => {
    // 1. Sem jogo detectado
    panelVisibility({ open: true, state: { currentGame: null } });
    expect(document.getElementById("context-game-title")?.textContent).toBe("Jogo não detectado");
    expect(document.getElementById("context-game-status-text")?.textContent).toBe("Jogo não detectado");
    expect(document.getElementById("context-game-retry")?.style.display).not.toBe("none");

    // 2. Detectando jogo
    panelVisibility({ open: true, state: { currentGame: null, gameDetecting: true } });
    expect(document.getElementById("context-game-title")?.textContent).toBe("Detectando jogo...");
    expect(document.getElementById("context-game-status-text")?.textContent).toBe("Detectando jogo");

    // 3. Jogo detectado
    panelVisibility({ open: true, state: { currentGame: { title: "Elden Ring", sessionSeconds: 1920 } } });
    expect(document.getElementById("context-game-title")?.textContent).toBe("Elden Ring");
    expect(document.getElementById("context-game-status-text")?.textContent).toBe("Jogo detectado");
    expect(document.getElementById("context-game-message")?.textContent).toContain("Sessão iniciada há 32 min");
  });

  it("exibe status nitido no rodape e atualiza badges de acesso rapido", () => {
    panelVisibility({
      open: true,
      state: {
        currentGame: { title: "Hollow Knight" },
        captures: [{ id: "c1", name: "boss.png" }, { id: "c2", name: "map.png" }],
        achievements: { unlocked: 5, available: 20 },
      },
    });

    expect(document.getElementById("overlay-status-text")?.textContent).toBe("Overlay ativo");
    expect(document.getElementById("quick-media-badge")?.textContent).toBe("2 novas");
    expect(document.getElementById("quick-achievements-badge")?.textContent).toBe("5/20");
  });

  it("aciona foco da busca rapida pelo atalho Ctrl+K", () => {
    panelVisibility({ open: true, state: {} });
    const searchInput = document.getElementById("friend-search") as HTMLInputElement;
    const focusSpy = vi.spyOn(searchInput, "focus");

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    }));

    expect(focusSpy).toHaveBeenCalled();
  });
});
