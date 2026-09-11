"use strict";

const NEXUS_API_BASE_URL = "https://api.nexusmods.com/v1";
const NEXUS_API_V3_BASE_URL = "https://api.nexusmods.com/v3";
const NEXUS_APPLICATION_NAME = "Phelierium";
const REQUEST_TIMEOUT_MS = 15_000;
const BATCH_REQUEST_TIMEOUT_MS = 30_000;
const NEXUS_MOD_BATCH_SIZE = 2_000;

const normalizeApiKey = (value) => {
  const apiKey = String(value || "").trim();
  if (apiKey.length < 32 || apiKey.length > 256 || !/^[A-Za-z0-9+/=._~-]+$/.test(apiKey)) {
    throw new Error("A chave pessoal Nexus possui um formato invalido.");
  }
  return apiKey;
};

const normalizeGameDomain = (value) => {
  const domain = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(domain)) {
    throw new Error("Dominio Nexus do jogo invalido.");
  }
  return domain;
};

const normalizeModId = (value) => {
  const modId = String(value || "").trim();
  if (!/^[1-9][0-9]{0,11}$/.test(modId)) {
    throw new Error("Identificador do mod invalido.");
  }
  return modId;
};

const normalizeNexusDownloadToken = (value) => {
  const token = String(value || "").trim();
  if (token.length < 8 || token.length > 512 || !/^[A-Za-z0-9+/=._~-]+$/.test(token)) {
    throw new Error("A autorização temporária de download da Nexus é inválida.");
  }
  return token;
};

const normalizeNexusDownloadExpiry = (value) => {
  const expires = String(value || "").trim();
  if (!/^[1-9][0-9]{8,12}$/.test(expires)) {
    throw new Error("A validade da autorização de download da Nexus é inválida.");
  }
  return expires;
};

const readResponsePayload = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const createNexusError = (response, payload) => {
  const detail = typeof payload?.message === "string"
    ? payload.message
    : typeof payload?.detail === "string"
      ? payload.detail
      : "";
  const message = detail.slice(0, 240) || (
    response.status === 401
      ? "A chave Nexus foi recusada."
      : response.status === 429
        ? "O limite de requisicoes da Nexus foi atingido."
        : `A Nexus respondeu com o status ${response.status}.`
  );
  const error = new Error(message);
  error.code = `ERR_NEXUS_${response.status}`;
  error.status = response.status;
  return error;
};

const nexusRequest = async ({
  pathname,
  apiKey,
  appVersion,
  fetchImpl = globalThis.fetch,
  baseUrl = NEXUS_API_BASE_URL,
  method = "GET",
  body,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) => {
  if (typeof fetchImpl !== "function") {
    throw new Error("Cliente HTTP indisponivel.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}${pathname}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        apikey: normalizeApiKey(apiKey),
        "Application-Name": NEXUS_APPLICATION_NAME,
        "Application-Version": String(appVersion || "0.0.0").slice(0, 40),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) throw createNexusError(response, payload);
    return {
      payload,
      rateLimit: {
        dailyRemaining: Number(response.headers.get("x-rl-daily-remaining")) || null,
        hourlyRemaining: Number(response.headers.get("x-rl-hourly-remaining")) || null,
      },
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("A Nexus demorou demais para responder.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getCompositeModUid = (gameId, modId) =>
  ((BigInt(gameId) << 32n) | BigInt(modId)).toString();

const getScopedModId = (compositeId) =>
  (BigInt(compositeId) & 0xffffffffn).toString();

const validateNexusApiKey = async ({
  apiKey,
  appVersion,
  fetchImpl,
}) => {
  const { payload, rateLimit } = await nexusRequest({
    pathname: "/users/validate.json",
    apiKey,
    appVersion,
    fetchImpl,
  });
  return {
    userId: Number(payload?.user_id) || 0,
    name: String(payload?.name || "Usuario Nexus").slice(0, 100),
    profileUrl: /^https:\/\/(?:www\.)?nexusmods\.com\//i.test(String(payload?.profile_url || ""))
      ? String(payload.profile_url)
      : "",
    isPremium: Boolean(payload?.is_premium),
    isSupporter: Boolean(payload?.is_supporter),
    rateLimit,
  };
};

const getNexusModFiles = async ({
  apiKey,
  appVersion,
  gameDomain,
  modId,
  fetchImpl,
}) => {
  const domain = normalizeGameDomain(gameDomain);
  const normalizedModId = normalizeModId(modId);
  const { payload, rateLimit } = await nexusRequest({
    pathname: `/games/${encodeURIComponent(domain)}/mods/${normalizedModId}/files.json`,
    apiKey,
    appVersion,
    fetchImpl,
  });
  const files = Array.isArray(payload?.files) ? payload.files : [];
  return {
    files: files.slice(0, 100).map((file) => ({
      id: String(file?.file_id || ""),
      name: String(file?.name || "Arquivo sem nome").slice(0, 240),
      version: String(file?.version || "").slice(0, 80),
      category: String(file?.category_name || "").slice(0, 80),
      description: String(file?.description || "").replace(/<[^>]*>/g, "").slice(0, 500),
      sizeKb: Math.max(0, Number(file?.size_kb) || 0),
      uploadedAt: Number(file?.uploaded_timestamp || file?.uploaded_time || 0) || null,
      primary: Boolean(file?.is_primary),
    })).filter((file) => file.id),
    rateLimit,
  };
};

const getNexusModDetails = async ({
  apiKey,
  appVersion,
  gameDomain,
  modId,
  fetchImpl,
}) => {
  const domain = normalizeGameDomain(gameDomain);
  const normalizedModId = normalizeModId(modId);
  const { payload, rateLimit } = await nexusRequest({
    pathname: `/games/${encodeURIComponent(domain)}/mods/${normalizedModId}.json`,
    apiKey,
    appVersion,
    fetchImpl,
  });
  if (payload?.available === false || payload?.contains_adult_content === true) {
    throw new Error("Este mod está indisponível ou exige acesso a conteúdo adulto.");
  }
  const name = String(payload?.name || "").trim();
  if (!name) throw new Error("A Nexus não retornou os detalhes deste mod.");
  const pictureUrl = String(payload?.picture_url || "");
  return {
    mod: {
      id: `${domain}:${normalizedModId}`,
      modId: normalizedModId,
      name: name.slice(0, 240),
      author: String(payload?.author || payload?.uploaded_by || "Autor não informado").slice(0, 120),
      summary: String(payload?.summary || "").replace(/<[^>]*>/g, "").slice(0, 600),
      pictureUrl: /^https:\/\//i.test(pictureUrl) ? pictureUrl : "",
      modPageUrl: `https://www.nexusmods.com/${encodeURIComponent(domain)}/mods/${normalizedModId}`,
      version: String(payload?.version || "").slice(0, 80),
      downloads: Math.max(0, Number(payload?.mod_downloads) || 0),
      endorsements: Math.max(0, Number(payload?.endorsement_count) || 0),
      updatedAt: Number(payload?.updated_timestamp) || null,
      feed: "Adicionado por URL",
    },
    rateLimit,
  };
};

const getNexusDownloadLinks = async ({
  apiKey,
  appVersion,
  gameDomain,
  modId,
  fileId,
  downloadKey,
  expires,
  fetchImpl,
}) => {
  const domain = normalizeGameDomain(gameDomain);
  const normalizedModId = normalizeModId(modId);
  const normalizedFileId = normalizeModId(fileId);
  const normalizedKey = normalizeNexusDownloadToken(downloadKey);
  const normalizedExpires = normalizeNexusDownloadExpiry(expires);
  const { payload, rateLimit } = await nexusRequest({
    pathname: `/games/${encodeURIComponent(domain)}/mods/${normalizedModId}/files/${normalizedFileId}/download_link.json?key=${encodeURIComponent(normalizedKey)}&expires=${encodeURIComponent(normalizedExpires)}`,
    apiKey,
    appVersion,
    fetchImpl,
  });
  const mirrors = Array.isArray(payload) ? payload : [];
  return {
    mirrors: mirrors.map((mirror) => ({
      name: String(mirror?.name || mirror?.short_name || "Nexus").slice(0, 100),
      shortName: String(mirror?.short_name || "").slice(0, 80),
      uri: String(mirror?.URI || mirror?.uri || ""),
    })).filter((mirror) => {
      try {
        return new URL(mirror.uri).protocol === "https:";
      } catch {
        return false;
      }
    }),
    rateLimit,
  };
};

const getCuratedNexusModCatalog = async ({
  apiKey,
  appVersion,
  gameDomain,
  fetchImpl,
}) => {
  const domain = normalizeGameDomain(gameDomain);
  const feeds = [
    ["trending", "Em alta"],
    ["latest_updated", "Atualizados"],
    ["latest_added", "Novos"],
  ];
  const results = await Promise.allSettled(feeds.map(async ([endpoint, label]) => {
    const result = await nexusRequest({
      pathname: `/games/${encodeURIComponent(domain)}/mods/${endpoint}.json`,
      apiKey,
      appVersion,
      fetchImpl,
    });
    return {
      label,
      payload: Array.isArray(result.payload) ? result.payload : [],
      rateLimit: result.rateLimit,
    };
  }));
  const successful = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  if (successful.length === 0) {
    throw results[0]?.reason || new Error("A Nexus não retornou o catálogo autenticado.");
  }

  const uniqueMods = new Map();
  for (const feed of successful) {
    for (const mod of feed.payload) {
      const modId = String(mod?.mod_id || "");
      if (!/^[1-9][0-9]*$/.test(modId)) continue;
      if (mod?.available === false || mod?.contains_adult_content === true) continue;
      const name = String(mod?.name || "").trim();
      if (!name) continue;
      const pictureUrl = String(mod?.picture_url || "");
      const catalogId = `${domain}:${modId}`;
      if (uniqueMods.has(catalogId)) continue;
      uniqueMods.set(catalogId, {
        id: `${domain}:${modId}`,
        modId,
        name: name.slice(0, 240),
        author: String(mod?.author || mod?.uploaded_by || "Autor não informado").slice(0, 120),
        summary: String(mod?.summary || "").replace(/<[^>]*>/g, "").slice(0, 600),
        pictureUrl: /^https:\/\//i.test(pictureUrl) ? pictureUrl : "",
        modPageUrl: `https://www.nexusmods.com/${encodeURIComponent(domain)}/mods/${modId}`,
        version: String(mod?.version || "").slice(0, 80),
        downloads: Math.max(0, Number(mod?.mod_downloads) || 0),
        endorsements: Math.max(0, Number(mod?.endorsement_count) || 0),
        updatedAt: Number(mod?.updated_timestamp) || null,
        feed: feed.label,
      });
    }
  }

  const remainingValues = successful
    .map((result) => result.rateLimit.dailyRemaining)
    .filter((value) => typeof value === "number");
  return {
    mods: [...uniqueMods.values()],
    rateLimit: {
      dailyRemaining: remainingValues.length ? Math.min(...remainingValues) : null,
      hourlyRemaining: successful.at(-1)?.rateLimit.hourlyRemaining ?? null,
    },
  };
};

const getNexusModCatalog = async ({
  apiKey,
  appVersion,
  gameDomain,
  fetchImpl,
}) => {
  const domain = normalizeGameDomain(gameDomain);
  const curated = await getCuratedNexusModCatalog({
    apiKey,
    appVersion,
    gameDomain: domain,
    fetchImpl,
  });

  const uniqueMods = new Map(curated.mods.map((mod) => [mod.id, mod]));
  const recentResult = await Promise.allSettled([
    nexusRequest({
      pathname: `/games/${encodeURIComponent(domain)}.json`,
      apiKey,
      appVersion,
      fetchImpl,
    }),
    nexusRequest({
      pathname: `/games/${encodeURIComponent(domain)}/mods/updated.json?period=1m`,
      apiKey,
      appVersion,
      fetchImpl,
    }),
  ]);

  const gamePayload = recentResult[0].status === "fulfilled"
    ? recentResult[0].value.payload
    : null;
  const updatesPayload = recentResult[1].status === "fulfilled"
    ? recentResult[1].value.payload
    : null;
  const gameId = String(gamePayload?.id || "");
  const updates = Array.isArray(updatesPayload) ? updatesPayload : [];
  const recentByModId = new Map();
  let resolvedRecentCount = 0;

  if (/^[1-9][0-9]*$/.test(gameId)) {
    for (const update of updates) {
      const modId = String(update?.mod_id || "");
      if (!/^[1-9][0-9]*$/.test(modId)) continue;
      const updatedAt = Math.max(
        0,
        Number(update?.latest_mod_activity) || 0,
        Number(update?.latest_file_update) || 0,
      ) || null;
      recentByModId.set(modId, updatedAt);
    }

    const compositeIds = [...recentByModId.keys()].map((modId) =>
      getCompositeModUid(gameId, modId));
    const batchResults = await Promise.allSettled(
      chunkArray(compositeIds, NEXUS_MOD_BATCH_SIZE).map((modIds) =>
        nexusRequest({
          pathname: "/mods/batch",
          apiKey,
          appVersion,
          fetchImpl,
          baseUrl: NEXUS_API_V3_BASE_URL,
          method: "POST",
          body: { mod_ids: modIds },
          timeoutMs: BATCH_REQUEST_TIMEOUT_MS,
        })),
    );

    for (const batchResult of batchResults) {
      if (batchResult.status !== "fulfilled") continue;
      const payload = batchResult.value.payload;
      const batchMods = Array.isArray(payload?.data?.mods)
        ? payload.data.mods
        : Array.isArray(payload?.mods)
          ? payload.mods
          : [];

      for (const mod of batchMods) {
        const compositeId = String(mod?.id || "");
        if (!/^[1-9][0-9]*$/.test(compositeId)) continue;
        const modId = getScopedModId(compositeId);
        if (!recentByModId.has(modId)) continue;
        if (mod?.status !== "published" || mod?.adult_content === true) continue;
        const name = String(mod?.name || "").trim();
        if (!name) continue;
        resolvedRecentCount += 1;

        const catalogId = `${domain}:${modId}`;
        const existing = uniqueMods.get(catalogId);
        const pictureUrl = String(mod?.thumbnail_url || existing?.pictureUrl || "");
        uniqueMods.set(catalogId, {
          id: catalogId,
          modId,
          name: name.slice(0, 240),
          author: existing?.author || "Autor não informado",
          summary: String(mod?.summary || existing?.summary || "")
            .replace(/<[^>]*>/g, "")
            .slice(0, 600),
          pictureUrl: /^https:\/\//i.test(pictureUrl) ? pictureUrl : "",
          modPageUrl: `https://www.nexusmods.com/${encodeURIComponent(domain)}/mods/${modId}`,
          version: existing?.version || "",
          downloads: existing?.downloads || 0,
          endorsements: existing?.endorsements || 0,
          updatedAt: recentByModId.get(modId) || existing?.updatedAt || null,
          feed: existing?.feed || "Últimos 30 dias",
        });
      }
    }
  }

  const recentRateLimits = recentResult
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value.rateLimit.dailyRemaining)
    .filter((value) => typeof value === "number");
  const remainingValues = [
    curated.rateLimit.dailyRemaining,
    ...recentRateLimits,
  ].filter((value) => typeof value === "number");

  return {
    mods: [...uniqueMods.values()],
    scope: resolvedRecentCount > 0 ? "recent-30-days" : "curated-feeds",
    recentCandidateCount: recentByModId.size,
    rateLimit: {
      dailyRemaining: remainingValues.length ? Math.min(...remainingValues) : null,
      hourlyRemaining: recentResult
        .filter((result) => result.status === "fulfilled")
        .at(-1)?.value.rateLimit.hourlyRemaining
        ?? curated.rateLimit.hourlyRemaining,
    },
  };
};

module.exports = {
  NEXUS_API_BASE_URL,
  NEXUS_API_V3_BASE_URL,
  NEXUS_APPLICATION_NAME,
  getNexusModCatalog,
  getNexusDownloadLinks,
  getNexusModDetails,
  getNexusModFiles,
  normalizeApiKey,
  normalizeGameDomain,
  normalizeModId,
  normalizeNexusDownloadExpiry,
  normalizeNexusDownloadToken,
  validateNexusApiKey,
};
