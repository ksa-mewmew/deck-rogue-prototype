import type { GameState } from "../types";
import { logMsg, pushUiToast } from "../rules";

export function addBlock(g: GameState, n: number) {
  if (n <= 0) return;

  let amount = n;

  try {
    const runAny: any = g.run as any;
    const f: any = runAny?.faith;
    const focus = String(f?.focus ?? "");
    const hostile = !!f?.hostile?.[focus];
    const pts = Number(f?.points?.[focus] ?? 0) || 0;
    const patron = focus && focus !== "madness" && !hostile && pts >= 3 ? focus : null;

    if (patron === "rabbit_hunt") {
      const reduced = Math.floor(amount * 0.9);
      amount = reduced;
      if (amount > 0 && !(g as any)._rabbitHuntBlockToastShownThisCombat) {
        (g as any)._rabbitHuntBlockToastShownThisCombat = true;
        pushUiToast(g, "WARN", "가벼운 방패는 잘 부러집니다.", 1600);
        logMsg(g, "토끼 사냥: 방어 획득량 -10% (내림)");
      }
    }
  } catch {}

  if (amount <= 0) return;

  g.player.block += amount;
  (g as any)._gainedBlockThisTurn = true;
  logMsg(g, `방어(블록) +${amount} (현재 ${g.player.block})`);
}
