import type { GameState } from "../../engine/types";
import { isTargeting } from "../../engine/combat";
import { tickMsForPhase, sleep } from "../timing";
import { computeNextStep, type NextStepActions } from "./nextStep";

let autoAdvancing = false;

type RunAutoAdvanceOpts<A extends NextStepActions> = {
  g: GameState;
  actions: A;
  getOverlayActive: () => boolean;
  render: (g: GameState, actions: A) => void;
  animMs: (ms: number) => number;
};

export async function runAutoAdvanceRAF<A extends NextStepActions>(opts: RunAutoAdvanceOpts<A>) {
  const { g, actions, getOverlayActive, render, animMs } = opts;

  if ((g as any)._justStartedCombat) {
    (g as any)._justStartedCombat = false;
    return;
  }

  if (autoAdvancing) return;
  autoAdvancing = true;

  try {
    if (g.run.finished) return;
    if (g.choice) return;
    if (isTargeting(g)) return;
    if (getOverlayActive()) return;
    if (g.phase === "NODE") return;

    let guard = 0;
    while (guard++ < 60) {
      if (g.run.finished) break;
      if (g.choice || getOverlayActive()) break;
      if (isTargeting(g)) break;

      const step = computeNextStep(g, actions, false, getOverlayActive());
      if (!step.fn || step.disabled) break;

      const beforePhase = g.phase;
      step.fn();
      render(g, actions);

      if (g.phase === "PLACE") break;

      const ms = tickMsForPhase(beforePhase);
      if (ms > 0) await sleep(animMs(ms));
    }
  } finally {
    autoAdvancing = false;
  }
}
