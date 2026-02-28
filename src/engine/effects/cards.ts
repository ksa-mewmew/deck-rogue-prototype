import type { GameState } from "../types";

export function exhaustCardThisCombat(g: GameState, uid: string) {
  if (g.exhausted.includes(uid) || g.vanished.includes(uid)) return;

  g.deck = g.deck.filter(x => x !== uid);
  g.hand = g.hand.filter(x => x !== uid);
  g.discard = g.discard.filter(x => x !== uid);

  g.frontSlots = g.frontSlots.map(x => (x === uid ? null : x));
  g.backSlots  = g.backSlots.map(x => (x === uid ? null : x));

  g.cards[uid].zone = "exhausted";
  g.exhausted.push(uid);
}

export function vanishCardPermanently(g: GameState, uid: string) {
  const inst = g.cards[uid];
  if (!inst) return;

  if (inst.zone === "vanished") return;
  if (inst.zone === "exhausted") {
    return;
  }

  g.deck = g.deck.filter((x) => x !== uid);
  g.hand = g.hand.filter((x) => x !== uid);
  g.discard = g.discard.filter((x) => x !== uid);

  g.frontSlots = g.frontSlots.map((x) => (x === uid ? null : x));
  g.backSlots = g.backSlots.map((x) => (x === uid ? null : x));

  inst.zone = "vanished";
  if (!g.vanished.includes(uid)) g.vanished.push(uid);
}
