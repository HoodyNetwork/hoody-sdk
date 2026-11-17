// A Home web widget as stored, and the rules for what is kept: the per-account+realm list (store.ts) is parsed here,
// failing closed one item at a time.
import { BIDI, checkUrl } from './url';

export type WidgetSize = 's' | 'm' | 'l';
export interface WebWidget {
  /** 8 base36 characters; the card key is `home-web:<id>`. */
  readonly id: string;
  /** The address as typed (url.ts checkUrl). */
  readonly url: string;
  /** The person's name (cleanName); absent: the address's host. */
  readonly name?: string;
  readonly size: WidgetSize;
}
export interface WebWidgets {
  readonly v: 1;
  readonly items: readonly WebWidget[];
}

export const WIDGET_MAX = 12;
export const NAME_MAX = 40;
export const EMPTY: WebWidgets = Object.freeze({ v: 1, items: Object.freeze([]) as readonly WebWidget[] }) as WebWidgets;
export const SIZES: readonly WidgetSize[] = ['s', 'm', 'l'];
const ID = /^[0-9a-z]{8}$/;

/** A name a person typed: white space folded and trimmed; null with a control, separator or direction character, or too
 *  long (NAME_MAX characters as a person counts them: code points, so an emoji is one, not two). */
export function cleanName(raw: string): string | null {
  if (typeof raw !== 'string' || /[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f\u2028\u2029]/.test(raw) || BIDI.test(raw)) return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  return [...s].length > NAME_MAX ? null : s;
}

/** The address's host (lower case, without the port), or ''. */
export function defaultName(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function item(raw: unknown, seen: Set<string>): WebWidget | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = r.id, url = r.url, size = r.size, name = r.name;
  if (typeof id !== 'string' || !ID.test(id) || seen.has(id)) return null;
  // The Hub-origin rule needs the page; a stored address is checked against it again when it is shown (store.ts).
  const ok = typeof url === 'string' ? checkUrl(url, '') : null;
  if (!ok || !('url' in ok) || ok.url !== url) return null;
  if (size !== 's' && size !== 'm' && size !== 'l') return null;
  let clean: string | null = '';
  if (name !== undefined) {
    clean = typeof name === 'string' ? cleanName(name) : null;
    if (clean === null) return null;
  }
  seen.add(id);
  return clean ? { id, url, size, name: clean } : { id, url, size };
}

/** The stored value, cleaned: anything that is not `{v: 1, items: [...]}` is the empty list; a bad item is dropped. */
export function parseWidgets(raw: unknown): WebWidgets {
  try {
    if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) return EMPTY;
    const list = (raw as { items?: unknown }).items;
    if (!Array.isArray(list)) return EMPTY;
    const seen = new Set<string>();
    const items: WebWidget[] = [];
    for (const x of list) {
      if (items.length >= WIDGET_MAX) break;
      const w = item(x, seen);
      if (w) items.push(w);
    }
    return { v: 1, items };
  } catch {
    return EMPTY;
  }
}

/** `now` with the widget `id` added at the end, or null when the list already holds WIDGET_MAX or the id is taken.
 *  url and name are already checked. The id is chosen once per add (addChange), never here. */
export function addTo(now: WebWidgets, id: string, url: string, name: string): WebWidgets | null {
  if (now.items.length >= WIDGET_MAX || now.items.some((x) => x.id === id)) return null;
  const w: WebWidget = { id, url, size: 'm', ...(name && { name }) };
  return { v: 1, items: [...now.items, w] };
}

/**
 * One add as a stored-value change. Core may apply a change again on top of another tab's newer value (usePrefUpdate),
 * so the first application decides: an add it accepted that a later application cannot place (the list filled
 * meanwhile) calls onLost once and changes nothing; an add it refused stays refused even where a later value has room.
 * Every application adds the same id, so a rename, resize or remove made after it still finds the widget.
 */
export function addChange(id: string, url: string, name: string, onLost: () => void): { fn: (now: WebWidgets) => WebWidgets; result: () => 'added' | 'full' | null } {
  let first: 'added' | 'full' | null = null;
  let told = false;
  const fn = (now: WebWidgets): WebWidgets => {
    if (first === 'full') return now;
    const next = addTo(now, id, url, name);
    if (first === null) first = next ? 'added' : 'full';
    else if (!next && !told) {
      told = true;
      onLost();
    }
    return next ?? now;
  };
  return { fn, result: () => first };
}

/** A fresh id not in `taken`. */
export function newId(taken: readonly string[], rand: () => number = secureRandom): string {
  for (;;) {
    let id = '';
    for (let i = 0; i < 8; i++) id += Math.floor(rand() * 36).toString(36);
    if (!taken.includes(id)) return id;
  }
}

function secureRandom(): number {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return (b[0] ?? 0) / 2 ** 32;
}
