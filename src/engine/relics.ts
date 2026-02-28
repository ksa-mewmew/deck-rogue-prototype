import type { GameState, Side, UnlockProgress, RelicUnlockBaseline, RelicRuntime } from "./types";
import { RELICS_BY_ID, EVENT_RELIC_POOL } from "../content/relicsContent";
import { logMsg, pushUiToast } from "./rules";

export function hasRelic(g: GameState, id: string) {
  ensureRelicSystem(g);
  return (g.run.relics ?? []).includes(id);
}

export function gainRelic(g: GameState, id: string) {
  ensureRelicSystem(g);
  g.run.relics ??= [];
  if (!g.run.relics.includes(id)) g.run.relics.push(id);
}

export const EVENT_RELIC_IDS = new Set<string>(EVENT_RELIC_POOL.map((r) => r.id));

export function isEventRelicId(id: string) {
  return EVENT_RELIC_IDS.has(id);
}

export function rollEventRelicId(g: GameState): string | null {
  const owned = new Set<string>(((g.run.relics ?? []) as string[]));
  const candidates = EVENT_RELIC_POOL.map((r) => r.id).filter((id) => !owned.has(id));
  if (candidates.length === 0) return null;
  return candidates[(Math.random() * candidates.length) | 0];
}

export function rollNormalRelicId(g: GameState): string | null {
  const owned = new Set<string>(g.run.relics ?? []);
  const candidates = Object.keys(RELICS_BY_ID)
    .filter(id => !owned.has(id))
    .filter(id => !isEventRelicId(id));

  if (!candidates.length) return null;
  return candidates[(Math.random() * candidates.length) | 0];
}

export type RelicPlaceCardCtx = { side: Side; idx: number; cardUid: string };

export type RelicHookMap = {
  onCombatStart: [];
  onReveal: [];
  onVictory: [];
  onPlaceCard: [RelicPlaceCardCtx];
  onUpkeepEnd: [];
};

export type RelicHookName = keyof RelicHookMap;


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

  unlock?: (g: GameState, base: RelicUnlockBaseline) => boolean;
  onActivate?: (g: GameState) => void;

  modifyDamage?: (g: GameState, ctx: DamageContext) => number;
  onDamageApplied?: (g: GameState, ctx: DamageContext, applied: number) => void;
} & RelicHooks;


const DEFAULT_UNLOCK: UnlockProgress = {
  rest: 0,
  eliteWins: 0,
  tookBigHit10: 0,
  kills: 0,
  endedTurnWeak: 0,
  eventPicks: 0,
  hpLeq15: 0,
  skippedTurn: 0,
  bleedApplied: 0,
  endedTurnSupplyZero: 0,
  moonScrollUses: 0,

  threeEnemyWins: 0,
  endedTurnWith3Installs: 0,
  installDamageDealt: 0,
  itemDiscards: 0,
};

function ensureRelicSystem(g: GameState) {
  g.run.relics ??= [];
  g.run.relicRuntime ??= {};
  g.run.pendingRelicActivations ??= [];
  g.run.unlock = { ...DEFAULT_UNLOCK, ...(g.run.unlock ?? {}) };
  g.run.relicUnlocked ??= {};
}

function runtimeMap(g: GameState): Record<string, RelicRuntime> {
  ensureRelicSystem(g);
  return g.run.relicRuntime as Record<string, RelicRuntime>;
}

function pendingQueue(g: GameState): string[] {
  ensureRelicSystem(g);
  return g.run.pendingRelicActivations as string[];
}

export function getUnlockProgress(g: GameState): UnlockProgress {
  ensureRelicSystem(g);
  return g.run.unlock as UnlockProgress;
}

function snapshotRelicUnlockBaseline(g: GameState): RelicUnlockBaseline {
  const up = getUnlockProgress(g);

  const moves = Number(g.run.timeMove ?? g.run.nodePickCount ?? 0) || 0;
  const timeTotal = (Number(g.run.timeMove ?? 0) || 0) + (Number(g.time ?? 0) || 0);

  return {
    unlock: { ...up },
    moves,
    timeTotal,
    fatigue: Number(g.player?.fatigue ?? 0) || 0,
    supplies: Number(g.player?.supplies ?? 0) || 0,
  };
}

function ensureRuntimeEntry(g: GameState, id: string): RelicRuntime {
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
  ensureRelicSystem(g);
  if (!hasRelic(g, id)) return false;
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

  if (g.run.relicUnlocked?.[id] === true) return true;
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

    const st = (g.run.relicRuntime?.[id] ?? null) as RelicRuntime | null;

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
    const dt = parts.length ? parts.join("\n \n") : baseText;
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
    g.run.relicUnlocked[id] = true;
    logMsg(g, `유물 획득: ${def?.name ?? id}`);
    pushUiToast(g, "RELIC", `유물 획득: ${def?.name ?? id}`, 2000);
    return;
  }

  st.active = false;
  if (!st.unlockBase) st.unlockBase = snapshotRelicUnlockBaseline(g);

  const disp = getRelicDisplay(g, id);
  logMsg(g, `유물 획득: ${disp.name}`);
  pushUiToast(g, "RELIC", `유물 획득: ${disp.name}`, 2000);


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

    if (!st.unlockBase) {
      st.unlockBase = snapshotRelicUnlockBaseline(g);
      continue;
    }

    if (def.unlock(g, st.unlockBase)) queuePendingActivation(g, id);
  }
}

export function applyPendingRelicActivations(g: GameState) {
  ensureRelicSystem(g);

  const q = pendingQueue(g);
  if (!q.length) return;

  g.run.pendingRelicActivations = [];
  const map = runtimeMap(g);

  for (const id of q) {
    const st = map[id] ?? ensureRuntimeEntry(g, id);
    if (!st.pending) continue;

    st.pending = false;
    st.active = true;
    st.activatedAtNode = g.run.nodePickCount;

    g.run.relicUnlocked[id] = true;

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
