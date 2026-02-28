import type { GameState } from "./types";
import { getItemDefById, pickRandomItemId } from "../content/items";
import { logMsg, pushUiToast } from "./rules";
import { resolvePlayerEffects } from "./resolve";

// 기본 아이템 보유 한도. (런에서 itemCap을 올려 확장 가능)
export const DEFAULT_ITEM_CAP = 2;

function ensureRunItems(g: GameState) {
  const runAny = g.run as any;
  if (!runAny.items) runAny.items = [];
  if (runAny.itemCap == null) runAny.itemCap = DEFAULT_ITEM_CAP;
}

export function listRunItems(g: GameState): string[] {
  ensureRunItems(g);
  return ((g.run as any).items as string[]) ?? [];
}

export function getItemCap(g: GameState): number {
  ensureRunItems(g);
  const n = Number((g.run as any).itemCap);
  if (!Number.isFinite(n)) return DEFAULT_ITEM_CAP;
  return Math.max(0, Math.floor(n));
}

export function setItemCap(g: GameState, n: number, source: string = "") {
  ensureRunItems(g);
  const v = Math.max(0, Math.floor(Number(n) || 0));
  (g.run as any).itemCap = v;
  logMsg(g, `아이템 보유 한도${source ? `(${source})` : ""}: ${v}`);
}

export function addItemCap(g: GameState, delta: number, source: string = "") {
  const cur = getItemCap(g);
  setItemCap(g, cur + (Number(delta) || 0), source);
}

export function isItemInventoryFull(g: GameState): boolean {
  return listRunItems(g).length >= getItemCap(g);
}

export function itemInventorySpace(g: GameState): number {
  return Math.max(0, getItemCap(g) - listRunItems(g).length);
}

export function addItemToInventory(g: GameState, id: string, source: string = ""): boolean {
  ensureRunItems(g);

  const def = getItemDefById(id);
  if (!def) {
    logMsg(g, `아이템 획득 실패(정의 없음): ${id}`);
    return false;
  }

  const cap = getItemCap(g);
  const arr = (g.run as any).items as string[];
  if (arr.length >= cap) {
    logMsg(g, `아이템 획득 실패(가방 가득 참 ${arr.length}/${cap}): ${def.name}`);
    pushUiToast(g, "WARN", `아이템 가방이 가득 찼습니다. (${arr.length}/${cap})`, 1600);
    return false;
  }

  arr.push(id);
  logMsg(g, `아이템 획득${source ? `(${source})` : ""}: ${def.name}`);
  pushUiToast(g, "INFO", `${def.name} 획득`, 1600);
  return true;
}

export function removeItemAt(g: GameState, idx: number): string | null {
  ensureRunItems(g);
  const arr = (g.run as any).items as string[];
  if (!Array.isArray(arr)) return null;
  if (idx < 0 || idx >= arr.length) return null;
  const [id] = arr.splice(idx, 1);
  return id ?? null;
}

// 사용하지 않고 버리기(전투/노드 어디서든 가능)
export function discardItemAt(g: GameState, idx: number, source: string = ""): boolean {
  ensureRunItems(g);
  const arr = (g.run as any).items as string[];
  if (!Array.isArray(arr) || arr.length === 0) return false;
  if (idx < 0 || idx >= arr.length) return false;

  const id = String(arr[idx]);
  const def = getItemDefById(id);

  removeItemAt(g, idx);

  const up: any = ((g.run as any).unlock ??= {});
  up.itemDiscards = Math.max(0, Number(up.itemDiscards ?? 0) + 1);

  logMsg(g, `아이템 버림${source ? `(${source})` : ""}: ${def?.name ?? id}`);
  pushUiToast(g, "WARN", `${def?.name ?? id} 버림`, 1400);

  return true;
}

export function useItemAt(g: GameState, idx: number): boolean {
  ensureRunItems(g);
  const arr = (g.run as any).items as string[];
  if (!Array.isArray(arr) || arr.length === 0) return false;
  if (idx < 0 || idx >= arr.length) return false;

  const inCombat = g.enemies.length > 0 && g.phase !== "NODE";
  if (!inCombat) {
    pushUiToast(g, "WARN", "전투 중에만 아이템을 사용할 수 있습니다.", 1400);
    return false;
  }

  const id = arr[idx];
  const def = getItemDefById(id);
  if (!def) {
    pushUiToast(g, "WARN", `아이템 정의 없음: ${id}`, 1400);
    return false;
  }

  // 효과 적용
  resolvePlayerEffects({ game: g, side: "front", cardUid: "", sourceLabel: `아이템: ${def.name}`, reason: "OTHER" }, def.effects ?? []);

  // 소모(쿨다운/턴 제한 없음)
  const consumed = removeItemAt(g, idx);
  if (consumed) {
    logMsg(g, `아이템 사용: ${def.name} (소모)`);
    pushUiToast(g, "INFO", `${def.name} 사용`, 1400);
  }

  return true;
}

export function rollBattleItemDrop(g: GameState, ctx: { elite: boolean; boss: boolean }): string | null {
  const runAny = g.run as any;
  if (runAny.itemOfferedThisBattle) return null;
  if (ctx.boss) return null;

  const p = ctx.elite ? 0.4 : 0.30;
  if (Math.random() >= p) return null;

  const id = pickRandomItemId();
  if (!id) return null;

  runAny.itemOfferedThisBattle = true;
  return id;
}
