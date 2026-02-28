import type { GameState } from "../../engine/types";

export type UiToastRuntime = {
  id: number;
  kind: string;
  text: string;
  born: number;
  ms: number;
};

export type UiToastsRuntime = {
  seq: number;
  list: UiToastRuntime[];
};

export function createUiToastsRuntime(): UiToastsRuntime {
  return { seq: 1, list: [] };
}

function pullUiToastsFromState(g: GameState, rt: UiToastsRuntime) {
  const anyG = g as any;
  const q = (anyG.uiToasts as any[]) ?? [];
  if (!q || q.length === 0) return;

  const now = performance.now();
  for (const t of q) {
    const kind = String((t as any).kind ?? "INFO");
    const text = String((t as any).text ?? "");
    const ms = Math.max(200, Number((t as any).ms ?? 1600) || 1600);
    rt.list.push({ id: rt.seq++, kind, text, born: now, ms });
  }

  anyG.uiToasts = [];
}

function cleanupUiToastsRt(rt: UiToastsRuntime, animMulNow: () => number) {
  const now = performance.now();
  const mul = Math.max(0, Math.min(2, Number(animMulNow() ?? 1.0) || 1.0));
  rt.list = rt.list.filter((t) => now - t.born < t.ms * mul);
}

export function renderUiToastLayer(g: GameState, rt: UiToastsRuntime, animMulNow: () => number) {
  pullUiToastsFromState(g, rt);
  cleanupUiToastsRt(rt, animMulNow);

  let layer = document.querySelector<HTMLElement>(".toastLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "toastLayer";
    document.body.appendChild(layer);
  }

  layer.innerHTML = "";
  for (const t of rt.list) {
    const el = document.createElement("div");
    el.className = `toast toast-${t.kind.toLowerCase()}`;
    el.textContent = t.text;
    layer.appendChild(el);
  }
}
