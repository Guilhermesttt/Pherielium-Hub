/**
 * Middleware de erro centralizado
 * Padroniza o tratamento de erros em toda a aplicação
 */

/**
 * Classes de erro customizadas
 */
export class AuthError extends Error {
  constructor(message = "Autenticação necessária") {
    super(message);
    this.name = "AuthError";
    this.statusCode = 401;
  }
}

export class ValidationError extends Error {
  constructor(message = "Dados inválidos") {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Recurso não encontrado") {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

export class ConflictError extends Error {
  constructor(message = "Conflito de dados") {
    super(message);
    this.name = "ConflictError";
    this.statusCode = 409;
  }
}

export class RateLimitError extends Error {
  constructor(message = "Muitas requisições. Tente novamente mais tarde.") {
    super(message);
    this.name = "RateLimitError";
    this.statusCode = 429;
  }
}

export class ExternalServiceError extends Error {
  constructor(message = "Erro ao comunicar com serviço externo") {
    super(message);
    this.name = "ExternalServiceError";
    this.statusCode = 502;
  }
}

/**
 * Middleware principal de tratamento de erros
 */
export const errorHandler = (err, req, res, next) => {
  // Log do erro (sem informações sensíveis)
  console.error("[Error]", {
    name: err.name,
    message: err.message,
    path: req.path,
    method: req.method,
    statusCode: err.statusCode || 500,
    timestamp: new Date().toISOString(),
  });

  // Tratamento de erros conhecidos
  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: "AUTH_ERROR",
    });
  }

  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: "VALIDATION_ERROR",
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: "NOT_FOUND",
    });
  }

  if (err instanceof ConflictError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: "CONFLICT",
    });
  }

  if (err instanceof RateLimitError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: "RATE_LIMIT_EXCEEDED",
    });
  }

  if (err instanceof ExternalServiceError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: "EXTERNAL_SERVICE_ERROR",
    });
  }

  // Tratamento de erros do Zod (validação)
  if (err.name === "ZodError") {
    return res.status(400).json({
      error: "Validação falhou",
      code: "VALIDATION_ERROR",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // Tratamento de erros de JWT
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "Token inválido",
      code: "INVALID_TOKEN",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "Token expirado",
      code: "TOKEN_EXPIRED",
    });
  }

  // Erro genérico (não expor detalhes internos em produção)
  const isDevelopment = process.env.NODE_ENV === "development";

  res.status(err.statusCode || 500).json({
    error: isDevelopment ? err.message : "Erro interno do servidor",
    code: "INTERNAL_ERROR",
    ...(isDevelopment && { stack: err.stack }),
  });
};

/**
 * Wrapper para async route handlers
 * Captura erros assíncronos e passa para o middleware de erro
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Middleware para rotas não encontradas
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: "Rota não encontrada",
    code: "NOT_FOUND",
    path: req.path,
    method: req.method,
  });
};