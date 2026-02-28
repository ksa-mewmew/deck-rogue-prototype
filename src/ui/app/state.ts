import type { GameState } from "../../engine/types";
import type { Overlay } from "../overlays/overlay";

let currentG: GameState | null = null;
let currentActions: unknown = null;
let overlay: Overlay | null = null;
let uiMounted = false;

export function getCurrentG(): GameState | null {
  return currentG;
}

export function setCurrentG(g: GameState | null) {
  currentG = g;
}

export function getCurrentActions<T = unknown>(): T | null {
  return (currentActions as any) ?? null;
}
export function setCurrentActions(actions: unknown) {
  currentActions = actions;
}

export function getOverlay(): Overlay | null {
  return overlay;
}

export function setOverlay(o: Overlay | null) {
  overlay = o;
}

export function getOverlayState(): Overlay | null {
  return overlay;
}

export function setOverlayState(o: Overlay | null) {
  overlay = o;
}

export function getUiMounted(): boolean {
  return uiMounted;
}

export function setUiMounted(v: boolean) {
  uiMounted = v;
}