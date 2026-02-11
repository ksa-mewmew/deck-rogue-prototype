import type { Content } from "../engine/types";

import { cardsById, CARDS } from "./cards";
import { enemiesById, ENEMIES } from "./enemies";

import { EVENTS, pickRandomEvent, BOSS_OMEN_HINT } from "./events";
import { offerRewardPair, addCardToDeck, removeCardByUid } from "./rewards";


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
  BOSS_OMEN_HINT,
  pickRandomEvent,
  offerRewardPair,
  addCardToDeck,
  removeCardByUid,
};
