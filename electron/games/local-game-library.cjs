"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const MAX_GAME_JSON_BYTES = 4 * 1024 * 1024;
const MAX_BULK_GAMES = 2_000;

const asUid = (value) => {
  const uid = String(value || "").trim();
  if (!uid || uid.length > 128) throw new Error("UID de biblioteca invalido.");
  return uid;
};

const asGameId = (value) => {
  const gameId = String(value || "").trim();
  if (!gameId || gameId.length > 180) throw new Error("ID de jogo invalido.");
  return gameId;
};

const safeImageUrl = (value) => {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  return url.slice(0, 2_048);
};

const cleanGame = (value, forcedId) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Dados de jogo invalidos.");
  }
  const id = asGameId(forcedId || value.id || crypto.randomUUID());
  const title = String(value.title || "").trim().slice(0, 300);
  if (!title) throw new Error("Titulo do jogo obrigatorio.");

  const game = {
    ...value,
    id,
    title,
    updatedAt: new Date().toISOString(),
  };
  const json = JSON.stringify(game);
  if (Buffer.byteLength(json, "utf8") > MAX_GAME_JSON_BYTES) {
    throw new Error("O jogo excede o limite local de 4 MB.");
  }
  return { game, json };
};

const parseGameRow = (row) => {
  try {
    const game = JSON.parse(row.data_json);
    return { ...game, id: row.game_id };
  } catch {
    return null;
  }
};

const createLocalGameLibrary = (userDataPath) => {
  const databasePath = path.join(userDataPath, "checkpoint-library.sqlite");
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS games (
      owner_uid TEXT NOT NULL,
      game_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      launcher_type TEXT NOT NULL DEFAULT '',
      steam_app_id TEXT NOT NULL DEFAULT '',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      hours_played REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_uid, game_id)
    );

    CREATE INDEX IF NOT EXISTS games_owner_title
      ON games(owner_uid, updated_at);
    CREATE INDEX IF NOT EXISTS games_owner_steam
      ON games(owner_uid, steam_app_id);

    CREATE TABLE IF NOT EXISTS library_state (
      owner_uid TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0,
      summary_dirty INTEGER NOT NULL DEFAULT 1,
      legacy_imported_at TEXT,
      summary_synced_at TEXT,
      device_id TEXT NOT NULL,
      steam_id TEXT
    );

    CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      owner_uid TEXT NOT NULL,
      game_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS platform_cleanup_state (
      owner_uid TEXT NOT NULL,
      platform TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_uid, platform)
    );
  `);

  try {
    db.exec("ALTER TABLE library_state ADD COLUMN steam_id TEXT;");
  } catch (err) {
    // Column already exists
  }

  const ensureState = (uid) => {
    db.prepare(`
      INSERT INTO library_state(owner_uid, device_id)
      VALUES (?, ?)
      ON CONFLICT(owner_uid) DO NOTHING
    `).run(uid, crypto.randomUUID());
  };

  const markDirty = (uid) => {
    ensureState(uid);
    db.prepare(`
      UPDATE library_state
      SET revision = revision + 1, summary_dirty = 1
      WHERE owner_uid = ?
    `).run(uid);
  };

  const upsertStatement = db.prepare(`
    INSERT INTO games(
      owner_uid, game_id, data_json, launcher_type, steam_app_id,
      is_favorite, hours_played, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_uid, game_id) DO UPDATE SET
      data_json = excluded.data_json,
      launcher_type = excluded.launcher_type,
      steam_app_id = excluded.steam_app_id,
      is_favorite = excluded.is_favorite,
      hours_played = excluded.hours_played,
      updated_at = excluded.updated_at
  `);

  const writeGame = (uid, game) => {
    const { game: normalized, json } = cleanGame(game);
    upsertStatement.run(
      uid,
      normalized.id,
      json,
      String(normalized.launcherType || ""),
      String(normalized.steamAppId || ""),
      normalized.isFavorite ? 1 : 0,
      Math.max(0, Number(normalized.hoursPlayed) || 0),
      normalized.updatedAt,
    );
    return normalized;
  };

  const list = (rawUid) => {
    const uid = asUid(rawUid);
    ensureState(uid);
    return db.prepare(`
      SELECT game_id, data_json
      FROM games
      WHERE owner_uid = ?
      ORDER BY json_extract(data_json, '$.title') COLLATE NOCASE
    `).all(uid).map(parseGameRow).filter(Boolean);
  };

  const create = (rawUid, value) => {
    const uid = asUid(rawUid);
    const now = new Date().toISOString();
    const normalized = writeGame(uid, {
      ...value,
      id: value?.id || crypto.randomUUID(),
      createdAt: value?.createdAt || now,
      updatedAt: now,
    });
    markDirty(uid);
    return normalized;
  };

  const update = (rawUid, rawGameId, patch) => {
    const uid = asUid(rawUid);
    const gameId = asGameId(rawGameId);
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("Alteracoes do jogo invalidas.");
    }
    const row = db.prepare(`
      SELECT game_id, data_json FROM games WHERE owner_uid = ? AND game_id = ?
    `).get(uid, gameId);
    if (!row) {
      if (patch.title) {
        const normalized = writeGame(uid, { ...patch, id: gameId });
        markDirty(uid);
        return normalized;
      }
      return null;
    }
    const current = parseGameRow(row);
    const normalized = writeGame(uid, { ...current, ...patch, id: gameId });
    markDirty(uid);
    return normalized;
  };

  const remove = (rawUid, rawGameId) => {
    const uid = asUid(rawUid);
    const gameId = asGameId(rawGameId);
    const result = db.prepare(`
      DELETE FROM games WHERE owner_uid = ? AND game_id = ?
    `).run(uid, gameId);
    if (Number(result.changes) > 0) markDirty(uid);
    return Number(result.changes) > 0;
  };

  const removeByLauncher = (rawUid, launcherType) => {
    const uid = asUid(rawUid);
    const launcher = String(launcherType || "").trim();
    const result = db.prepare(`
      DELETE FROM games WHERE owner_uid = ? AND launcher_type = ?
    `).run(uid, launcher);
    if (Number(result.changes) > 0) markDirty(uid);
    return Number(result.changes);
  };

  const recordSession = (rawUid, rawGameId, session = {}) => {
    const uid = asUid(rawUid);
    const gameId = asGameId(rawGameId);
    const startedAt = String(session.startedAt || "");
    const endedAt = String(session.endedAt || "");
    const durationMinutes = Math.min(
      7 * 24 * 60,
      Math.max(0, Math.round(Number(session.durationMinutes) || 0)),
    );
    if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(endedAt))) {
      throw new Error("Sessao de jogo invalida.");
    }
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO game_sessions(
        id, owner_uid, game_id, started_at, ended_at, duration_minutes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, uid, gameId, startedAt, endedAt, durationMinutes);
    return id;
  };

  const bulkUpsert = (rawUid, values) => {
    const uid = asUid(rawUid);
    if (!Array.isArray(values) || values.length > MAX_BULK_GAMES) {
      throw new Error("Lote de jogos invalido.");
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      const games = values.map((value) => {
        const steamAppId = String(value?.steamAppId || "");
        let existingId = "";
        if (steamAppId) {
          existingId = String(db.prepare(`
            SELECT game_id FROM games
            WHERE owner_uid = ? AND steam_app_id = ?
            LIMIT 1
          `).get(uid, steamAppId)?.game_id || "");
        }
        const existing = existingId
          ? parseGameRow(db.prepare(`
            SELECT game_id, data_json FROM games
            WHERE owner_uid = ? AND game_id = ?
          `).get(uid, existingId))
          : null;
        return writeGame(uid, {
          ...existing,
          ...value,
          id: existingId || value?.id || crypto.randomUUID(),
          createdAt: existing?.createdAt || value?.createdAt || new Date().toISOString(),
        });
      });
      markDirty(uid);
      db.exec("COMMIT");
      return games;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  const importLegacy = (rawUid, values) => {
    const uid = asUid(rawUid);
    ensureState(uid);
    const state = db.prepare(`
      SELECT legacy_imported_at FROM library_state WHERE owner_uid = ?
    `).get(uid);
    if (state?.legacy_imported_at) return { imported: 0, alreadyImported: true };
    if (!Array.isArray(values) || values.length > MAX_BULK_GAMES) {
      throw new Error("Biblioteca legada invalida.");
    }

    let imported = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const value of values) {
        const gameId = asGameId(value?.id || crypto.randomUUID());
        const exists = db.prepare(`
          SELECT 1 FROM games WHERE owner_uid = ? AND game_id = ?
        `).get(uid, gameId);
        if (exists) continue;
        writeGame(uid, { ...value, id: gameId });
        imported += 1;
      }
      db.prepare(`
        UPDATE library_state
        SET legacy_imported_at = ?, summary_dirty = 1,
            revision = revision + 1
        WHERE owner_uid = ?
      `).run(new Date().toISOString(), uid);
      db.exec("COMMIT");
      return { imported, alreadyImported: false };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  const needsLegacyImport = (rawUid) => {
    const uid = asUid(rawUid);
    ensureState(uid);
    const state = db.prepare(`
      SELECT legacy_imported_at FROM library_state WHERE owner_uid = ?
    `).get(uid);
    return !state?.legacy_imported_at;
  };

  const getSummary = (rawUid) => {
    const uid = asUid(rawUid);
    const games = list(uid);
    const state = db.prepare(`
      SELECT revision, summary_dirty, device_id FROM library_state WHERE owner_uid = ?
    `).get(uid);
    const totalMinutes = games.reduce((sum, game) => {
      const steamMinutes = Math.max(0, Number(game.steamPlaytimeMinutes) || 0);
      const trackedMinutes = Math.max(0, Number(game.locallyTrackedMinutes) || 0);
      const localMinutes = Math.max(0, Math.round((Number(game.hoursPlayed) || 0) * 60));
      return sum + Math.max(steamMinutes, trackedMinutes, localMinutes);
    }, 0);
    const achievementUnlocked = games.reduce(
      (sum, game) => sum + Math.max(0, Number(game.completedAchievements) || 0),
      0,
    );
    const achievementTotal = games.reduce(
      (sum, game) => sum + Math.max(0, Number(game.totalAchievements) || 0),
      0,
    );
    const compactGame = (game) => ({
      id: String(game.id),
      title: String(game.title || "").slice(0, 160),
      minutesPlayed: Math.max(
        Math.max(0, Number(game.steamPlaytimeMinutes) || 0),
        Math.max(0, Number(game.locallyTrackedMinutes) || 0),
        Math.max(0, Math.round((Number(game.hoursPlayed) || 0) * 60)),
      ),
      imageUrl: safeImageUrl(game.cardImage || game.image),
      isFavorite: Boolean(game.isFavorite),
    });
    const topGames = [...games]
      .sort((a, b) => compactGame(b).minutesPlayed - compactGame(a).minutesPlayed)
      .slice(0, 10)
      .map(compactGame);
    const favoriteGames = games
      .filter((game) => game.isFavorite)
      .slice(0, 10)
      .map(compactGame);
    const countLauncher = (launcher) =>
      games.filter((game) => String(game.launcherType || "local") === launcher).length;

    return {
      schemaVersion: 1,
      stats: {
        games: games.length,
        minutesPlayed: totalMinutes,
        favorites: games.filter((game) => game.isFavorite).length,
      },
      platforms: {
        steamGameCount: countLauncher("steam"),
        epicGameCount: countLauncher("epic"),
        localGameCount: countLauncher("local"),
      },
      achievements: {
        unlocked: achievementUnlocked,
        total: achievementTotal,
      },
      topGames,
      favoriteGames,
      revision: Number(state?.revision) || 0,
      deviceId: String(state?.device_id || ""),
      dirty: Boolean(state?.summary_dirty),
    };
  };

  const markSummarySynced = (rawUid, revision) => {
    const uid = asUid(rawUid);
    db.prepare(`
      UPDATE library_state
      SET summary_dirty = CASE WHEN revision = ? THEN 0 ELSE summary_dirty END,
          summary_synced_at = ?
      WHERE owner_uid = ?
    `).run(Number(revision) || 0, new Date().toISOString(), uid);
  };

  const clearSteamId = (rawUid) => {
    const uid = asUid(rawUid);
    db.prepare(`
      UPDATE library_state
      SET steam_id = NULL
      WHERE owner_uid = ?
    `).run(uid);
  };

  const purgePlatform = (rawUid, rawPlatform) => {
    const uid = asUid(rawUid);
    const platform = String(rawPlatform || "").trim().toLowerCase();
    if (platform !== "steam" && platform !== "epic") {
      throw new Error("Plataforma invalida para limpeza.");
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const rows = db.prepare(`
        SELECT game_id, data_json, launcher_type, steam_app_id
        FROM games
        WHERE owner_uid = ?
      `).all(uid);

      const targetGameIds = [];
      const steamAppIds = [];
      const epicCatalogIds = [];

      for (const row of rows) {
        let gameObj = null;
        try {
          gameObj = JSON.parse(row.data_json);
        } catch {}

        const launcherType = String(row.launcher_type || gameObj?.launcherType || "").toLowerCase().trim();
        const steamAppId = String(row.steam_app_id || gameObj?.steamAppId || "").trim();
        const epicCatalogId = String(gameObj?.epicCatalogId || "").trim();

        // Jogos locais ou manuais nunca devem ser removidos ao desconectar plataformas externas
        const isLocalOrManual =
          launcherType === "local" ||
          launcherType === "retro" ||
          launcherType === "emulator" ||
          launcherType === "ea" ||
          launcherType === "ubisoft" ||
          launcherType === "gog" ||
          launcherType === "xbox" ||
          launcherType === "riot" ||
          launcherType === "battlenet" ||
          launcherType === "rockstar" ||
          launcherType === "itch" ||
          gameObj?.source === "manual";

        const isMatch = !isLocalOrManual && launcherType === platform;

        if (isMatch) {
          targetGameIds.push(row.game_id);
          if (steamAppId) steamAppIds.push(steamAppId);
          if (epicCatalogId) epicCatalogIds.push(epicCatalogId);
        }
      }

      let deletedSessions = 0;
      for (const gameId of targetGameIds) {
        const sessionRes = db.prepare(`
          DELETE FROM game_sessions WHERE owner_uid = ? AND game_id = ?
        `).run(uid, gameId);
        deletedSessions += Number(sessionRes.changes || 0);

        db.prepare(`
          DELETE FROM games WHERE owner_uid = ? AND game_id = ?
        `).run(uid, gameId);
      }

      if (platform === "steam") {
        db.prepare(`
          UPDATE library_state SET steam_id = NULL WHERE owner_uid = ?
        `).run(uid);
      }

      markDirty(uid);
      db.exec("COMMIT");

      return {
        games: targetGameIds.length,
        sessions: deletedSessions,
        gameIds: targetGameIds,
        steamAppIds,
        epicCatalogIds,
      };
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  const getPlatformCleanup = (rawUid, rawPlatform) => {
    const uid = asUid(rawUid);
    const platform = String(rawPlatform || "").trim().toLowerCase();
    const row = db.prepare(`
      SELECT operation_id, phase, updated_at
      FROM platform_cleanup_state
      WHERE owner_uid = ? AND platform = ?
    `).get(uid, platform);

    if (!row) return null;
    return {
      operationId: row.operation_id,
      phase: row.phase,
      updatedAt: row.updated_at,
    };
  };

  const setPlatformCleanupPhase = (rawUid, rawPlatform, rawOpId, rawPhase) => {
    const uid = asUid(rawUid);
    const platform = String(rawPlatform || "").trim().toLowerCase();
    const operationId = String(rawOpId || "").trim();
    const phase = String(rawPhase || "").trim();
    const now = Date.now();

    db.prepare(`
      INSERT INTO platform_cleanup_state (owner_uid, platform, operation_id, phase, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(owner_uid, platform) DO UPDATE SET
        operation_id = excluded.operation_id,
        phase = excluded.phase,
        updated_at = excluded.updated_at
    `).run(uid, platform, operationId, phase, now);
  };

  const completePlatformCleanup = (rawUid, rawPlatform, rawOpId) => {
    const uid = asUid(rawUid);
    const platform = String(rawPlatform || "").trim().toLowerCase();
    const operationId = String(rawOpId || "").trim();

    db.prepare(`
      DELETE FROM platform_cleanup_state
      WHERE owner_uid = ? AND platform = ? AND operation_id = ?
    `).run(uid, platform, operationId);
  };

  const close = () => db.close();

  return {
    databasePath,
    list,
    create,
    update,
    remove,
    removeByLauncher,
    purgePlatform,
    getPlatformCleanup,
    setPlatformCleanupPhase,
    completePlatformCleanup,
    recordSession,
    bulkUpsert,
    importLegacy,
    needsLegacyImport,
    getSummary,
    markSummarySynced,
    clearSteamId,
    close,
  };
};

module.exports = {
  createLocalGameLibrary,
};
