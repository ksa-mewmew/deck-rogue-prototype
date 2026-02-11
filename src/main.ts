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

