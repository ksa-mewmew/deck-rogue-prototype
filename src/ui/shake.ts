const shakeTimers = new WeakMap<Element, number>();

export function shake(el: Element | null) {
  if (!el) return;

  const prev = shakeTimers.get(el);
  if (prev) window.clearTimeout(prev);

  el.classList.remove("shake"); // 재트리거
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  (el as HTMLElement).offsetWidth;
  el.classList.add("shake");

  const t = window.setTimeout(() => el.classList.remove("shake"), 150);
  shakeTimers.set(el, t);
}