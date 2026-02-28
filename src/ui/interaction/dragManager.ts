import type { GameState, Side } from "../../engine/types";
import { isTargeting } from "../../engine/combat";
import { getCardDefByIdWithUpgrade } from "../../content/cards";
import { logMsg, pushUiToast } from "../../engine/rules";
import { updateSlotHoverUI } from "../slots";
import { suppressHover, clearCardHoverPreview } from "./cardPreview";

type DragState =
  | null
  | {
      kind: "hand" | "slot";
      cardUid: string;

      fromHandIndex?: number;
      fromSide?: Side;
      fromIdx?: number;

      pointerId: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      dragging: boolean;

      sourceEl?: HTMLElement | null;
      previewEl?: HTMLElement;
      previewW?: number;
      previewH?: number;
      grabDX?: number;
      grabDY?: number;
    };

export type SlotDrop = { side: Side; idx: number };

export type DragInit = { kind: "hand" | "slot"; cardUid: string; fromHandIndex?: number; fromSide?: Side; fromIdx?: number };

export type DragManagerActions = {
  onReturnSlotToHand: (side: Side, idx: number) => void;
  onPlaceHandUidToSlot: (uid: string, side: Side, idx: number) => void;
  onMoveSlotCard: (fromSide: Side, fromIdx: number, toSide: Side, toIdx: number) => void;
};

export type DragManager = {
  isDraggingNow(): boolean;
  getDragPointerId(): number | null;
  getHoverSlot(): SlotDrop | null;
  beginDrag(ev: PointerEvent, init: DragInit): void;
  clear(): void;
  renderDragOverlay(app: HTMLElement, g: GameState): void;
  bindGlobalDragInput(getG: () => GameState, actions: DragManagerActions): void;
};

let bound = false;
let drag: DragState = null;
let hoverSlot: SlotDrop | null = null;

function closestWithDatasetKeys(el: HTMLElement, keys: string[]): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    const ds = cur.dataset as Record<string, string | undefined>;
    let ok = true;
    for (const k of keys) {
      if (!ds[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function hitTestHand(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return false;

  let cur: HTMLElement | null = el;
  while (cur) {
    if ((cur as any).dataset?.dropHand === "1") return true;
    cur = cur.parentElement;
  }
  return false;
}

function hitTestSlot(x: number, y: number, g: GameState): SlotDrop | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;

  const slot = closestWithDatasetKeys(el, ["slotSide", "slotIndex"]);
  if (!slot) return null;

  const side = slot.dataset.slotSide as Side;
  const idx = Number(slot.dataset.slotIndex);

  const runAny: any = g.run as any;
  const capRaw = Number(side === "front" ? runAny.slotCapFront : runAny.slotCapBack);
  const cap = Math.max(3, Math.min(4, Math.floor(Number.isFinite(capRaw) ? capRaw : 3)));
  if (idx < 0 || idx >= cap) return null;

  if (side === "back" && g.backSlotDisabled?.[idx]) return null;
  return { side, idx };
}

export function initDragManager(p: {
  setHandScrollLocked: (locked: boolean) => void;
  getOverlay: () => any;
  normalizePlacementCounters: (g: GameState) => void;
  cardDisplayNameByUid: (g: GameState, uid: string) => string;
  renderAll: (g: GameState) => void;
}): DragManager {
  const { setHandScrollLocked, getOverlay, normalizePlacementCounters, cardDisplayNameByUid, renderAll } = p;

  function isDraggingNow() {
    return !!(drag && drag.dragging);
  }

  function getDragPointerId() {
    return drag ? drag.pointerId : null;
  }

  function getHoverSlot() {
    return hoverSlot;
  }

  function clear() {
    if (drag?.sourceEl) drag.sourceEl.classList.remove("isDraggingSource");
    drag = null;
    hoverSlot = null;
    updateSlotHoverUI(null);
    document.querySelector(".dragLayer")?.remove();
  }

  function beginDrag(ev: PointerEvent, init: DragInit) {
    suppressHover(250);
    clearCardHoverPreview();
    setHandScrollLocked(true);

    const target = ev.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(ev.pointerId);
    } catch {}

    const cardEl = target.closest(".card") as HTMLElement | null;
    if (cardEl) cardEl.classList.add("isDraggingSource");

    const r = cardEl?.getBoundingClientRect();

    const grabDX = r ? ev.clientX - r.left : 20;
    const grabDY = r ? ev.clientY - r.top : 20;

    const css = getComputedStyle(document.documentElement);
    const handW = parseFloat(css.getPropertyValue("--handCardW")) || undefined;
    const handH = parseFloat(css.getPropertyValue("--handCardH")) || undefined;
    const mobile = document.body.classList.contains("mobile");
    let slotW: number | undefined;
    let slotH: number | undefined;

    const slotCardEl =
      document.querySelector<HTMLElement>(".slot .slotCardInner") ??
      document.querySelector<HTMLElement>(".slot > .card") ??
      null;
    if (slotCardEl) {
      const sr = slotCardEl.getBoundingClientRect();
      if (sr.width > 0 && sr.height > 0) {
        slotW = sr.width;
        slotH = sr.height;
      }
    }

    drag = {
      kind: init.kind,
      cardUid: init.cardUid,
      fromHandIndex: init.fromHandIndex,
      fromSide: init.fromSide,
      fromIdx: init.fromIdx,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      x: ev.clientX,
      y: ev.clientY,
      dragging: false,

      previewEl: undefined,
      previewW: mobile ? r?.width ?? handW ?? slotW : slotW ?? r?.width ?? handW,
      previewH: mobile ? r?.height ?? handH ?? slotH : slotH ?? r?.height ?? handH,
      grabDX,
      grabDY,
    };

    if (cardEl) {
      drag.sourceEl = cardEl;
      const clone = cardEl.cloneNode(true) as HTMLElement;
      const sourceStyle = getComputedStyle(cardEl);

      clone.classList.remove("inSlot");
      clone.classList.remove("selected");
      clone.classList.remove("isDraggingSource");

      clone.style.position = "static";
      clone.style.inset = "";
      clone.style.width = "100%";
      clone.style.height = "100%";
      clone.style.margin = "0";
      clone.style.boxSizing = "border-box";

      clone.style.opacity = "1";
      clone.style.filter = "none";
      clone.style.transform = "none";
      clone.style.backgroundColor = "transparent";

      const cardInnerMul = sourceStyle.getPropertyValue("--cardInnerMul").trim();
      const slotTextScale = sourceStyle.getPropertyValue("--slotTextScale").trim();
      if (cardInnerMul) clone.style.setProperty("--cardInnerMul", cardInnerMul);
      if (slotTextScale) clone.style.setProperty("--slotTextScale", slotTextScale);
      clone.style.fontSize = sourceStyle.fontSize;
      clone.style.lineHeight = sourceStyle.lineHeight;

      drag.previewEl = clone;
    }
  }

  function renderDragOverlay(_app: HTMLElement, _g: GameState) {
    if (!drag || !drag.dragging) {
      document.querySelector(".dragLayer")?.remove();
      return;
    }

    let layer = document.querySelector<HTMLElement>(".dragLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "dragLayer";
      layer.style.position = "fixed";
      layer.style.inset = "0";
      layer.style.zIndex = "21000";
      layer.style.pointerEvents = "none";
      document.body.appendChild(layer);
    }
    layer.innerHTML = "";

    if (!drag.previewEl) return;

    const wrap = document.createElement("div");
    wrap.className = "dragCardPreview";
    wrap.style.position = "fixed";
    const leftVw = ((drag.x - (drag.grabDX ?? 20)) / window.innerWidth) * 100;
    const topVh = ((drag.y - (drag.grabDY ?? 20)) / window.innerHeight) * 100;
    wrap.style.left = `${leftVw.toFixed(4)}vw`;
    wrap.style.top = `${topVh.toFixed(4)}vh`;

    const w = drag.previewW ?? 0;
    const h = drag.previewH ?? 0;
    if (w > 0) {
      const wvw = (w / window.innerWidth) * 100;
      wrap.style.width = `${wvw.toFixed(4)}vw`;
    }
    if (h > 0) {
      const hvh = (h / window.innerHeight) * 100;
      wrap.style.height = `${hvh.toFixed(4)}vh`;
    }

    wrap.style.transform = "none";
    wrap.style.opacity = "1";
    wrap.style.filter = "none";
    wrap.style.boxShadow = "0 calc(16 * var(--u)) calc(44 * var(--u)) rgba(0,0,0,.65)";
    (wrap.style as any).backdropFilter = "none";
    wrap.style.isolation = "isolate";
    wrap.style.mixBlendMode = "normal";

    wrap.style.overflow = "hidden";
    wrap.style.borderRadius = "0";
    wrap.style.background = "transparent";
    wrap.style.clipPath = "inset(0)";
    wrap.appendChild(drag.previewEl);
    layer.appendChild(wrap);
  }

  function bindGlobalDragInput(getG: () => GameState, actions: DragManagerActions) {
    if (bound) return;
    bound = true;

    window.addEventListener(
      "pointermove",
      (ev) => {
        const g = getG();
        if (g.choice || getOverlay()) return;
        if (!drag || ev.pointerId !== drag.pointerId) return;

        drag.x = ev.clientX;
        drag.y = ev.clientY;

        const dx = drag.x - drag.startX;
        const dy = drag.y - drag.startY;

        const wasDragging = drag.dragging;
        if (!drag.dragging && dx * dx + dy * dy > 36) drag.dragging = true;

        if (!wasDragging && drag.dragging) {
          suppressHover(250);
          clearCardHoverPreview();
        }

        hoverSlot = drag.dragging ? hitTestSlot(ev.clientX, ev.clientY, g) : null;

        renderDragOverlay(document.querySelector("#app") as HTMLElement, g);
        updateSlotHoverUI(hoverSlot);
      },
      { passive: true }
    );

    window.addEventListener("pointerup", (ev) => {
      const g = getG();
      if (!drag || ev.pointerId !== drag.pointerId) return;

      setHandScrollLocked(false);

      if (g.choice || getOverlay()) {
        if (drag?.sourceEl) drag.sourceEl.classList.remove("isDraggingSource");
        drag = null;
        hoverSlot = null;
        renderAll(g);
        return;
      }

      if (drag.dragging) {
        const dropHand = hitTestHand(ev.clientX, ev.clientY);
        const dropSlot = hitTestSlot(ev.clientX, ev.clientY, g);

        if (dropHand && drag.kind === "slot" && drag.fromSide != null && drag.fromIdx != null) {
          if (!g.run.finished && !isTargeting(g) && g.phase === "PLACE") {
            actions.onReturnSlotToHand(drag.fromSide, drag.fromIdx);
          }
          drag = null;
          hoverSlot = null;
          renderAll(g);
          return;
        }

        if (dropSlot) {
          if (drag.kind === "hand") {
            const g2 = getG();
            if (g2.run.finished || isTargeting(g2) || g2.phase !== "PLACE") {
            } else {
              const side = dropSlot.side;
              const idx = dropSlot.idx;
              if (side === "back" && g2.backSlotDisabled?.[idx]) {
              } else {
                const slots = side === "front" ? g2.frontSlots : g2.backSlots;
                const uidHere = slots[idx];

                if (!uidHere) {
                  actions.onPlaceHandUidToSlot(drag.cardUid, side, idx);
                } else {
                  const instHere = g2.cards[uidHere];
                  const defHere = getCardDefByIdWithUpgrade(g2.content, instHere.defId, instHere.upgrade ?? 0);
                  if (defHere.tags?.includes("LOCKED")) {
                    pushUiToast(g2, "WARN", "잠긴 카드는 이동할 수 없습니다.", 1600);
                    drag = null;
                    hoverSlot = null;
                    renderAll(g2);
                    return;
                  }

                  const handIdx =
                    drag.fromHandIndex != null && drag.fromHandIndex >= 0 ? drag.fromHandIndex : g2.hand.indexOf(drag.cardUid);

                  const realIdx = g2.hand.indexOf(drag.cardUid);
                  if (realIdx >= 0) g2.hand.splice(realIdx, 1);

                  slots[idx] = drag.cardUid;
                  g2.cards[drag.cardUid].zone = side;

                  const insertAt = handIdx != null && handIdx >= 0 && handIdx <= g2.hand.length ? handIdx : g2.hand.length;
                  g2.hand.splice(insertAt, 0, uidHere);
                  g2.cards[uidHere].zone = "hand";

                  g2.selectedHandCardUid = null;

                  normalizePlacementCounters(g2);

                  logMsg(
                    g2,
                    `[${cardDisplayNameByUid(g2, drag.cardUid)}] ↔ [${cardDisplayNameByUid(g2, uidHere)}] 스왑: 손패 ↔ ${side}${idx + 1}`
                  );
                  renderAll(g2);
                }
              }
            }
          } else if (drag.kind === "slot") {
            if (drag.fromSide != null && drag.fromIdx != null) {
              if (!(drag.fromSide === dropSlot.side && drag.fromIdx === dropSlot.idx)) {
                actions.onMoveSlotCard(drag.fromSide, drag.fromIdx, dropSlot.side, dropSlot.idx);
              }
            }
          }
        }
      }

      if (drag?.sourceEl) drag.sourceEl.classList.remove("isDraggingSource");

      drag = null;
      hoverSlot = null;
      renderAll(g);
    });
  }

  return {
    isDraggingNow,
    getDragPointerId,
    getHoverSlot,
    beginDrag,
    clear,
    renderDragOverlay,
    bindGlobalDragInput,
  };
}
