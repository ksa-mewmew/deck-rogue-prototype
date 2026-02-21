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


function setAssetCssVars() {
  // Vite base (GitHub Pages면 "/repo-name/")
  let base = import.meta.env.BASE_URL || "/";
  if (!base.endsWith("/")) base += "/";

  const root = document.documentElement;
  const setUrl = (cssVar: string, relPath: string) => {
    root.style.setProperty(cssVar, `url("${base}${relPath}")`);
  };

  setUrl("--cardBgBasic",   "assets/ui/cards/card_basic.png");
  setUrl("--cardBgCommon",  "assets/ui/cards/card_common.png");
  setUrl("--cardBgSpecial", "assets/ui/cards/card_special.png");
  setUrl("--cardBgRare",    "assets/ui/cards/card_rare.png");
  setUrl("--cardBgMadness", "assets/ui/cards/card_madness.png");
}

setAssetCssVars();

render(g, actions);

document.documentElement.style.setProperty(
  "--base",
  import.meta.env.BASE_URL
);