import type { GameState } from "../types";
import { aliveEnemies, logMsg } from "../rules";
import { resolvePlayerEffects } from "../resolve";
import { getCardDefFor } from "../../content/cards";
import { runRelicHook, checkRelicUnlocks, getUnlockProgress, grantRelic } from "../relics";
import { openBattleCardRewardChoice, openEliteRelicOfferChoice, openBossRelicOfferChoice } from "../engineRewards";
import { escapeRequiredNodePicks } from "./encounter";
import { _cleanupBattleTransientForVictory } from "./phases";


function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
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
  const unique = pool.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

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

function getEscapeReq(g: GameState): number {
  const snap = g.run.deckSizeAtTreasure ?? null;
  return snap == null ? 10 : escapeRequiredNodePicks(snap);
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
    const wasBoss = g.enemies.some((e) => String(e.id).startsWith("boss_"));
    _cleanupBattleTransientForVictory(g);
    applyWinHooksWhileInBackThisTurn(g);

    logMsg(g, "적을 모두 처치!");
    {
      const map = (g.run as any).map as any;
      if (map && map.nodes && map.pos && map.nodes[map.pos]) {
        map.nodes[map.pos].cleared = true;
        map.nodes[map.pos].visited = true;
      }
    }
    // 유물 해금 진행도: 엘리트 전투 승리 1회
    if (g.run.lastBattleWasElite) {
      const up = getUnlockProgress(g);
      up.eliteWins += 1;
      checkRelicUnlocks(g);
    }

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
      // 불길한 예언: 보스 격파 후에는 다시 등장 가능
      (g.run as any).ominousProphecyLockedUntilBossKill = false;
      (g.run as any).ominousProphecySeen = false;
      g.player.hp = g.player.maxHp;
      logMsg(g, "보스 격파! 체력이 완전히 회복되었습니다.");
      openBossRelicOfferChoice(g); // 3개 중 1개
    }

    openEliteRelicOfferChoice(g);
    openBattleCardRewardChoice(g);
    g.phase = "NODE";

    if (g.run.treasureObtained) {
      const req = getEscapeReq(g);
      if (g.run.afterTreasureNodePicks >= req) {
        g.run.finished = true;
        logMsg(g, `승리! 저주받은 보물을 얻은 후 ${req}번의 탐험 동안 살아남았습니다.`);
        return;
      }
    }


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
