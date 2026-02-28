import type { GameState } from "../../engine/types";

export type NextStepActions = {
  onRevealIntents: () => void;
  onResolveBack: () => void;
  onResolveFront: () => void;
  onResolveEnemy: () => void;
  onUpkeep: () => void;
  onDrawNextTurn: () => void;
};

export type NextStep = {
  label: string;
  fn: null | (() => void);
  disabled: boolean;
  activePhase: GameState["phase"];
};

let lastEnterAction: (() => void) | null = null;
let lastEnterDisabled = true;

export function setEnterAction(fn: (() => void) | null, disabled: boolean) {
  lastEnterAction = fn;
  lastEnterDisabled = disabled;
}

export function getLastEnter() {
  return { action: lastEnterAction, disabled: lastEnterDisabled };
}

export function computeNextStep(
  g: GameState,
  actions: NextStepActions,
  targeting: boolean,
  overlayActive: boolean
): NextStep {
  if (g.run.finished) return { label: "종료", fn: null, disabled: true, activePhase: g.phase };
  if (g.choice || overlayActive) return { label: "선택 중", fn: null, disabled: true, activePhase: g.phase };
  if (targeting) return { label: "대상 선택", fn: null, disabled: true, activePhase: g.phase };
  if (g.phase === "NODE") return { label: "노드 선택", fn: null, disabled: true, activePhase: g.phase };

  if (g.phase === "PLACE") {
    const needScout = g.enemies.length > 0 && !(g as any).intentsRevealedThisTurn;
    if (needScout) return { label: "다음: 정찰", fn: actions.onRevealIntents, disabled: false, activePhase: g.phase };
    return { label: "다음: 후열", fn: actions.onResolveBack, disabled: false, activePhase: g.phase };
  }

  if (g.phase === "BACK") return { label: "다음: 후열", fn: actions.onResolveBack, disabled: false, activePhase: g.phase };

  if (g.phase === "FRONT") return { label: "다음: 전열", fn: actions.onResolveFront, disabled: false, activePhase: g.phase };

  if (g.phase === "ENEMY") return { label: "다음: 적", fn: actions.onResolveEnemy, disabled: false, activePhase: g.phase };

  if (g.phase === "UPKEEP") return { label: "다음: 정리", fn: actions.onUpkeep, disabled: false, activePhase: g.phase };
  if (g.phase === "DRAW") return { label: "다음 턴", fn: actions.onDrawNextTurn, disabled: false, activePhase: g.phase };

  return { label: "다음", fn: null, disabled: true, activePhase: g.phase };
}
