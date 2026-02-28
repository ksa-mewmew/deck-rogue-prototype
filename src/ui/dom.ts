export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function div(className?: string, text?: string) {
  return el("div", className, text);
}

export function divText(className: string, text: string) {
  return div(className, text);
}

export function span(className?: string, text?: string) {
  return el("span", className, text);
}

export function h2(text: string, className?: string) {
  return el("h2", className, text);
}

export function h3(text: string, className?: string) {
  return el("h3", className, text);
}

export function p(text: string, className?: string) {
  return el("p", className, text);
}

export function button(text: string, onClick: () => void, disabled = false, className = "uiBtn") {
  const b = el("button", className, text);
  b.type = "button";
  b.disabled = !!disabled;
  b.onclick = () => onClick();
  return b;
}

export function img(src: string, className?: string, alt = "") {
  const i = el("img", className) as HTMLImageElement;
  i.src = src;
  i.alt = alt;
  return i;
}

export function clearChildren(node: Element) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function badge(text: string) {
  return span("badge", text);
}

export function mkButton(label: string, onClick: () => void, arg?: string | boolean) {
  const b = el("button", undefined, label) as HTMLButtonElement;
  if (typeof arg === "string" && arg) b.className = arg;
  if (typeof arg === "boolean") b.disabled = arg;
  b.type = "button";
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function logBox(text: string) {
  const pre = el("pre", "logBox", text);
  return pre;
}

export function hr() {
  return document.createElement("hr");
}

export function chipEl(text: string, extraClass = "") {
  const s = el("span", "chip" + (extraClass ? ` ${extraClass}` : ""), text);
  return s;
}
