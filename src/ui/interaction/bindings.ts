import type { GameState, Side } from "../../engine/types";
import { isTargeting } from "../../engine/combat";
import { logMsg } from "../../engine/rules";
import { isDevConsoleOpen, toggleDevConsole } from "../dev_console";
import { initDragManager, type DragInit, type SlotDrop } from "./dragManager";

let inputBound = false;
let dragMgr: ReturnType<typeof initDragManager> | null = null;

function setHandScrollLocked(locked: boolean) {
  document.body.classList.toggle("handDragScrollLock", locked);
  const hand = document.querySelector<HTMLElement>(".hand");
  if (!hand) return;
  if (locked) {
    hand.style.overflowX = "hidden";
    hand.style.touchAction = "none";
  } else {
    hand.style.overflowX = "";
    hand.style.touchAction = "";
  }
}

export function enableHorizontalWheelScroll(el: HTMLElement) {
  if ((el as any).dataset?.wheelX === "1") return;
  (el as any).dataset.wheelX = "1";
  el.addEventListener(
    "wheel",
    (e) => {
      if (document.body.classList.contains("handDragScrollLock")) {
        e.preventDefault();
        return;
      }

      if (e.shiftKey) return;
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      el.scrollLeft += dx;
      e.preventDefault();
    },
    { passive: false }
  );
}

export function isDraggingNow(): boolean {
  return dragMgr ? dragMgr.isDraggingNow() : false;
}

export function getDragPointerId(): number | null {
  return dragMgr ? dragMgr.getDragPointerId() : null;
}

export function getHoverSlot(): SlotDrop | null {
  return dragMgr ? dragMgr.getHoverSlot() : null;
}

export function beginDrag(ev: PointerEvent, init: DragInit) {
  dragMgr?.beginDrag(ev as any, init as any);
}

export function clearDrag() {
  dragMgr?.clear();
}

export function renderDragOverlay(app: HTMLElement, g: GameState) {
  dragMgr?.renderDragOverlay(app, g);
}

type EnsureGlobalInputOpts = {
  getG: () => GameState;
  getActions: () => {
    onNewRun: () => void;
    onClearSelected: () => void;
    onHotkeySlot: (side: Side, idx: number) => void;
    onSelectEnemy: (idx: number) => void;
    onAutoAdvance: () => void;
    onReturnSlotToHand: (side: Side, idx: number) => void;
    onPlaceHandUidToSlot: (uid: string, side: Side, idx: number) => void;
    onMoveSlotCard: (fromSide: Side, fromIdx: number, toSide: Side, toIdx: number) => void;
  };
  getOverlay: () => any;
  normalizePlacementCounters: (g: GameState) => void;
  cardDisplayNameByUid: (g: GameState, uid: string) => string;
  renderAll: (g: GameState) => void;
  clearAllHover: () => void;
  getLastEnter: () => { action: null | (() => void); disabled: boolean };
};

export function ensureGlobalInputBound(opts: EnsureGlobalInputOpts) {
  if (inputBound) return;
  inputBound = true;

  if (!dragMgr) {
    dragMgr = initDragManager({
      setHandScrollLocked,
      getOverlay: opts.getOverlay,
      normalizePlacementCounters: opts.normalizePlacementCounters,
      cardDisplayNameByUid: opts.cardDisplayNameByUid,
      renderAll: opts.renderAll,
    });

    dragMgr.bindGlobalDragInput(opts.getG, {
      onReturnSlotToHand: (side, idx) => opts.getActions().onReturnSlotToHand(side, idx),
      onPlaceHandUidToSlot: (uid, side, idx) => opts.getActions().onPlaceHandUidToSlot(uid, side, idx),
      onMoveSlotCard: (fromSide, fromIdx, toSide, toIdx) => opts.getActions().onMoveSlotCard(fromSide, fromIdx, toSide, toIdx),
    });
  }

  window.addEventListener(
    "pointerup",
    (ev) => {
      if ((ev as any).pointerType !== "mouse") return;
      opts.clearAllHover();
    },
    { capture: true, passive: true }
  );

  window.addEventListener("keydown", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

    if (ev.ctrlKey && ev.shiftKey && ev.code === "KeyK") {
      ev.preventDefault();
      toggleDevConsole();
      return;
    }

    if (isDevConsoleOpen()) return;

    const g = opts.getG();
    const actions = opts.getActions();

    if (ev.code === "KeyP") {
      ev.preventDefault();
      actions.onNewRun();
      return;
    }

    if (ev.code === "Digit4") {
      ev.preventDefault();

      if (isTargeting(g)) {
        g.pendingTarget = null;
        g.pendingTargetQueue = [];
        (g as any).selectedEnemyIndex = null;
        logMsg(g, "대상 선택 취소");
        opts.renderAll(g);
        return;
      }

      actions.onClearSelected();
      return;
    }

    if (ev.key === "Tab") {
      ev.preventDefault();
      if (g.hand.length === 0) return;

      const cur = g.selectedHandCardUid;
      const idx = cur ? g.hand.indexOf(cur) : -1;
      const dir = ev.shiftKey ? -1 : 1;
      const next = ((idx + dir) % g.hand.length + g.hand.length) % g.hand.length;
      g.selectedHandCardUid = g.hand[next];
      opts.renderAll(g);
      return;
    }

    if (ev.code === "Space") {
      ev.preventDefault();
      if (g.run.finished) return;
      if (g.choice) return;
      if (isTargeting(g)) return;

      actions.onAutoAdvance();
      return;
    }

    if (ev.code === "Digit1" || ev.code === "Digit2" || ev.code === "Digit3") {
      ev.preventDefault();
      const idx = ev.code === "Digit1" ? 0 : ev.code === "Digit2" ? 1 : 2;

      if (isTargeting(g)) {
        const e = g.enemies[idx];
        if (!e || e.hp <= 0) {
          logMsg(g, `대상 선택 실패: ${idx + 1}번 적이 없습니다.`);
          opts.renderAll(g);
          return;
        }

        actions.onSelectEnemy(idx);
        return;
      }

      actions.onHotkeySlot("front", idx);
      return;
    }

    if (ev.code === "KeyQ" || ev.code === "KeyW" || ev.code === "KeyE") {
      ev.preventDefault();
      const idx = ev.code === "KeyQ" ? 0 : ev.code === "KeyW" ? 1 : 2;
      actions.onHotkeySlot("back", idx);
      return;
    }

    if (ev.code === "Enter") {
      ev.preventDefault();
      const { action, disabled } = opts.getLastEnter();
      if (!disabled && action) action();
      return;
    }
  });
}
