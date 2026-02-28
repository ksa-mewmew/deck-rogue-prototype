import type { GameState } from "../../engine/types";

export type WireCardHoverPreviewParams = {
  g: GameState;
  cardUid: string;
  title: string;
  detailText: string;
  root: HTMLElement;
  api: any;
  buildBigCardEl: () => HTMLElement;
  isDraggingNow: () => boolean;
  isHoverSuppressed: () => boolean;
  suppressHover: (ms: number) => void;
  isMobile: () => boolean;
  getPinnedCardUid: () => string | null;
  setPinnedCardUid: (uid: string | null) => void;
  clearCardHoverPreview: () => void;
  getDragPointerId: () => number | null;
};

export function wireCardHoverPreviewInteractions(el: HTMLElement, p: WireCardHoverPreviewParams) {
  const {
    title,
    detailText,
    root,
    api,
    buildBigCardEl,
    isDraggingNow,
    isHoverSuppressed,
    suppressHover,
    isMobile,
    getPinnedCardUid,
    setPinnedCardUid,
    clearCardHoverPreview,
    getDragPointerId,
  } = p;

  api.ensure(root);

  el.addEventListener("pointerenter", () => {
    if (isHoverSuppressed()) return;
    if (isDraggingNow()) return;
    if (api.isPinned?.() && getPinnedCardUid()) return;

    const big = buildBigCardEl();
    api.show({ title, detail: detailText, cardEl: big });
  });

  el.addEventListener("pointerleave", () => {
    if (api.isPinned?.()) return;
    api.hide();
  });

  el.addEventListener(
    "pointerup",
    (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType === "mouse") return;
      if (pe.pointerType === "touch") return;
      if (!isMobile()) return;
      if (isDraggingNow()) return;
      const dp = getDragPointerId();
      if (dp != null && dp === pe.pointerId) return;
      if (isHoverSuppressed()) return;

      const cur = getPinnedCardUid();
      if (cur === p.cardUid && api.isPinned?.()) {
        setPinnedCardUid(null);
        api.unpin?.();
        api.hide();
        return;
      }

      setPinnedCardUid(p.cardUid);

      const big = buildBigCardEl();
      api.show({ title, detail: detailText, cardEl: big });
      api.pin?.();
    },
    { passive: true }
  );

  el.addEventListener(
    "pointerdown",
    (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType === "touch") return;
      suppressHover(250);
      if (api.isPinned?.() && getPinnedCardUid()) return;
      clearCardHoverPreview();
    },
    { capture: true }
  );
}
