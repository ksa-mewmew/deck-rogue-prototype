import type { GameState } from "../../engine/types";
import { ensureFaith } from "../../engine/faith";
import { unitLenDev, wireFaithBadgeHover } from "../assets";

export function ensureFloatingNewRunButton(getHandler: () => (() => void) | null) {
  if (document.querySelector(".floatingNewRun")) return;

  const btn = document.createElement("button");
  btn.className = "floatingNewRun";
  btn.type = "button";
  btn.textContent = "";

  const label = document.createElement("span");
  label.className = "floatingNewRunLabel";
  label.textContent = "새로운 런";
  btn.appendChild(label);

  btn.style.cssText = `
    position: fixed;
    top: calc(env(safe-area-inset-top, 0) + calc(10 * var(--u)));
    left: calc(env(safe-area-inset-left, 0) + calc(10 * var(--u)));
    pointer-events: auto;
    z-index: calc(var(--zChrome) + 10000);

    display: flex;
    align-items: center;
    gap: calc(10 * var(--u));

    padding: calc(10 * var(--u)) calc(12 * var(--u));
    border-radius: calc(14 * var(--u));
    border: calc(1 * var(--u)) solid rgba(255,255,255,.16);
    background: rgba(0,0,0,.55);
    color: #fff;

    backdrop-filter: blur(calc(8 * var(--u)));
    -webkit-backdrop-filter: blur(calc(8 * var(--u)));
    cursor: pointer;
    touch-action: manipulation;
  `;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    getHandler()?.();
  });

  document.body.appendChild(btn);
}

export function ensureFloatingFaithBadge(getG: () => GameState | null) {
  if (document.querySelector(".floatingFaithBadge")) return;
  const badge = document.createElement("div");
  badge.className = "floatingFaithBadge";
  badge.textContent = "";
  badge.style.right = "auto";
  badge.style.bottom = "auto";
  wireFaithBadgeHover(badge, () => getG() as any);
  document.body.appendChild(badge);
}

export function updateFloatingFaithScore(g: GameState) {
  const badge = document.querySelector<HTMLElement>(".floatingFaithBadge");
  const btn = document.querySelector<HTMLElement>(".floatingNewRun");
  if (!badge || !btn) return;
  const f = ensureFaith(g);
  const a = f.points[f.offered[0]] ?? 0;
  const b = f.points[f.offered[1]] ?? 0;
  const c = f.points[f.offered[2]] ?? 0;

  const u = unitLenDev();

  const r = btn.getBoundingClientRect();
  badge.style.left = `${Math.round(r.right + 8 * u)}px`;
  badge.style.top = `${Math.round(r.top)}px`;
  badge.style.right = "auto";
  badge.textContent = `신앙 ${a}·${b}·${c}`;
}

export function renderPhaseBanner(phaseBannerText: string | null, phaseBannerUntil: number) {
  document.querySelector(".phaseBanner")?.remove();
  const now = performance.now();
  if (!phaseBannerText || now > phaseBannerUntil) return;

  const el = document.createElement("div");
  el.className = "phaseBanner";
  el.textContent = phaseBannerText;
  document.body.appendChild(el);
}
