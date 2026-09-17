import { z } from "zod";

/**
 * Middleware de validação usando Zod
 * Valida o request body contra um schema e retorna erro 400 se inválido
 */
export const validateBody = (schema) => {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (error) {
      if (error?.name === "ZodError" || error instanceof z.ZodError) {
        const issues = Array.isArray(error.issues) ? error.issues : (error.errors || []);
        return res.status(400).json({
          error: "Validação falhou",
          details: issues.map((err) => ({
            field: Array.isArray(err.path) ? err.path.join(".") : String(err.path || ""),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

/**
 * Middleware de validação de query params
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Parâmetros de query inválidos",
          details: error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

/**
 * Middleware de validação de params de rota
 */
export const validateParams = (schema) => {
  return (req, res, next) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Parâmetros de rota inválidos",
          details: error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
};

// ============ SCHEMAS DE VALIDAÇÃO ============

/**
 * Schema para mensagem de chat
 */
export const chatMessageSchema = z.object({
  chatId: z.string().uuid("ID de chat inválido"),
  text: z.string().min(1, "Mensagem não pode ser vazia").max(5000, "Mensagem muito longa"),
  attachmentName: z.string().max(255).optional(),
  attachmentUrl: z.string().url().optional(),
  attachmentType: z.string().max(50).optional(),
});

/**
 * Schema para criação de sala de voz (alinhado a /api/voice/rooms)
 */
export const voiceRoomSchema = z.object({
  name: z.string().min(1, "Nome da sala é obrigatório").max(80, "Nome muito longo"),
  category: z.enum(["resenha_games", "gameplay_foco", "estudos_foco", "casual_chat"]).optional(),
  isPrivate: z.boolean().optional().default(false),
  password: z.union([z.string().max(64), z.literal("")]).optional(),
  maxParticipants: z.number().int().min(2).max(4).optional(),
  icon: z.string().max(32).optional(),
  avatarUrl: z.union([z.string().url(), z.literal(""), z.undefined()]).optional(),
  themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
}).passthrough();

/**
 * Schema para join de sala de voz
 */
export const voiceRoomJoinSchema = z.object({
  password: z.union([z.string().max(64), z.literal("")]).optional(),
  displayName: z.string().max(80).optional(),
  avatarUrl: z.union([z.string().url(), z.literal(""), z.undefined()]).optional(),
}).passthrough();

/**
 * Schema para solicitação de amizade
 */
export const friendRequestSchema = z.object({
  targetUid: z.string().uuid("UID inválido"),
  message: z.string().max(200).optional(),
});

/**
 * Schema para atualização de perfil
 */
export const profileUpdateSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  pronouns: z.string().max(50).optional(),
  website: z.string().url().optional(),
  favoriteGenres: z.array(z.string()).max(10).optional(),
  profileVisibility: z.enum(["public", "private"]).optional(),
});

/**
 * Schema para atualização de presença (/api/presence)
 */
export const presenceSchema = z.object({
  status: z.enum(["online", "playing", "offline"]).optional(),
  currentGameTitle: z.string().max(120).optional(),
  playing: z.string().max(255).optional().nullable(),
}).passthrough();

/**
 * Schema para rotas de amizade que recebem { uid }
 */
export const friendUidBodySchema = z.object({
  uid: z.string().uuid("UID inválido"),
});

/**
 * Schema para sincronização de biblioteca Steam
 */
export const steamLibrarySchema = z.object({
  appIds: z.array(z.string().regex(/^\d+$/)).max(500),
  includeAchievements: z.boolean().default(false),
});

/**
 * Schema para busca de jogos Steam
 */
export const steamSearchSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(50).default(10),
});

/**
 * Schema para requisição de token LiveKit
 */
export const livekitTokenSchema = z.object({
  roomName: z.string().min(1).max(100),
  identity: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(80).optional(),
  metadata: z.any().optional(),
}).passthrough();

/**
 * Schema para atividade social
 */
export const socialActivitySchema = z.object({
  kind: z.enum(["game-start", "achievement", "capture"]),
  gameId: z.string().optional(),
  gameTitle: z.string().max(255).optional(),
  gameImage: z.string().url().optional(),
  achievementId: z.string().optional(),
  achievementName: z.string().max(255).optional(),
  achievementIcon: z.string().url().optional(),
  caption: z.string().max(500).optional(),
});

/**
 * Schema para requisição OAuth
 */
export const oauthStartSchema = z.object({
  redirectUri: z.string().url().optional(),
  state: z.string().min(16).max(128).optional(),
});

/**
 * Schema para desconectar conta vinculada
 */
export const disconnectAccountSchema = z.object({
  provider: z.enum(["steam", "discord", "epic"]),
});

/**
 * Schema para proxy de imagem
 */
export const imageProxySchema = z.object({
  url: z.string().url("URL inválida"),
  width: z.number().int().positive().max(4000).optional(),
  height: z.number().int().positive().max(4000).optional(),
  format: z.enum(["jpeg", "png", "webp"]).optional(),
});

/**
 * Schema para Epic Games search
 */
export const epicSearchSchema = z.object({
  query: z.string().min(1).max(100),
  locale: z.string().default("pt-BR"),
  country: z.string().length(2).default("BR"),
});

/**
 * Schema para Epic Games app details
 */
export const epicAppDetailsSchema = z.object({
  namespace: z.string().min(1),
  catalogItemId: z.string().min(1),
});