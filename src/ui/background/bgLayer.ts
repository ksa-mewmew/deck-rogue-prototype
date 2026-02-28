let _bgLayer: HTMLDivElement | null = null;
let _bgProbeDone = false;

function parseUrlToken(v: string): string | null {
  const s = (v ?? "").trim();
  const m = s.match(/^url\((.*)\)$/i);
  if (!m) return null;
  let inner = (m[1] ?? "").trim();
  if ((inner.startsWith("\"") && inner.endsWith("\"")) || (inner.startsWith("'") && inner.endsWith("'"))) {
    inner = inner.slice(1, -1);
  }
  return inner || null;
}

function probeBgUrlOnce() {
  if (_bgProbeDone) return;
  _bgProbeDone = true;

  const root = document.documentElement;
  const raw = getComputedStyle(root).getPropertyValue("--bgUrl").trim();
  const url = parseUrlToken(raw);
  if (!url) {
   console.warn("[bg] --bgUrl is not a url(...):", raw);
    return;
  }

  const img = new Image();
  img.onload = () => {
    // ok
  };
  img.onerror = () => {
    console.warn("[bg] failed to load dungeon background:", url);
  };
  img.src = url;
}

export function ensureBgLayer() {
  if (_bgLayer && document.body.contains(_bgLayer)) return _bgLayer;

  const existing = document.querySelector<HTMLDivElement>(".bgLayer");
  if (existing) {
    _bgLayer = existing;
    probeBgUrlOnce();
    return existing;
  }

  const bg = document.createElement("div");
  bg.className = "bgLayer";
  // Avoid negative stacking-context surprises if token drifts.
  bg.style.zIndex = "0";
  document.body.appendChild(bg);
  _bgLayer = bg;
  probeBgUrlOnce();
  return bg;
}
