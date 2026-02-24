



import { setDevConsoleCtx, renderDevConsole, toggleDevConsole, isDevConsoleOpen } from "./dev_console";
import { drawNineSlice } from "./nineslice";
import type { GameState, PileKind, Side, IntentCategory, IntentPreview, DungeonMap, MapNode } from "../engine/types";
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
} from "../engine/combat";
import { logMsg, pushUiToast } from "../engine/rules";
import { createInitialState } from "../engine/state";
import { applyChoiceKey } from "../engine/choiceApply";
import { openShopChoice } from "../engine/engineRewards";
import { useItemAt, discardItemAt, getItemCap } from "../engine/items";
import type { EventOutcome } from "../content/events";
import { pickEventByMadness, getEventById } from "../content/events";
import { removeCardByUid, addCardToDeck, offerRewardsByFatigue, canUpgradeUid, upgradeCardByUid, obtainTreasure } from "../content/rewards";
import { getCardDefByIdWithUpgrade } from "../content/cards";
import { getItemDefById } from "../content/items";

import { saveGame, hasSave, loadGame, clearSave } from "../persist";

import { RELICS_BY_ID } from "../content/relicsContent";
import { getRelicDisplay, getUnlockProgress, checkRelicUnlocks } from "../engine/relics";


import { buildIntentPreview } from "../engine/intentPreview";
import {
  GOD_LINES,
  ensureFaith,
  getMadnessBane,
  getMadnessBoon,
  getPatronGodOrNull,
  godAbilityBlock,
  godArt,
  godName,
  isForgeHostile,
  isHostile,
  onEnterRestExplorationHooks,
  openFaithStartChoice,
  openGodTemptChoice,
  pickTemptingGod,
  wingArteryMoveDelta,
} from "../engine/faith";

import { setSOnlyHud } from "./s_only_hud";


const RULEBOOK_TEXT = `# Deck Rogue Prototype — 룰북 (플레이어용)

이 문서는 스포일러를 최소화합니다.

[1] 개요
노드를 선택하며 진행하고, 전투에서 살아남아 성장합니다. 목표는 무엇일까요?
→ 던전 깊숙한 곳의 [저주받은 보물]을 얻고, 입구(START)로 되돌아오면 승리합니다.
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


let _ASSET_BASE: string | null = null;

let _itemTip: HTMLDivElement | null = null;
let _faithTip: HTMLDivElement | null = null;

function ensureItemTip(): HTMLDivElement {
  if (_itemTip) return _itemTip;
  const tip = document.createElement("div");
  tip.id = "itemHoverTip";
  tip.className = "itemHoverTip relicHoverTip"; // relic 룩 재사용
  tip.style.pointerEvents = "none";
  tip.style.position = "fixed";
  tip.style.left = "0";
  tip.style.top = "0";
  tip.style.zIndex = "70000"; // zChoice(52000)보다 위
  document.body.appendChild(tip);
  _itemTip = tip;
  return tip;
}

function setItemTipContent(itemId: string) {
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

function moveItemTip(clientX: number, clientY: number) {
  const tip = ensureItemTip();

  const u = unitLenDev();
  const padU = 12;
  const offU = 14;

  const pad = padU * u;
  const off = offU * u;

  let x = clientX + off;
  let y = clientY + off;

  // 먼저 대략 위치
  tip.style.left = lenFromDev(x);
  tip.style.top = lenFromDev(y);

  // 화면 밖 나가면 클램프 (내용 반영된 후 크기 기준)
  const r = tip.getBoundingClientRect();

  if (x + r.width + pad > window.innerWidth) x = window.innerWidth - r.width - pad;
  if (y + r.height + pad > window.innerHeight) y = window.innerHeight - r.height - pad;
  if (x < pad) x = pad;
  if (y < pad) y = pad;

  tip.style.left = lenFromDev(Math.round(x));
  tip.style.top = lenFromDev(Math.round(y));
}

function showItemTip(itemId: string, e: MouseEvent) {
  setItemTipContent(itemId);
  const tip = ensureItemTip();
  tip.classList.add("show");
  moveItemTip(e.clientX, e.clientY);
  // 한 번 더(레이아웃 계산 후) 클램프
  requestAnimationFrame(() => moveItemTip(e.clientX, e.clientY));
}

function hideItemTip() {
  const tip = ensureItemTip();
  tip.classList.remove("show");
}

function wireItemHover(el: HTMLElement, itemId: string) {
  el.addEventListener("mouseenter", (ev) => showItemTip(itemId, ev as MouseEvent));
  el.addEventListener("mousemove", (ev) => moveItemTip((ev as MouseEvent).clientX, (ev as MouseEvent).clientY));
  el.addEventListener("mouseleave", () => hideItemTip());
}

// =========================
// Faith badge tooltip (reuses item/relic tip look)
// =========================

function ensureFaithTip(): HTMLDivElement {
  if (_faithTip) return _faithTip;
  const tip = document.createElement("div");
  tip.id = "faithHoverTip";
  tip.className = "itemHoverTip relicHoverTip";
  tip.style.pointerEvents = "none";
  tip.style.position = "fixed";
  tip.style.left = "0";
  tip.style.top = "0";
  // dev console(100000)보다 위로
  tip.style.zIndex = "120000";
  document.body.appendChild(tip);
  _faithTip = tip;
  return tip;
}

function setFaithTipContent(g: GameState) {
  const tip = ensureFaithTip();
  const f = ensureFaith(g);
  tip.innerHTML = "";

  const offered = f.offered as any as Array<"dream_shadow" | "wing_artery" | "forge_master">;

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

function moveFaithTip(clientX: number, clientY: number) {
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

function showFaithTip(g: GameState, e: MouseEvent) {
  setFaithTipContent(g);
  const tip = ensureFaithTip();
  tip.classList.add("show");
  moveFaithTip(e.clientX, e.clientY);
  requestAnimationFrame(() => moveFaithTip(e.clientX, e.clientY));
}

function hideFaithTip() {
  const tip = ensureFaithTip();
  tip.classList.remove("show");
}

function wireFaithBadgeHover(el: HTMLElement) {
  el.addEventListener("mouseenter", (ev) => {
    if (!currentG) return;
    showFaithTip(currentG, ev as MouseEvent);
  });
  el.addEventListener("mousemove", (ev) => moveFaithTip((ev as MouseEvent).clientX, (ev as MouseEvent).clientY));
  el.addEventListener("mouseleave", () => hideFaithTip());
}

function getAssetBase(): string {
  if (_ASSET_BASE) return _ASSET_BASE;

  const viteBase = (import.meta as any)?.env?.BASE_URL as string | undefined;
  if (viteBase && typeof viteBase === "string") {
    _ASSET_BASE = new URL(viteBase, window.location.origin).href.replace(/\/?$/, "/");
    return _ASSET_BASE;
  }

  const baseTag = document.querySelector("base") as HTMLBaseElement | null;
  if (baseTag?.href) {
    _ASSET_BASE = baseTag.href.replace(/\/?$/, "/");
    return _ASSET_BASE;
  }

  _ASSET_BASE = `${window.location.origin}/`;
  return _ASSET_BASE;
}

const APP_BASE_HREF = new URL(
  (import.meta as any).env?.BASE_URL ?? "/",
  window.location.origin
).href;

export function assetUrl(ref: string): string {
  if (!ref) return ref;
  if (/^(https?:|data:|blob:)/i.test(ref)) return ref;
  const clean = ref.replace(/^\/+/, "");
  return new URL(clean, APP_BASE_HREF).href;
}

let _assetVarsApplied = false;
function applyAssetVarsOnce() {
  if (_assetVarsApplied) return;
  _assetVarsApplied = true;

  const root = document.documentElement;

  root.style.setProperty("--bgUrl", `url("${assetUrl("assets/ui/background/dungeon_bg.png")}")`);
  root.style.setProperty("--boardUrl", `url("${assetUrl("assets/ui/boards/battle_board.png")}")`);
  root.style.setProperty("--cardUrl", `url("${assetUrl("assets/ui/cards/card_parchment.png")}")`);

  root.style.setProperty("--mapBgUrl", `url("${assetUrl("assets/ui/background/map_bg.png")}")`);

  // 폰트: 다른 PC에서도 동일하게 적용되도록 웹폰트를 강제로 로드
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
}


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
    case "PLACE": return 0;
    default: return 220;
  }
}





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

type UiToastRuntime = {
  id: number;
  kind: string;
  text: string;
  born: number;
  ms: number;
};

let toastSeq = 1;
let uiToastsRt: UiToastRuntime[] = [];

function pullUiToastsFromState(g: GameState) {
  const anyG = g as any;
  const q = (anyG.uiToasts as any[]) ?? [];
  if (!q || q.length === 0) return;

  const now = performance.now();
  for (const t of q) {
    const kind = String((t as any).kind ?? "INFO");
    const text = String((t as any).text ?? "");
    const ms = Math.max(200, Number((t as any).ms ?? 1600) || 1600);
    uiToastsRt.push({ id: toastSeq++, kind, text, born: now, ms });
  }

  // ✅ 저장에 섞이지 않도록 즉시 비움
  anyG.uiToasts = [];
}

function cleanupUiToastsRt() {
  const now = performance.now();
  const mul = animMulNow();
  uiToastsRt = uiToastsRt.filter((t) => now - t.born < t.ms * mul);
}

function renderUiToastLayer(g: GameState) {
  pullUiToastsFromState(g);
  cleanupUiToastsRt();

  let layer = document.querySelector<HTMLElement>(".toastLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "toastLayer";
    document.body.appendChild(layer);
  }

  // 재구성(토스트 개수가 많지 않아서 단순 rebuild가 안전)
  layer.innerHTML = "";
  for (const t of uiToastsRt) {
    const el = document.createElement("div");
    el.className = `toast toast-${t.kind.toLowerCase()}`;
    el.textContent = t.text;
    layer.appendChild(el);
  }
}


let floatingNewRunHandler: null | (() => void) = null;
let phaseBannerText: string | null = null;
let phaseBannerUntil = 0;


function pushFloatFx(kind: FloatFx["kind"], text: string, x: number, y: number) {
  floatFx.push({ id: fxIdSeq++, kind, text, x, y, born: performance.now() });
}

function cleanupFloatFx() {
  const now = performance.now();

  floatFx = floatFx.filter((f) => now - f.born < animMs(700));
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


  if (prevPlayerHp != null) {
    const d = g.player.hp - prevPlayerHp;
    if (d !== 0) emitPlayerDelta(d);
  }
  if (prevPlayerBlock != null) {
    const d = g.player.block - prevPlayerBlock;
    if (d !== 0) emitPlayerBlockDelta(d);
  }


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
  setTimeout(() => box.classList.remove("fxFlash"), animMs(240));
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
  setTimeout(() => el.classList.remove("fxFlash"), animMs(240));
}









type UiSettings = {
  uiScaleDesktop: number;
  uiScaleMobile: number;
  slotCardMode: "FULL" | "NAME_ONLY";
  animMul: number; // 0=즉시, 1=기본, 2=느림
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
        animMul: 1.0,
      };
    }

    const j = JSON.parse(raw);

    const slotCardMode: UiSettings["slotCardMode"] =
      j.slotCardMode === "NAME_ONLY" ? "NAME_ONLY" : "FULL";

    return {
      uiScaleDesktop: clamp(Number(j.uiScaleDesktop ?? 1.0) || 1.0, 0.75, 1.5),
      uiScaleMobile:  clamp(Number(j.uiScaleMobile  ?? 1.0) || 1.0, 0.75, 1.5),
      slotCardMode,
      animMul: clamp(Number(j.animMul ?? 1.0) || 1.0, 0.0, 2.0),
    };
  } catch {
    return {
      uiScaleDesktop: 1.0,
      uiScaleMobile: 1.0,
      slotCardMode: "FULL",
      animMul: 1.0,
    };
  }
}


let uiSettings: UiSettings = loadUiSettings();


function getUiScaleNow() {
  // CSS가 화면비율에 맞춰 1 design-unit(--u)을 계산합니다.
  // 여기서는 사용자 배율(설정)만 적용합니다.
  const userMul = isMobileUiNow() ? uiSettings.uiScaleMobile : uiSettings.uiScaleDesktop;
  return clamp(userMul, 0.65, 1.5);
}

function unitLenDev(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--u");
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function len(n: number): string {
  return "calc(" + n + " * var(--u))";
}

function lenFromDev(dev: number): string {
  const u = unitLenDev();
  const units = dev / u;
  const safe = Number.isFinite(units) ? units : 0;
  return "calc(" + safe + " * var(--u))";
}

function animMulNow() {
  return clamp(Number(uiSettings.animMul ?? 1.0) || 1.0, 0.0, 2.0);
}
function animMs(ms: number) {
  return Math.max(0, Math.round(ms * animMulNow()));
}









function isMobileUiNow() {
  // matchMedia는 CSS 변수 calc()를 안정적으로 파싱하지 못합니다.
  // 따라서 기기 너비 기반으로 판정합니다.
  const w = window.innerWidth;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return w <= 900 && coarse;
}

let logCollapsed = false;





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





type ForcedNext = null | "BOSS";

let autoAdvancing = false;

async function runAutoAdvanceRAF(g: GameState, actions: UIActions) {

  if (g._justStartedCombat) {
    g._justStartedCombat = false;
    return
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

      const step = computeNextStep(g, actions,  false);
      if (!step.fn || step.disabled) break;


      const beforePhase = g.phase;

      step.fn();
      render(g, actions);

      if (g.phase === "PLACE") break;

      const ms = tickMsForPhase(beforePhase);
      if (ms > 0) await sleep(animMs(ms));
    }
  } finally {
    autoAdvancing = false;
  }
}

function ensureBossSchedule(g: GameState) {
  const runAny = g.run as any;
  if (runAny.timeMove == null) runAny.timeMove = g.run.nodePickCount ?? 0;
  if (runAny.nextBossTime == null) runAny.nextBossTime = 40;
  if (runAny.forcedNext == null) runAny.forcedNext = null as ForcedNext;
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
  (g.run as any).timeMove ??= g.run.nodePickCount ?? 0;
  g.run.nextBossTime ??= 40;
  g.run.forcedNext ??= null;
  g.run.bossOmenText ??= null;
  g.run.enemyLastSeenBattle ??= {};
  g.run.nodePickByType ??= { BATTLE: 0, ELITE: 0, REST: 0, EVENT: 0, TREASURE: 0 };
  g.run.bossPool ??= ["boss_gravity_master","boss_cursed_wall", "boss_giant_orc", "boss_soul_stealer"];
  g.run.nextBossId ??= null;
  g.run.lastBattleWasElite ??= false;
  (g.run as any).lastBattleWasBoss ??= false;
  (g.run as any).rewardPityNonElite ??= 0;
  g.run.gold ??= 0;
  (g.run as any).pendingEventWinGold ??= 0;

  (g.run as any).items ??= [];
  (g.run as any).itemOfferedThisBattle ??= false;

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

  const g = hydrateLoadedState(loaded.state, content);
  // 구버전 세이브에도 신앙 상태를 보정하고, 아직 선택하지 않았다면 선택 화면을 띄운다.
  const f = ensureFaith(g);
  if (!g.choice && !f.chosen) {
    openFaithStartChoice(g);
  }
  return g;
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

  // rarity frame
  const rarity =
    (def as any).rarity
    ?? (String(c.defId).startsWith("mad_") ? "MADNESS" : undefined)
    ?? (["arrow","shield","scout","field_ration","maintenance","power_arrow","goal_treasure"].includes(String(c.defId)) ? "BASIC" : "COMMON");
  d.classList.add(`rarity-${String(rarity).toLowerCase()}`);

  if (g.selectedHandCardUid === cardUid) d.classList.add("selected");
  if (def.tags?.includes("EXHAUST")) d.classList.add("exhaust");
  if (def.tags?.includes("VANISH")) d.classList.add("vanish");

  if (mode === "SLOT_NAME_ONLY") d.classList.add("slotNameOnly");


  const header = div("cardHeader");
  const title = displayNameForUid(g, cardUid);
  header.appendChild(divText("cardTitle", title));

  if (mode === "FULL") {
    const meta = div("cardMeta");
    if (def.tags?.includes("EXHAUST")) meta.appendChild(badge(""));
    if (def.tags?.includes("VANISH")) meta.appendChild(badge(""));
    header.appendChild(meta);
  }

  d.appendChild(header);


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

  }


  if (clickable && onClick) d.onclick = () => onClick(cardUid);


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






const KW_ICON: Record<string, string> = {
  "취약": "🎯",
  "약화": "🥀",
  "출혈": "🩸",
  "교란": "🌀",
  "면역": "✨",
  "S": "🍞",
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
  return assetUrl(`assets/enemies/${enemyId}.png`);
}



const EFFECT_ICON: Record<string, string> = {
  vuln: "🎯",
  weak: "🥀",
  bleed: "🩸",
  disrupt: "🌀",
  immune: "✨",
  supplies: "🍞",
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

  if (hits > 1) {
    if (per <= 0) return `${total} (${hits}타)`;

    const baseTotal = per * hits;

    if (total === baseTotal) return `${total} (${per}x${hits})`;

    const blk = Math.max(0, Number(g.player?.block ?? 0) || 0);
    if (blk > 0) {
      let b = blk;
      const afterHits: number[] = [];
      for (let i = 0; i < hits; i++) {
        const used = Math.min(b, per);
        b -= used;
        afterHits.push(per - used);
      }
      const afterTotal = afterHits.reduce((s, x) => s + x, 0);

      if (afterTotal === total) {
        const allSame = afterHits.every((x) => x === afterHits[0]);
        if (allSame) return `${total} (${afterHits[0]}x${hits})`;
        return `${total} (${afterHits.join("+")})`;
      }
    }

    return `${total} (${per}x${hits})`;
  }

  return `${total}`;
}

function computeIntentIconFromPreview(pv: IntentPreview | any): string {
  if (!pv) return "?";

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
    return "?";
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
let mapDetailOverlayOpen = false;

let mapDetailOutsideDown: ((ev: PointerEvent) => void) | null = null;
function detachMapDetailOutsideDown() {
  if (!mapDetailOutsideDown) return;
  document.removeEventListener("pointerdown", mapDetailOutsideDown, true);
  mapDetailOutsideDown = null;
}


let relicHoverId: string | null = null;
let relicHoverAt: Pt | null = null;

function clearRelicHoverTooltip() {
  relicHoverId = null;
  relicHoverAt = null;
  document.querySelector(".relicTooltip")?.remove();
}

function clearAllHover() {
  clearCardHoverPreview();
  clearRelicHoverTooltip();

  // 아이템 툴팁(트레이)도 같이 닫기
  document.querySelectorAll<HTMLElement>(".itemHoverTip").forEach((el) => {
    el.classList.remove("show");
    (el as any).innerHTML = "";
  });
}

let relicModalId: string | null = null;




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





type NodeType = "BATTLE" | "ELITE" | "REST" | "TREASURE" | "EVENT" | "SHOP";

const VS15 = "\uFE0E";

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
  if (t === "SHOP")  return { icon: "¤" + VS15, text: "상점", kind: "shop" as const };

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





type VisionMode = "NORMAL" | "FOCUS" | "WIDE";

type VisionParams = {
  mode: VisionMode;

  presenceR: number;

  typeR: number;

  detailR: number;

  noise: number;
};

type MapNodeKind = NodeType | "START" | "EMPTY";

type MapNodeLite = {
  id: string;
  kind: MapNodeKind;
  visited?: boolean;
  cleared?: boolean;
  depth?: number;
  order?: number;
};

type GraphMapLite = {
  pos: string;
  startId: string;
  nodes: Record<string, MapNodeLite>;
  edges: Record<string, string[]>;
  visionNonce?: number;
  treasureId?: string | null;

  seen?: Record<string, 0 | 1 | 2 | 3>;
};

function pushUniq(arr: string[], v: string) {
  if (!arr.includes(v)) arr.push(v);
}
function addUndirectedEdge(edges: Record<string, string[]>, a: string, b: string) {
  (edges[a] ||= []);
  (edges[b] ||= []);
  pushUniq(edges[a], b);
  pushUniq(edges[b], a);
}

function dungeonToGraphLite(dm: DungeonMap, opts?: { verticalLinks?: boolean }): GraphMapLite {
  const nodes: Record<string, MapNodeLite> = {};

  const dmNodes = dm.nodes as Record<string, MapNode>;
  for (const n of Object.values(dmNodes)) {
    nodes[n.id] = { id: n.id, kind: n.kind as any, depth: n.depth, order: n.order };
  }

  const edges: Record<string, string[]> = {};
  for (const id of Object.keys(nodes)) edges[id] = [];

  for (const n of Object.values(dmNodes)) {
    nodes[n.id] = { id: n.id, kind: n.kind as any, depth: n.depth, order: n.order };
  }


  if (opts?.verticalLinks) {
    const byDepth = new Map<number, string[]>();
    for (const id of Object.keys(nodes)) {
      const d = nodes[id].depth ?? 0;
      const arr = byDepth.get(d) ?? [];
      arr.push(id);
      byDepth.set(d, arr);
    }
    for (const [, ids] of byDepth) {
      ids.sort((a, b) => (nodes[a].order ?? 0) - (nodes[b].order ?? 0));
      for (let i = 0; i < ids.length - 1; i++) {
        addUndirectedEdge(edges, ids[i], ids[i + 1]);
      }
    }
  }

  return {
    pos: dm.pos,
    startId: dm.startId,
    nodes,
    edges,
    visionNonce: dm.visionNonce,
    treasureId: dm.treasureId,
  };
}


function hash32(s: string) {

  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded01(seed: number) {

  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) / 4294967296);
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function clampInt(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, Math.floor(x))); }

function ensureGraphRuntime(g: GameState) {
  const runAny = g.run as any;

  runAny.timeMove ??= 0;

  runAny.vision ??= {
    mode: "NORMAL" as VisionMode,
    presenceR: 2,
    typeR: 1,
    detailR: 0,
    noise: 0,
  };

  runAny.pursuit ??= { heat: 0 };


  if (!runAny.map) {
    runAny.map = makeDebugGraphMap();
  } else {

    const m = runAny.map as any;
    if (Array.isArray(m.nodes)) {
      const rec: Record<string, MapNodeLite> = {};
      for (const n of m.nodes) rec[String(n.id)] = n;
      m.nodes = rec;
    }
  }

    const mapLite = runAny.map as GraphMapLite;
  const isLayered = Object.keys(mapLite?.nodes ?? {}).every(
    (id) => typeof (mapLite.nodes[id] as any)?.order === "number"
  );

  if (!isLayered) {
    try { ensureNoDeadEnds(mapLite, 2); } catch {}
  }

  try { ensureSeenMap(mapLite); } catch {}


  return {
    map: runAny.map as GraphMapLite,
    vision: runAny.vision as VisionParams,
    pursuit: runAny.pursuit as { heat: number },
    timeMove: runAny.timeMove as number,
  };
}

function totalTimeOnMap(g: GameState) {
  const runAny = g.run as any;
  const tm = Number(runAny.timeMove ?? 0) || 0;
  const ta = Number(g.time ?? 0) || 0;
  return tm + ta;
}

function pursuitTier(heat: number) {
  if (heat >= 14) return 3;
  if (heat >= 9) return 2;
  if (heat >= 5) return 1;
  return 0;
}


// 추격(보물 이후) 시스템: "재발동"만 남기고, 길(간선) 재배치는 비활성화
const PURSUIT_TOPOLOGY_SHIFT_ENABLED = false;


function maybeShiftTopology(g: GameState) {
  if (!PURSUIT_TOPOLOGY_SHIFT_ENABLED) return;
  const { map, pursuit } = ensureGraphRuntime(g);
  const tier = pursuitTier(pursuit.heat ?? 0);
  if (tier <= 0) return;

  const p = 0.05 + 0.04 * tier;
  if (Math.random() >= p) return;

  const edges = (map.edges ??= {});
  const ids = Object.keys(map.nodes);
  if (ids.length < 4) return;

  const depthOf = (id: string) => Number(map.nodes[id]?.depth ?? 999);
  const orderOf = (id: string) => Number((map.nodes[id] as any)?.order ?? 0);

  const ensureUndirected = (a: string, b: string) => {
    edges[a] ??= [];
    edges[b] ??= [];
    if (!edges[a].includes(b)) edges[a].push(b);
    if (!edges[b].includes(a)) edges[b].push(a);
  };

  const removeUndirected = (a: string, b: string) => {
    edges[a] = (edges[a] ?? []).filter((x) => x !== b);
    edges[b] = (edges[b] ?? []).filter((x) => x !== a);
  };

  const connectedFrom = (start: string) => {
    const seen = new Set<string>();
    const q: string[] = [start];
    seen.add(start);
    while (q.length) {
      const cur = q.shift()!;
      for (const nx of edges[cur] ?? []) {
        if (seen.has(nx)) continue;
        seen.add(nx);
        q.push(nx);
      }
    }
    return seen;
  };

  const byDepth = new Map<number, string[]>();
  for (const id of ids) {
    const d = depthOf(id);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  for (const [d, arr] of byDepth) arr.sort((a, b) => (orderOf(a) - orderOf(b)) || a.localeCompare(b));

  const pairKeys = Array.from(byDepth.keys()).filter((d) => byDepth.has(d) && byDepth.has(d + 1));
  if (pairKeys.length === 0) return;

  const layerEdgePairs = (d: number) => {
    const left = byDepth.get(d) ?? [];
    const right = byDepth.get(d + 1) ?? [];
    const li = new Map<string, number>();
    const ri = new Map<string, number>();
    for (let i = 0; i < left.length; i++) li.set(left[i], i);
    for (let j = 0; j < right.length; j++) ri.set(right[j], j);

    const pairs: Array<[number, number]> = [];
    for (const a of left) {
      for (const b of edges[a] ?? []) {
        if (depthOf(b) !== d + 1) continue;
        const i = li.get(a);
        const j = ri.get(b);
        if (i == null || j == null) continue;
        pairs.push([i, j]);
      }
    }
    return { left, right, li, ri, pairs };
  };

  const wouldCross = (d: number, leftId: string, rightId: string) => {
    const { li, ri, pairs } = layerEdgePairs(d);
    const i = li.get(leftId);
    const j = ri.get(rightId);
    if (i == null || j == null) return true;
    for (const [i2, j2] of pairs) {
      if ((i < i2 && j > j2) || (i > i2 && j < j2)) return true;
    }
    return false;
  };

  const addPlanar = (a: string, b: string) => {
    if ((edges[a] ?? []).includes(b)) return false;
    const da = depthOf(a);
    const db = depthOf(b);
    if (Math.abs(da - db) !== 1) return false;

    const d = Math.min(da, db);
    const left = da < db ? a : b;
    const right = da < db ? b : a;
    if (wouldCross(d, left, right)) return false;

    ensureUndirected(left, right);
    return true;
  };

  const doAdd = Math.random() < 0.55;

  if (doAdd) {
    for (let tries = 0; tries < 80; tries++) {
      const d = pairKeys[Math.floor(Math.random() * pairKeys.length)];
      const { left, right } = layerEdgePairs(d);
      if (!left.length || !right.length) continue;

      const a = left[Math.floor(Math.random() * left.length)];
      const b = right[Math.floor(Math.random() * right.length)];
      if (addPlanar(a, b)) {
        logMsg(g, `대격변: 길이 새로 열렸습니다. (${a} ↔ ${b})`);
        return;
      }
    }
    return;
  }

  const allPairs: Array<[string, string]> = [];
  for (const a of ids) {
    for (const b of edges[a] ?? []) {
      if (a >= b) continue;
      if (Math.abs(depthOf(a) - depthOf(b)) !== 1) continue;
      allPairs.push([a, b]);
    }
  }
  if (allPairs.length === 0) return;

  for (let tries = 0; tries < 120; tries++) {
    const [a, b] = allPairs[Math.floor(Math.random() * allPairs.length)];
    const degA = (edges[a] ?? []).length;
    const degB = (edges[b] ?? []).length;
    if (degA <= 1 || degB <= 1) continue;

    removeUndirected(a, b);

    const start = Object.values(map.nodes).find((n) => n.kind === "START")?.id ?? map.pos;
    const seen = connectedFrom(start);

    if (seen.size === ids.length && ids.every((id) => (edges[id] ?? []).length >= 1)) {
      logMsg(g, `대격변: 길이 무너졌습니다. (${a} ↔ ${b})`);
      return;
    }

    ensureUndirected(a, b);
  }
}

function bfsDistances(map: GraphMapLite, start: string, maxDist: number) {
  const dist: Record<string, number> = {};
  const q: string[] = [];

  dist[start] = 0;
  q.push(start);

  while (q.length) {
    const cur = q.shift()!;
    const d = dist[cur] ?? 0;
    if (d >= maxDist) continue;

    const ns = map.edges[cur] ?? [];
    for (const nx of ns) {
      if (dist[nx] != null) continue;
      dist[nx] = d + 1;
      q.push(nx);
    }
  }

  return dist;
}


type RevealLevel = 0 | 1 | 2 | 3;

function ensureSeenMap(map: GraphMapLite): Record<string, RevealLevel> {
  const m: any = map as any;
  if (!m.seen) m.seen = {};

  m.seen[map.pos] = 3;
  return m.seen as Record<string, RevealLevel>;
}


function updateSeenFromVision(map: GraphMapLite, vp: VisionParams) {
  const seen = ensureSeenMap(map);
  const maxD = Math.max(0, vp.presenceR | 0);
  const distNow = bfsDistances(map, map.pos, maxD);

  for (const id of Object.keys(distNow)) {
    const d = distNow[id] ?? 0;
    const r = revealLevelForDist(d, vp);
    const prev = (seen[id] ?? 0) as RevealLevel;
    if (r > prev) seen[id] = r;
  }


  seen[map.pos] = 3;
}

function seenLevel(map: GraphMapLite, id: string): RevealLevel {
  const seen = (map.seen ?? {}) as Record<string, RevealLevel>;
  return (seen[id] ?? 0) as RevealLevel;
}


function ensureNoDeadEnds(map: GraphMapLite, minDegree: number = 2) {
  const ids = Object.keys(map.nodes);
  if (ids.length <= 2) return;

  map.edges ??= {};

  for (const a of Object.keys(map.edges)) {
    for (const b of (map.edges[a] ?? []).slice()) {
      map.edges[b] ??= [];
      if (!map.edges[b].includes(a)) map.edges[b].push(a);
    }
  }

  const depthOf = (id: string) => Number(map.nodes[id]?.depth ?? 999);
  const orderOf = (id: string) => Number((map.nodes[id] as any)?.order ?? 0);
  const degree = (id: string) => (map.edges[id] ?? []).length;

  const hasLayered = ids.every((id) => {
    const d = depthOf(id);
    return d >= 0 && d < 900 && typeof (map.nodes[id] as any)?.order === "number";
  });

  const byDepth = new Map<number, string[]>();
  if (hasLayered) {
    for (const id of ids) {
      const d = depthOf(id);
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(id);
    }
    for (const [d, arr] of byDepth) arr.sort((a, b) => (orderOf(a) - orderOf(b)) || a.localeCompare(b));
  }

  const layerPairs = (d: number) => {
    const left = byDepth.get(d) ?? [];
    const right = byDepth.get(d + 1) ?? [];
    const li = new Map<string, number>();
    const ri = new Map<string, number>();
    for (let i = 0; i < left.length; i++) li.set(left[i], i);
    for (let j = 0; j < right.length; j++) ri.set(right[j], j);

    const pairs: Array<[number, number]> = [];
    for (const a of left) {
      for (const b of map.edges[a] ?? []) {
        if (depthOf(b) !== d + 1) continue;
        const i = li.get(a);
        const j = ri.get(b);
        if (i == null || j == null) continue;
        pairs.push([i, j]);
      }
    }
    return { left, right, li, ri, pairs };
  };

  const wouldCross = (leftId: string, rightId: string) => {
    const dl = depthOf(leftId);
    const dr = depthOf(rightId);
    if (dr !== dl + 1) return true;

    const { li, ri, pairs } = layerPairs(dl);
    const i = li.get(leftId);
    const j = ri.get(rightId);
    if (i == null || j == null) return true;

    for (const [i2, j2] of pairs) {
      if ((i < i2 && j > j2) || (i > i2 && j < j2)) return true;
    }
    return false;
  };

  const tryAddEdge = (from: string) => {
    map.edges[from] ??= [];
    const neigh = new Set(map.edges[from] ?? []);
    const fromD = depthOf(from);

    let candidates = ids.filter((x) => x !== from && !neigh.has(x));
    if (candidates.length === 0) return false;

    if (hasLayered) {
      candidates = candidates.filter((x) => Math.abs(depthOf(x) - fromD) === 1);
      if (candidates.length === 0) return false;

      candidates = candidates.filter((to) => {
        const da = depthOf(from);
        const db = depthOf(to);
        const left = da < db ? from : to;
        const right = da < db ? to : from;
        return !wouldCross(left, right);
      });
      if (candidates.length === 0) return false;
    }

    candidates.sort((a, b) => degree(b) - degree(a));

    const to = candidates[0];
    map.edges[from].push(to);
    map.edges[to] ??= [];
    map.edges[to].push(from);
    return true;
  };

  for (let iter = 0; iter < 200; iter++) {
    const dead = ids.filter((id) => degree(id) < minDegree);
    if (dead.length === 0) break;

    let progressed = false;
    for (const id of dead) {
      while (degree(id) < minDegree) {
        if (!tryAddEdge(id)) break;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
}

function makeDebugGraphMap(): GraphMapLite {
  const N = 18;

  const nodes: Record<string, MapNodeLite> = {};
  const edges: Record<string, string[]> = {};

  const ids = Array.from({ length: N }, (_, i) => `n${i}`);


  edges[ids[0]] = [];
  nodes[ids[0]] = { id: ids[0], kind: "START", visited: true, cleared: true, depth: 0 };

  for (let i = 1; i < ids.length; i++) {
    const id = ids[i];
    const parent = ids[Math.floor(Math.random() * i)];
    edges[id] ??= [];
    edges[parent] ??= [];
    edges[id].push(parent);
    edges[parent].push(id);
    nodes[id] = { id, kind: "BATTLE", visited: false, cleared: false };
  }


  const extra = 10;
  for (let k = 0; k < extra; k++) {
    const a = ids[Math.floor(Math.random() * ids.length)];
    const b = ids[Math.floor(Math.random() * ids.length)];
    if (a === b) continue;
    edges[a] ??= [];
    edges[b] ??= [];
    if (edges[a].includes(b)) continue;
    edges[a].push(b);
    edges[b].push(a);
  }


  const tmpMap: GraphMapLite = {
    pos: ids[0],
    startId: ids[0],
    nodes,
    edges,
    visionNonce: 1,
    treasureId: ids[ids.length - 1],
  };

  ensureNoDeadEnds(tmpMap, 2);

  const dist = bfsDistances(tmpMap, ids[0], 999);
  let deepest = ids[1];
  let bestD = -1;
  for (const id of ids) {
    const d = dist[id] ?? 999;
    nodes[id].depth = d;
    if (id !== ids[0] && d > bestD) {
      bestD = d;
      deepest = id;
    }
  }


  for (const id of ids) {
    if (id === ids[0]) continue;
    nodes[id].kind = "BATTLE";
  }


  const pickKinds: NodeType[] = ["BATTLE", "BATTLE", "BATTLE", "EVENT", "REST", "ELITE"];
  for (const id of ids) {
    if (id === ids[0] || id === deepest) continue;
    const k = pickKinds[Math.floor(Math.random() * pickKinds.length)];
    nodes[id].kind = k;
  }

  nodes[deepest].kind = "TREASURE";

  return {
    pos: ids[0],
    startId: ids[0],
    nodes,
    edges,
    visionNonce: 1,
    treasureId: deepest,
  };
}


function visionParamsFromState(g: GameState): VisionParams {
  const { vision, pursuit } = ensureGraphRuntime(g);
  const runAny = g.run as any;
  const tm = Number(runAny.timeMove ?? 0) || 0;
  const vAny = vision as any;


  if (vAny.forceModeUntilMove != null && tm >= Number(vAny.forceModeUntilMove)) {
    vAny.forceModeUntilMove = null;
    vAny.forceMode = null;
  }
  if (vAny.switchLockedUntilMove != null && tm >= Number(vAny.switchLockedUntilMove)) {
    vAny.switchLockedUntilMove = null;
  }


  let mode = ((vAny.forceMode ?? vision.mode) ?? "NORMAL") as VisionMode;
  let presenceR = Number(vision.presenceR ?? 2) || 0;
  let typeR = Number(vision.typeR ?? 1) || 0;
  let detailR = Number(vision.detailR ?? 0) || 0;
  let noise = clamp01(Number(vision.noise ?? 0.08) || 0);


  if (mode === "FOCUS") {
    presenceR -= 1;
    typeR -= 1;
    detailR += 1;
    noise *= 0.6;
  } else if (mode === "WIDE") {
    presenceR += 1;
    typeR += 1;
    detailR += 0;
    noise = clamp01(noise * 1.35);
  }


  if (g.run.treasureObtained) {
    const tier = pursuitTier(pursuit.heat ?? 0);
    presenceR += tier >= 2 ? 1 : 0;
    typeR -= tier;
    detailR -= Math.max(0, tier - 1);
    noise = clamp01(noise + tier * 0.07);
  }

  // 신앙: 밝은 어둠(후원 +) — 시야 3
  {
    const patron = getPatronGodOrNull(g);
    if (patron === "bright_darkness") {
      presenceR = Math.max(presenceR, 3);
      typeR = Math.max(typeR, 3);
    }
  }


  /*const f = Math.max(0, Number(g.player.fatigue ?? 0) || 0);
  if (f > 0) {

    const losePresence = Math.floor(f / 14);
    const loseType = Math.floor(f / 6);
    const loseDetail = Math.floor(f / 10);

    presenceR -= losePresence;
    typeR -= loseType;
    detailR -= loseDetail;

    noise = clamp01(noise + Math.min(0.30, f * 0.015));
  }*/

  presenceR = clampInt(presenceR, 0, 99);
  typeR = clampInt(typeR, 0, presenceR);
  detailR = clampInt(detailR, 0, typeR);
  noise = 0;

  return { mode, presenceR, typeR, detailR, noise };
}


function revealLevelForDist(dist: number, vp: VisionParams): 0 | 1 | 2 | 3 {
  if (dist <= 0) return 3;
  if (dist <= vp.detailR) return 3;
  if (dist <= vp.typeR) return 2;
  if (dist <= vp.presenceR) return 1;
  return 0;
}

function perceivedKindForNode(
  g: GameState,
  nodeId: string,
  actual: MapNodeKind,
  reveal: 0 | 1 | 2 | 3,
  vp: VisionParams
): { shown: NodeType | null; label: string; certainty: "HIDDEN" | "PRESENCE" | "TYPE" | "DETAIL" } {

  // 밝은 어둠(적대): 지도 정보는 전부 '?'
  if (isHostile(g, "bright_darkness")) {
    return { shown: null, label: "?", certainty: "HIDDEN" };
  }

  if (reveal === 0) return { shown: null, label: "보이지 않음", certainty: "HIDDEN" };
  if (reveal === 1) return { shown: null, label: "무언가", certainty: "PRESENCE" };

  if (actual === "START") {
    return { shown: null, label: "입구", certainty: reveal === 3 ? "DETAIL" : "TYPE" };
  }

  if (actual === "EMPTY") {
    return { shown: null, label: "지나간 곳", certainty: "PRESENCE" };
  }

  if (reveal === 3) {
    return { shown: actual, label: nodeLabelParts(actual, false).text, certainty: "DETAIL" };
  }
  return { shown: actual, label: nodeLabelParts(actual, false).text, certainty: "TYPE" };
}

function renderPerceivedLabel(parent: HTMLElement, pk: ReturnType<typeof perceivedKindForNode>) {
  const line = div("mapNodeLine");
  line.style.cssText = `display:flex; gap:calc(${8} * var(--u)); align-items:center;`;

  if (pk.shown) {
    appendNodeLabel(line, pk.shown, false);
  } else {
    const s = document.createElement("span");
    s.className = "nodeText";
    s.textContent = `(${pk.label})`;
    line.appendChild(s);
  }

  parent.appendChild(line);
}

type GraphLayout = {
  width: number;
  height: number;
  pos: Record<string, { x: number; y: number; depth: number }>;
  maxDepth: number;
  maxCount: number;
};

function ensureDepths(map: GraphMapLite) {
  const ids = Object.keys(map.nodes);
  if (ids.length === 0) return;

  const hasStableDepths = ids.every((id) => {
    const d0 = (map.nodes[id] as any)?.depth;
    const d = Number(d0);
    return d0 != null && Number.isFinite(d) && d >= 0 && d < 900;
  });
  if (hasStableDepths) return;

  const start =
    Object.values(map.nodes).find((n) => n.kind === "START")?.id ??
    map.pos ??
    ids[0];

  const dist = bfsDistances(map, start, 999);

  for (const id of ids) {
    const cur = (map.nodes[id] as any)?.depth;
    if (cur != null && Number.isFinite(Number(cur)) && Number(cur) < 900) continue;
    const d = dist[id];
    map.nodes[id].depth = d != null ? d : (map.nodes[id].depth ?? 999);
  }
}

function computeGraphLayout(map: GraphMapLite): GraphLayout {
  ensureDepths(map);

  const ids = Object.keys(map.nodes);
  const lockOrder = ids.every((id) => typeof (map.nodes[id] as any)?.order === "number");

  const byDepth = new Map<number, string[]>();
  let maxDepthRaw = 0;

  for (const id of ids) {
    const d0 = Number(map.nodes[id]?.depth ?? 999);
    const d = Number.isFinite(d0) ? d0 : 999;
    maxDepthRaw = Math.max(maxDepthRaw, d);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  const depthKeysRaw = Array.from(byDepth.keys()).sort((a, b) => a - b);
  const effectiveMaxDepth = depthKeysRaw.filter((d) => d < 900).length
    ? Math.max(...depthKeysRaw.filter((d) => d < 900))
    : maxDepthRaw;

  const hasUnreach = depthKeysRaw.some((d) => d >= 900);
  const maxDepthForWidth = effectiveMaxDepth + (hasUnreach ? 1 : 0);

  const STEP_X = 80;
  const STEP_Y = 64;
  const PAD_X = 54;
  const PAD_Y = 40;

  const depthOf = (id: string) => {
    const d0 = Number(map.nodes[id]?.depth ?? 999);
    const dd = Number.isFinite(d0) ? d0 : 999;
    return dd >= 900 ? (effectiveMaxDepth + 1) : dd;
  };

  const depths = Array.from({ length: maxDepthForWidth + 1 }, (_, i) => i);

  const order: Record<number, string[]> = {};
  for (const d of depths) order[d] = [];

  for (const id of ids) {
    const d = depthOf(id);
    order[d].push(id);
  }

  for (const d of depths) {
    order[d].sort((a, b) =>
      (((map.nodes[a] as any).order ?? 0) - ((map.nodes[b] as any).order ?? 0)) || a.localeCompare(b)
    );
  }

  const idxIn = (d: number) => {
    const m = new Map<string, number>();
    const arr = order[d] ?? [];
    for (let i = 0; i < arr.length; i++) m.set(arr[i], i);
    return m;
  };

  const adj = (id: string) => (map.edges[id] ?? []) as string[];

  const sweep = (dir: "LR" | "RL") => {
    if (dir === "LR") {
      for (let d = 1; d <= maxDepthForWidth; d++) {
        const prev = order[d - 1];
        if (!prev || prev.length === 0) continue;
        const prevIdx = idxIn(d - 1);
        const cur = order[d];
        cur.sort((a, b) => {
          const ba = bary(a, prevIdx, d - 1);
          const bb = bary(b, prevIdx, d - 1);
          if (ba !== bb) return ba - bb;
          return a.localeCompare(b);
        });
      }
    } else {
      for (let d = maxDepthForWidth - 1; d >= 0; d--) {
        const nxt = order[d + 1];
        if (!nxt || nxt.length === 0) continue;
        const nxtIdx = idxIn(d + 1);
        const cur = order[d];
        cur.sort((a, b) => {
          const ba = bary(a, nxtIdx, d + 1);
          const bb = bary(b, nxtIdx, d + 1);
          if (ba !== bb) return ba - bb;
          return a.localeCompare(b);
        });
      }
    }
  };

  const bary = (id: string, idxMap: Map<string, number>, targetDepth: number) => {
    const ns = adj(id);
    let sum = 0;
    let cnt = 0;
    for (const n of ns) {
      if (depthOf(n) !== targetDepth) continue;
      const ix = idxMap.get(n);
      if (ix == null) continue;
      sum += ix;
      cnt += 1;
    }
    if (cnt === 0) {
      const dHere = depthOf(id);
      const ix0 = (order[dHere] ?? []).indexOf(id);
      return ix0 < 0 ? 9999 : ix0;
    }
    return sum / cnt;
  };

  if (!lockOrder) {
    for (let iter = 0; iter < 4; iter++) {
      sweep("LR");
      sweep("RL");
    }
  }

  let maxCount = 1;
  for (const d of depths) maxCount = Math.max(maxCount, (order[d]?.length ?? 0));

  const innerH = maxCount * STEP_Y;
  const height = PAD_Y * 2 + innerH;
  const width = PAD_X * 2 + (maxDepthForWidth + 1) * STEP_X;

  const pos: GraphLayout["pos"] = {};

  for (const d of depths) {
    const col = order[d] ?? [];
    const k = col.length;
    const colH = k * STEP_Y;
    const offsetY = (innerH - colH) / 2;
    const x = PAD_X + d * STEP_X;

    for (let i = 0; i < k; i++) {
      const id = col[i];
      const y = PAD_Y + offsetY + (i + 0.5) * STEP_Y;
      pos[id] = { x, y, depth: Number(map.nodes[id]?.depth ?? 999) };
    }
  }

  return { width, height, pos, maxDepth: maxDepthForWidth, maxCount };
}

function mapIconFor(shown: NodeType | null, certainty: "HIDDEN" | "PRESENCE" | "TYPE" | "DETAIL", actualIsStart: boolean) {
  if (actualIsStart) return "◎";
  if (certainty === "HIDDEN") return "";
  if (certainty === "PRESENCE") return "·";
  if (!shown) return "?";
  return nodeLabelParts(shown, false).icon;
}

function renderMapMiniGraph(
  parent: HTMLElement,
  g: GameState,
  actions: UIActions,
  map: GraphMapLite,
  vp: VisionParams,
  detailMode: boolean
) {

  const layout = computeGraphLayout(map);
  const seen = ensureSeenMap(map);

  const distNow = bfsDistances(map, map.pos, Math.max(0, vp.presenceR | 0));
  const isShown = (id: string) => id === map.pos || ((seen[id] ?? 0) as RevealLevel) > 0;

  const shownIds = Object.keys(map.nodes).filter(isShown);
  if (!shownIds.includes(map.pos)) shownIds.push(map.pos);

  const PAD = 70;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of shownIds) {
    const p = layout.pos[id];
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 300; maxY = 200; }

  const viewX = (minX - PAD);
  const viewY = (minY - PAD);
  const viewW = (maxX - minX) + PAD * 2;
  const viewH = (maxY - minY) + PAD * 2;

  const mapZoom = detailMode ? 0.8 : 1.4;
  const scrollerH = detailMode ? 420 : 460;


  const C_WHITE = "#F2F1EA";
  const C_BLACK = "#0B0B0B";
  const C_ACCENT = "#B34A46";
  const C_ACCENT_DARK = "#1A0B0B";

  const EDGE_STROKE = "rgba(242,241,234,.70)";
  const EDGE_STROKE_DIM = "rgba(242,241,234,.25)";

  const NODE_FILL_BASE = "rgba(242,241,234,.34)";
  const NODE_STROKE_BASE = "rgba(242,241,234,1)";
  const NODE_FILL_ACCENT = "rgba(179,74,70,.34)";
  const NODE_STROKE_ACCENT = C_ACCENT_DARK;

  const ICON_FILL = C_BLACK;

  const box = div("mapMiniBox");
  box.style.cssText =
    `margin-top:calc(${12} * var(--u)); ` +
    `border:0 solid rgba(255,255,255,.12); border-radius:calc(${12} * var(--u)); ` +
    `background:rgba(0,0,0,0); ` +
    `padding:calc(${10} * var(--u));`;

  const title = divText("", "");
  title.style.cssText = `font-weight:700; margin-bottom:calc(${8} * var(--u)); opacity:.95;`;
  box.appendChild(title);

  const scroller = div("mapMiniScroller");
  const viewport = div("mapMiniViewport");
  scroller.appendChild(viewport);

  scroller.style.cssText =
    `position:relative; ` +
    `overflow:auto; ` +
    `max-height:calc(${scrollerH} * var(--u)); ` +
    `border-radius:calc(${10} * var(--u)); ` +
    `background:rgba(255,255,255,.0);`;

  viewport.addEventListener("wheel", (ev) => {
    if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
      viewport.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }
  }, { passive: false });

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `${viewX} ${viewY} ${viewW} ${viewH}`);
  // 강경 모드: SVG 크기도 화면비 기반 단위(var(--u))로 맞춘다.
  (svg.style as any).width = `calc(${viewW * mapZoom} * var(--u))`;
  (svg.style as any).height = `calc(${viewH * mapZoom} * var(--u))`;
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.display = "block";

  const gEdges = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gNodes = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(gEdges);
  svg.appendChild(gNodes);

  const neigh = new Set<string>((map.edges[map.pos] ?? []) as any);

  const memoryPk = (id: string, actual: MapNodeKind, lv: RevealLevel) => {
    const r = (Math.max(0, Math.min(3, lv)) as RevealLevel);
    return perceivedKindForNode(g, id, actual, r, { ...vp, noise: 0 });
  };

  const mkEdgeD = (pa: { x: number; y: number; depth: number }, pb: { x: number; y: number; depth: number }) => {
    const x1 = pa.x, y1 = pa.y;
    const x2 = pb.x, y2 = pb.y;
    const dd = Math.abs((pa.depth ?? 0) - (pb.depth ?? 0));

    if (dd === 0) return `M ${x1} ${y1} L ${x2} ${y2}`;
    if (dd >= 2) {
      const off = 38 + 10 * dd;
      const xOut = Math.max(x1, x2) + off;
      return `M ${x1} ${y1} C ${xOut} ${y1}, ${xOut} ${y2}, ${x2} ${y2}`;
    }
    const dx = x2 - x1;
    const c1x = x1 + dx * 0.35;
    const c2x = x1 + dx * 0.65;
    return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
  };

  const shownSet = new Set(shownIds);
  for (const a of shownIds) {
    for (const b of (map.edges[a] ?? [])) {
      if (a >= b) continue;
      if (!shownSet.has(b)) continue;

      const da = (map.nodes[a] as any)?.depth;
      const db = (map.nodes[b] as any)?.depth;
      if (da != null && db != null) {
        const dd = Math.abs(Number(da) - Number(db));
        if (dd > 1) continue;
      }

      const pa = layout.pos[a];
      const pb = layout.pos[b];
      if (!pa || !pb) continue;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", mkEdgeD(pa, pb));
      path.setAttribute("fill", "none");

      path.setAttribute("stroke", EDGE_STROKE);
      path.setAttribute("stroke-width", detailMode ? "1.6" : "2");

      gEdges.appendChild(path);
    }
  }

  const sortedShown = shownIds.slice().sort((a, b) => a.localeCompare(b));
  for (const id of sortedShown) {
    const p = layout.pos[id];
    if (!p) continue;

    const node = map.nodes[id];
    const actual = (node?.kind ?? "BATTLE") as MapNodeKind;

    const dNow = distNow[id];
    const revealNow: RevealLevel =
      id === map.pos ? 3 : (dNow == null ? 0 : (revealLevelForDist(dNow, vp) as RevealLevel));

    const lv = (seen[id] ?? 0) as RevealLevel;
    const pk =
      revealNow > 0
        ? perceivedKindForNode(g, id, actual, revealNow as any, vp)
        : memoryPk(id, actual, lv);

    const isCur = id === map.pos;
    const isAdj = neigh.has(id);
    const isStart = actual === "START";

    // 현재 위치 강조(후광)
    if (isCur) {
      const halo1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      halo1.setAttribute("cx", String(p.x));
      halo1.setAttribute("cy", String(p.y));
      halo1.setAttribute("r", String(detailMode ? 20 : 22));
      halo1.setAttribute("fill", "none");
      halo1.setAttribute("stroke", C_ACCENT);
      halo1.setAttribute("stroke-width", String(detailMode ? 3 : 3.5));
      halo1.setAttribute("opacity", "0.55");
      (halo1.style as any).filter = "drop-shadow(0 0 calc(6 * var(--u)) rgba(179,74,70,.65))";
      gNodes.appendChild(halo1);
    }

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(p.x));
    circle.setAttribute("cy", String(p.y));
    circle.setAttribute("r", String(isCur ? (detailMode ? 12 : 13) : (detailMode ? 9 : 10)));

    const useAccent = isCur || isAdj;
    circle.setAttribute("fill", useAccent ? NODE_FILL_ACCENT : NODE_FILL_BASE);
    circle.setAttribute("stroke", "none");
    circle.setAttribute("stroke-width", "0");
    circle.style.cursor = isAdj && !isCur ? "pointer" : "default";

    if (isAdj && !isCur) {
      circle.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        actions.onMoveToNode?.(id);
      });
    }

    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
    const cleared = node?.cleared ? "" : node?.visited ? "" : "";
    titleEl.textContent = `${cleared}`;
    circle.appendChild(titleEl);
    gNodes.appendChild(circle);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(p.x));
    label.setAttribute("y", String(p.y));
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", detailMode ? "12" : "14");

    label.setAttribute("fill", ICON_FILL);

    label.style.pointerEvents = "none";
    label.style.userSelect = "none";

    const icon = mapIconFor(pk.shown, pk.certainty as any, isStart);
    label.textContent = icon;
    label.style.opacity = "0.95";
    gNodes.appendChild(label);
  }

  viewport.appendChild(svg);

  if (detailMode) {
    const overlay = div("mapMiniOverlay");
    overlay.style.cssText =
      `position:absolute; right:calc(${10} * var(--u)); bottom:calc(${10} * var(--u)); ` +
      `max-width:calc(${360} * var(--u)); ` +
      `padding:calc(${10} * var(--u)); border-radius:calc(${12} * var(--u)); ` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.12); ` +
      `background:rgba(0,0,0,.55); backdrop-filter: blur(calc(2 * var(--u))); ` +
      `font-size:calc(12 * var(--u)); line-height:1.35;`;

    const ns = map.edges[map.pos] ?? [];
    const neighLine = div("mapMiniOverlayNeigh");
    neighLine.style.cssText = `margin-bottom:calc(${8} * var(--u)); opacity:.95;`;
    neighLine.appendChild(divText("", `이웃 ${ns.length}곳`));
    overlay.appendChild(neighLine);

    if (vp.presenceR >= 2) {
      const dist = bfsDistances(map, map.pos, vp.presenceR);
      const farIds = Object.keys(dist)
        .filter((id) => (dist[id] ?? 999) >= 2 && (dist[id] ?? 999) <= vp.presenceR)
        .sort((a, b) => (dist[a] - dist[b]) || a.localeCompare(b));

      const buckets = new Map<number, Record<string, number>>();
      for (const id of farIds) {
        const d = dist[id] ?? 0;
        const n = map.nodes[id];
        const actual = n?.kind ?? "BATTLE";
        const reveal = revealLevelForDist(d, vp);
        const pk = perceivedKindForNode(g, id, actual, reveal as any, vp);
        const key = (pk.certainty === "PRESENCE") ? "무언가" : pk.label;

        const m = buckets.get(d) ?? {};
        m[key] = (m[key] ?? 0) + 1;
        buckets.set(d, m);
      }

      const ds = Array.from(buckets.keys()).sort((a, b) => a - b).slice(0, 4);
      for (const d of ds) {
        const m = buckets.get(d)!;
        const parts = Object.keys(m).map((k) => `${k}×${m[k]}`);
        overlay.appendChild(divText("", `거리 ${d}: ${parts.join(" · ")}`));
      }
    }

    scroller.appendChild(overlay);
  }

  box.appendChild(scroller);

  requestAnimationFrame(() => {
    const p = layout.pos[map.pos];
    if (!p) return;
    const scale = getUiScaleNow();
    const vx = (p.x - viewX) * scale * mapZoom;
    const vy = (p.y - viewY) * scale * mapZoom;
    const targetX = Math.max(0, vx - viewport.clientWidth * 0.45);
    const targetY = Math.max(0, vy - viewport.clientHeight * 0.45);
    viewport.scrollLeft = targetX;
    viewport.scrollTop = targetY;
  });

  const tip = divText(
    "",
    detailMode
      ? "상세: 지도 위에 요약 정보가 표시됩니다. 이동은 인접 노드 클릭으로만 가능합니다."
      : ""
  );
  tip.style.cssText = `margin-top:calc(${8} * var(--u)); font-size:calc(12 * var(--u)); opacity:.8; line-height:1.3;`;
  box.appendChild(tip);

  parent.appendChild(box);
}
function renderMapNodeSelect(root: HTMLElement, g: GameState, actions: UIActions) {
  const { map, timeMove, pursuit } = ensureGraphRuntime(g);
  const vp = visionParamsFromState(g);
  updateSeenFromVision(map, vp);

  const wrap = div("nodeSelectWrap");
  wrap.classList.add("mapNodeSelect");

  const hdr = div("nodeSelectHeader");
  hdr.style.cssText = "display:flex; align-items:flex-end; justify-content:space-between; gap:calc(16 * var(--u));";

  const left = div("nodeSelectTitle");
  const tNow = totalTimeOnMap(g);
  const ex = g.run.nodePickCount ?? 0;

  left.appendChild(divText("", `총 시간 ${tNow} · 탐험 ${ex} · 이동 ${timeMove}`));

  ensureBossSchedule(g);
  const runAny = g.run as any;
  const nextBossTime = Number(runAny.nextBossTime ?? 40) || 40;
  const remainingBoss = Math.max(0, nextBossTime - tNow);
  const omenText =
    (g.run.bossOmenText && String(g.run.bossOmenText).trim() !== "")
      ? String(g.run.bossOmenText)
      : "아직 징조가 없다.";

  left.appendChild(divText("", `다음 보스까지 ${remainingBoss} · ${omenText}`));

  if (remainingBoss <= 3) {
    const runAnyBoss = g.run as any;
    const stamp = Number(runAnyBoss.bossApproachToastBossTime ?? -1) || -1;
    if (stamp !== nextBossTime) {
      runAnyBoss.bossApproachToastBossTime = nextBossTime;
      pushUiToast(g, "WARN", `보스가 다가옵니다 (남은 이동 ${remainingBoss})`, 2200);
    }
  }

  if (g.run.treasureObtained) {
    const distToStart = bfsDistances(map, map.pos, 9999)[map.startId];
    const distTxt = distToStart == null ? "?" : String(distToStart);
    left.appendChild(
      divText("", `추격 ${pursuit.heat ?? 0} (tier ${pursuitTier(pursuit.heat ?? 0)}) · 입구까지 ${distTxt}`)
    );
  }

  const right = div("nodeSelectHeaderRight");

  /*const hint = divText("", "시야 " + vp.presenceR + "/" + vp.typeR + "/" + vp.detailR + " (" + vp.mode + ")");
  hint.style.opacity = "0.8";
  right.appendChild(hint);*/

  const btnDetail = mkButton(mapDetailOverlayOpen ? "상세 닫기" : "상세", () => {
    mapDetailOverlayOpen = !mapDetailOverlayOpen;
    if (!mapDetailOverlayOpen) detachMapDetailOutsideDown();
    render(g, actions);
  });
  btnDetail.classList.add("mapDetailToggleBtn");
  btnDetail.style.cssText = `margin-left:calc(${-30} * var(--u)); padding:calc(${2} * var(--u)) calc(${5} * var(--u)); opacity:.9;`;
  right.appendChild(btnDetail);

  hdr.appendChild(left);
  hdr.appendChild(right);
  wrap.appendChild(hdr);

  renderMapMiniGraph(wrap, g, actions, map, vp, false);

  if (mapDetailOverlayOpen) {

    const panel = div("mapDetailPanel");
    panel.style.cssText =
      `position:fixed; right:calc(${24} * var(--u)); top:calc(${24} * var(--u)); ` +
      `width:min(calc(${520} * var(--u)), calc(100vw - calc(${64} * var(--u)))); ` +
      `max-height:calc(100vh - calc(${64} * var(--u))); ` +
      `overflow-y:auto; overflow-x:hidden; ` +
      `z-index:70001; ` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.14); border-radius:calc(${14} * var(--u)); ` +
      `background:rgba(0,0,0,1); ` +                 // ✅ 완전 불투명
      `backdrop-filter:none; ` +
      `padding:calc(${12} * var(--u));`;

    panel.addEventListener("click", (ev) => ev.stopPropagation());
    panel.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });

    const onDocPointerDown = (ev: PointerEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && panel.contains(el)) return; // 패널 내부 클릭은 무시

      // 상단 크롬(새 런/룰북/로그/설정) 포함: 패널은 닫되, click 이벤트는 먹지 않게(렌더 호출 없음) 처리
      mapDetailOverlayOpen = false;
      detachMapDetailOutsideDown();

      // ✅ 즉시 DOM만 닫고(렌더는 나중에 다른 액션이 알아서 하게)
      // 클릭 타겟을 DOM에서 뽑아버려서 click 이벤트가 사라지는 현상을 막는다.
      try { panel.remove(); } catch {}
      const tb = document.querySelector<HTMLButtonElement>(".mapDetailToggleBtn");
      if (tb) tb.textContent = "상세";
    };

    const head = div("");
    head.style.cssText = `display:flex; align-items:center; justify-content:space-between; gap:calc(${10} * var(--u));`;

    const hTitle = divText("", "지도 상세");
    hTitle.style.cssText = `font-weight:700; opacity:.95;`;
    head.appendChild(hTitle);

    const btnClose = mkButton("닫기", () => {
      mapDetailOverlayOpen = false;
      detachMapDetailOutsideDown();
      render(g, actions);
    });
    btnClose.style.cssText = `padding:calc(${6} * var(--u)) calc(${10} * var(--u)); opacity:.9;`;
    head.appendChild(btnClose);

    panel.appendChild(head);

    const neighBox = div("");
    neighBox.style.cssText =
      `margin-top:calc(${10} * var(--u)); padding:calc(${10} * var(--u)); ` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.10); border-radius:calc(${12} * var(--u)); background:rgba(255,255,255,.03);`;

    const neighTitle = h3("이동 가능한 이웃");
    neighTitle.style.margin = `0 0 calc(${6} * var(--u)) 0`;
    neighBox.appendChild(neighTitle);

    const ns = map.edges[map.pos] ?? [];
    if (ns.length === 0) neighBox.appendChild(p("이웃이 없습니다."));

    for (let i = 0; i < ns.length; i++) {
      const toId = ns[i];
      const n = map.nodes[toId];
      const actual = (n?.kind ?? "BATTLE") as MapNodeKind;

      const revealNow: RevealLevel = (vp.presenceR >= 1) ? (revealLevelForDist(1, vp) as RevealLevel) : 0;
      const lv = seenLevel(map, toId);

      const pk =
        revealNow > 0
          ? perceivedKindForNode(g, toId, actual, revealNow as any, vp)
          : (lv >= 2
              ? (actual === "START"
                  ? ({ shown: null, label: "입구", certainty: (lv === 3 ? "DETAIL" : "TYPE") as any } as any)
                  : ({ shown: actual as any, label: nodeLabelParts(actual as any, false).text, certainty: (lv === 3 ? "DETAIL" : "TYPE") as any } as any))
              : (lv === 1
                  ? ({ shown: null, label: "무언가", certainty: "PRESENCE" as any } as any)
                  : ({ shown: null, label: "보이지 않음", certainty: "HIDDEN" as any } as any)));

      const row = div("");
      row.style.cssText =
        `display:flex; align-items:center; gap:calc(${10} * var(--u)); ` +
        `padding:calc(${8} * var(--u)) calc(${10} * var(--u)); border-radius:calc(${10} * var(--u)); ` +
        `border:calc(1 * var(--u)) solid rgba(255,255,255,.10); background:rgba(0,0,0,.20);` +
        `margin-top:calc(${6} * var(--u));`;

      const badge = divText("", (revealNow > 0 || lv > 0) ? `${toId}` : `출구 ${i + 1}`);
      badge.style.cssText =
        `flex:0 0 auto; padding:calc(${4} * var(--u)) calc(${8} * var(--u)); border-radius:calc(${10} * var(--u)); ` +
        `border:calc(1 * var(--u)) solid rgba(255,255,255,.14); background:rgba(0,0,0,.25); opacity:.9;`;
      row.appendChild(badge);

      const mid = div("");
      mid.style.cssText = "flex:1 1 auto; min-width:0;";
      renderPerceivedLabel(mid, pk);
      row.appendChild(mid);

      neighBox.appendChild(row);
    }

    panel.appendChild(neighBox);

    if (vp.presenceR >= 2) {
      const dist = bfsDistances(map, map.pos, vp.presenceR);
      const farIds = Object.keys(dist)
        .filter((id) => (dist[id] ?? 999) >= 2 && (dist[id] ?? 999) <= vp.presenceR)
        .sort((a, b) => (dist[a] - dist[b]) || a.localeCompare(b));

      if (farIds.length) {
        const scout = div("");
        scout.style.cssText =
          `margin-top:calc(${10} * var(--u)); padding:calc(${10} * var(--u)); ` +
          `border:calc(1 * var(--u)) solid rgba(255,255,255,.10); border-radius:calc(${12} * var(--u)); background:rgba(255,255,255,.03);`;

        const t = h3("멀리 보이는 곳");
        t.style.margin = `0 0 calc(${6} * var(--u)) 0`;
        scout.appendChild(t);

        const buckets = new Map<number, Record<string, number>>();
        for (const id of farIds) {
          const d = dist[id] ?? 0;
          const n = map.nodes[id];
          const actual = n?.kind ?? "BATTLE";
          const reveal = revealLevelForDist(d, vp);
          const pk = perceivedKindForNode(g, id, actual, reveal as any, vp);
          const key = (pk.certainty === "PRESENCE") ? "무언가" : pk.label;

          const m = buckets.get(d) ?? {};
          m[key] = (m[key] ?? 0) + 1;
          buckets.set(d, m);
        }

        const ds = Array.from(buckets.keys()).sort((a, b) => a - b);
        for (const d of ds) {
          const m = buckets.get(d)!;
          const parts = Object.keys(m).map((k) => `${k}×${m[k]}`);
          scout.appendChild(divText("", `거리 ${d}: ${parts.join(" · ")}`));
        }

        panel.appendChild(scout);
      }
    }
    detachMapDetailOutsideDown();
    mapDetailOutsideDown = onDocPointerDown;
    document.addEventListener("pointerdown", mapDetailOutsideDown, true);
    root.appendChild(panel);
  }

  root.appendChild(wrap);
}
function renderNodeSelect(root: HTMLElement, g: GameState, actions: UIActions) {
  const { map } = ensureGraphRuntime(g);

  // 밝은 어둠: 노드셀렉트 진입 토스트(스팸 방지)
  {
    const runAny = g.run as any;
    const key = `${String(map.pos ?? "")}::${Number(runAny.timeMove ?? 0) || 0}`;
    if (runAny._bdNodeToastKey !== key) {
      runAny._bdNodeToastKey = key;
      const patron = getPatronGodOrNull(g);
      if (patron === "bright_darkness") {
        pushUiToast(g, "INFO", GOD_LINES.bright_darkness.nodeSelect, 1800);
        logMsg(g, GOD_LINES.bright_darkness.nodeSelect);
      }
      if (isHostile(g, "bright_darkness")) {
        pushUiToast(g, "WARN", GOD_LINES.bright_darkness.hostileMap, 2200);
        logMsg(g, GOD_LINES.bright_darkness.hostileMap);
      }
    }
  }
  renderMapNodeSelect(root, g, actions);
}

function hr() {
  return document.createElement("hr");
}








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



      slots[idx] = null;

      const placed = (g.placedUidsThisTurn ?? []).includes(uidHere);
      if (placed) {
        g.usedThisTurn = Math.max(0, g.usedThisTurn - 1);
        if (side === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);
        g.placedUidsThisTurn = (g.placedUidsThisTurn ?? []).filter((u) => u !== uidHere);
      }

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

    onUseItem: (idx: number) => {
      const g = getG();
      if (g.run.finished) return;
      if (g.choice || overlay) return;
      if (isTargeting(g)) return;

      const ok = useItemAt(g, idx);
      if (ok) render(g, actions);
    },

    onDiscardItem: (idx: number) => {
      const g = getG();
      if (g.run.finished) return;
      // allow discarding even while a choice is open (reward/shop)
      if (overlay) return;
      if (isTargeting(g)) return;

      const ok = discardItemAt(g, idx, "UI");
      if (ok) render(g, actions);
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

      const placed = (g.placedUidsThisTurn ?? []).includes(uid);
      if (placed) {
        g.usedThisTurn = Math.max(0, g.usedThisTurn - 1);
        if (fromSide === "front") g.frontPlacedThisTurn = Math.max(0, g.frontPlacedThisTurn - 1);
        g.placedUidsThisTurn = (g.placedUidsThisTurn ?? []).filter((u) => u !== uid);
      }

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



    onMoveToNode: (toId: string) => {
      const g = getG();
      if (g.run.finished) return;
      if (g.choice) return;
      if (g.phase !== "NODE") return;

      if (nodePickLock) return;
      nodePickLock = true;
      setTimeout(() => (nodePickLock = false), 180);

      const runAny = g.run as any;
      const { map, pursuit, vision } = ensureGraphRuntime(g);

      const from = map.pos;
      const neigh = map.edges[from] ?? [];
      if (!neigh.includes(toId)) return;


      runAny.timeMove = Number(runAny.timeMove ?? 0) + wingArteryMoveDelta(g);
      map.visionNonce = Number(map.visionNonce ?? 0) + 1;


      map.pos = toId;


      const node = map.nodes[toId] ?? (map.nodes[toId] = { id: toId, kind: "BATTLE" });
      const firstVisit = !node.visited;
      if (firstVisit) {
        node.visited = true;
        g.run.nodePickCount = (g.run.nodePickCount ?? 0) + 1;
      }


      if (g.run.treasureObtained) {
        pursuit.heat = Number(pursuit.heat ?? 0) + 1;
        const tier = pursuitTier(pursuit.heat);

        maybeShiftTopology(g);

        if (map.pos === map.startId) {
          g.run.finished = true;
          logMsg(g, "보물을 들고 입구로 돌아왔다! 탈출에 성공했습니다!");
          render(g, actions);
          return;
        }

        if (firstVisit && node.kind !== "TREASURE" && node.kind !== "START") {
          g.run.afterTreasureNodePicks = (g.run.afterTreasureNodePicks ?? 0) + 1;
        }
      }


      ensureBossSchedule(g);
      const T = totalTimeOnMap(g);
      if (Number(runAny.nextBossTime ?? 0) > 0 && T >= Number(runAny.nextBossTime ?? 0)) {
        runAny.forcedNext = null;
        runAny.nextBossTime = Number(runAny.nextBossTime ?? 0) + 40;
        g.run.bossOmenText = null;

        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).noRespawn = true;
        (node as any).lastClearedMove = Number(runAny.timeMove ?? 0);

        logMsg(g, "시간이 다 되어 보스가 나타납니다. (시간 +1)");

        spawnEncounter(g, { forceBoss: true });
        startCombat(g);
        render(g, actions);
        return;
      }



      const tmNow = Number(runAny.timeMove ?? 0) || 0;

      if (node.cleared && (node.kind === "BATTLE" || node.kind === "EVENT" || node.kind === "REST" || node.kind === "ELITE")) {
        if (node.kind === "ELITE") (node as any).noRespawn = true;
        node.kind = "EMPTY";
        (node as any).lastClearedMove = Number((node as any).lastClearedMove ?? tmNow);
      }

      let actualKind: MapNodeKind = node.kind;

      if (actualKind === "EMPTY") {
        const noRespawn = !!(node as any).noRespawn;
        const last = Number((node as any).lastClearedMove ?? -999);
        const cd = Number((runAny.respawnCooldownMoves ?? 2)) || 2;
        const inCooldown = tmNow - last <= cd;

        if (!noRespawn && !inCooldown) {
          const tier = g.run.treasureObtained ? pursuitTier(pursuit.heat) : 0;
          const f = Math.max(0, Number(g.player.fatigue ?? 0) || 0);
          const fBoost = clamp01(f / 25) * 0.18;

          const base = g.run.treasureObtained ? 0.22 : 0.12;
          const tierBoost = g.run.treasureObtained ? 0.10 : 0.08;
          const p = clamp01(base + tier * tierBoost + fBoost);

          if (Math.random() < p) {
            const r = Math.random();
            const pBattle = g.run.treasureObtained ? 0.72 : 0.55;
            const pEvent = g.run.treasureObtained ? 0.90 : 0.85;
            actualKind = r < pBattle ? "BATTLE" : r < pEvent ? "EVENT" : "REST";
            node.kind = actualKind;
            node.cleared = false;
            (node as any).respawnCount = Number((node as any).respawnCount ?? 0) + 1;
            logMsg(g, "재발동: 이곳에서 다시 무언가가 일어납니다...");
          }
        }
      }

      // 광기(적대) 3: 전투가 아닌 노드에서도 50% 확률로 전투 발생
      {
        const bane = getMadnessBane(g);
        if (bane === 3 && (actualKind === "EVENT" || actualKind === "REST" || actualKind === "SHOP")) {
          if (Math.random() < 0.5) {
            actualKind = "BATTLE";
            logMsg(g, "광기(적대): 던전이 뒤틀려 전투가 발생합니다...");
            pushUiToast(g, "WARN", "광기의 힘이 길을 막아섭니다.", 1800);
          }
        }
      }

      if (actualKind === "START") {
        render(g, actions);
        return;
      }

      if (actualKind === "TREASURE") {
        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).noRespawn = true;
        (node as any).lastClearedMove = tmNow;
        obtainTreasure(g);
        render(g, actions);
        return;
      }

      if (actualKind === "REST") {
        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).lastClearedMove = tmNow;
        const highF = (g.player.fatigue ?? 0) >= 10;

        // 신앙/적대 훅 (화로 적대: 카드 제거, 꿈그림자 적대: 방해 토스트 등)
        onEnterRestExplorationHooks(g);

        const patron = getPatronGodOrNull(g);
        const dreamHostile = isHostile(g, "dream_shadow");
        const forgeHostile = isForgeHostile(g);

        const healDetail =
          dreamHostile ? "회복량 0" :
          patron === "dream_shadow" ? "항상 최대 체력 (F +3)" :
          "HP +15";

        const upgradeDetail =
          forgeHostile ? "(불가)" :
          (patron === "dream_shadow" || dreamHostile) ? "카드 1장 강화 (피로만큼 피해)" :
          "카드 1장 강화";

        const optionsBase = [
          { key: "rest:heal", label: "회복", detail: healDetail },
          { key: "rest:clear_f", label: "정비", detail: "F -3" },
          { key: "rest:upgrade", label: "강화", detail: upgradeDetail },
          { key: "rest:skip", label: "떠나기" },
        ];

        const options = forgeHostile ? optionsBase.filter((o) => o.key !== "rest:upgrade") : optionsBase;

        g.choice = {
          kind: "EVENT",
          title: "휴식",
          art: assetUrl("assets/events/event_rest.png"),
          prompt: highF ? "피로가 너무 높아 시간이 더 걸릴 수 있습니다." : "캠프에 잠시 머문다.",
          options,
        } as any;

        g.choiceCtx = { kind: "REST", highF } as any;
        render(g, actions);
        return;
      }



      if (actualKind === "SHOP") {
        // 상점은 EMPTY로 바뀌지 않습니다. (노드에 계속 상점으로 남음)
        node.visited = true;
        node.cleared = true;
        (node as any).noRespawn = true;
        (node as any).lastClearedMove = tmNow;

        openShopChoice(g, toId);
        render(g, actions);
        return;
      }

      if (actualKind === "EVENT") {
        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).lastClearedMove = tmNow;
        const runAny2: any = g.run;
        runAny2.ominousProphecySeen ??= false;

        // 신의 유혹(4): 이벤트를 대체해서 등장
        {
          const f = ensureFaith(g);
          if (f.chosen) {
            const tempter = pickTemptingGod(g);
            const P_TEMPT = 0.25;
            if (tempter && Math.random() < P_TEMPT) {
              openGodTemptChoice(g, tempter);
              render(g, actions);
              return;
            }
          }
        }

        const OMEN_CHANCE = 0.3;
        let ev = pickEventByMadness(g);

        // 오멘 이벤트는 처음엔 가끔 강제, 한 번 본 뒤에는 거의 나오지 않게
        if (runAny2.ominousProphecySeen === true) {
          for (let i = 0; i < 50 && (ev as any).id === "ominous_prophecy"; i++) {
            ev = pickEventByMadness(g);
          }
        } else {
          if (Math.random() < OMEN_CHANCE) {
            ev = getEventById("ominous_prophecy") ?? ev;
          }
        }

        // ✅ 같은 이벤트가 2연속으로 나오지 않게(가능한 경우)
        {
          const lastEventId: string | null | undefined = (runAny2.lastEventId as any) ?? null;
          if (lastEventId && (ev as any)?.id === lastEventId) {
            for (let i = 0; i < 60; i++) {
              const cand = pickEventByMadness(g);
              const cid = (cand as any)?.id;
              if (!cid) continue;
              if (runAny2.ominousProphecySeen === true && cid === "ominous_prophecy") continue;
              if (cid !== lastEventId) {
                ev = cand;
                break;
              }
            }
          }
        }

        if ((ev as any)?.id === "ominous_prophecy") {
          runAny2.ominousProphecySeen = true;
        }

        if (!ev) {
          render(g, actions);
          return;
        }

        // ✅ 런 1회 이벤트 처리를 위해, 이벤트 선택 시점에 기록
        {
          const runAnyEv = g.run as any;
          runAnyEv.eventsSeen ??= {};
          const cur = Number(runAnyEv.eventsSeen[ev.id] ?? 0) || 0;
          runAnyEv.eventsSeen[ev.id] = cur + 1;
          runAnyEv.lastEventId = ev.id;
        }

        let opts = ev.options(g);


        /*const { tier } = madnessP(g);
        if (tier >= 2 && !opts.some((o) => o.key === "mad:whisper")) {
          opts = [
            ...opts,
            {
              key: "mad:whisper",
              label: "속삭임에 귀 기울인다.",
              detail: "무언가를 얻는다. 그리고 무언가를 잃는다.",
              apply: (gg: GameState) => {
                const r = Math.random();
                if (r < 0.34) {
                  gg.player.hp = Math.min(gg.player.maxHp, gg.player.hp + 10);
                  logMsg(gg, "속삭임: HP +10");
                } else if (r < 0.67) {
                  gg.player.fatigue += 1;
                  logMsg(gg, "속삭임: F +1 (대가)");
                } else {
                  addCardToDeck(gg, "mad_echo", { upgrade: 0 });
                  logMsg(gg, "속삭임: [메아리]를 얻었다.");
                }
                return "NONE" as any;
              },
            } as any,
          ];
        }*/

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


          const up = getUnlockProgress(g);
          up.eventPicks += 1;
          checkRelicUnlocks(g);

          const outcome: EventOutcome = picked.apply(g);

          if (typeof outcome === "object" && outcome.kind === "UPGRADE_PICK") {
            openUpgradePick(g, actions, outcome.title ?? "강화", outcome.prompt ?? "강화할 카드 1장을 선택하세요.");
            return;
          }

          if (typeof outcome === "object" && outcome.kind === "REMOVE_PICK") {
            // "저주받은 보물"(goal_treasure)은 제거 불가: 리스트에서 제외
            const candidates = Object.values(g.cards)
              .filter((c) => (c.zone === "deck" || c.zone === "hand" || c.zone === "discard") && c.defId !== "goal_treasure")
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

            (g.run as any).onWinGrantRelicId = outcome.onWinGrantRelicId ?? null;

            logMsg(g, outcome.title ? `이벤트 전투: ${outcome.title}` : "이벤트 전투 발생!");

            const runAny = g.run as any;
            runAny.pendingEventWinRelicId = outcome.onWinGrantRelicId ?? null;
            runAny.pendingEventWinGold = Number(outcome.onWinGrantGold ?? 0) || 0;

            g.phase = "NODE";
            spawnEncounter(g, { forcePatternIds: outcome.enemyIds });
            g._justStartedCombat = true;
            startCombat(g);
            render(g, actions);
            return;
          }

          if (outcome === "BATTLE") {
            clearChoiceStack(g);
            g.phase = "NODE";
            spawnEncounter(g);
            g._justStartedCombat = true;
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


      if (actualKind === "BATTLE" || actualKind === "ELITE") {
        // 광기(수락) 3: 50% 확률로 전투 노드에서도 전투가 발생하지 않음 (보스 제외)
        {
          const boon = getMadnessBoon(g);
          if (boon === 3 && Math.random() < 0.5) {
            node.cleared = true;
            node.kind = "EMPTY";
            (node as any).lastClearedMove = tmNow;
            if (actualKind === "ELITE") (node as any).noRespawn = true;
            logMsg(g, "광기: 전투가 어딘가로 사라졌다...");
            pushUiToast(g, "INFO", "전투가 일어나지 않았습니다.", 1600);
            render(g, actions);
            return;
          }
        }

        node.cleared = true;
        node.kind = "EMPTY";
        (node as any).lastClearedMove = tmNow;
        if (actualKind === "ELITE") (node as any).noRespawn = true;

        logMsg(g, "이동 후 전투 시작 (시간 +1)");

        if (actualKind === "ELITE") {
          spawnEncounter(g, { forceBoss: false, forceElite: true });
        } else {
          spawnEncounter(g, { forceBoss: false });
        }
        startCombat(g);
        render(g, actions);
        return;
      }

      render(g, actions);
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

      if (k === "skip") {
        logMsg(g, "강화 취소");
        closeChoiceOrPop(g);

        if (opts?.onSkip) opts.onSkip();
        else render(g, actions);
        return;
      }


      if (k.startsWith("up:")) {
        const uid = k.slice("up:".length);
        const ok = upgradeCardByUid(g, uid);
        logMsg(g, ok ? `강화: [${cardDisplayNameByUid(g, uid)}]` : "강화 실패");

        closeChoiceOrPop(g);

        if (opts?.onDone) opts.onDone();
        else render(g, actions);
        return;
      }


      closeChoiceOrPop(g);
      render(g, actions);
    };


    render(g, actions);
  }
  return actions;
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

export function mountRoot(): HTMLDivElement {
  applyAssetVarsOnce();
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";
  return app;
}

function mkButton(label: string, onClick: () => void, className = "") {
  const b = document.createElement("button");
  if (className) b.className = className;
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

function normalizeEnemyNameWidth() {
  const names = Array.from(document.querySelectorAll<HTMLElement>(".enemyName"));
  if (names.length === 0) return;

  // 강경 모드: 픽셀 단위 대신 문자폭(ch) 기반으로 폭을 맞춘다.
  // (폰트/언어에 따라 완전 동일하진 않지만, 다양한 화면에서 예측 가능성이 좋습니다.)
  let maxLen = 0;
  for (const el of names) {
    const t = (el.textContent ?? "").trim();
    if (t.length > maxLen) maxLen = t.length;
  }

  const CAP_CH = 24;
  const wch = Math.max(6, Math.min(maxLen, CAP_CH));

  names.forEach((el) => {
    el.style.display = "inline-block";
    el.style.width = `${wch}ch`;
    el.style.whiteSpace = "nowrap";
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
      const xvw = (f.x / window.innerWidth) * 100;
      const yvh = (f.y / window.innerHeight) * 100;
      el.style.left = `${xvw.toFixed(4)}vw`;
      el.style.top = `${yvh.toFixed(4)}vh`;

      layer.appendChild(el);
    } else {
      const xvw = (f.x / window.innerWidth) * 100;
      const yvh = (f.y / window.innerHeight) * 100;
      el.style.left = `${xvw.toFixed(4)}vw`;
      el.style.top = `${yvh.toFixed(4)}vh`;
    }
  }
}

export function ensureFloatingNewRunButton() {

  if (document.querySelector(".floatingNewRun")) return;

  const btn = document.createElement("button");
  btn.className = "floatingNewRun";
  btn.type = "button";
  btn.textContent = "";

  // Label only. (Faith score is shown in a separate badge next to the button.)
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
    floatingNewRunHandler?.();
  });

  document.body.appendChild(btn);
}

function ensureFloatingFaithBadge() {
  if (document.querySelector(".floatingFaithBadge")) return;
  const badge = document.createElement("div");
  badge.className = "floatingFaithBadge";
  badge.textContent = "";
  badge.style.right = "auto";
  badge.style.bottom = "auto";
  wireFaithBadgeHover(badge);
  document.body.appendChild(badge);
}

function updateFloatingFaithScore(g: GameState) {
  const badge = document.querySelector<HTMLElement>(".floatingFaithBadge");
  const btn = document.querySelector<HTMLElement>(".floatingNewRun");
  if (!badge || !btn) return;
  const f = ensureFaith(g);
  const a = f.points[f.offered[0]] ?? 0;
  const b = f.points[f.offered[1]] ?? 0;
  const c = f.points[f.offered[2]] ?? 0;

  const r = btn.getBoundingClientRect();
  badge.style.left = `${Math.round(r.right + 8)}px`;
  badge.style.top = `${Math.round(r.top)}px`;
  badge.style.right = "auto";
  badge.textContent = `신앙 ${a}·${b}·${c}`;
}





export function render(g: GameState, actions: UIActions) {

  if (!(render as any)._uiScaleInitDone) {
    (render as any)._uiScaleInitDone = true;
    uiSettings = loadUiSettings();
    applyUiScaleVars();
  }
  currentG = g;
  clearAllHover();

  if (g.phase !== "NODE") {
    // 지도 상세 패널이 열려있던 상태에서 빠져나오면, 남아있는 document 리스너가 클릭을 먹을 수 있음
    mapDetailOverlayOpen = false;
    detachMapDetailOutsideDown();
  }

  setDevConsoleCtx({
    getG: () => currentG ?? g,
    actions: { onNewRun: () => actions.onNewRun() },
    rerender: () => render(currentG ?? g, actions),
    log: (msg) => logMsg((currentG ?? g), msg),
  });


  renderDevConsole();

  floatingNewRunHandler = () => actions.onNewRun();
  ensureFloatingNewRunButton();
  ensureFloatingFaithBadge();
  updateFloatingFaithScore(g);
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
        applyUiScaleVars();
      }
    });
    bindGlobalInput(() => currentG ?? g, actions);
    uiMounted = true;
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

  main.appendChild(renderBattleTitleRow(g));

  if (g.run.finished) main.appendChild(p("런 종료. 새로운 런을 원하시면 버튼을 누르거나 키보드 P를 입력하십시오."));
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

  renderItemTray(g, actions);

  renderRelicTray(g, actions);
  renderRelicModal(g, actions);

  detectAndEmitDeltas(g);
  renderPhaseBanner();
  renderFloatFxLayer();
  renderUiToastLayer(g);
  renderRelicHud(g, actions);
  scheduleSave(g);
  schedulePostLayout(g);

  setSOnlyHud(getSValueFromGame(g));
}

function getSValueFromGame(g: any): number | null {
  const s = g.player.supplies

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  if (!inCombat) return null;
  return (typeof s === "number") ? s : null;
}



function getRelicView(g: GameState, id: string) {
  const def: any = (RELICS_BY_ID as any)[id] ?? null;

  const disp = getRelicDisplay(g, id);

  const artRaw = def?.art ?? def?.icon ?? null;
  const art = artRaw ? assetUrl(String(artRaw)) : null;
  const icon = art;

  return {
    id,
    name: disp.name,
    desc: disp.text,
    state: disp.state,
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
      const img = document.createElement("img");
      img.className = "relicIconImg";
      img.src = v.icon;
      img.alt = v.name ?? v.id ?? "relic";
      icon.appendChild(img);
    } else {
      const t = document.createElement("div");
      t.textContent = v.name.slice(0, 2);
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

  const u = unitLenDev();
  const padU = 12;
  const pad = padU * u;
  const offU = 10;
  const off = offU * u;

  const r = tip.getBoundingClientRect();
  let x = relicHoverAt.x - r.width;
  let y = relicHoverAt.y - r.height - off;

  x = Math.max(pad, Math.min(window.innerWidth - r.width - pad, x));
  y = Math.max(pad, Math.min(window.innerHeight - r.height - pad, y));

  tip.style.left = lenFromDev(Math.round(x));
  tip.style.top = lenFromDev(Math.round(y));
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
    backdrop-filter: blur(calc(6 * var(--u)));
    -webkit-backdrop-filter: blur(calc(6 * var(--u)));
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(18 * var(--u));
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
  if (v.art) artImg.style.backgroundImage = `url("${assetUrl(v.art)}")`;
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
    backdrop-filter: blur(calc(6 * var(--u)));
    display: flex;
    align-items: flex-end;
    justify-content: center;
  `;

  const sheet = div("panel");
  sheet.style.cssText = `
    width: min(calc(720 * var(--u)), 100%);
    max-height: 70vh;
    border-radius: calc(18 * var(--u)) calc(18 * var(--u)) 0 0;
    padding: calc(12 * var(--u));
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
  wrap.style.cssText = "display:flex; flex-direction:column; gap:calc(12 * var(--u));";

  // =========================
  // UI 스케일
  // =========================
  const row = div("settingsRow");
  row.style.cssText = "display:flex; align-items:center; gap:calc(12 * var(--u)); flex-wrap:wrap;";

  const label = divText("", "UI 스케일");
  label.style.cssText = "font-weight:800;";

  const getNow = () => (isMobileUiNow() ? uiSettings.uiScaleMobile : uiSettings.uiScaleDesktop);

  const val = divText("", `${Math.round(getNow() * 100)}%`);
  val.style.cssText = "opacity:.9; min-width:calc(64 * var(--u)); text-align:right;";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0.75";
  slider.max = "1.25";
  slider.step = "0.01";
  slider.value = String(getNow());
  slider.style.cssText = "flex:1 1 calc(260 * var(--u));";

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

  const presets = div("settingsPresets");
  presets.style.cssText = "display:flex; gap:calc(8 * var(--u)); flex-wrap:wrap;";

  const makePreset = (txt: string, v: number) => {
    const b = mkButton(txt, () => {
      setUiScaleNow(v);
      slider.value = String(getNow());
      val.textContent = `${Math.round(getNow() * 100)}%`;
      onChange();
    });
    b.style.cssText =
      "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);" +
      "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
    return b;
  };

  presets.appendChild(makePreset("작게 90%", 0.90));
  presets.appendChild(makePreset("기본 100%", 1.00));
  presets.appendChild(makePreset("크게 110%", 1.10));
  presets.appendChild(makePreset("더 크게 120%", 1.20));
  wrap.appendChild(presets);

  const resetRow = div("settingsResetRow");
  resetRow.style.cssText = "display:flex; justify-content:flex-end; margin-top:calc(6 * var(--u));";
  const reset = mkButton("스케일 초기화", () => {
    setUiScaleNow(1.0);
    slider.value = String(getNow());
    val.textContent = `${Math.round(getNow() * 100)}%`;
    onChange();
  });
  reset.style.cssText =
    "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);" +
    "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
  resetRow.appendChild(reset);
  wrap.appendChild(resetRow);

  // =========================
  // 애니메이션 속도
  // =========================
  const animRow = div("settingsRow");
  animRow.style.cssText = "display:flex; align-items:center; gap:calc(12 * var(--u)); flex-wrap:wrap;";

  const animLabel = divText("", "애니메이션 속도");
  animLabel.style.cssText = "font-weight:800;";

  const animVal = divText("", `x${animMulNow().toFixed(2)}`);
  animVal.style.cssText = "opacity:.9; min-width:calc(64 * var(--u)); text-align:right;";

  const animSlider = document.createElement("input");
  animSlider.type = "range";
  animSlider.min = "0";
  animSlider.max = "2";
  animSlider.step = "0.05";
  animSlider.value = String(animMulNow());
  animSlider.style.cssText = "flex:1 1 calc(260 * var(--u));";

  const setAnim = (v: number) => {
    uiSettings.animMul = clamp(v, 0.0, 2.0);
    saveUiSettings();
    applyUiScaleVars(); // --animMul도 같이 적용됨
  };

  animSlider.oninput = () => {
    const v = Number(animSlider.value);
    setAnim(v);
    animVal.textContent = `x${animMulNow().toFixed(2)}`;
    onChange();
  };

  animRow.appendChild(animLabel);
  animRow.appendChild(animSlider);
  animRow.appendChild(animVal);
  wrap.appendChild(animRow);

  const animPresets = div("settingsPresets");
  animPresets.style.cssText = "display:flex; gap:calc(8 * var(--u)); flex-wrap:wrap;";

  const makeAnimPreset = (txt: string, v: number) => {
    const b = mkButton(txt, () => {
      setAnim(v);
      animSlider.value = String(animMulNow());
      animVal.textContent = `x${animMulNow().toFixed(2)}`;
      onChange();
    });
    b.style.cssText =
      "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);" +
      "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
    return b;
  };

  animPresets.appendChild(makeAnimPreset("즉시", 0.0));
  animPresets.appendChild(makeAnimPreset("빠름", 0.70));
  animPresets.appendChild(makeAnimPreset("기본", 1.00));
  animPresets.appendChild(makeAnimPreset("느림", 1.40));
  animPresets.appendChild(makeAnimPreset("아주 느림", 1.80));
  wrap.appendChild(animPresets);

  const animResetRow = div("settingsResetRow");
  animResetRow.style.cssText = "display:flex; justify-content:flex-end; margin-top:calc(6 * var(--u));";
  const animReset = mkButton("애니 초기화", () => {
    setAnim(1.0);
    animSlider.value = String(animMulNow());
    animVal.textContent = `x${animMulNow().toFixed(2)}`;
    onChange();
  });
  animReset.style.cssText =
    "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);" +
    "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
  animResetRow.appendChild(animReset);
  wrap.appendChild(animResetRow);

  // =========================
  // 슬롯 카드 표시
  // =========================
  const modeRow = div("settingsRow");
  modeRow.style.cssText = "display:flex; align-items:center; gap:calc(12 * var(--u)); flex-wrap:wrap;";

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

  btnFull.style.cssText = `padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);
    background:${cur === "FULL" ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)"}; color:#fff; cursor:pointer;`;
  btnName.style.cssText = `padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);
    background:${cur === "NAME_ONLY" ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)"}; color:#fff; cursor:pointer;`;

  modeRow.appendChild(modeLabel);
  modeRow.appendChild(btnFull);
  modeRow.appendChild(btnName);
  wrap.appendChild(modeRow);

  return wrap;
}


function applyUiScaleVars() {
  const root = document.documentElement;

  // ✅ Final scale = (user multiplier) x (screen-fit ratio)
  const scale = getUiScaleNow();

  root.style.setProperty("--uiScale", String(scale));
  root.style.setProperty("--uiScaleDesktop", String(uiSettings.uiScaleDesktop));
  root.style.setProperty("--uiScaleMobile", String(uiSettings.uiScaleMobile));
  root.style.setProperty("--animMul", String(animMulNow()));
}






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
      "background:rgba(0,0,0,1);" +
      "display:flex; justify-content:center; align-items:flex-start;" +
      "padding:calc(24 * var(--u)); box-sizing:border-box;"
    : "position:fixed; inset:0;" +
      "background:rgba(0,0,0,.55);" +
      "display:flex; justify-content:center; align-items:center;";


  layer.onclick = (e) => {
    if (e.target === layer) actions.onCloseOverlay();
  };

  const panel = div("overlay-panel");
  panel.style.cssText = isFull
    ? "width:min(calc(860 * var(--u)), 96vw); max-height:calc(100vh - calc(48 * var(--u))); overflow:auto;" +
      "padding:calc(16 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.12); border-radius:calc(16 * var(--u));" +
      "background:rgba(15,18,22,1); box-shadow:0 calc(18 * var(--u)) calc(60 * var(--u)) rgba(0,0,0,.45);"
    : "width:min(calc(980 * var(--u)), 92vw); max-height:80vh; overflow:auto; padding:calc(16 * var(--u));" +
      "border:calc(1 * var(--u)) solid rgba(255,255,255,.12); border-radius:calc(16 * var(--u));" +
      "background:rgba(15,18,22,.92); box-shadow:0 calc(18 * var(--u)) calc(60 * var(--u)) rgba(0,0,0,.45);";
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
    "display:flex; align-items:center; justify-content:space-between; gap:calc(12 * var(--u)); position:sticky; top:0; padding-bottom:calc(12 * var(--u)); margin-bottom:calc(12 * var(--u)); background:rgba(15,18,22,.92);";

  const h = h3(title);
  h.classList.add("overlayTitle");

  const closeBtn = button("닫기", actions.onCloseOverlay, false);
  closeBtn.classList.add("overlayClose");
  closeBtn.style.cssText =
    "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16); background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";

  header.appendChild(h);
  header.appendChild(closeBtn);
  panel.appendChild(header);




  if (overlay.kind === "RULEBOOK") {
    const pre = document.createElement("pre");
    pre.className = "rulebook";
    pre.textContent = RULEBOOK_TEXT;
    pre.style.cssText =
      "white-space:pre-wrap; line-height:1.45; font-size:calc(13 * var(--u)); margin:0; padding:calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.10); background:rgba(0,0,0,.18);";
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
      "grid-template-columns: 1fr calc(320 * var(--u));" +
      "gap:calc(16 * var(--u));" +
      "align-items:start;";

    const grid = div("pileGrid");
    grid.style.cssText =
      "display:grid;" +
      "grid-template-columns: repeat(auto-fill, minmax(var(--handCardW), 1fr));" +
      "gap:calc(10 * var(--u));" +
      "align-content:start;" +
      "min-width:0;"+
      "max-height: 62vh;" +
      "overflow-y: auto;" +
      "overflow-x: hidden;";

    const side = div("pileSide");
    side.style.cssText =
      "position:sticky; top:calc(72 * var(--u));" +
      "align-self:start;" +
      "border:calc(1 * var(--u)) solid rgba(255,255,255,.10);" +
      "border-radius:calc(14 * var(--u));" +
      "padding:calc(12 * var(--u));" +
      "background:rgba(0,0,0,.22);";

    const sideTitle = div("pileSideTitle");
    sideTitle.style.cssText = "font-weight:800; margin:0 0 calc(10 * var(--u)) 0; opacity:.95;";
    side.appendChild(sideTitle);

    const previewBox = div("pilePreviewBox");
    previewBox.style.cssText =
      "display:flex; justify-content:center; align-items:flex-start;" +
      "padding:calc(8 * var(--u)) 0 calc(10 * var(--u)) 0;";
    side.appendChild(previewBox);

    const sidePre = document.createElement("pre");
    sidePre.className = "pileSideDetail";
    sidePre.style.cssText =
      "margin:0;" +
      "padding:calc(10 * var(--u));" +
      "white-space:pre-wrap;" +
      "border-radius:calc(12 * var(--u));" +
      "border:calc(1 * var(--u)) solid rgba(255,255,255,.10);" +
      "background:rgba(0,0,0,.20);" +
      "font-size:calc(12 * var(--u));" +
      "line-height:1.45;";
    side.appendChild(sidePre);


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
        "padding:calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.10); background:rgba(255,255,255,.03);";
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

function renderItemTray(g: GameState, actions: UIActions) {
  document.querySelector(".itemTray")?.remove();
  document.querySelector(".itemCapHud")?.remove();

  const items = ((g.run as any).items as string[]) ?? [];
  if (!items || items.length === 0) return;

  const inCombat = g.enemies.length > 0 && g.phase !== "NODE";

  const tray = document.createElement("div");
  tray.className = "itemTray";

  let itemHoverId: string | null = null;

  const tip = document.createElement("div");
  // 유물 tooltip 스타일 그대로 재사용
  tip.className = "relicHoverTip itemHoverTip";
  tray.appendChild(tip);

  // 아이템 수/한도 + 버리기 힌트(2/2 옆, 트레이보다 살짝 위)
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

  // tray는 overflow가 있어서(스크롤) 위로 튀어나오면 잘릴 수 있음 → HUD는 body에 따로 붙이고 위치를 맞춘다
  // (render 때마다 재배치되므로 resize에도 크게 문제 없음)
  document.body.appendChild(capHud);
  // tray는 나중에 body에 append되므로, append 이후 위치를 계산해야 함


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

    // 툴팁(간단)

    const disabled = !inCombat || !!g.choice || !!overlay || isTargeting(g);
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

  // HUD 위치 계산(트레이의 좌상단 기준)
  try {
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--u")) || 1;
    const r = tray.getBoundingClientRect();
    capHud.style.left = `${Math.round(r.left + 6 * u)}px`;
    capHud.style.top = `${Math.round(r.top - 10 * u)}px`;
  } catch {}
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
      img.className = "relicIconImg";
      img.alt = disp.name;
      img.src = assetUrl(def.art);
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

  document.querySelector(".choice-overlay")?.remove();

  const c = g.choice;
  const main = document.querySelector<HTMLElement>(".mainPanel");
  if (!c) {
    main?.classList.remove("choiceOpen");
    return;
  }
  if (!main) return;
  main.classList.add("choiceOpen");


  const isShopChoice = (g.choiceCtx as any)?.kind === "SHOP";
  // 강경 모드: 모든 치수는 화면비 기반(var(--u))으로만 계산한다.
  // 여기 값들은 '디자인 기준치' (1440x900 기반)이고, 실제 렌더는 CSS가 var(--u)로 스케일합니다.
  const CHOICE_DROP = 70;
  const PAD_TOP = 20 + CHOICE_DROP;
  const PAD_R = 36;
  const PAD_B = 16;
  const PAD_L = 16;

  const GAP_ROW  = isShopChoice ? 12 : 18;
  const GAP_LIST = 10;

  const ILLU_SIZE = isShopChoice ? 220 : 260;
  const ILLU_MIN  = isShopChoice ? 170 : 200;

  const ITEM_R   = 14;
  const ITEM_PAD = 12;

  const DETAIL_PAD  = 10;
  const DETAIL_R    = 12;
  const DETAIL_FS   = 12;
  const DETAIL_MAXH = 220;

  const TITLE_FS  = 22;
  const PROMPT_FS = 14;


  const overlayEl = div("choice-overlay");
  overlayEl.style.cssText =
    "position:fixed; inset:0; z-index: var(--zChoice);" +
    "display:flex; justify-content:center; align-items:flex-start;" +
    "pointer-events:auto;";


  const backdrop = div("choice-backdrop");
  backdrop.style.cssText =
    "position:absolute; inset:0;" +
    "background: rgba(0,0,0,1);" +
    "backdrop-filter: blur(calc(4 * var(--u)));" +
    "-webkit-backdrop-filter: blur(calc(4 * var(--u)));" +
    "pointer-events:auto;";


  backdrop.onclick = () => {

  };

  const padWrap = div("choice-padWrap");
  padWrap.style.cssText =
    "position:relative; width:100%;" +
    `padding:calc(${PAD_TOP} * var(--u)) calc(${PAD_R} * var(--u)) calc(${PAD_B} * var(--u)) calc(${PAD_L} * var(--u));` +
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
    `margin:0 0 calc(${8} * var(--u)) 0; font-size:calc(${TITLE_FS} * var(--u)); font-weight:900;` +
    "text-align:left;";
  panel.appendChild(titleEl);

  if (c.prompt) {
    const promptEl = p(c.prompt);
    promptEl.style.cssText =
      `margin:0 0 calc(${12} * var(--u)) 0; font-size:calc(${PROMPT_FS} * var(--u)); line-height:1.25; opacity:.95;`;
    panel.appendChild(promptEl);
  }

  // =========================
  // Faith start: BIG selection UI
  // =========================

  if (c.kind === "FAITH" && (g.choiceCtx as any)?.kind === "FAITH_START") {
    panel.style.cssText +=
      `width:min(100vw, calc(${1800} * var(--u))); height:90vh;` +
      `max-height:94vh; overflow:auto;` +
      `padding:calc(${18} * var(--u)) calc(${18} * var(--u));` +
      `border-radius:calc(${18} * var(--u));` +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.16);` +
      `background:rgba(0,0,0,1);` +
      `box-shadow: 0 calc(18 * var(--u)) calc(60 * var(--u)) rgba(0,0,0,1);` +
      `font-family:"Mulmaru", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;`;

    const f = ensureFaith(g);
    const offered = f.offered as any as Array<"dream_shadow" | "wing_artery" | "forge_master">;

    const sub = div("faith-sub");
    sub.style.cssText =
      `margin:0 0 calc(${14} * var(--u)) 0;` +
      `font-size:calc(${13} * var(--u)); opacity:.92; line-height:1.35;`;
    sub.textContent = "선택한 신은 신앙 5로 시작합니다. 유혹 수락 시: 유혹한 신 +1 / 현재 포커스 -1. 포커스 점수 ≥3이면 후원 패시브가 활성화됩니다.";
    panel.appendChild(sub);

    const grid = div("faith-grid");
    grid.style.cssText =
      `display:grid; grid-template-columns:repeat(3, minmax(0, 1fr));` +
      `gap:calc(${14} * var(--u));`;

    const makeGodCard = (id: "dream_shadow" | "wing_artery" | "forge_master") => {
      const card = div("faith-godCard");
      card.style.cssText =
        `display:flex; flex-direction:column;` +
        `border-radius:calc(${16} * var(--u)); display:flex; align-items:center; justify-content:center;` +
        `border:calc(1 * var(--u)) solid rgba(255,255,255,.14);` +
        `background:#101010;` +
        `overflow:hidden;` +
        `min-height:calc(${640} * var(--u));`;

      const imgWrap = div("faith-imgWrap");
      imgWrap.style.cssText =
        `width:70%; aspect-ratio: 1/1; height:auto;` +
        `background:rgba(0,0,0,0);` +
        `border-bottom:calc(1 * var(--u)) solid rgba(255,255,255,.10);` +
        `position:relative; overflow:hidden;`;

      const img = document.createElement("img");
      img.alt = godName(id);
      img.src = assetUrl(godArt(id));
      (img.style as any).imageRendering = "pixelated";
      img.style.cssText =
        `position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:50% 35%;` +
        `transform: scale(1.09); transform-origin: 50% 50%;` +
        `image-rendering: pixelated; image-rendering: crisp-edges;`;
      img.onerror = () => {
        // 이미지가 없으면 그냥 배경만
        img.remove();
        const ph = div("faith-imgPh");
        ph.textContent = "(illustration)";
        ph.style.cssText =
          `position:absolute; inset:0; display:flex; align-items:center; justify-content:center;` +
          `opacity:.35; font-size:calc(${14} * var(--u));`;
        imgWrap.appendChild(ph);
      };

      imgWrap.appendChild(img);
      card.appendChild(imgWrap);

      const body = div("faith-body");
      body.style.cssText =
        `display:flex; flex-direction:column; gap:calc(${10} * var(--u));` +
        `padding:calc(${12} * var(--u));`;

      const nameEl = document.createElement("div");
      nameEl.textContent = godName(id);
      nameEl.style.cssText =
        `font-size:calc(${20} * var(--u)); font-weight:900; letter-spacing: 0.3em;` +
        `width:100%; text-align:center;`;
      body.appendChild(nameEl);

      const pre = document.createElement("pre");
      pre.textContent = godAbilityBlock(id);
      pre.style.cssText =
        `margin:0; padding:calc(${10} * var(--u));` +
        `white-space:pre-wrap; line-height:1.35;` +
        `font-size:calc(${13} * var(--u));` +
        `border:calc(1 * var(--u)) solid rgba(255,255,255,.10);` +
        `background:rgba(0,0,0,1);` +
        `font-family:"Mulmaru", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;`;
      body.appendChild(pre);

      const pickBtn = button("선택", () => actions.onChooseChoice(`faith:choose:${id}`), false);
      pickBtn.style.cssText +=
        `margin-top:auto; width:100%;` +
        `font-size:calc(${15} * var(--u));` +
        `padding:calc(${12} * var(--u)) calc(${12} * var(--u));` +
        `border-radius:calc(${12} * var(--u));`;
      body.appendChild(pickBtn);

      card.appendChild(body);
      return card;
    };

    for (const id of offered) grid.appendChild(makeGodCard(id));
    panel.appendChild(grid);

    padWrap.appendChild(panel);
    overlayEl.appendChild(backdrop);
    overlayEl.appendChild(padWrap);
    document.body.appendChild(overlayEl);
    return;
  }


  const fixPreviewSize = (cardEl: HTMLElement, scale = 1) => {
    const w = scale === 1 ? "var(--handCardW)" : `calc(var(--handCardW) * ${scale})`;
    const h = scale === 1 ? "var(--handCardH)" : `calc(var(--handCardH) * ${scale})`;
    cardEl.style.width = w;
    cardEl.style.height = h;
    cardEl.style.boxSizing = "border-box";
  };

  const makeDetailPre = (detail: any) => {
    const pre = document.createElement("pre");
    pre.className = "choice-detail";
    pre.textContent = String(detail);
    pre.style.cssText =
      `margin:calc(${10} * var(--u)) 0 0 0; padding:calc(${DETAIL_PAD} * var(--u));` +
      "white-space:pre-wrap;" +
      `border-radius: 0; border:calc(1 * var(--u)) solid rgba(255,255,255,.10);` +
      "background:rgba(0,0,0,.22);" +
      `font-size:calc(${DETAIL_FS} * var(--u)); line-height:1.45;` +
      `max-height:calc(${DETAIL_MAXH} * var(--u)); overflow:auto;`;
    return pre;
  };

  const makeItemShell = () => {
    const item = div("choice-item");
    item.style.cssText =
      "display:flex;" +
      `gap:calc(${12} * var(--u));` +
      "align-items:flex-start;" +
      `border:calc(1 * var(--u)) solid rgba(255,255,255,.10); border-radius:calc(${ITEM_R} * var(--u));` +
      `padding:calc(${ITEM_PAD} * var(--u));` +
      "background:rgba(255,255,255,.03);";
    return item;
  };

  const hasCardPreview = c.options.some((opt) => {
    if ((opt as any).cardUid) return true;
    if (typeof opt.key === "string" && opt.key.startsWith("pick:")) return true;
    // shop: 카드 구매도 실제 카드 프리뷰로 보여준다.
    if (isShopChoice && typeof opt.key === "string" && opt.key.startsWith("shop:card:")) return true;
    return false;
  });


  if (!hasCardPreview) {
    const contentRow = div("choice-contentRow");
    contentRow.style.cssText =
      "display:flex;" +
      `gap:calc(${GAP_ROW} * var(--u)); margin-top:calc(${12} * var(--u));` +
      "justify-content:center; align-items:stretch;";

    const leftCol = div("choice-leftCol");
    leftCol.style.cssText =
      `flex:1 1 calc(${isShopChoice ? 560 : 640} * var(--u)); max-width:calc(${isShopChoice ? 640 : 720} * var(--u)); min-width:0;` +
      "display:flex; flex-direction:column;";

    const list = div("choice-list");
    list.style.cssText = `display:flex; flex-direction:column; gap:calc(${GAP_LIST} * var(--u));`;

    c.options.forEach((opt) => {
      const item = makeItemShell();

      const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
      b.classList.add("choiceOptBtn");
      b.style.fontSize = `calc(${14} * var(--u))`;
      b.style.padding = `calc(${10} * var(--u)) calc(${12} * var(--u))`;
      b.style.borderRadius = `calc(${10} * var(--u))`;
      item.appendChild(b);

      if ((opt as any).detail) item.appendChild(makeDetailPre((opt as any).detail));
      list.appendChild(item);
    });

    leftCol.appendChild(list);

    const illuCol = div("choice-illuCol");
    illuCol.style.cssText =
      `flex:0 0 calc(${ILLU_SIZE} * var(--u)); min-width:calc(${ILLU_MIN} * var(--u));` +
      "display:flex; align-items:center; justify-content:center;";

    const illuBox = div("choice-illuBox");
    illuBox.style.cssText =
      "width:100%; aspect-ratio:1/1;" +
      `border-radius:calc(${18} * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,1);` +
      "background:rgba(0,0,0,1);" +
      "position:relative; overflow:hidden;" +
      "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.35);";

    const art = (c as any).art as string | undefined;
    if (art) {
      const img = document.createElement("img");
      img.src = assetUrl(art);
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

    padWrap.appendChild(panel);
    overlayEl.appendChild(backdrop);
    overlayEl.appendChild(padWrap);
    document.body.appendChild(overlayEl);
    return;
  }

  if (isShopChoice) {
    panel.classList.add("shopPanel");
    panel.style.overflow = "hidden"; // choice-panel 기본 overflow:auto 제거

    const nodeId = String((g.choiceCtx as any)?.nodeId ?? "");
    const shop = (g.run as any)?.shops?.[nodeId];

    if (!shop) {
    } else {
      const cardsGrid = div("shopCardsGrid");
      for (let i = 0; i < (shop.cards?.length ?? 0); i++) {
        const offer = shop.cards[i];
        if (!offer?.defId) continue;

        const tile = div("shopCardTile");
        if (offer.sold) tile.classList.add("sold");

        const cardEl = renderCardPreviewByDef(
          g,
          String(offer.defId),
          Number(offer.upgrade ?? 0) || 0
        ) as HTMLElement;

        fixPreviewSize(cardEl, 1);
        tile.appendChild(cardEl);

        const price = divText(
          "shopTilePrice",
          offer.sold ? "품절" : `🪙${Number(offer.priceGold ?? 0) || 0}`
        );
        tile.appendChild(price);

        if (!offer.sold) {
          tile.onclick = () => actions.onChooseChoice(`shop:card:${i}`);
        }

        cardsGrid.appendChild(tile);
      }

      const bottomRow = div("shopBottomRow");

      const itemsCol = div("shopItemsCol");
      const itemsGrid = div("shopItemsGrid");

      for (let i = 0; i < (shop.items?.length ?? 0); i++) {
        const offer = shop.items[i];
        if (!offer?.itemId) continue;

        const tile = div("shopItemTile");
        if (offer.sold) tile.classList.add("sold");
        wireItemHover(tile, String(offer.itemId));

        const def = getItemDefById(String(offer.itemId));
        const img = document.createElement("img");
        img.alt = def?.name ?? String(offer.itemId);
        if (def?.art) img.src = assetUrl(def.art);
        tile.appendChild(img);

        const price = divText(
          "shopTilePrice",
          offer.sold ? "품절" : `🪙${Number(offer.priceGold ?? 0) || 0}`
        );
        tile.appendChild(price);

        if (!offer.sold) {
          tile.onclick = () => actions.onChooseChoice(`shop:item:${i}`);
        }

        itemsGrid.appendChild(tile);
      }

      itemsCol.appendChild(itemsGrid);

      const svcCol = div("shopSvcCol");
      const svcGrid = div("shopSvcGrid");

      const mkSvc = (key: string, label: string, note: string, disabled: boolean) => {
        const box = div("shopSvcTile");
        const b = button(label, () => actions.onChooseChoice(key), disabled);
        b.classList.add("primary");
        box.appendChild(b);

        const n = divText("shopSvcNote", note);
        box.appendChild(n);
        return box;
      };

      svcGrid.appendChild(
        mkSvc(
          "shop:service:upgrade",
          shop.usedUpgrade ? "강화" : "강화",
          shop.usedUpgrade ? "사용 완료" : "🪙25",
          !!shop.usedUpgrade
        )
      );
      svcGrid.appendChild(
        mkSvc(
          "shop:service:remove",
          shop.usedRemove ? "제거" : "제거",
          shop.usedRemove ? "사용 완료" : "🪙25",
          !!shop.usedRemove
        )
      );
      svcGrid.appendChild(mkSvc("shop:supply:buy", "보급 구매", "-🪙6 / 🍞+3", false));
      svcGrid.appendChild(mkSvc("shop:supply:sell", "보급 판매", "+🪙4 / 🍞-3", false));

      svcCol.appendChild(svcGrid);

      bottomRow.appendChild(itemsCol);
      bottomRow.appendChild(svcCol);

      const leaveLabel =
        (c.options.find((o) => o.key === "shop:leave")?.label) ?? "나가기";

      const leaveBtn = button(leaveLabel, () => actions.onChooseChoice("shop:leave"), false);
      leaveBtn.classList.add("shopLeaveBtn");
      leaveBtn.style.cssText =
        "position:absolute;" +
        `top:calc(${16} * var(--u)); right:calc(${16} * var(--u));` +
        "z-index: 2;" +
        "border-radius:0;" +
        `padding:calc(${10} * var(--u)) calc(${14} * var(--u));` +
        `font-size:calc(${13} * var(--u)); font-weight:900;`;

      panel.appendChild(leaveBtn);

      const contentRow = div("choice-contentRow");
      contentRow.classList.add("shopContentRow");

      const leftCol = div("choice-leftCol");
      leftCol.classList.add("shopLeftCol");
      leftCol.appendChild(cardsGrid);
      leftCol.appendChild(bottomRow);

      const illuCol = div("choice-illuCol");
      illuCol.style.cssText =
        `flex:0 0 calc(${ILLU_SIZE} * var(--u)); min-width:calc(${ILLU_MIN} * var(--u));` +
        "display:flex; align-items:center; justify-content:center;";

      const illuBox = div("choice-illuBox");
      illuBox.style.cssText =
        "width:100%; aspect-ratio:1/1;" +
        `border-radius:calc(${18} * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,1);` +
        "background:rgba(0,0,0,1);" +
        "position:relative; overflow:hidden;" +
        "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.35);";

      const art = (c as any).art as string | undefined;
      if (art) {
        const img = document.createElement("img");
        img.src = assetUrl(art);
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

      // ✅ 여기서 끝 (아래 기존 리스트 렌더는 타지 않게)
      padWrap.appendChild(panel);
      overlayEl.appendChild(backdrop);
      overlayEl.appendChild(padWrap);
      document.body.appendChild(overlayEl);
      return;
    }
  } else {
    const ck = (g.choiceCtx as any)?.kind;
    const isBattleCardReward = !isShopChoice && (ck === "BATTLE_CARD_REWARD" || ck === "BATTLE_REWARD");

    const renderClickablePreviewByDef = (defId: string, upgrade: number, onPick: () => void): HTMLElement => {
      const tmpUid = `__choice_preview:${defId}:${upgrade}:${Math.random().toString(36).slice(2)}`;
      const prev = g.cards[tmpUid];
      (g.cards as any)[tmpUid] = { uid: tmpUid, defId, upgrade, zone: "preview" };

      const el = renderCard(g, tmpUid, true, () => onPick(), { draggable: false }) as HTMLElement;
      el.classList.add("overlayCard", "choicePickCard");
      el.draggable = false;
      el.style.cursor = "pointer";

      if (prev) g.cards[tmpUid] = prev;
      else delete (g.cards as any)[tmpUid];
      return el;
    };

    // =========================
    // Battle card reward: 3 cards horizontal, click card to pick, no side details
    // =========================
    if (isBattleCardReward) {
      const pickOpts = c.options.filter((opt) => typeof opt.key === "string" && opt.key.startsWith("pick:"));
      const skipOpt = c.options.find((opt) => opt.key === "skip") ?? null;

      const ctx: any = g.choiceCtx as any;
      const cardDecision = ctx?.cardDecision as (string | "SKIPPED" | undefined);

      // Optional item reward (combined into this screen)
      {
        const itemId = String(ctx?.itemOfferId ?? "");
        const itemDecision = ctx?.itemDecision as ("TAKEN" | "SKIPPED" | undefined);
        if (itemId) {
          const def = getItemDefById(itemId);
          const row = div("choice-rewardItemRow");
          row.style.cssText =
            "display:flex; justify-content:center; align-items:flex-start;" +
            `gap:calc(${14} * var(--u)); margin-bottom:calc(${16} * var(--u));`;

          const card = div("itemOfferCard");
          card.style.cssText =
            `width:calc(${170} * var(--u)); aspect-ratio:3/4;` +
            `border-radius: 0;` +
            "border:calc(1 * var(--u)) solid rgba(255,255,255,.14);" +
            "background:rgba(0,0,0,.35);" +
            "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.35);" +
            "display:flex; flex-direction:column; align-items:center; justify-content:flex-start;" +
            `padding:calc(${12} * var(--u)); gap:calc(${10} * var(--u));` +
            "cursor:pointer; user-select:none;";

          // Hover tooltip: show item ability text
          wireItemHover(card, itemId);

          if (itemDecision) {
            card.style.opacity = ".55";
            card.style.cursor = "default";
          } else {
            card.onclick = () => actions.onChooseChoice("take_item");
          }

          const title = divText("itemOfferTitle", "아이템 보상");
          title.style.cssText = `font-weight:900; font-size:calc(${14} * var(--u)); opacity:.92;`;

          if (def?.art) {
            const img = document.createElement("img");
            img.src = assetUrl(def.art);
            img.alt = def.name;
            (img.style as any).imageRendering = "pixelated";
            img.style.cssText =
              `width:calc(${96} * var(--u)); height:calc(${96} * var(--u));` +
              "object-fit:contain;" +
              "image-rendering: pixelated; image-rendering: crisp-edges;";
            card.appendChild(img);
          }

          const nm = divText("itemOfferName", def?.name ?? itemId);
          nm.style.cssText = `font-weight:800; font-size:calc(${14} * var(--u)); text-align:center;`;
          const hint = divText(
            "itemOfferHint",
            itemDecision === "TAKEN" ? "획득함" : itemDecision === "SKIPPED" ? "생략함" : "클릭하면 받습니다"
          );
          hint.style.cssText = `opacity:.75; font-size:calc(${12} * var(--u)); text-align:center;`;

          // Put title above card contents
          const wrap = div("itemOfferWrap");
          wrap.style.cssText = "display:flex; flex-direction:column; align-items:center;";
          wrap.appendChild(title);
          wrap.appendChild(card);
          const desc = divText("itemOfferDesc", def?.text ?? "");
          desc.style.cssText = `opacity:.85; font-size:calc(${12} * var(--u)); text-align:center; white-space:pre-wrap; line-height:1.35;`;
          (desc.style as any).maxHeight = `calc(${54} * var(--u))`;
          (desc.style as any).overflow = "hidden";
          (desc.style as any).textOverflow = "ellipsis";

          card.appendChild(nm);
          card.appendChild(desc);
          card.appendChild(hint);

          row.appendChild(wrap);

          // Explicit skip button (optional)
          if (!itemDecision) {
            const skipB = button("아이템 생략", () => actions.onChooseChoice("skip_item"), false);
            skipB.classList.add("ghost");
            skipB.style.fontSize = `calc(${13} * var(--u))`;
            skipB.style.padding = `calc(${10} * var(--u)) calc(${14} * var(--u))`;
            skipB.style.borderRadius = `calc(${10} * var(--u))`;
            row.appendChild(skipB);
          }

          panel.appendChild(row);
        }
      }

      const row = div("choice-rewardCardRow");
      row.style.cssText =
        "display:flex;" +
        `gap:calc(${18} * var(--u));` +
        "justify-content:center; align-items:flex-start;" +
        "flex-wrap:nowrap;";

      for (const opt of pickOpts) {
        const payload = opt.key.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        const canPick = !cardDecision;
        const el = renderClickablePreviewByDef(defId, upgrade, () => {
          if (!canPick) return;
          actions.onChooseChoice(opt.key);
        });
        if (!canPick) {
          el.style.opacity = ".55";
          el.style.cursor = "default";
        }
        fixPreviewSize(el, 1);
        row.appendChild(el);
      }

      panel.appendChild(row);

      if (skipOpt && !cardDecision) {
        const skipWrap = div("choice-rewardSkipRow");
        skipWrap.style.cssText = `margin-top:calc(${18} * var(--u)); display:flex; justify-content:center;`;
        const b = button(skipOpt.label || "생략", () => actions.onChooseChoice("skip"), false);
        b.classList.add("primary");
        b.style.fontSize = `calc(${14} * var(--u))`;
        b.style.padding = `calc(${10} * var(--u)) calc(${16} * var(--u))`;
        b.style.borderRadius = `calc(${10} * var(--u))`;
        skipWrap.appendChild(b);
        panel.appendChild(skipWrap);
      }

      padWrap.appendChild(panel);
      overlayEl.appendChild(backdrop);
      overlayEl.appendChild(padWrap);
      document.body.appendChild(overlayEl);
      return;
    }

    const list = div("choice-list");
    list.style.cssText =
      "display:flex; flex-direction:column;" +
      `gap:calc(${GAP_LIST} * var(--u)); margin-top:calc(${12} * var(--u));`;

    c.options.forEach((opt) => {
      // 상점 구분선은 버튼이 아니라 라인으로
      if (isShopChoice && (opt.key === "shop:sep" || opt.key.startsWith("shop:sep:"))) {
        const sep = div("choice-sep");
        sep.style.cssText =
          `height:calc(${1} * var(--u));` +
          "background:rgba(255,255,255,.12);" +
          `margin:calc(${6} * var(--u)) 0;`;
        list.appendChild(sep);
        return;
      }

      const item = makeItemShell();

      const left = div("choice-left");
      left.style.cssText = "flex:0 0 auto;";

      const uid = (opt as any).cardUid as string | undefined;
      if (uid) {
        const isUpgradePick = g.choice?.kind === ("UPGRADE_PICK" as any);
        const card = g.cards[uid];
        const curUp = (card?.upgrade ?? 0) || 0;
        const nextUp = curUp + 1;

        if (isUpgradePick) {
          const pair = div("upgradePair");
          pair.style.cssText = `display:flex; gap:calc(${10} * var(--u)); align-items:flex-start;`;

          let elCur: HTMLElement;
          let elNext: HTMLElement;
          try { elCur = renderCardPreviewByUidWithUpgrade(g, uid, curUp); }
          catch { elCur = renderRealCardForOverlay(g, uid) as HTMLElement; }
          try { elNext = renderCardPreviewByUidWithUpgrade(g, uid, nextUp); }
          catch { elNext = renderRealCardForOverlay(g, uid) as HTMLElement; }

          fixPreviewSize(elCur, 1);
          fixPreviewSize(elNext, 1);

          const arrow = divText("upgradeArrow", "→");
          arrow.style.cssText = `align-self:center; font-weight:900; opacity:.85; margin-top:calc(${6} * var(--u));`;

          pair.appendChild(elCur);
          pair.appendChild(arrow);
          pair.appendChild(elNext);
          left.appendChild(pair);
        } else {
          let el: HTMLElement;
          try { el = renderRealCardForOverlay(g, uid) as HTMLElement; }
          catch { el = renderRealCardForOverlay(g, uid) as HTMLElement; }
          fixPreviewSize(el);
          left.appendChild(el);
        }
      } else if (typeof opt.key === "string" && opt.key.startsWith("pick:")) {
        const payload = opt.key.slice("pick:".length);
        const [defId, upStr] = payload.split(":");
        const upgrade = Number(upStr ?? "0") || 0;
        const el = renderCardPreviewByDef(g, defId, upgrade) as HTMLElement;
        fixPreviewSize(el);
        left.appendChild(el);
      } else if (isShopChoice && typeof opt.key === "string" && opt.key.startsWith("shop:card:")) {
        const nodeId = String((g.choiceCtx as any)?.nodeId ?? "");
        const shop = (g.run as any)?.shops?.[nodeId];
        const idx = Number(opt.key.slice("shop:card:".length));
        const offer = shop?.cards?.[idx];
        if (offer?.defId) {
          const el = renderCardPreviewByDef(g, String(offer.defId), Number(offer.upgrade ?? 0) || 0) as HTMLElement;
          fixPreviewSize(el);
          if (offer.sold) el.style.opacity = ".35";
          left.appendChild(el);
        }
      } else if (isShopChoice && typeof opt.key === "string" && opt.key.startsWith("shop:item:")) {
        const nodeId = String((g.choiceCtx as any)?.nodeId ?? "");
        const shop = (g.run as any)?.shops?.[nodeId];
        const idx = Number(opt.key.slice("shop:item:".length));
        const offer = shop?.items?.[idx];
        if (offer?.itemId) {
          const def = getItemDefById(String(offer.itemId));
          const card = div("shopItemCard");
          card.style.cssText =
            `width:calc(${150} * var(--u)); aspect-ratio:3/4;` +
            `border-radius: 0;` +
            "border:calc(1 * var(--u)) solid rgba(255,255,255,.14);" +
            "background:rgba(0,0,0,.30);" +
            "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.25);" +
            "display:flex; flex-direction:column; align-items:center; justify-content:flex-start;" +
            `padding:calc(${10} * var(--u)); gap:calc(${8} * var(--u));` +
            "user-select:none;" +
            (offer.sold ? "opacity:.35; cursor:default;" : "cursor:pointer;");

          if (!offer.sold) card.onclick = () => actions.onChooseChoice(opt.key);

          if (def?.art) {
            const img = document.createElement("img");
            img.src = assetUrl(def.art);
            img.alt = def?.name ?? String(offer.itemId);
            (img.style as any).imageRendering = "pixelated";
            img.style.cssText =
              `width:calc(${84} * var(--u)); height:calc(${84} * var(--u));` +
              "object-fit:contain;" +
              "image-rendering: pixelated; image-rendering: crisp-edges;";
            card.appendChild(img);
          }

          const nm = divText("shopItemName", def?.name ?? String(offer.itemId));
          nm.style.cssText = `font-weight:900; font-size:calc(${13} * var(--u)); text-align:center;`;
          const pr = divText("shopItemPrice", offer.sold ? "품절" : `🪙${Number(offer.priceGold ?? 0) || 0}`);
          pr.style.cssText = `opacity:.85; font-size:calc(${12} * var(--u));`;
          card.appendChild(nm);
          card.appendChild(pr);

          left.appendChild(card);
        }
      }

      const right = div("choice-right");
      right.style.cssText = `flex:1 1 auto; min-width:calc(${260} * var(--u));`;

      const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
      b.classList.add("primary");
      b.style.fontSize = `calc(${14} * var(--u))`;
      b.style.padding = `calc(${10} * var(--u)) calc(${12} * var(--u))`;
      b.style.borderRadius = `calc(${10} * var(--u))`;
      right.appendChild(b);

      if ((opt as any).detail) right.appendChild(makeDetailPre((opt as any).detail));

      item.appendChild(left);
      item.appendChild(right);
      list.appendChild(item);
    });

    // 상점은 카드 프리뷰가 있어도 우측 일러스트 칸을 유지
    if (isShopChoice) {
      const contentRow = div("choice-contentRow");
      contentRow.style.cssText =
        "display:flex;" +
        `gap:calc(${GAP_ROW} * var(--u)); margin-top:calc(${12} * var(--u));` +
        "justify-content:center; align-items:stretch;";

      const leftCol = div("choice-leftCol");
      leftCol.style.cssText =
        `flex:1 1 calc(${560} * var(--u)); max-width:calc(${640} * var(--u)); min-width:0;` +
        "display:flex; flex-direction:column;";
      leftCol.appendChild(list);

      const illuCol = div("choice-illuCol");
      illuCol.style.cssText =
        `flex:0 0 calc(${ILLU_SIZE} * var(--u)); min-width:calc(${ILLU_MIN} * var(--u));` +
        "display:flex; align-items:center; justify-content:center;";

      const illuBox = div("choice-illuBox");
      illuBox.style.cssText =
        "width:100%; aspect-ratio:1/1;" +
        `border-radius:calc(${18} * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,1);` +
        "background:rgba(0,0,0,1);" +
        "position:relative; overflow:hidden;" +
        "box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,.35);";

      const art = (c as any).art as string | undefined;
      if (art) {
        const img = document.createElement("img");
        img.src = assetUrl(art);
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
    } else {
      panel.appendChild(list);
    }
  }

  padWrap.appendChild(panel);
  overlayEl.appendChild(backdrop);
  overlayEl.appendChild(padWrap);
  document.body.appendChild(overlayEl);
}






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
  blFill.style.background = "#2a7cff";
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
      gap: calc(14 * var(--u));
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

      // targeting highlight + 패시브 기반 대상 불가 표시
      let untargetable = false;
      if (targeting && e.hp > 0) {
        const req: any = (g as any).pendingTarget ?? null;
        const isDmgSelect = req?.kind === "damageSelect";
        if (isDmgSelect && e.id === "goblin_assassin") {
          const alive = g.enemies.filter((x) => (x as any).hp > 0);
          const rank = alive.indexOf(e) + 1; // ①=1
          if (rank === 2 || rank === 3) untargetable = true;
        }
      }

      if (targeting && e.hp > 0 && !untargetable) banner.classList.add("targetable");
      if (untargetable) banner.classList.add("untargetable");
      banner.onclick = () => actions.onSelectEnemy(i);

      const artWrap = div("enemyArtWrap");
      const artCard = div("enemyArtCard");


      artWrap.style.setProperty("--frameImg", `url("${assetUrl("assets/enemies/enemies_frame.png")}")`);
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

      // 패시브 HUD(아이콘)
      const passivesMini = (def as any).passives as any[] | undefined;
      if (passivesMini && passivesMini.length) {
        const prow = div("enemyPassiveRow");
        for (const p of passivesMini.slice(0, 4)) {
          const ic = divText("enemyPassiveIcon", String(p.icon ?? "Ⓟ"));
          prow.appendChild(ic);
        }
        mini.appendChild(prow);
      }


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

      const passiveLines: string[] = [];
      const passives = (def as any).passives as any[] | undefined;
      if (passives && passives.length) {
        for (const p of passives) {
          passiveLines.push(`${String(p.icon ?? "Ⓟ")} ${String(p.name ?? "패시브")}: ${String(p.text ?? "")}`);
        }
      }

      hover.textContent =
        (g.enemies[i].name) + "\n\n" +
        (passiveLines.length ? `패시브:\n${passiveLines.join("\n")}\n\n` : "") +
        (g.intentsRevealedThisTurn ? `${label}\n\n` : "") +
        (lines.length ? `상태: ${lines.join(", ")}` : "상태: 없음");

      banner.appendChild(artWrap);
      banner.appendChild(mini);
      banner.appendChild(hover);

      enemiesWrap.appendChild(banner);
    }
  }

  top.appendChild(left);

  return top;
}

// ✅ Portal: keep 룰북/로그/설정 buttons above choice overlays (same layer as '새로운 런')
function renderTopRightChrome(g: GameState, actions: UIActions) {
  // Remove old (in case of hot reload / re-render)
  document.querySelector('.topHudRightChrome')?.remove();

  const right = div('topHudRight');
  right.classList.add('topHudRightChrome');

  right.appendChild(mkButton('룰북', () => actions.onViewRulebook()));
  right.appendChild(mkButton('로그', () => actions.onToggleLogOverlay()));
  right.appendChild(mkButton('설정', () => actions.onViewSettings()));

  document.body.appendChild(right);
}

function buildResourceTopText(g: GameState): string {
  const bonusS = Number((g.run as any).nextBattleSuppliesBonus ?? 0) || 0;
  const gold = Number((g.run as any).gold ?? 0) || 0; // ✅ g.run.gold 제거

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
    "padding:calc(5 * var(--u)) calc(10 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(0,0,0,.55);" +
    "background: rgb(255, 0, 0);" +
    "opacity:1;" +
    "font-weight:400; font-size:calc(12 * var(--u)); line-height:1.2;" +
    "white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" +
    "width: min(calc(240 * var(--u)), 92vw);" +
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
  warn.style.top = "calc(100% - calc(8 * var(--u)))";
  warn.style.marginTop = "0";
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

  const tail = reasonLabel ? ` - ${reasonLabel}` : "";

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

  slotsWrap.style.paddingTop = `calc(${6} * var(--u))`;

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


    controls.appendChild(nextTurnBtn);

    document.body.appendChild(controls);

    const slot = document.querySelector<HTMLElement>(`.slot[data-slot-side="front"][data-slot-index="1"]`)
      ?? document.querySelector<HTMLElement>(".stageInner");
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

      if (e.shiftKey) return;
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      el.scrollLeft += dx;
      e.preventDefault();
    },
    { passive: false }
  );
}





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

  hud.style.top = "calc(8 * var(--u))";
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

  wrap.style.display = "flex";
  wrap.style.flexWrap = "nowrap";
  wrap.style.justifyContent = "center";
  wrap.style.alignItems = "stretch";
  (wrap.style as any).gap = `calc(${GAP} * var(--u))`;
  hud.style.width = "auto";
  hud.style.maxWidth = "calc(100vw - calc(16 * var(--u)))";
  (wrap.style as any).maxWidth = "100%";
  (wrap.style as any).overflowX = "auto";
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
    const dxvw = (deltaViewport / window.innerWidth) * 100;
    row.style.transform = `translateX(${dxvw.toFixed(4)}vw)`;
    hand.scrollLeft = 0;
    return;
  }

  let next = hand.scrollLeft - deltaViewport;

  const maxScroll = Math.max(0, rowW - viewW);
  if (next < 0) next = 0;
  if (next > maxScroll) next = maxScroll;

  hand.scrollLeft = Math.round(next);
  row.style.transform = "";
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

  // Hover(툴팁) 고정 버그 방지: 마우스 버튼을 떼면 강제로 닫기
  window.addEventListener("pointerup", (ev) => {
    if ((ev as any).pointerType !== "mouse") return;
    clearAllHover();
  }, { capture: true, passive: true });

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


    if (ev.code === "KeyP") {
      ev.preventDefault();
      actions.onNewRun();
      return;
    }


    if (ev.code === "Digit4") {
      ev.preventDefault();


      if (isTargeting(g)) {
        g.pendingTarget = null;
        g.pendingTargetQueue = [];
        (g as any).selectedEnemyIndex = null;
        logMsg(g, "대상 선택 취소");
        render(g, actions);
        return;
      }


      actions.onClearSelected();
      return;
    }


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


    if (ev.code === "Space") {
      ev.preventDefault();
      const g = getG();
      if (g.run.finished) return;
      if (g.choice) return;
      if (isTargeting(g)) return;

      actions.onAutoAdvance();
      return;
    }


    if (ev.code === "Digit1" || ev.code === "Digit2" || ev.code === "Digit3") {
      ev.preventDefault();
      const idx = ev.code === "Digit1" ? 0 : ev.code === "Digit2" ? 1 : 2;


      if (isTargeting(g)) {

        const e = g.enemies[idx];
        if (!e || e.hp <= 0) {
          logMsg(g, `대상 선택 실패: ${idx + 1}번 적이 없습니다.`);
          render(g, actions);
          return;
        }

        actions.onSelectEnemy(idx);
        return;
      }


      actions.onHotkeySlot("front", idx);
      return;
    }


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
  const leftVw = ((drag.x - (drag.grabDX ?? 20)) / window.innerWidth) * 100;
  const topVh  = ((drag.y - (drag.grabDY ?? 20)) / window.innerHeight) * 100;
  wrap.style.left = `${leftVw.toFixed(4)}vw`;
  wrap.style.top  = `${topVh.toFixed(4)}vh`;

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

