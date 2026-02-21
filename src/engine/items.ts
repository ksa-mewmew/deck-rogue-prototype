import type { GameState } from "./types";
import { getItemDefById, pickRandomItemId } from "../content/items";
import { logMsg, pushUiToast } from "./rules";
import { resolvePlayerEffects } from "./resolve";

function ensureRunItems(g: GameState) {
  const runAny = g.run as any;
  if (!runAny.items) runAny.items = [];
}

export function listRunItems(g: GameState): string[] {
  ensureRunItems(g);
  return ((g.run as any).items as string[]) ?? [];
}

export function addItemToInventory(g: GameState, id: string, source: string = "") {
  ensureRunItems(g);
  const def = getItemDefById(id);
  if (!def) {
    logMsg(g, `아이템 획득 실패(정의 없음): ${id}`);
    return;
  }

  (g.run as any).items.push(id);
  logMsg(g, `아이템 획득${source ? `(${source})` : ""}: ${def.name}`);
  pushUiToast(g, "INFO", `🎒 ${def.name} 획득`, 1600);
}

export function removeItemAt(g: GameState, idx: number): string | null {
  ensureRunItems(g);
  const arr = (g.run as any).items as string[];
  if (!Array.isArray(arr)) return null;
  if (idx < 0 || idx >= arr.length) return null;
  const [id] = arr.splice(idx, 1);
  return id ?? null;
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
    pushUiToast(g, "INFO", `🧪 ${def.name} 사용`, 1400);
  }

  return true;
}

export function rollBattleItemDrop(g: GameState, ctx: { elite: boolean; boss: boolean }): string | null {
  const runAny = g.run as any;
  if (runAny.itemOfferedThisBattle) return null;
  if (ctx.boss) return null; // 기본: 보스는 아이템 드랍 없음(원하시면 바꿔드릴 수 있음)

  const p = ctx.elite ? 0.4 : 0.30;
  if (Math.random() >= p) return null;

  const id = pickRandomItemId();
  if (!id) return null;

  runAny.itemOfferedThisBattle = true;
  return id;
}
