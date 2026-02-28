import type { GameState } from "../../engine/types";
import { hasSave, loadGame } from "../../persist";
import { createInitialState } from "../../engine/state";
import { currentTotalDeckLikeSize } from "../../engine/combat";
import { ensureFaith, openFaithStartChoice } from "../../engine/faith";

function hydrateLoadedState(loaded: any, content: any): GameState {
  const g = loaded as any;

  g.content = content;

  g.time ??= 0;

  g.run ??= {};
  g.run.relics ??= [];

  (g.run as any).timeMove ??= g.run.nodePickCount ?? 0;
  g.run.nextBossTime ??= 40;
  g.run.forcedNext ??= null;
  g.run.bossOmenText ??= null;
  g.run.enemyLastSeenBattle ??= {};
  g.run.nodePickByType ??= { BATTLE: 0, ELITE: 0, REST: 0, EVENT: 0, TREASURE: 0 };
  g.run.bossPool ??= ["boss_gravity_master", "boss_cursed_wall", "boss_giant_orc", "boss_soul_stealer"];
  g.run.nextBossId ??= null;
  g.run.lastBattleWasElite ??= false;
  (g.run as any).lastBattleWasBoss ??= false;
  (g.run as any).rewardPityNonElite ??= 0;
  g.run.gold ??= 0;
  (g.run as any).pendingEventWinGold ??= 0;

  (g.run as any).items ??= [];
  (g.run as any).itemOfferedThisBattle ??= false;

  g.run.afterTreasureNodePicks ??= 0;
  (g.run as any).deckSizeAtTreasure ??= null;

  if (g.run.treasureObtained && g.run.deckSizeAtTreasure == null) {
    g.run.deckSizeAtTreasure = currentTotalDeckLikeSize(g);
  }

  g.choiceStack ??= [];
  g.pendingTargetQueue ??= [];
  g.exhausted ??= [];
  g.vanished ??= [];
  g.choiceQueue ??= [];
  g.choiceCtx ??= null;

  return g as GameState;
}

export function createOrLoadGame(content: any): GameState {
  if (!hasSave()) return createInitialState(content);

  const loaded = loadGame();
  if (!loaded) return createInitialState(content);

  const g = hydrateLoadedState(loaded.state, content);

  const f = ensureFaith(g);
  if (!g.choice && !f.chosen) {
    openFaithStartChoice(g);
  }

  return g;
}
