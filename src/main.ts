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



function injectFontFaces() {
  let base = import.meta.env.BASE_URL || "/";
  if (!base.endsWith("/")) base += "/";

  const css = `
@font-face{
  font-family: "Mulmaru";
  src:
    url("${base}fonts/Mulmaru.woff2") format("woff2"),
    url("${base}fonts/Mulmaru.woff") format("woff");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

  `.trim();

  let style = document.getElementById("fontFaces") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "fontFaces";
    document.head.appendChild(style);
  }
  style.textContent = css;
}

// ✅ 반드시 render 전에
injectFontFaces();



render(g, actions);

document.documentElement.style.setProperty(
  "--base",
  import.meta.env.BASE_URL
);