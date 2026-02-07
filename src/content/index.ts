import type { Content } from "../engine/types";

import { cardsById, CARDS } from "./cards";
import { enemiesById, ENEMIES } from "./enemies";

import { EVENTS, pickRandomEvent } from "./events";
import { offerRewardPair, addCardToDeck, removeCardByUid } from "./rewards";

// 엔진이 필요로 하는 런타임 콘텐츠(정확히 Content 타입)
export function buildContent(): Content {
  return {
    cardsById,
    enemiesById,
  };
}

// 아래는 편의용 재-export (actions/main에서 ./content로만 import 가능)
export {
  CARDS,
  ENEMIES,
  EVENTS,
  pickRandomEvent,
  offerRewardPair,
  addCardToDeck,
  removeCardByUid,
};
