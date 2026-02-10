import type { Content } from "../engine/types";

import { cardsById, CARDS } from "./cards";
import { enemiesById, ENEMIES } from "./enemies";

import { EVENTS, pickRandomEvent } from "./events";
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
  pickRandomEvent,
  offerRewardPair,
  addCardToDeck,
  removeCardByUid,
};
