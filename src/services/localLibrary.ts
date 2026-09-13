import { supabase } from "./supabase";
import type { Game, UserProfile } from "../types/domain";
import { cachedQuery, invalidate } from "../lib/queryCache";

const CLOUD_PAGE_SIZE = 100;
const CLOUD_GAME_LIMIT = 500;
const PUBLIC_LIBRARY_SYNC_VERSION = 2;

const sorted = (games: Game[]) =>
  [...games].sort((a, b) => a.title.localeCompare(b.title));

const chunked = <T,>(items: T[], size = CLOUD_PAGE_SIZE): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const toCloudGameRow = (uid: string, game: Game) => {
  const calculatedMinutes = Math.max(
    0,
    Number(game.steamPlaytimeMinutes) || 0,
    Number(game.locallyTrackedMinutes) || 0,
    Math.round((Number(game.hoursPlayed) || 0) * 60),
  );
  const hoursPlayed = calculatedMinutes > 0
    ? Number((calculatedMinutes / 60).toFixed(1))
    : (Number(game.hoursPlayed) || 0);

  return {
    id: game.id,
    user_id: uid,
    title: game.title,
    launcher_type: game.launcherType || "local",
    hours_played: hoursPlayed,
    steam_app_id: game.steamAppId || null,
    epic_catalog_id: game.epicCatalogId || null,
    is_favorite: Boolean(game.isFavorite),
    data: {
      ...game,
      hoursPlayed,
      cardImage: game.cardImage || game.image || "",
      image: game.image || game.cardImage || "",
    },
    updated_at: new Date().toISOString(),
  };
};

const fromCloudGameRow = (row: Record<string, any>): Game => ({
  ...(row.data || {}),
  id: String(row.id),
  title: String(row.data?.title || row.title || "Jogo"),
  launcherType: row.data?.launcherType || row.launcher_type || "local",
  hoursPlayed: Number(row.data?.hoursPlayed ?? row.hours_played ?? 0),
  steamAppId: row.data?.steamAppId || row.steam_app_id || undefined,
  epicCatalogId: row.data?.epicCatalogId || row.epic_catalog_id || undefined,
  isFavorite: Boolean(row.data?.isFavorite ?? row.is_favorite),
});

const syncLocalGamesToCloud = async (uid: string) => {
  if (!window.electronAPI?.listLocalGames) return;

  const localGames = await window.electronAPI.listLocalGames(uid);
  const normalizedGames = Array.isArray(localGames)
    ? localGames.slice(0, CLOUD_GAME_LIMIT)
    : [];
  const rows = normalizedGames.map((game) => toCloudGameRow(uid, game));

  for (const chunk of chunked(rows)) {
    const { error: upsertError } = await supabase
      .from("user_games")
      .upsert(chunk, { onConflict: "user_id,id" });

    if (upsertError) throw upsertError;
  }

  // Remove da cópia pública jogos que já não existem na biblioteca local.
  // Isso evita perfis exibindo jogos antigos após exclusões/desconexões.
  const { data: existingRows, error: existingError } = await supabase
    .from("user_games")
    .select("id")
    .eq("user_id", uid);

  if (existingError) throw existingError;

  const desiredIds = new Set(rows.map((row) => String(row.id)));
  const staleIds = (existingRows || [])
    .map((row) => String(row.id))
    .filter((id) => !desiredIds.has(id));

  for (const staleChunk of chunked(staleIds)) {
    const { error: deleteError } = await supabase
      .from("user_games")
      .delete()
      .eq("user_id", uid)
      .in("id", staleChunk);

    if (deleteError) throw deleteError;
  }
};

export const listLibraryGames = async (uid: string): Promise<Game[]> => {
  if (window.electronAPI?.listLocalGames) {
    return sorted(await window.electronAPI.listLocalGames(uid));
  }
  const cacheKey = `games:list:${uid}`;
  return cachedQuery(
    cacheKey,
    async () => {
      // Paginate to avoid huge single egress burst (100 rows per page)
      let allRows: Record<string, any>[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("user_games")
          .select("id,title,launcher_type,hours_played,steam_app_id,epic_catalog_id,is_favorite,data,updated_at")
          .eq("user_id", uid)
          .order("title", { ascending: true })
          .range(from, from + CLOUD_PAGE_SIZE - 1);
        if (error || !data) break;
        allRows.push(...(data as Record<string, any>[]));
        if (data.length < CLOUD_PAGE_SIZE) break;
        from += CLOUD_PAGE_SIZE;
        // Safety: cap at 500 games (5 pages) to avoid runaway egress
        if (from >= CLOUD_GAME_LIMIT) break;
      }
      if (allRows.length === 0) return [] as Game[];
      return sorted(allRows.map((row) => fromCloudGameRow(row)));
    },
    { ttl: 30_000, stale: 60_000 },
  );
};

export const createLibraryGame = async (
  uid: string,
  game: Omit<Game, "id"> & { id?: string },
): Promise<Game> => {
  if (window.electronAPI?.createLocalGame) {
    return window.electronAPI.createLocalGame(uid, game);
  }
  const id = game.id || crypto.randomUUID();
  const newGame = { ...game, id } as Game;
  const { error } = await supabase.from("user_games").insert(toCloudGameRow(uid, newGame));
  if (error) throw error;
  invalidate(`games:list:${uid}`);
  return newGame;
};

export const updateLibraryGame = async (
  uid: string,
  gameId: string,
  patch: Partial<Game>,
): Promise<Game | null> => {
  if (window.electronAPI?.updateLocalGame) {
    return window.electronAPI.updateLocalGame(uid, gameId, patch);
  }
  const { data: current, error: readError } = await supabase
    .from("user_games")
    .select("*")
    .eq("id", gameId)
    .eq("user_id", uid)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return null;
  const updated = { ...fromCloudGameRow(current), ...patch, id: gameId };
  const { error } = await supabase
    .from("user_games")
    .update(toCloudGameRow(uid, updated))
    .eq("id", gameId)
    .eq("user_id", uid);
  if (error) throw error;
  invalidate(`games:list:${uid}`);
  return updated;
};

export const deleteLibraryGame = async (uid: string, gameId: string) => {
  if (window.electronAPI?.deleteLocalGame) {
    return window.electronAPI.deleteLocalGame(uid, gameId);
  }
  const { error } = await supabase
    .from("user_games")
    .delete()
    .eq("id", gameId)
    .eq("user_id", uid);
  if (error) throw error;
  invalidate(`games:list:${uid}`);
  return true;
};

export const deleteLibraryGamesByLauncher = async (
  uid: string,
  launcherType: "steam" | "epic" | "local",
) => {
  if (window.electronAPI?.deleteLocalGamesByLauncher) {
    return window.electronAPI.deleteLocalGamesByLauncher(uid, launcherType);
  }
  const { data, error } = await supabase
    .from("user_games")
    .delete()
    .eq("user_id", uid)
    .eq("launcher_type", launcherType)
    .select("id");
  if (error) throw error;
  invalidate(`games:list:${uid}`);
  return data?.length || 0;
};

export const recordLibrarySession = async (
  uid: string,
  gameId: string,
  session: { startedAt: string; endedAt: string; durationMinutes: number },
) => {
  if (!window.electronAPI?.recordLocalGameSession) return null;
  return window.electronAPI.recordLocalGameSession(uid, gameId, session);
};

export const bulkUpsertLibraryGames = async (uid: string, games: Game[]) => {
  if (window.electronAPI?.bulkUpsertLocalGames) {
    return window.electronAPI.bulkUpsertLocalGames(uid, games);
  }
  const items = games.map((game) => toCloudGameRow(uid, game));
  const { error } = await supabase.from("user_games").upsert(items, {
    onConflict: "user_id,id",
  });
  if (error) throw error;
  invalidate(`games:list:${uid}`);
  return games;
};

export const importFirestoreLibraryIntoLocal = async (uid: string) => {
  if (!window.electronAPI?.importLegacyGames) {
    return { imported: 0, alreadyImported: true };
  }
  if (
    window.electronAPI.needsLegacyGameImport
    && !await window.electronAPI.needsLegacyGameImport(uid)
  ) {
    return { imported: 0, alreadyImported: true };
  }
  const { data, error } = await supabase
    .from("user_games")
    .select("*")
    .eq("user_id", uid);
  if (error) throw error;
  const games = (data || []).map((row) =>
    fromCloudGameRow(row as Record<string, any>),
  );
  return window.electronAPI.importLegacyGames(uid, games);
};

export const syncPublicLibrarySummary = async (
  uid: string,
  profile?: UserProfile | null,
) => {
  if (!window.electronAPI?.getLocalLibrarySummary) return false;

  const summary = await window.electronAPI.getLocalLibrarySummary(uid);
  const photoURL = profile?.photoURL
    || profile?.discordAvatar
    || profile?.steamAvatar
    || "";
  const profileVisibility = profile?.profileVisibility === "private" ? "private" : "public";

  // v2 força uma ressincronização única para quem ficou preso no fluxo antigo,
  // que marcava o resumo como sincronizado antes de user_games terminar.
  const profileFingerprint = JSON.stringify([
    PUBLIC_LIBRARY_SYNC_VERSION,
    profile?.displayName || "Jogador",
    photoURL,
    profile?.bio || "",
    profile?.website || "",
    profile?.favoriteGenres || [],
    profileVisibility,
  ]);
  const fingerprintKey = `checkpoint_public_profile_fingerprint_v${PUBLIC_LIBRARY_SYNC_VERSION}_${uid}`;

  if (
    !summary.dirty
    && localStorage.getItem(fingerprintKey) === profileFingerprint
  ) return false;

  // 1) Primeiro garante que a biblioteca pública real esteja coerente.
  // Se isso falhar, NÃO marcamos o resumo local como sincronizado.
  await syncLocalGamesToCloud(uid);

  // 2) Depois publica apenas as colunas que realmente existem em public_profiles.
  // Steam/Discord continuam vindo de profiles; não duplicamos isso em "platforms".
  const { error: publicProfileError } = await supabase
    .from("public_profiles")
    .upsert({
      uid,
      display_name: profile?.displayName || "Jogador",
      photo_url: photoURL,
      bio: profile?.bio || "",
      website: profile?.website || "",
      favorite_genres: profile?.favoriteGenres || [],
      stats: summary.stats,
      achievements: summary.achievements,
      top_games: summary.topGames,
      favorite_games: summary.favoriteGames,
      profile_visibility: profileVisibility,
      revision: summary.revision,
      updated_at: new Date().toISOString(),
    }, { onConflict: "uid" });

  if (publicProfileError) throw publicProfileError;

  // 3) Só agora podemos considerar a revisão realmente sincronizada.
  await window.electronAPI.markLocalLibrarySummarySynced(
    uid,
    summary.revision,
  );
  localStorage.setItem(fingerprintKey, profileFingerprint);
  invalidate(`games:list:${uid}`);

  return true;
};
