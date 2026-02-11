export function shake(el: Element | null) {
  if (!el) return;
  el.classList.remove("shake"); // 재트리거
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  (el as HTMLElement).offsetWidth;
  el.classList.add("shake");
  window.setTimeout(() => el.classList.remove("shake"), 150);
}
