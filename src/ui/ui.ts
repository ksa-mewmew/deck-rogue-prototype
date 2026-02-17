/* =========================================================
   ui.ts — REORDERED BY INTENT (no logic changes)
   - Only moved declarations (functions / globals)
   - Added section dividers for navigation
   ========================================================= */

/* =========================
   IMPORTS
   ========================= */

import { setDevConsoleCtx, renderDevConsole, toggleDevConsole, isDevConsoleOpen } from "./dev_console";
import { drawNineSlice } from "./nineslice";
import type { GameState, PileKind, NodeOffer, Side, IntentCategory, IntentPreview } from "../engine/types";
import {
  spawnEncounter,
  startCombat,
  placeCard,
  revealIntentsAndDisrupt,
  resolveTargetSelection,
  resolveBack,
  resolveFront,
  resolveEnemy,
  upkeepEndTurn,
  drawStepStartNextTurn,
  isTargeting,
  currentTotalDeckLikeSize,
  escapeRequiredNodePicks,
} from "../engine/combat";
import { logMsg, rollBranchOffer, advanceBranchOffer, madnessP, } from "../engine/rules";
import { createInitialState } from "../engine/state";

import { applyChoiceKey } from "../engine/choiceApply";
import type { EventOutcome } from "../content/events";
import { pickEventByMadness, getEventById } from "../content/events";
import { removeCardByUid, addCardToDeck, offerRewardsByFatigue, canUpgradeUid, upgradeCardByUid, obtainTreasure } from "../content/rewards";
import { getCardDefByIdWithUpgrade } from "../content/cards";

import { saveGame, hasSave, loadGame, clearSave } from "../persist";

import { RELICS_BY_ID } from "../content/relicsContent";
import { getRelicDisplay } from "../engine/relics";


import { buildIntentPreview } from "../engine/intentPreview";

/* =========================
   STATIC TEXT / RULEBOOK COPY
   ========================= */

const RULEBOOK_TEXT = `# Deck Rogue Prototype — 룰북 (플레이어용)

이 문서는 스포일러를 최소화합니다.

[1] 개요
노드를 선택하며 진행하고, 전투에서 살아남아 성장합니다. 목표는 무엇일까요?
모든 카드는 전열과 후열이 있습니다. 배치에 따라 역할이 달라집니다.

[2] 보급과 피로도

보급(S): 전열 카드 및 일부 효과의 발동에 사용됩니다. 보통 7로 시작합니다.
보급이 부족한 상태로 턴 종료 시 피로도만큼 피해를 받습니다.

피로도(F): 덱을 섞거나 전열 카드의 보급이 부족한 채로 턴을 마칠 때 피로도가 1 올라가며, 일부 카드의 효과로도 변합니다.
피로도는 전투가 끝나도 유지됩니다. 너무 쌓인 피로는 때때로 당신을 변하게 합니다.

[3] 전투 흐름
배치 → 후열 발동 → 전열 발동 → 적 행동 → 정리 → 드로우
※ “대상 선택 필요”가 뜨면 살아있는 적을 클릭해 대상을 정하세요.
※ 후열 발동을 누르면 턴이 진행되어, 카드의 배치를 변경할 수 없습니다.
보급 및 그에 따른 변화는 정리 단계에서 처리합니다.

손패는 턴이 종료되어도 유지됩니다.
카드는 매 턴마다 사용한 만큼 뽑습니다. 즉, 카드로 인한 드로우는 패의 매수 자체를 늘리는 효과가 있습니다.

[4] 용어
- 소모: 이번 전투에서 사용할 수 없게 되는 것입니다.
- 소실: 런 전체에서 해당 카드가 사라지는 것입니다.
- 취약: 받는 피해가 (취약)만큼 증가합니다.
- 약화: 주는 피해가 (약화)만큼 감소합니다.
- 출혈: 턴 종료 시 (출혈)만큼 피해를 입습니다.
- 교란: 당신을 방해합니다. 무엇일까요?

[5] 조작

(컴퓨터)
- 4: 선택 해제
- Tab: 손패 선택 이동
- 1~3: 전열 배치 / q,w,e: 후열 배치
- 드래그: 손패→슬롯 배치, 슬롯↔슬롯 스왑, 슬롯→손패 회수
- Space: 다음 턴
- P: 새로운 런

(모바일)
- 손패: 클릭 시 선택, 길게 누를 시 확대
- 카드 선택 상태에서 슬롯을 눌러 배치
- 슬롯: 클릭 시 확대, 길게 누를 시 회수
- 슬롯에 넣은 카드는 이름만 보입니다.

[6] 당신을 위한 조언

덱은 당신의 비품입니다. 비품이 적으면, 늘 새로 꾸리느라 힘들 겁니다. 비품이 많으면, 들고 다니기 힘들겠지요. 균형을 찾으세요.

[7] 시간

시간은 금입니다. 모든 행동은 시간을 소모합니다. 싸움은 좀 더 소모할지도 모르겠군요.
중요한 건 이곳이 당신에게 넉넉한 시간을 주지 않는다는 것이겠지요.
`;

/* =========================
   UTILITIES — time + math
   ========================= */

function sleep(ms: number) {
  return new Promise<void>((res) => window.setTimeout(res, ms));
}
function tickMsForPhase(phase: GameState["phase"]) {
  switch (phase) {
    case "BACK":  return 100;
    case "FRONT": return 100;
    case "ENEMY": return 100;
    case "UPKEEP": return 100;
    case "DRAW":  return 100;
    case "PLACE": return 0;   // PLACE에서는 멈추도록
    default: return 220;
  }
}



/* =========================
   FLOATING FX — state + delta emission
   ========================= */

type FloatFx = {
  id: number;
  kind: "dmg" | "heal" | "block";
  text: string;
  x: number;
  y: number;
  born: number;
};

let postLayoutScheduled = false;

function scaleAllSlotCards() {
  document.querySelectorAll<HTMLElement>(".slot").forEach((slot) => {
    const scaler = slot.querySelector<HTMLElement>(".slotCardScaler");
    if (scaler) applySlotCardScale(slot, scaler);
  });
}

function schedulePostLayout(g: GameState) {
  if (postLayoutScheduled) return;
  postLayoutScheduled = true;
  requestAnimationFrame(() => {
    postLayoutScheduled = false;
    normalizeEnemyNameWidth();
    alignHandToBoardAnchor(g);
    alignEnemyHudToViewportCenter();
    scaleAllSlotCards();
  });
}

let fxIdSeq = 1;
let floatFx: FloatFx[] = [];

let floatingNewRunHandler: null | (() => void) = null;
let phaseBannerText: string | null = null;
let phaseBannerUntil = 0;


function pushFloatFx(kind: FloatFx["kind"], text: string, x: number, y: number) {
  floatFx.push({ id: fxIdSeq++, kind, text, x, y, born: performance.now() });
}

function cleanupFloatFx() {
  const now = performance.now();
  // floatUp 애니메이션 650ms 기준으로 컷
  floatFx = floatFx.filter((f) => now - f.born < 700);
}

let prevPlayerHp: number | null = null;
let prevPlayerBlock: number | null = null;
let prevEnemyHp: number[] = [];

function detectAndEmitDeltas(g: GameState) {
  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  if (!inCombat) {
    prevPlayerHp = null;
    prevPlayerBlock = null;
    prevEnemyHp = [];
    return;
  }

  // 플레이어
  if (prevPlayerHp != null) {
    const d = g.player.hp - prevPlayerHp;
    if (d !== 0) emitPlayerDelta(d);
  }
  if (prevPlayerBlock != null) {
    const d = g.player.block - prevPlayerBlock;
    if (d !== 0) emitPlayerBlockDelta(d);
  }

  // 적들
  for (let i = 0; i < g.enemies.length; i++) {
    const cur = g.enemies[i].hp;
    const prev = prevEnemyHp[i];
    if (prev != null && cur !== prev) emitEnemyDelta(i, cur - prev);
  }

  prevPlayerHp = g.player.hp;
  prevPlayerBlock = g.player.block;
  prevEnemyHp = g.enemies.map((e) => e.hp);
}

function emitPlayerDelta(dhp: number) {
  const box = document.querySelector<HTMLElement>(".playerHudBox") 
    ?? document.querySelector<HTMLElement>(".playerHudLeft");
  if (!box) return;
  const r = box.getBoundingClientRect();
  const x = (r.left + r.right) / 2;
  const y = r.top + 14;

  if (dhp < 0) pushFloatFx("dmg", `${dhp}`, x, y);
  else pushFloatFx("heal", `+${dhp}`, x, y);

  box.classList.add("fxFlash");
  setTimeout(() => box.classList.remove("fxFlash"), 240);
}

function emitPlayerBlockDelta(d: number) {
  const box = document.querySelector<HTMLElement>(".playerHudBox") 
    ?? document.querySelector<HTMLElement>(".playerHudLeft");
  if (!box) return;
  const r = box.getBoundingClientRect();
  const x = (r.left + r.right) / 2;
  const y = r.top + 34;

  pushFloatFx("block", (d > 0 ? `+${d}` : `${d}`), x, y);
}

function emitEnemyDelta(i: number, dhp: number) {
  const banners = Array.from(
    document.querySelectorAll<HTMLElement>(".enemyHudCenter .enemyBanner")
  );
  const el = banners[i];
  if (!el) return;

  const r = el.getBoundingClientRect();
  const x = (r.left + r.right) / 2;
  const y = r.top + 14;

  if (dhp < 0) pushFloatFx("dmg", `${dhp}`, x, y);
  else pushFloatFx("heal", `+${dhp}`, x, y);

  el.classList.add("fxFlash");
  setTimeout(() => el.classList.remove("fxFlash"), 240);
}



/* =========================
   UI SCALE — persisted settings + derived helpers
   ========================= */

// 스케일



type UiSettings = {
  uiScaleDesktop: number; // 0.8 ~ 1.4
  uiScaleMobile: number;  // 0.8 ~ 1.4
  slotCardMode: "FULL" | "NAME_ONLY";
};

const UISET_KEY = "deckrogue_uiSettings_v1";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function loadUiSettings(): UiSettings {
  try {
    const raw = localStorage.getItem(UISET_KEY);
    if (!raw) {
      return {
        uiScaleDesktop: 1.0,
        uiScaleMobile: 1.0,
        slotCardMode: "FULL",
      };
    }

    const j = JSON.parse(raw);

    const slotCardMode: UiSettings["slotCardMode"] =
      j.slotCardMode === "NAME_ONLY" ? "NAME_ONLY" : "FULL";

    return {
      uiScaleDesktop: clamp(Number(j.uiScaleDesktop ?? 1.0) || 1.0, 0.75, 1.5),
      uiScaleMobile:  clamp(Number(j.uiScaleMobile  ?? 1.0) || 1.0, 0.75, 1.5),
      slotCardMode,
    };
  } catch {
    return {
      uiScaleDesktop: 1.0,
      uiScaleMobile: 1.0,
      slotCardMode: "FULL",
    };
  }
}


let uiSettings: UiSettings = loadUiSettings();


function getUiScaleNow() {
  return isMobileUiNow() ? uiSettings.uiScaleMobile : uiSettings.uiScaleDesktop;
}
function sx(px: number) {
  return Math.round(px * getUiScaleNow());
}




/* =========================
   RESPONSIVE — mobile UI detection
   ========================= */

//모바일

function isMobileUiNow() {
  return window.matchMedia("(max-width: 900px) and (pointer: coarse)").matches;
}


let logCollapsed = false;



/* =========================
   LOG PANEL — persisted collapse state
   ========================= */

function loadLogCollapsed() {
  try {
    const v = localStorage.getItem("deckrogue_logCollapsed");
    if (v == null) return;
    logCollapsed = v === "1";
  } catch {}
}

function saveLogCollapsed() {
  try {
    localStorage.setItem("deckrogue_logCollapsed", logCollapsed ? "1" : "0");
  } catch {}
}

let saveTimer: number | null = null;

function scheduleSave(g: GameState) {
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveGame(g);
  }, 250);
}



/* =========================
   AUTO-ADVANCE — forced next / schedule
   ========================= */

type ForcedNext = null | "BOSS";

let autoAdvancing = false;

async function runAutoAdvanceRAF(g: GameState, actions: UIActions) {

  if ((g as any)._justStartedCombat) {
    (g as any)._justStartedCombat = false;
    return;
  }

  if (autoAdvancing) return;

  autoAdvancing = true;

  try {
    if (g.run.finished) return;
    if (g.choice) return;
    if (isTargeting(g)) return;
    if (overlay) return;
    if (g.phase === "NODE") return;

    let guard = 0;
    while (guard++ < 60) {
      if (g.run.finished) break;
      if (g.choice || overlay) break;
      if (isTargeting(g)) break;

      const step = computeNextStep(g, actions, /*targeting*/ false);
      if (!step.fn || step.disabled) break;

      // 현재 단계 기억
      const beforePhase = g.phase;

      step.fn();
      render(g, actions);

      if (g.phase === "PLACE") break;

      const ms = tickMsForPhase(beforePhase);
      if (ms > 0) await sleep(ms);
    }
  } finally {
    autoAdvancing = false;
  }
}

function ensureBossSchedule(g: GameState) {
  const runAny = g.run as any;
  if (runAny.nextBossTime == null) runAny.nextBossTime = 40; // 첫 보스 시간
  if (runAny.forcedNext == null) runAny.forcedNext = null as ForcedNext;
}

function totalTime(g: GameState) {
  return (g.run.nodePickCount ?? 0) + (g.time ?? 0);
}

function rollExtraTime01FromDeck(deckN: number) {
  const BASE = 20;
  const DIV = 3;
  const CAP = 85;
  const x = Math.max(0, deckN - BASE);
  const pPct = Math.min(CAP, Math.floor((x * x) / DIV));
  const extra = Math.random() * 100 < pPct ? 1 : 0;
  return { extra, pPct };
}

function hydrateLoadedState(loaded: any, content: any) {
  const g = loaded as any;

  g.content = content;

  g.time ??= 0;

  g.run.relics ??= [];

  g.run ??= {};
  g.run.nextBossTime ??= 40;
  g.run.forcedNext ??= null;
  g.run.bossOmenText ??= null;
  g.run.enemyLastSeenBattle ??= {};
  g.run.nodePickByType ??= { BATTLE: 0, ELITE: 0, REST: 0, EVENT: 0, TREASURE: 0 };
  g.run.bossPool ??= ["boss_gravity_master","boss_cursed_wall", "boss_giant_orc", "boss_soul_stealer"];
  g.run.nextBossId ??= null;

  g.run.afterTreasureNodePicks ??= 0;
  (g.run as any).deckSizeAtTreasure ??= null;

  if (g.run.treasureObtained && g.run.deckSizeAtTreasure == null) {
    g.run.deckSizeAtTreasure = currentTotalDeckLikeSize(g);
  }

  g.choiceStack ??= [];
  g.pendingTargetQueue ??= [];
  g.exhausted ??= [];
  g.vanished ??= [];
  g.choiceQueue ??= [];
  g.choiceCtx ??= null;

  return g;
}

export function createOrLoadGame(content: any) {
  if (!hasSave()) return createInitialState(content);

  const loaded = loadGame();
  if (!loaded) return createInitialState(content);

  return hydrateLoadedState(loaded.state, content);
}



let frameImgsPromise: Promise<any> | null = null;
let frameCanvas: HTMLCanvasElement | null = null;
let frameCtx: CanvasRenderingContext2D | null = null;

function ensureFrameCanvas(): CanvasRenderingContext2D {
  if (frameCanvas && frameCtx) return frameCtx;

  const c = document.createElement("canvas");
  c.className = "uiFrameCanvas";
  c.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
  `;
  document.body.appendChild(c);
  frameCanvas = c;
  frameCtx = c.getContext("2d")!;
  resizeFrameCanvasToViewport();
  return frameCtx;
}

function ensureBgLayer() {
  if (document.querySelector(".bgLayer")) return;

  const bg = document.createElement("div");
  bg.className = "bgLayer";
  document.body.appendChild(bg);
}


function resizeFrameCanvasToViewport() {
  if (!frameCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  frameCanvas.width = Math.floor(w * dpr);
  frameCanvas.height = Math.floor(h * dpr);
  frameCanvas.style.width = `${w}px`;
  frameCanvas.style.height = `${h}px`;

  frameCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawFramesOnPanels(imgs: any) {
  const ctx = ensureFrameCanvas();
  resizeFrameCanvasToViewport();


  const main = document.querySelector<HTMLElement>(".mainPanel");
  const log  = document.querySelector<HTMLElement>(".logPanel");

  if (!main || !log) {
    console.log("[frame] panels missing", { main: !!main, log: !!log });
    return;
  }


  const mr = main.getBoundingClientRect();
  const lr = log.getBoundingClientRect();

  const rects = [mr, lr];

  const border = {
    left: imgs.tl.naturalWidth,
    right: imgs.tr.naturalWidth,
    top: imgs.tl.naturalHeight,
    bottom: imgs.bl.naturalHeight,
  };

  const pad = 6;

  for (const r of rects) {
    drawNineSlice(
      ctx,
      imgs,
      Math.floor(r.left - pad),
      Math.floor(r.top - pad),
      Math.floor(r.width + pad * 2),
      Math.floor(r.height + pad * 2),
      border,
      {
        mode: "stretch",
        drawCenter: false,
        pixelated: true,
      }
    );
  }
}

let lastMainPanelScrollTop = 0;
let lastMainPanelScrollLeft = 0;
let currentG: GameState | null = null;






/* =========================
   CARDS HOVER
   ========================= */

// 카드 호버 닫기

let hoveredCardKey: string | null = null;
let suppressHoverUntil = 0;

function clearCardHoverPreview() {
  hoveredCardKey = null;
  try { cardHoverApi.hide(); } catch {}
  const pv = document.querySelector(".cardHoverPreview");
  if (pv) pv.classList.remove("on");
}

function suppressHover(ms = 250) {
  suppressHoverUntil = performance.now() + ms;
}

const cardHoverApi = createCardHoverPreviewApi();

function createCardHoverPreviewApi(): CardHoverPreviewApi {
  let panel: HTMLElement | null = null;
  let titleEl: HTMLElement | null = null;
  let cardHost: HTMLElement | null = null;
  let detailEl: HTMLElement | null = null;

  function ensure(root: HTMLElement) {
    if (panel) return;

    panel = div("cardHoverPreview");
    titleEl = div("cardHoverPreviewTitle");
    const row = div("cardHoverPreviewRow");
    cardHost = div("cardHoverPreviewCard");
    detailEl = div("cardHoverPreviewDetail");

    row.appendChild(cardHost);
    row.appendChild(detailEl);

    panel.appendChild(titleEl);
    panel.appendChild(row);

    root.appendChild(panel);
  }

  function show(p: CardHoverPreviewPayload) {
    if (!panel || !titleEl || !cardHost || !detailEl) return;

    titleEl.textContent = p.title;

    cardHost.innerHTML = "";
    if (p.cardEl) cardHost.appendChild(p.cardEl);

    detailEl.textContent = p.detail;

    panel.classList.add("on");
  }

  function hide() {
    if (!panel) return;
    panel.classList.remove("on");
  }

  return { ensure, show, hide };
}

/* =========================
   UI PRIMITIVES — DOM builders + small helpers
   ========================= */

// Helpers / UI primitives



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
  const c = g.cards[uid];
  return cardDisplayNameByDefId(g, c.defId, c.upgrade ?? 0);
}




/* =========================
   CARDS — render + layout
   ========================= */

// Cards

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

function renderCard(
  g: GameState,
  cardUid: string,
  clickable: boolean,
  onClick?: (uid: string) => void,
  opt?: RenderCardOpt
) {
  const c = g.cards[cardUid];
  const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);

  const draggable = opt?.draggable ?? true;
  const mode: CardRenderMode = opt?.mode ?? "FULL";

  const d = div("card");

  if (g.selectedHandCardUid === cardUid) d.classList.add("selected");
  if (def.tags?.includes("EXHAUST")) d.classList.add("exhaust");
  if (def.tags?.includes("VANISH")) d.classList.add("vanish");

  if (mode === "SLOT_NAME_ONLY") d.classList.add("slotNameOnly");

  // HEADER
  const header = div("cardHeader");
  const title = displayNameForUid(g, cardUid);
  header.appendChild(divText("cardTitle", title));

  if (mode === "FULL") {
    const meta = div("cardMeta");
    if (def.tags?.includes("EXHAUST")) meta.appendChild(badge("소모"));
    if (def.tags?.includes("VANISH")) meta.appendChild(badge("소실"));
    header.appendChild(meta);
  }

  d.appendChild(header);

  // BODY
  if (mode === "FULL") {
    const body = div("cardBody");

    const sec1 = div("cardSection");
    sec1.classList.add("front");
    sec1.appendChild(renderCardRichTextNode(def.frontText));
    body.appendChild(sec1);

    const sec2 = div("cardSection");
    sec2.classList.add("back");
    sec2.appendChild(renderCardRichTextNode(def.backText));
    body.appendChild(sec2);

    d.appendChild(body);
  } else {
    // SLOT_NAME_ONLY: 바디 자체를 만들지 않음
  }

  // 클릭
  if (clickable && onClick) d.onclick = () => onClick(cardUid);

  // 드래그
  if (clickable) {
    d.onpointerdown = (ev) => {
      if ((ev as any).button !== 0 && (ev as any).pointerType === "mouse") return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;
      if (!draggable) return;

      const idx = g.hand.indexOf(cardUid);
      beginDrag(ev as any, { kind: "hand", cardUid, fromHandIndex: idx });
    };
  }

// ===== hover 프리뷰 =====

  if (opt?.hoverPreview) {
    const { root, api, buildDetail } = opt.hoverPreview;

    api.ensure(root);

    const detailText =
      buildDetail?.(g, cardUid)
      ?? (() => {
        const f = plainTextFromRich(def.frontText);
        const b = plainTextFromRich(def.backText);
        return `전열: ${f || "없음"}\n후열: ${b || "없음"}`;
      })();

    d.addEventListener("pointerenter", (ev) => {
      if (performance.now() < suppressHoverUntil) return;
      if (drag?.dragging) return;

      const big = renderCard(g, cardUid, false, undefined, { draggable: false, mode: "FULL" });
      big.classList.add("isPreviewCard");

      api.show({ title, detail: detailText, cardEl: big });
    });

    d.addEventListener("pointerleave", () => {
      api.hide();
    });

    d.addEventListener("pointerdown", () => {
      suppressHover(250);
      clearCardHoverPreview();
    }, { capture: true });
  }

  return d;
}

function plainTextFromRich(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(plainTextFromRich).join("");
  if (typeof node === "object") {
    if (node.text) return String(node.text);
    if (node.children) return plainTextFromRich(node.children);
  }
  return "";
}



// Small UI primitives

function div(cls: string) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}
function divText(cls: string, text: string) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
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
function badge(text: string) {
  const s = document.createElement("span");
  s.className = "badge";
  s.textContent = text;
  return s;
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

function formatName(baseName: string, upgrade: number | undefined) {
  const u = upgrade ?? 0;
  return u > 0 ? `${baseName} +${u}` : baseName;
}

function displayNameForUid(g: GameState, uid: string) {
  const inst = g.cards[uid];
  const base = g.content.cardsById[inst.defId].name;
  return formatName(base, inst.upgrade);
}

function displayNameForOffer(g: GameState, offer: { defId: any; upgrade: number }) {
  const base = g.content.cardsById[offer.defId].name;
  return formatName(base, offer.upgrade);
}




/* =========================
   CARD RICH TEXT — keyword icons + inline markup
   ========================= */

const KW_ICON: Record<string, string> = {
  "취약": "🎯",
  "약화": "🥀",
  "출혈": "🩸",
  "교란": "🌀",
  "면역": "✨",
  "S": "🌾",
  "F": "💤",
  "드로우": "🃏",
  "피해": "🗡️",
  "회복": "💊",
  "방어": "🛡️",
  "블록": "🛡️",
  "소모": "🔥",
  "소실": "🕳️",
};

function badgeHtml(kw: string, n?: string, punc?: string) {
  const icon = KW_ICON[kw] ?? "";
  const label = n != null ? `${kw} ${n}` : kw;
  const tail = punc ? punc : "";
  return `<span class="kwBadge"><span class="kwIcon">${icon}</span> <span class="kwLabel">${label}</span><span class="kwPunc">${tail}</span></span>`;
}


const PUNC = "[,，、]";

const reNum  = new RegExp(`(취약|약화|출혈|교란|면역|S|F|드로우|피해|방어|블록|회복|소모|소실)\\s*([+-]?\\d+)\\s*(${PUNC})?`, "g");
const reBare = new RegExp(
  `(^|[^가-힣A-Za-z0-9_])(소모|소실)\\s*(${PUNC})?`,
  "g"
);

function renderCardRichText(text: string): string {
  let out = text.replace(reNum, (_m, kw, n, punc) => badgeHtml(kw, n, punc));

  out = out.replace(reBare, (_m, prefix, kw, punc) => {
    return `${prefix}${badgeHtml(kw, undefined, punc)}`;
  });

  out = out.replace(/\n/g, "<br>");
  return out;
}

function renderCardRichTextNode(text: string): HTMLElement {
  const el = div("cardText");
  el.innerHTML = renderCardRichText(text);
  return el;
}

function enemyArtUrl(enemyId: string) {
  return `assets/enemies/${enemyId}.png`;
}


/* =========================
   INTENTS — mode-aware formatter + tooltip helpers
   ========================= */

const EFFECT_ICON: Record<string, string> = {
  vuln: "🎯",
  weak: "🥀",
  bleed: "🩸",
  disrupt: "🌀",
  immune: "✨",
  supplies: "🌾",
  fatigue: "💤",
};

type EnemyState = GameState["enemies"][number];

function isAttackCat(cat: IntentCategory) {
  return cat === "ATTACK" || cat === "ATTACK_BUFF" || cat === "ATTACK_DEBUFF";
}

function computeIntentDamageText(g: GameState, e: EnemyState, pv: IntentPreview | any): string {
  if (!pv) return "";

  if (!isAttackCat((pv as any).cat as any)) return "";

  const hits = Math.max(1, Number((pv as any).hits ?? 1) || 1);
  const per  = Math.max(0, Number((pv as any).perHit ?? 0) || 0);
  const total = Math.max(0, Number((pv as any).dmgTotal ?? (per * hits)) || 0);

  if (hits > 1) return `${total} (${per}*${hits})`;
  return `${total}`;
}

function computeIntentIconFromPreview(pv: IntentPreview | any): string {
  if (!pv) return "？";

  const isAttack = isAttackCat((pv as any).cat as any);

  const applies = ((pv as any).applies ?? []) as Array<{ target: "player" | "enemy"; kind: string; amount: number }>;
  const hasDebuff = applies.some((a) => a.target === "player");
  const hasBuff   = applies.some((a) => a.target === "enemy");

  let out = "";
  if (isAttack) out += "🗡️";
  if (hasDebuff) out += "🌀";
  if (hasBuff) out += "✨";

  if (!out) {
    const cat = (pv as any).cat as IntentCategory | undefined;
    if (cat === "DEFEND") return "🛡️";
    if (cat === "BUFF") return "✨";
    if (cat === "DEBUFF") return "🌀";
    return "？";
  }
  return out;
}

function renderStatusEmojiRow(st: any, immuneThisTurn?: boolean) {
  const row = div("enemyStatusEmojiRow");

  const add = (key: string, n: number) => {
    if (!n || n <= 0) return;
    const s = document.createElement("span");
    s.className = "stEmoji";
    s.textContent = `${EFFECT_ICON[key] ?? "?"}${n}`;
    row.appendChild(s);
  };

  add("vuln", st?.vuln ?? 0);
  add("weak", st?.weak ?? 0);
  add("bleed", st?.bleed ?? 0);
  add("disrupt", st?.disrupt ?? 0);

  if (immuneThisTurn) {
    const s = document.createElement("span");
    s.className = "stEmoji";
    s.textContent = `${EFFECT_ICON.immune}1`;
    row.appendChild(s);
  }

  return row;
}

/* =========================
   UI ACTIONS — imperative interface
   ========================= */

// UI Actions


export type UIActions = ReturnType<typeof makeUIActions>;

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

type SlotDrop = { side: Side; idx: number };

type Pt = {
  x: number;
  y: number;
};

type Overlay =
  | { kind: "RULEBOOK" }
  | { kind: "PILE"; pile: PileKind }
  | { kind: "SETTINGS" };

let overlay: Overlay | null = null;
let uiMounted = false;
let drag: DragState = null;
let hoverSlot: SlotDrop | null = null;
let showLogOverlay = false;

let relicHoverId: string | null = null;
let relicHoverAt: Pt | null = null;
let relicModalId: string | null = null;

// 카드 렌더


function renderCardPreviewByUidWithUpgrade(g: GameState, uid: string, upgrade: number): HTMLElement {
  const c = g.cards[uid];
  return renderCardPreviewByDef(g, c.defId, upgrade);
}

function renderRealCardForOverlay(
  g: GameState,
  uid: string,
  onPick?: (uid: string) => void
): HTMLElement {
  const clickable = !!onPick; // 선택 가능할 때만 클릭 허용
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

// 길



type NodeType = "BATTLE" | "ELITE" | "REST" | "TREASURE" | "EVENT";

const VS15 = "\uFE0E"; // text presentation (emoji화 완화)

function sepSpan(cls: string, txt: string) {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = txt;
  return s;
}

function nodeLabelParts(t: NodeType, isBoss: boolean) {
  if (t === "BATTLE") {
    return isBoss
      ? { icon: "☠" + VS15, text: "보스", kind: "boss" as const }
      : { icon: "⚔" + VS15, text: "전투", kind: "battle" as const };
  }
  if (t === "ELITE") return { icon: "☠" + VS15, text: "정예", kind: "elite" as const };
  if (t === "REST")  return { icon: "⛺︎" + VS15, text: "휴식", kind: "rest" as const };
  if (t === "EVENT") return { icon: "❔︎" + VS15, text: "미지", kind: "event" as const };


  return { icon: "✦", text: "보물", kind: "treasure" as const };
}


function appendNodeLabel(parent: Node, t: NodeType, isBoss: boolean) {
  const p = nodeLabelParts(t, isBoss);

  const icon = document.createElement("span");
  icon.className = `nodeIcon ${p.kind}`;
  icon.textContent = p.icon;

  const text = document.createElement("span");
  text.className = "nodeText";
  text.textContent = `(${p.text})`;

  parent.appendChild(icon);
  parent.appendChild(text);
}

export function renderLabelList(
  el: HTMLElement,
  offers: Array<{ type: NodeType }>,
  isBoss: boolean
) {
  el.replaceChildren();

  if (isBoss) {
    // 기존 동작 유지하고 싶으면 그냥 "보스" 텍스트만 넣어도 되고,
    // 아이콘까지 원하면 아래 한 줄로:
    appendNodeLabel(el, "BATTLE", true);
    return;
  }

  offers.forEach((o, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "nodeSep";
      sep.textContent = " / ";
      el.appendChild(sep);
    }
    appendNodeLabel(el, o.type, false);
  });
}

function renderNodeSelect(root: HTMLElement, g: GameState, actions: UIActions) {

  const DROP = sx(106);

  const wrap = div("nodeSelectWrap");
  wrap.style.cssText = `margin-top:${DROP}px;`;


  const parts: string[] = [`[탐험 ${g.run.nodePickCount}회]`];

  if (g.run.treasureObtained) {
    const snap = g.run.deckSizeAtTreasure ?? currentTotalDeckLikeSize(g);
    const req = escapeRequiredNodePicks(snap);
    parts.push(`[탈출까지 ${g.run.afterTreasureNodePicks}/${req}]`);
  }

  wrap.appendChild(p(parts.join(" ")));

  ensureBossSchedule(g);

  if (!g.run.bossOmenText || String(g.run.bossOmenText).trim() === "") {
    g.run.bossOmenText = "아직 징조가 없다.";
  }

  const runAny = g.run as any;

  const T = totalTime(g);
  const nextBossTime = runAny.nextBossTime ?? 40;

  const offers = actions.getNodeOffers();

  const extra = runAny.nodeExtra01 ?? 0;
  const afterTBase = T + 1 + extra;

  const forcedBossNow = runAny.forcedNext === "BOSS";
  const willForceRest = !forcedBossNow && afterTBase >= nextBossTime;


  const canPickBattle = !forcedBossNow && !willForceRest && (offers[0]?.type === "BATTLE" || offers[1]?.type === "BATTLE");

  const afterT_ifBattle = afterTBase + 1;
  const afterT2 = forcedBossNow
    ? (afterTBase + 1)
    : canPickBattle
    ? afterT_ifBattle
    : afterTBase;

  const remaining = Math.max(0, nextBossTime - T);


  const willHitBossUI = afterT2 >= nextBossTime;

  if (willHitBossUI && runAny.forcedNext !== "BOSS") {
    const warn = divText("bossIncomingBanner", "보스가 온다.");
    warn.style.cssText =
      "margin-top:10px; padding:10px 12px; border-radius:14px;" +
      "border:1px solid rgba(255,255,255,1);" +
      "background: rgba(255,120,60,1);" +
      "font-weight:700; font-size:13px; line-height:1.25;";
    wrap.appendChild(warn);
  }

  const { tier } = madnessP(g);
  const extraOmen =
    tier === 0 ? "" :
    tier === 1 ? (Math.random() < 0.1 ? " . . . 들린다." : "") :
    tier === 2 ? (Math.random() < 0.1 ? " . . . 보인다." : "") :
                (Math.random() < 0.1 ? " . . . 닿았다." : "");

  const omenTxt = ` . . . ${g.run.bossOmenText}${extraOmen}`;


  const omen = divText(
    "bossOmenBanner",
    `다음 보스까지 남은 시간: ${remaining}${omenTxt}`
  );

  omen.style.cssText =
    "margin-top:8px; padding:10px 12px; border-radius:14px;" +
    "border:1px solid rgba(255, 255, 255, 1);" +
    "background:rgba(0, 0, 0, 1);" +
    "font-weight:600;" +
    "font-size:13px;" +
    "line-height:1.2;";
  omen.style.color = "white";
  wrap.appendChild(omen);

  const br = g.run.branchOffer;
  if (br) {
    const preview = div("nodePreviewBox");
    preview.style.cssText =
      "margin-top:10px; padding:12px; border:1px solid rgba(255,255,255,1); border-radius:16px; background:rgba(0,0,0,1);";

    const forcedBoss = runAny.forcedNext === "BOSS";

    const makeRow = (side: "A" | "B") => {
      const row = div("nodePreviewRow");
      row.onmouseenter = () => (row.style.background = "rgba(255,255,255,.06)");
      row.onmouseleave = () => (row.style.background = "transparent");
      row.onclick = () => actions.onChooseNode(side);

      const idx = side === "A" ? 0 : 1;

      const nowWrap = div("nodeCol");
      const pillNow = document.createElement("div");
      pillNow.className = "nodePill primary";
      pillNow.onclick = (e) => {
        e.stopPropagation();
        actions.onChooseNode(side);
      };
      pillNow.replaceChildren();
      if (forcedBoss) appendNodeLabel(pillNow, "BATTLE", true);
      else appendNodeLabel(pillNow, (offers[idx]?.type ?? "BATTLE") as any, false);
      nowWrap.appendChild(pillNow);

      const arrowWrap = div("nodeCol");
      arrowWrap.appendChild(sepSpan("nodeSepArrow", "→"));

      const nextList = side === "A" ? br.nextIfA : br.nextIfB;
      const a = nextList[0]?.type ?? "BATTLE";
      const b = nextList[1]?.type ?? "BATTLE";

      const next1Wrap = div("nodeCol");
      const next1 = document.createElement("span");
      next1.replaceChildren();
      appendNodeLabel(next1, a as any, false);
      next1Wrap.appendChild(next1);

      const slashWrap = div("nodeCol");
      slashWrap.appendChild(sepSpan("nodeSepSlash", "/"));

      const next2Wrap = div("nodeCol");
      const next2 = document.createElement("span");
      next2.replaceChildren();
      appendNodeLabel(next2, b as any, false);
      next2Wrap.appendChild(next2);

      row.appendChild(nowWrap);
      row.appendChild(arrowWrap);
      row.appendChild(next1Wrap);
      row.appendChild(slashWrap);
      row.appendChild(next2Wrap);

      return row;
    };

    preview.appendChild(makeRow("A"));
    preview.appendChild(makeRow("B"));

    wrap.appendChild(preview);
    wrap.appendChild(hr());
    root.appendChild(wrap);
  }
}





function hr() {
  return document.createElement("hr");
}




/* =========================
   CHOICE SYSTEM — overlay choice context
   ========================= */

// Choice types

type ChoiceKind = "EVENT" | "REWARD" | "PICK_CARD" | "VIEW_PILE" | "UPGRADE_PICK" | "RELIC";





export function makeUIActions(g0: GameState, setGame: (next: GameState) => void) {
  let choiceHandler: ((key: string) => void) | null = null;
  let nodePickLock = false;


  let targetPickLock = false;

  type ChoiceFrame = {
    choice: GameState["choice"];
    handler: ((key: string) => void) | null;
  };

  const choiceStack: ChoiceFrame[] = [];

  function clearChoiceStack(g: GameState) {
    choiceStack.length = 0;
    g.choice = null;
    choiceHandler = null;
    document.querySelector(".choice-overlay")?.remove();
  }

  function pushChoice(g: GameState) {
    choiceStack.push({ choice: g.choice, handler: choiceHandler });
  }

  function popChoice(g: GameState) {
    const prev = choiceStack.pop();
    if (!prev) {
      closeChoiceOrPop(g);
      return;
    }
    g.choice = prev.choice;
    choiceHandler = prev.handler;
  }

  function closeChoiceOrPop(g: GameState) {
    if (choiceStack.length > 0) {
      popChoice(g);
      return;
    }
    g.choice = null;
    choiceHandler = null;
    document.querySelector(".choice-overlay")?.remove();
  }

  function openChoice(
    g: GameState,
    next: GameState["choice"],
    handler: (key: string) => void
  ) {
    if (g.choice) pushChoice(g);
    g.choice = next;
    choiceHandler = handler;
  }

  const getG = () => {
    if (!currentG) return g0;
    return currentG;
  };
  const actions = {

    onHotkeySlot: (side: Side, idx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;
      if (side === "back" && g.backSlotDisabled?.[idx]) return;

      const slots = side === "front" ? g.frontSlots : g.backSlots;
      const uidHere = slots[idx];

      if (!g.selectedHandCardUid) {
        if (!uidHere) return;
        actions.onReturnSlotToHand(side, idx);
        return;
      }

      const selected = g.selectedHandCardUid;

      if (!uidHere) {
        actions.onPlaceHandUidToSlot(selected, side, idx);
        return;
      }

      // 손패 <-> 슬롯 스왑

      slots[idx] = null;

      g.usedThisTurn = Math.max(0, g.usedThisTurn - 1);
      if (side === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);

      g.hand.push(uidHere);
      g.cards[uidHere].zone = "hand";

      placeCard(g, selected, side, idx);
      g.selectedHandCardUid = null;

      logMsg(
        g,
        `[${cardDisplayNameByUid(g, selected)}] ↔ [${cardDisplayNameByUid(g, uidHere)}] 스왑: 손패 ↔ ${side}${idx + 1}`
      );

      render(g, actions);
    },


    rerender: () => { const g = getG(); render(g, actions); },

    onToggleLogOverlay: () => {
      showLogOverlay = !showLogOverlay;
      render(getG(), actions);
    },

    onCloseOverlay: () => {
      const g = getG();
      overlay = null;        
      render(g, actions);
    },

    onNewRun: () => {
      const g = getG();
      hoverSlot = null;
      overlay = null;
      drag = null;
      closeChoiceOrPop(g);           
      clearSave();
      setGame(createInitialState(g.content));
    },

    onViewRulebook: () => {
      const g = getG()
      overlay = { kind: "RULEBOOK" };
      render(g, actions);
    },

    onViewPile: (pile: PileKind) => {
      const g = getG()
      overlay = { kind: "PILE", pile };
      render(g, actions);
    },

    onViewSettings: () => {
      const g = getG();
      overlay = { kind: "SETTINGS" };
      render(g, actions);
    },

    onReturnSlotToHand: (fromSide: Side, fromIdx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      const slots = fromSide === "front" ? g.frontSlots : g.backSlots;
      const uid = slots[fromIdx];
      if (!uid) return;

      slots[fromIdx] = null;

      g.usedThisTurn = Math.max(0, g.usedThisTurn - 1);
      if (fromSide === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);

      g.hand.push(uid);
      g.cards[uid].zone = "hand";

      logMsg(g, `[${cardDisplayNameByUid(g, uid)}] 회수: ${fromSide}${fromIdx + 1} → 손패`);
      render(g, actions);
    },

    onClearSelected: () => {
      const g = getG()
      g.selectedHandCardUid = null;
      render(g, actions);
    },

    onSelectEnemy: (enemyIndex: number) => {
      const g = getG();

      if (targetPickLock) return;
      targetPickLock = true;
      requestAnimationFrame(() => { targetPickLock = false; });

      const finishedTargeting = resolveTargetSelection(g, enemyIndex);

      render(g, actions);

      if (finishedTargeting && !g.choice && !g.run.finished) {
        actions.onAutoAdvance();
      }
    },

    onSelectHandCard: (uid: string) => {
      const g = getG()
      if (isTargeting(g)) return;
      g.selectedHandCardUid = g.selectedHandCardUid === uid ? null : uid;
      render(g, actions);
    },

    // Node 선택
    getNodeOffers: (): NodeOffer[] => {
      const g = getG();
      ensureBossSchedule(g);

      if (!g.run.branchOffer) g.run.branchOffer = rollBranchOffer(g);

      const runAny = g.run as any;
      const T = totalTime(g);

      if (runAny.forcedNext === "BOSS") {
        runAny.nodeExtra01 = 0;
        return [
          { id: "A", type: "BATTLE" },
          { id: "B", type: "BATTLE" },
        ];
      }

      if (runAny.nodeExtra01 == null) {
        runAny.nodeExtra01 = rollExtraTime01FromDeck(g.deck.length).extra;
      }

      const afterT = T + 1 + runAny.nodeExtra01;
      const willHitBoss = afterT >= runAny.nextBossTime;

      if (willHitBoss) {
        return [
          { id: "A", type: "REST" },
          { id: "B", type: "REST" },
        ];
      }

      const ELITE_RATE = 0.05;

      const root = g.run.branchOffer.root;

      if (runAny.nodeEliteAB == null) {
        const aIsElite = root[0].type === "BATTLE" && Math.random() < ELITE_RATE;
        const bIsElite = root[1].type === "BATTLE" && Math.random() < ELITE_RATE;
        runAny.nodeEliteAB = { A: aIsElite, B: bIsElite };
      }

      return [
        { ...root[0], type: (runAny.nodeEliteAB.A ? "ELITE" : root[0].type) },
        { ...root[1], type: (runAny.nodeEliteAB.B ? "ELITE" : root[1].type) },
      ];
    },

    getNodeOffer: (id: "A" | "B"): NodeOffer => {
      const offers = actions.getNodeOffers();
      const a = offers[0] ?? { id: "A", type: "BATTLE" as const };
      const b = offers[1] ?? a;
      return id === "A" ? a : b;
    },
    

    onChooseNode: (id: "A" | "B") => {
      const g = getG();
      if (nodePickLock) return;
      nodePickLock = true;
      queueMicrotask(() => (nodePickLock = false));

      if (g.run.finished) return;
      if (g.phase !== "NODE") return;

      ensureBossSchedule(g);
      if (!g.run.branchOffer) g.run.branchOffer = rollBranchOffer(g);

      const runAny = g.run as any;

      const offers = actions.getNodeOffers();
      const basePicked = (id === "A" ? offers[0].type : offers[1].type);

      const beforeT = totalTime(g);

      const forcedBossNow = runAny.forcedNext === "BOSS";

      let extra = 0;
      if (!forcedBossNow) {
        if (runAny.nodeExtra01 == null) runAny.nodeExtra01 = rollExtraTime01FromDeck(g.deck.length).extra;
        extra = runAny.nodeExtra01;
      }

      const afterT = beforeT + 1 + extra;

      const nextIndex = g.run.nodePickCount + 1;
      g.run.nodePickCount = nextIndex;

      runAny.nodeExtra01 = null;
      runAny.nodeEliteAB = null;

      const willHitBoss = !forcedBossNow && afterT >= runAny.nextBossTime;

      const actual =
        forcedBossNow
          ? ("BATTLE" as const)
          : willHitBoss
          ? ("REST" as const)
          : (basePicked as typeof basePicked);
      const battleTime = (actual === "BATTLE" || actual === "ELITE") ? 1 : 0;
      const afterT2 = afterT + battleTime;

      g.time = (g.time ?? 0) + extra + battleTime;
      if (battleTime) logMsg(g, "전투를 선택해 시간이 더 소모된다. (시간 +1)");

      advanceBranchOffer(g, id);

      g.run.nodePickByType[actual] = (g.run.nodePickByType[actual] ?? 0) + 1;

      if (g.run.treasureObtained && actual !== "TREASURE") {
        g.run.afterTreasureNodePicks += 1;

        const snap = g.run.deckSizeAtTreasure ?? currentTotalDeckLikeSize(g);
        const req = escapeRequiredNodePicks(snap);
  
        if (g.run.afterTreasureNodePicks >= req) {
          g.run.finished = true;
          logMsg(g, `승리! 보물 획득 후 ${req}번의 탐험을 버티고 탈출했습니다.`);
          render(g, actions);
          return;
        }
      }

      if (forcedBossNow) {
        runAny.forcedNext = null;
        runAny.nextBossTime += 40;
        g.run.bossOmenText = null;

        logMsg(g, `=== 시간 ${afterT2}: 보스 전투 ===`);
        spawnEncounter(g, { forceBoss: true });
        startCombat(g);
        (g as any)._justStartedCombat = false
        render(g, actions);
        return;
      }

      if (!forcedBossNow && afterT2 >= runAny.nextBossTime) {
        runAny.forcedNext = "BOSS";
        logMsg(g, `시간이 흘러 보스가 다가옵니다!`);
      }

      if (actual === "BATTLE" || actual === "ELITE") {
        if (actual === "ELITE") {
          (g.run as any).pendingElite = true;
          logMsg(g, "정예가 나타났다!");
        }

        spawnEncounter(g, { forceBoss: false });
        startCombat(g);
        (g as any)._justStartedCombat = false
        render(g, actions);
        return;
      }

      if (actual === "REST") {

        function applyRestHighFatigueCost(g: GameState) {
          const f = g.player.fatigue ?? 0;
          if (f < 10) return;

          g.player.fatigue = Math.max(0, f - 2);
          g.time = (g.time ?? 0) + 1;
          logMsg(g, "피로가 너무 높아 휴식이 더 오래 걸립니다. (F -2, 시간 +1)");
        }

        const openRestMenu = () => {
          const highF = (g.player.fatigue ?? 0) >= 10;

          const restTitle = highF ? "피로도가 너무 높아 더 쉬어야 합니다." : "휴식";
          const restSuffix = highF ? " (피로도 10 이상: F -2, 시간 +1)" : "";

          g.choice = {
            kind: "EVENT",
            title: restTitle,
            prompt: "무엇을 하시겠습니까?",
            art: "assets/events/event_rest.png",   
            options: [
              { key: "rest:heal",    label: `HP +15 ${restSuffix}` },
              { key: "rest:clear_f", label: `F -3 ${restSuffix}` },
              { key: "rest:upgrade", label: `강화 ${restSuffix}` },
              { key: "rest:skip",    label: `생략` },
            ],
          };

          choiceHandler = (key: string) => {
            if (key === "rest:heal") {
              applyRestHighFatigueCost(g);
              g.player.hp = Math.min(g.player.maxHp, g.player.hp + 15);
              logMsg(g, "휴식: HP +15");
              closeChoiceOrPop(g);
              g.phase = "NODE";
              render(g, actions);
              return;
            }

            if (key === "rest:clear_f") {
              applyRestHighFatigueCost(g);
              g.player.fatigue = Math.max(0, g.player.fatigue - 3);
              logMsg(g, "휴식: 피로 F-=3");
              closeChoiceOrPop(g);
              g.phase = "NODE";
              render(g, actions);
              return;
            }

            if (key === "rest:upgrade") {
              openUpgradePick(g, actions, "강화", "강화할 카드 1장을 선택하세요.", {
                onDone: () => {
                  applyRestHighFatigueCost(g);
                  g.phase = "NODE";
                  render(g, actions);
                },
                onSkip: () => {
                  openRestMenu();
                  render(g, actions);
                },
              });
              return;
            }

            logMsg(g, "휴식: 생략");
            closeChoiceOrPop(g);
            g.phase = "NODE";
            render(g, actions);
            return;
          };
        };

        openRestMenu();
        render(g, actions);
        return;
      }


      if (actual === "TREASURE") {
        obtainTreasure(g);

        const snap = (g.run as any).deckSizeAtTreasure;
        const req = escapeRequiredNodePicks(snap);
        logMsg(g, `저주받은 보물을 얻었습니다! 이제부터 ${req}번의 탐험을 버티면 탈출합니다.`);

        render(g, actions);
        return;
      }

      if (actual === "EVENT") {
        const runAny = g.run;
        runAny.ominousProphecySeen ??= false;

        const OMEN_CHANCE = 0.3;
        let ev = pickEventByMadness(g);
        if (runAny.ominousProphecySeen === true) {

          for (let i = 0; i < 50 && (ev as any).id === "ominous_prophecy"; i++) {
            ev = pickEventByMadness(g);
          }
        } else {
          if (Math.random() < OMEN_CHANCE) {
            ev = getEventById("ominous_prophecy") ?? ev;
            runAny.ominousProphecySeen = true
          }
        }
      
        const opts = ev.options(g);

        const { tier } = madnessP(g);
        if (tier >= 2) {
          opts.push({
            key: "mad:whisper",
            label: "속삭임에 귀 기울인다.",
            detail: "무언가를 얻는다. 그리고 무언가를 잃는다.",
            apply: (g: GameState) => {
              // 보상: 강화/카드/회복 중 하나
              const r = Math.random();
              if (r < 0.34) {
                g.player.hp = Math.min(g.player.maxHp, g.player.hp + 10);
                logMsg(g, "속삭임: HP +10");
              } else if (r < 0.67) {
                g.player.fatigue += 1;
                logMsg(g, "속삭임: F +1 (대가)");
              } else {
                // 광기 전용 카드 확률적으로 지급
                addCardToDeck(g, "mad_echo", { upgrade: 0 });
                logMsg(g, "속삭임: [메아리]를 얻었다.");
              }
              return "NONE" as any;
            },
          });
        }

        g.choice = {
          kind: "EVENT",
          title: ev.name,
          prompt: ev.prompt,
          art: (ev as any).art ?? null,
          options: opts.map((o) => ({ key: o.key, label: o.label, detail: o.detail })),
        };

        choiceHandler = (key: string) => {
          const picked = opts.find((o) => o.key === key);
          if (!picked) return;

          const outcome: EventOutcome = picked.apply(g);

          if (typeof outcome === "object" && outcome.kind === "UPGRADE_PICK") {
            openUpgradePick(g, actions, outcome.title ?? "강화", outcome.prompt ?? "강화할 카드 1장을 선택하세요.");
            return;
          }

          if (typeof outcome === "object" && outcome.kind === "REMOVE_PICK") {

            const candidates = Object.values(g.cards)
              .filter((c) => c.zone === "deck" || c.zone === "hand" || c.zone === "discard")
              .map((c) => c.uid);

            openChoice(g, {
              kind: "PICK_CARD",
              title: outcome.title,
              prompt: outcome.prompt ?? "제거할 카드 1장을 선택하세요.",
              options: [
                ...candidates.map((uid) => {
                  const def = getCardDefByUid(g, uid);
                  return {
                    key: `remove:${uid}`,
                    label: cardDisplayNameByUid(g, uid),
                    detail: `전열: ${def.frontText} / 후열: ${def.backText}`,
                    cardUid: uid,
                  };
                }),
                { key: "cancel", label: "취소" },
              ],
            }, (k: string) => {
              if (k === "cancel") {
                logMsg(g, "제거 취소");
                closeChoiceOrPop(g);
                render(g, actions);
                return;
              }

              if (!k.startsWith("remove:")) {
                render(g, actions);
                return;
              }

              const uid = k.slice("remove:".length);
              removeCardByUid(g, uid);

              const thenRaw = (outcome as any).then as string | undefined;
              const then =
                thenRaw === "REWARD" ? "REWARD_PICK" :
                thenRaw === "REWARD_PICK" ? "REWARD_PICK" :
                thenRaw === "BATTLE" ? "BATTLE" :
                thenRaw === "NONE" ? "NONE" :
                undefined;

              if (then === "BATTLE") {
                clearChoiceStack(g);
                g.phase = "NODE";
                spawnEncounter(g);
                startCombat(g);
                render(g, actions);
                return;
              }


              if (then === "REWARD_PICK") {
                clearChoiceStack(g);
                openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
                render(g, actions);
                return;
              }

              clearChoiceStack(g);
              g.phase = "NODE";
              render(g, actions);
              return;

            });


            render(g, actions);
            return;
          }

          if (typeof outcome === "object" && outcome.kind === "BATTLE_SPECIAL") {
            clearChoiceStack(g);
            logMsg(g, outcome.title ? `이벤트 전투: ${outcome.title}` : "이벤트 전투 발생!");
            g.phase = "NODE";
            spawnEncounter(g, { forcePatternIds: outcome.enemyIds });
            startCombat(g);
            render(g, actions);
            return;
          }

          if (outcome === "BATTLE") {
            clearChoiceStack(g);
            g.phase = "NODE";
            spawnEncounter(g);
            startCombat(g);
            render(g, actions);
            return;
          }

          if (outcome === "REWARD") {
            clearChoiceStack(g);
            openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
            render(g, actions);
            return;
          }

          closeChoiceOrPop(g);
          render(g, actions);
          return;
        };

        render(g, actions);
        return;
      }
    },

    onChooseChoice: (key: string) => {
      const g = getG();
      if (!g.choice) return;

      const kind = g.choice.kind;

      if (applyChoiceKey(g, key)) {
        const justEnteredCombat = kind === "EVENT" && key === "startBattle";

        render(g, actions);

        if (!justEnteredCombat) actions.onAutoAdvance();
        return;
      }

      if (choiceHandler) {
        choiceHandler(key);

        const justEnteredCombat = kind === "EVENT" && key === "startBattle";

        render(g, actions);

        if (!justEnteredCombat) actions.onAutoAdvance();
        return;
      }

      logMsg(g, `선택 처리 불가: handler 없음 (kind=${kind}, key=${key})`);
    },
    onAutoAdvance: () => {
      const g = getG();
      runAutoAdvanceRAF(g, actions);
    },


    onRevealIntents: () => {
      const g = getG()
      if (g.run.finished) return;
      if (g.enemies.length === 0) return;
      revealIntentsAndDisrupt(g);
      render(g, actions);
    },

    onPlaceHandUidToSlot: (cardUid: string, side: Side, idx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;
      if (side === "back" && g.backSlotDisabled?.[idx]) return;

      placeCard(g, cardUid, side, idx);
      g.selectedHandCardUid = null;
      render(g, actions);
    },

    onPlaceSelected: (side: Side, idx: number) => {
      const g = getG()
      if (!g.selectedHandCardUid) return;
      actions.onPlaceHandUidToSlot(g.selectedHandCardUid, side, idx);
    },

    onMoveSlotCard: (fromSide: Side, fromIdx: number, toSide: Side, toIdx: number) => {
      const g = getG()
      if (g.run.finished) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;
      if (toSide === "back" && g.backSlotDisabled?.[toIdx]) return;

      const fromSlots = fromSide === "front" ? g.frontSlots : g.backSlots;
      const toSlots = toSide === "front" ? g.frontSlots : g.backSlots;

      const a = fromSlots[fromIdx];
      if (!a) return;

      const b = toSlots[toIdx];

      fromSlots[fromIdx] = b ?? null;
      toSlots[toIdx] = a;

      g.cards[a].zone = toSide;
      if (b) g.cards[b].zone = fromSide;

      if (fromSide !== toSide) {
        if (fromSide === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);
        if (toSide === "front") g.frontPlacedThisTurn += 1;

        if (b) {
          if (toSide === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);
          if (fromSide === "front") g.frontPlacedThisTurn += 1;
        }
      }

      logMsg(
        g,
        b
          ? `[${cardDisplayNameByUid(g, a)}] ↔ [${cardDisplayNameByUid(g, b)}] 스왑: ${fromSide}${fromIdx + 1} ↔ ${toSide}${toIdx + 1}`
          : `[${cardDisplayNameByUid(g, a)}] 이동: ${fromSide}${fromIdx + 1} → ${toSide}${toIdx + 1}`
      );

      normalizePlacementCounters(g);
      render(g, actions);
    },

    onResolveBack: () => {
      const g = getG();
      if (g.phase === "PLACE") normalizePlacementCounters(g);

      resolveBack(g);
      render(g, actions);
    },
    onResolveFront: () => {
      const g = getG()
      resolveFront(g);
      render(g, actions);
    },
    onResolveEnemy: () => {
      const g = getG()
      resolveEnemy(g);
      render(g, actions);
    },
    onUpkeep: () => {
      const g = getG()
      upkeepEndTurn(g);
      render(g, actions);
    },
    onDrawNextTurn: () => {
      const g = getG()
      drawStepStartNextTurn(g);
      render(g, actions);
    },
  };

  // 보상/강화 창 열기
  function openRewardPick(g: GameState, actions: any, title: string, prompt: string) {


    const offers = offerRewardsByFatigue(g);
    const opts = offers.map((o) => {
      const d = getCardDefByIdWithUpgrade(g.content, o.defId, o.upgrade);
      return {
        key: `pick:${o.defId}:${o.upgrade}`,
        label: displayNameForOffer(g, o),
        detail: `전열: ${d.frontText} / 후열: ${d.backText}`,
      };
    });
 

    g.choice = {
      kind: "REWARD",
      title,
      prompt,
      options: [
        ...opts,
        { key: "skip", label: "생략" },
      ],
    };

    choiceHandler = (kk: string) => {
      choiceHandler = null;
      if (kk.startsWith("pick:")) {
        const payload = kk.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        addCardToDeck(g, defId, { upgrade });
      } else {
        logMsg(g, "카드 보상 생략");
      }

      closeChoiceOrPop(g);
      g.choice = null;
      if (!g.run.finished) g.phase = "NODE";
      render(g, actions);
      return;
    };


    render(g, actions);
  }

  function openUpgradePick(
    g: GameState,
    actions: any,
    title: string,
    prompt: string,
    opts?: {
      onDone?: () => void;
      onSkip?: () => void;
    }
  ) {
    let candidates = Object.values(g.cards)
      .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && canUpgradeUid(g, c.uid))
      .map((c) => c.uid);

    const f = g.player.fatigue ?? 0;
    let limit = Infinity;
    if (f >= 8) limit = 4;
    else if (f >= 5) limit = 8;

    if (limit !== Infinity && candidates.length > limit) {
      candidates = [...candidates].sort(() => Math.random() - 0.5).slice(0, limit);
    }

    if (candidates.length === 0) {
      logMsg(g, "강화할 수 있는 카드가 없습니다.");
      g.choice = null;
      choiceHandler = null;

      if (opts?.onSkip) opts.onSkip();
      else render(g, actions);
      return;
    }

    const sorted = [...candidates].sort((ua, ub) => {
      const a = g.cards[ua];
      const b = g.cards[ub];
      const na = baseCardName(g, a.defId);
      const nb = baseCardName(g, b.defId);
      const nc = na.localeCompare(nb, "ko");
      if (nc !== 0) return nc;
      return (a.upgrade ?? 0) - (b.upgrade ?? 0);
    });

    g.choice = {
      kind: "UPGRADE_PICK" as ChoiceKind,
      title,
      prompt,
      options: [
        ...sorted.map((uid) => {
          const c = g.cards[uid];
          const curDef = getCardDefByUid(g, uid);
          const nextDef = getCardDefByIdWithUpgrade(g.content, c.defId, (c.upgrade ?? 0) + 1);

          const label = cardDisplayNameByUid(g, uid);
          const detail =
            `현재: 전열 ${curDef.frontText} / 후열 ${curDef.backText}\n` +
            `강화: 전열 ${nextDef.frontText} / 후열 ${nextDef.backText}`;

          return { key: `up:${uid}`, label, detail, cardUid: uid };
        }),
        { key: "skip", label: "취소" },
      ],
    };

    choiceHandler = (k: string) => {
      // 취소
      if (k === "skip") {
        logMsg(g, "강화 취소");
        closeChoiceOrPop(g);

        if (opts?.onSkip) opts.onSkip();
        else render(g, actions);
        return;
      }

      // 강화 선택
      if (k.startsWith("up:")) {
        const uid = k.slice("up:".length);
        const ok = upgradeCardByUid(g, uid);
        logMsg(g, ok ? `강화: [${cardDisplayNameByUid(g, uid)}]` : "강화 실패");

        closeChoiceOrPop(g);

        if (opts?.onDone) opts.onDone();
        else render(g, actions);
        return;
      }

      // 예상 못한 키: 그냥 닫기
      closeChoiceOrPop(g);
      render(g, actions);
    };


    render(g, actions);
  }
  return actions;
}



function normalizePlacementCounters(g: GameState) {
  const front = g.frontSlots.filter((x) => x != null).length;
  const back  = g.backSlots.filter((x) => x != null).length;

  g.frontPlacedThisTurn = front;
  g.usedThisTurn = front + back;
}

export function mountRoot(): HTMLDivElement {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";
  return app;
}

function mkButton(label: string, onClick: () => void, className = "") {
  const b = document.createElement("button");
  if (className) b.className = className;
  b.type = "button";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function normalizeEnemyNameWidth() {
  const names = Array.from(document.querySelectorAll<HTMLElement>(".enemyName"));
  if (names.length === 0) return;

  // 한 번 폭 제한 풀고 실제 필요한 폭을 측정
  names.forEach((el) => {
    el.style.display = "inline-block";
    el.style.width = "auto";
    el.style.whiteSpace = "nowrap";
  });

  let maxW = 0;
  for (const el of names) maxW = Math.max(maxW, el.scrollWidth);

  // 너무 길어질 때 UI 깨지는 것 방지
  const cap = 320; // px
  const w = Math.min(maxW, cap);

  // 전부 동일 폭 적용
  names.forEach((el) => {
    el.style.width = `${w}px`;
    el.style.overflow = "hidden";
    el.style.textOverflow = "ellipsis";
  });
}

function renderPhaseBanner() {
  document.querySelector(".phaseBanner")?.remove();
  const now = performance.now();
  if (!phaseBannerText || now > phaseBannerUntil) return;

  const el = document.createElement("div");
  el.className = "phaseBanner";
  el.textContent = phaseBannerText;
  document.body.appendChild(el);
}

function renderFloatFxLayer() {
  cleanupFloatFx();

  let layer = document.querySelector<HTMLElement>(".floatFxLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "floatFxLayer";
    document.body.appendChild(layer);
  }
  layer.style.cssText =
    "position:fixed; inset:0;" +
    "pointer-events:none;" +
    "z-index: var(--zChrome);";

  for (const f of floatFx) {
    const id = String(f.id);
    let el = layer.querySelector<HTMLElement>(`.floatNum[data-fx-id="${id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = `floatNum ${f.kind}`;
      el.dataset.fxId = id;
      el.textContent = f.text;

      el.style.position = "absolute";
      el.style.left = `${Math.round(f.x)}px`;
      el.style.top = `${Math.round(f.y)}px`;

      layer.appendChild(el);
    } else {
      el.style.left = `${Math.round(f.x)}px`;
      el.style.top = `${Math.round(f.y)}px`;
    }
  }
}

export function ensureFloatingNewRunButton() {
  // 이미 있으면 끝
  if (document.querySelector(".floatingNewRun")) return;

  const btn = document.createElement("button");
  btn.className = "floatingNewRun";
  btn.type = "button";
  btn.textContent = "새로운 런";

  btn.style.cssText = `
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 10px);
    left: calc(env(safe-area-inset-left, 0px) + 10px);
    pointer-events: auto;
    z-index: var(--zChrome);

    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,.16);
    background: rgba(0,0,0,.55);
    color: #fff;

    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    touch-action: manipulation;
  `;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    floatingNewRunHandler?.();
  });

  document.body.appendChild(btn);
}



/* =========================
   RENDER ENTRYPOINT
   ========================= */

export function render(g: GameState, actions: UIActions) {

  if (!(render as any)._uiScaleInitDone) {
    (render as any)._uiScaleInitDone = true;
    uiSettings = loadUiSettings();
    applyUiScaleVars();
  }
  currentG = g;

  setDevConsoleCtx({
    getG: () => currentG ?? g,
    actions: { onNewRun: () => actions.onNewRun() },
    rerender: () => render(currentG ?? g, actions),
    log: (msg) => logMsg((currentG ?? g), msg),
  });

  // 콘솔이 켜져있으면 DOM 유지/갱신
  renderDevConsole();

  floatingNewRunHandler = () => actions.onNewRun();
  ensureFloatingNewRunButton();
  ensureBgLayer();

  if (!(render as any)._logInitDone) {
    (render as any)._logInitDone = true;
    loadLogCollapsed();
  }


  const prevMain = document.querySelector<HTMLElement>(".mainPanel");
  if (prevMain) {
    lastMainPanelScrollTop = prevMain.scrollTop;
    lastMainPanelScrollLeft = prevMain.scrollLeft;
  }

  const app = mountRoot();

  if (!uiMounted) {
    window.addEventListener("resize", () => {
      if (!frameImgsPromise) return;
      frameImgsPromise.then((imgs) => drawFramesOnPanels(imgs));
      if (currentG){
        normalizeEnemyNameWidth();
        alignHandToBoardAnchor(currentG);
        alignEnemyHudToViewportCenter();
        positionPlayerHudByStage();
        applyUiScaleVars();
      }
    });
    bindGlobalInput(() => currentG ?? g, actions);
    uiMounted = true;
  }

  app.appendChild(renderTopHud(g, actions));

  const mainRow = div("mainRow");

  const stage = div("stage");
  const stageInner = div("stageInner");
  const main = div("panel mainPanel");

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  main.classList.toggle("inCombat", inCombat);

  main.scrollTop = lastMainPanelScrollTop;
  main.scrollLeft = lastMainPanelScrollLeft;

  main.appendChild(renderBattleTitleRow(g));

  if (g.run.finished) main.appendChild(p("런 종료"));
  else if (g.phase === "NODE") renderNodeSelect(main, g, actions);
  else renderCombat(main, g, actions);

  stageInner.appendChild(main);
  stage.appendChild(stageInner);

  const logPanel = div("panel logPanel");
  logPanel.classList.toggle("collapsed", logCollapsed);

  logPanel.appendChild(renderLogHeaderRow(logCollapsed, () => {
    logCollapsed = !logCollapsed;
    saveLogCollapsed();
    render(g, actions);
  }));
  logPanel.classList.add("logScroll");

  if (!logCollapsed) {
    const lb = logBox(g.log.join("\n"));
    (lb as HTMLElement).classList.add("log");
    logPanel.appendChild(lb);
  }

  mainRow.appendChild(stage);
  mainRow.appendChild(logPanel);
  app.appendChild(mainRow);



  normalizeEnemyNameWidth();
  renderStageCornerResourceHud(g); 
  renderHandDock(g, actions, isTargeting(g));
  alignHandToBoardAnchor(g);
  alignEnemyHudToViewportCenter();
  positionPlayerHudByStage();
  renderDragOverlay(app, g);

  renderOverlayLayer(g, {
    ...actions,
    onCloseOverlay: () => {
      overlay = null;
      render(currentG ?? g, actions);
    },
  });
  renderChoiceLayer(g, actions);
  renderLogOverlay(g, actions);

  renderRelicTray(g, actions);
  renderRelicModal(g, actions);

  detectAndEmitDeltas(g);
  renderPhaseBanner();
  renderFloatFxLayer();
  renderRelicHud(g, actions);
  scheduleSave(g);
  schedulePostLayout(g);
}



function getRelicView(g: GameState, id: string) {
  const def: any = (RELICS_BY_ID as any)[id] ?? null;

  const disp = getRelicDisplay(g, id);

  const art = def?.art ?? def?.icon ?? null;
  const icon = art ?? null;

  return {
    id,
    name: disp.name,
    desc: disp.text,
    state: disp.state, // 필요하면 UI에서 PENDING 표시용
    icon,
    art,
  };
}

function renderRelicHud(g: GameState, actions: UIActions) {
  document.querySelector(".relicHud")?.remove();
  document.querySelector(".relicTooltip")?.remove();
  renderRelicModal(g, actions);

  const ids = (g.run.relics ?? []).slice();
  if (ids.length === 0) return;

  const hud = document.createElement("div");
  hud.className = "relicHud";

  for (const id of ids.slice().reverse()) {
    const v = getRelicView(g, id);

    const icon = document.createElement("div");
    icon.className = "relicIcon";
    icon.setAttribute("role", "button");
    icon.tabIndex = 0;

    if (v.icon) {
      const img = document.createElement("div");
      img.className = "relicIconImg";
      img.style.backgroundImage = `url(${v.icon})`;
      icon.appendChild(img);
    } else {
      const t = document.createElement("div");
      t.textContent = v.name.slice(0, 2);
      t.style.fontWeight = "900";
      t.style.fontSize = "12px";
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
      if (relicHoverId === id) {
        relicHoverId = null;
        relicHoverAt = null;
        document.querySelector(".relicTooltip")?.remove();
      }
    };

    icon.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      relicModalId = id;
      relicHoverId = null;
      relicHoverAt = null;
      document.querySelector(".relicTooltip")?.remove();
      renderRelicModal(g, actions);
    };

    icon.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        relicModalId = id;
        renderRelicModal(g, actions);
      }
    };

    hud.appendChild(icon);
  }

  document.body.appendChild(hud);
  renderRelicTooltip(g);
}

function renderRelicTooltip(g: GameState) {
  document.querySelector(".relicTooltip")?.remove();
  if (!relicHoverId || !relicHoverAt) return;

  const v = getRelicView(g, relicHoverId);
  if (!v.desc && !v.name) return;

  const tip = document.createElement("div");
  tip.className = "relicTooltip";

  const t = document.createElement("div");
  t.className = "relicTooltipTitle";
  t.textContent = v.name;
  tip.appendChild(t);

  if (v.desc) {
    const d = document.createElement("div");
    d.className = "relicTooltipDesc";
    d.textContent = v.desc;
    tip.appendChild(d);
  }

  document.body.appendChild(tip);

  const pad = 12;
  const r = tip.getBoundingClientRect();
  let x = relicHoverAt.x - r.width;
  let y = relicHoverAt.y - r.height - 10;

  x = Math.max(pad, Math.min(window.innerWidth - r.width - pad, x));
  y = Math.max(pad, Math.min(window.innerHeight - r.height - pad, y));

  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}

function renderRelicModal(g: GameState, actions: UIActions) {
  document.querySelector(".relicModal")?.remove();
  if (!relicModalId) return;

  const v = getRelicView(g, relicModalId);

  const modal = document.createElement("div");
  modal.className = "relicModal";

  modal.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: var(--zRelicModal, 70000);
    pointer-events: auto;
    background: rgba(0,0,0,.55);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    box-sizing: border-box;
  `;

  modal.onclick = (e) => {
    if (e.target !== modal) return;
    relicModalId = null;
    render(g, actions);
  };

  const panel = document.createElement("div");
  panel.className = "relicModalPanel";
  panel.onclick = (e) => e.stopPropagation();

  const header = document.createElement("div");
  header.className = "relicModalHeader";

  const title = document.createElement("h3");
  title.className = "relicModalTitle";
  title.textContent = v.name;
  title.style.fontFamily = `"물마루", serif`;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "닫기";
  closeBtn.className = "overlayClose";
  closeBtn.onclick = () => {
    relicModalId = null;
    render(g, actions);
  };

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "relicModalBody";

  const art = document.createElement("div");
  art.className = "relicModalArt";

  const artImg = document.createElement("div");
  artImg.className = "relicModalArtImg";
  if (v.art) artImg.style.backgroundImage = `url(${v.art})`;
  art.appendChild(artImg);

  const desc = document.createElement("pre");
  desc.className = "relicModalDesc";
  desc.textContent = v.desc || "";
  desc.style.fontFamily = `"물마루", serif`;

  body.appendChild(art);
  body.appendChild(desc);

  panel.appendChild(header);
  panel.appendChild(body);

  modal.appendChild(panel);
  document.body.appendChild(modal);
}

function renderStageCornerResourceHud(g: GameState) {
  const anchor = document.querySelector<HTMLElement>(".stageInner");
  if (!anchor) return;

  document.querySelector(".stageCornerHud")?.remove();

  const hud = document.createElement("div");
  hud.className = "stageCornerHud";
  hud.textContent = buildResourceText(g);
  document.body.appendChild(hud);

  const r = anchor.getBoundingClientRect();

  const padTop = -56;

  const centerX = (r.left + r.right) / 2;

  hud.style.right = "";
  hud.style.left = `${Math.round(centerX)}px`;
  hud.style.top  = `${Math.round(r.top + padTop)}px`;


  hud.style.transform = "translateX(-50%)";
}


function saveUiSettings() {
  try { localStorage.setItem(UISET_KEY, JSON.stringify(uiSettings)); } catch {}
}

function setUiScaleNow(v: number) {
  const clamped = clamp(v, 0.75, 1.5);
  if (isMobileUiNow()) uiSettings.uiScaleMobile = clamped;
  else uiSettings.uiScaleDesktop = clamped;

  saveUiSettings();
  applyUiScaleVars();
}

function renderLogOverlay(g: GameState, actions: UIActions) {

  
  document.querySelector(".logOverlay")?.remove();

  if (!showLogOverlay) return;

  const layer = div("logOverlay");
  layer.style.cssText = `
    position: fixed; inset: 0;
    pointer-events:auto;
    background: rgba(0,0,0,.55);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  `;

  const sheet = div("panel");
  sheet.style.cssText = `
    width: min(720px, 100%);
    max-height: 70vh;
    border-radius: 18px 18px 0 0;
    padding: 12px;
    margin: 0;
  `;

  const header = div("panelHeader");
  const title = document.createElement("h2");
  title.textContent = "로그";
  header.appendChild(title);

  const closeBtn = mkButton("닫기", () => actions.onToggleLogOverlay());
  header.appendChild(closeBtn);

  sheet.appendChild(header);

  const pre = document.createElement("pre");
  pre.className = "log";
  pre.textContent = g.log.join("\n");
  pre.style.maxHeight = "60vh";
  pre.style.overflow = "auto";

  sheet.appendChild(pre);

  layer.onclick = () => actions.onToggleLogOverlay();
  sheet.onclick = (e) => e.stopPropagation();

  layer.appendChild(sheet);
  document.body.appendChild(layer);
}

function renderSettingsPanel(onChange: () => void, actions: UIActions) {
  const wrap = div("settingsPanel");
  wrap.style.cssText = "display:flex; flex-direction:column; gap:12px;";

  // --- UI 스케일 ---
  const row = div("settingsRow");
  row.style.cssText = "display:flex; align-items:center; gap:12px; flex-wrap:wrap;";

  const label = divText("", "UI 스케일");
  label.style.cssText = "font-weight:800;";

  const getNow = () => (isMobileUiNow() ? uiSettings.uiScaleMobile : uiSettings.uiScaleDesktop);

  const val = divText("", `${Math.round(getNow() * 100)}%`);
  val.style.cssText = "opacity:.9; min-width:64px; text-align:right;";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0.75";
  slider.max = "1.25";
  slider.step = "0.01";
  slider.value = String(getNow());
  slider.style.cssText = "flex:1 1 260px;";

  slider.oninput = () => {
    const v = Number(slider.value);
    setUiScaleNow(v);
    val.textContent = `${Math.round(getNow() * 100)}%`;
    onChange();
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(val);
  wrap.appendChild(row);

  // 프리셋
  const presets = div("settingsPresets");
  presets.style.cssText = "display:flex; gap:8px; flex-wrap:wrap;";

  const makePreset = (txt: string, v: number) => {
    const b = mkButton(txt, () => {
      setUiScaleNow(v);
      slider.value = String(getNow());
      val.textContent = `${Math.round(getNow() * 100)}%`;
      onChange();
    });
    b.style.cssText =
      "padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.16);" +
      "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
    return b;
  };

  presets.appendChild(makePreset("작게 90%", 0.90));
  presets.appendChild(makePreset("기본 100%", 1.00));
  presets.appendChild(makePreset("크게 110%", 1.10));
  presets.appendChild(makePreset("더 크게 120%", 1.20));
  wrap.appendChild(presets);

  // 초기화
  const resetRow = div("settingsResetRow");
  resetRow.style.cssText = "display:flex; justify-content:flex-end; margin-top:6px;";
  const reset = mkButton("초기화", () => {
    setUiScaleNow(1.0);
    slider.value = String(getNow());
    val.textContent = `${Math.round(getNow() * 100)}%`;
    onChange();
  });
  reset.style.cssText =
    "padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.16);" +
    "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
  resetRow.appendChild(reset);
  wrap.appendChild(resetRow);

  // --- 슬롯 카드 표시 모드 ---
  const modeRow = div("settingsRow");
  modeRow.style.cssText = "display:flex; align-items:center; gap:12px; flex-wrap:wrap;";

  const modeLabel = divText("", "슬롯 카드 표시");
  modeLabel.style.cssText = "font-weight:800;";

  const cur = uiSettings.slotCardMode ?? "FULL";

  const btnFull = mkButton("전체", () => {
    uiSettings.slotCardMode = "FULL";
    saveUiSettings();
    onChange();
  });
  const btnName = mkButton("이름만", () => {
    uiSettings.slotCardMode = "NAME_ONLY";
    saveUiSettings();
    onChange();
  });

  btnFull.style.cssText = `padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.16);
    background:${cur === "FULL" ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)"}; color:#fff; cursor:pointer;`;
  btnName.style.cssText = `padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.16);
    background:${cur === "NAME_ONLY" ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)"}; color:#fff; cursor:pointer;`;

  modeRow.appendChild(modeLabel);
  modeRow.appendChild(btnFull);
  modeRow.appendChild(btnName);
  wrap.appendChild(modeRow);

  return wrap;
}

function positionPlayerHudByStage() {
  const stage = document.querySelector<HTMLElement>(".stageInner");
  if (!stage) return;

  const r = stage.getBoundingClientRect();

  // stage 기준점만 CSS 변수로 전달 (px)
  const x = Math.round(r.left);
  const y = Math.round(r.top);

  const root = document.documentElement;
  root.style.setProperty("--stageLeftPx", `${x}px`);
  root.style.setProperty("--stageTopPx", `${y}px`);
  root.style.setProperty("--stageHPx", `${Math.round(r.height)}px`);
}

function applyUiScaleVars() {
  const root = document.documentElement;

  const scale = isMobileUiNow()
    ? uiSettings.uiScaleMobile
    : uiSettings.uiScaleDesktop;

  root.style.setProperty("--uiScale", String(scale));
  root.style.setProperty("--uiScaleDesktop", String(uiSettings.uiScaleDesktop));
  root.style.setProperty("--uiScaleMobile", String(uiSettings.uiScaleMobile));
}




/* =========================
   OVERLAYS — choice/event/relic/settings
   ========================= */

function renderOverlayLayer(
  g: GameState,
  actions: UIActions & { onCloseOverlay: () => void }
) {
  document.querySelector(".overlay-layer")?.remove();

  if (!overlay) return;

  const isFull = overlay.kind === "SETTINGS";

  const layer = div("overlay-layer");
  layer.style.cssText = isFull
    ? "position:fixed; inset:0;" +
      "background:rgba(0,0,0,1);" +          // 불투명
      "display:flex; justify-content:center; align-items:flex-start;" +
      "padding:24px; box-sizing:border-box;"
    : "position:fixed; inset:0;" +
      "background:rgba(0,0,0,.55);" +
      "display:flex; justify-content:center; align-items:center;";


  layer.onclick = (e) => {
    if (e.target === layer) actions.onCloseOverlay();
  };

  const panel = div("overlay-panel");
  panel.style.cssText = isFull
    ? "width:min(860px, 96vw); max-height:calc(100vh - 48px); overflow:auto;" +
      "padding:16px; border:1px solid rgba(255,255,255,.12); border-radius:16px;" +
      "background:rgba(15,18,22,1); box-shadow:0 18px 60px rgba(0,0,0,.45);"
    : "width:min(980px, 92vw); max-height:80vh; overflow:auto; padding:16px;" +
      "border:1px solid rgba(255,255,255,.12); border-radius:16px;" +
      "background:rgba(15,18,22,.92); box-shadow:0 18px 60px rgba(0,0,0,.45);";
  panel.onclick = (e) => e.stopPropagation();

  const title =
    overlay.kind === "RULEBOOK"
      ? "룰북"
      : overlay.kind === "SETTINGS" ? "설정"
      : overlay.pile === "deck"
      ? "덱"
      : overlay.pile === "discard"
      ? "버림 더미"
      : overlay.pile === "exhausted"
      ? "소모(이번 전투)"
      : overlay.pile === "vanished"
      ? "소실(영구)"
      : "손패";

  const header = div("overlayHeader");
  header.style.cssText =
    "display:flex; align-items:center; justify-content:space-between; gap:12px; position:sticky; top:0; padding-bottom:12px; margin-bottom:12px; background:rgba(15,18,22,.92);";

  const h = h3(title);
  h.classList.add("overlayTitle");

  const closeBtn = button("닫기", actions.onCloseOverlay, false);
  closeBtn.classList.add("overlayClose");
  closeBtn.style.cssText =
    "padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";

  header.appendChild(h);
  header.appendChild(closeBtn);
  panel.appendChild(header);




  if (overlay.kind === "RULEBOOK") {
    const pre = document.createElement("pre");
    pre.className = "rulebook";
    pre.textContent = RULEBOOK_TEXT;
    pre.style.cssText =
      "white-space:pre-wrap; line-height:1.45; font-size:13px; margin:0; padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:rgba(0,0,0,.18);";
    panel.appendChild(pre);
  } else if (overlay.kind === "SETTINGS") {
    panel.appendChild(renderSettingsPanel(() => {
      if (currentG) {
        normalizeEnemyNameWidth();
        alignHandToBoardAnchor(currentG);
        alignEnemyHudToViewportCenter();
      }
      render(currentG ?? g, actions);
    }, actions));
  } else {

    const uids =
      overlay.pile === "deck"
        ? g.deck
        : overlay.pile === "discard"
        ? g.discard
        : overlay.pile === "exhausted"
        ? g.exhausted
        : overlay.pile === "vanished"
        ? g.vanished
        : g.hand;

    const sortedUids = [...uids].sort((a, b) => {
      const ca = g.cards[a];
      const cb = g.cards[b];
      const na = baseCardName(g, ca.defId);
      const nb = baseCardName(g, cb.defId);
      const nameCmp = na.localeCompare(nb, "ko");
      if (nameCmp !== 0) return nameCmp;
      return (ca.upgrade ?? 0) - (cb.upgrade ?? 0);
    });

    const wrap = div("pileView");
    wrap.style.cssText =
      "display:grid;" +
      "grid-template-columns: 1fr 320px;" +
      "gap:16px;" +
      "align-items:start;";

    const grid = div("pileGrid");
    grid.style.cssText =
      "display:grid;" +
      "grid-template-columns: repeat(auto-fill, minmax(var(--handCardW), 1fr));" +
      "gap:10px;" +
      "align-content:start;" +
      "min-width:0;"+
      "max-height: 62vh;" + 
      "overflow-y: auto;" +
      "overflow-x: hidden;";

    const side = div("pileSide");
    side.style.cssText =
      "position:sticky; top:72px;" +
      "align-self:start;" +
      "border:1px solid rgba(255,255,255,.10);" +
      "border-radius:14px;" +
      "padding:12px;" +
      "background:rgba(0,0,0,.22);";

    const sideTitle = div("pileSideTitle");
    sideTitle.style.cssText = "font-weight:800; margin:0 0 10px 0; opacity:.95;";
    side.appendChild(sideTitle);

    const previewBox = div("pilePreviewBox");
    previewBox.style.cssText =
      "display:flex; justify-content:center; align-items:flex-start;" +
      "padding:8px 0 10px 0;";
    side.appendChild(previewBox);

    const sidePre = document.createElement("pre");
    sidePre.className = "pileSideDetail";
    sidePre.style.cssText =
      "margin:0;" +
      "padding:10px;" +
      "white-space:pre-wrap;" +
      "border-radius:12px;" +
      "border:1px solid rgba(255,255,255,.10);" +
      "background:rgba(0,0,0,.20);" +
      "font-size:12px;" +
      "line-height:1.45;";
    side.appendChild(sidePre);

    // 선택 처리
    let selectedUid: string | null = sortedUids[0] ?? null;

    const renderSide = () => {
      previewBox.innerHTML = "";
      if (!selectedUid) {
        sideTitle.textContent = "선택된 카드 없음";
        sidePre.textContent = "";
        return;
      }
      const def = getCardDefByUid(g, selectedUid);
      const name = displayNameForUid(g, selectedUid);
      sideTitle.textContent = name;

      const big = renderRealCardForOverlay(g, selectedUid);
      previewBox.appendChild(big);

      sidePre.textContent = `전열: ${def.frontText}\n후열: ${def.backText}`;
    };

    if (sortedUids.length === 0) {
      const empty = div("overlayEmpty");
      empty.textContent = "비어 있음";
      empty.style.cssText =
        "padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.03);";
      grid.appendChild(empty);
    } else {
      for (const uid of sortedUids) {
        const thumb = renderRealCardForOverlay(g, uid, (picked) => {
          selectedUid = picked;
          renderSide();
        });
        thumb.style.width = "var(--handCardW)";
        thumb.style.height = "var(--handCardH)";
        thumb.style.boxSizing = "border-box";
        thumb.style.cursor = "pointer";

        const setSelected = () => {
          selectedUid = uid;
          // 선택 강조(간단 링)
          grid.querySelectorAll(".pileSelected").forEach((el) => el.classList.remove("pileSelected"));
          thumb.classList.add("pileSelected");
          renderSide();
        };

        thumb.onclick = setSelected;
        thumb.onmouseenter = setSelected;

        grid.appendChild(thumb);
      }
    }

    wrap.appendChild(grid);
    wrap.appendChild(side);
    panel.appendChild(wrap);

    if (selectedUid) {
      const first = grid.firstElementChild as HTMLElement | null;
      if (first) first.classList.add("pileSelected");
    }
    renderSide();
  }

  layer.appendChild(panel);
  document.body.appendChild(layer);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function renderRelicTray(g: GameState, actions: UIActions) {
  const prev = document.getElementById("relicTray");
  if (prev) prev.remove();

  const ids = g.run.relics ?? [];
  if (ids.length === 0) return;

  const tray = el("div", "relicTray");
  tray.id = "relicTray";

  const tip = el("div", "relicHoverTip");
  tray.appendChild(tip);

  const list = el("div", "relicTrayList");
  tray.appendChild(list);

  const updateTip = () => {
    const id = relicHoverId;
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
      img.src = def.art;
      img.className = "relicIconImg";
      img.alt = disp.name;
      btn.appendChild(img);
    } else {
      btn.textContent = disp.name.slice(0, 1);
    }

    btn.onmouseenter = () => {
      relicHoverId = id;
      updateTip();
    };
    btn.onmouseleave = () => {
      relicHoverId = null;
      updateTip();
    };
    btn.onclick = () => {
      relicModalId = id;
      render(g, actions);
    };

    list.appendChild(btn);
  }

  updateTip();
  document.body.appendChild(tray);
}


function renderChoiceLayer(g: GameState, actions: UIActions) {
  // remove existing
  document.querySelector(".choice-overlay")?.remove();

  const c = g.choice;
  const main = document.querySelector<HTMLElement>(".mainPanel");
  if (!c) {
    main?.classList.remove("choiceOpen");
    return;
  }
  if (!main) return;
  main.classList.add("choiceOpen");


  const CHOICE_DROP = sx(70);
  const PAD_TOP = sx(20) + CHOICE_DROP;
  const PAD_R   = sx(36);
  const PAD_B   = sx(16);
  const PAD_L   = sx(16);

  const GAP_ROW   = sx(18);
  const GAP_LIST  = sx(10);

  const ILLU_SIZE = sx(260);
  const ILLU_MIN  = sx(200);

  const ITEM_R    = sx(14);
  const ITEM_PAD  = sx(12);

  const DETAIL_PAD  = sx(10);
  const DETAIL_R    = sx(12);
  const DETAIL_FS   = sx(12);
  const DETAIL_MAXH = sx(220);

  const TITLE_FS  = sx(22);
  const PROMPT_FS = sx(14);


  const overlayEl = div("choice-overlay");
  overlayEl.style.cssText =
    "position:fixed; inset:0; z-index: var(--zChoice);" +
    "display:flex; justify-content:center; align-items:flex-start;" +
    "pointer-events:auto;";


  const backdrop = div("choice-backdrop");
  backdrop.style.cssText =
    "position:absolute; inset:0;" +
    "background: rgba(0,0,0,.72);" +
    "backdrop-filter: blur(4px);" +
    "-webkit-backdrop-filter: blur(4px);" +
    "pointer-events:auto;";


  backdrop.onclick = () => {

  };

  const padWrap = div("choice-padWrap");
  padWrap.style.cssText =
    "position:relative; width:100%;" +
    `padding:${PAD_TOP}px ${PAD_R}px ${PAD_B}px ${PAD_L}px;` +
    "box-sizing:border-box;" +
    "display:flex; justify-content:center; align-items:flex-start;" +
    "pointer-events:auto;";


  const panel = div("choice-panel");



  panel.style.cssText =
    "position:relative;" +
    "pointer-events:auto;";

  panel.onclick = (e) => e.stopPropagation();

  const titleEl = h2(c.title);
  titleEl.style.cssText =
    `margin:0 0 ${sx(8)}px 0; font-size:${TITLE_FS}px; font-weight:900;` +
    "text-align:left;";
  panel.appendChild(titleEl);

  if (c.prompt) {
    const promptEl = p(c.prompt);
    promptEl.style.cssText =
      `margin:0 0 ${sx(12)}px 0; font-size:${PROMPT_FS}px; line-height:1.25; opacity:.95;`;
    panel.appendChild(promptEl);
  }


  const fixPreviewSize = (cardEl: HTMLElement) => {
    cardEl.style.width = "var(--handCardW)";
    cardEl.style.height = "var(--handCardH)";
    cardEl.style.boxSizing = "border-box";
  };

  const makeDetailPre = (detail: any) => {
    const pre = document.createElement("pre");
    pre.className = "choice-detail";
    pre.textContent = String(detail);
    pre.style.cssText =
      `margin:${sx(10)}px 0 0 0; padding:${DETAIL_PAD}px;` +
      "white-space:pre-wrap;" +
      `border-radius:${DETAIL_R}px; border:1px solid rgba(255,255,255,.10);` +
      "background:rgba(0,0,0,.22);" +
      `font-size:${DETAIL_FS}px; line-height:1.45;` +
      `max-height:${DETAIL_MAXH}px; overflow:auto;`;
    return pre;
  };

  const makeItemShell = () => {
    const item = div("choice-item");
    item.style.cssText =
      "display:flex;" +
      `gap:${sx(12)}px;` +
      "align-items:flex-start;" +
      `border:1px solid rgba(255,255,255,.10); border-radius:${ITEM_R}px;` +
      `padding:${ITEM_PAD}px;` +
      "background:rgba(255,255,255,.03);";
    return item;
  };

  const hasCardPreview = c.options.some((opt) => {
    if ((opt as any).cardUid) return true;
    return typeof opt.key === "string" && opt.key.startsWith("pick:");
  });


  if (!hasCardPreview) {
    const contentRow = div("choice-contentRow");
    contentRow.style.cssText =
      "display:flex;" +
      `gap:${GAP_ROW}px; margin-top:${sx(12)}px;` +
      "justify-content:center; align-items:stretch;";

    const leftCol = div("choice-leftCol");
    leftCol.style.cssText =
      `flex:1 1 ${sx(640)}px; max-width:${sx(720)}px; min-width:0;` +
      "display:flex; flex-direction:column;";

    const list = div("choice-list");
    list.style.cssText = `display:flex; flex-direction:column; gap:${GAP_LIST}px;`;

    c.options.forEach((opt) => {
      const item = makeItemShell();

      const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
      b.classList.add("choiceOptBtn");
      b.style.fontSize = `${sx(14)}px`;
      b.style.padding = `${sx(10)}px ${sx(12)}px`;
      b.style.borderRadius = `${sx(10)}px`;
      item.appendChild(b);

      if ((opt as any).detail) item.appendChild(makeDetailPre((opt as any).detail));
      list.appendChild(item);
    });

    leftCol.appendChild(list);

    const illuCol = div("choice-illuCol");
    illuCol.style.cssText =
      `flex:0 0 ${ILLU_SIZE}px; min-width:${ILLU_MIN}px;` +
      "display:flex; align-items:center; justify-content:center;";

    const illuBox = div("choice-illuBox");
    illuBox.style.cssText =
      "width:100%; aspect-ratio:1/1;" +
      `border-radius:${sx(18)}px; border:1px solid rgba(255,255,255,.16);` +
      "background:rgba(0,0,0,.35);" +
      "position:relative; overflow:hidden;" +
      "box-shadow: 0 10px 30px rgba(0,0,0,.35);";

    const art = (c as any).art as string | undefined;
    if (art) {
      const img = document.createElement("img");
      img.src = art;
      img.alt = c.title ?? "illustration";
      const ZOOM = 1.5;
      (img.style as any).imageRendering = "pixelated";
      img.style.cssText =
        "position:absolute; inset:0;" +
        `width:${ZOOM * 100}%; height:${ZOOM * 100}%;` +
        `left:${-(ZOOM - 1) * 50}%; top:${-(ZOOM - 1) * 50}%;` +
        "object-fit:cover; object-position:50% 50%;" +
        "image-rendering: pixelated; image-rendering: crisp-edges;";
      illuBox.appendChild(img);
    }

    illuCol.appendChild(illuBox);

    contentRow.appendChild(leftCol);
    contentRow.appendChild(illuCol);
    panel.appendChild(contentRow);
  }


  else {
    const list = div("choice-list");
    list.style.cssText =
      "display:flex; flex-direction:column;" +
      `gap:${GAP_LIST}px; margin-top:${sx(12)}px;`;

    c.options.forEach((opt) => {
      const item = makeItemShell();

      const left = div("choice-left");
      left.style.cssText = "flex:0 0 auto;";

      const uid = (opt as any).cardUid as string | undefined;
      if (uid) {
        const isUpgradePick = g.choice?.kind === ("UPGRADE_PICK" as any);
        const card = g.cards[uid];
        const nextUp = (card.upgrade ?? 0) + 1;

        let el: HTMLElement;
        try {
          el = isUpgradePick
            ? renderCardPreviewByUidWithUpgrade(g, uid, nextUp)
            : (renderRealCardForOverlay(g, uid) as HTMLElement);
        } catch {
          el = renderRealCardForOverlay(g, uid) as HTMLElement;
        }

        fixPreviewSize(el);
        left.appendChild(el);
      } else if (typeof opt.key === "string" && opt.key.startsWith("pick:")) {
        const payload = opt.key.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        const el = renderCardPreviewByDef(g, defId, upgrade) as HTMLElement;
        fixPreviewSize(el);
        left.appendChild(el);
      }

      const right = div("choice-right");
      right.style.cssText = `flex:1 1 auto; min-width:${sx(260)}px;`;

      const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
      b.classList.add("primary");
      b.style.fontSize = `${sx(14)}px`;
      b.style.padding = `${sx(10)}px ${sx(12)}px`;
      b.style.borderRadius = `${sx(10)}px`;
      right.appendChild(b);

      if ((opt as any).detail) right.appendChild(makeDetailPre((opt as any).detail));

      item.appendChild(left);
      item.appendChild(right);
      list.appendChild(item);
    });

    panel.appendChild(list);
  }

  padWrap.appendChild(panel);
  overlayEl.appendChild(backdrop);
  overlayEl.appendChild(padWrap);
  document.body.appendChild(overlayEl);
}



/* =========================
   COMBAT UI — top HUD + battlefield + hand
   ========================= */

// Top HUD (Player left + Enemies center + Top-right controls)
function renderTopHud(g: GameState, actions: UIActions) {
  document.querySelectorAll(".topHud").forEach((el) => el.remove());
  document.querySelectorAll(".enemyHudCenter").forEach((el) => el.remove());

  const top = div("topHud");
  top.appendChild(div("topHudLeftSpacer"));

  const left = div("playerHudLeft");


  const titleRow = div("playerTitleRow");
  titleRow.appendChild(divText("playerHudTitle", "플레이어"));

  const piles = div("pileButtons");
  piles.appendChild(mkButton("덱", () => actions.onViewPile("deck")));
  piles.appendChild(mkButton("버림", () => actions.onViewPile("discard")));
  piles.appendChild(mkButton("손패", () => actions.onViewPile("hand")));
  piles.appendChild(mkButton("소모", () => actions.onViewPile("exhausted")));
  piles.appendChild(mkButton("소실", () => actions.onViewPile("vanished")));
  titleRow.appendChild(piles);

  left.appendChild(titleRow);

  const pbox = div("enemyChip");
  pbox.classList.add("playerHudBox");

  const hpTop = div("enemyChipTop");
  hpTop.appendChild(divText("", "HP"));
  hpTop.appendChild(divText("", `${g.player.hp}/${g.player.maxHp}`));
  pbox.appendChild(hpTop);

  const hpOuter = div("enemyHPOuter");
  const hpFill = div("enemyHPFill");
  hpFill.style.width = `${Math.max(0, Math.min(100, (g.player.hp / Math.max(1, g.player.maxHp)) * 100))}%`;
  hpOuter.appendChild(hpFill);
  pbox.appendChild(hpOuter);

  const blTop = div("enemyChipTop");
  blTop.appendChild(divText("", "블록"));
  blTop.appendChild(divText("", `${g.player.block}`));
  pbox.appendChild(blTop);

  const blOuter = div("enemyHPOuter");
  const blFill = div("enemyHPFill");
  blFill.style.background = "linear-gradient(90deg, #64b5ff, #2a7cff)";
  blFill.style.width = `${Math.max(0, Math.min(100, (g.player.block / Math.max(1, g.player.maxHp)) * 100))}%`;
  blOuter.appendChild(blFill);
  pbox.appendChild(blOuter);

  const pst = g.player.status;
  const pBadges = div("enemyBadges");
  pbox.appendChild(pBadges);

  const pBadgeList: string[] = [];
  if ((pst.vuln ?? 0) > 0) pBadgeList.push(`취약 ${pst.vuln}`);
  if ((pst.weak ?? 0) > 0) pBadgeList.push(`약화 ${pst.weak}`);
  if ((pst.bleed ?? 0) > 0) pBadgeList.push(`출혈 ${pst.bleed}`);
  if ((pst.disrupt ?? 0) > 0) pBadgeList.push(`교란 ${pst.disrupt}`);

  for (const t of pBadgeList) pBadges.appendChild(badge(t));

  left.appendChild(pbox);

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  if (inCombat) {
    const center = div("enemyHudCenter");
    const mover = div("enemyHudCenterMover");
    const enemiesWrap = div("enemyHud");

    enemiesWrap.style.cssText = `
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      justify-content: center;
      align-items: stretch;
      gap: 14px;
      overflow: visible;
      white-space: nowrap;
    `;
    center.style.overflow = "visible";
    mover.style.overflow = "visible";
    mover.style.width = "max-content";

    const targeting = isTargeting(g);

    mover.appendChild(enemiesWrap);
    center.appendChild(mover);
    document.body.appendChild(center);

    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      const banner = div("enemyBanner enemyCardWrap");

      if (targeting && e.hp > 0) banner.classList.add("targetable");
      banner.onclick = () => actions.onSelectEnemy(i);

      const artWrap = div("enemyArtWrap");
      const artCard = div("enemyArtCard");

      // CSS var로 URL 주입
      artWrap.style.setProperty("--frameImg", `url("assets/enemies/enemies_frame.png")`);
      artWrap.style.setProperty("--artImg", `url("${enemyArtUrl(e.id)}")`);
      artWrap.appendChild(artCard);

      const mini = div("enemyMiniHud");

      const def = g.content.enemiesById[e.id];
      const intent = def.intents[e.intentIndex % def.intents.length];
      const label = e.intentLabelOverride ?? intent.label;

      const pv = g.intentsRevealedThisTurn
        ? buildIntentPreview(g, e, intent, { includeBlock: false })
        : null;

      const topRow = div("enemyIntentTopRow");

      let icon = "？";
      let dmgText = "";

      if (g.intentsRevealedThisTurn && pv) {
        icon = computeIntentIconFromPreview(pv);
        dmgText = computeIntentDamageText(g, e, pv) ?? "";
      } else {
        icon = "？";
        dmgText = "";
      }

      topRow.appendChild(divText("enemyIntentIcon", icon));
      topRow.appendChild(divText("enemyIntentDmg", dmgText));

      mini.appendChild(topRow);

      const hpLine = div("enemyHpLine");
      hpLine.appendChild(divText("enemyHpText", `HP ${e.hp}/${e.maxHp}`));

      const hpOuter = div("enemyHPOuter");
      const hpFill = div("enemyHPFill");
      hpFill.style.width = `${Math.max(0, Math.min(100, (e.hp / Math.max(1, e.maxHp)) * 100))}%`;
      hpOuter.appendChild(hpFill);
      hpLine.appendChild(hpOuter);
      mini.appendChild(hpLine);

      mini.appendChild(renderStatusEmojiRow(e.status, e.immuneThisTurn));

      const hover = div("enemyHoverDetail");
      const st = e.status;
      const lines: string[] = [];
      if ((st.vuln ?? 0) > 0) lines.push(`취약 ${st.vuln}`);
      if ((st.weak ?? 0) > 0) lines.push(`약화 ${st.weak}`);
      if ((st.bleed ?? 0) > 0) lines.push(`출혈 ${st.bleed}`);
      if ((st.disrupt ?? 0) > 0) lines.push(`교란 ${st.disrupt}`);
      if (e.immuneThisTurn) lines.push("면역");

      hover.textContent =
        (g.enemies[i].name) + `\n \n` +
        (g.intentsRevealedThisTurn ? `${label}\n \n` : "") +
        (lines.length ? `상태: ${lines.join(", ")}` : "상태: 없음");

      banner.appendChild(artWrap);
      banner.appendChild(mini);
      banner.appendChild(hover);

      enemiesWrap.appendChild(banner);
    }
  }

  top.appendChild(left);

  const right = div("topHudRight");

  right.appendChild(mkButton("룰북", () => actions.onViewRulebook()));
  right.appendChild(mkButton("로그", () => actions.onToggleLogOverlay()));
  right.appendChild(mkButton("설정", () => {
    overlay = { kind: "SETTINGS" };
    render(g, actions);
  }));
  top.appendChild(right);

  return top;
}

function buildResourceText(g: GameState): string {
  const inCombat = g.enemies.length > 0 && g.phase !== "NODE";
  const bonusS = g.run.nextBattleSuppliesBonus ?? 0;

  const parts: string[] = [];

  if (inCombat) {
    parts.push(`🌾 S ${g.player.supplies} |`);
  } else {
    if (bonusS > 0) parts.push(`보너스 🌾 S +${bonusS} |`);
  }

  parts.push(`💤 F ${g.player.fatigue}`);
  parts.push(`| ⏳ 시간 ${Math.max(0, (g.run.nodePickCount ?? 0) + (g.time ?? 0))}`);
  parts.push(`| 🃏 덱 ${g.deck.length}`);

  return parts.join(" ");
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
  row.style.gap = "12px";

  const title = document.createElement("h2");
  title.textContent = "";
  row.appendChild(title);

  const hintText = getTargetHintText(g);

  const warn = divText("targetHintInline", "");
  warn.style.cssText =
    "padding:5px 10px; border-radius:12px; border:1px solid rgba(0,0,0,.55);" +
    "background: rgb(255, 0, 0);" +
    "opacity:.9;" +
    "font-weight:400; font-size:12px; line-height:1.2;" +
    "white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" +
    "width: min(240px, 92vw);" +
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
    "display:flex; align-items:center; gap:10px;" +
    "flex: 0 0 auto;" +
    "white-space:nowrap;" +
    "position:relative;";

  const res = div("resourceRow inline");
  res.appendChild(chipEl(``));
  res.appendChild(chipEl(``));
  res.appendChild(chipEl(``));
  right.appendChild(res);

  warn.style.position = "absolute";
  warn.style.right = "207px";
  warn.style.top = "calc(100% - 8px)";
  warn.style.marginTop = "0px";
  warn.style.zIndex = "5";
  warn.style.pointerEvents = hintText ? "auto" : "none";
  row.appendChild(warn);

  row.appendChild(right);

  return row;
}



function renderLogHeaderRow(collapsed: boolean, onToggle: () => void) {
  const row = div("logHeaderRow");
  row.tabIndex = 0;

  const title = document.createElement("h2");
  title.textContent = "로그";

  const chev = document.createElement("span");
  chev.className = "chev";
  chev.textContent = collapsed ? "▸" : "▾";

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

  const tail = reasonLabel ? ` — ${reasonLabel}` : "";

  const qn = g.pendingTargetQueue?.length ?? 0;
  const remaining = (g.pendingTarget ? 1 : 0) + qn;
  const idxInfo = remaining > 1 ? ` (남은 ${remaining}개)` : ` (남은 1개)`;

  return `${head}${tail}${idxInfo}`;
}

function renderCombat(root: HTMLElement, g: GameState, actions: UIActions) {
  const wrap = div("combatRoot");
  const board = div("boardArea");

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  board.classList.toggle("slabOn", inCombat);


  const slotsWrap = div("boardSlotsWrap");

  slotsWrap.style.paddingTop = `${sx(6)}px`;

  slotsWrap.appendChild(renderSlotsGrid(g, actions, "front"));
  slotsWrap.appendChild(renderSlotsGrid(g, actions, "back"));

  board.appendChild(slotsWrap);

  wrap.appendChild(board);
  root.appendChild(wrap);
}



let lastEnterAction: (() => void) | null = null;
let lastEnterDisabled = true;

function setEnterAction(fn: (() => void) | null, disabled: boolean) {
  lastEnterAction = fn;
  lastEnterDisabled = disabled;
}

function computeNextStep(g: GameState, actions: UIActions, targeting: boolean) {
  if (g.run.finished) return { label: "종료", fn: null, disabled: true, activePhase: g.phase };
  if (g.choice || overlay) return { label: "선택 중", fn: null, disabled: true, activePhase: g.phase };
  if (targeting) return { label: "대상 선택", fn: null, disabled: true, activePhase: g.phase };
  if (g.phase === "NODE") return { label: "노드 선택", fn: null, disabled: true, activePhase: g.phase };

  if (g.phase === "PLACE") {
    const needScout = g.enemies.length > 0 && !g.intentsRevealedThisTurn;
    if (needScout) return { label: "다음: 정찰", fn: actions.onRevealIntents, disabled: false, activePhase: g.phase };
    return { label: "다음: 후열", fn: actions.onResolveBack, disabled: false, activePhase: g.phase };
  }
  if (g.phase === "BACK") return { label: "다음: 후열", fn: actions.onResolveBack, disabled: false, activePhase: g.phase };


  if (g.phase === "FRONT") return { label: "다음: 전열", fn: actions.onResolveFront, disabled: false, activePhase: g.phase };


  if (g.phase === "ENEMY") return { label: "다음: 적", fn: actions.onResolveEnemy, disabled: false, activePhase: g.phase };

  if (g.phase === "UPKEEP") return { label: "다음: 정리", fn: actions.onUpkeep, disabled: false, activePhase: g.phase };
  if (g.phase === "DRAW") return { label: "다음 턴", fn: actions.onDrawNextTurn, disabled: false, activePhase: g.phase };



  return { label: "다음", fn: null, disabled: true, activePhase: g.phase };
}


function renderHandDock(g: GameState, actions: UIActions, targeting: boolean) {
  const old = document.querySelector(".handDock");
  if (old) old.remove();

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";

  document.querySelector(".combatControls")?.remove();

  const dock = div("handDock");

  const step = computeNextStep(g, actions, targeting);

  if (inCombat) {
    const controls = div("combatControls");

    const nextTurnBtn = document.createElement("button");
    nextTurnBtn.textContent = "다음 턴";
    nextTurnBtn.className = "stepBtn primary";
    nextTurnBtn.disabled = step.disabled || g.phase === "NODE";
    nextTurnBtn.onclick = () => actions.onAutoAdvance();

    const clear = document.createElement("button");
    clear.textContent = "선택 해제";
    clear.className = "clearBtn primary";
    clear.disabled = !g.selectedHandCardUid;
    clear.onclick = actions.onClearSelected;

    controls.appendChild(nextTurnBtn);
    controls.appendChild(clear);

    document.body.appendChild(controls);

    const slot = document.querySelector<HTMLElement>(`.slot[data-slot-side="front"][data-slot-index="1"]`)
      ?? document.querySelector<HTMLElement>(".stageInner");
    if (slot) {
      const r = slot.getBoundingClientRect();
      const centerX = r.left + r.width / 2;
      controls.style.left = `${Math.round(centerX)}px`;
    }

    setEnterAction(() => actions.onAutoAdvance(), nextTurnBtn.disabled);
  } else {
    setEnterAction(null, true);
  }

  const hand = div("hand");
  hand.dataset.dropHand = "1";
  const row = div("handCardsRow");
  hand.appendChild(row);

  if (g.hand.length === 0) {
    const hint = div("handEmptyHint");
    hint.textContent = "";
    row.appendChild(hint);
  } else {
    for (const uid of g.hand) row.appendChild(renderCard(g, uid, true, actions.onSelectHandCard, { draggable: true }));
  }

  dock.appendChild(hand);
  document.body.appendChild(dock);

  enableHorizontalWheelScroll(hand);
}

function enableHorizontalWheelScroll(el: HTMLElement) {
  if ((el as any).dataset?.wheelX === "1") return;
  (el as any).dataset.wheelX = "1";
  el.addEventListener(
    "wheel", (e) => {
      // shift+휠은 원래대로(세로 스크롤)
      if (e.shiftKey) return;
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      el.scrollLeft += dx;
      e.preventDefault();
    },
    { passive: false }
  );
}

//손패 UI



function alignEnemyHudToViewportCenter() {
  const hud = document.querySelector<HTMLElement>(".enemyHudCenter");
  if (!hud) return;

  const mover = hud.querySelector<HTMLElement>(".enemyHudCenterMover") ?? hud;
  const wrap =
    hud.querySelector<HTMLElement>(".enemyHud") ??
    hud.querySelector<HTMLElement>(".enemyStrip") ??
    mover;

  hud.style.position = "fixed";

  const topHudEl = document.querySelector<HTMLElement>(".topHud");
  const safeTop = 8;
  const gap = 10;
  const top =
    topHudEl ? Math.round(topHudEl.getBoundingClientRect().bottom + gap) : safeTop;

  hud.style.top = `${top}px`;

  hud.style.top = "8px";
  hud.style.left = "50%";
  hud.style.right = "auto";
  hud.style.transform = "translateX(-50%)";
  hud.style.overflow = "visible";

  mover.style.transform = "";
  mover.style.overflow = "visible";

  const banners = Array.from(hud.querySelectorAll<HTMLElement>(".enemyBanner"));
  const n = banners.length;
  if (n === 0) {
    hud.style.width = "";
    return;
  }

  const GAP = 14;

  const oneW = Math.ceil(banners[0].getBoundingClientRect().width) || 460;
  const capW = Math.max(320, Math.floor(window.innerWidth - 16));

  const W1 = Math.min(capW, oneW);
  const W2 = Math.min(capW, oneW * 2 + GAP);
  const W3 = Math.min(capW, oneW * 3 + GAP * 2);

  wrap.style.display = "flex";
  wrap.style.flexWrap = "nowrap";
  wrap.style.justifyContent = "center";
  wrap.style.alignItems = "stretch";
  (wrap.style as any).gap = `${GAP}px`;

  hud.style.width = `${n === 1 ? W1 : n === 2 ? W2 : W3}px`;
  mover.style.width = "100%";
}

function alignHandToBoardAnchor(_g: GameState) {
  const hand = document.querySelector<HTMLElement>(".hand");
  const row  = document.querySelector<HTMLElement>(".handCardsRow");
  if (!hand || !row) return;

  const slot = document.querySelector<HTMLElement>(
    `.slot[data-slot-side="front"][data-slot-index="1"]`
  );
  const stage = document.querySelector<HTMLElement>(".stageInner");
  const anchorRect = slot?.getBoundingClientRect() ?? stage?.getBoundingClientRect();
  if (!anchorRect) return;

  const anchorX = anchorRect.left + anchorRect.width / 2;

  const cards = Array.from(row.querySelectorAll<HTMLElement>(".card"));
  if (cards.length === 0) return;

  const firstR = cards[0].getBoundingClientRect();
  const lastR  = cards[cards.length - 1].getBoundingClientRect();
  const contentLeftViewport  = firstR.left;
  const contentRightViewport = lastR.right;
  const contentCenterViewport = (contentLeftViewport + contentRightViewport) / 2;

  const deltaViewport = anchorX - contentCenterViewport;

  const rowW = row.scrollWidth;
  const viewW = hand.clientWidth;

  if (rowW <= viewW + 1) {
    row.style.transform = `translateX(${Math.round(deltaViewport)}px)`;
    hand.scrollLeft = 0;
    return;
  }

  let next = hand.scrollLeft - deltaViewport;

  const maxScroll = Math.max(0, rowW - viewW);
  if (next < 0) next = 0;
  if (next > maxScroll) next = maxScroll;

  hand.scrollLeft = Math.round(next);
  row.style.transform = ""; // 스크롤 모드에서는 transform 끄기
}

function applySlotCardScale(slotEl: HTMLElement, scalerEl: HTMLElement) {
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
  const MAX = 1.00;
  s = Math.max(MIN, Math.min(MAX, s));

  scalerEl.style.setProperty("--slotCardScale", String(s));
}

function renderSlotsGrid(g: GameState, actions: UIActions, side: Side) {
  const grid = div("grid6");
  const hasSelected = !!g.selectedHandCardUid;
  const slots = side === "front" ? g.frontSlots : g.backSlots;

  for (let i = 0; i < 3; i++) {
    const disabled = side === "back" ? !!g.backSlotDisabled?.[i] : false;

    const s = div("slot" + (disabled ? " disabled" : ""));
    s.dataset.slotSide = side;
    s.dataset.slotIndex = String(i);

    if (hoverSlot && hoverSlot.side === side && hoverSlot.idx === i) s.classList.add("dropHover");
    if (hasSelected && !disabled) s.classList.add("placeable");

    const uid = slots[i];
    if (uid) {
      const mode: CardRenderMode = (uiSettings as any).slotCardMode === "NAME_ONLY"
        ? "SLOT_NAME_ONLY"
        : "FULL";

      const cardEl = renderCard(g, uid, false, undefined, {
        draggable: false,
        mode,
        hoverPreview: {
          root: document.body,
          api: cardHoverApi,
          buildDetail: (gg, u) => {
            const def = getCardDefByUid(gg, u);
            return `전열: ${def.frontText}\n후열: ${def.backText}`;
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
        if (isTargeting(g)) return;
        if (g.phase !== "PLACE") return;
        beginDrag(ev as any, { kind: "slot", cardUid: uid, fromSide: side, fromIdx: i });
      };
      cardEl.ondblclick = () => actions.onReturnSlotToHand(side, i);

      requestAnimationFrame(() => applySlotCardScale(s, scaler));
    }
    grid.appendChild(s);
  }
  return grid;
}




/* =========================
   INPUT — drag, targeting, global handlers
   ========================= */

// Drag + Keyboard

function updateSlotHoverUI() {

  document.querySelectorAll(".slot.dropHover").forEach((el) => el.classList.remove("dropHover"));

  if (!hoverSlot) return;
  const sel = `.slot[data-slot-side="${hoverSlot.side}"][data-slot-index="${hoverSlot.idx}"]`;
  const el = document.querySelector<HTMLElement>(sel);
  if (el) el.classList.add("dropHover");
}

let inputBound = false;

function bindGlobalInput(getG: () => GameState, actions: UIActions) {
  if (inputBound) return;
  inputBound = true;


  window.addEventListener("pointermove", (ev) => {
    const g = getG();
    if (g.choice || overlay) return;
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
    updateSlotHoverUI();}, { passive: true });

  window.addEventListener("pointerup", (ev) => {
    const g = getG();
    if (g.choice || overlay) return;
    if (!drag || ev.pointerId !== drag.pointerId) return;


    if (drag.dragging) {
      const dropHand = hitTestHand(ev.clientX, ev.clientY);
      const dropSlot = hitTestSlot(ev.clientX, ev.clientY, g);

      if (dropHand && drag.kind === "slot" && drag.fromSide != null && drag.fromIdx != null) {
        if (!g.run.finished && !isTargeting(g) && g.phase === "PLACE") {
          actions.onReturnSlotToHand(drag.fromSide, drag.fromIdx);
        }
        drag = null;
        hoverSlot = null;
        render(g, actions);
        return;
      }


      if (dropSlot) {
        if (drag.kind === "hand") {
          const g = getG();
          if (g.run.finished || isTargeting(g) || g.phase !== "PLACE") {
          } else {
            const side = dropSlot.side;
            const idx = dropSlot.idx;
            if (side === "back" && g.backSlotDisabled?.[idx]) {
            } else {
              const slots = side === "front" ? g.frontSlots : g.backSlots;
              const uidHere = slots[idx];

              if (!uidHere) {
                actions.onPlaceHandUidToSlot(drag.cardUid, side, idx);
              } else {
                const handIdx =
                  drag.fromHandIndex != null && drag.fromHandIndex >= 0 ? drag.fromHandIndex : g.hand.indexOf(drag.cardUid);

                const realIdx = g.hand.indexOf(drag.cardUid);
                if (realIdx >= 0) g.hand.splice(realIdx, 1);

                slots[idx] = drag.cardUid;
                g.cards[drag.cardUid].zone = side;

                const insertAt = handIdx != null && handIdx >= 0 && handIdx <= g.hand.length ? handIdx : g.hand.length;
                g.hand.splice(insertAt, 0, uidHere);
                g.cards[uidHere].zone = "hand";

                g.selectedHandCardUid = null;

                normalizePlacementCounters(g);

                logMsg(g, `[${cardDisplayNameByUid(g, drag.cardUid)}] ↔ [${cardDisplayNameByUid(g, uidHere)}] 스왑: 손패 ↔ ${side}${idx + 1}`);
                render(g, actions);
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
    render(g, actions);
  });

  window.addEventListener("keydown", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

    const g = getG();

    if (isDevConsoleOpen()) return;

    if (ev.ctrlKey && ev.shiftKey && ev.code === "KeyK") {
      ev.preventDefault();
      toggleDevConsole();
      return;
    }

    // 새로운 런: P
    if (ev.code === "KeyP") {
      ev.preventDefault();
      actions.onNewRun();
      return;
    }

    // 취소: 4
    if (ev.code === "Digit4") {
      ev.preventDefault();

      // 타겟 선택 중이면 타겟 선택 자체 취소
      if (isTargeting(g)) {
        g.pendingTarget = null;
        g.pendingTargetQueue = [];
        (g as any).selectedEnemyIndex = null;
        logMsg(g, "대상 선택 취소");
        render(g, actions);
        return;
      }

      // 그냥 선택 해제
      actions.onClearSelected();
      return;
    }
  
    // 카드 교체: Tab
    if (ev.key === "Tab") {
      ev.preventDefault();
      if (g.hand.length === 0) return;

      const cur = g.selectedHandCardUid;
      const idx = cur ? g.hand.indexOf(cur) : -1;
      const dir = ev.shiftKey ? -1 : 1;
      const next = ((idx + dir) % g.hand.length + g.hand.length) % g.hand.length;
      g.selectedHandCardUid = g.hand[next];
      render(g, actions);
      return;
    }

    // 턴 넘기기: Space
    if (ev.code === "Space") {
      ev.preventDefault();
      const g = getG();
      if (g.run.finished) return;
      if (g.choice) return;
      if (isTargeting(g)) return;

      actions.onAutoAdvance();
      return;
    }

    // 전열 배치(또는 타겟 선택): 1,2,3
    if (ev.code === "Digit1" || ev.code === "Digit2" || ev.code === "Digit3") {
      ev.preventDefault();
      const idx = ev.code === "Digit1" ? 0 : ev.code === "Digit2" ? 1 : 2;

      // 1) 타겟 선택 상태면: 적 선택(1~3)
      if (isTargeting(g)) {
        // 살아있는 적만 선택 허용
        const e = g.enemies[idx];
        if (!e || e.hp <= 0) {
          logMsg(g, `대상 선택 실패: ${idx + 1}번 적이 없습니다.`);
          render(g, actions);
          return;
        }

        actions.onSelectEnemy(idx);
        return;
      }

      // 2) 전열 핫키
      actions.onHotkeySlot("front", idx);
      return;
    }

    // 후열 배치: Q,W,E
    if (ev.code === "KeyQ" || ev.code === "KeyW" || ev.code === "KeyE") {
      ev.preventDefault();
      const idx = ev.code === "KeyQ" ? 0 : ev.code === "KeyW" ? 1 : 2;
      actions.onHotkeySlot("back", idx);
      return;
    }

    if (ev.code === "Enter") {
      ev.preventDefault();
      if (!lastEnterDisabled && lastEnterAction) lastEnterAction();
      return;
    }
  });

}

function beginDrag(
  ev: PointerEvent,
  init: { kind: "hand" | "slot"; cardUid: string; fromHandIndex?: number; fromSide?: Side; fromIdx?: number }
) {

  suppressHover(250);
  clearCardHoverPreview();

  const target = ev.currentTarget as HTMLElement;
  try { target.setPointerCapture(ev.pointerId); } catch {}

  const cardEl = target.closest(".card") as HTMLElement | null;

  if (cardEl) cardEl.classList.add("isDraggingSource");

  const r = cardEl?.getBoundingClientRect();

  const grabDX = r ? (ev.clientX - r.left) : 20;
  const grabDY = r ? (ev.clientY - r.top) : 20;

  // 손패 카드 크기 fallback: CSS 변수 기반으로라도 고정되게
  const css = getComputedStyle(document.documentElement);
  const handW = parseFloat(css.getPropertyValue("--handCardW")) || undefined;
  const handH = parseFloat(css.getPropertyValue("--handCardH")) || undefined;

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
    previewW: r?.width ?? handW,
    previewH: r?.height ?? handH,
    grabDX,
    grabDY,
  };

  if (cardEl) {
    drag.sourceEl = cardEl;
    const clone = cardEl.cloneNode(true) as HTMLElement;

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

    drag.previewEl = clone;
  }
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

  if (side === "back" && g.backSlotDisabled?.[idx]) return null;
  return { side, idx };
}


function closestWithDatasetKeys(el: HTMLElement, keys: string[]): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    const ds = cur.dataset as Record<string, string | undefined>;
    let ok = true;
    for (const k of keys) {
      if (ds[k] == null) {
        ok = false;
        break;
      }
    }
    if (ok) return cur;
    cur = cur.parentElement;
  }
  return null;
}
function renderDragOverlay(_app: HTMLElement, g: GameState) {

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
  wrap.style.left = `${Math.round(drag.x - (drag.grabDX ?? 20))}px`;
  wrap.style.top  = `${Math.round(drag.y - (drag.grabDY ?? 20))}px`;

  const w = drag.previewW ?? 0;
  const h = drag.previewH ?? 0;
  if (w > 0) wrap.style.width  = `${Math.round(w)}px`;
  if (h > 0) wrap.style.height = `${Math.round(h)}px`;

  wrap.style.transform = "none";
  wrap.style.opacity = "1";
  wrap.style.filter = "none";
  wrap.style.boxShadow = "0 16px 44px rgba(0,0,0,.65)";
  (wrap.style as any).backdropFilter = "none";
  wrap.style.isolation = "isolate";
  wrap.style.mixBlendMode = "normal";

  wrap.style.overflow = "hidden";
  wrap.style.borderRadius = "16px";
  wrap.style.background = "transparent";
  wrap.style.clipPath = "inset(0 round 16px)";
  wrap.appendChild(drag.previewEl);
  layer.appendChild(wrap);
}

