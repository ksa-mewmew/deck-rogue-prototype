import type { EnemyState, GameState, DamageEnemyFormulaKind, BlockFormulaKind } from "../engine/types";

export type FormulaCtx = {
  game: GameState;
  cardUid?: string | null;
  numBonus?: number;
};

const nb = (ctx: FormulaCtx) => Math.max(0, Number(ctx.numBonus ?? 0) || 0);

function onlyThisCardUsedThisTurn(ctx: FormulaCtx): boolean {
  const g = ctx.game;
  const uid = ctx.cardUid ?? "";
  const used = Number(g.usedThisTurn ?? 0) || 0;
  if (used !== 1) return false;
  const placed = (g.placedUidsThisTurn ?? []).filter(Boolean);
  if (placed.length !== 1) return false;
  return placed[0] === uid;
}

export type DamageEnemyFormula = {
  base: (ctx: FormulaCtx) => number;
  forTarget?: (ctx: FormulaCtx, target: EnemyState, base: number, aliveCountSnapshot: number) => number;
};

export const DAMAGE_ENEMY_FORMULAS: Record<DamageEnemyFormulaKind, DamageEnemyFormula> = {
  prey_mark: {
    base: (ctx) => 10 + nb(ctx),
    forTarget: (ctx, target, base) => (target.hp > ctx.game.player.hp ? base + 5 + nb(ctx) : base),
  },
  prey_mark_u1: {
    base: (ctx) => 12 + nb(ctx),
    forTarget: (ctx, target, base) => (target.hp > ctx.game.player.hp ? base + 6 + nb(ctx) : base),
  },

  triple_bounty: {
    base: (ctx) => 10 + nb(ctx),
    forTarget: (ctx, _target, base, alive) => (alive >= 3 + nb(ctx) ? base + 6 + nb(ctx) : base),
  },
  triple_bounty_u1: {
    base: (ctx) => 10 + nb(ctx),
    forTarget: (ctx, _target, base, alive) => (alive >= 3 + nb(ctx) ? base + 10 + nb(ctx) : base),
  },

  hand_blade: {
    base: (ctx) => {
      const handOthers = ctx.game.hand.length;
      const b = nb(ctx);
      return (4 + b) + (2 + b) * Math.floor(handOthers / (1 + b));
    },
  },
  hand_blade_u1: {
    base: (ctx) => {
      const handOthers = ctx.game.hand.length;
      const b = nb(ctx);
      return (6 + b) + (2 + b) * Math.floor(handOthers / (1 + b));
    },
  },

  lone_blow_20: {
    base: (ctx) => (onlyThisCardUsedThisTurn(ctx) ? 20 + nb(ctx) : 0),
  },
  lone_blow_26: {
    base: (ctx) => (onlyThisCardUsedThisTurn(ctx) ? 26 + nb(ctx) : 0),
  },

  castle_ballista_age: {
    base: (ctx) => {
      const uid = ctx.cardUid ?? "";
      const age = (ctx.game.installAgeByUid?.[uid] ?? 0) | 0;
      return 1 + nb(ctx) + Math.max(0, age);
    },
  },
  castle_ballista_age_u1: {
    base: (ctx) => {
      const uid = ctx.cardUid ?? "";
      const age = (ctx.game.installAgeByUid?.[uid] ?? 0) | 0;
      return 2 + nb(ctx) + Math.max(0, age);
    },
  },
};

export function calcDamageEnemyFormulaBase(ctx: FormulaCtx, kind: DamageEnemyFormulaKind): number {
  return DAMAGE_ENEMY_FORMULAS[kind]?.base(ctx) ?? 0;
}

export function calcDamageEnemyFormulaForTarget(
  ctx: FormulaCtx,
  kind: DamageEnemyFormulaKind,
  target: EnemyState,
  base: number,
  aliveCountSnapshot: number,
): number {
  const f = DAMAGE_ENEMY_FORMULAS[kind];
  if (!f) return base;
  return f.forTarget ? f.forTarget(ctx, target, base, aliveCountSnapshot) : base;
}

export const BLOCK_FORMULAS: Record<BlockFormulaKind, (ctx: FormulaCtx) => number> = {
  hand_blade_back: (ctx) => {
    const g = ctx.game;
    const b = nb(ctx);
    const handCount = Object.values(g.cards).filter((c) => c.zone === "hand" && c.uid !== (ctx.cardUid ?? "")).length;
    const amount = (1 + b) * Math.floor(handCount / (1 + b));
    return Math.min(6 + b, amount);
  },
  hand_blade_back_u1: (ctx) => {
    const g = ctx.game;
    const b = nb(ctx);
    const handCount = Object.values(g.cards).filter((c) => c.zone === "hand" && c.uid !== (ctx.cardUid ?? "")).length;
    return (2 + b) * Math.floor(handCount / (1 + b));
  },
  lone_blow_block_10: (ctx) => (onlyThisCardUsedThisTurn(ctx) ? 10 + nb(ctx) : 0),
  lone_blow_block_14: (ctx) => (onlyThisCardUsedThisTurn(ctx) ? 14 + nb(ctx) : 0),
};

export function calcBlockFormula(ctx: FormulaCtx, kind: BlockFormulaKind): number {
  return BLOCK_FORMULAS[kind]?.(ctx) ?? 0;
}
