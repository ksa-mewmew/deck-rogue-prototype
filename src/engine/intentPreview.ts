import type { GameState } from "./types";
import type { EnemyIntentData, IntentPreview, IntentApply, IntentCategory } from "./types";

type PreviewOptions = { includeBlock?: boolean };

function clamp0(n: number) { return n < 0 ? 0 : n; }

function applyDamageMods(raw: number, g: GameState, e: any) {
  const playerV = g.player.status?.vuln ?? 0;
  const enemyW  = e.status?.weak ?? 0;
  return clamp0(raw + playerV - enemyW);
}

function applyBlockSequential(hits: number[], block: number) {
  let b = Math.max(0, Number(block) || 0);
  const out: number[] = [];
  for (const h of hits) {
    const used = Math.min(b, h);
    b -= used;
    out.push(h - used);
  }
  return out;
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

type FormulaKind = "goblin_raider" | "watching_statue" | "gloved_hunter";

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
  if (kind === "gloved_hunter") {
    const blk = Number(g.player.block ?? 0);
    const raw = blk >= 4 ? 12 : 6;
    return { raw, hits: 1 };
  }
  return { raw: 0, hits: 1 };
}

function previewDeckSizeDamage(g: GameState, act: any): number {
  const base = Number(act.base ?? 0);
  const per = Number(act.per ?? 0);
  const div = Math.max(1, Number(act.div ?? 1));
  const cap = act.cap == null ? Infinity : Number(act.cap);

  // phases.ts(getCombatDeckSize)와 동일한 정의로 통일
  const deckSize =
    (g.deck?.length ?? 0) +
    (g.hand?.length ?? 0) +
    (g.discard?.length ?? 0) +
    (g.frontSlots?.filter(Boolean).length ?? 0) +
    (g.backSlots?.filter(Boolean).length ?? 0) +
    (g.exhausted?.length ?? 0);

  const scale = Math.ceil(deckSize / div);
  const raw = base + per * scale;
  return Math.min(cap, Math.max(0, raw));
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
  const notes: string[] = [];
  const hitRaws: number[] = [];

  if (intent.meta?.applies) {
    for (const a of intent.meta.applies) pushApply(applies, a);
  }

  for (const act of intent.acts) {
    switch (act.op) {
      case "damagePlayer": {
        hitRaws.push(Math.max(0, Number(act.n) || 0));
        break;
      }

      case "damagePlayerFormula": {
        const { raw, hits } = previewFormula(act.kind as any, g, e);
        const hh = Math.max(1, Number(hits ?? 1) || 1);
        const r = Math.max(0, Number(raw) || 0);
        for (let i = 0; i < hh; i++) hitRaws.push(r);
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

      case "damagePlayerRampHits": {
        const turn = Math.max(1, Number((g as any).combatTurn ?? 1));
        const baseHits = Math.max(1, Number(act.baseHits ?? 1));
        const every = Math.max(1, Number(act.everyTurns ?? 1));

        let hits = baseHits + Math.floor((turn - 1) / every);
        if (act.capHits != null) hits = Math.min(hits, Math.max(1, Number(act.capHits)));

        const per = Math.max(0, Number(act.n) || 0);
        for (let i = 0; i < hits; i++) hitRaws.push(per);
        break;
      }

      case "damagePlayerIfSuppliesPositive": {
        if (g.player.supplies > 0) {
          hitRaws.push(Math.max(0, Number(act.n) || 0));
        } else {
        }
        break;
      }

      case "damagePlayerIfSuppliesZero": {
        if (g.player.supplies == 0) {
          hitRaws.push(Math.max(0, Number(act.n) || 0));
        } else {
        }
        break;
      }

      case "damagePlayerByDeckSize": {
        hitRaws.push(previewDeckSizeDamage(g, act));
        break;
      }
      
      default:
        break;
    }
  }

  if (!hitRaws.length) {
    const hh = Math.max(0, Number(intent.meta?.hits ?? 0) || 0);
    const base = Math.max(0, Number(intent.meta?.baseDmg ?? 0) || 0);
    if (hh > 0 && base > 0) {
      for (let i = 0; i < hh; i++) hitRaws.push(base);
    }
  }

  let hitDamages = hitRaws.map((r) => applyDamageMods(r, g, e));

  if (opt.includeBlock && hitDamages.length) {
    hitDamages = applyBlockSequential(hitDamages, g.player.block ?? 0);
  }

  const hits = hitDamages.length;
  const dmgTotal = hits ? hitDamages.reduce((s, x) => s + x, 0) : undefined;

  const perHit =
    hits && hitDamages.every((x) => x === hitDamages[0])
      ? hitDamages[0]
      : undefined;

  const out: IntentPreview = {
    cat: intent.meta?.cat ?? "OTHER",
    dmgTotal,
    hits: hits > 0 ? hits : intent.meta?.hits,
    perHit: perHit ?? intent.meta?.baseDmg,
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