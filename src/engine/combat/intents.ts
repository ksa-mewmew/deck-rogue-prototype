import type { GameState } from "../types";
import { aliveEnemies, logMsg, pickOne } from "../rules";
import { runRelicHook } from "../relics";
import { buildIntentPreview } from "../intentPreview";

const NO_REPEAT_INTENT_INDEXES: Record<string, ReadonlySet<number>> = {
  other_adventurer: new Set([1]),
  slime: new Set([0, 1]),
  pebble_golem: new Set([1]),
  rock_golem: new Set([1]),
  poison_spider: new Set([0, 2]),
  boss_cursed_wall: new Set([0]),
  boss_giant_orc: new Set([1]),
};

function shouldBlockRepeatByIndex(enemyId: string, intentIndex: number) {
  const s = NO_REPEAT_INTENT_INDEXES[enemyId];
  return !!s && s.has(intentIndex);
}

function stableStringify(v: any): string {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "number" || t === "boolean") return String(v);
  if (t === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (t === "object") {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  }
  return JSON.stringify(String(v));
}

function intentActionKey(intent: any): string {
  if (!intent) return "NONE";
  const clone: any = {};
  for (const k of Object.keys(intent)) {
    if (k === "label" || k === "text" || k === "desc" || k === "name") continue;
    clone[k] = intent[k];
  }
  if (clone.effects && Array.isArray(clone.effects)) {
    clone.effects = clone.effects.map((e: any) => {
      const ec: any = {};
      for (const kk of Object.keys(e ?? {})) {
        if (kk === "label" || kk === "text" || kk === "desc" || kk === "name") continue;
        ec[kk] = e[kk];
      }
      return ec;
    });
  }
  return stableStringify(clone);
}

function commitIntentHistory(e: any, key: string) {
  const lastKey: string | null = e.lastIntentKey ?? null;
  const streak: number = e.lastIntentStreak ?? 0;
  if (lastKey === key) {
    e.lastIntentStreak = Math.min(3, streak + 1);
  } else {
    e.lastIntentKey = key;
    e.lastIntentStreak = 1;
  }
}

function pickNextIntentIndex(intents: any[], lastIndex: number, enemyId: string, lastKey: string | null, streak: number) {
  const n = intents.length;
  if (n <= 1) return 0;

  const candidates = Array.from({ length: n }, (_, i) => i);

  const block2 = (ix: number) => ix === lastIndex && shouldBlockRepeatByIndex(enemyId, ix);
  const block3 = (ix: number) => !!lastKey && streak >= 2 && intentActionKey(intents[ix]) === lastKey;

  const both = candidates.filter((ix) => !block2(ix) && !block3(ix));
  if (both.length > 0) return pickOne(both);

  const onlyNo3 = candidates.filter((ix) => !block3(ix));
  if (onlyNo3.length > 0) return pickOne(onlyNo3);

  const onlyNo2 = candidates.filter((ix) => !block2(ix));
  if (onlyNo2.length > 0) return pickOne(onlyNo2);

  return pickOne(candidates);
}

function getCombatDeckSize(g: GameState): number {
  return (
    g.deck.length +
    g.hand.length +
    g.discard.length +
    g.frontSlots.filter(Boolean).length +
    g.backSlots.filter(Boolean).length +
    g.exhausted.length
  );
}

function calcDeckSizeDamage(act: { base: number; per: number; div: number; cap?: number }, deckSize: number) {
  const scale = Math.ceil(deckSize / act.div);
  let dmg = act.base + act.per * scale;
  if (act.cap != null) dmg = Math.min(dmg, act.cap);
  return { dmg, scale };
}

const SOUL_WARN_INTENT_INDEX = 2;
const SOUL_NUKE_CHANCE = 0.6;

export function revealIntentsAndDisrupt(g: GameState) {
  if (g.intentsRevealedThisTurn) return;
  g.intentsRevealedThisTurn = true;

  g.attackedEnemyIndicesThisTurn = [];
  g.backUidsThisTurn = [];
  g.placedUidsThisTurn = [];
  g.drawCountThisTurn = 0;

  g.phase = "REVEAL";

  g.player.immuneToDisruptThisTurn = false;
  g.player.nullifyDamageThisTurn = false;

  g.disruptIndexThisTurn = null;
  g.backSlotDisabled = [false, false, false];

  const disrupt = g.player.status.disrupt ?? 0;
  if (disrupt > 0) {
    g.disruptIndexThisTurn = Math.floor(Math.random() * 3);
    g.backSlotDisabled[g.disruptIndexThisTurn] = true;
  }

  for (const e of g.enemies) {
    e.immuneThisTurn = e.immuneNextTurn;
    e.immuneNextTurn = false;
  }

  for (const e of aliveEnemies(g)) {
    e.intentLabelOverride = undefined;

    const def = g.content.enemiesById[e.id];
    const intents = def.intents;
    if (!intents || intents.length === 0) continue;

    const nextIx = pickNextIntentIndex(
      intents,
      e.intentIndex ?? 0,
      e.id,
      e.lastIntentKey ?? null,
      e.lastIntentStreak ?? 0
    );

    e.intentIndex = nextIx;

    const picked = intents[nextIx % intents.length];
    commitIntentHistory(e, intentActionKey(picked));

    if (e.id === "boss_soul_stealer") {
      e.soulWillNukeThisTurn = false;
      const warn = e.soulWarnCount ?? 0;
      const armed = !!e.soulArmed;

      if (armed) {
        if (Math.random() < SOUL_NUKE_CHANCE) {
          e.soulWillNukeThisTurn = true;
          e.intentLabelOverride = "종말: 50 피해";
          logMsg(g, `적 의도: ${e.name} → ${e.intentLabelOverride}`);
          continue;
        }
        const it = intents[e.intentIndex % intents.length];
        e.intentLabelOverride = `${it.label} (폭발 가능 상태)`;
        logMsg(g, `적 의도: ${e.name} → ${e.intentLabelOverride}`);
        continue;
      }

      const it = intents[e.intentIndex % intents.length];
      e.intentLabelOverride = `${it.label} (경고 ${warn}/3)`;
      logMsg(g, `적 의도: ${e.name} → ${e.intentLabelOverride}`);
      continue;
    }

    const intent = intents[e.intentIndex % intents.length];

    const p = buildIntentPreview(g, e, intent);

    let suffix = "";
    if (p.dmgTotal != null) {
      suffix = (p.hits ?? 1) > 1 ? ` (${p.dmgTotal}, ${p.hits}타)` : ` (${p.dmgTotal})`;
    } else if ((p.hits ?? 0) > 1) {
      suffix = ` (${p.hits}타)`;
    }

    const label = `${intent.label}${suffix}`;

    e.intentLabelOverride = label;
    logMsg(g, `적 의도: ${e.name} → ${label}`);
  }

  if (g.disruptIndexThisTurn !== null) {
    logMsg(g, `교란: 이번 턴 후열 ${g.disruptIndexThisTurn} 무효`);
  }

  runRelicHook(g, "onReveal");

  g.phase = "PLACE";
}

export const __SOUL_WARN_INTENT_INDEX = SOUL_WARN_INTENT_INDEX;
