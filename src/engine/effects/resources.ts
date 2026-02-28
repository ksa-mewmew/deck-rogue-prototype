import type { GameState } from "../types";
import { logMsg, clampMin } from "../rules";
import { isRelicActive } from "../relics";

export function addSupplies(g: GameState, n: number) {
  g.player.supplies = clampMin(g.player.supplies + n, 0);
  logMsg(g, `보급 S ${n >= 0 ? "+" : ""}${n} (현재 ${g.player.supplies})`);
}

export function addFatigue(g: GameState, n: number) {
  g.player.fatigue = clampMin(g.player.fatigue + n, 0);
  logMsg(g, `피로 F ${n >= 0 ? "+" : ""}${n} (현재 ${g.player.fatigue})`);
}

export function healPlayer(g: GameState, n: number) {
  if (n <= 0) return;
  let amount = n;
  if (isRelicActive(g, "relic_bloody_spoon") && amount > 0) {
    amount += 1;
    logMsg(g, `피 묻은 숟가락, 추가 회복 +1`);
  }
  const before = g.player.hp;
  g.player.hp = Math.min(g.player.maxHp, g.player.hp + amount);
  logMsg(g, `HP +${g.player.hp - before} (현재 ${g.player.hp}/${g.player.maxHp})`);
}
