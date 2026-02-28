import type { GameState } from "../engine/types";
import { isTargeting } from "../engine/combat";
import { getItemCap } from "../engine/items";
import { getItemDefById } from "../content/items";
import { RELICS_BY_ID } from "../content/relicsContent";
import { getRelicDisplay } from "../engine/relics";
import { assetUrl, wireItemHover } from "./assets";

type ItemTrayActions = {
  onUseItem: (slotIndex: number) => void;
  onDiscardItem: (slotIndex: number) => void;
  overlayOpen: boolean;
};

type RelicTrayActions = {
  onOpenRelicModal: (relicId: string) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

export function renderItemTray(g: GameState, actions: ItemTrayActions) {
  document.querySelector(".itemTray")?.remove();
  document.querySelector(".itemCapHud")?.remove();

  const items = ((g.run as any).items as string[]) ?? [];
  if (!items || items.length === 0) return;

  const inCombat = g.enemies.length > 0 && g.phase !== "NODE";

  const tray = document.createElement("div");
  tray.className = "itemTray";
  tray.classList.add("noScrollbar");

  let itemHoverId: string | null = null;

  const tip = document.createElement("div");
  tip.className = "relicHoverTip itemHoverTip";
  tray.appendChild(tip);

  const cap = getItemCap(g);
  const capHud = document.createElement("div");
  capHud.className = "itemCapHud";

  const capBadge = document.createElement("div");
  capBadge.className = "itemCapBadge";
  capBadge.textContent = items.length + "/" + cap;

  const capHint = document.createElement("div");
  capHint.className = "itemCapHint";
  capHint.textContent = "우클릭/×: 버리기";

  capHud.appendChild(capBadge);
  capHud.appendChild(capHint);

  document.body.appendChild(capHud);

  const updateTip = () => {
    const id = itemHoverId;
    if (!id) {
      tip.classList.remove("show");
      tip.innerHTML = "";
      return;
    }

    const def = getItemDefById(id);
    tip.innerHTML = "";

    const t = document.createElement("div");
    t.className = "relicTipTitle";
    t.textContent = def?.name ?? id;

    const b = document.createElement("div");
    b.className = "relicTipBody";
    b.textContent = def?.text ?? "";

    tip.appendChild(t);
    tip.appendChild(b);

    tip.classList.add("show");
  };

  for (let i = 0; i < items.length; i++) {
    const id = String(items[i]);
    const def = getItemDefById(id);

    const slot = document.createElement("div");
    slot.className = "itemSlot";
    wireItemHover(slot, id);

    const img = document.createElement("img");
    img.alt = def?.name ?? id;
    if (def?.art) img.src = assetUrl(def.art);
    slot.appendChild(img);

    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "itemDropBtn";
    drop.title = "";
    drop.textContent = "×";
    drop.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      actions.onDiscardItem(i);
    };
    slot.appendChild(drop);

    slot.oncontextmenu = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      actions.onDiscardItem(i);
    };

    const disabled = !inCombat || !!g.choice || !!actions.overlayOpen || isTargeting(g);
    if (disabled) slot.classList.add("disabled");

    slot.onclick = (e) => {
      e.stopPropagation();
      if (disabled) return;
      actions.onUseItem(i);
    };

    slot.onmouseenter = () => {
      itemHoverId = id;
      updateTip();
    };
    slot.onmouseleave = () => {
      itemHoverId = null;
      updateTip();
    };

    tray.appendChild(slot);
  }

  document.body.appendChild(tray);

  try {
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--u")) || 1;
    const r = tray.getBoundingClientRect();
    capHud.style.left = `${Math.round(r.left + 6 * u)}px`;
    capHud.style.top = `${Math.round(r.top - 10 * u)}px`;
  } catch {}
}

export function renderRelicTray(g: GameState, actions: RelicTrayActions) {
  const prev = document.getElementById("relicTray");
  if (prev) prev.remove();

  const ids = g.run.relics ?? [];
  if (ids.length === 0) return;

  const tray = el("div", "relicTray");
  tray.id = "relicTray";
  tray.classList.add("noScrollbar");

  const tip = el("div", "relicHoverTip");
  tray.appendChild(tip);

  const list = el("div", "relicTrayList");
  list.classList.add("noScrollbar");
  tray.appendChild(list);

  let trayHoverId: string | null = null;

  const updateTip = () => {
    const id = trayHoverId;
    if (!id) {
      tip.style.display = "none";
      tip.textContent = "";
      return;
    }

    const def = RELICS_BY_ID[id];
    if (!def) {
      tip.style.display = "none";
      tip.textContent = "";
      return;
    }

    const disp = getRelicDisplay(g, id);

    tip.style.display = "block";
    tip.innerHTML = "";

    const t = el("div", "relicTipTitle");
    t.textContent = disp.name;

    const b = el("div", "relicTipBody");
    b.textContent = disp.text;

    tip.appendChild(t);
    tip.appendChild(b);
  };

  for (const id of ids) {
    const def = RELICS_BY_ID[id];
    if (!def) continue;

    const disp = getRelicDisplay(g, id);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "relicIcon";

    if (def.art) {
      const img = document.createElement("img");
      img.className = "relicIconImg";
      img.alt = disp.name;
      img.src = assetUrl(def.art);
      btn.appendChild(img);
    } else {
      btn.textContent = disp.name.slice(0, 1);
    }

    btn.onmouseenter = () => {
      trayHoverId = id;
      updateTip();
    };
    btn.onmouseleave = () => {
      trayHoverId = null;
      updateTip();
    };
    btn.onclick = () => {
      trayHoverId = null;
      updateTip();
      actions.onOpenRelicModal(id);
    };

    list.appendChild(btn);
  }

  updateTip();
  document.body.appendChild(tray);
}
