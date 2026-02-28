import type { GameState } from "../../engine/types";
import type { FloatFxRuntime } from "./floatFx";
import { pushFloatFx } from "./floatFx";
import { unitLenDev } from "../assets";

export function createDeltasFx(rt: FloatFxRuntime, animMs: (ms: number) => number) {
  let prevPlayerHp: number | null = null;
  let prevPlayerBlock: number | null = null;
  let prevEnemyHp: number[] = [];

  function reset() {
    prevPlayerHp = null;
    prevPlayerBlock = null;
    prevEnemyHp = [];
  }

  function emitPlayerDelta(dhp: number) {
    const u = unitLenDev();

    const box = document.querySelector<HTMLElement>(".playerHudBox")
      ?? document.querySelector<HTMLElement>(".playerHudLeft");
    if (!box) return;
    const r = box.getBoundingClientRect();
    const x = (r.left + r.right) / 2;
    const y = r.top + 14 * u;

    if (dhp < 0) pushFloatFx(rt, "dmg", `${dhp}`, x, y);
    else pushFloatFx(rt, "heal", `+${dhp}`, x, y);

    box.classList.add("fxFlash");
    setTimeout(() => box.classList.remove("fxFlash"), animMs(240));
  }

  function emitPlayerBlockDelta(d: number) {
    const u = unitLenDev();

    const box = document.querySelector<HTMLElement>(".playerHudBox")
      ?? document.querySelector<HTMLElement>(".playerHudLeft");
    if (!box) return;
    const r = box.getBoundingClientRect();
    const x = (r.left + r.right) / 2;
    const y = r.top + 34 * u;

    pushFloatFx(rt, "block", (d > 0 ? `+${d}` : `${d}`), x, y);
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

    if (dhp < 0) pushFloatFx(rt, "dmg", `${dhp}`, x, y);
    else pushFloatFx(rt, "heal", `+${dhp}`, x, y);

    el.classList.add("fxFlash");
    setTimeout(() => el.classList.remove("fxFlash"), animMs(240));
  }

  function tick(g: GameState) {
    const inCombat = !g.run.finished && g.enemies.length > 0 && g.phase !== "NODE";
    if (!inCombat) {
      reset();
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

  return { tick, reset };
}
