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
- F: 새로운 런

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


import { setDevConsoleCtx, renderDevConsole, toggleDevConsole, isDevConsoleOpen } from "./dev_console";
import { drawNineSlice } from "./nineslice";
import type { GameState, PileKind, NodeOffer, Side } from "../engine/types";
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

import type { EventOutcome } from "../content/events";
import { pickEventByMadness, getEventById } from "../content/events";
import { removeCardByUid, addCardToDeck, offerRewardsByFatigue, canUpgradeUid, upgradeCardByUid, obtainTreasure } from "../content/rewards";
import { getCardDefByIdWithUpgrade } from "../content/cards";

import { saveGame, hasSave, loadGame, clearSave } from "../persist";


function sleep(ms: number) {
  return new Promise<void>((res) => window.setTimeout(res, ms));
}
function tickMsForPhase(phase: GameState["phase"]) {
  switch (phase) {
    case "BACK":  return 400;
    case "FRONT": return 400;
    case "ENEMY": return 400;
    case "UPKEEP": return 400;
    case "DRAW":  return 400;
    case "PLACE": return 0;   // PLACE에서는 멈추는게 자연스러움
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

function schedulePostLayout(g: GameState) {
  if (postLayoutScheduled) return;
  postLayoutScheduled = true;
  requestAnimationFrame(() => {
    postLayoutScheduled = false;
    normalizeEnemyNameWidth();
    alignHandToBoardAnchor(g);
    alignEnemyHudToViewportCenter();
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

// 스케일


let uiScale = 1;

function loadUiScale() {
  try {
    const v = localStorage.getItem("deckrogue_uiScale");
    if (!v) return;
    const n = Number(v);
    if (Number.isFinite(n)) uiScale = Math.min(1.25, Math.max(0.75, n));
  } catch {}
}

function saveUiScale() {
  try {
    localStorage.setItem("deckrogue_uiScale", String(uiScale));
  } catch {}
}

function applyUiScaleToRoot() {
  document.documentElement.style.setProperty("--uiScale", String(uiScale));
}


type UiSettings = {
  uiScaleDesktop: number; // 0.8 ~ 1.4
  uiScaleMobile: number;  // 0.8 ~ 1.4
};

const UISET_KEY = "deckrogue_uiSettings_v1";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function loadUiSettings(): UiSettings {
  try {
    const raw = localStorage.getItem(UISET_KEY);
    if (!raw) return { uiScaleDesktop: 1.0, uiScaleMobile: 1.0 };
    const j = JSON.parse(raw);
    return {
      uiScaleDesktop: clamp(Number(j.uiScaleDesktop ?? 1.0) || 1.0, 0.75, 1.5),
      uiScaleMobile:  clamp(Number(j.uiScaleMobile  ?? 1.0) || 1.0, 0.75, 1.5),
    };
  } catch {
    return { uiScaleDesktop: 1.0, uiScaleMobile: 1.0 };
  }
}

function saveUiSettings(s: UiSettings) {
  try { localStorage.setItem(UISET_KEY, JSON.stringify(s)); } catch {}
}

let uiSettings: UiSettings = loadUiSettings();


//모바일

function isMobileUiNow() {
  return window.matchMedia("(max-width: 900px) and (pointer: coarse)").matches;
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

      // 1) 실행
      step.fn();
      render(g, actions);

      // 2) PLACE로 돌아오면(플레이어 배치 턴) 자동 진행 멈춤
      if (beforePhase === "DRAW" && g.phase === "PLACE") break;
      if (g.phase === "PLACE") break;

      // 3) 단계별 틱
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

  g.run ??= {};
  g.run.nextBossTime ??= 40;
  g.run.forcedNext ??= null;
  g.run.bossOmenText ??= null;
  g.run.enemyLastSeenBattle ??= {};
  g.run.nodePickByType ??= { BATTLE: 0, REST: 0, EVENT: 0, TREASURE: 0 };
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
    z-index: 5;           /* UI보다 낮거나 높게 조절 가능 */
    pointer-events: none; /* 클릭 방해 절대 안 함 */
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

type Overlay =
  | { kind: "RULEBOOK" }
  | { kind: "PILE"; pile: PileKind }
  | { kind: "SETTINGS" };

let overlay: Overlay | null = null;
let uiMounted = false;
let drag: DragState = null;
let hoverSlot: SlotDrop | null = null;
let showLogOverlay = false;

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


function nodeLabel(t: "BATTLE" | "REST" | "EVENT" | "TREASURE", isBoss: boolean) {
  if (t === "BATTLE") return isBoss ? "💀(보스)" : "⚔️(전투)";
  if (t === "REST") return "⛺(휴식)";
  if (t === "EVENT") return "❔(미지)";
  return "🌑(보물)";
}
function labelList(
  offers: Array<{ type: "BATTLE" | "REST" | "EVENT" | "TREASURE" }>,
  isBoss: boolean
) {
  if (isBoss) return "보스";
  return offers.map((o) => nodeLabel(o.type, false)).join(" / ");
}


function renderNodeSelect(root: HTMLElement, g: GameState, actions: UIActions) {
  const parts: string[] = [`[탐험 ${g.run.nodePickCount}회]`];

  if (g.run.treasureObtained) {
    const snap = g.run.deckSizeAtTreasure ?? currentTotalDeckLikeSize(g);
    const req = escapeRequiredNodePicks(snap);
    parts.push(`[탈출까지 ${g.run.afterTreasureNodePicks}/${req}]`);
  }

  root.appendChild(p(parts.join(" ")));

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
    root.appendChild(warn);
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
  root.appendChild(omen);

  const br = g.run.branchOffer;
  if (br) {
    const preview = div("nodePreviewBox");
    preview.style.cssText =
      "margin-top:10px; padding:12px; border:1px solid rgba(255,255,255,1); border-radius:16px; background:rgba(0,0,0,1);";

    const forcedBoss = runAny.forcedNext === "BOSS";

    const makeRow = (side: "A" | "B") => {
      const row = div("nodePreviewRow");
      row.style.cssText =
        "display:flex; gap:10px; align-items:center; padding:10px; border-radius:14px; cursor:pointer;";
      row.onmouseenter = () => (row.style.background = "rgba(255,255,255,.06)");
      row.onmouseleave = () => (row.style.background = "transparent");
      row.onclick = () => actions.onChooseNode(side);

      const idx = side === "A" ? 0 : 1;
      const nowLabel = forcedBoss ? "💀(보스)" : nodeLabel(offers[idx]?.type ?? "BATTLE", false);

      const pill = document.createElement("div");
      pill.className = "nodePill primary";
      pill.textContent = nowLabel;
      pill.onclick = (e) => {
        e.stopPropagation();
        actions.onChooseNode(side);
      };
      row.appendChild(pill);

      row.appendChild(divText("", "→"));

      const nextList = side === "A" ? br.nextIfA : br.nextIfB;
      const nextText = divText("", labelList(nextList, false));
      nextText.style.cssText = "opacity:.85;";
      row.appendChild(nextText);

      return row;
    };

    preview.appendChild(makeRow("A"));
    preview.appendChild(makeRow("B"));

    root.appendChild(preview);
    root.appendChild(hr());
  }
}





function hr() {
  return document.createElement("hr");
}


// Choice types

type ChoiceKind = "EVENT" | "REWARD" | "PICK_CARD" | "VIEW_PILE" | "UPGRADE_PICK";





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
      popChoice(g); // 내부에서 g.choice/handler 복구
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

      return g.run.branchOffer.root;
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

      const willHitBoss = !forcedBossNow && afterT >= runAny.nextBossTime;

      const actual =
        forcedBossNow
          ? ("BATTLE" as const)
          : willHitBoss
          ? ("REST" as const)
          : (basePicked as typeof basePicked);
      const battleTime = actual === "BATTLE" ? 1 : 0;
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
        render(g, actions);
        return;
      }

      if (!forcedBossNow && afterT2 >= runAny.nextBossTime) {
        runAny.forcedNext = "BOSS";
        logMsg(g, `시간이 흘러 보스가 다가옵니다!`);
      }

      if (actual === "BATTLE") {
        spawnEncounter(g, { forceBoss: false });
        startCombat(g);
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
                // 고광기 전용 카드 확률적으로 지급
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
                spawnEncounter(g);
                startCombat(g);
                render(g, actions);
                return;
              }


              if (then === "REWARD_PICK") {
                clearChoiceStack(g);
                openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
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
            spawnEncounter(g, { forcePatternIds: outcome.enemyIds });
            startCombat(g);
            render(g, actions);
            return;
          }

          if (outcome === "BATTLE") {
            clearChoiceStack(g);
            spawnEncounter(g);
            startCombat(g);
            render(g, actions);
            return;
          }

          if (outcome === "REWARD") {
            clearChoiceStack(g);
            openRewardPick(g, actions, "카드 보상", "두 장 중 한 장을 선택하거나 생략합니다.");
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

      if (choiceHandler) {
        choiceHandler(key);
        const g2 = getG();
        const justEnteredCombat = g2.enemies.length > 0 && g2.phase === "PLACE";
        if (!justEnteredCombat) actions.onAutoAdvance();

        return;
      }

      const kind = g.choice.kind;

      if (kind === "REWARD" || kind === ("REWARD_PICK" as any)) {
        if (key === "skip") {
          logMsg(g, "카드 보상 생략");
          closeChoiceOrPop(g);
          if (!g.run.finished && g.enemies.length === 0) g.phase = "NODE";
          render(g, actions);
          return;
        }

        if (key.startsWith("pick:")) {
          const payload = key.slice("pick:".length);
          const [defId, upStr] = payload.split(":");
          const upgrade = Number(upStr ?? "0") || 0;

          addCardToDeck(g, defId, { upgrade });
          logMsg(g, `카드 획득: ${cardDisplayNameByDefId(g, defId, upgrade)}`);

          closeChoiceOrPop(g);

          if (!g.run.finished && g.enemies.length === 0) g.phase = "NODE";
          render(g, actions);
          return;
        }
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

  // 한 번 폭 제한 풀고 실제 필요한 폭(스크롤폭)을 측정
  names.forEach((el) => {
    el.style.display = "inline-block";
    el.style.width = "auto";
    el.style.whiteSpace = "nowrap";
  });

  let maxW = 0;
  for (const el of names) maxW = Math.max(maxW, el.scrollWidth);

  // 너무 길어질 때 UI 깨지는 것 방지(원하는 값으로 조절)
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
    "z-index: 100000;"; 

  // 1) 현재 살아있는 fx id 집합
  const alive = new Set(floatFx.map((f) => String(f.id)));

  // 2) DOM에 있는데, 더 이상 alive가 아니면 제거
  for (const child of Array.from(layer.children) as HTMLElement[]) {
    const id = child.dataset.fxId;
    if (!id) continue;
    if (!alive.has(id)) child.remove();
  }

  // 3) 없는 fx만 새로 생성(있으면 그대로 둠 → 애니메이션 재시작 방지)
  for (const f of floatFx) {
    const id = String(f.id);
    let el = layer.querySelector<HTMLElement>(`.floatNum[data-fx-id="${id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = `floatNum ${f.kind}`;
      el.dataset.fxId = id;
      el.textContent = f.text;
      el.style.left = `${Math.round(f.x)}px`;
      el.style.top = `${Math.round(f.y)}px`;
      layer.appendChild(el);
    } else {
      // 위치가 조금 달라질 수 있으면 업데이트(원치 않으면 이 블록 제거)
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
    z-index: 99999;
    pointer-events: auto;

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

  // 클릭이 항상 최신 actions를 타도록 “저장소”를 거쳐 호출
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    floatingNewRunHandler?.();
  });

  document.body.appendChild(btn);
}

export function render(g: GameState, actions: UIActions) {

  if (!(render as any)._uiScaleInitDone) {
    (render as any)._uiScaleInitDone = true;
    loadUiScale();
    applyUiScaleToRoot();
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

  renderOverlayLayer(g, actions);
  renderChoiceLayer(g, actions);
  renderLogOverlay(g, actions);
  detectAndEmitDeltas(g);
  renderPhaseBanner();
  renderFloatFxLayer();
  scheduleSave(g);
  schedulePostLayout(g);
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




function renderLogOverlay(g: GameState, actions: UIActions) {

  
  document.querySelector(".logOverlay")?.remove();

  if (!showLogOverlay) return;

  const layer = div("logOverlay");
  layer.style.cssText = `
    position: fixed; inset: 0;
    pointer-events:auto;
    z-index: 100000;
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
  wrap.style.cssText =
    "display:flex; flex-direction:column; gap:12px;";

  const row = div("settingsRow");
  row.style.cssText =
    "display:flex; align-items:center; gap:12px; flex-wrap:wrap;";

  const label = divText("", "UI 스케일");
  label.style.cssText = "font-weight:800;";

  const val = divText("", `${Math.round(uiScale * 100)}%`);
  val.style.cssText = "opacity:.9; min-width:64px; text-align:right;";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0.75";
  slider.max = "1.25";
  slider.step = "0.01";
  slider.value = String(uiScale);
  slider.style.cssText = "flex:1 1 260px;";

  slider.oninput = () => {
    uiScale = Number(slider.value);
    val.textContent = `${Math.round(uiScale * 100)}%`;
    onChange();
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(val);
  wrap.appendChild(row);

  // 프리셋 버튼들
  const presets = div("settingsPresets");
  presets.style.cssText = "display:flex; gap:8px; flex-wrap:wrap;";

  const makePreset = (txt: string, v: number) => {
    const b = mkButton(txt, () => {
      uiScale = v;
      slider.value = String(v);
      val.textContent = `${Math.round(uiScale * 100)}%`;
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
    uiScale = 1.0;
    slider.value = "1";
    val.textContent = "100%";
    onChange();
  });
  reset.style.cssText =
    "padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.16);" +
    "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
  resetRow.appendChild(reset);
  wrap.appendChild(resetRow);

  return wrap;
}

function positionPlayerHudByStage() {
  const hud = document.querySelector<HTMLElement>(".playerHudLeft");
  const stage = document.querySelector<HTMLElement>(".stageInner");
  if (!hud || !stage) return;

  const r = stage.getBoundingClientRect();


  const uiScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--uiScale")) || 1;

  const gap = 18 * uiScale;
  const hudW = 360 * uiScale;

  const x = Math.round(r.left - gap - hudW);
  const y = Math.round(r.top + r.height * 0.18);

  hud.style.left = `${x}px`;
  hud.style.top  = `${y}px`;
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


function renderOverlayLayer(
  g: GameState,
  actions: UIActions & { onCloseOverlay: () => void }
) {
  document.querySelector(".overlay-layer")?.remove();

  if (!overlay) return;

  const isFull = overlay.kind === "SETTINGS";

  const layer = div("overlay-layer");
  layer.style.cssText = isFull
    ? "position:fixed; inset:0; z-index:30000;" +
      "background:rgba(0,0,0,1);" +          // 불투명
      "display:flex; justify-content:center; align-items:flex-start;" +
      "padding:24px; box-sizing:border-box;"
    : "position:fixed; inset:0; z-index:30000;" +
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
      // 값 바뀌면 즉시 반영
      applyUiScaleToRoot();
      saveUiScale();
      // 레이아웃 재정렬이 필요하면
      if (currentG) {
        normalizeEnemyNameWidth();
        alignHandToBoardAnchor(currentG);
        alignEnemyHudToViewportCenter();
      }
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

function renderChoiceLayer(g: GameState, actions: UIActions) {
  // 기존 choice 제거
  document.querySelector(".choice-overlay")?.remove();

  const c = g.choice;
  if (!c) {
    document.querySelector(".mainPanel")?.classList.remove("choiceOpen");
    return;
  }

  const main = document.querySelector<HTMLElement>(".mainPanel");
  if (!main) return;

  main.classList.add("choiceOpen");

  const overlayEl = div("choice-overlay");
  overlayEl.style.cssText =
    "position:fixed; inset:0; z-index:22000;" +
    "background: transparent; display:flex; justify-content:center; align-items:flex-start; padding:180px 36px 12px 12px; box-sizing:border-box;"+
    "pointer-events:auto;";
  overlayEl.style.setProperty("pointer-events", "auto", "important");
  


  const panel = div("choice-panel");
  panel.style.cssText =
    "width:min(750px, 88vw); max-height:70vh;" +
    "overflow:auto; overflow-x:hidden; padding:16px;" +
    "border:1px solid rgba(255,255,255,.14); border-radius:16px;" +
    "background:rgba(0,0,0,1);"+
    "pointer-events:auto;";
  panel.style.setProperty("pointer-events", "auto", "important");

  panel.onclick = (e) => e.stopPropagation();

  panel.appendChild(h2(c.title));
  if (c.prompt) panel.appendChild(p(c.prompt));

  const fixPreviewSize = (cardEl: HTMLElement) => {
    cardEl.style.width = "var(--handCardW)";
    cardEl.style.height = "var(--handCardH)";
    cardEl.style.boxSizing = "border-box";
  };

  // 카드 프리뷰가 포함된 선택(리워드/강화 등) vs 텍스트 선택(이벤트/휴식)
  const hasCardPreview = c.options.some((opt) => {
    if ((opt as any).cardUid) return true;
    return typeof opt.key === "string" && opt.key.startsWith("pick:");
  });

  if (!hasCardPreview) {

    // EVENT / REST: 왼쪽(선택지) + 오른쪽(일러스트)

    const contentRow = div("choice-contentRow");
    contentRow.style.cssText =
      "display:flex; gap:18px; margin-top:12px;" +
      "justify-content:center; align-items:stretch;";

    const leftCol = div("choice-leftCol");
    leftCol.style.cssText = "flex:1 1 640px; max-width:720px; min-width:0;";

    const illuCol = div("choice-illuCol");
    illuCol.style.cssText =
      "flex:0 0 var(--choiceIlluSize, 260px); min-width:200px;" +
      "display:flex; align-items:center; justify-content:center;";

    const illuBox = div("choice-illuBox");
    illuBox.style.cssText =
      "width:100%; aspect-ratio:1/1;" +
      "border-radius:18px; border:1px solid rgba(255,255,255,.16);" +
      "background:rgba(0,0,0,.35);";

    const art = (c as any).art as string | undefined;
    if (art) {
      const img = document.createElement("img");
      img.src = art;
      img.alt = c.title ?? "illustration";

      // 줌 비율
      const ZOOM = 1.5;

      // illuBox가 잘라내도록
      illuBox.style.overflow = "hidden";
      // (중요) 브라우저가 이미지 확대 시 필터링 안 하게
      (img.style as any).imageRendering = "pixelated";

      img.style.cssText =
        "position:absolute; inset:0;" +
        "width:" + (ZOOM * 100) + "%;" +
        "height:" + (ZOOM * 100) + "%;" +
        "left:" + (-(ZOOM - 1) * 50) + "%;" +
        "top:" + (-(ZOOM - 1) * 50) + "%;" +
        "object-fit:cover;" +
        "object-position:50% 50%;" +
        "image-rendering: pixelated; image-rendering: crisp-edges;" +
        "border-radius:18px;";

      // illuBox가 absolute 자식 기준이 되도록
      illuBox.style.position = "relative";

      illuBox.appendChild(img);
    }

    illuCol.appendChild(illuBox);

    const list = div("choice-list");
    list.style.cssText = "display:flex; flex-direction:column; gap:10px;";

    c.options.forEach((opt) => {
      const item = div("choice-item");
      item.style.cssText =
        "display:flex; gap:12px; align-items:flex-start;" +
        "border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:12px;" +
        "background:rgba(255,255,255,.03);" +
        "position:relative;";

        
      const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
      b.classList.add("choiceOptBtn");
      item.appendChild(b);

      if ((opt as any).detail) {
        const pre = document.createElement("pre");
        pre.className = "choice-detail";
        pre.textContent = String((opt as any).detail);
        pre.style.cssText =
          "margin:10px 0 0 0; padding:10px; white-space:pre-wrap;" +
          "border-radius:12px; border:1px solid rgba(255,255,255,.10);" +
          "background:rgba(0,0,0,.22); font-size:12px; line-height:1.45;" +
          "max-height:220px; overflow:auto;" +
          "font-family: Mulmaru, ui-sans-serif, system-ui;";
        item.appendChild(pre);
      }

      list.appendChild(item);
    });

    leftCol.appendChild(list);
    contentRow.appendChild(leftCol);
    contentRow.appendChild(illuCol);
    panel.appendChild(contentRow);
  } else {

    // 카드 프리뷰가 있는 선택(리워드/강화/카드픽 등)

    const list = div("choice-list");
    list.style.cssText = "display:flex; flex-direction:column; gap:10px; margin-top:12px;";

    c.options.forEach((opt) => {
      const item = div("choice-item");
      item.style.cssText =
        "display:flex; gap:12px; align-items:flex-start;" +
        "border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:12px;" +
        "background:rgba(255,255,255,.03);";

      const left = div("choice-left");
      left.style.cssText = "flex:0 0 auto;";

      const uid = (opt as any).cardUid as string | undefined;
      if (uid) {

        const isUpgradePick = g.choice?.kind === ("UPGRADE_PICK" as any);
        const c = g.cards[uid];

        // 다음 강화 단계(현재 + 1)
        const nextUp = (c.upgrade ?? 0) + 1;


        let el: HTMLElement;
        try {
          if (isUpgradePick) {
            el = renderCardPreviewByUidWithUpgrade(g, uid, nextUp);
            el.classList.add("upgradePreview"); // (선택) 스타일링용
          } else {
            el = renderRealCardForOverlay(g, uid) as HTMLElement;
          }
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
      right.style.cssText = "flex:1 1 auto; min-width:260px;";

      const b = button(opt.label, () => actions.onChooseChoice(opt.key), false);
      b.classList.add("primary");
      right.appendChild(b);

      if ((opt as any).detail) {
        const pre = document.createElement("pre");
        pre.className = "choice-detail";
        pre.textContent = String((opt as any).detail);
        pre.style.cssText =
          "margin:10px 0 0 0; padding:10px; white-space:pre-wrap;" +
          "border-radius:12px; border:1px solid rgba(255,255,255,.10);" +
          "background:rgba(0,0,0,.22); font-size:12px; line-height:1.45;" +
          "max-height:220px; overflow:auto;";
        right.appendChild(pre);
      }

      item.appendChild(left);
      item.appendChild(right);
      list.appendChild(item);
    });

    panel.appendChild(list);
  }

  overlayEl.appendChild(panel);
  document.body.appendChild(overlayEl);
}


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
      const banner = div("enemyBanner");
      banner.style.cssText = `
        flex: 0 0 var(--enemyBannerW, 520px);
        width: var(--enemyBannerW, 520px);
        max-width: min(var(--enemyBannerW, 520px), 92vw);
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(0,0,0,.78);
        padding: 12px 14px;
        box-sizing: border-box;
      `;
      if (targeting && e.hp > 0) banner.classList.add("targetable");

      const topRow = div("enemyChipTop");
      topRow.appendChild(divText("", `${i + 1}. ${e.name}`));
      topRow.appendChild(divText("", `${e.hp}/${e.maxHp}`));
      banner.appendChild(topRow);

      const outer = div("enemyHPOuter");
      const fill = div("enemyHPFill");
      fill.style.width = `${Math.max(0, Math.min(100, (e.hp / Math.max(1, e.maxHp)) * 100))}%`;
      outer.appendChild(fill);
      banner.appendChild(outer);

      const def = g.content.enemiesById[e.id];
      const intent = def.intents[e.intentIndex % def.intents.length];
      const label = e.intentLabelOverride ?? intent.label;
      banner.appendChild(divText("enemyIntent", g.intentsRevealedThisTurn ? `${label}` : ""));

      const st = e.status;
      const badges = div("enemyBadges");
      banner.appendChild(badges);

      function badgeWithDelta(text: string): HTMLElement {
        const el = document.createElement("span");
        el.className = "badge";

        const m = text.match(/\s*\[\[d:([+-]?\d+)\]\]\s*$/);
        if (!m) {
          el.textContent = text;
          return el;
        }

        const deltaStr = m[1];
        const baseText = text.replace(/\s*\[\[d:[+-]?\d+\]\]\s*$/, "");

        if (baseText.trim().length > 0) el.appendChild(document.createTextNode(baseText + " "));

        const d = document.createElement("span");
        const deltaNum = Number(deltaStr);
        d.className = `deltaInline ${deltaNum > 0 ? "plus" : "minus"}`;
        d.textContent = `(${deltaNum > 0 ? "+" : ""}${deltaNum} / 단타)`;
        el.appendChild(d);
        return el;
      }

      const playerVuln = g.player.status?.vuln ?? 0;
      const enemyWeak = e.status?.weak ?? 0;
      const deltaPerHit = playerVuln - enemyWeak;

      function formatDeltaShort(delta: number) {
        if (delta === 0) return "";
        return delta > 0 ? `+${delta}` : `${delta}`;
      }

      const eBadgeList: string[] = [];

      if ((st.vuln ?? 0) > 0) eBadgeList.push(`취약 ${st.vuln}`);

      if ((st.weak ?? 0) > 0) {
        if (playerVuln !== 0 || enemyWeak !== 0) {
          const d = formatDeltaShort(deltaPerHit);
          if (d) eBadgeList.push(`약화 ${st.weak} [[d:${d}]]`);
          else eBadgeList.push(`약화 ${st.weak}`);
        } else {
          eBadgeList.push(`약화 ${st.weak}`);
        }
      } else {
        if (playerVuln !== 0 || enemyWeak !== 0) {
          const d = formatDeltaShort(deltaPerHit);
          if (d) eBadgeList.push(`[[d:${d}]]`);
        }
      }

      if ((st.bleed ?? 0) > 0) eBadgeList.push(`출혈 ${st.bleed}`);
      if ((st.disrupt ?? 0) > 0) eBadgeList.push(`교란 ${st.disrupt}`);
      if (e.immuneThisTurn) eBadgeList.push("면역");

      for (const t of eBadgeList) badges.appendChild(badgeWithDelta(t));

      banner.onclick = () => actions.onSelectEnemy(i);
      enemiesWrap.appendChild(banner);
    }
  }

  top.appendChild(left);

  const right = div("topHudRight");

  right.appendChild(mkButton("룰북", () => actions.onViewRulebook()));
  right.appendChild(mkButton("로그", () => actions.onToggleLogOverlay()));
  right.appendChild(mkButton("⚙️", () => {
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
    parts.push(`🧰 S ${g.player.supplies} |`);
  } else {
    if (bonusS > 0) parts.push(`보너스 🧰 S +${bonusS} |`);
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
    "opacity:.82;" +
    "font-weight:400; font-size:12px; line-height:1.2;" +
    "white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" +
    "width: min(400px, 92vw);" +
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

  return `${head}${tail}${idxInfo}: 위의 적 박스를 클릭하세요.`;
}

function renderCombat(root: HTMLElement, g: GameState, actions: UIActions) {
  const wrap = div("combatRoot");
  const board = div("boardArea");

  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  board.classList.toggle("slabOn", inCombat);

  board.appendChild(renderSlotsGrid(g, actions, "front"));
  board.appendChild(renderSlotsGrid(g, actions, "back"));

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

  // 공통: hud 자체를 화면 중앙에 박기
  hud.style.position = "fixed";
  hud.style.top = "8px";
  hud.style.left = "50%";
  hud.style.right = "auto";
  hud.style.transform = "translateX(-50%)";
  hud.style.overflow = "visible";

  // 내부는 transform으로 흔들지 않게
  mover.style.transform = "";
  mover.style.overflow = "visible";

  const banners = Array.from(hud.querySelectorAll<HTMLElement>(".enemyBanner"));
  const n = banners.length;
  if (n === 0) {
    hud.style.width = "";
    return;
  }

  const maxOne = Math.min(520, Math.floor(window.innerWidth * 0.92));
  const GAP = 14; // desktop에서 쓰던 gap 값

  const W1 = maxOne;
  const W2 = Math.min(window.innerWidth - 16, W1 * 2 + GAP);
  const W3 = Math.min(window.innerWidth - 16, W1 * 3 + GAP * 2);

  // wrap은 항상 가운데로
  wrap.style.display = "flex";
  wrap.style.flexWrap = "nowrap";
  wrap.style.justifyContent = "center";
  wrap.style.alignItems = "stretch";
  (wrap.style as any).gap = `${GAP}px`;

  if (n === 1) {
    hud.style.width = `${W1}px`;
    mover.style.width = "100%";
  } else if (n === 2) {
    hud.style.width = `${W2}px`;
    mover.style.width = "100%";
  } else {
    // 3 이상이면 어차피 최대 3이라 했으니 3으로 클램프
    hud.style.width = `${W3}px`;
    mover.style.width = "100%";
  }
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
      const cardEl = renderCard(g, uid, false) as HTMLElement;
      cardEl.classList.add("inSlot");
      s.appendChild(cardEl);

      cardEl.onpointerdown = (ev) => {
        if ((ev as any).button !== 0 && (ev as any).pointerType === "mouse") return;
        if (isTargeting(g)) return;
        if (g.phase !== "PLACE") return;
        beginDrag(ev as any, { kind: "slot", cardUid: uid, fromSide: side, fromIdx: i });
      };

      cardEl.ondblclick = () => actions.onReturnSlotToHand(side, i);
    }

    s.onclick = () => {
      if (disabled) return;
      if (isTargeting(g)) return;
      if (g.phase !== "PLACE") return;

      const uidHere = slots[i];

      if (!g.selectedHandCardUid && uidHere) {
        actions.onReturnSlotToHand(side, i);
        return;
      }

      actions.onPlaceSelected(side, i);
    };

    grid.appendChild(s);
  }
  return grid;
}


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
    if (!drag.dragging && dx * dx + dy * dy > 36) drag.dragging = true;

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

    // 새로운 런: F
    if (ev.code === "KeyF") {
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


// Cards


function renderCard(
  g: GameState,
  cardUid: string,
  clickable: boolean,
  onClick?: (uid: string) => void,
  opt?: { draggable?: boolean }
) {
  const c = g.cards[cardUid];
  const def = getCardDefByIdWithUpgrade(g.content, c.defId, c.upgrade ?? 0);

  const draggable = opt?.draggable ?? true;

  const d = div("card");
  if (g.selectedHandCardUid === cardUid) d.classList.add("selected");
  if (def.tags?.includes("EXHAUST")) d.classList.add("exhaust");
  if (def.tags?.includes("VANISH")) d.classList.add("vanish");

  // HEADER
  const header = div("cardHeader");
  const title = displayNameForUid(g, cardUid);
  header.appendChild(divText("cardTitle", title));

  const meta = div("cardMeta");
  if (def.tags?.includes("EXHAUST")) meta.appendChild(badge("소모"));
  if (def.tags?.includes("VANISH")) meta.appendChild(badge("소실"));
  header.appendChild(meta);

  d.appendChild(header);

  // BODY (남은 공간 50:50)
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

  // 이하 클릭/드래그 로직은 기존 그대로 유지
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

  return d;
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
function small(text: string) {
  const e = document.createElement("small");
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
  "S": "🧰",
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
