export interface ReleaseHighlight {
  id: "controller" | "stability" | "platforms" | "search" | "mods" | "voice" | "ui" | "security";
  title: string;
  description: string;
}

export interface ReleaseHighlights {
  version: string;
  title: string;
  description: string;
  releaseUrl: string;
  highlights: ReleaseHighlight[];
}

export const LATEST_RELEASE: ReleaseHighlights = {
  version: "3.2.6",
  title: "Design Apple & Segurança Aprimorada",
  description: "Redesign completo seguindo diretrizes da Apple (Squircles G2, Molas Framer Motion, cursores imersivos) e refatoração crítica de segurança no backend (Autenticação SSR robusta e validação de middleware).",
  releaseUrl: "https://github.com/Guilhermesttt/Checkpoint---Launcher/releases/tag/v3.2.6",
  highlights: [
    {
      id: "ui",
      title: "Geometria Orgânica & Física de Molas",
      description: "Novos modais e botões com curvas contínuas Squircles G2. Animações puramente baseadas em física de molas (sem tempos fixos) para uma experiência fluida e moderna.",
    },
    {
      id: "security",
      title: "Auditoria de Segurança & SSR Auth",
      description: "Migração para pacotes Supabase SSR para autenticação robusta em servidor. Novos middlewares de validação de dados com Zod e tratamento centralizado de erros.",
    },
    {
      id: "stability",
      title: "Cursor Imersivo & Performance",
      description: "Novo cursor dinâmico que reage ao conteúdo da tela de forma acelerada por hardware, garantindo renderização suave a 120fps.",
    },
  ],
};

const releasesByVersion = new Map([
  [LATEST_RELEASE.version, LATEST_RELEASE],
  ["3.2.5", LATEST_RELEASE],
  ["3.2.4", {
    version: "3.2.4",
    title: "Telemetria de Controle, Voz Ultrarrápida & Galeria In-Game",
    description: "Detecção nativa de bateria e conexão USB/Bluetooth para DualSense, DS4 e Xbox...",
    releaseUrl: "https://github.com/Guilhermesttt/Checkpoint---Launcher/releases/tag/v3.2.4",
    highlights: [
      { id: "controller", title: "Telemetria & Bateria Precisa", description: "Leitura nativa precisa de bateria..." },
      { id: "voice", title: "Voz com Conexão Instantânea", description: "Conexão ultrarrápida via LiveKit..." },
    ]
  } as ReleaseHighlights],
]);

export const getReleaseHighlights = (version: string) =>
  releasesByVersion.get(String(version || "").trim()) ?? LATEST_RELEASE;

