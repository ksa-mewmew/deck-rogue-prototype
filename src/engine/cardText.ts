import type { GameState } from "./types";
import { isRelicActive } from "./relics";

function hasWrongDice(g: GameState): boolean {
  return isRelicActive(g, "relic_wrong_dice");
}

function displayNumBonus(g: GameState, cardUid?: string): number {
  const relic = hasWrongDice(g) ? 1 : 0;
  const overrun = cardUid && (g.cards[cardUid] as any)?.synth?.overrun ? 1 : 0;
  return relic + overrun;
}

function applySignedAbsBonus(n: number, bonus: number): number {
  if (bonus <= 0 || n === 0) return n;
  return n + Math.sign(n) * bonus;
}

export function displayCardText(g: GameState, text: string, cardUid?: string): string {
  if (!text) return text;
  const bonus = displayNumBonus(g, cardUid);
  if (bonus <= 0) return text;

  return text.replace(/-?\d+/g, (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return m;
    return String(applySignedAbsBonus(n, bonus));
  });
}

export function displayCardTextPair(g: GameState, frontText: string, backText: string, cardUid?: string) {
  const synthNames = (() => {
    if (!cardUid) return [] as string[];
    const inst: any = g.cards[cardUid] as any;
    const synth: any = inst?.synth;
    if (!synth?.done) return [] as string[];

    const names: string[] = [];
    if (synth?.overrun) names.push("폭주");
    if (synth?.addTags?.includes("INSTALL")) names.push("설치");
    if (synth?.addTags?.includes("INNATE")) names.push("선천성");
    if (synth?.autoFlip) names.push("뒤집기");
    if (synth?.removeExhaust) names.push("소모 제거");
    return names;
  })();

  const note = synthNames.length > 0 ? `(${synthNames.join("/")})` : "";
  const front = displayCardText(g, frontText, cardUid);
  const back = displayCardText(g, backText, cardUid);

  return {
    frontText: note ? `${front}\n${note}` : front,
    backText: note ? `${back}\n${note}` : back,
  };
}

export function displayCardName(g: GameState, name: string): string {
  return displayCardText(g, name);
}

export function displayCardNameWithUpgrade(g: GameState, name: string, upgrade: number | undefined): string {
  const u = upgrade ?? 0;
  const label = u > 0 ? `${name} +${u}` : name;
  return displayCardText(g, label);
}

export function synthEffectLabelForUid(g: GameState, uid: string): string {
  const inst: any = g.cards[uid] as any;
  const synth: any = inst?.synth;
  if (!synth?.done) return "";

  const effects: string[] = [];
  if (synth?.overrun) effects.push("폭");
  if (synth?.addTags?.includes("INSTALL")) effects.push("설");
  if (synth?.addTags?.includes("INNATE")) effects.push("선");
  if (synth?.autoFlip) effects.push("뒤");
  if (synth?.removeExhaust) effects.push("소");
  return effects.join("/");
}

export function displayCardNameForUid(g: GameState, uid: string): string {
  const inst = g.cards[uid];
  if (!inst) return uid;
  const base = g.content.cardsById[inst.defId]?.name ?? inst.defId;
  return displayCardNameWithUpgrade(g, base, inst.upgrade ?? 0);
}
