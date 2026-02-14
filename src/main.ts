import "./style.css";

import { installUiFit, installLayoutMode } from "./ui/uiFit";

installUiFit();
installLayoutMode();

import { createInitialState } from "./engine/state";
import { buildContent } from "./content";
import { render, createOrLoadGame } from "./ui/ui";
import { makeUIActions } from "./ui/ui";

const content = buildContent();

let g = createOrLoadGame(content);


function setGame(next: typeof g) {
  g = next;
  actions = makeUIActions(g, setGame);
  render(g, actions);
}

let actions = makeUIActions(g, setGame);
render(g, actions);

document.documentElement.style.setProperty(
  "--base",
  import.meta.env.BASE_URL
);


const base = import.meta.env.BASE_URL;

// CSS에서 쓸 완성 URL들을 변수로 주입
document.documentElement.style.setProperty("--bgUrl", `url(${base}ui/background/dungeon_bg.png)`);
document.documentElement.style.setProperty("--boardUrl", `url(${base}ui/boards/battle_board.png)`);
document.documentElement.style.setProperty("--cardUrl", `url(${base}ui/cards/card_parchment.png)`);