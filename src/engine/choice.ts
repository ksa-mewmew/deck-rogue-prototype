import type { ChoiceCtx, ChoiceState, GameState } from "./types";
import { applyPendingRelicActivations } from "./relics";

export type ChoiceFrame = { choice: ChoiceState; ctx: ChoiceCtx };

export function hasChoice(g: GameState): boolean {
  return g.choice != null;
}

export function enqueueChoice(g: GameState, choice: ChoiceState, ctx: ChoiceCtx = null) {
  g.choiceQueue ??= [];
  if (!g.choice) {
    g.choice = choice;
    g.choiceCtx = ctx;
    return;
  }
  g.choiceQueue.push({ choice, ctx });
}

export function setChoice(g: GameState, choice: ChoiceState, ctx: ChoiceCtx = null) {
  g.choiceQueue = [];
  g.choice = choice;
  g.choiceCtx = ctx;
}

export function clearChoice(g: GameState) {
  g.choice = null;
  g.choiceCtx = null;
}

export function clearAllChoices(g: GameState) {
  g.choiceQueue = [];
  clearChoice(g);
  if (g.phase === "NODE") {
    applyPendingRelicActivations(g);
  }
}

export function closeChoice(g: GameState) {
  const q = g.choiceQueue ?? [];
  if (q.length > 0) {
    const next = q.shift() ?? null;
    if (next) {
      g.choice = next.choice;
      g.choiceCtx = next.ctx;
      g.choiceQueue = q;
      return;
    }
  }
  clearChoice(g);

  if (g.phase === "NODE") {
    applyPendingRelicActivations(g);
  }

}