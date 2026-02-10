import "./style.css";

import { createInitialState } from "./engine/state";
import { buildContent } from "./content";
import { render } from "./ui/ui";
import { makeUIActions } from "./ui/ui";

const content = buildContent();

let g = createInitialState(content);

function setGame(next: typeof g) {
  g = next;
  actions = makeUIActions(g, setGame);
  render(g, actions);
}

let actions = makeUIActions(g, setGame);
render(g, actions);