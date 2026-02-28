import type { GameState } from "../../engine/types";
import { RELICS_BY_ID } from "../../content/relicsContent";
import { getRelicDisplay } from "../../engine/relics";
import { assetUrl } from "../assets";
import { button, div, el, h3, img } from "../dom";

type Pt = { x: number; y: number };

let relicHoverId: string | null = null;
let relicHoverAt: Pt | null = null;
let relicModalId: string | null = null;

function unitLenDev(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--u");
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function lenFromDev(dev: number): string {
  const u = unitLenDev();
  const units = dev / u;
  const safe = Number.isFinite(units) ? units : 0;
  return "calc(" + safe + " * var(--u))";
}

function getRelicView(g: GameState, id: string) {
  const def: any = (RELICS_BY_ID as any)[id] ?? null;
  const disp = getRelicDisplay(g, id);
  const artRaw = def?.art ?? def?.icon ?? null;
  const art = artRaw ? String(artRaw) : null;
  const icon = art ? assetUrl(art) : null;
  return {
    id,
    name: disp.name,
    desc: disp.text,
    state: disp.state,
    icon,
    art,
  };
}

export function clearRelicHoverTooltip() {
  relicHoverId = null;
  relicHoverAt = null;
  document.querySelector(".relicTooltip")?.remove();
}

export function openRelicModal(id: string) {
  relicModalId = id;
  clearRelicHoverTooltip();
}

function renderRelicTooltip(g: GameState) {
  document.querySelector(".relicTooltip")?.remove();
  if (!relicHoverId || !relicHoverAt) return;

  const v = getRelicView(g, relicHoverId);
  if (!v.desc && !v.name) return;

  const tip = div("relicTooltip");

  const t = div("relicTooltipTitle", v.name);
  tip.appendChild(t);

  if (v.desc) {
    const d = div("relicTooltipDesc", v.desc);
    tip.appendChild(d);
  }

  document.body.appendChild(tip);

  const u = unitLenDev();
  const pad = 12 * u;
  const off = 10 * u;

  const r = tip.getBoundingClientRect();
  let x = relicHoverAt.x - r.width;
  let y = relicHoverAt.y - r.height - off;

  x = Math.max(pad, Math.min(window.innerWidth - r.width - pad, x));
  y = Math.max(pad, Math.min(window.innerHeight - r.height - pad, y));

  tip.style.left = lenFromDev(Math.round(x));
  tip.style.top = lenFromDev(Math.round(y));
}

export function renderRelicHud(g: GameState, deps: { rerender: () => void }) {
  document.querySelector(".relicHud")?.remove();
  document.querySelector(".relicTooltip")?.remove();

  const ids = (g.run.relics ?? []).slice();
  if (ids.length === 0) return;

  const hud = div("relicHud");

  for (const id of ids.slice().reverse()) {
    const v = getRelicView(g, id);

    const icon = div("relicIcon");
    icon.setAttribute("role", "button");
    icon.tabIndex = 0;

    if (v.icon) {
      const im = img(v.icon, "relicIconImg", v.name ?? v.id ?? "relic");
      icon.appendChild(im);
    } else {
      const t = div(undefined, v.name.slice(0, 2));
      t.style.fontWeight = "900";
      t.style.fontSize = "calc(12 * var(--u))";
      t.style.opacity = ".95";
      icon.appendChild(t);
    }

    const setHover = (x: number, y: number) => {
      relicHoverId = id;
      relicHoverAt = { x, y };
      renderRelicTooltip(g);
    };

    icon.onpointerenter = (e) => setHover((e as any).clientX ?? 0, (e as any).clientY ?? 0);
    icon.onpointermove = (e) => {
      if (relicHoverId !== id) return;
      relicHoverAt = { x: (e as any).clientX ?? 0, y: (e as any).clientY ?? 0 };
      renderRelicTooltip(g);
    };
    icon.onpointerleave = () => {
      if (relicHoverId === id) clearRelicHoverTooltip();
    };

    icon.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      relicModalId = id;
      clearRelicHoverTooltip();
      deps.rerender();
    };

    icon.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        relicModalId = id;
        deps.rerender();
      }
    };

    hud.appendChild(icon);
  }

  document.body.appendChild(hud);
  renderRelicTooltip(g);
}

export function renderRelicModal(g: GameState, deps: { rerender: () => void }) {
  document.querySelector(".relicModal")?.remove();
  if (!relicModalId) return;

  const v = getRelicView(g, relicModalId);

  const modal = div("relicModal");
  modal.style.cssText =
    "position: fixed;" +
    "inset: 0;" +
    "z-index: var(--zRelicModal, 70000);" +
    "pointer-events: auto;" +
    "background: rgba(0,0,0,.55);" +
    "backdrop-filter: blur(calc(6 * var(--u)));" +
    "-webkit-backdrop-filter: blur(calc(6 * var(--u)));" +
    "display: flex;" +
    "align-items: center;" +
    "justify-content: center;" +
    "padding: calc(18 * var(--u));" +
    "box-sizing: border-box;";

  modal.onclick = (e) => {
    if (e.target !== modal) return;
    relicModalId = null;
    deps.rerender();
  };

  const panel = div("relicModalPanel");
  panel.onclick = (e) => e.stopPropagation();

  const header = div("relicModalHeader");

  const title = h3(v.name, "relicModalTitle");
  title.style.fontFamily = `"물마루", serif`;

  const closeBtn = button(
    "닫기",
    () => {
      relicModalId = null;
      deps.rerender();
    },
    false,
    "overlayClose"
  );

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = div("relicModalBody");

  const art = div("relicModalArt");

  const artImg = div("relicModalArtImg");
  if (v.art) artImg.style.backgroundImage = `url("${assetUrl(v.art)}")`;
  art.appendChild(artImg);

  const desc = el("pre", "relicModalDesc", v.desc || "");
  desc.style.fontFamily = `"물마루", serif`;

  body.appendChild(art);
  body.appendChild(desc);

  panel.appendChild(header);
  panel.appendChild(body);
  modal.appendChild(panel);
  document.body.appendChild(modal);
}
