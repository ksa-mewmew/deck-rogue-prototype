import type { GameState } from "../types";
import { aliveEnemies, logMsg, pickOne } from "../rules";
import { runRelicHook } from "../relics";
import { buildIntentPreview } from "../intentPreview";
function shouldBlockRepeatByIndex(def: any, intentIndex: number) {
  const arr = def?.intentRules?.noRepeatIntentIndexes;
  return Array.isArray(arr) && arr.includes(intentIndex);
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

function pickNextIntentIndex(intents: any[], lastIndex: number, def: any, lastKey: string | null, streak: number) {
  const n = intents.length;
  if (n <= 1) return 0;

  const candidates = Array.from({ length: n }, (_, i) => i);

  const block2 = (ix: number) => ix === lastIndex && shouldBlockRepeatByIndex(def, ix);
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
  g.player.incomingDamageReductionThisTurn = 0;

  g.disruptIndexThisTurn = null;

  {
    const cols = Math.max(1, g.backSlots?.length ?? 3);
    g.backSlotDisabled = Array.from({ length: cols }, () => false);

    const runAny: any = g.run as any;
    const backCapRaw = Number(runAny.slotCapBack ?? 3);
    const backCap = Math.max(3, Math.min(4, Math.floor(backCapRaw)));

    const disrupt = g.player.status.disrupt ?? 0;
    if (disrupt > 0) {
      g.disruptIndexThisTurn = Math.floor(Math.random() * backCap);
      g.backSlotDisabled[g.disruptIndexThisTurn] = true;
    }
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
      def,
      e.lastIntentKey ?? null,
      e.lastIntentStreak ?? 0
    );

    e.intentIndex = nextIx;

    const picked = intents[nextIx % intents.length];
    commitIntentHistory(e, intentActionKey(picked));

    const sp = def.special;
    if (sp?.kind === "SOUL_STEALER") {
      const st = (e.special && e.special.kind === "SOUL_STEALER")
        ? e.special
        : (e.special = { kind: "SOUL_STEALER", warnCount: 0, armed: false, willNukeThisTurn: false });
      st.willNukeThisTurn = false;
      const warn = Math.max(0, Number(st.warnCount ?? 0) || 0);
      const armed = !!st.armed;
      if (armed) {
        if (Math.random() < sp.nukeChance) {
          st.willNukeThisTurn = true;
          e.intentLabelOverride = sp.nukeLabel ?? `종말: ${sp.nukeDamage} 피해`;
          logMsg(g, `적 의도: ${e.name} → ${e.intentLabelOverride}`);
          continue;
        }
        const it = intents[e.intentIndex % intents.length];
        e.intentLabelOverride = `${it.label} (폭발 가능 상태)`;
        logMsg(g, `적 의도: ${e.name} → ${e.intentLabelOverride}`);
        continue;
      }
      const it = intents[e.intentIndex % intents.length];
      e.intentLabelOverride = `${it.label} (경고 ${warn}/${sp.warnCap})`;
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