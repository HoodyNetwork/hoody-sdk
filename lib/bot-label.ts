/**
 * The public Bot label rule, shared by every component:
 * plain ASCII a-z, 0-9 and single hyphens, 8–48 bytes, a letter first, a letter or
 * digit last, never two hyphens in a row. The input is checked as given and never
 * repaired: no lowercasing, trimming, Unicode or punycode normalization first.
 * Browser-safe. Maintained in lib/, not generated.
 *
 * A Bot host is `<label>.<zone>`, where the zone is one this module accepts: `hoody.bot`,
 * the Bot zone of a platform the caller names, or a zone the caller names explicitly. It
 * is an allow-list, not "the first label is the label": a client sends a Bot key to the
 * URL's host, so a lookalike host is refused instead of trusted by its shape.
 *
 * Platform zones come from botZoneFor(), a first-match chain with no map literal: production
 * first, then a zone written relative to the platform it is given. A platform with no Bot
 * zone gives none (a unit test checks the answers).
 *
 * The step rules below are the contract's lookahead-free form; the contract's
 * label-vectors.json is the oracle (a unit test runs every vector).
 */

import { DEFAULT_PLATFORM_DOMAIN } from './domain-utils.js';

/** The production Bot zone: production Bot URLs are `https://<label>.hoody.bot`. */
export const BOT_URL_ZONE = 'hoody.bot';

const LOWER_A = 0x61;
const LOWER_Z = 0x7a;
const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;
const HYPHEN = 0x2d;

const isLetter = (c: number): boolean => c >= LOWER_A && c <= LOWER_Z;
const isDigit = (c: number): boolean => c >= DIGIT_0 && c <= DIGIT_9;

/** True when `label` is a valid public Bot label. */
export function isValidBotLabel(label: unknown): label is string {
  if (typeof label !== 'string') return false;
  // Every allowed character is one byte, so a valid label's length in UTF-16 units equals
  // its length in UTF-8 bytes; any other character fails rule 4 below.
  const n = label.length;
  if (n < 8 || n > 48) return false;
  if (!isLetter(label.charCodeAt(0))) return false;
  const last = label.charCodeAt(n - 1);
  if (!isLetter(last) && !isDigit(last)) return false;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const c = label.charCodeAt(i);
    if (!isLetter(c) && !isDigit(c) && c !== HYPHEN) return false;
    if (c === HYPHEN && prev === HYPHEN) return false;
    prev = c;
  }
  return true;
}

const ZONE_PART_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * True when `zone` passes the Bot zone grammar: lowercase ASCII, two or
 * more dot-separated labels of 1–63 bytes (a-z, 0-9 and inner hyphens), the last one
 * holding a letter and not `0x` plus hex digits (so never an IP address, `0x7f.0x1`
 * included), no trailing dot, at most 200 bytes.
 */
export function isValidBotZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length < 1 || zone.length > 200) return false;
  const parts = zone.split('.');
  if (parts.length < 2 || !parts.every((p) => ZONE_PART_RE.test(p))) return false;
  const last = parts[parts.length - 1]!;
  return /[a-z]/.test(last) && !/^0x[0-9a-f]*$/.test(last);
}

/**
 * The Bot zone of a platform domain, or undefined when the platform has
 * none. Kept as a first-match chain, production first, with the second zone written
 * relative to the platform: never turn it into a map or a literal list.
 */
export function botZoneFor(platform: unknown): string | undefined {
  if (platform === 'hoody.com') return BOT_URL_ZONE;
  if (platform === 'hoody.com') return 'bots.' + platform;
  return undefined;
}

/**
 * The zones accepted without an explicit zone: `hoody.bot` plus the Bot zone of
 * `platform`, each once. The default platform is the SDK's own, DEFAULT_PLATFORM_DOMAIN.
 * A platform with no Bot zone of its own accepts `hoody.bot` alone.
 */
export function botUrlZones(platform: unknown = DEFAULT_PLATFORM_DOMAIN): string[] {
  const own = botZoneFor(platform);
  return own === undefined || own === BOT_URL_ZONE ? [BOT_URL_ZONE] : [BOT_URL_ZONE, own];
}

/**
 * The label of a Bot host (`<label>.<zone>`, optionally `:443`) when `host` is exactly
 * that for the given zone, else undefined: the edge's Host rule,
 * compared byte for byte. A zone that fails the grammar matches nothing.
 */
export function botLabelOfHost(host: string, zone: string): string | undefined {
  if (!isValidBotZone(zone)) return undefined;
  const bare = host.endsWith(':443') ? host.slice(0, -4) : host;
  const suffix = `.${zone}`;
  if (!bare.endsWith(suffix)) return undefined;
  const label = bare.slice(0, -suffix.length);
  return isValidBotLabel(label) ? label : undefined;
}

/** Options for botLabelOfUrl. */
export interface BotLabelOfUrlOptions {
  /**
   * The platform domain whose Bot zone is accepted besides `hoody.bot` (for example the
   * domain of the account's API base URL). Default: the SDK's own platform domain. A
   * platform with no Bot zone adds nothing.
   */
  platform?: string;
  /**
   * One more Bot zone to accept (for example a test platform's). It adds to the list and
   * never replaces it; a zone that fails the grammar makes every URL fail.
   */
  zone?: string;
}

/**
 * The label of a public Bot URL as typed (`https://<label>.<zone>`, optionally with
 * `:443` and one trailing `/`, the zone one of botUrlZones(options.platform) or
 * `options.zone`), or undefined when the string is not one. Checked on the raw string:
 * an uppercase host is refused, not lowercased.
 */
export function botLabelOfUrl(url: string, options: BotLabelOfUrlOptions = {}): string | undefined {
  const extra = options.zone;
  if (extra !== undefined && !isValidBotZone(extra)) return undefined;
  const m = /^https:\/\/([a-z0-9.-]+?)(?::443)?\/?$/.exec(url);
  if (!m) return undefined;
  const host = m[1]!;
  // A label never holds a dot, so the zone is everything after the first one.
  const dot = host.indexOf('.');
  if (dot < 0) return undefined;
  const label = host.slice(0, dot);
  const zone = host.slice(dot + 1);
  const zones = options.platform === undefined ? botUrlZones() : botUrlZones(options.platform);
  if (!zones.includes(zone) && zone !== extra) return undefined;
  return isValidBotLabel(label) ? label : undefined;
}
