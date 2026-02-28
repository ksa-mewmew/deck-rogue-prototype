import { schedulePostLayout, normalizeEnemyNameWidth, alignHandToBoardAnchor, alignEnemyHudToViewportCenter } from "./layout/postLayout";
import { makeUIActionsImpl } from "./actions/makeUIActions";
import { getCurrentG, setCurrentG, getCurrentActions, setCurrentActions, getOverlayState, setOverlayState, getUiMounted, setUiMounted } from "./app/state";

export { createOrLoadGame } from "./session/createOrLoadGame";
export { ensureFloatingNewRunButton } from "./chrome/floating";
export { mountRoot } from "./app/mountRoot";

import { div, divText, badge, mkButton } from "./dom";

import { renderChoiceLayer as renderChoiceLayerSplit } from "./overlays/choice";
import { setDevConsoleCtx, renderDevConsole } from "./dev_console";
import type { GameState } from "../engine/types";
import { renderItemTray, renderRelicTray } from "./trays";
import { initLogUiFromStorage, renderLogPanel, renderLogOverlay, toggleLogOverlay } from "./overlays/log";
import { clearRelicHoverTooltip, openRelicModal, renderRelicHud, renderRelicModal } from "./overlays/relic";
import { renderOverlayLayer } from "./overlays/overlay";
import { isTargeting } from "../engine/combat";
import { displayCardText, displayCardNameForUid, displayCardNameWithUpgrade } from "../engine/cardText";
import { logMsg, } from "../engine/rules";
import { getCardDefByIdWithUpgrade } from "../content/cards";

import { renderCardWithCtx } from "./render/card";



import { setSOnlyHud } from "./s_only_hud";
import { mountRoot } from "./app/mountRoot";
import { plainTextFromRich, } from "./render/richText";
import { cardHoverApi, clearCardHoverPreview, suppressHover, isHoverSuppressed, getPinnedCardUid, setPinnedCardUid } from "./interaction/cardPreview";
import {
  ensureGlobalInputBound,
  renderDragOverlay,
  beginDrag,
  getDragPointerId,
  isDraggingNow as isDraggingNowSplit,
} from "./interaction/bindings";

import { createFloatFxRuntime, renderFloatFxLayer } from "./fx/floatFx";
import { createUiToastsRuntime, renderUiToastLayer } from "./fx/toasts";
import { createDeltasFx } from "./fx/deltas";
import { scheduleAutosave } from "./session/autosave";
import { renderTopHud, renderTopRightChrome } from "./chrome/topHud";
import { ensureFloatingNewRunButton, ensureFloatingFaithBadge, updateFloatingFaithScore, renderPhaseBanner } from "./chrome/floating";
import { reloadUiSettings, applyUiScaleVars, renderSettingsPanel, animMulNow, animMs, getUiScaleNow } from "./settings/uiSettings";


import { getLastEnter } from "./flow/nextStep";
import type { CombatScreenDeps } from "./screens/combatScreen";
import {
  renderCombat as renderCombatScreen,
  renderHandDock as renderHandDockScreen,
  renderStageCornerResourceHud as renderStageCornerResourceHudScreen,
} from "./screens/combatScreen";
import { renderNodeSelect as renderNodeSelectScreen } from "./screens/nodeSelectScreen";

const floatFxRt = createFloatFxRuntime();
const uiToastsRt = createUiToastsRuntime();
const deltasFx = createDeltasFx(floatFxRt, animMs);


let floatingNewRunHandler: null | (() => void) = null;
let phaseBannerText: string | null = null;
let phaseBannerUntil = 0;


let frameImgsPromise: Promise<any> | null = null;
let frameCanvas: HTMLCanvasElement | null = null;
let lastMainPanelScrollTop = 0;
let lastMainPanelScrollLeft = 0;

function ensureBgLayer() {
}

function drawFramesOnPanels(_imgs: any) {
}


function getCardDefByUid(g: GameState, uid: string) {
  const c = g.cards[uid];
  return getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);
}


function baseCardName(g: GameState, defId: string) {
  const base = g.content.cardsById[defId];
  return base?.name ?? defId;
}

function cardDisplayNameByDefId(g: GameState, defId: string, upgrade: number) {
  const u = upgrade ?? 0;
  const baseName = g.content.cardsById[defId]?.name ?? defId;
  return u > 0 ? `${baseName} +${u}` : baseName;
}

function cardDisplayNameByUid(g: GameState, uid: string) {
  return displayCardNameForUid(g, uid);
}


type CardRenderMode = "FULL" | "SLOT_NAME_ONLY";

type CardHoverPreviewPayload = {
  title: string;
  detail: string;
  cardEl?: HTMLElement;
};

type CardHoverPreviewApi = {
  ensure(root: HTMLElement): void;
  show(p: CardHoverPreviewPayload): void;
  hide(): void;
  pin?(): void;
  unpin?(): void;
  isPinned?(): boolean;
};

type RenderCardOpt = {
  draggable?: boolean;
  mode?: CardRenderMode;
  hoverPreview?: {
    root: HTMLElement;
    api: CardHoverPreviewApi;
    buildDetail?: (g: GameState, cardUid: string) => string;
  };
};

export function isDraggingNow(): boolean {
  return isDraggingNowSplit();
}

function renderCard(
  g: GameState,
  cardUid: string,
  clickable = false,
  onClick?: (uid: string) => void,
  opt?: RenderCardOpt
) {
  return renderCardWithCtx(getRenderCardCtx(), g, cardUid, clickable, onClick as any, opt as any);
}

function getRenderCardCtx() {
  return {
    div,
    divText,
    badge,
    displayNameForUid,
    isTargeting,
    isDraggingNow,
    beginDrag: (ev: PointerEvent, src: any) => beginDrag(ev as any, src as any),
    getDragPointerId: () => getDragPointerId(),
    isHoverSuppressed: () => isHoverSuppressed(),
    suppressHover,
    isMobile: () => document.body.classList.contains("mobile"),
    getPinnedCardUid: () => getPinnedCardUid(),
    setPinnedCardUid: (uid: string | null) => { setPinnedCardUid(uid); },
    clearCardHoverPreview,
  };
}


function hasNextUpgradeForDef(g: GameState, defId: string, upgrade: number) {
  const base: any = (g.content as any)?.cardsById?.[defId];
  const ups: any[] | undefined = base?.upgrades;
  const u = Number(upgrade ?? 0) || 0;
  return !!ups && ups.length > u;
}

function buildUpgradePreviewDetailByDef(g: GameState, defId: string, upgrade: number) {
  const u = Number(upgrade ?? 0) || 0;
  const cur: any = getCardDefByIdWithUpgrade(g.content, defId, u);
  const nxt: any = getCardDefByIdWithUpgrade(g.content, defId, u + 1);

  const cf = plainTextFromRich(displayCardText(g, cur?.frontText ?? ""));
  const cb = plainTextFromRich(displayCardText(g, cur?.backText ?? ""));
  const nf = plainTextFromRich(displayCardText(g, nxt?.frontText ?? ""));
  const nb = plainTextFromRich(displayCardText(g, nxt?.backText ?? ""));

  return (
    `현재: 전열 ${cf || "없음"} / 후열 ${cb || "없음"}
` +
    `강화: 전열 ${nf || "없음"} / 후열 ${nb || "없음"}`
  );
}

function showUpgradeHoverPreviewByDef(g: GameState, defId: string, upgrade: number) {
  if (!hasNextUpgradeForDef(g, defId, upgrade)) return;

  cardHoverApi.ensure(document.body);

  const baseName = (g.content as any)?.cardsById?.[defId]?.name ?? defId;
  const u = Number(upgrade ?? 0) || 0;
  const nextUp = u + 1;

  const title = `${formatName(g, baseName, nextUp)} (강화 미리보기)`;
  const detail = buildUpgradePreviewDetailByDef(g, defId, u);

  const big = renderCardPreviewByDef(g, defId, nextUp);
  big.classList.add("isPreviewCard");

  const pv = document.querySelector<HTMLElement>(".cardHoverPreview");
  if (pv) pv.classList.remove("previewAtBattlefield");

  cardHoverApi.show({ title, detail, cardEl: big });
}

function showUpgradeHoverPreviewByDefAtBattlefield(g: GameState, defId: string, upgrade: number) {
  if (!hasNextUpgradeForDef(g, defId, upgrade)) return;

  cardHoverApi.ensure(document.body);

  const baseName = (g.content as any)?.cardsById?.[defId]?.name ?? defId;
  const u = Number(upgrade ?? 0) || 0;
  const nextUp = u + 1;

  const title = `${formatName(g, baseName, nextUp)} (강화 미리보기)`;
  const detail = buildUpgradePreviewDetailByDef(g, defId, u);

  const big = renderCardPreviewByDef(g, defId, nextUp);
  big.classList.add("isPreviewCard");

  const pv = document.querySelector<HTMLElement>(".cardHoverPreview");
  if (pv) pv.classList.add("previewAtBattlefield");

  cardHoverApi.show({ title, detail, cardEl: big });
}

function wireUpgradeHoverPreviewForChoice(el: HTMLElement, g: GameState, defId: string, upgrade: number) {
  const u = Number(upgrade ?? 0) || 0;
  if (u !== 0) return;
  if (!hasNextUpgradeForDef(g, defId, 0)) return;
  const showAtBattlefield = !!el.closest(".choice-rewardCardRow");

  el.addEventListener("pointerenter", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "mouse") return;
    if (isHoverSuppressed()) return;
    if (isDraggingNow()) return;
    if (showAtBattlefield) showUpgradeHoverPreviewByDefAtBattlefield(g, defId, 0);
    else showUpgradeHoverPreviewByDef(g, defId, 0);
  });
  el.addEventListener("pointerleave", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "mouse") return;
    cardHoverApi.hide();
  });

  let holdTimer: number | null = null;
  let holdStartX = 0;
  let holdStartY = 0;
  let consumeClick = false;

  const clearHold = () => {
    if (holdTimer != null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  el.addEventListener("pointerdown", (ev) => {
    const pe = ev as PointerEvent;
    suppressHover(250);
    clearCardHoverPreview();
    cardHoverApi.hide();

    if (pe.pointerType !== "touch") return;

    consumeClick = false;
    holdStartX = pe.clientX;
    holdStartY = pe.clientY;

    clearHold();
    holdTimer = window.setTimeout(() => {
      consumeClick = true;
      if (showAtBattlefield) showUpgradeHoverPreviewByDefAtBattlefield(g, defId, 0);
      else showUpgradeHoverPreviewByDef(g, defId, 0);
    }, 320);
  }, { capture: true, passive: true });

  el.addEventListener("pointermove", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;
    if (holdTimer == null) return;
    const dx = pe.clientX - holdStartX;
    const dy = pe.clientY - holdStartY;
    if (dx * dx + dy * dy > 12 * 12) clearHold();
  }, { passive: true });

  const endTouch = () => {
    clearHold();
    cardHoverApi.hide();
  };

  el.addEventListener("pointerup", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;
    endTouch();
  }, { passive: true });

  el.addEventListener("pointercancel", (ev) => {
    const pe = ev as PointerEvent;
    if (pe.pointerType !== "touch") return;
    endTouch();
  }, { passive: true });

  el.addEventListener("click", (ev) => {
    if (!consumeClick) return;
    consumeClick = false;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);
}

function h2(text: string) {
  const e = document.createElement("h2");
  e.textContent = text;
  return e;
}
function h3(text: string) {
  const e = document.createElement("h3");
  e.textContent = text;
  return e;
}
function p(text: string) {
  const e = document.createElement("p");
  e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void, disabled: boolean) {
  const b = document.createElement("button");
  b.textContent = label;
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}
function logBox(text: string) {
  const pre = document.createElement("pre");
  pre.className = "log";
  pre.textContent = text;
  return pre;
}

function formatName(g: GameState, baseName: string, upgrade: number | undefined) {
  return displayCardNameWithUpgrade(g, baseName, upgrade);
}

function displayNameForUid(g: GameState, uid: string) {
  return displayCardNameForUid(g, uid);
}

function displayNameForOffer(g: GameState, offer: { defId: any; upgrade: number }) {
  const base = g.content.cardsById[offer.defId].name;
  return formatName(g, base, offer.upgrade);
}


export type UIActions = ReturnType<typeof makeUIActions>;

export function makeUIActions(g0: GameState, setGame: (next: GameState) => void) {
  return makeUIActionsImpl(
    g0,
    setGame,
    (g, actions) => render(g, actions),
    {
      getOverlay: () => getOverlayState(),
      setOverlay: (o) => {
        setOverlayState(o);
      },
    }
  );
}


function clearAllHover() {
  clearCardHoverPreview();
  clearRelicHoverTooltip();

  document.querySelectorAll<HTMLElement>(".itemHoverTip").forEach((el) => {
    el.classList.remove("show");
    (el as any).innerHTML = "";
  });
}

function renderCardPreviewByUidWithUpgrade(g: GameState, uid: string, upgrade: number): HTMLElement {
  const c = g.cards[uid];
  return renderCardPreviewByDef(g, c.defId, upgrade);
}

function renderRealCardForOverlay(
  g: GameState,
  uid: string,
  onPick?: (uid: string) => void
): HTMLElement {
  const clickable = !!onPick;
  const el = renderCard(g, uid, clickable, onPick, { draggable: false });
  el.classList.add("overlayCard");
  return el;
}

function renderCardPreviewByDef(g: GameState, defId: string, upgrade: number): HTMLElement {

  const tmpUid = `__preview:${defId}:${upgrade}:${Math.random().toString(36).slice(2)}`;

  const prev = g.cards[tmpUid];


  g.cards[tmpUid] = {
    uid: tmpUid,
    defId,
    upgrade,
    zone: "preview",
  } as any;


  const el = renderCard(g, tmpUid, false, undefined, { draggable: false }) as HTMLElement;

  el.classList.add("overlayCard");
  el.draggable = false;
  el.style.pointerEvents = "none";


  if (prev) g.cards[tmpUid] = prev;
  else delete (g.cards as any)[tmpUid];

  return el;
}

function hr() {
  return document.createElement("hr");
}



function normalizePlacementCounters(g: GameState) {
  const placed = (g.placedUidsThisTurn ?? []).filter((uid) => {
    const inst = g.cards[uid];
    return !!inst && (inst.zone === "front" || inst.zone === "back");
  });

  g.usedThisTurn = placed.length;

  let frontPlaced = 0;
  for (const uid of placed) {
    if (g.cards[uid]?.zone === "front") frontPlaced += 1;
  }
  g.frontPlacedThisTurn = frontPlaced;
}
function isMobilePortraitUi() {
  const b = document.body;
  return !!b && b.classList.contains("mobile") && b.classList.contains("portrait");
}


export function render(g: GameState, actions: UIActions) {

  if (!(render as any)._uiScaleInitDone) {
    (render as any)._uiScaleInitDone = true;
    reloadUiSettings();
    applyUiScaleVars();
    window.dispatchEvent(new CustomEvent("deckrogue:uiFit"));
  }
  setCurrentG(g);
  setCurrentActions(actions);
  clearAllHover();

  setDevConsoleCtx({
    getG: () => getCurrentG() ?? g,
    actions: { onNewRun: () => actions.onNewRun() },
    rerender: () => render(getCurrentG() ?? g, actions),
    log: (msg) => logMsg((getCurrentG() ?? g), msg),
  });


  renderDevConsole();

  floatingNewRunHandler = () => actions.onNewRun();
  ensureFloatingNewRunButton(() => floatingNewRunHandler);
  ensureFloatingFaithBadge(() => getCurrentG());
  updateFloatingFaithScore(g);
  ensureBgLayer();

  if (!(render as any)._logInitDone) {
    (render as any)._logInitDone = true;
    initLogUiFromStorage();
  }


  const prevMain = document.querySelector<HTMLElement>(".mainPanel");
  if (prevMain) {
    lastMainPanelScrollTop = prevMain.scrollTop;
    lastMainPanelScrollLeft = prevMain.scrollLeft;
  }

  const app = mountRoot();

  if (!getUiMounted()) {
    window.addEventListener("resize", () => {
      if (!frameImgsPromise) return;
      frameImgsPromise.then((imgs) => drawFramesOnPanels(imgs));
      const currentG = getCurrentG();
      if (currentG){
        normalizeEnemyNameWidth();
        alignHandToBoardAnchor(currentG);
        alignEnemyHudToViewportCenter();
        applyUiScaleVars();
      }
    });
    ensureGlobalInputBound({
      getG: () => getCurrentG() ?? g,
      getActions: () => getCurrentActions<UIActions>() ?? actions,
      getOverlay: () => getOverlayState(),
      normalizePlacementCounters,
      cardDisplayNameByUid,
      renderAll: (gg) => render(gg, getCurrentActions<UIActions>() ?? actions),
      clearAllHover,
      getLastEnter,
    });
    setUiMounted(true);
  }

  app.appendChild(renderTopHud(g, actions));

  renderTopRightChrome(g, actions);

  const mainRow = div("mainRow");

  const stage = div("stage");
  const stageInner = div("stageInner");
  const main = div("panel mainPanel");

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  main.classList.toggle("inCombat", inCombat);

  main.scrollTop = lastMainPanelScrollTop;
  main.scrollLeft = lastMainPanelScrollLeft;

  const combatDeps: CombatScreenDeps = {
    renderCard,
    getCardDefByUid,
    renderNodeSelect: renderNodeSelectScreen,
    overlayOpen: !!getOverlayState(),
  };


  if (!isMobilePortraitUi()) main.appendChild(renderBattleTitleRow(g));

  if (g.run.finished) main.appendChild(p("런 종료. 새로운 런을 원하시면 버튼을 누르거나 키보드 P를 입력하십시오."));
  else if (g.phase === "NODE" && !isMobilePortraitUi()) renderNodeSelectScreen(main, g, actions);
  else renderCombatScreen(main, g, actions, combatDeps);

  stageInner.appendChild(main);
  stage.appendChild(stageInner);

  const logPanel = renderLogPanel(g, { rerender: () => render(getCurrentG() ?? g, actions) });

  mainRow.appendChild(stage);
  mainRow.appendChild(logPanel);

  app.appendChild(mainRow);



  normalizeEnemyNameWidth();
  renderStageCornerResourceHudScreen(g);
  renderHandDockScreen(g, actions, isTargeting(g), combatDeps);
  alignHandToBoardAnchor(g);
  alignEnemyHudToViewportCenter();
  renderDragOverlay(app, g);

  renderOverlayLayer(g, getOverlayState()    , {
    ...actions,
    onCloseOverlay: () => {
      setOverlayState(null);
      render(getCurrentG() ?? g, actions);
    },
  }, {
    renderSettingsPanel: (onChange, a) => renderSettingsPanel(onChange, a),
    onAfterSettingsChange: () => {
      const currentG = getCurrentG();
      if (currentG) {
        normalizeEnemyNameWidth();
        alignHandToBoardAnchor(currentG);
        alignEnemyHudToViewportCenter();
        applyUiScaleVars();
      }
      actions.rerender();
    },
    renderRealCardForOverlay,
    getCardDefByUid,
    displayNameForUid,
  });
  renderChoiceLayerSplit(g, actions, {
    renderCard,
    renderCardPreviewByDef,
    renderCardPreviewByUidWithUpgrade,
    renderRealCardForOverlay,
    wireUpgradeHoverPreviewForChoice,
  });
  renderLogOverlay(g, { onClose: () => actions.onToggleLogOverlay(), mkButton });

  renderItemTray(g, {
    onUseItem: actions.onUseItem,
    onDiscardItem: actions.onDiscardItem,
    overlayOpen: !!getOverlayState(),
  });

  renderRelicTray(g, {
    onOpenRelicModal: (id) => {
      openRelicModal(id);
      actions.rerender();
    },
  });
  renderRelicModal(g, { rerender: actions.rerender });

  deltasFx.tick(g);
  renderPhaseBanner(phaseBannerText, phaseBannerUntil);
  renderFloatFxLayer(floatFxRt, animMs);
  renderUiToastLayer(g, uiToastsRt, animMulNow);
  renderRelicHud(g, { rerender: actions.rerender });
  scheduleAutosave(g);
  schedulePostLayout(g);

  setSOnlyHud(getSValueFromGame(g));
}

function getSValueFromGame(g: any): number | null {
  const s = g.player.supplies

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  if (!inCombat) return null;
  return (typeof s === "number") ? s : null;
}




function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}


function buildResourceTopText(g: GameState): string {
  const bonusS = Number((g.run as any).nextBattleSuppliesBonus ?? 0) || 0;
  const gold = Number((g.run as any).gold ?? 0) || 0;

  const parts: string[] = [];
  parts.push(`🪙 G ${gold}`);

  if (bonusS !== 0) {
    const sign = bonusS > 0 ? `+${bonusS}` : `${bonusS}`;
    parts.push(`다음 전투 🍞 ${sign}`);
  }

  return parts.join(" | ");
}

function buildResourceBottomText(g: GameState): string {
  const inCombat = g.enemies.length > 0 && g.phase !== "NODE";

  const runAny = g.run as any;
  const timeMove = Number(runAny.timeMove ?? 0) || 0;
  const timeAct = Number(g.time ?? 0) || 0;
  const timeTotal = timeMove + timeAct;

  const parts: string[] = [];
  parts.push(`⏳ 총 ${timeTotal}`);
  parts.push(`🃏 덱 ${g.deck.length}`);
  parts.push(`💤 F ${g.player.fatigue}`);

  return parts.join(" | ");
}


function chipEl(text: string, extraClass = "") {
  const s = document.createElement("span");
  s.className = "chip" + (extraClass ? ` ${extraClass}` : "");
  s.textContent = text;
  return s;
}


function renderBattleTitleRow(g: GameState) {
  const row = div("battleTitleRow");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "calc(12 * var(--u))";

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

function getTargetHintText(g: GameState): string | null {
  if (!isTargeting(g)) return null;
  if ((g as any).selectedEnemyIndex != null) return null;

  const pt = (g.pendingTarget as any) ?? null;
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

  const qn = g.pendingTargetQueue?.length ?? 0;
  const remaining = (g.pendingTarget ? 1 : 0) + qn;
  const idxInfo = remaining > 1 ? ` (남은 ${remaining}개)` : ` (남은 1개)`;

  return `${head}${tail}${idxInfo}`;
}