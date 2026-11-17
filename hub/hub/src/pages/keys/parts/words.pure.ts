// The keys page's words and small formatters (split out of words.ts so the terminal build shares them; words.ts
// re-exports every name and keeps enterSubmits, which reads the DOM event target).
import type { StringKey, StringVars } from '@kit';
import strings from '../strings.en.json';
import { errKey, refusedKey } from '../logic';
import type { Key, Realm } from '../types';

export type Str = typeof strings;
export type K = StringKey<Str>;
export type T = (key: K, vars?: StringVars) => string;

const has = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(strings, key);

/** The words for a dynamic key, or null when the strings have none. */
export function maybe(t: T, key: string, vars?: StringVars): string | null {
  return has(key) ? t(key as K, vars) : null;
}

export function rightName(t: T, path: string): string {
  return maybe(t, `right.${path}`) ?? path;
}

export function groupName(t: T, g: string): string {
  return maybe(t, `group.${g}`) ?? g;
}

export function tmplName(t: T, n: string): string {
  return maybe(t, `tmpl.${n}`) ?? n;
}

/** "12 of 40 rights", "Full", a template name or "Unknown". */
export function accessText(t: T, k: Pick<Key, "access">): string {
  const a = k.access;
  if (!a) return t("access.unknown");
  if (a.full) return t("access.full");
  const some = t("access.some", { n: a.n, of: a.of });
  return a.tmpl ? tmplName(t, a.tmpl) : some;
}

/** The label of an Access filter value (see accessLabel). */
export function accessChoice(t: T, v: string): string {
  if (v === "full") return t("access.full");
  if (v === "unknown") return t("access.unknown");
  if (v.startsWith("tmpl:")) return tmplName(t, v.slice(5));
  const m = /^(\d+)\/(\d+)$/.exec(v);
  return m ? t("access.some", { n: Number(m[1]), of: Number(m[2]) }) : v;
}

export function realmName(
  realms: readonly Realm[] | undefined,
  id: string,
): string {
  return (
    realms?.find((r) => r.id === id)?.name ??
    `${id.slice(0, 4)}…${id.slice(-4)}`
  );
}

export function worksText(
  t: T,
  k: Pick<Key, "allRealms" | "realms" | "noRealm">,
  realms: readonly Realm[] | undefined,
): string {
  if (k.allRealms) return t("allRealms");
  return k.realms.map((r) => realmName(realms, r)).join(", ");
}

/** A refusal or server code as words (what: the thing the change was for). */
export function outcomeText(
  t: T,
  o: { outcome: string; code?: string },
  what: string,
  mint: boolean,
): string {
  if (o.outcome === "pending") return t("out.pending", { what });
  if (o.outcome === "not_sent")
    return t(`out.refused.${refusedKey(o.code)}` as K, { what });
  if (o.outcome === "stale") return t("out.refused.other", { what });
  const e = errKey(o.code, mint);
  return t(`out.err.${e}` as K, { what });
}

/**
 * The outcome of "Delete it and make another" on a key made without a secret: the key exists, so a failure is a
 * delete that did not happen, never a key that was not made.
 */
export function deleteMadeText(t: T, o: { outcome: string; code?: string }, what: string): string {
  if (o.outcome !== "pending" && o.outcome !== "not_sent" && o.outcome !== "stale" && errKey(o.code, false) === "other")
    return t("ns.deleteFailed", { what });
  return outcomeText(t, o, what, false);
}

/**
 * What the Stop sharing confirm may name: a share that reaches several realms, or every realm, is stopped everywhere at
 * once (wide); a one-realm share names its realm only by a real, non-blank alias (never a short id or a fallback).
 */
export function stopScope(
  realms: readonly Realm[] | undefined,
  row: { realm: string; raw: { realm_ids?: unknown } },
): { wide: boolean; alias: string | null } {
  const ids = row.raw.realm_ids;
  if (!Array.isArray(ids) || ids.length !== 1) return { wide: true, alias: null };
  const r = realms?.find((x) => x.id === row.realm);
  const alias = r?.named ? r.name.trim() : "";
  return { wide: false, alias: alias || null };
}

/** UTC calendar day: "18 Jan 2027". */
export function dayUtc(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(ms);
}

export function localTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(ms);
}

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean };
}

/** The key press confirms an input method's composition (229: the code browsers give while composing). */
export const composing = (e: KeyLike): boolean => !!e.nativeEvent?.isComposing || e.keyCode === 229;
