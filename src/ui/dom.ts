/**
 * Utilidades para crear la interfaz con nodos y textContent (nunca HTML como texto).
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return b;
}

/** Interruptor accesible (botón con aria-pressed). */
export function toggle(
  label: string,
  get: () => boolean,
  set: (v: boolean) => void,
  onText: string,
  offText: string,
): HTMLElement {
  const row = el('div', 'setting-row');
  const name = el('span', 'setting-label', label);
  const b = el('button', 'btn btn-toggle');
  b.type = 'button';
  const refresh = (): void => {
    const v = get();
    b.textContent = v ? onText : offText;
    b.setAttribute('aria-pressed', v ? 'true' : 'false');
  };
  b.setAttribute('aria-label', label);
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    set(!get());
    refresh();
  });
  refresh();
  row.append(name, b);
  return row;
}

/** Control deslizante con su valor visible. */
export function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
  format: (v: number) => string = (v) => String(v),
): HTMLElement {
  const row = el('label', 'setting-row');
  const name = el('span', 'setting-label', label);
  const input = el('input', 'slider');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(get());
  const value = el('span', 'setting-value', format(get()));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    if (!Number.isFinite(v)) return;
    set(Math.min(max, Math.max(min, v)));
    value.textContent = format(get());
  });
  row.append(name, input, value);
  return row;
}

/** Cambia textContent solo si el texto es distinto (el DOM se toca solo cuando cambia un valor). */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setVisible(node: HTMLElement, visible: boolean): void {
  const hidden = !visible;
  if (node.hidden !== hidden) node.hidden = hidden;
}
