export type FloatFx = {
  id: number;
  kind: "dmg" | "heal" | "block";
  text: string;
  x: number;
  y: number;
  born: number;
};

export type FloatFxRuntime = {
  seq: number;
  list: FloatFx[];
};

export function createFloatFxRuntime(): FloatFxRuntime {
  return { seq: 1, list: [] };
}

export function pushFloatFx(rt: FloatFxRuntime, kind: FloatFx["kind"], text: string, x: number, y: number) {
  rt.list.push({ id: rt.seq++, kind, text, x, y, born: performance.now() });
}

export function cleanupFloatFx(rt: FloatFxRuntime, animMs: (ms: number) => number) {
  const now = performance.now();
  rt.list = rt.list.filter((f) => now - f.born < animMs(700));
}

export function renderFloatFxLayer(rt: FloatFxRuntime, animMs: (ms: number) => number) {
  cleanupFloatFx(rt, animMs);

  let layer = document.querySelector<HTMLElement>(".floatFxLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "floatFxLayer";
    document.body.appendChild(layer);
  }
  layer.style.cssText =
    "position:fixed; inset:0;" +
    "pointer-events:none;" +
    "z-index: var(--zChrome);";

  const alive = new Set(rt.list.map((f) => String(f.id)));
  Array.from(layer.querySelectorAll<HTMLElement>(".floatNum[data-fx-id]")).forEach((el) => {
    const id = String(el.dataset.fxId ?? "");
    if (!alive.has(id)) el.remove();
  });

  for (const f of rt.list) {
    const id = String(f.id);
    let el = layer.querySelector<HTMLElement>(`.floatNum[data-fx-id="${id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = `floatNum ${f.kind}`;
      el.dataset.fxId = id;
      el.textContent = f.text;

      el.style.position = "absolute";
      layer.appendChild(el);
    }

    const xvw = (f.x / window.innerWidth) * 100;
    const yvh = (f.y / window.innerHeight) * 100;
    el.style.left = `${xvw.toFixed(4)}vw`;
    el.style.top = `${yvh.toFixed(4)}vh`;
  }
}
