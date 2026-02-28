import type { GameState } from "../engine/types";

export function sleep(ms: number) {
  return new Promise<void>((res) => window.setTimeout(res, ms));
}
export function tickMsForPhase(phase: GameState["phase"]) {
  switch (phase) {
    case "BACK":  return 100;
    case "FRONT": return 100;
    case "ENEMY": return 100;
    case "UPKEEP": return 100;
    case "DRAW":  return 100;
    case "PLACE": return 0;
    default: return 220;
  }
}
