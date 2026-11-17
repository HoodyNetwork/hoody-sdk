// The start realm of `hoody hub`. The CLI command
// hands in its flag, environment, profile realm, the alias map read and `idsForAlias`
// (templates/cli/std/realm.ts) with its rules bound. ONE resolver for names: the CLI's; nothing here matches a name.
//
// Order: `--realm` > HOODY_REALM > HOODY_REALM_ID > the profile's saved realm > the realm of the last run (`saved`: the
// launcher's `term.resume`, used only while GET /realms still lists it) > the account's default realm (the `is_default`
// row of GET /realms) > the realm with the most computers (never one with none; a tie goes to the first id) > All
// realms. A 24-hex value is always an id; `global` and `all` are never names.
// An access key pinned to a realm is never widened: any other realm asked for by 1-4 is refused before the mount.

const ID = /^[0-9a-fA-F]{24}$/;
const ALL = new Set(['global', 'all']);

export type RealmSource = 'flag' | 'HOODY_REALM' | 'HOODY_REALM_ID' | 'profile' | 'key' | 'saved' | 'account-default' | 'most-computers' | 'first-run';
/** One realm of GET /realms. `computers`: how many computers it holds (the answer's `usage`, with `include_usage`). */
export interface RealmRow { readonly id: string; readonly name?: unknown; readonly is_default?: unknown; readonly computers?: unknown }

export interface StartRealmInput {
  readonly flag?: string;
  readonly env: { readonly HOODY_REALM?: string; readonly HOODY_REALM_ID?: string };
  readonly profile?: string;
  /** The realm the last run ended in ('all' or an id; the launcher's store, `term.resume`). Anything else is ignored. */
  readonly saved?: string;
  /** An access-key session's own realm (core's tokenRealm()); null for a key on no realm; absent for an account. */
  readonly keyRealm?: string | null;
  /** The account's alias map (vault key `hoody.realm-aliases`, the CLI's loader); `line` is the CLI's refusal. */
  readonly names: () => Promise<{ readonly ok: true; readonly map: Readonly<Record<string, string>> } | { readonly ok: false; readonly line: string }>;
  /** `idsForAlias(map, alias, rules)` with the CLI's rules bound. */
  readonly idsForAlias: (map: Readonly<Record<string, string>>, alias: string) => readonly string[];
  /** GET /realms rows; rejects when there was no usable answer. */
  readonly realms: () => Promise<readonly RealmRow[]>;
}

/** realm 'all' = the web Hub's "All realms". `line` is the first line printed before the alternate screen. */
export type StartRealm =
  | { readonly ok: true; readonly realm: string; readonly source: RealmSource; readonly line: string }
  | { readonly ok: false; readonly exit: 1 | 2; readonly lines: readonly string[] };

/** A typed value as printed: control, separator and bidi characters become `?`, cut at 80 characters (the CLI's rule). */
export function shownRealmValue(value: string): string {
  const safe = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '?');
  const chars = Array.from(safe);
  return chars.length > 80 ? `${chars.slice(0, 80).join('')}…` : safe;
}

const FROM: Record<RealmSource, string> = {
  flag: 'from --realm',
  HOODY_REALM: 'from HOODY_REALM',
  HOODY_REALM_ID: 'from HOODY_REALM_ID',
  profile: "from the CLI's default",
  key: "the access key's own realm",
  saved: 'where you left off',
  'account-default': "the account's default",
  'most-computers': 'the realm with the most computers',
  'first-run': 'no default realm set',
};
const PASS_THE_ID = 'pass the realm id (--realm <24-hex id>)';
const LIST_UNREAD = 'the realm list could not be read';

const lineOf = (shown: string, source: RealmSource): string => `realm ${shown}, ${FROM[source]}`;

export async function resolveStartRealm(i: StartRealmInput): Promise<StartRealm> {
  const asked: [string, RealmSource] | null = (() => {
    const pick: [string | undefined, RealmSource][] = [[i.flag, 'flag'], [i.env.HOODY_REALM, 'HOODY_REALM'], [i.env.HOODY_REALM_ID, 'HOODY_REALM_ID'], [i.profile, 'profile']];
    for (const [v, s] of pick) if (typeof v === 'string' && v.trim() !== '') return [v.trim(), s];
    return null;
  })();
  const keyed = i.keyRealm !== undefined;
  // The key's realm comes from core; a value that is not a realm id is never printed or compared.
  if (keyed && i.keyRealm && !ID.test(i.keyRealm)) return { ok: false, exit: 2, lines: ["error: this access key's realm cannot be read."] };

  if (!asked) {
    if (keyed && i.keyRealm) return { ok: true, realm: i.keyRealm.toLowerCase(), source: 'key', line: lineOf(i.keyRealm.toLowerCase(), 'key') };
    const saved = typeof i.saved === 'string' ? i.saved.trim().toLowerCase() : '';
    // All realms needs no list; a saved realm is used only while the account still lists it (a removed one is skipped).
    if (saved === 'all') return { ok: true, realm: 'all', source: 'saved', line: `All realms, ${FROM.saved}` };
    let rows: readonly RealmRow[];
    // No answer to the list: All realms, and the line says why (a default or a fuller realm may exist; it is not known).
    try { rows = await i.realms(); } catch { return { ok: true, realm: 'all', source: 'first-run', line: `All realms, ${LIST_UNREAD}` }; }
    const listed = rows.filter((r) => r && typeof r.id === 'string' && ID.test(r.id));
    const pick = (r: RealmRow, source: RealmSource): StartRealm => {
      const id = r.id.toLowerCase();
      const name = typeof r.name === 'string' && r.name.trim() ? shownRealmValue(r.name) : id;
      return { ok: true, realm: id, source, line: lineOf(name, source) };
    };
    const last = ID.test(saved) ? listed.find((r) => r.id.toLowerCase() === saved) : undefined;
    if (last) return pick(last, 'saved');
    const def = listed.filter((r) => r.is_default === true);
    if (def.length === 1) return pick(def[0]!, 'account-default');
    const count = (r: RealmRow): number => (typeof r.computers === 'number' && Number.isSafeInteger(r.computers) && r.computers > 0 ? r.computers : 0);
    const fullest = [...listed].sort((a, b) => count(b) - count(a) || (a.id.toLowerCase() < b.id.toLowerCase() ? -1 : 1))[0];
    if (fullest && count(fullest) > 0) return pick(fullest, 'most-computers');
    return { ok: true, realm: 'all', source: 'first-run', line: `All realms, ${FROM['first-run']}` };
  }

  const [value, source] = asked;
  let realm: string, shown: string;
  if (ALL.has(value.toLowerCase())) { realm = 'all'; shown = ''; }
  else if (ID.test(value)) { realm = value.toLowerCase(); shown = realm; }
  else {
    const names = await i.names().catch(() => ({ ok: false as const, line: `error: could not read the realm names; ${PASS_THE_ID}.` }));
    if (!names.ok) return { ok: false, exit: 1, lines: [names.line] };
    const ids = [...new Set(i.idsForAlias(names.map, value).map((x) => x.toLowerCase()))].filter((x) => ID.test(x)).sort();
    if (ids.length === 0) {
      const all = Object.values(names.map).map(shownRealmValue).sort();
      return { ok: false, exit: 1, lines: [`error: no realm is named "${shownRealmValue(value)}".`, all.length ? `Realm names: ${all.join(', ')}` : 'This account has no realm names.'] };
    }
    if (ids.length > 1) {
      return { ok: false, exit: 1, lines: [`error: more than one realm is named "${shownRealmValue(value)}"; ${PASS_THE_ID}:`, ...ids.map((id) => `  ${shownRealmValue(names.map[id] ?? value)}  ${id}`)] };
    }
    realm = ids[0]!;
    shown = shownRealmValue(value);
  }

  if (keyed && i.keyRealm && realm !== i.keyRealm.toLowerCase()) {
    return { ok: false, exit: 2, lines: [`error: this access key is limited to realm ${i.keyRealm.toLowerCase()}.`] };
  }
  return realm === 'all'
    ? { ok: true, realm, source, line: `All realms, ${FROM[source]}` }
    : { ok: true, realm, source, line: lineOf(shown, source) };
}
