type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  onInput?: (event: Event) => void;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  style?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.disabled !== undefined && 'disabled' in el) {
    (el as HTMLButtonElement).disabled = props.disabled;
  }
  if (props.onClick) el.addEventListener('click', props.onClick as EventListener);
  if (props.onInput) el.addEventListener('input', props.onInput);

  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(key, String(value));
    }
  }
  if (props.style) Object.assign(el.style, props.style);

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Same child handling as `h`, for cases where a child may be null.
 * (Element.append would stringify null into the literal text "null".)
 */
export function frag(...children: Child[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    fragment.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return fragment;
}

export function button(label: string, cls: string, onClick: (e: MouseEvent) => void, attrs?: Props['attrs']): HTMLButtonElement {
  return h('button', { class: cls, text: label, onClick, attrs: { type: 'button', ...attrs } });
}

export function card(...children: Child[]): HTMLDivElement {
  return h('div', { class: 'card' }, ...children);
}

export function scoreClass(score: number): string {
  if (score >= 85) return 'good';
  if (score >= 65) return 'ok';
  if (score >= 40) return 'weak';
  return 'bad';
}

export function pct(value01: number): string {
  return `${Math.round(value01 * 100)}%`;
}

export function typed<T extends HTMLElement>(el: Element | null): T {
  if (!el) throw new Error('Expected element to exist');
  return el as T;
}
