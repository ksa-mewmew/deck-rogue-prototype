import type { Content } from "../engine/types";

import { cardsById, CARDS } from "./cards";
import { enemiesById, ENEMIES } from "./enemies";

import { EVENTS, MAD_EVENTS, pickRandomEvent, pickEventByMadness, BOSS_OMEN_HINT } from "./events";
import { offerRewardPair, addCardToDeck, removeCardByUid, offerRewardsByFatigue } from "./rewards";

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
  MAD_EVENTS,          // 악몽 풀도 외부에서 디버그/표시
  BOSS_OMEN_HINT,

  pickRandomEvent,     // 유지
  pickEventByMadness,

  offerRewardPair,
  offerRewardsByFatigue,
  addCardToDeck,
  removeCardByUid,
};
