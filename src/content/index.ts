import type { Content } from "../engine/types";

import { cardsById, CARDS } from "./cards";
import { enemiesById, ENEMIES } from "./enemies";

import { EVENTS, MAD_EVENTS, pickRandomEvent, pickEventByMadness, BOSS_OMEN_HINT } from "./events";
import { offerRewardPair, addCardToDeck, removeCardByUid, offerRewardsByFatigue } from "./rewards";

export function listAllCardDefIds(): string[] {
  return Object.keys(cardsById).sort((a, b) => a.localeCompare(b));
}

export function buildContent(): Content {
  return {
    cardsById,
    enemiesById,
  };
}

export {
  CARDS,
  ENEMIES,

  EVENTS,
  MAD_EVENTS,
  BOSS_OMEN_HINT,

  pickRandomEvent,
  pickEventByMadness,

  offerRewardPair,
  offerRewardsByFatigue,
  addCardToDeck,
  removeCardByUid,
};
