import type { GameState } from "../../engine/types";
import { div, h2, span, el } from "../dom";

type MkButton = (label: string, onClick: () => void, disabled?: boolean) => HTMLElement;

let logCollapsed = false;
let showLogOverlay = false;

const LOG_COLLAPSED_KEY = "deckrogue_logCollapsed";

function logBox(text: string) {
  const pre = el("pre", "log", text);
  requestAnimationFrame(() => {
    pre.scrollTop = pre.scrollHeight;
  });
  return pre;
}

function renderLogHeaderRow(collapsed: boolean, onToggle: () => void) {
  const row = div("logHeaderRow");
  row.tabIndex = 0;

  const title = h2("로그");
  const chev = span("chev", collapsed ? "▸" : "▾");

  row.appendChild(title);
  row.appendChild(chev);

  row.onclick = () => onToggle();
  row.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return row;
}

export function initLogUiFromStorage() {
  try {
    const v = localStorage.getItem(LOG_COLLAPSED_KEY);
    if (v != null) logCollapsed = v === "1";
  } catch {}
}

function saveLogCollapsed() {
  try {
    localStorage.setItem(LOG_COLLAPSED_KEY, logCollapsed ? "1" : "0");
  } catch {}
}

export function toggleLogOverlay() {
  showLogOverlay = !showLogOverlay;
}

export function renderLogPanel(g: GameState, deps: { rerender: () => void }) {
  const logPanel = div("panel logPanel");
  logPanel.classList.toggle("collapsed", logCollapsed);

  logPanel.appendChild(
    renderLogHeaderRow(logCollapsed, () => {
      logCollapsed = !logCollapsed;
      saveLogCollapsed();
      deps.rerender();
    })
  );

  logPanel.classList.add("logScroll");

  if (!logCollapsed) {
    logPanel.appendChild(logBox((g.log ?? []).join("\n")));
  }

  return logPanel;
}

export function renderLogOverlay(g: GameState, deps: { onClose: () => void; mkButton: MkButton }) {
  document.querySelector(".logOverlay")?.remove();
  if (!showLogOverlay) return;

  const layer = div("logOverlay");
  layer.style.cssText =
    "position: fixed; inset: 0;" +
    "pointer-events:auto;" +
    "background: rgba(0,0,0,.55);" +
    "backdrop-filter: blur(calc(6 * var(--u)));" +
    "display: flex;" +
    "align-items: flex-end;" +
    "justify-content: center;";

  const sheet = div("panel");
  sheet.style.cssText =
    "width: min(calc(720 * var(--u)), 100%);" +
    "max-height: 70vh;" +
    "border-radius: calc(18 * var(--u)) calc(18 * var(--u)) 0 0;" +
    "padding: calc(12 * var(--u));" +
    "margin: 0;";

  const header = div("panelHeader");
  const title = h2("로그");
  header.appendChild(title);

  header.appendChild(deps.mkButton("닫기", () => deps.onClose()));
  sheet.appendChild(header);

  const pre = el("pre", "log", (g.log ?? []).join("\n"));
  pre.style.maxHeight = "60vh";
  pre.style.overflow = "auto";
  requestAnimationFrame(() => {
    pre.scrollTop = pre.scrollHeight;
  });
  sheet.appendChild(pre);

  layer.onclick = () => deps.onClose();
  sheet.onclick = (e) => e.stopPropagation();

  layer.appendChild(sheet);
  document.body.appendChild(layer);
}
