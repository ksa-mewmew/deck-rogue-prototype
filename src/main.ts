import "./style.css";

import { createInitialState } from "./engine/state";
import { buildContent } from "./content"; // 프로젝트에 맞게
import { render } from "./ui/ui";
import { makeUIActions } from "./ui/ui";

const content = buildContent();

let g = createInitialState(content);

function setGame(next: typeof g) {
  g = next;
  actions = makeUIActions(g, setGame); // ✅ 새 g로 actions도 재생성
  render(g, actions);
}

let actions = makeUIActions(g, setGame);
render(g, actions);