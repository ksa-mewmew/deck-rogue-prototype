import type { GameState } from "../types";
import { aliveEnemies, logMsg, pushUiToast } from "../rules";
import { resolvePlayerEffects } from "../resolve";
import { getCardDefFor } from "../../content/cards";
import { runRelicHook, checkRelicUnlocks, getUnlockProgress, grantRelic } from "../relics";
import { openBattleCardRewardChoice, openEliteRelicOfferChoice, openBossRelicOfferChoice, openBossSlotUpgradeChoice } from "../engineRewards";
import { _cleanupBattleTransientForVictory } from "./phases";
import { rollBattleItemDrop } from "../items";
import { GOD_LINES, getPatronGodOrNull, isHostile } from "../faith";


function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function restoreFlipAllPlayerCardsAfterCombat(g: GameState) {
  const snap = (g as any)._flipAllCombatOriginal as Record<string, boolean | undefined> | undefined;
  if (!snap) return;

  for (const [uid, wasFlipped] of Object.entries(snap)) {
    const inst: any = g.cards[uid];
    if (!inst) continue;

    if (wasFlipped === undefined) {
      delete inst.flipped;
    } else {
      inst.flipped = wasFlipped;
    }
  }

  delete (g as any)._flipAllCombatOriginal;
}

  
function endCombatReturnAllToDeck(g: GameState) {
  const pool: string[] = [];

  for (const uid of g.deck) pool.push(uid);
  for (const uid of g.hand) pool.push(uid);
  for (const uid of g.discard) pool.push(uid);
  for (const uid of g.frontSlots) if (uid) pool.push(uid);
  for (const uid of g.backSlots) if (uid) pool.push(uid);
  for (const uid of g.exhausted) pool.push(uid);

  const seen = new Set<string>();
  let unique = pool.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

  const tokenUids = unique.filter((uid) => {
    const inst = g.cards[uid];
    if (!inst) return false;
    const def = g.content.cardsById[inst.defId];
    return !!def?.tags?.includes("TOKEN");
  });
  if (tokenUids.length > 0) {
    const tok = new Set(tokenUids);
    unique = unique.filter((u) => !tok.has(u));
    for (const uid of tokenUids) {
      delete (g.cards as any)[uid];
    }
  }

  const keep = unique.filter((uid) => g.cards[uid]?.zone !== "vanished");

  g.deck = keep;
  for (const uid of keep) g.cards[uid].zone = "deck";

  g.hand = [];
  g.discard = [];
  g.frontSlots = [null, null, null];
  g.backSlots = [null, null, null];
  g.selectedHandCardUid = null;

  g.exhausted = [];

  g.pendingTarget = null;
  g.pendingTargetQueue = [];

  shuffleInPlace(g.deck);
}

function applyWinHooksWhileInBackThisTurn(g: GameState) {
  if (g.winHooksAppliedThisCombat) return;
  g.winHooksAppliedThisCombat = true;

  for (const uid of g.backUidsThisTurn) {
    const card = g.cards[uid];
    if (!card) continue;

    const def = getCardDefFor(g, uid);
    const effs = (def as any).onWinWhileInBack;
    if (!effs || effs.length === 0) continue;

    resolvePlayerEffects({ game: g, side: "back", cardUid: uid }, effs);
  }
}


export function checkEndConditions(g: GameState) {
  if (g.player.hp <= 0) {
    _cleanupBattleTransientForVictory(g);
    g.run.finished = true;
    logMsg(g, "패배: 죽었습니다.");
    return;
  }

  if (g.victoryResolvedThisCombat) return;

  if (aliveEnemies(g).length === 0 && g.phase !== "NODE") {
    g.victoryResolvedThisCombat = true;
    const wasBoss = !!(g.run as any).lastBattleWasBoss;
    _cleanupBattleTransientForVictory(g);
    applyWinHooksWhileInBackThisTurn(g);

    logMsg(g, "적을 모두 처치!");
    if (wasBoss) (g.run as any).bossOmenText = null;
    {
      const map = (g.run as any).map as any;
      if (map && map.nodes && map.pos && map.nodes[map.pos]) {
        map.nodes[map.pos].cleared = true;
        map.nodes[map.pos].visited = true;
      }
    }
    if (g.run.lastBattleWasElite) {
      const up = getUnlockProgress(g);
      up.eliteWins += 1;
      checkRelicUnlocks(g);
    }

    {
      const runAny: any = g.run as any;
      const enemyCount = Number(runAny.lastBattleEnemyCount ?? 0) || 0;
      if (!wasBoss && enemyCount === 3) {
        const up = getUnlockProgress(g) as any;
        up.threeEnemyWins = (Number(up.threeEnemyWins ?? 0) || 0) + 1;
        checkRelicUnlocks(g);
      }
    }

    {
      const runAny = g.run as any;
      const curGold = Number(runAny.gold ?? 0) || 0;

      const T = Number(runAny.timeMove ?? 0) + (g.time ?? 0);
      const tier = Math.min(3, Math.floor(Math.max(0, T) / 15));
      let gainGold = 3 + tier * 2;
      if (g.run.lastBattleWasElite) gainGold += 10;
      if (wasBoss) gainGold += 30;

      const eventGold = Number(runAny.pendingEventWinGold ?? 0) || 0;
      if (eventGold !== 0) {
        gainGold += eventGold;
        runAny.pendingEventWinGold = 0;
      }

      if (isHostile(g, "card_dealer")) {
        gainGold = 0;
        runAny.pendingEventWinGold = 0;
      }

      if (gainGold !== 0) {
        runAny.gold = curGold + gainGold;
        logMsg(g, `전투 보상: 🪙${gainGold}`);
        pushUiToast(g, "GOLD", `🪙 +${gainGold}`, 1600);
      }

      if (getPatronGodOrNull(g) === "card_dealer") {
        if (Math.random() < 0.3) {
          const now = Number(runAny.gold ?? 0) || 0;
          const lost = Math.min(10, now);
          runAny.gold = now - lost;
          pushUiToast(g, "WARN", GOD_LINES.card_dealer.victoryFee, 1800);
          logMsg(g, GOD_LINES.card_dealer.victoryFee);
          if (lost > 0) pushUiToast(g, "GOLD", `🪙 -${lost}`, 1600);
          logMsg(g, `카드 딜러: 수수료 🪙 -${lost}`);
        }
      }
    }

    restoreFlipAllPlayerCardsAfterCombat(g);
    endCombatReturnAllToDeck(g);
    g.enemies = [];
    g.player.zeroSupplyTurns = 0;

    {
      const runAny = g.run as any;
      const rid = runAny.pendingEventWinRelicId as string | null;
      if (rid) {
        runAny.pendingEventWinRelicId = null;
        grantRelic(g, rid, "EVENT");
      }
    }

    runRelicHook(g, "onVictory");

    if (wasBoss) {
      (g.run as any).ominousProphecyLockedUntilBossKill = false;
      (g.run as any).ominousProphecySeen = false;
      g.player.hp = g.player.maxHp;
      logMsg(g, "보스 격파! 체력이 완전히 회복되었습니다.");

      {
        const runAny: any = g.run as any;
        runAny.slotCapFront = Math.max(3, Math.min(4, Math.floor(Number(runAny.slotCapFront ?? 3))));
        runAny.slotCapBack  = Math.max(3, Math.min(4, Math.floor(Number(runAny.slotCapBack  ?? 3))));

        runAny.bossKillCount = (Number(runAny.bossKillCount ?? 0) || 0) + 1;
        const k = Number(runAny.bossKillCount) || 0;

        if (k === 1) {
          openBossSlotUpgradeChoice(g);
        } else if (k === 2) {
          const first = String(runAny.bossSlotFirstPick ?? "");
          if (first === "front") {
            if (runAny.slotCapBack < 4) runAny.slotCapBack += 1;
            pushUiToast(g, "INFO", "보스 보상: 후열 슬롯 +1", 2000);
            logMsg(g, "보스 보상: 후열 슬롯 +1");
          } else {
            if (runAny.slotCapFront < 4) runAny.slotCapFront += 1;
            pushUiToast(g, "INFO", "보스 보상: 전열 슬롯 +1", 2000);
            logMsg(g, "보스 보상: 전열 슬롯 +1");
          }
        }
      }

      openBossRelicOfferChoice(g); // 3개 중 1개
    }

    openEliteRelicOfferChoice(g);

    const ctx = wasBoss ? "BOSS" : g.run.lastBattleWasElite ? "ELITE" : "BATTLE";
    const drop = rollBattleItemDrop(g, { elite: !!g.run.lastBattleWasElite, boss: !!wasBoss });
    openBattleCardRewardChoice(g, { itemOfferId: drop ?? undefined, itemSource: ctx });
    g.phase = "NODE";


    return;
  }
}

export function currentTotalDeckLikeSize(g: GameState): number {
  return (
    g.deck.length +
    g.hand.length +
    g.discard.length +
    g.frontSlots.filter(Boolean).length +
    g.backSlots.filter(Boolean).length +
    g.exhausted.length
  );
}
