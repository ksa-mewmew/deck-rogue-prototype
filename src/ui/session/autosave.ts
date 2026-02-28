import type { GameState } from "../../engine/types";
import { saveGame } from "../../persist";

let saveTimer: number | null = null;

export function scheduleAutosave(g: GameState) {
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveGame(g);
  }, 250);
}
