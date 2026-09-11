const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { z } = require("zod");

const GRAPHQL_ENDPOINT = "https://launcher.store.epicgames.com/graphql";
const STORE_USER_AGENT =
  "EpicGamesLauncher/14.0.8-22004686+++Portal+Release-Live";

const ACHIEVEMENT_DEFINITIONS_QUERY = `query Achievement($sandboxId: String!, $locale: String!) {
  Achievement {
    productAchievementsRecordBySandbox(sandboxId: $sandboxId, locale: $locale) {
      sandboxId
      totalAchievements
      achievements {
        achievement {
          name
          hidden
          unlockedDisplayName
          lockedDisplayName
          unlockedDescription
          lockedDescription
          unlockedIconLink
          lockedIconLink
          XP
          rarity {
            percent
          }
        }
      }
    }
  }
}`;

const PLAYER_ACHIEVEMENTS_QUERY = `query PlayerAchievement($epicAccountId: String!, $sandboxId: String!) {
  PlayerAchievement {
    playerAchievementGameRecordsBySandbox(epicAccountId: $epicAccountId, sandboxId: $sandboxId) {
      records {
        totalUnlocked
        playerAchievements {
          playerAchievement {
            sandboxId
            epicAccountId
            unlocked
            progress
            XP
            unlockDate
            achievementName
          }
        }
      }
    }
  }
}`;

const authRequestSchema = z
  .object({
    code: z.string().trim().min(8).max(2048).regex(/^[^\r\n]+$/),
  })
  .strict();

const achievementRequestSchema = z
  .object({
    sandboxId: z.string().trim().max(300).optional(),
    appName: z.string().trim().max(300).optional(),
  })
  .strict();

const findLegendaryConfigDir = () => {
  const candidates = [
    path.join(os.homedir(), ".config", "legendary"),
    ...(process.env.LOCALAPPDATA
      ? [path.join(process.env.LOCALAPPDATA, "legendary")]
      : []),
    ...(process.env.APPDATA
      ? [path.join(process.env.APPDATA, "legendary")]
      : []),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "user.json"))) return dir;
    } catch {}
  }
  return candidates[0] || "";
};

const readLegendaryToken = () => {
  try {
    const configDir = findLegendaryConfigDir();
    const userPath = path.join(configDir, "user.json");
    if (!fs.existsSync(userPath)) return null;
    const data = JSON.parse(fs.readFileSync(userPath, "utf8"));
    return data?.access_token || data?.token || null;
  } catch {
    return null;
  }
};

const readLegendaryAccountId = () => {
  try {
    const configDir = findLegendaryConfigDir();
    const userPath = path.join(configDir, "user.json");
    if (!fs.existsSync(userPath)) return null;
    const data = JSON.parse(fs.readFileSync(userPath, "utf8"));
    return data?.account_id || null;
  } catch {
    return null;
  }
};

const normalizeAchievementList = (rawList) => {
  if (!rawList || !Array.isArray(rawList)) return [];
  const seen = new Set();
  const list = [];

  for (const ach of rawList) {
    const apiName = String(
      ach.name || ach.id || ach.api_name || ach.achievementName || "",
    ).trim();
    if (!apiName || seen.has(apiName)) continue;
    seen.add(apiName);

    const achieved = Boolean(ach.unlocked || ach.achieved);
    const unlockTime = ach.unlock_date
      ? Math.round(new Date(ach.unlock_date).getTime() / 1000)
      : ach.unlockTime || 0;

    list.push({
      apiName,
      name: String(
        ach.unlockedDisplayName ||
          ach.display_name ||
          ach.name ||
          "Conquista",
      ).trim(),
      description: String(
        ach.unlockedDescription ||
          ach.description ||
          (ach.hidden ? "Conquista oculta" : ""),
      ).trim(),
      achieved,
      unlockTime,
      icon: String(
        ach.unlockedIconLink || ach.icon_url || ach.icon_link || ach.icon || "",
      ).trim(),
      iconGray: String(
        ach.lockedIconLink ||
          ach.icon_url ||
          ach.icon_link ||
          ach.iconGray ||
          "",
      ).trim(),
      hidden: Boolean(ach.hidden),
    });
  }

  return list;
};

const fetchGraphQLAchievements = async (sandboxId, accountId, locale) => {
  const token = readLegendaryToken();
  if (!token || !accountId || !sandboxId) return null;

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": STORE_USER_AGENT,
    Authorization: `Bearer ${token}`,
  };

  try {
    const [defsRes, progressRes] = await Promise.all([
      fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: ACHIEVEMENT_DEFINITIONS_QUERY,
          variables: { sandboxId, locale: locale || "en-US" },
        }),
      }),
      fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: PLAYER_ACHIEVEMENTS_QUERY,
          variables: { epicAccountId: accountId, sandboxId },
        }),
      }),
    ]);

    if (!defsRes.ok || !progressRes.ok) return null;

    const defsJson = await defsRes.json();
    const progressJson = await progressRes.json();

    const definitions =
      defsJson?.data?.Achievement
        ?.productAchievementsRecordBySandbox?.achievements || [];
    const playerRecords =
      progressJson?.data?.PlayerAchievement
        ?.playerAchievementGameRecordsBySandbox?.records?.[0]
        ?.playerAchievements || [];

    const playerMap = new Map();
    for (const pa of playerRecords) {
      const ach = pa?.playerAchievement;
      if (ach?.achievementName) {
        playerMap.set(ach.achievementName, {
          unlocked: Boolean(ach.unlocked),
          unlockDate: ach.unlockDate,
          progress: ach.progress,
        });
      }
    }

    const list = [];
    for (const def of definitions) {
      const ach = def?.achievement;
      if (!ach?.name) continue;

      const player = playerMap.get(ach.name);
      const achieved = Boolean(player?.unlocked);
      const unlockTime =
        player?.unlockDate && player.unlockDate !== "N/A"
          ? Math.round(new Date(player.unlockDate).getTime() / 1000)
          : 0;

      list.push({
        apiName: ach.name,
        name: String(ach.unlockedDisplayName || ach.name || "Conquista").trim(),
        description: String(
          ach.unlockedDescription ||
            ach.lockedDescription ||
            (ach.hidden ? "Conquista oculta" : ""),
        ).trim(),
        achieved,
        unlockTime,
        icon: String(ach.unlockedIconLink || "").trim(),
        iconGray: String(ach.lockedIconLink || "").trim(),
        hidden: Boolean(ach.hidden),
      });
    }

    const total = list.length;
    const completed = list.filter((a) => a.achieved).length;

    return { total, completed, list };
  } catch {
    return null;
  }
};

const createEpicAccount = ({ legendary, emitProgress, achievementsCache }) => {
  if (!legendary || typeof legendary.run !== "function") {
    throw new Error("LegendaryManager e obrigatorio para createEpicAccount.");
  }

  const getStatus = async () => {
    try {
      const output = await legendary.run(["status", "--json"]);
      const parsed = JSON.parse(output);
      const account =
        parsed?.account ||
        parsed?.account_id ||
        parsed?.display_name ||
        parsed?.displayName;
      if (
        account &&
        typeof account === "string" &&
        account.trim().length > 0 &&
        account.toLowerCase() !== "none" &&
        account.toLowerCase() !== "null" &&
        !account.toLowerCase().includes("not logged in") &&
        !account.toLowerCase().includes("<not logged in>")
      ) {
        let accountId = String(parsed?.account_id || "").trim();
        let displayName = String(
          parsed?.display_name || parsed?.displayName || "",
        ).trim();

        if ((!accountId || !displayName) && parsed?.config_directory) {
          try {
            const userJsonPath = path.join(
              parsed.config_directory,
              "user.json",
            );
            if (fs.existsSync(userJsonPath)) {
              const userData = JSON.parse(
                fs.readFileSync(userJsonPath, "utf8"),
              );
              if (!accountId && userData?.account_id)
                accountId = String(userData.account_id).trim();
              if (!displayName && userData?.displayName)
                displayName = String(userData.displayName).trim();
            }
          } catch {}
        }

        return {
          authenticated: true,
          accountId: accountId || String(account).trim(),
          displayName: displayName || String(account).trim(),
        };
      }
      return { authenticated: false };
    } catch {
      return { authenticated: false };
    }
  };

  const authenticate = async (payload) => {
    const validated = authRequestSchema.parse(payload);
    emitProgress?.({ phase: "authenticating" });

    await legendary.run(["auth", "--code", validated.code, "-y"]);
    return { success: true };
  };

  const listLibrary = async () => {
    emitProgress?.({ phase: "reading-library" });

    try {
      const output = await legendary.run(["list-games", "--json"]);
      let rawGames = [];
      try {
        rawGames = JSON.parse(output);
      } catch {
        return [];
      }

      if (!Array.isArray(rawGames)) {
        return [];
      }

      return rawGames.slice(0, 10000).map((item) => {
        const metadata = item.metadata || {};
        const keyImages = Array.isArray(metadata.keyImages)
          ? metadata.keyImages.slice(0, 20).map((img) => ({
              type: String(img.type || ""),
              url: String(img.url || ""),
              md5: img.md5 ? String(img.md5) : undefined,
              width: typeof img.width === "number" ? img.width : undefined,
              height:
                typeof img.height === "number" ? img.height : undefined,
            }))
          : [];

        return {
          appName: String(item.app_name || "").trim(),
          title: String(
            item.app_title || metadata.title || item.app_name || "",
          ).trim(),
          catalogId: String(metadata.id || item.app_name || "").trim(),
          namespace: String(metadata.namespace || "").trim(),
          description: String(metadata.description || "").trim(),
          keyImages,
        };
      });
    } catch {
      return [];
    }
  };

  const getAchievements = async (payload = {}) => {
    const validated = achievementRequestSchema.parse(payload);
    emitProgress?.({ phase: "reading-achievements" });

    if (!validated.appName) {
      return { total: 0, completed: 0, list: [] };
    }

    // Check cache first
    if (achievementsCache) {
      const cached = await achievementsCache.readCache(validated.appName);
      if (cached && cached.list && cached.list.length > 0) {
        return cached;
      }
    }

    let result = { total: 0, completed: 0, list: [] };

    // Fallback 1: Legendary CLI
    try {
      const output = await legendary.run([
        "achievements",
        validated.appName,
        "--json",
      ]);
      const data = JSON.parse(output);
      if (data) {
        const rawList = Array.isArray(data.achievements)
          ? data.achievements
          : [
              ...(data.completed || []).map((a) => ({ ...a, unlocked: true })),
              ...(data.uncompleted || []),
              ...(data.in_progress || []),
              ...(data.uninitiated || []),
              ...(data.hidden || []),
            ];

        const list = normalizeAchievementList(rawList);
        if (list.length > 0) {
          const total =
            typeof data.total_achievements === "number"
              ? data.total_achievements
              : list.length;
          const completed =
            typeof data.user_unlocked === "number"
              ? data.user_unlocked
              : list.filter((a) => a.achieved).length;
          result = { total, completed, list };
        }
      }
    } catch {}

    // Fallback 2: GraphQL Epic API
    if (result.list.length === 0) {
      const sandboxId = validated.sandboxId || validated.appName;
      const accountId = readLegendaryAccountId();
      if (sandboxId && accountId) {
        emitProgress?.({ phase: "reading-achievements-graphql" });
        const graphqlResult = await fetchGraphQLAchievements(
          sandboxId,
          accountId,
        );
        if (graphqlResult && graphqlResult.list.length > 0) {
          result = graphqlResult;
        }
      }
    }

    // Persist to cache if we got results
    if (result.list.length > 0 && achievementsCache) {
      await achievementsCache.writeCache(validated.appName, result);
    }

    return result;
  };

  const logout = async () => {
    await legendary.logout();
    return { success: true };
  };

  return {
    getStatus,
    authenticate,
    listLibrary,
    getAchievements,
    logout,
  };
};

module.exports = {
  createEpicAccount,
  findLegendaryConfigDir,
  readLegendaryToken,
  readLegendaryAccountId,
  normalizeAchievementList,
  fetchGraphQLAchievements,
  ACHIEVEMENT_DEFINITIONS_QUERY,
  PLAYER_ACHIEVEMENTS_QUERY,
  GRAPHQL_ENDPOINT,
  STORE_USER_AGENT,
};
