import { getItemDefById } from "../content/items";
import { RELICS_BY_ID } from "../content/relicsContent";
import { getPatronGodOrNull, godAbilityBlock, godName, ensureFaith } from "../engine/faith";
import type { GameState, GodId } from "../engine/types";
import { ensureBgLayer } from "./background/bgLayer";

let _ASSET_BASE: string | null = null;

let _itemTip: HTMLDivElement | null = null;
let _relicTip: HTMLDivElement | null = null;
let _faithTip: HTMLDivElement | null = null;

export function ensureItemTip(): HTMLDivElement {
  if (_itemTip) return _itemTip;
  const tip = document.createElement("div");
  tip.id = "itemHoverTip";
  tip.className = "itemHoverTip relicHoverTip";
  tip.style.pointerEvents = "none";
  tip.style.position = "fixed";
  tip.style.left = "0";
  tip.style.top = "0";
  tip.style.zIndex = "70000";
  document.body.appendChild(tip);
  _itemTip = tip;
  return tip;
}

export function unitLenDev(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--u");
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function lenFromDev(dev: number): string {
  const u = unitLenDev();
  const units = dev / u;
  const safe = Number.isFinite(units) ? units : 0;
  return "calc(" + safe + " * var(--u))";
}

export function setItemTipContent(itemId: string) {
  const tip = ensureItemTip();
  const def = getItemDefById(itemId);

  tip.innerHTML = "";
  const t = document.createElement("div");
  t.className = "relicTipTitle";
  t.textContent = def?.name ?? itemId;

  const b = document.createElement("div");
  b.className = "relicTipBody";
  b.textContent = def?.text ?? "";

  tip.appendChild(t);
  tip.appendChild(b);
}

export function moveItemTip(clientX: number, clientY: number) {
  const tip = ensureItemTip();

  const u = unitLenDev();
  const padU = 12;
  const offU = 14;

  const pad = padU * u;
  const off = offU * u;

  let x = clientX + off;
  let y = clientY + off;

  tip.style.left = lenFromDev(x);
  tip.style.top = lenFromDev(y);

  const r = tip.getBoundingClientRect();

  if (x + r.width + pad > window.innerWidth) x = window.innerWidth - r.width - pad;
  if (y + r.height + pad > window.innerHeight) y = window.innerHeight - r.height - pad;
  if (x < pad) x = pad;
  if (y < pad) y = pad;

  tip.style.left = lenFromDev(Math.round(x));
  tip.style.top = lenFromDev(Math.round(y));
}

export function showItemTipAt(itemId: string, clientX: number, clientY: number) {
  setItemTipContent(itemId);
  const tip = ensureItemTip();
  tip.classList.add("show");
  moveItemTip(clientX, clientY);
  requestAnimationFrame(() => moveItemTip(clientX, clientY));
}

export function showItemTip(itemId: string, e: MouseEvent) {
  showItemTipAt(itemId, e.clientX, e.clientY);
}

export function hideItemTip() {
  const tip = ensureItemTip();
  tip.classList.remove("show");
}

export function ensureRelicTip(): HTMLDivElement {
  if (_relicTip) return _relicTip;
  const tip = document.createElement("div");
  tip.id = "relicHoverTip";
  tip.className = "itemHoverTip relicHoverTip";
  tip.style.pointerEvents = "none";
  tip.style.position = "fixed";
  tip.style.left = "0";
  tip.style.top = "0";
  tip.style.zIndex = "70000";
  document.body.appendChild(tip);
  _relicTip = tip;
  return tip;
}

export function setRelicTipContent(relicId: string) {
  const tip = ensureRelicTip();
  const def: any = (RELICS_BY_ID as any)?.[relicId] ?? {};

  tip.innerHTML = "";
  const t = document.createElement("div");
  t.className = "relicTipTitle";
  t.textContent = def?.name ?? relicId;

  const b = document.createElement("div");
  b.className = "relicTipBody";
  b.textContent = def?.text ?? "";

  tip.appendChild(t);
  tip.appendChild(b);
}

export function moveRelicTip(clientX: number, clientY: number) {
  const tip = ensureRelicTip();

  const u = unitLenDev();
  const padU = 12;
  const offU = 14;

  const pad = padU * u;
  const off = offU * u;

  let x = clientX + off;
  let y = clientY + off;

  tip.style.left = lenFromDev(x);
  tip.style.top = lenFromDev(y);

  const r = tip.getBoundingClientRect();

  if (x + r.width + pad > window.innerWidth) x = window.innerWidth - r.width - pad;
  if (y + r.height + pad > window.innerHeight) y = window.innerHeight - r.height - pad;
  if (x < pad) x = pad;
  if (y < pad) y = pad;

  tip.style.left = lenFromDev(Math.round(x));
  tip.style.top = lenFromDev(Math.round(y));
}

export function showRelicTipAt(relicId: string, clientX: number, clientY: number) {
  setRelicTipContent(relicId);
  const tip = ensureRelicTip();
  tip.classList.add("show");
  moveRelicTip(clientX, clientY);
  requestAnimationFrame(() => moveRelicTip(clientX, clientY));
}

export function hideRelicTip() {
  const tip = ensureRelicTip();
  tip.classList.remove("show");
}

export function wireRelicHover(el: HTMLElement, relicId: string) {
  el.addEventListener("pointerenter", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType === "touch") return;
    showRelicTipAt(relicId, pe.clientX ?? 0, pe.clientY ?? 0);
  });
  el.addEventListener("pointermove", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType === "touch") return;
    moveRelicTip(pe.clientX ?? 0, pe.clientY ?? 0);
  }, { passive: true });
  el.addEventListener("pointerleave", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType === "touch") return;
    hideRelicTip();
  });

  let holdTimer: number | null = null;
  let holdStartX = 0;
  let holdStartY = 0;
  let consumeClick = false;
  let suppressActivateUntil = 0;

  const clearHold = () => {
    if (holdTimer != null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  el.addEventListener("pointerdown", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;

    consumeClick = false;
    holdStartX = pe.clientX;
    holdStartY = pe.clientY;

    clearHold();
    holdTimer = window.setTimeout(() => {
      consumeClick = true;
      suppressActivateUntil = performance.now() + 700;
      (el as any).__relicHoverSuppressClickUntil = suppressActivateUntil;
      showRelicTipAt(relicId, holdStartX, holdStartY);
    }, 320);
  }, { passive: true });

  el.addEventListener("pointermove", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;

    const tipOpen = (ensureRelicTip().classList.contains("show"));
    if (tipOpen) {
      moveRelicTip(pe.clientX, pe.clientY);
      return;
    }

    if (holdTimer == null) return;
    const dx = pe.clientX - holdStartX;
    const dy = pe.clientY - holdStartY;
    if (dx * dx + dy * dy > 12 * 12) clearHold();
  }, { passive: true });

  const endTouchHover = () => {
    clearHold();
    if (ensureRelicTip().classList.contains("show")) {
      suppressActivateUntil = Math.max(suppressActivateUntil, performance.now() + 420);
      (el as any).__relicHoverSuppressClickUntil = suppressActivateUntil;
      hideRelicTip();
    }
  };

  el.addEventListener("pointerup", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;
    endTouchHover();
  }, { passive: true });

  el.addEventListener("pointercancel", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;
    endTouchHover();
  }, { passive: true });

  el.addEventListener("click", (ev) => {
    if (!consumeClick) return;
    consumeClick = false;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);
}

export function wireItemHover(el: HTMLElement, itemId: string) {
  el.addEventListener("pointerenter", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType === "touch") return;
    showItemTipAt(itemId, pe.clientX ?? 0, pe.clientY ?? 0);
  });
  el.addEventListener("pointermove", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType === "touch") return;
    moveItemTip(pe.clientX ?? 0, pe.clientY ?? 0);
  }, { passive: true });
  el.addEventListener("pointerleave", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType === "touch") return;
    hideItemTip();
  });

  let holdTimer: number | null = null;
  let holdStartX = 0;
  let holdStartY = 0;
  let consumeClick = false;
  let suppressActivateUntil = 0;

  const clearHold = () => {
    if (holdTimer != null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  el.addEventListener("pointerdown", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;

    consumeClick = false;
    holdStartX = pe.clientX;
    holdStartY = pe.clientY;

    clearHold();
    holdTimer = window.setTimeout(() => {
      consumeClick = true;
      suppressActivateUntil = performance.now() + 700;
      (el as any).__itemHoverSuppressClickUntil = suppressActivateUntil;
      showItemTipAt(itemId, holdStartX, holdStartY);
    }, 320);
  }, { passive: true });

  el.addEventListener("pointermove", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;

    const tipOpen = (ensureItemTip().classList.contains("show"));
    if (tipOpen) {
      moveItemTip(pe.clientX, pe.clientY);
      return;
    }

    if (holdTimer == null) return;
    const dx = pe.clientX - holdStartX;
    const dy = pe.clientY - holdStartY;
    if (dx * dx + dy * dy > 12 * 12) clearHold();
  }, { passive: true });

  const endTouchHover = () => {
    clearHold();
    if (ensureItemTip().classList.contains("show")) {
      suppressActivateUntil = Math.max(suppressActivateUntil, performance.now() + 420);
      (el as any).__itemHoverSuppressClickUntil = suppressActivateUntil;
      hideItemTip();
    }
  };

  el.addEventListener("pointerup", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;
    endTouchHover();
  }, { passive: true });

  el.addEventListener("pointercancel", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;
    endTouchHover();
  }, { passive: true });

  el.addEventListener("click", (ev) => {
    if (!consumeClick) return;
    consumeClick = false;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);
}

export function ensureFaithTip(): HTMLDivElement {
  if (_faithTip) return _faithTip;
  const tip = document.createElement("div");
  tip.id = "faithHoverTip";
  tip.className = "itemHoverTip relicHoverTip";
  tip.style.pointerEvents = "none";
  tip.style.position = "fixed";
  tip.style.left = "0";
  tip.style.top = "0";
  tip.style.zIndex = "120000";
  document.body.appendChild(tip);
  _faithTip = tip;
  return tip;
}
export function setFaithTipContent(g: GameState) {
  const tip = ensureFaithTip();
  const f = ensureFaith(g);
  tip.innerHTML = "";

  const offered = f.offered as any as Array<Exclude<GodId, "madness">>;

  const title = document.createElement("div");
  title.className = "relicTipTitle";
  const patron = getPatronGodOrNull(g);
  title.textContent = `후원: ${patron ? godName(patron) : "없음"} / 포커스: ${godName(f.focus)}`;

  const body = document.createElement("div");
  body.className = "relicTipBody";
  body.style.whiteSpace = "pre-wrap";

  const blocks = offered.map((id) => {
    const pts = f.points[id] ?? 0;
    return `${godName(id)}: ${pts}점\n${godAbilityBlock(id)}`;
  });
  body.textContent = blocks.join("\n\n");

  tip.appendChild(title);
  tip.appendChild(body);
}

export function moveFaithTip(clientX: number, clientY: number) {
  const tip = ensureFaithTip();

  const u = unitLenDev();
  const padU = 12;
  const offU = 14;
  const pad = padU * u;
  const off = offU * u;

  let x = clientX + off;
  let y = clientY + off;

  tip.style.left = lenFromDev(x);
  tip.style.top = lenFromDev(y);

  const r = tip.getBoundingClientRect();
  if (x + r.width + pad > window.innerWidth) x = window.innerWidth - r.width - pad;
  if (y + r.height + pad > window.innerHeight) y = window.innerHeight - r.height - pad;
  if (x < pad) x = pad;
  if (y < pad) y = pad;

  tip.style.left = lenFromDev(Math.round(x));
  tip.style.top = lenFromDev(Math.round(y));
}

export function showFaithTip(g: GameState, e: MouseEvent) {
  setFaithTipContent(g);
  const tip = ensureFaithTip();
  tip.classList.add("show");
  moveFaithTip(e.clientX, e.clientY);
  requestAnimationFrame(() => moveFaithTip(e.clientX, e.clientY));
}

export function showFaithTipAt(g: GameState, clientX: number, clientY: number) {
  setFaithTipContent(g);
  const tip = ensureFaithTip();
  tip.classList.add("show");
  moveFaithTip(clientX, clientY);
  requestAnimationFrame(() => moveFaithTip(clientX, clientY));
}

export function hideFaithTip() {
  const tip = ensureFaithTip();
  tip.classList.remove("show");
}

export function wireFaithBadgeHover(el: HTMLElement, getCurrentG: () => any | null) {
  el.addEventListener("pointerenter", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType === "touch") return;

    const g = getCurrentG();
    if (!g) return;

    showFaithTipAt(g, pe.clientX, pe.clientY);
  });

  el.addEventListener(
    "pointermove",
    (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType === "touch") return;
      moveFaithTip(pe.clientX, pe.clientY);
    },
    { passive: true }
  );

  el.addEventListener("pointerleave", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType === "touch") return;
    hideFaithTip();
  });

  el.addEventListener(
    "pointerup",
    (ev) => {
      const pe = ev as PointerEvent;
      if (pe.pointerType !== "touch") return;

      const g = getCurrentG();
      if (!g) return;

      const tip = ensureFaithTip();
      if (tip.classList.contains("show")) {
        hideFaithTip();
        return;
      }
      showFaithTipAt(g, pe.clientX, pe.clientY);
    },
    { passive: true }
  );
}

function getAssetBase(): string {
  if (_ASSET_BASE) return _ASSET_BASE;

  const viteBase = (import.meta as any)?.env?.BASE_URL as string | undefined;
  if (viteBase && typeof viteBase === "string" && viteBase !== "/") {
    _ASSET_BASE = new URL(viteBase, window.location.origin).href.replace(/\/?$/, "/");
    return _ASSET_BASE;
  }

  try {
    const modulePath = new URL(import.meta.url).pathname;
    const srcIdx = modulePath.indexOf("/src/");
    if (srcIdx >= 0) {
      const basePath = modulePath.slice(0, srcIdx + 1);
      _ASSET_BASE = new URL(basePath, window.location.origin).href.replace(/\/?$/, "/");
      return _ASSET_BASE;
    }
  } catch {}

  try {
    const path = window.location.pathname || "/";
    const m = path.match(/^\/([^/]+)\//);
    if (m && m[1] && m[1] !== "src") {
      _ASSET_BASE = new URL(`/${m[1]}/`, window.location.origin).href.replace(/\/?$/, "/");
      return _ASSET_BASE;
    }
  } catch {}

  _ASSET_BASE = `${window.location.origin}/`;
  return _ASSET_BASE;
}

export function assetUrl(ref: string): string {
  if (!ref) return ref;
  if (/^(https?:|data:|blob:)/i.test(ref)) return ref;

  const toWebpIfImage = (s: string) => s.replace(/\.(png|jpe?g)(?=([?#].*)?$)/i, ".webp");

  const normalized0 = ref.replace(/^public\//, "");
  const normalized = toWebpIfImage(normalized0);
  const base = getAssetBase();
  const clean = normalized.replace(/^\/+/, "");
  return new URL(clean, base).href;
}

let _assetVarsApplied = false;
export function applyAssetVarsOnce() {
  if (_assetVarsApplied) return;
  _assetVarsApplied = true;

  const root = document.documentElement;

  root.style.setProperty("--boardUrl", `url("${assetUrl("assets/ui/boards/battle_board.png")}")`);
  root.style.setProperty("--cardBgBasic", `url("${assetUrl("assets/ui/cards/card_basic.png")}")`);
  root.style.setProperty("--cardBgCommon", `url("${assetUrl("assets/ui/cards/card_common.png")}")`);
  root.style.setProperty("--cardBgSpecial", `url("${assetUrl("assets/ui/cards/card_special.png")}")`);
  root.style.setProperty("--cardBgRare", `url("${assetUrl("assets/ui/cards/card_rare.png")}")`);
  root.style.setProperty("--cardBgMadness", `url("${assetUrl("assets/ui/cards/card_madness.png")}")`);
  root.style.setProperty("--cardUrl", `url("${assetUrl("assets/ui/cards/card_parchment.png")}")`);

  root.style.setProperty("--mapBgUrl", `url("${assetUrl("assets/ui/background/map_bg.png")}")`);

  if (!document.getElementById("deck-fontfaces")) {
    const st = document.createElement("style");
    st.id = "deck-fontfaces";
    const w2 = assetUrl("assets/fonts/Mulmaru.woff2");
    const w1 = assetUrl("assets/fonts/Mulmaru.woff");
    st.textContent = `\
@font-face {\
  font-family: "Mulmaru";\
  src: url("${w2}") format("woff2"), url("${w1}") format("woff");\
  font-weight: 400;\
  font-style: normal;\
  font-display: swap;\
}\
:root { --gameFont: "Mulmaru", system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }\
body { font-family: var(--gameFont); }\
`;
    document.head.appendChild(st);
  }
  ensureBgLayer();
}
