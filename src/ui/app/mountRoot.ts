import { applyAssetVarsOnce } from "../assets";

export function mountRoot(): HTMLDivElement {
  applyAssetVarsOnce();
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("#app not found");
  app.innerHTML = "";
  return app;
}