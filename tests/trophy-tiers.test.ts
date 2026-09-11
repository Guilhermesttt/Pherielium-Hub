import { describe, expect, it } from "vitest";
import {
  isPlatinaByText,
  isPlatinumSemantic,
  extractAndProcessPlatinum,
  buildGameTierMap,
  calculateGameTrophyCounts,
  aggregateTrophyCounts,
  calculatePlayerLevel,
  TROPHY_POINTS,
} from "../src/utils/trophyTiers";

describe("Sistema de Tiers de Troféus (PlayStation / Phelierium)", () => {
  describe("Extração e Processamento de Platina (extractAndProcessPlatinum)", () => {
    it("cenário 1: Platina Nativa é identificada e removida da lista base", () => {
      const raw = [
        { apiName: "ACH_1", name: "Tutorial", achieved: true },
        { apiName: "ACH_2", name: "Boss 1", achieved: true },
        { apiName: "ACH_PLAT", name: "Platinum Trophy", description: "Obtain all achievements", achieved: false },
      ];

      const result = extractAndProcessPlatinum(raw);

      expect(result.hasNativePlatinum).toBe(true);
      expect(result.platinumTrophy.key).toBe("ACH_PLAT");
      expect(result.platinumTrophy.tier).toBe("PLATINUM");
      expect(result.platinumTrophy.xp).toBe(300);
      expect(result.platinumTrophy.isVirtual).toBe(false);
      expect(result.totalBaseAchievements).toBe(2);
      expect(result.baseAchievements.map(a => a.apiName)).toEqual(["ACH_1", "ACH_2"]);
      expect(result.isUnlocked).toBe(true); // 2/2 liberadas
    });

    it("cenário 2: Platina Virtual é injetada quando não há platina nativa", () => {
      const raw = [
        { apiName: "ACH_1", name: "Tutorial", achieved: true },
        { apiName: "ACH_2", name: "Boss Final", achieved: false },
      ];

      const result = extractAndProcessPlatinum(raw);

      expect(result.hasNativePlatinum).toBe(false);
      expect(result.platinumTrophy.isVirtual).toBe(true);
      expect(result.platinumTrophy.tier).toBe("PLATINUM");
      expect(result.platinumTrophy.xp).toBe(300);
      expect(result.totalBaseAchievements).toBe(2);
      expect(result.unlockedBaseAchievements).toBe(1);
      expect(result.isUnlocked).toBe(false); // 1/2 liberada -> ainda bloqueada
    });
  });

  describe("Detecção de Platina por texto (isPlatinumSemantic)", () => {
    it("identifica termos de platina, 100% e maestria em português e inglês", () => {
      expect(isPlatinumSemantic({ name: "Troféu de Platina", description: "Obtenha todos os troféus" })).toBe(true);
      expect(isPlatinumSemantic({ name: "Platinar o Jogo" })).toBe(true);
      expect(isPlatinumSemantic({ name: "100% Concluído", description: "Complete todas as fases" })).toBe(true);
      expect(isPlatinumSemantic({ name: "Perfeccionista", description: "Pegue todas as conquistas" })).toBe(true);
      expect(isPlatinumSemantic({ name: "Master of Shadows", description: "Unlock all achievements" })).toBe(true);
      expect(isPlatinumSemantic({ name: "Completionist", description: "Collect all items in the game" })).toBe(true);
      expect(isPlatinumSemantic({ name: "Final Verdadeiro", description: "Zerar tudo e obter todos os troféus" })).toBe(true);
    });

    it("retorna false para conquistas de progressão comum", () => {
      expect(isPlatinumSemantic({ name: "Primeiro Passo", description: "Complete o tutorial" })).toBe(false);
      expect(isPlatinumSemantic({ name: "Derrote o Boss 1", description: "Vença a primeira fase" })).toBe(false);
    });
  });

  describe("Distribuição de Tiers por Raridade Global (buildGameTierMap)", () => {
    it("classifica Bronze (>10%), Prata (5-10%) e Ouro (<5%) com base na porcentagem global", () => {
      const achievements = [
        { apiName: "ACH_HARD", name: "Modo Difícil", percent: 2.1 }, // < 5% -> Ouro
        { apiName: "ACH_MID", name: "Chefão Secreto", percent: 7.5 }, // 5-10% -> Prata
        { apiName: "ACH_EASY", name: "Primeiros Passos", percent: 85.0 }, // > 10% -> Bronze
      ];
      const map = buildGameTierMap(achievements);

      expect(map.get("ACH_HARD")?.tierId).toBe("gold");
      expect(map.get("ACH_MID")?.tierId).toBe("silver");
      expect(map.get("ACH_EASY")?.tierId).toBe("bronze");
    });

    it("jogo com 1 conquista base comum atribui Ouro para a conquista de gameplay", () => {
      const map = buildGameTierMap([{ apiName: "ACH_1", name: "Única Conquista" }]);
      expect(map.get("ACH_1")?.tierIndex).toBe(1);
      expect(map.get("ACH_1")?.tierId).toBe("gold");
    });

    it("jogo com conquista que é explicitamente de Platina atribui Platina", () => {
      const map = buildGameTierMap([{ apiName: "ACH_PLAT", name: "Troféu de Platina", description: "Pegue tudo" }]);
      expect(map.get("ACH_PLAT")?.tierIndex).toBe(0);
      expect(map.get("ACH_PLAT")?.tierId).toBe("platinum");
    });
  });

  describe("Cálculo de Contadores e Pontuação (calculateGameTrophyCounts)", () => {
    it("conceder 100% de conquistas libera automaticamente o Troféu de Platina (+300 XP)", () => {
      const achievements = [
        { apiName: "ACH_1", percent: 85.0, achieved: true },
        { apiName: "ACH_2", percent: 7.0, achieved: true },
        { apiName: "ACH_3", percent: 2.0, achieved: true },
      ];

      const counts = calculateGameTrophyCounts(3, 3, achievements);

      expect(counts.platinum).toBe(1); // 100% libera Platina
      expect(counts.gold).toBe(1);
      expect(counts.silver).toBe(1);
      expect(counts.bronze).toBe(1);
      expect(counts.totalPlatinum).toBe(1);
      expect(counts.completed).toBe(4); // 3 conquistas + 1 Platina
      expect(counts.points).toBe(15 + 30 + 90 + 300); // 435 XP
    });

    it("usuário com progresso parcial não recebe a Platina até atingir 100%", () => {
      const achievements = [
        { apiName: "ACH_1", percent: 85.0, achieved: true }, // Bronze
        { apiName: "ACH_2", percent: 7.0, achieved: false }, // Prata bloqueada
        { apiName: "ACH_3", percent: 2.0, achieved: false }, // Ouro bloqueado
      ];

      const counts = calculateGameTrophyCounts(3, 1, achievements);

      expect(counts.platinum).toBe(0); // Não platinou
      expect(counts.bronze).toBe(1);
      expect(counts.silver).toBe(0);
      expect(counts.gold).toBe(0);
      expect(counts.totalPlatinum).toBe(1);
      expect(counts.points).toBe(15); // Apenas o Bronze (15 XP)
    });
  });

  describe("Agregação e Nível do Jogador (aggregateTrophyCounts & calculatePlayerLevel)", () => {
    it("agrega múltiplos jogos e calcula nível PSN fiel", () => {
      const games = [
        { totalAchievements: 10, completedAchievements: 10 }, // 100% platinado
        { totalAchievements: 5, completedAchievements: 2 },
      ];

      const agg = aggregateTrophyCounts(games);
      expect(agg.platinum).toBe(1);
      expect(agg.completed).toBeGreaterThan(10);

      const level = calculatePlayerLevel(0, 0, 0, agg);
      expect(level.level).toBeGreaterThanOrEqual(1);
      expect(level.tier).toBeDefined();
    });
  });
});
