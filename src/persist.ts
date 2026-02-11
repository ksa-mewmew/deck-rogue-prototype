import type { GameState } from "./engine/types";

const SAVE_KEY = "deck-rogue-save-v1";
const SAVE_VER = 1;

type SaveBlob = {
  ver: number;
  savedAt: number;
  build?: string;
  state: GameState;
};

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return !!localStorage.getItem(SAVE_KEY);
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function saveGame(g: GameState, opt?: { build?: string }) {
  const blob: SaveBlob = {
    ver: SAVE_VER,
    savedAt: Date.now(),
    build: opt?.build,
    state: g,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
}

export function loadGame(): { state: GameState; savedAt: number } | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;

  const blob = safeJsonParse<SaveBlob>(raw);
  if (!blob || blob.ver !== SAVE_VER || !blob.state) return null;

  return { state: blob.state, savedAt: blob.savedAt };
}
