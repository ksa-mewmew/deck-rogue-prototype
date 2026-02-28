import type { GameState, Side, PlayerEffect, EnemyState, DamageEnemyFormulaKind } from "./types";
import { aliveEnemies, logMsg, applyStatusTo, pickOne } from "./rules";
import { addBlock, addFatigue, addSupplies, applyDamageToEnemy, healPlayer, applyDamageToPlayer } from "./effects";
import { drawCards } from "./combat";
import { enqueueChoice } from "./choice";
import { cardNameWithUpgrade, getCardDefFor } from "../content/cards";
import { calcBlockFormula, calcDamageEnemyFormulaBase, calcDamageEnemyFormulaForTarget } from "../content/formulas";
import { displayCardTextPair } from "./cardText";
import { checkRelicUnlocks, getUnlockProgress, isRelicActive } from "./relics";

export type ResolveCtx = {
  game: GameState;
  side: Side;
  cardUid: string;
  sourceLabel?: string;
  reason?: "FRONT" | "BACK" | "ENEMY" | "EVENT" | "RELIC" | "OTHER";
};

function isCardPlacedOnSide(g: GameState, cardUid: string, side: Side): boolean {
  const inst = g.cards[cardUid];
  if (!inst) return false;
  return inst.zone === side;
}

function flipAllPlayerCardsUntilCombatEnd(g: GameState) {
  const key = "_flipAllCombatOriginal";
  if (!(g as any)[key]) (g as any)[key] = {};
  const snap = (g as any)[key] as Record<string, boolean | undefined>;

  for (const [uid, inst] of Object.entries(g.cards)) {
    if (!inst) continue;
    if (inst.zone === "vanished") continue;
    if (snap[uid] === undefined) snap[uid] = !!(inst as any).flipped;
    (inst as any).flipped = !snap[uid];
  }
}

function rewriteWaveBreathSelectTarget(g: GameState, target: "select" | "random" | "all"): "select" | "random" | "all" {
  if (target !== "select") return target;

  const noAll = !!(g as any)._waveBreathNoAllThisCombat;
  const forceRandom = !!(g as any)._waveBreathForceRandomThisCombat;
  const allRemain = Math.max(0, Number((g as any)._waveBreathAllRemainingThisCombat ?? 0) || 0);

  if (!noAll && allRemain > 0) {
    (g as any)._waveBreathAllRemainingThisCombat = allRemain - 1;
    return "all";
  }

  if (forceRandom) return "random";
  return "select";
}

function enqueueTargetSelectDamage(ctx: ResolveCtx, amount: number, formulaKind?: DamageEnemyFormulaKind) {
  const g = ctx.game;
  const req = {
    kind: "damageSelect" as const,
    amount,
    formulaKind,
    aliveCountSnap: aliveEnemies(g).length,
    sourceCardUid: ctx.cardUid || undefined,
    sourceLabel: ctx.sourceLabel,
    reason: ctx.reason ?? (ctx.side === "front" ? "FRONT" : "BACK"),
  } as const;

  g.pendingTargetQueue ??= [];
  if (g.pendingTarget == null) g.pendingTarget = req as any;
  else g.pendingTargetQueue.push(req as any);

  logMsg(g, `대상 선택 필요: 적을 클릭하세요. (${1 + g.pendingTargetQueue.length}개 남음)`);
}

function enqueueTargetSelectStatus(ctx: ResolveCtx, key: "vuln" | "weak" | "bleed" | "disrupt" | "slash", n: number) {
  const g = ctx.game;
  const req = {
    kind: "statusSelect" as const,
    key,
    n,
    sourceCardUid: ctx.cardUid || undefined,
    sourceLabel: ctx.sourceLabel,
    reason: ctx.reason ?? (ctx.side === "front" ? "FRONT" : "BACK"),
  } as const;

  g.pendingTargetQueue ??= [];
  if (g.pendingTarget == null) g.pendingTarget = req;
  else g.pendingTargetQueue.push(req);

  logMsg(g, `대상 선택 필요: 적을 클릭하세요.`);
}

function enemyWillAttackThisTurn(g: GameState, en: EnemyState): boolean {
  if (en.special?.kind === "SOUL_STEALER" && en.special.willNukeThisTurn) return true;

  const def = g.content.enemiesById[en.id];
  const intent = def.intents[en.intentIndex % def.intents.length];
  return intent.acts.some(
    (a) => a.op === "damagePlayer" || a.op === "damagePlayerFormula" || a.op === "damagePlayerByDeckSize"
  );
}

function findCardSlot(g: GameState, uid: string): { side: Side; index: number } | null {
  const fi = g.frontSlots.indexOf(uid);
  if (fi >= 0) return { side: "front", index: fi };
  const bi = g.backSlots.indexOf(uid);
  if (bi >= 0) return { side: "back", index: bi };
  return null;
}

function exhaustCardNow(g: GameState, uid: string, note = "") {
  for (let i = 0; i < g.frontSlots.length; i++) if (g.frontSlots[i] === uid) g.frontSlots[i] = null;
  for (let i = 0; i < g.backSlots.length; i++) if (g.backSlots[i] === uid) g.backSlots[i] = null;

  g.hand = g.hand.filter((x) => x !== uid);
  g.deck = g.deck.filter((x) => x !== uid);
  g.discard = g.discard.filter((x) => x !== uid);
  g.exhausted = g.exhausted.filter((x) => x !== uid);
  g.vanished = g.vanished.filter((x) => x !== uid);

  g.exhausted.push(uid);
  g.cards[uid].zone = "exhausted";
  logMsg(g, `[${cardNameWithUpgrade(g, uid)}] 소모(강제)${note ? " — " + note : ""}`);
  if ((g.run as any)?.faith?.hostile?.retort_fusion) {
    applyDamageToPlayer(g, 1, "OTHER", "레토르트 퓨전");
  }
}

function flipCardBetweenRows(g: GameState, uid: string) {
  const pos = findCardSlot(g, uid);
  if (!pos) {
    logMsg(g, `뒤집기 실패: 슬롯에서 카드를 찾지 못함 (${uid})`);
    return;
  }

  const idx = pos.index;
  const fromSlots = pos.side === "front" ? g.frontSlots : g.backSlots;
  const toSlots = pos.side === "front" ? g.backSlots : g.frontSlots;

  const other = toSlots[idx];

  fromSlots[idx] = other ?? null;
  toSlots[idx] = uid;

  g.cards[uid].zone = pos.side === "front" ? "back" : "front";
  if (other) g.cards[other].zone = pos.side;

  logMsg(g, other
    ? `[${cardNameWithUpgrade(g, uid)}] 뒤집음: ${pos.side}${idx + 1} ↔ ${pos.side === "front" ? "back" : "front"}${idx + 1}`
    : `[${cardNameWithUpgrade(g, uid)}] 뒤집음: ${pos.side}${idx + 1} → ${pos.side === "front" ? "back" : "front"}${idx + 1}`
  );
}

function countInstalledCardsOnBoard(g: GameState, opt?: { excludeUid?: string; includeSelf?: boolean }) {
  const excludeUid = opt?.excludeUid;
  const includeSelf = !!opt?.includeSelf;
  let count = 0;

  const slots = [...g.frontSlots, ...g.backSlots];
  for (const uid of slots) {
    if (!uid) continue;
    if (!includeSelf && excludeUid && uid === excludeUid) continue;
    const def = getCardDefFor(g, uid);
    if (def?.tags?.includes("INSTALL")) count += 1;
  }
  return count;
}

function getBackInstalledImprovArrowBonus(g: GameState): number {
  const relicNumBonus = isRelicActive(g, "relic_wrong_dice") ? 1 : 0;
  let total = 0;

  for (const uid of g.backSlots) {
    if (!uid) continue;
    const inst = g.cards[uid];
    if (!inst || inst.defId !== "improv_arrow") continue;

    const def: any = getCardDefFor(g, uid) as any;
    const effects = Array.isArray(def?.back) ? def.back : [];
    for (const eff of effects) {
      if (!eff || eff.op !== "increaseCardDamageByTag" || eff.tag !== "ARROW") continue;
      const base = Number(eff.n ?? 0) || 0;
      if (base === 0) continue;
      const overrunNumBonus = (inst as any)?.synth?.overrun ? 1 : 0;
      const numBonus = relicNumBonus + overrunNumBonus;
      total += base + Math.sign(base) * numBonus;
    }
  }

  return Math.max(0, total);
}

export function resolvePlayerEffects(ctx: ResolveCtx, effects: PlayerEffect[]) {
  const g = ctx.game;

  const fromInstall = (() => {
    try {
      const def: any = getCardDefFor(g, ctx.cardUid);
      if (!(def?.tags?.includes("INSTALL"))) return false;
      const w = def.installWhen as ("FRONT" | "BACK" | "BOTH" | "NONE" | undefined);
      if (!w || w === "BOTH") return true;
      if (w === "FRONT") return ctx.side === "front";
      if (w === "BACK") return ctx.side === "back";
      return false;
    } catch {
      return false;
    }
  })();

  const damageEnemyWithMeta = (en: EnemyState, amount: number) => {
    const key = "_playerDamageFromInstall";
    const prev = (g as any)[key];
    (g as any)[key] = fromInstall;
    try {
      applyDamageToEnemy(g, en, amount);
    } finally {
      (g as any)[key] = prev;
    }
  };

  const relicNumBonus = isRelicActive(g, "relic_wrong_dice") ? 1 : 0;
  const overrunNumBonus = (g.cards[ctx.cardUid] as any)?.synth?.overrun ? 1 : 0;
  const numBonus = relicNumBonus + overrunNumBonus;
  const withNumBonus = (n: number) => {
    if (numBonus <= 0 || n === 0) return n;
    return n + Math.sign(n) * numBonus;
  };
  const cardDamageBonus = (() => {
    const inst = g.cards[ctx.cardUid];
    const defId = inst?.defId;
    if (!defId) return 0;

    const runAny = g.run as any;
    const byDef = Math.max(0, Number(runAny?.cardDamageBonusByDefId?.[defId] ?? 0) || 0);

    const def = getCardDefFor(g, ctx.cardUid) as any;
    const tags = Array.isArray(def?.tags) ? def.tags : [];
    let byTag = 0;
    for (const t of tags) {
      const stored = Math.max(0, Number(runAny?.cardDamageBonusByTag?.[t] ?? 0) || 0);
      byTag += t === "ARROW" ? 0 : stored;
      if (t === "ARROW") byTag += getBackInstalledImprovArrowBonus(g);
    }

    return byDef + byTag;
  })();
  const withCardDamageBonus = (n: number) => {
    if (n <= 0 || cardDamageBonus <= 0) return n;
    return n + cardDamageBonus;
  };

  for (const e of effects) {
    switch (e.op) {
      case "block":
        addBlock(g, withNumBonus(e.n));
        break;

      case "blockFormula": {
        const amount = calcBlockFormula({ game: g, cardUid: ctx.cardUid, numBonus }, e.kind);
        if (amount > 0) addBlock(g, amount);
        break;
      }

      case "supplies":
        addSupplies(g, withNumBonus(e.n));
        break;

      case "fatigue":
        addFatigue(g, withNumBonus(e.n));
        break;

      case "heal":
        healPlayer(g, withNumBonus(e.n));
        break;

      case "hp":
        g.player.hp = Math.max(0, Math.min(g.player.maxHp, g.player.hp + withNumBonus(e.n)));
        logMsg(g, `HP ${withNumBonus(e.n) >= 0 ? "+" : ""}${withNumBonus(e.n)} (현재 ${g.player.hp}/${g.player.maxHp})`);
        break;

      case "maxHp":
        g.player.maxHp += withNumBonus(e.n);
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + withNumBonus(e.n));
        logMsg(g, `최대 HP +${withNumBonus(e.n)} (현재 ${g.player.hp}/${g.player.maxHp})`);
        break;

      case "setSupplies":
        g.player.supplies = Math.max(0, withNumBonus(e.n));
        logMsg(g, `보급 S를 ${g.player.supplies}으로 설정`);
        break;

      case "setFatigue":
        g.player.fatigue = Math.max(0, withNumBonus(e.n));
        logMsg(g, `피로 F를 ${g.player.fatigue}으로 설정`);
        break;

      case "draw": {
        const drawn = drawCards(g, withNumBonus(e.n));
        g.drawCountThisTurn += drawn;
        break;
      }

      case "discardHandAllDraw": {
        const extra = Number(e.extraDraw ?? 0) || 0;
        const toDiscard = g.hand.slice();
        if (toDiscard.length > 0) {
          g.hand = [];
          for (const uid of toDiscard) {
            g.discard.push(uid);
            g.cards[uid].zone = "discard";
          }
          logMsg(g, `손패 ${toDiscard.length}장 버림`);
        } else {
          logMsg(g, `손패 버림: 0장`);
        }

        const want = toDiscard.length + extra;
        if (want > 0) {
          const drawn = drawCards(g, want);
          g.drawCountThisTurn += drawn;
        }
        break;
      }

      case "discardHandRandom": {
        let n = withNumBonus(e.n);
        n = Math.max(0, Math.min(n, g.hand.length));
        if (n <= 0) {
          logMsg(g, `손패 무작위 버림: 0장`);
          break;
        }

        const pool = g.hand.slice();
        const picked: string[] = [];
        for (let i = 0; i < n; i++) {
          const uid = pickOne(pool);
          const ix = pool.indexOf(uid);
          if (ix >= 0) pool.splice(ix, 1);
          picked.push(uid);
        }

        g.hand = g.hand.filter((u) => !picked.includes(u));
        for (const uid of picked) {
          g.discard.push(uid);
          g.cards[uid].zone = "discard";
        }

        logMsg(g, `손패 무작위 버림: ${picked.length}장`);
        break;
      }

      case "ifPlaced": {
        if (isCardPlacedOnSide(g, ctx.cardUid, e.side)) {
        resolvePlayerEffects(ctx, e.then);
        }
        break;
      }

      case "flipAllPlayerCardsUntilCombatEnd": {
        flipAllPlayerCardsUntilCombatEnd(g);
        break;
      }

      case "pickVanishedToHand": {
        const options = g.vanished.map((uid) => {
          const def = getCardDefFor(g, uid);
          const t = displayCardTextPair(g, def.frontText, def.backText, uid);
          return {
            key: `pickVanished:${uid}`,
            label: cardNameWithUpgrade(g, uid),
            detail: `전열: ${t.frontText} / 후열: ${t.backText}`,
            cardUid: uid,
          };
        });
        enqueueChoice(
          g,
          {
            kind: "PICK_CARD",
            title: e.title ?? "소실 카드 회수",
            prompt: e.prompt ?? "가져올 소실 카드 1장을 선택하세요.",
            options: [...options, { key: "cancel", label: "취소" }],
          },
          { kind: "PICK_VANISHED_TO_HAND", sourceCardUid: ctx.cardUid }
        );
        break;
      }
      
      case "ifDrewThisTurn": {
        if (g.drawCountThisTurn > 0) {
          resolvePlayerEffects(ctx, e.then);
        }
        break;
      }

      case "ifPlayerBlockAtLeast": {
        const need = Math.max(0, withNumBonus(e.n));
        if (g.player.block >= need) resolvePlayerEffects(ctx, e.then ?? []);
        break;
      }

      case "damageEnemy": {
        const t = rewriteWaveBreathSelectTarget(g, e.target);
        const amount = withCardDamageBonus(withNumBonus(e.n));
        if (t === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          damageEnemyWithMeta(pickOne(alive), amount);
        } else if (t === "all") {
          for (const en of aliveEnemies(g)) damageEnemyWithMeta(en, amount);
        } else {
          enqueueTargetSelectDamage(ctx, amount);
        }
        break;
      }

      case "damageEnemyByPlayerBlock": {
        const t = rewriteWaveBreathSelectTarget(g, e.target as any);
        const mult = Number.isFinite(Number(e.mult)) ? Number(e.mult) : 1;
        const base = Math.max(0, Math.floor(g.player.block * mult));
        const amount = withCardDamageBonus(withNumBonus(base));
        if (amount <= 0) break;

        if (t === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          damageEnemyWithMeta(pickOne(alive), amount);
          break;
        }
        if (t === "all") {
          for (const en of aliveEnemies(g)) damageEnemyWithMeta(en, amount);
          break;
        }
        enqueueTargetSelectDamage(ctx, amount);
        break;
      }

      case "halveEnemyHpAtIndex": {
        const idx = withNumBonus((e.index ?? -1) | 0);
        const en = g.enemies[idx];
        if (!en || en.hp <= 0) break;

        const before = en.hp;
        const after = Math.max(1, Math.floor(before / (2 + numBonus)));
        if (after >= before) break;
        en.hp = after;
        logMsg(g, `적(${en.name})의 HP를 절반으로: ${before} → ${after}`);
        break;
      }

      case "clearStatusSelf": {
        const k = e.key;
        g.player.status[k] = 0;
        logMsg(g, `상태 해제: ${k} = 0`);
        break;
      }

      case "damageEnemyBy": {
        if (e.target !== "random") break;
        const alive = aliveEnemies(g);
        if (alive.length === 0) break;

        let amount = 0;
        if (e.by === "frontCount") {
          const frontCount = g.frontSlots.filter(Boolean).length;
          amount = frontCount * withNumBonus(e.nPer);
        }
        damageEnemyWithMeta(pickOne(alive), amount);
        break;
      }

      case "damageEnemyByPlayerFatigue": {
        const t = rewriteWaveBreathSelectTarget(g, e.target as any);
        const amount = Math.max(0, Math.floor(g.player.fatigue * withNumBonus(e.mult)));

        if (t === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          damageEnemyWithMeta(pickOne(alive), amount);
          break;
        }

        if (t === "all") {
          if (amount <= 0) break;
          for (const en of aliveEnemies(g)) damageEnemyWithMeta(en, amount);
          break;
        }

        if (t === "select") {
          if (amount <= 0) break;
          enqueueTargetSelectDamage(ctx, amount);
          break;
        }

        break;
      }

      case "damageEnemyFormula": {
        const t = rewriteWaveBreathSelectTarget(g, e.target);
        const fctx = { game: g, cardUid: ctx.cardUid, numBonus };
        const base = calcDamageEnemyFormulaBase(fctx, e.kind);
        if (base <= 0) break;

        if (t === "select") {
          enqueueTargetSelectDamage(ctx, base, e.kind);
          break;
        }

        if (t === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          const en = pickOne(alive);
          const amount = calcDamageEnemyFormulaForTarget(fctx, e.kind, en, base, alive.length);
          damageEnemyWithMeta(en, amount);
          break;
        }

        if (t === "all") {
          const targets = aliveEnemies(g);
          const aliveCountSnap = targets.length;
          for (const en of targets) {
            const amount = calcDamageEnemyFormulaForTarget(fctx, e.kind, en, base, aliveCountSnap);
            damageEnemyWithMeta(en, amount);
          }
          break;
        }

        break;
      }

      case "statusPlayer":
        g.player.status[e.key] = Math.max(0, (g.player.status[e.key] ?? 0) + withNumBonus(e.n));
        logMsg(g, `플레이어 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
        break;

      case "statusEnemy": {
        const t = rewriteWaveBreathSelectTarget(g, e.target);
        if (t === "random") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          const en = pickOne(alive);
          applyStatusTo(en, e.key, withNumBonus(e.n), g, "PLAYER");
          logMsg(g, `적(${en.name}) 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
          if (e.key === "bleed" && e.n > 0) {
            const up = getUnlockProgress(g);
            up.bleedApplied += 1;
            checkRelicUnlocks(g);
          }
        } else if (t === "all") {
          const alive = aliveEnemies(g);
          if (alive.length === 0) break;
          for (const en of alive) applyStatusTo(en, e.key, withNumBonus(e.n), g, "PLAYER");
          logMsg(g, `모든 적 상태: ${e.key} ${e.n >= 0 ? "+" : ""}${e.n}`);
          if (e.key === "bleed" && e.n > 0) {
            const up = getUnlockProgress(g);
            up.bleedApplied += alive.length;
            checkRelicUnlocks(g);
          }
        } else {
          enqueueTargetSelectStatus(ctx, e.key, withNumBonus(e.n));
        }
        break;
      }

      case "statusEnemiesAttackingThisTurn": {
        const targets = aliveEnemies(g).filter((en) => enemyWillAttackThisTurn(g, en));
        if (targets.length === 0) {
          logMsg(g, `이번 턴 공격 의도 적 없음 → ${e.key} 적용 없음`);
          break;
        }
        for (const en of targets) {
          en.status[e.key] = Math.max(0, (en.status[e.key] ?? 0) + withNumBonus(e.n));
        }
        logMsg(g, `공격 의도 적에게 ${e.key} ${withNumBonus(e.n) >= 0 ? "+" : ""}${withNumBonus(e.n)} (대상 ${targets.length})`);
        break;
      }

      case "immuneDisruptThisTurn":
        g.player.immuneToDisruptThisTurn = true;
        logMsg(g, "이번 턴 교란 무시");
        break;

      case "nullifyDamageThisTurn":
        g.player.nullifyDamageThisTurn = true;
        logMsg(g, "이번 턴 적 공격 피해 무효");
        break;

      case "triggerFrontOfBackSlot": {
        const idx = withNumBonus((e.index ?? 0) | 0);
        const uid0 = g.backSlots[idx];
        if (!uid0) {
          logMsg(g, `재배치: 후열 ${idx + 1}번 슬롯이 비어 있음`);
          break;
        }

        const def = getCardDefFor(g, uid0);
        const inst0 = g.cards[uid0];
        const flipped0 = Boolean((inst0 as any)?.flipped);
        const eff = !flipped0 ? def.front : def.back;
        logMsg(g, `재배치: [[${cardNameWithUpgrade(g, uid0)}]]의 전열 효과를 추가 발동${flipped0 ? "(뒤집힘)" : ""}`);

        resolvePlayerEffects({ game: g, side: "front", cardUid: uid0 }, eff);
        break;
      }
      case "addCardToHand": {
        const defId = e.defId;
        const base = g.content.cardsById[defId];
        if (!base) {
          logMsg(g, `WARN: addCardToHand unknown defId: ${defId}`);
          break;
        }

        const count = Math.max(1, withNumBonus((Number(e.n ?? 1) | 0)));
        const up = Math.max(0, (Number(e.upgrade ?? 0) | 0));

        for (let i = 0; i < count; i++) {
          g.uidSeq += 1;
          const uid = String(g.uidSeq);
          g.cards[uid] = { uid, defId, zone: "hand", upgrade: up } as any;
          g.hand.push(uid);
        }

        logMsg(g, `손패에 [${base.name}${up > 0 ? " +" + up : ""}] ${count}장 추가`);
        break;
      }



      case "repeat": {
        const t = Math.max(0, withNumBonus((e.times ?? 0) | 0));
        for (let i = 0; i < t; i++) resolvePlayerEffects(ctx, e.effects ?? []);
        break;
      }

      case "repeatByOtherInstall": {
        const times = countInstalledCardsOnBoard(g, { excludeUid: ctx.cardUid, includeSelf: !!e.includeSelf });
        for (let i = 0; i < times; i++) resolvePlayerEffects(ctx, e.effects ?? []);
        break;
      }

      case "ifPlacedThisTurn": {
        const placed = (g.placedUidsThisTurn ?? []).includes(ctx.cardUid);
        if (placed) resolvePlayerEffects(ctx, e.then ?? []);
        break;
      }

      case "ifOtherRowHasDefId": {
        const want = String(e.defId ?? "");
        const otherSlots = ctx.side === "front" ? g.backSlots : g.frontSlots;
        const ok = otherSlots.some((u) => {
          if (!u) return false;
          const inst = g.cards[u];
          return inst?.defId === want;
        });
        if (ok) resolvePlayerEffects(ctx, e.then ?? []);
        break;
      }

      case "triggerRandomVanished": {
        const times = Math.max(0, withNumBonus((e.times ?? 0) | 0));
        const pool = (g.vanished ?? []).filter((u) => u && u !== ctx.cardUid);
        if (pool.length === 0) {
          logMsg(g, `소실된 카드가 없어 발동 없음`);
          break;
        }
        for (let i = 0; i < times; i++) {
          const uid0 = pickOne(pool, "triggerRandomVanished");
          const def0 = getCardDefFor(g, uid0);
          logMsg(g, `소실된 카드 발동: [[${cardNameWithUpgrade(g, uid0)}]] (${e.side === "front" ? "전열" : "후열"})`);
          resolvePlayerEffects({ game: g, side: e.side, cardUid: uid0 }, e.side === "front" ? def0.front : def0.back);
        }
        break;
      }

      case "exhaustSlot": {
        const side = e.side;
        const idx = withNumBonus((e.index ?? -1) | 0);
        const slots = side === "front" ? g.frontSlots : g.backSlots;
        const uid0 = slots[idx];
        if (!uid0) {
          logMsg(g, `소모 실패: ${side}${idx + 1}번 슬롯이 비어 있음`);
          break;
        }
        exhaustCardNow(g, uid0, `${side}${idx + 1} 슬롯`);
        slots[idx] = null;
        if (e.then) resolvePlayerEffects(ctx, e.then);
        break;
      }

      case "flipSelf": {
        const inst = g.cards[ctx.cardUid];
        if (inst) {
          (inst as any).flipped = !Boolean((inst as any).flipped);
          logMsg(g, `뒤집음: [[${cardNameWithUpgrade(g, ctx.cardUid)}]] (${(inst as any).flipped ? "ON" : "OFF"})`);
        }
        break;
      }

      case "blockByPlayerBlock": {
        const mult = Number.isFinite(Number(e.mult)) ? Number(e.mult) : 1;
        const amount = Math.max(0, withNumBonus(Math.floor(g.player.block * mult)));
        if (amount > 0) addBlock(g, amount);
        break;
      }

      case "damageEnemyLowestHp": {
        const alive = aliveEnemies(g);
        if (alive.length === 0) break;
        let minHp = Infinity;
        for (const en of alive) minHp = Math.min(minHp, en.hp);
        const cands = alive.filter((en) => en.hp === minHp);
        const target = pickOne(cands, "damageEnemyLowestHp");
        damageEnemyWithMeta(target, Math.max(0, withNumBonus(e.n ?? 0)));
        break;
      }

      case "damageEnemyRepeatByStatus": {
        const st = Math.max(0, g.player.status[e.key] ?? 0);
        const hits = 1 + st;
        const alive = aliveEnemies(g);
        if (alive.length === 0) break;
        const per = Math.max(0, withNumBonus(e.n ?? 0));
        for (let i = 0; i < hits; i++) {
          damageEnemyWithMeta(pickOne(alive), per);
        }
        if (e.reset) {
          g.player.status[e.key] = numBonus;
          logMsg(g, `상태 소모: ${String(e.key)} = ${numBonus}`);
        }
        break;
      }

      case "repeatBySupplies": {
        const base = Number.isFinite(Number(e.timesBase)) ? (Number(e.timesBase) | 0) : 1;
        const supplies = Math.max(0, Number(g.player.supplies ?? 0) || 0);
        const times = Math.max(0, supplies + withNumBonus(base));

        for (let i = 0; i < times; i++) {
          resolvePlayerEffects(ctx, e.effects ?? []);
        }

        if (e.reset) {
          g.player.supplies = numBonus;
          logMsg(g, `보급 S를 ${numBonus}으로 설정`);
        }
        break;
      }

      case "increaseCardDamageByDefId": {
        const defId = String(e.defId ?? "");
        if (!defId) break;
        const runAny = g.run as any;
        runAny.cardDamageBonusByDefId ??= {};
        const delta = withNumBonus(e.n);
        runAny.cardDamageBonusByDefId[defId] = Math.max(0, Number(runAny.cardDamageBonusByDefId[defId] ?? 0) + delta);
        logMsg(g, `[${defId}] 공격력 +${delta} (누적 ${runAny.cardDamageBonusByDefId[defId]})`);
        break;
      }

      case "increaseCardDamageByTag": {
        const tag = e.tag;
        if (!tag) break;

        const srcInst = g.cards[ctx.cardUid];
        if (srcInst?.defId === "improv_arrow" && tag === "ARROW") {
          const delta = withNumBonus(e.n);
          logMsg(g, `[태그:${tag}] 공격력 +${delta} (급조된 화살이 후열에 있는 동안 유지)`);
          break;
        }

        const runAny = g.run as any;
        runAny.cardDamageBonusByTag ??= {};
        const delta = withNumBonus(e.n);
        runAny.cardDamageBonusByTag[tag] = Math.max(0, Number(runAny.cardDamageBonusByTag[tag] ?? 0) + delta);
        logMsg(g, `[태그:${tag}] 공격력 +${delta} (누적 ${runAny.cardDamageBonusByTag[tag]})`);
        break;
      }

      default: {
        const _exhaustive: never = e;
        return _exhaustive;
      }
    }
  }
}