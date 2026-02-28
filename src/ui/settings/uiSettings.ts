import { div, divText } from "../dom";

export type UiSettings = {
  uiScaleDesktop: number;
  uiScaleMobile: number;
  slotCardMode: "FULL" | "NAME_ONLY";
  animMul: number; // 0=즉시, 1=기본, 2=느림
};

const UISET_KEY = "deckrogue_uiSettings_v1";

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function isMobileUiNow() {
  const b = document.body;
  if (b?.classList.contains("mobile")) return true;
  if (b?.classList.contains("desktop")) return false;
  const w = window.innerWidth;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return w <= 900 && coarse;
}

function loadUiSettings(): UiSettings {
  try {
    const raw = localStorage.getItem(UISET_KEY);
    if (!raw) {
      return {
        uiScaleDesktop: 1.0,
        uiScaleMobile: 1.0,
        slotCardMode: "FULL",
        animMul: 1.0,
      };
    }

    const j = JSON.parse(raw);

    const slotCardMode: UiSettings["slotCardMode"] = j.slotCardMode === "NAME_ONLY" ? "NAME_ONLY" : "FULL";

    return {
      uiScaleDesktop: clamp(Number(j.uiScaleDesktop ?? 1.0) || 1.0, 0.75, 1.5),
      uiScaleMobile: clamp(Number(j.uiScaleMobile ?? 1.0) || 1.0, 0.75, 1.5),
      slotCardMode,
      animMul: clamp(Number(j.animMul ?? 1.0) || 1.0, 0.0, 2.0),
    };
  } catch {
    return {
      uiScaleDesktop: 1.0,
      uiScaleMobile: 1.0,
      slotCardMode: "FULL",
      animMul: 1.0,
    };
  }
}

let uiSettings: UiSettings = loadUiSettings();

export function reloadUiSettings() {
  uiSettings = loadUiSettings();
  return uiSettings;
}

export function getUiSettings() {
  return uiSettings;
}

function saveUiSettings() {
  try {
    localStorage.setItem(UISET_KEY, JSON.stringify(uiSettings));
  } catch {}
}

export function getUiScaleNow() {
  const s = uiSettings;
  const userMul = isMobileUiNow() ? s.uiScaleMobile : s.uiScaleDesktop;
  return clamp(userMul, 0.65, 1.5);
}

export function animMulNow() {
  return clamp(Number(uiSettings.animMul ?? 1.0) || 1.0, 0.0, 2.0);
}

export function animMs(ms: number) {
  return Math.max(0, Math.round(ms * animMulNow()));
}

export function applyUiScaleVars() {
  const root = document.documentElement;
  root.style.setProperty("--uiScaleDesktop", String(uiSettings.uiScaleDesktop));
  root.style.setProperty("--uiScaleMobile", String(uiSettings.uiScaleMobile));
  root.style.setProperty("--animMul", String(animMulNow()));
}

export function setUiScaleNow(v: number) {
  const clamped = clamp(v, 0.75, 1.5);
  if (isMobileUiNow()) uiSettings.uiScaleMobile = clamped;
  else uiSettings.uiScaleDesktop = clamped;

  saveUiSettings();
  applyUiScaleVars();
  window.dispatchEvent(new CustomEvent("deckrogue:uiFit"));
}

function mkButton(label: string, onClick: () => void) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function renderSettingsPanel(onChange: () => void, actions: any) {
  void actions;

  const wrap = div("settingsPanel");
  wrap.style.cssText = "display:flex; flex-direction:column; gap:calc(12 * var(--u));";

  const row = div("settingsRow");
  row.style.cssText = "display:flex; align-items:center; gap:calc(12 * var(--u)); flex-wrap:wrap;";

  const label = divText("", "UI 스케일");
  label.style.cssText = "font-weight:800;";

  const getNow = () => (isMobileUiNow() ? uiSettings.uiScaleMobile : uiSettings.uiScaleDesktop);

  const val = divText("", `${Math.round(getNow() * 100)}%`);
  val.style.cssText = "opacity:.9; min-width:calc(64 * var(--u)); text-align:right;";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0.75";
  slider.max = "1.25";
  slider.step = "0.01";
  slider.value = String(getNow());
  slider.style.cssText = "flex:1 1 calc(260 * var(--u));";

  slider.oninput = () => {
    const v = Number(slider.value);
    setUiScaleNow(v);
    val.textContent = `${Math.round(getNow() * 100)}%`;
    onChange();
  };

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(val);
  wrap.appendChild(row);

  const presets = div("settingsPresets");
  presets.style.cssText = "display:flex; gap:calc(8 * var(--u)); flex-wrap:wrap;";

  const makePreset = (txt: string, v: number) => {
    const b = mkButton(txt, () => {
      setUiScaleNow(v);
      slider.value = String(getNow());
      val.textContent = `${Math.round(getNow() * 100)}%`;
      onChange();
    });
    b.style.cssText =
      "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);" +
      "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
    return b;
  };

  presets.appendChild(makePreset("작게 90%", 0.9));
  presets.appendChild(makePreset("기본 100%", 1.0));
  presets.appendChild(makePreset("크게 110%", 1.1));
  presets.appendChild(makePreset("더 크게 120%", 1.2));
  wrap.appendChild(presets);

  const resetRow = div("settingsResetRow");
  resetRow.style.cssText = "display:flex; justify-content:flex-end; margin-top:calc(6 * var(--u));";
  const reset = mkButton("스케일 초기화", () => {
    setUiScaleNow(1.0);
    slider.value = String(getNow());
    val.textContent = `${Math.round(getNow() * 100)}%`;
    onChange();
  });
  reset.style.cssText =
    "padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);" +
    "background:rgba(255,255,255,.06); color:#fff; cursor:pointer;";
  resetRow.appendChild(reset);
  wrap.appendChild(resetRow);

  const modeRow = div("settingsRow");
  modeRow.style.cssText = "display:flex; align-items:center; gap:calc(12 * var(--u)); flex-wrap:wrap;";

  const modeLabel = divText("", "슬롯 카드 표시");
  modeLabel.style.cssText = "font-weight:800;";

  const cur = uiSettings.slotCardMode ?? "FULL";

  const btnFull = mkButton("전체", () => {
    uiSettings.slotCardMode = "FULL";
    saveUiSettings();
    onChange();
  });
  const btnName = mkButton("이름만", () => {
    uiSettings.slotCardMode = "NAME_ONLY";
    saveUiSettings();
    onChange();
  });

  btnFull.style.cssText = `padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);
    background:${cur === "FULL" ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)"}; color:#fff; cursor:pointer;`;
  btnName.style.cssText = `padding:calc(8 * var(--u)) calc(12 * var(--u)); border-radius:calc(12 * var(--u)); border:calc(1 * var(--u)) solid rgba(255,255,255,.16);
    background:${cur === "NAME_ONLY" ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)"}; color:#fff; cursor:pointer;`;

  modeRow.appendChild(modeLabel);
  modeRow.appendChild(btnFull);
  modeRow.appendChild(btnName);
  wrap.appendChild(modeRow);

  return wrap;
}
