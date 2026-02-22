let el: HTMLDivElement | null = null;

export function initSOnlyHud() {
  if (el) return;

  el = document.createElement("div");
  el.id = "hudSOnly";
  el.style.display = "none"; // 기본은 숨김
  document.body.appendChild(el);
}

export function setSOnlyHud(value: number | null | undefined) {
  if (!el) initSOnlyHud();
  if (!el) return;

  if (value == null || Number.isNaN(value)) {
    el.style.display = "none";
    return;
  }
  el.textContent = `🍞 ${value}`;
  el.style.display = "";
}

export function hideSOnlyHud() {
  if (el) el.style.display = "none";
}