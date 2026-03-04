import type { GameState } from "../../engine/types";
import { getUiSettings } from "../settings/uiSettings";

export type MusicMode = "explore" | "boss";
type TrackRole = "intro" | "main" | "main_after_treasure" | "boss_intro" | "boss";
type LoopRole = "main" | "main_after_treasure" | "boss";
type MusicCycle = "EXPLORE" | "BOSS";
type ExploreTheme = "NORMAL" | "AFTER_TREASURE";

const MUSIC_KEY = "deckrogue_music_unlocked_v1";

const TRACK_STEMS: Record<TrackRole, string> = {
  intro: "intro",
  main: "main",
  main_after_treasure: "main_after_treasure",
  boss_intro: "boss_intro",
  boss: "boss",
};

type RuntimeState = {
  oneShot: HTMLAudioElement;
  loop: HTMLAudioElement;
  cycle: MusicCycle;
  exploreTheme: ExploreTheme;
  currentRole: TrackRole | null;
  currentLoopRole: LoopRole | null;
  pendingLoopAfterOneShot: LoopRole | null;
  playToken: number;
  loopRestartTimer: number | null;
};

const LOOP_GAP_MS = 5000;

const resolvedSrc = new Map<TrackRole, string | null>();
const resolvingSrc = new Map<TrackRole, Promise<string | null>>();

let unlocked = false;
let unlockAttempted = false;
let settingsListenerBound = false;
let rt: RuntimeState | null = null;
let prewarmStarted = false;

const PREWARM_ROLES: TrackRole[] = ["intro", "main", "main_after_treasure", "boss_intro", "boss"];

function canPlayOgg(): boolean {
  try {
    const a = document.createElement("audio");
    const ok = a.canPlayType('audio/ogg; codecs="vorbis"');
    return ok === "probably" || ok === "maybe";
  } catch {
    return false;
  }
}

function pickCandidates(stem: string): string[] {
  if (canPlayOgg()) return [`assets/music/${stem}.ogg`, `assets/music/${stem}.mp3`];
  return [`assets/music/${stem}.mp3`, `assets/music/${stem}.ogg`];
}

async function fileExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return true;
  } catch {}

  try {
    const get = await fetch(url, { method: "GET", cache: "no-store" });
    return get.ok;
  } catch {
    return false;
  }
}

async function resolveTrackSrc(role: TrackRole): Promise<string | null> {
  if (resolvedSrc.has(role)) return resolvedSrc.get(role) ?? null;

  const pending = resolvingSrc.get(role);
  if (pending) return pending;

  const task = (async () => {
    const stem = TRACK_STEMS[role];
    for (const url of pickCandidates(stem)) {
      if (await fileExists(url)) {
        resolvedSrc.set(role, url);
        return url;
      }
    }
    resolvedSrc.set(role, null);
    return null;
  })();

  resolvingSrc.set(role, task);
  const out = await task;
  resolvingSrc.delete(role);
  return out;
}

function prewarmTrackResolution() {
  if (prewarmStarted) return;
  prewarmStarted = true;

  for (const role of PREWARM_ROLES) {
    void resolveTrackSrc(role);
  }
}

function clamp01(x: number) {
  const n = Number.isFinite(x) ? x : 0;
  return Math.max(0, Math.min(1, n));
}

function markUnlocked() {
  unlocked = true;
  try {
    localStorage.setItem(MUSIC_KEY, "1");
  } catch {}
}

function readUnlocked(): boolean {
  try {
    return localStorage.getItem(MUSIC_KEY) === "1";
  } catch {
    return false;
  }
}

async function safePlay(el: HTMLAudioElement) {
  try {
    const p = el.play();
    if (p) await p;
  } catch {}
}

function mkAudio() {
  const a = document.createElement("audio");
  a.preload = "auto";
  a.crossOrigin = "anonymous";
  a.loop = false;
  a.volume = 0;
  return a;
}

function ensureRuntime(): RuntimeState {
  if (rt) return rt;

  const oneShot = mkAudio();
  const loop = mkAudio();

  rt = {
    oneShot,
    loop,
    cycle: "EXPLORE",
    exploreTheme: "NORMAL",
    currentRole: null,
    currentLoopRole: null,
    pendingLoopAfterOneShot: null,
    playToken: 0,
    loopRestartTimer: null,
  };

  oneShot.addEventListener("ended", () => {
    const s = rt;
    if (!s) return;
    const nextLoop = s.pendingLoopAfterOneShot;
    if (!nextLoop) return;
    void startLoopRole(nextLoop);
  });

  loop.addEventListener("ended", () => {
    const s = rt;
    if (!s) return;
    const role = s.currentLoopRole;
    if (!role) return;
    scheduleLoopRestart(role, s.playToken);
  });

  document.addEventListener("visibilitychange", () => {
    const s = rt;
    if (!s) return;
    if (document.hidden) {
      s.oneShot.pause();
      s.loop.pause();
      return;
    }
    void tryResumeCurrent();
  });

  if (!settingsListenerBound) {
    settingsListenerBound = true;
    window.addEventListener("deckrogue:uiSettingsChanged", () => {
      applySettingsNow();
    });
  }

  return rt;
}

function stopPlayback() {
  const s = ensureRuntime();
  if (s.loopRestartTimer != null) {
    window.clearTimeout(s.loopRestartTimer);
    s.loopRestartTimer = null;
  }
  s.currentLoopRole = null;
  s.pendingLoopAfterOneShot = null;
  s.oneShot.pause();
  s.loop.pause();
  s.oneShot.currentTime = 0;
  s.loop.currentTime = 0;
  s.currentRole = null;
}

function scheduleLoopRestart(role: LoopRole, token: number) {
  const s = ensureRuntime();
  if (s.loopRestartTimer != null) {
    window.clearTimeout(s.loopRestartTimer);
    s.loopRestartTimer = null;
  }

  s.loopRestartTimer = window.setTimeout(() => {
    const s2 = rt;
    if (!s2) return;
    s2.loopRestartTimer = null;
    if (token !== s2.playToken) return;
    if (s2.currentLoopRole !== role) return;
    void startLoopRole(role);
  }, LOOP_GAP_MS);
}

function applySettingsNow() {
  const s = ensureRuntime();
  const ui = getUiSettings();

  if (!ui.musicEnabled) {
    s.oneShot.pause();
    s.loop.pause();
    return;
  }

  const vol = clamp01(ui.musicVolume);
  s.oneShot.volume = vol;
  s.loop.volume = vol;

  if (document.hidden || !unlocked) return;

  if (s.currentRole === "intro" || s.currentRole === "boss_intro") {
    void safePlay(s.oneShot);
    return;
  }

  if (s.currentRole === "main" || s.currentRole === "main_after_treasure" || s.currentRole === "boss") {
    if (s.loop.ended) return;
    void safePlay(s.loop);
  }
}

async function startLoopRole(role: LoopRole) {
  const s = ensureRuntime();
  const ui = getUiSettings();
  if (!ui.musicEnabled) return;

  if (s.loopRestartTimer != null) {
    window.clearTimeout(s.loopRestartTimer);
    s.loopRestartTimer = null;
  }

  const token = ++s.playToken;
  const src = await resolveTrackSrc(role);
  if (token !== s.playToken) return;

  if (!src) {
    stopPlayback();
    return;
  }

  s.currentLoopRole = role;
  s.pendingLoopAfterOneShot = null;
  s.oneShot.pause();
  s.oneShot.currentTime = 0;

  s.loop.loop = false;
  const changed = !s.loop.src || !s.loop.src.endsWith(src);
  if (changed) {
    s.loop.src = src;
    s.loop.currentTime = 0;
  } else if (s.loop.currentTime > 0) {
    s.loop.currentTime = 0;
  }

  s.currentRole = role;
  s.loop.volume = clamp01(ui.musicVolume);

  if (!document.hidden && unlocked) {
    await safePlay(s.loop);
  }
}

async function startOneShotThenLoop(oneShotRole: "intro" | "boss_intro", nextLoopRole: LoopRole) {
  const s = ensureRuntime();
  const ui = getUiSettings();
  if (!ui.musicEnabled) return;

  if (s.loopRestartTimer != null) {
    window.clearTimeout(s.loopRestartTimer);
    s.loopRestartTimer = null;
  }

  void (async () => {
    const loopSrc = await resolveTrackSrc(nextLoopRole);
    const s2 = rt;
    if (!s2 || !loopSrc) return;
    if (s2.pendingLoopAfterOneShot !== nextLoopRole) return;
    if (!s2.loop.src || !s2.loop.src.endsWith(loopSrc)) {
      s2.loop.src = loopSrc;
      s2.loop.load();
    }
  })();

  const token = ++s.playToken;
  const src = await resolveTrackSrc(oneShotRole);
  if (token !== s.playToken) return;

  s.loop.pause();
  s.loop.currentTime = 0;
  s.currentLoopRole = null;

  s.pendingLoopAfterOneShot = nextLoopRole;

  if (!src) {
    await startLoopRole(nextLoopRole);
    return;
  }

  s.oneShot.loop = false;
  const changed = !s.oneShot.src || !s.oneShot.src.endsWith(src);
  if (changed) {
    s.oneShot.src = src;
    s.oneShot.currentTime = 0;
  }

  s.currentRole = oneShotRole;
  s.oneShot.volume = clamp01(ui.musicVolume);

  if (!document.hidden && unlocked) {
    await safePlay(s.oneShot);
  }
}

async function startExploreSequence(theme: ExploreTheme) {
  const s = ensureRuntime();
  s.cycle = "EXPLORE";
  s.exploreTheme = theme;
  await startOneShotThenLoop("intro", theme === "AFTER_TREASURE" ? "main_after_treasure" : "main");
}

async function startBossSequence() {
  const s = ensureRuntime();
  s.cycle = "BOSS";
  await startOneShotThenLoop("boss_intro", "boss");
}

async function tryResumeCurrent() {
  const s = ensureRuntime();
  const ui = getUiSettings();

  if (!ui.musicEnabled) return;
  if (!unlocked) return;
  if (document.hidden) return;

  if (s.currentRole === "intro" || s.currentRole === "boss_intro") {
    await safePlay(s.oneShot);
    return;
  }

  if (s.currentRole === "main" || s.currentRole === "main_after_treasure" || s.currentRole === "boss") {
    if (s.loop.ended) return;
    await safePlay(s.loop);
    return;
  }

  if (s.cycle === "BOSS") {
    await startBossSequence();
  } else {
    await startExploreSequence(s.exploreTheme);
  }
}

export function installMusicUnlock() {
  ensureRuntime();
  prewarmTrackResolution();

  if (readUnlocked()) {
    unlocked = true;
    applySettingsNow();
    return;
  }

  if (unlockAttempted) return;
  unlockAttempted = true;

  const unlock = async () => {
    if (unlocked) return;
    unlocked = true;
    markUnlocked();
    await tryResumeCurrent();
    window.removeEventListener("pointerdown", unlockOnce, true);
    window.removeEventListener("keydown", unlockOnce, true);
    window.removeEventListener("touchstart", unlockOnce, true);
  };

  const unlockOnce = () => {
    void unlock();
  };

  window.addEventListener("pointerdown", unlockOnce, true);
  window.addEventListener("touchstart", unlockOnce, true);
  window.addEventListener("keydown", unlockOnce, true);
}

export function getDesiredMusicMode(g: GameState): MusicMode {
  const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
  const bossCombat = inCombat && !!(g.run as any).lastBattleWasBoss;
  return bossCombat ? "boss" : "explore";
}

export function syncMusicFromGame(g: GameState) {
  const s = ensureRuntime();
  const ui = getUiSettings();

  if (!ui.musicEnabled) {
    stopPlayback();
    return;
  }

  const desired = getDesiredMusicMode(g) === "boss" ? "BOSS" : "EXPLORE";
  const desiredExploreTheme: ExploreTheme = g.run.treasureObtained ? "AFTER_TREASURE" : "NORMAL";

  if (s.currentRole == null) {
    if (desired === "BOSS") void startBossSequence();
    else void startExploreSequence(desiredExploreTheme);
    return;
  }

  if (desired !== s.cycle) {
    if (desired === "BOSS") void startBossSequence();
    else void startExploreSequence(desiredExploreTheme);
    return;
  }

  if (desired === "EXPLORE" && s.exploreTheme !== desiredExploreTheme) {
    void startExploreSequence(desiredExploreTheme);
    return;
  }

  applySettingsNow();
}
