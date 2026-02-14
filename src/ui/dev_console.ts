// src/ui/dev_console.ts
import type { GameState, PileKind } from "../engine/types";
import { addCardToDeck } from "../content";
import { removeCardByUid } from "../content";
import { checkEndConditions } from "../engine/combat";

export type DevConsoleActions = {
  onNewRun: () => void;
};

export type DevConsoleCtx = {
  getG: () => GameState;
  actions: DevConsoleActions;
  rerender: () => void;

  log?: (msg: string) => void;
};

type DevLine = { t: number; kind: "in" | "out" | "err"; text: string };

let open = false;
let ctx: DevConsoleCtx | null = null;

let lines: DevLine[] = [];
let history: string[] = [];
let histIdx = -1;

function push(kind: DevLine["kind"], text: string) {
  lines.push({ t: Date.now(), kind, text });
  if (lines.length > 300) lines = lines.slice(-300);
}

export function setDevConsoleCtx(next: DevConsoleCtx) {
  ctx = next;
}

export function isDevConsoleOpen() {
  return open;
}

export function toggleDevConsole(force?: boolean) {
  open = typeof force === "boolean" ? force : !open;
  renderDevConsole();
}

export function devConsolePrint(text: string, kind: DevLine["kind"] = "out") {
  push(kind, text);
  if (open) renderDevConsole();
}

export function renderDevConsole() {
  document.querySelector(".devConsole")?.remove();
  if (!open) return;

  const layer = document.createElement("div");
  layer.className = "devConsole";
  layer.style.cssText = `
    position: fixed; inset: 0;
    z-index: 60000;
    pointer-events: auto;
    background: rgba(0,0,0,.35);
    backdrop-filter: blur(4px);
    display:flex; align-items:flex-end; justify-content:center;
    padding: 12px;
    box-sizing: border-box;
  `;

  const panel = document.createElement("div");
  panel.style.cssText = `
    width: min(980px, 100%);
    height: min(420px, 70vh);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(10,12,14,.92);
    box-shadow: 0 18px 60px rgba(0,0,0,.55);
    display:flex;
    flex-direction: column;
    overflow:hidden;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    padding: 10px 12px;
    display:flex; align-items:center; justify-content:space-between;
    border-bottom: 1px solid rgba(255,255,255,.10);
  `;

  const title = document.createElement("div");
  title.textContent = "Dev Console";
  title.style.cssText = "font-weight:800; color:#fff; opacity:.95;";

  const btns = document.createElement("div");
  btns.style.cssText = "display:flex; gap:8px;";

  const mkBtn = (label: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = `
      padding: 6px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.06);
      color: #fff;
      cursor: pointer;
      font-weight: 700;
    `;
    b.onclick = onClick;
    return b;
  };

  btns.appendChild(mkBtn("Clear", () => {
    lines = [];
    renderDevConsole();
  }));
  btns.appendChild(mkBtn("Close", () => {
    open = false;
    renderDevConsole();
  }));

  header.appendChild(title);
  header.appendChild(btns);

  const out = document.createElement("div");
  out.className = "devConsoleOut";
  out.style.cssText = `
    flex: 1 1 auto;
    padding: 10px 12px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
    color: #ddd;
    white-space: pre-wrap;
  `;

  const formatLine = (l: DevLine) => {
    const prefix =
      l.kind === "in"  ? "> "
    : l.kind === "err" ? "! "
    : "  ";
    return prefix + l.text;
  };

  out.textContent = lines.map(formatLine).join("\n");
  queueMicrotask(() => { out.scrollTop = out.scrollHeight; });

  const inputRow = document.createElement("div");
  inputRow.style.cssText = `
    border-top: 1px solid rgba(255,255,255,.10);
    padding: 10px 12px;
    display:flex; gap:10px; align-items:center;
  `;

  const prompt = document.createElement("div");
  prompt.textContent = ">";
  prompt.style.cssText = "color:#fff; font-weight:900; opacity:.9;";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "help / state / newrun ...";
  input.style.cssText = `
    flex: 1 1 auto;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.06);
    color: #fff;
    outline: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
  `;

  input.onkeydown = (e) => {
    if (e.key === "Escape") {
      open = false;
      renderDevConsole();
      return;
    }

    if (e.key === "Enter") {
      const cmd = input.value.trim();
      if (!cmd) return;
      input.value = "";
      history.unshift(cmd);
      histIdx = -1;

      push("in", cmd);
      try {
        runDevCommand(cmd);
      } catch (err: any) {
        push("err", String(err?.message ?? err));
      }
      renderDevConsole();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const max = history.length;
      if (max === 0) return;
      histIdx = Math.min(max - 1, histIdx + 1);
      input.value = history[histIdx] ?? "";
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const max = history.length;
      if (max === 0) return;
      histIdx = Math.max(-1, histIdx - 1);
      input.value = histIdx >= 0 ? (history[histIdx] ?? "") : "";
      return;
    }
  };

  inputRow.appendChild(prompt);
  inputRow.appendChild(input);

  panel.appendChild(header);
  panel.appendChild(out);
  panel.appendChild(inputRow);

  panel.onclick = (e) => e.stopPropagation();

  layer.appendChild(panel);
  document.body.appendChild(layer);

  queueMicrotask(() => input.focus());
}

function runDevCommand(raw: string) {
  const c = ctx;
  if (!c) {
    push("err", "Dev console context not set");
    return;
  }

  const g = c.getG();
  const parts = raw.split(/\s+/).filter(Boolean);
  const cmd = (parts[0] ?? "").toLowerCase();
  const a1 = parts[1];
  const a2 = parts[2];

  const out = (s: string) => push("out", s);

  if (cmd === "help") {
    out([
      "help",
      "state",
      "newrun",
      "hp <n> | maxhp <n> | supplies <n> | fatigue <n>",
      "phase <PLACE|BACK|FRONT|ENEMY|UPKEEP|DRAW|NODE>",
      "addcard <defId> [upgrade=0] [zone=deck|hand|discard]",
      "removecard <uid>",
      "win | lose",
      "log <text...>",
    ].join("\n"));
    return;
  }

  if (cmd === "state") {
    out(JSON.stringify({
      phase: g.phase,
      hp: `${g.player.hp}/${g.player.maxHp}`,
      supplies: g.player.supplies,
      fatigue: g.player.fatigue,
      deck: g.deck.length,
      hand: g.hand.length,
      discard: g.discard.length,
      enemies: g.enemies.map(e => ({ id: e.id, hp: `${e.hp}/${e.maxHp}`, intent: e.intentIndex })),
    }, null, 2));
    return;
  }

  if (cmd === "newrun") {
    c.actions.onNewRun();
    out("OK: newrun");
    return;
  }

  const setNum = (label: string, apply: (n: number) => void) => {
    const n = Number(a1);
    if (!Number.isFinite(n)) { out(`ERR: ${label} requires number`); return; }
    apply(n);
    c.rerender();
    out(`OK: ${label} = ${n}`);
  };

  if (cmd === "hp")       return setNum("hp", (n) => g.player.hp = Math.max(0, Math.min(g.player.maxHp, n)));
  if (cmd === "maxhp")    return setNum("maxHp", (n) => { g.player.maxHp = Math.max(1, n); g.player.hp = Math.min(g.player.hp, g.player.maxHp); });
  if (cmd === "supplies") return setNum("supplies", (n) => g.player.supplies = Math.max(0, n));
  if (cmd === "fatigue")  return setNum("fatigue", (n) => g.player.fatigue = Math.max(0, n));

  if (cmd === "phase") {
    const p = (a1 ?? "").toUpperCase();
    const allowed = new Set(["PLACE","BACK","FRONT","ENEMY","UPKEEP","DRAW","NODE"]);
    if (!allowed.has(p)) { out("ERR: phase invalid"); return; }
    (g as any).phase = p;
    c.rerender();
    out(`OK: phase=${p}`);
    return;
  }

  if (cmd === "log") {
    const msg = raw.slice(raw.indexOf(" ") + 1);
    if (!msg || msg === raw) { out("ERR: log <text...>"); return; }
    c.log?.(`[DEV] ${msg}`);
    out("OK: logged");
    return;
  }

  if (cmd === "addcard") {
    const defId = a1;
    if (!defId) { out("ERR: addcard <defId> [upgrade=0] [zone=deck|hand|discard]"); return; }

    const upgrade = Math.max(0, Number(a2 ?? "0") || 0);
    const zone = (parts[3] ?? "deck") as PileKind;

    addCardToDeck(g, defId, { upgrade });

    const uid = g.deck[g.deck.length - 1];
    if (uid && zone !== "deck") {
      g.deck = g.deck.filter(x => x !== uid);
      if (zone === "hand") g.hand.push(uid);
      else if (zone === "discard") g.discard.push(uid);
      g.cards[uid].zone = zone as any;
    }

    c.log?.(`[DEV] addcard ${defId} +${upgrade} (${zone}) uid=${uid}`);
    c.rerender();
    out(`OK: addcard uid=${uid}`);
    return;
  }

  if (cmd === "removecard") {
    const uid = a1;
    if (!uid) { out("ERR: removecard <uid>"); return; }
    if (!g.cards[uid]) { out(`ERR: uid not found: ${uid}`); return; }

    removeCardByUid(g, uid);
    c.log?.(`[DEV] removecard ${uid}`);
    c.rerender();
    out("OK: removecard");
    return;
  }

  if (cmd === "win") {
    if (!g.enemies || g.enemies.length === 0) { out("WARN: enemies=0"); return; }
    for (const e of g.enemies) e.hp = 0;
    g.enemies = [];
    (g as any).pendingTarget = null;
    (g as any).pendingTargetQueue = [];
    (g as any).selectedEnemyIndex = null;
    checkEndConditions(g)

    c.log?.("[DEV] win");
    c.rerender();
    out("OK: win");
    return;
  }

  if (cmd === "lose") {
    g.run.finished = true;
    c.log?.("[DEV] lose");
    c.rerender();
    out("OK: lose");
    return;
  }

  out(`Unknown command: ${cmd} (try: help)`);
}