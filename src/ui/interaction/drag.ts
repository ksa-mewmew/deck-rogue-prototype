import type { GameState } from "../../engine/types";

export type DragSource =
  | { kind: "hand"; cardUid: string; fromHandIndex: number };

export type BeginDragFn = (ev: PointerEvent, src: DragSource) => void;

export type WireCardDragInteractionsParams = {
  g: GameState;
  cardUid: string;
  draggable: boolean;
  isTargeting: (g: GameState) => boolean;
  isDraggingNow: () => boolean;
  beginDrag: BeginDragFn;
  onTouchHold?: () => void;
};

export function wireCardDragInteractions(el: HTMLElement, p: WireCardDragInteractionsParams) {
  const { g, cardUid, draggable, isTargeting, beginDrag, isDraggingNow, onTouchHold } = p;

  let touchHoldTimer: number | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchDragStarted = false;
  let touchPointerId = -1;
  let touchPressActive = false;

  const canStartTouchDrag = () => {
    if (isTargeting(g)) return false;
    if (g.phase !== "PLACE") return false;
    if (!draggable) return false;
    return true;
  };

  const clearTouchHold = () => {
    if (touchHoldTimer != null) {
      window.clearTimeout(touchHoldTimer);
      touchHoldTimer = null;
    }
  };

  el.onpointerdown = (ev) => {
    if ((ev as any).button !== 0 && (ev as any).pointerType === "mouse") return;
    const pe = ev as PointerEvent;

    if (pe.pointerType === "touch") {
      touchDragStarted = false;
      touchPointerId = pe.pointerId;
      touchPressActive = true;
      touchStartX = pe.clientX;
      touchStartY = pe.clientY;
      clearTouchHold();

      if (onTouchHold) {
        touchHoldTimer = window.setTimeout(() => {
          if (!touchPressActive) return;
          if (isDraggingNow()) return;
          onTouchHold();
        }, 320);
      }
      return;
    }

    if (isTargeting(g)) return;
    if (g.phase !== "PLACE") return;
    if (!draggable) return;

    const idx = g.hand.indexOf(cardUid);
    beginDrag(ev, { kind: "hand", cardUid, fromHandIndex: idx });
  };

  el.addEventListener(
    "pointermove",
    (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType !== "touch") return;
      const dx = pe.clientX - touchStartX;
      const dy = pe.clientY - touchStartY;
      const movedEnough = dx * dx + dy * dy > 12 * 12;
      if (!movedEnough) return;

      clearTouchHold();

      if (isDraggingNow()) return;
      if (!touchPressActive) return;
      if (!canStartTouchDrag()) return;

      touchDragStarted = true;
      touchPressActive = false;
      const idx = g.hand.indexOf(cardUid);
      const dragEv = {
        currentTarget: el,
        pointerId: touchPointerId,
        clientX: pe.clientX,
        clientY: pe.clientY,
      } as unknown as PointerEvent;
      beginDrag(dragEv, { kind: "hand", cardUid, fromHandIndex: idx });
    },
    { passive: true }
  );

  el.addEventListener(
    "pointerup",
    (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType !== "touch") return;
      touchPressActive = false;
      clearTouchHold();
    },
    { passive: true }
  );

  el.addEventListener(
    "pointercancel",
    (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType !== "touch") return;
      touchPressActive = false;
      clearTouchHold();
    },
    { passive: true }
  );

  el.addEventListener(
    "click",
    (ev) => {
      if (!touchDragStarted) return;
      touchDragStarted = false;
      ev.preventDefault();
      ev.stopPropagation();
    },
    true
  );
}
