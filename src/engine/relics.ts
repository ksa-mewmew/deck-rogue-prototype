// engine/relics.ts
import type { GameState, Side, StatusKey } from "./types";
import { RELICS_BY_ID, EVENT_RELIC_POOL } from "../content/relicsContent";
import { logMsg } from "./rules";

export function hasRelic(g: GameState, id: string) {
  const rs = g.run as any;
  const relics: string[] = rs?.relics ?? [];
  return relics.includes(id);
}

export function gainRelic(g: GameState, id: string) {
  const rs = g.run as any;
  rs.relics ??= [];
  if (!rs.relics.includes(id)) rs.relics.push(id);
}

export const EVENT_RELIC_IDS = new Set<string>(EVENT_RELIC_POOL.map((r) => r.id));

export function isEventRelicId(id: string) {
  return EVENT_RELIC_IDS.has(id);
}

export function rollEventRelicId(g: GameState): string | null {
  const owned = new Set<string>(((g.run as any)?.relics ?? []) as string[]);
  const candidates = EVENT_RELIC_POOL.map((r) => r.id).filter((id) => !owned.has(id));
  if (candidates.length === 0) return null;
  return candidates[(Math.random() * candidates.length) | 0];
}

export function rollNormalRelicId(g: GameState): string | null {
  const owned = new Set<string>((g.run as any)?.relics ?? []);
  const candidates = Object.keys(RELICS_BY_ID)
    .filter(id => !owned.has(id))
    .filter(id => !isEventRelicId(id));

  if (!candidates.length) return null;
  return candidates[(Math.random() * candidates.length) | 0];
}

/* ---------------- Hook(런렐릭훅) 타입 ---------------- */

export type RelicPlaceCardCtx = { side: Side; idx: number; cardUid: string };

export type RelicHookMap = {
  onCombatStart: [];
  onReveal: [];
  onVictory: [];
  onPlaceCard: [RelicPlaceCardCtx];
  onUpkeepEnd: [];
};

export type RelicHookName = keyof RelicHookMap;

/* ---------------- Damage 타입 ---------------- */

export type DamageTarget = "PLAYER" | "ENEMY";
export type DamageSource = "PLAYER_ATTACK" | "ENEMY_ATTACK" | "FATIGUE" | "OTHER";
export type DamagePhase = "PRE_STATUS" | "POST_STATUS" | "PRE_BLOCK" | "POST_BLOCK" | "FINAL";

export type DamageContext = {
  target: DamageTarget;
  source: DamageSource;
  phase: DamagePhase;

  raw: number;
  current: number;

  reason?: string;
  enemyIndex?: number;
  enemyId?: string;

  attackerWeak?: number;
  targetVuln?: number;

  afterStatus?: number;
  afterBlock?: number;

  applied?: number;
};



export type RelicHooks = Partial<{
  [K in RelicHookName]: (g: GameState, ...args: RelicHookMap[K]) => void;
}>;

export type RelicTag = "EVENT_ONLY" | "ELITE_ONLY" | "COMMON";

export type RelicDef = {
  id: string;
  name: string;
  text?: string;

  art?: string;

  dormantName?: string;
  dormantText?: string;
  unlockHint?: string;

  unlockFlavor?: string | ((g: GameState) => string);
  tags?: RelicTag[];

  unlock?: (g: GameState) => boolean;
  onActivate?: (g: GameState) => void;

  modifyDamage?: (g: GameState, ctx: DamageContext) => number;
  onDamageApplied?: (g: GameState, ctx: DamageContext, applied: number) => void;
} & RelicHooks;

/* ---------------- 런타임 상태 ---------------- */

export type RelicRuntimeState = {
  active: boolean;
  pending: boolean;
  obtainedAtNode?: number;
  activatedAtNode?: number;
};

type UnlockProgress = {
  rest: number;
  eliteWins: number;
  tookBigHit10: boolean;
  kills: number;
  endedTurnWeak: boolean;
  eventPicks: number;
  hpLeq15: boolean;
  skippedTurn: boolean;
  bleedApplied: number;
};

const DEFAULT_UNLOCK: UnlockProgress = {
  rest: 0,
  eliteWins: 0,
  tookBigHit10: false,
  kills: 0,
  endedTurnWeak: false,
  eventPicks: 0,
  hpLeq15: false,
  skippedTurn: false,
  bleedApplied: 0,
};

function ensureRelicSystem(g: GameState) {
  g.run.relics ??= [];

  const runAny = g.run as any;
  runAny.relicRuntime ??= {};
  runAny.pendingRelicActivations ??= [];
  runAny.unlock ??= { ...DEFAULT_UNLOCK };
  runAny.relicUnlocked ??= {};
}

function runtimeMap(g: GameState): Record<string, RelicRuntimeState> {
  ensureRelicSystem(g);
  return (g.run as any).relicRuntime as Record<string, RelicRuntimeState>;
}

function pendingQueue(g: GameState): string[] {
  ensureRelicSystem(g);
  return (g.run as any).pendingRelicActivations as string[];
}

export function getUnlockProgress(g: GameState): UnlockProgress {
  ensureRelicSystem(g);
  return (g.run as any).unlock as UnlockProgress;
}

function ensureRuntimeEntry(g: GameState, id: string): RelicRuntimeState {
  const map = runtimeMap(g);
  if (map[id]) return map[id];

  const def = RELICS_BY_ID[id] as RelicDef | undefined;
  const startsActive = !def?.unlock;

  map[id] = {
    active: startsActive,
    pending: false,
    obtainedAtNode: g.run.nodePickCount,
  };

  return map[id];
}

export function isRelicActive(g: GameState, id: string): boolean {
  return !!ensureRuntimeEntry(g, id).active;
}

export function isRelicPending(g: GameState, id: string): boolean {
  return !!ensureRuntimeEntry(g, id).pending;
}

/* ---------------- 표시(UI용) ---------------- */

function isRelicUnlocked(g: GameState, id: string): boolean {
  const runAny = g.run as any;

  if (runAny.forceLockedRelics?.[id] === true) return false;
  if (runAny.forceUnlockedRelics?.[id] === true) return true;

  if (runAny.relicUnlocked?.[id] === true) return true;
  if (Array.isArray(runAny.unlockedRelics) && runAny.unlockedRelics.includes(id)) return true;

  if (runAny.unlockProgress?.relics?.[id] === true) return true;
  if (runAny.unlocks?.relics?.[id] === true) return true;

  return false;
}

export function getRelicDisplay(g: GameState, id: string) {
  ensureRelicSystem(g);

  const def = RELICS_BY_ID[id] as RelicDef | undefined;

  const baseName = def?.name ?? id;
  const baseText = def?.text ?? "";
  const art = def?.art;

  const runAny = g.run as any;
  const st = (runAny.relicRuntime?.[id] ?? null) as
    | { active: boolean; pending: boolean }
    | null;

  const hasUnlock = !!def?.unlock;
  const unlocked = isRelicUnlocked(g, id);

  const state =
    st?.active === true ? ("ACTIVE" as const) :
    st?.pending === true ? ("PENDING" as const) :
    ("DORMANT" as const);

  const flavorText = (() => {
    const f = def?.unlockFlavor;
    if (!f) return "";
    if (hasUnlock && !unlocked) return "";
    const s = typeof f === "function" ? f(g) : f;
    return s ? `\n\n${s}` : "";
  })();

  if (state === "ACTIVE") {
    return { id, state, name: baseName, text: `${baseText}${flavorText}`, art };
  }

  if (state === "PENDING") {
    if (hasUnlock && !unlocked) {
      return { id, state, name: baseName, text: `${baseText}\n\n(다음 노드부터 활성)`, art };
    }
    return { id, state, name: baseName, text: `${baseText}${flavorText}`, art };
  }

  if (hasUnlock && !unlocked) {
    const dn = def?.dormantName ?? baseName;
    const parts: string[] = [];
    if (def?.dormantText) parts.push(def.dormantText);
    if (def?.unlockHint) parts.push(def.unlockHint);
    const dt = parts.length ? parts.join("\n") : baseText;
    return { id, state, name: dn, text: dt, art };
  }

  return { id, state, name: baseName, text: `${baseText}${flavorText}`, art };
}

/* ---------------- 획득/해금/활성화 ---------------- */

export type RelicGrantSource = "NORMAL" | "EVENT";

export function grantRelic(g: GameState, id: string, source: RelicGrantSource = "NORMAL") {
  ensureRelicSystem(g);

  if (isEventRelicId(id) && source !== "EVENT") {
    const def0 = RELICS_BY_ID[id] as RelicDef | undefined;
    logMsg(g, `이 유물은 이벤트로만 획득할 수 있습니다: ${def0?.name ?? id}`);
    return;
  }

  if (!g.run.relics.includes(id as any)) g.run.relics.push(id as any);

  const def = RELICS_BY_ID[id] as RelicDef | undefined;
  const st = ensureRuntimeEntry(g, id);

  if (!def?.unlock) {
    st.active = true;
    st.pending = false;
    (g.run as any).relicUnlocked[id] = true;
    logMsg(g, `유물 획득: ${def?.name ?? id}`);
    return;
  }

  st.active = false;

  const disp = getRelicDisplay(g, id);
  logMsg(g, `유물 획득: ${disp.name}`);

  checkRelicUnlocks(g);
}

function queuePendingActivation(g: GameState, id: string) {
  const st = ensureRuntimeEntry(g, id);
  if (st.active || st.pending) return;

  st.pending = true;
  const q = pendingQueue(g);
  if (!q.includes(id)) q.push(id);

  const def = RELICS_BY_ID[id] as RelicDef | undefined;
  logMsg(g, `유물 조건 달성: ${def?.name ?? id} (다음 노드부터 활성)`);
}

export function checkRelicUnlocks(g: GameState) {
  ensureRelicSystem(g);

  for (const id of g.run.relics as any as string[]) {
    const def = RELICS_BY_ID[id] as RelicDef | undefined;
    if (!def?.unlock) continue;

    const st = ensureRuntimeEntry(g, id);
    if (st.active || st.pending) continue;

    if (def.unlock(g)) queuePendingActivation(g, id);
  }
}

export function applyPendingRelicActivations(g: GameState) {
  ensureRelicSystem(g);

  const q = pendingQueue(g);
  if (!q.length) return;

  (g.run as any).pendingRelicActivations = [];
  const map = runtimeMap(g);

  for (const id of q) {
    const st = map[id] ?? ensureRuntimeEntry(g, id);
    if (!st.pending) continue;

    st.pending = false;
    st.active = true;
    st.activatedAtNode = g.run.nodePickCount;

    (g.run as any).relicUnlocked[id] = true;

    const def = RELICS_BY_ID[id] as RelicDef | undefined;
    def?.onActivate?.(g);

    logMsg(g, `유물 활성화: ${def?.name ?? id}`);
  }
}

/* ---------------- 공통 유틸 ---------------- */

export function eachRelicId(g: GameState): string[] {
  ensureRelicSystem(g);
  return (g.run.relics ?? []) as string[];
}

function eachActiveRelicId(g: GameState): string[] {
  return eachRelicId(g).filter((id) => isRelicActive(g, id));
}

/* ---------------- 런 훅 실행 (ACTIVE만) ---------------- */

export function runRelicHook<K extends RelicHookName>(
  g: GameState,
  hook: K,
  ...args: RelicHookMap[K]
) {
  for (const id of eachActiveRelicId(g)) {
    const def = RELICS_BY_ID[id] as RelicDef | undefined;
    if (!def) continue;

    const fn = def[hook] as ((g: GameState, ...a: RelicHookMap[K]) => void) | undefined;
    fn?.(g, ...args);
  }
}

/* ---------------- 데미지 훅 (ACTIVE만) ---------------- */

export function modifyDamageByRelics(g: GameState, ctx: DamageContext): number {
  let v = ctx.current;

  for (const id of eachActiveRelicId(g)) {
    const def = RELICS_BY_ID[id] as RelicDef | undefined;
    const fn = def?.modifyDamage;
    if (!fn) continue;

    const out = fn(g, { ...ctx, current: v });
    v = Number.isFinite(out) ? out : v;
    if (v < 0) v = 0;
  }
  return v;
}

export function notifyDamageAppliedByRelics(g: GameState, ctx: DamageContext, applied: number) {
  for (const id of eachActiveRelicId(g)) {
    const def = RELICS_BY_ID[id] as RelicDef | undefined;
    def?.onDamageApplied?.(g, ctx, applied);
  }
}