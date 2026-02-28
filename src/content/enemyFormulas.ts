import type { DamagePlayerFormulaKind, GameState, EnemyState } from "../engine/types";

export type DamagePlayerFormulaResult = {
  raw: number;
  hits: number;
  consumeEnemyKey?: "assassinAim";
};

export function calcDamagePlayerFormula(g: GameState, e: EnemyState, kind: DamagePlayerFormulaKind): DamagePlayerFormulaResult {
  const used = Math.max(0, Number(g.usedThisTurn ?? 0) || 0);

  switch (kind) {
    case "goblin_raider": {
      // 12 - 이번 턴 사용한 카드 수 (최소 0)
      return { raw: Math.max(0, 12 - used), hits: 1 };
    }

    case "watching_statue": {
      // 4 + 이번 턴 사용한 카드 수
      return { raw: Math.max(0, 4 + used), hits: 1 };
    }

    case "gloved_hunter": {
      const blk = Math.max(0, Number(g.player.block ?? 0) || 0);
      return { raw: blk >= 4 ? 12 : 6, hits: 1 };
    }

    case "goblin_assassin": {
      const aimed = Math.max(0, Number((e as any).assassinAim ?? 0) || 0);
      return { raw: Math.max(0, 8 + 4 * aimed), hits: 1, consumeEnemyKey: "assassinAim" };
    }

    case "old_monster_corpse": {
      const rage = Math.max(0, Number((e as any).corpseRage ?? 0) || 0);
      return { raw: Math.max(0, 9 + 4 * rage), hits: 1 };
    }

    case "punishing_one": {
      const hand = Math.max(0, Number(g.hand?.length ?? 0) || 0);
      return { raw: Math.max(0, Math.min(30, 6 + 2 * hand)), hits: 1 };
    }
  }
}

export function previewDamagePlayerFormula(g: GameState, e: EnemyState, kind: DamagePlayerFormulaKind): { raw: number; hits: number } {
  const r = calcDamagePlayerFormula(g, e, kind);
  return { raw: r.raw, hits: r.hits };
}
