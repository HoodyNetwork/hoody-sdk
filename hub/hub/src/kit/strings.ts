// Typed string lookup. Every user-visible string is a key in a
// strings.<lang>.json beside the code that shows it; `t('key', vars)` is typed from that JSON,
// so an unknown key is a compile error.
//
//   {{name}} placeholders; plurals are `key_one` / `key_other`, picked by vars.count through
//   Intl.PluralRules and looked up as t('key', { count }).
import { Fragment, createElement, useMemo, type ReactElement, type ReactNode } from 'react';

export type StringTable = Readonly<Record<string, string>>;
export type StringVars = Readonly<Record<string, string | number>>;

type PluralBase<K extends string> = K extends `${infer B}_one`
  ? B
  : K extends `${infer B}_other`
    ? B
    : K extends `${infer B}_zero` | `${infer B}_two` | `${infer B}_few` | `${infer B}_many`
      ? B
      : K;

/** The keys `t` accepts for a table: every key, with plural suffixes folded into their base. */
export type StringKey<S extends StringTable> = PluralBase<keyof S & string>;

export type Translate<S extends StringTable> = (key: StringKey<S>, vars?: StringVars) => string;

/** The UI locale. English only for now; another locale adds its strings.<lang>.json file. */
export const LOCALE = 'en';

const plural = new Intl.PluralRules(LOCALE);

/** Replace {{name}} placeholders; an unknown placeholder stays visible so it is noticed. */
export function interpolate(text: string, vars?: StringVars): string {
  if (!vars) return text;
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** The template a key resolves to (the plural form when vars.count is a number) and whether its {{x}} slots are filled;
 *  an unknown key resolves to the key itself, unfilled. The one choice `lookup` and `lookupParts` share. */
function templateOf(table: StringTable, key: string, vars?: StringVars | PartVars): { text: string; fill: boolean } {
  const count = vars?.count;
  if (typeof count === 'number') {
    const form = table[`${key}_${plural.select(count)}`] ?? table[`${key}_other`];
    if (form !== undefined) return { text: form, fill: true };
  }
  const text = table[key];
  if (text === undefined) {
    // eslint-disable-next-line no-console -- dev-only hint; production shows the key
    if (import.meta.env.DEV) console.warn(`hub strings: missing key "${key}"`);
    return { text: key, fill: false };
  }
  return { text, fill: true };
}

/** Look a key up, choosing the plural form when vars.count is a number. */
export function lookup(table: StringTable, key: string, vars?: StringVars): string {
  const { text, fill } = templateOf(table, key, vars);
  return fill ? interpolate(text, vars) : text;
}

/** A slot value that is an element (a link, a name in a link) goes in as it is; anything else is text, as `interpolate` makes it. */
export type PartVars = Readonly<Record<string, string | number | ReactElement>>;

/** Like `lookup`, with element values kept as elements: the same template choice and the same text for every other value
 *  (an unknown slot stays visible), returned as the pieces in order with adjacent text joined. */
export function lookupParts(table: StringTable, key: string, vars?: PartVars): Array<string | ReactElement> {
  const { text, fill } = templateOf(table, key, vars);
  if (!fill || !vars) return [text];
  const out: Array<string | ReactElement> = [];
  const put = (piece: string | ReactElement): void => {
    const last = out[out.length - 1];
    if (typeof piece === 'string' && typeof last === 'string') out[out.length - 1] = last + piece;
    else if (typeof piece !== 'string' || piece !== '') out.push(piece);
  };
  let at = 0;
  for (const m of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    put(text.slice(at, m.index));
    const value = vars[m[1] as string];
    put(value === undefined ? m[0] : typeof value === 'object' ? value : String(value));
    at = (m.index ?? 0) + m[0].length;
  }
  put(text.slice(at));
  return out;
}

export function makeT<S extends StringTable>(table: S): Translate<S> {
  return (key, vars) => lookup(table, key, vars);
}

/** `const t = useStrings(strings)` in a component; `strings` is the imported strings.en.json. */
export function useStrings<S extends StringTable>(table: S): Translate<S> {
  return useMemo(() => makeT(table), [table]);
}

/** `const tp = useStringParts(strings)`: `t` for a line that holds a link (a computer's name). It returns the same text as
 *  `t` when no value is an element, and otherwise a fragment of the line's pieces; never string-concatenate around a link. */
export function useStringParts<S extends StringTable>(table: S): (key: StringKey<S>, vars?: PartVars) => ReactNode {
  return useMemo(
    () => (key, vars) => {
      const parts = lookupParts(table, key, vars);
      return parts.every((p) => typeof p === 'string') ? parts.join('') : createElement(Fragment, null, ...parts);
    },
    [table],
  );
}
