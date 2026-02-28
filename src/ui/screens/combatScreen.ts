import type { GameState } from "../../engine/types";
import { isTargeting } from "../../engine/combat";
import { displayCardTextPair, displayCardNameForUid } from "../../engine/cardText";
import { lenFromDev, unitLenDev } from "../assets";
import { div, divText, chipEl } from "../dom";
import { getUiSettings } from "../settings/uiSettings";
import { renderSlotsGrid } from "../slots";
import { cardHoverApi } from "../interaction/cardPreview";
import { getHoverSlot, beginDrag, enableHorizontalWheelScroll } from "../interaction/bindings";
import { computeNextStep, setEnterAction } from "../flow/nextStep";

export type RenderCardFn = (
  g: GameState,
  cardUid: string,
  clickable?: boolean,
  onClick?: (uid: string) => void,
  opt?: any
) => HTMLElement;

export type CombatScreenDeps = {
  renderCard: RenderCardFn;
  getCardDefByUid: (g: GameState, uid: string) => any;
  renderNodeSelect: (root: HTMLElement, g: GameState, actions: any) => void;
  overlayOpen: boolean;
};

function cardDisplayNameByUid(g: GameState, uid: string) {
  return displayCardNameForUid(g, uid);
}

function getTargetHintText(g: GameState): string | null {
  if (!isTargeting(g)) return null;
  if ((g as any).selectedEnemyIndex != null) return null;

  const pt = ((g as any).pendingTarget as any) ?? null;
  const fromCard = pt?.sourceCardUid ? cardDisplayNameByUid(g, pt.sourceCardUid) : null;
  const fromLabel = pt?.sourceLabel ?? null;
  const reason = pt?.reason ?? null;

  const head =
    fromCard ? `대상 선택 (${fromCard})`
    : fromLabel ? `대상 선택 (${fromLabel})`
    : `대상 선택 필요`;

  const reasonLabel =
    reason === "FRONT" ? "전열"
    : reason === "BACK" ? "후열"
    : reason === "EVENT" ? "이벤트"
    : reason === "RELIC" ? "유물"
    : null;

  const tail = reasonLabel ? ` - ${reasonLabel}` : "";

  const qn = (g as any).pendingTargetQueue?.length ?? 0;
  const remaining = (((g as any).pendingTarget ? 1 : 0) + qn) as number;
  const idxInfo = remaining > 1 ? ` (남은 ${remaining}개)` : ` (남은 1개)`;

  return `${head}${tail}${idxInfo}`;
}

export function renderBattleTitleRow(g: GameState) {
  const row = div("battleTitleRow");
  (row as any).style.display = "flex";
  (row as any).style.alignItems = "center";
  (row as any).style.gap = "calc(12 * var(--u))";

  const title = document.createElement("h2");
  title.textContent = "";
  row.appendChild(title);

  const hintText = getTargetHintText(g);

  const warn = divText("targetHintInline", "");
  warn.style.cssText =
    "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(0,0,0,.55);" +
    "background: rgb(255, 0, 0);" +
    "opacity:1;" +
    "font-weight:700; font-size:calc(16 * var(--u)); line-height:1.25;" +
    "white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" +
    "width: min(calc(320 * var(--u)), 92vw);" +
    "max-width: none;" +
    "pointer-events:auto;";

  if (hintText) {
    warn.textContent = hintText;
    warn.style.visibility = "visible";
    warn.style.pointerEvents = "auto";
  } else {
    warn.textContent = "대상 선택 필요";
    warn.style.visibility = "hidden";
    warn.style.pointerEvents = "none";
  }

  const right = div("battleTitleRight");
  right.style.cssText =
    "margin-left:auto;" +
    "display:flex; align-items:center; gap:calc(10 * var(--u));" +
    "flex: 0 0 auto;" +
    "white-space:nowrap;" +
    "position:relative;";

  const res = div("resourceRow inline");
  res.appendChild(chipEl(``));
  res.appendChild(chipEl(``));
  res.appendChild(chipEl(``));
  right.appendChild(res);

  warn.style.position = "absolute";
  warn.style.right = "calc(207 * var(--u))";
  warn.style.top = "calc(100% - calc(34 * var(--u)))";
  warn.style.marginTop = "0";
  warn.style.zIndex = "5";
  warn.style.pointerEvents = hintText ? "auto" : "none";
  row.appendChild(warn);

  row.appendChild(right);

  return row;
}

function buildResourceTopText(g: GameState): string {
  const bonusS = Number(((g as any).run as any).nextBattleSuppliesBonus ?? 0) || 0;
  const gold = Number(((g as any).run as any).gold ?? 0) || 0;

  const parts: string[] = [];
  parts.push(`🪙 G ${gold}`);

  if (bonusS !== 0) {
    const sign = bonusS > 0 ? `+${bonusS}` : `${bonusS}`;
    parts.push(`다음 전투 🍞 ${sign}`);
  }

  return parts.join(" | ");
}

function buildResourceBottomText(g: GameState): string {
  const runAny = (g as any).run as any;
  const timeMove = Number(runAny.timeMove ?? 0) || 0;
  const timeAct = Number((g as any).time ?? 0) || 0;
  const timeTotal = timeMove + timeAct;

  const parts: string[] = [];
  parts.push(`⏳ 총 ${timeTotal}`);
  parts.push(`🃏 덱 ${(g as any).deck?.length ?? 0}`);
  parts.push(`💤 F ${(g as any).player?.fatigue ?? 0}`);

  return parts.join(" | ");
}

export function renderStageCornerResourceHud(g: GameState) {
  const anchor = document.querySelector<HTMLElement>(".stageInner");
  if (!anchor) return;

  document.querySelector(".stageCornerHud")?.remove();

  const hud = document.createElement("div");
  hud.className = "stageCornerHud";

  const top = document.createElement("div");
  top.className = "stageCornerHudTop";
  top.textContent = buildResourceTopText(g);

  const bottom = document.createElement("div");
  bottom.className = "stageCornerHudBottom";
  bottom.textContent = buildResourceBottomText(g);

  hud.appendChild(top);
  hud.appendChild(bottom);

  document.body.appendChild(hud);

  const r = anchor.getBoundingClientRect();
  const u = unitLenDev();
  const padTopU = -56;
  const padTop = padTopU * u;
  const centerX = (r.left + r.right) / 2;

  hud.style.right = "";
  hud.style.left = lenFromDev(Math.round(centerX));
  hud.style.top = lenFromDev(Math.round(r.top + padTop));

  hud.style.transform = "translateX(-50%)";
}

export function renderCombat(root: HTMLElement, g: GameState, actions: any, deps: CombatScreenDeps) {
  const wrap = div("combatRoot");
  const board = div("boardArea");

  const inCombat = !(g as any).run?.finished && (g as any).enemies?.length > 0 && (g as any).phase !== "NODE";
  board.classList.toggle("slabOn", inCombat);

  const mobilePortrait = document.body.classList.contains("mobile") && document.body.classList.contains("portrait");
  if (mobilePortrait) {
    board.appendChild(renderBattleTitleRow(g));
  }

  if (mobilePortrait && (g as any).phase === "NODE") {
    deps.renderNodeSelect(board, g, actions);
    wrap.appendChild(board);
    root.appendChild(wrap);
    return;
  }

  const slotsWrap = div("boardSlotsWrap");

  slotsWrap.style.paddingTop = `calc(${6} * var(--u))`;

  const slotDeps = {
    uiSettings: getUiSettings(),
    cardHoverApi,
    hoverSlot: getHoverSlot(),
    renderCard: deps.renderCard,
    getCardDefByUid: deps.getCardDefByUid,
    isTargeting,
    beginDrag,
  };

  slotsWrap.appendChild(renderSlotsGrid(g as any, actions, "front", slotDeps as any));
  slotsWrap.appendChild(renderSlotsGrid(g as any, actions, "back", slotDeps as any));

  board.appendChild(slotsWrap);

  wrap.appendChild(board);
  root.appendChild(wrap);
}

export function renderHandDock(g: GameState, actions: any, targeting: boolean, deps: CombatScreenDeps) {
  const old = document.querySelector(".handDock");
  if (old) old.remove();
  document.querySelectorAll(".mobileHandScrollBtn").forEach((el) => el.remove());

  const inCombat = !(g as any).run?.finished && (g as any).enemies?.length > 0 && (g as any).phase !== "NODE";

  document.querySelector(".combatControls")?.remove();

  const dock = div("handDock");

  const step = computeNextStep(g as any, actions, targeting, deps.overlayOpen);

  if (inCombat) {
    const controls = div("combatControls");

    const nextTurnBtn = document.createElement("button");
    nextTurnBtn.textContent = "다음 턴";
    nextTurnBtn.className = "stepBtn primary";
    nextTurnBtn.disabled = (step as any).disabled || (g as any).phase === "NODE";
    nextTurnBtn.onclick = () => actions.onAutoAdvance();

    controls.appendChild(nextTurnBtn);

    document.body.appendChild(controls);

    const slot =
      document.querySelector<HTMLElement>(`.slot[data-slot-side="front"][data-slot-index="1"]`) ??
      document.querySelector<HTMLElement>(".stageInner");
    if (slot) {
      const r = slot.getBoundingClientRect();
      const centerX = r.left + r.width / 2;
      controls.style.left = lenFromDev(Math.round(centerX));
    }

    setEnterAction(() => actions.onAutoAdvance(), nextTurnBtn.disabled);
  } else {
    setEnterAction(null, true);
  }

  const hand = div("hand");
  (hand as any).style.touchAction = "pan-x";

  (hand as any).dataset.dropHand = "1";
  const row = div("handCardsRow");
  hand.appendChild(row);

  if (((g as any).hand?.length ?? 0) === 0) {
    const hint = div("handEmptyHint");
    hint.textContent = "";
    row.appendChild(hint);
  } else {
    for (const uid of (g as any).hand as string[]) {
      row.appendChild(
        deps.renderCard(g, uid, true, actions.onSelectHandCard, {
          draggable: true,
          hoverPreview: {
            root: document.body,
            api: cardHoverApi,
            buildDetail: (gg: GameState, u: string) => {
              const def = deps.getCardDefByUid(gg, u);
              const t = displayCardTextPair(gg, def.frontText, def.backText, u);
              return `전열: ${t.frontText}\n후열: ${t.backText}`;
            },
          },
        })
      );
    }
  }

  dock.appendChild(hand);
  document.body.appendChild(dock);

  enableHorizontalWheelScroll(hand);

  const isMobile = document.body.classList.contains("mobile");
  if (!isMobile) return;

  const getStep = () => {
    const firstCard = hand.querySelector<HTMLElement>(".card");
    if (firstCard) {
      const rowEl = hand.querySelector<HTMLElement>(".handCardsRow");
      const gapPx = rowEl ? parseFloat(getComputedStyle(rowEl).columnGap || "0") || 0 : 0;
      return Math.max(24, Math.round(firstCard.getBoundingClientRect().width + gapPx));
    }
    return Math.max(48, Math.round(hand.clientWidth * 0.6));
  };

  const makeBtn = (dir: "left" | "right") => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mobileHandScrollBtn mobileHandScrollBtn-${dir}`;
    btn.textContent = dir === "left" ? "◀" : "▶";
    btn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const step = getStep();
      const dx = dir === "left" ? -step : step;
      hand.scrollBy({ left: dx, behavior: "smooth" });
      window.setTimeout(syncBtnState, 120);
    };
    return btn;
  };

  const leftBtn = makeBtn("left");
  const rightBtn = makeBtn("right");
  document.body.appendChild(leftBtn);
  document.body.appendChild(rightBtn);

  const syncBtnState = () => {
    const maxScroll = Math.max(0, hand.scrollWidth - hand.clientWidth);
    if (maxScroll <= 1) {
      leftBtn.disabled = true;
      rightBtn.disabled = true;
      return;
    }
    leftBtn.disabled = hand.scrollLeft <= 1;
    rightBtn.disabled = hand.scrollLeft >= maxScroll - 1;
  };

  hand.addEventListener("scroll", syncBtnState, { passive: true });
  window.setTimeout(syncBtnState, 0);
}
