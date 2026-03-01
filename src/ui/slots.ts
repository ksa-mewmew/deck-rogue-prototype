import type { GameState, Side } from "../engine/types";
import { displayCardTextPair } from "../engine/cardText";

export type HoverSlot = { side: Side; idx: number } | null;

export type RenderSlotsGridDeps = {
  uiSettings: any;
  cardHoverApi: any;
  hoverSlot: HoverSlot;

  renderCard: (...args: any[]) => HTMLElement;
  getCardDefByUid: (g: GameState, uid: string) => any;
  isTargeting: (g: GameState) => boolean;
  beginDrag: (ev: PointerEvent, init: { kind: "hand" | "slot"; cardUid: string; fromHandIndex?: number; fromSide?: Side; fromIdx?: number }) => void;
};

function isFrontSlotLockedByLivingChain(g: GameState, idx: number): boolean {
  if (idx !== 1) return false;
  return (g.enemies ?? []).some((e: any) => e && e.hp > 0 && e.id === "living_chain");
}

export function applySlotCardScale(slotEl: HTMLElement, scalerEl: HTMLElement) {
  const css = getComputedStyle(document.documentElement);

  const handW = parseFloat(css.getPropertyValue("--handCardW")) || 240;
  const handH = parseFloat(css.getPropertyValue("--handCardH")) || 336;

  const r = slotEl.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;

  const PAD = 6;
  const availW = Math.max(1, r.width - PAD * 2);
  const availH = Math.max(1, r.height - PAD * 2);

  let s = Math.min(availW / handW, availH / handH);

  const MIN = 0.8;
  const MAX = 1.0;
  s = Math.max(MIN, Math.min(MAX, s));

  scalerEl.style.setProperty("--slotCardScale", String(s));
}

function isInstallCardDef(def: any): boolean {
  if (!def) return false;
  const id = String(def.id ?? "");
  const tags = (def.tags ?? []) as any[];
  if (Array.isArray(tags) && tags.includes("INSTALL")) return true;
  if (id.startsWith("install_")) return true;
  if (def.installWhen) return true;
  return false;
}

function isInstallActiveInSide(def: any, side: Side): boolean {
  if (!isInstallCardDef(def)) return false;

  const w = String(def.installWhen ?? "BOTH").toUpperCase();
  if (w === "FRONT") return side === "front";
  if (w === "BACK") return side === "back";
  return true;
}


export function renderSlotsGrid(g: GameState, actions: any, side: Side, deps: RenderSlotsGridDeps) {
  const grid = document.createElement("div");
  grid.className = "grid6";

  const hasSelected = !!(g as any).selectedHandCardUid;
  const slots = side === "front" ? (g as any).frontSlots : (g as any).backSlots;

  const runAny: any = (g as any).run as any;
  const capRaw = Number(side === "front" ? runAny.slotCapFront : runAny.slotCapBack);
  const cap = Math.max(3, Math.min(4, Math.floor(Number.isFinite(capRaw) ? capRaw : 3)));

  for (let i = 0; i < cap; i++) {
    const disabledBack = side === "back" ? !!(g as any).backSlotDisabled?.[i] : false;
    const disabledFrontChain = side === "front" ? isFrontSlotLockedByLivingChain(g, i) : false;
    const disabled = disabledBack || disabledFrontChain;

    const s = document.createElement("div");
    s.className = "slot" + (disabled ? " disabled" : "");
    if (disabledFrontChain) s.classList.add("chainLocked");
    (s as any).dataset.slotSide = side;
    (s as any).dataset.slotIndex = String(i);

    if (deps.hoverSlot && deps.hoverSlot.side === side && deps.hoverSlot.idx === i) s.classList.add("dropHover");
    if (hasSelected && !disabled) s.classList.add("placeable");

    const uid = slots[i];
    if (uid) {
      const def = deps.getCardDefByUid(g, uid);
      if (isInstallActiveInSide(def, side)) s.classList.add("installed");
 
      const mode = (deps.uiSettings as any).slotCardMode === "NAME_ONLY" ? "SLOT_NAME_ONLY" : "FULL";

      const cardEl = deps.renderCard(g, uid, false, undefined, {
        draggable: false,
        mode,
        hoverPreview: {
          root: document.body,
          api: deps.cardHoverApi,
          buildDetail: (gg: any, u: any) => {
            const ddef = deps.getCardDefByUid(gg, u);
            const t = displayCardTextPair(gg, ddef.frontText, ddef.backText, u);
            return `전열: ${t.frontText}\n후열: ${t.backText}`;
          },
        },
      }) as HTMLElement;

      cardEl.classList.add("inSlot");

      const scaler = document.createElement("div");
      scaler.className = "slotCardScaler";
      scaler.appendChild(cardEl);
      s.appendChild(scaler);

      cardEl.onpointerdown = (ev) => {
        if ((ev as any).button !== 0 && (ev as any).pointerType === "mouse") return;
        if (deps.isTargeting(g)) return;
        if ((g as any).phase !== "PLACE") return;
        deps.beginDrag(ev as any, { kind: "slot", cardUid: uid, fromSide: side, fromIdx: i });
      };
      cardEl.ondblclick = () => actions.onReturnSlotToHand(side, i);

      requestAnimationFrame(() => applySlotCardScale(s, scaler));
    }

    grid.appendChild(s);
  }

  return grid;
}

export function updateSlotHoverUI(hoverSlot: HoverSlot) {
  document.querySelectorAll(".slot.dropHover").forEach((el) => el.classList.remove("dropHover"));
  if (!hoverSlot) return;
  const sel = `.slot[data-slot-side="${hoverSlot.side}"][data-slot-index="${hoverSlot.idx}"]`;
  const el = document.querySelector<HTMLElement>(sel);
  if (el) el.classList.add("dropHover");
}
