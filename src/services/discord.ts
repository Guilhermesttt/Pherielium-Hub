import { apiUrl, getAuthHeaders } from "./api";

export const getDiscordLinkUrl = async (): Promise<string> => {
  const headers = await getAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Sessao expirada. Entre novamente para conectar o Discord.");
  }
  const response = await fetch(apiUrl("/auth/discord/start"), {
    method: "POST",
    headers,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error: string };
    throw new Error(payload.error || "Nao foi possivel iniciar a conexao com o Discord.");
  }

  const payload = (await response.json()) as { url: string };
  if (!payload.url) {
    throw new Error("Backend nao retornou a URL de autenticacao do Discord.");
  }
  return payload.url;
};

export const disconnectDiscordAccount = async () => {
  const response = await fetch(apiUrl("/api/discord/disconnect"), {
    method: "POST",
    headers: await getAuthHeaders(),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error: string };
    throw new Error(payload.error || "Falha ao desconectar Discord.");
  }
};
