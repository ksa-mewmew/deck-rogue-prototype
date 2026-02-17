import type { GameState } from "./types";
import type { EnemyState } from "./types";
import type { EnemyIntentData, IntentPreview, IntentApply, IntentCategory } from "./types";

type PreviewOptions = {
  includeBlock?: boolean;
};

function clamp0(n: number) { return n < 0 ? 0 : n; }

function applyDamageMods(raw: number, g: GameState, e: any) {
  const playerV = g.player.status?.vuln ?? 0;
  const enemyW  = e.status?.weak ?? 0;
  return clamp0(raw + playerV - enemyW);
}

function pushApply(applies: IntentApply[], a: IntentApply) {
  applies.push(a);
}

function catFromPreview(p: IntentPreview): IntentCategory {
  const hasAtk = (p.dmgTotal ?? 0) > 0 || (p.hits ?? 0) > 0 || (p.perHit ?? 0) > 0;
  const hasDebuff = (p.applies ?? []).some(x =>
    x.target === "player" && ["vuln","weak","bleed","disrupt","supplies","fatigue"].includes(String(x.kind))
  );
  const hasBuff = (p.applies ?? []).some(x =>
    x.target === "enemy" && ["vuln","weak","bleed","disrupt","immune"].includes(String(x.kind))
  );

  if (hasAtk && hasDebuff) return "ATTACK_DEBUFF";
  if (hasAtk && hasBuff)   return "ATTACK_BUFF";
  if (hasAtk) return "ATTACK";
  if (hasDebuff) return "DEBUFF";
  if (hasBuff) return "BUFF";
  return "OTHER";
}

type FormulaKind = "goblin_raider" | "watching_statue";

function previewFormula(kind: FormulaKind, g: GameState, e: any): { raw: number; hits?: number } {

  const used = g.usedThisTurn ?? 0;

  if (kind === "goblin_raider") {

    const raw = Math.max(0, 12 - used);
    return { raw, hits: 1 };
  }
  if (kind === "watching_statue") {

    const raw = 4 + used;
    return { raw, hits: 1 };
  }
  return { raw: 0, hits: 1 };
}

export function buildIntentPreview(
  g: GameState,
  e: any,
  intent: EnemyIntentData,
  opt: PreviewOptions = {}
): IntentPreview {

  if (intent.meta?.preview) {
    const out = intent.meta.preview(g, e);
    if (out) return out;
  }

  const applies: IntentApply[] = [];
  let dmgTotalRaw = 0;
  let hits = 0;
  let perHitRaw: number | null = null;
  const notes: string[] = [];

  if (intent.meta?.applies) {
    for (const a of intent.meta.applies) pushApply(applies, a);
  }

  for (const act of intent.acts) {
    switch (act.op) {
      case "damagePlayer": {
        const raw = act.n;
        dmgTotalRaw += raw;
        hits += 1;
        perHitRaw = perHitRaw == null ? raw : perHitRaw;
        break;
      }

      case "damagePlayerFormula": {
        const { raw, hits: hh } = previewFormula(act.kind, g, e);
        dmgTotalRaw += raw;
        hits += (hh ?? 1);

        break;
      }

      case "statusPlayer": {
        pushApply(applies, { target: "player", kind: act.key, amount: act.n });
        break;
      }

      case "supplies": {
        pushApply(applies, { target: "player", kind: "supplies", amount: act.n });
        break;
      }

      case "fatiguePlayer": {
        pushApply(applies, { target: "player", kind: "fatigue", amount: act.n });
        break;
      }

      case "enemyHealSelf": {
        pushApply(applies, { target: "enemy", kind: "heal", amount: act.n });
        break;
      }

      case "enemyImmuneNextTurn": {
        pushApply(applies, { target: "enemy", kind: "immune", amount: 1 });
        break;
      }


      default: {

        break;
      }
    }
  }

  if (e.immuneThisTurn) {

  }

  let dmgTotal = dmgTotalRaw > 0 ? applyDamageMods(dmgTotalRaw, g, e) : undefined;

  if (opt.includeBlock && dmgTotal != null) {
    const blk = g.player.block ?? 0;
    dmgTotal = Math.max(0, dmgTotal - blk);
  }

  const out: IntentPreview = {
    cat: intent.meta?.cat ?? "OTHER",
    dmgTotal,
    hits: hits > 0 ? hits : intent.meta?.hits,
    perHit: perHitRaw != null ? applyDamageMods(perHitRaw, g, e) : intent.meta?.baseDmg,
    applies: applies.length ? applies : undefined,
    notes: notes.length ? notes : undefined,
  };

  out.cat = intent.meta?.cat ?? catFromPreview(out);

  if (!out.shortText) {
    if (out.dmgTotal != null && (out.hits ?? 0) > 1) out.shortText = `${out.dmgTotal} (${out.hits}타)`;
    else if (out.dmgTotal != null) out.shortText = `${out.dmgTotal}`;
  }

  return out;
}