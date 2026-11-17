// Jump to's matcher: every typed word must find a word of the entry, by its start (prefix), by a
// synonym, or with a typo. Text is folded first (accents and case off), so "Pässcode" finds "passcode". Ranking puts an
// exact label first, then a label that starts with the query, then label words, then the place a setting or answer is in,
// then the help and answer words; a page beats a section, a section a setting, a setting a tab, a tab a FAQ question.
// Entries are prepared once (prepare); a keystroke only scans their word lists.

/** NFKD, marks dropped, lowercase: the same fold as hub/scripts/search-index-gen.ts. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

export function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** Words a person may type for the same thing. Each group is matched both ways. Keep it short: a wrong synonym floods. */
const GROUPS: readonly (readonly string[])[] = [
  ['passcode', 'pin', 'lock', 'unlock'],
  ['key', 'token', 'secret', 'credential'],
  ['password', 'passphrase'],
  ['signin', 'login', 'logon'],
  ['signout', 'logout', 'logoff'],
  ['computer', 'server', 'machine', 'vm', 'container'],
  ['delete', 'remove', 'erase', 'wipe'],
  ['bill', 'billing', 'invoice', 'payment', 'pay', 'wallet', 'funds', 'money'],
  ['twofa', '2fa', 'mfa', 'otp', 'authenticator'],
  ['notification', 'notifications', 'alert', 'alerts', 'notify'],
  ['ssh', 'shell', 'terminal'],
  ['ai', 'model', 'llm'],
  ['schedule', 'schedules', 'cron', 'timer'],
  ['faq', 'help', 'question'],
  ['session', 'sessions', 'device', 'devices'],
  ['email', 'mail'],
];

const SYN = new Map<string, readonly string[]>();
for (const g of GROUPS) for (const w of g) SYN.set(w, [...(SYN.get(w) ?? []), ...g.filter((x) => x !== w)]);

/** Two words that join to one the table knows ("sign in" → signin, "2 fa" stays two words). A query is scored both ways,
 *  and an entry holds its joined pairs beside its own words, so "sign in", "signin" and "login" all find Sign-in sessions. */
function joined(q: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < q.length; i++) {
    const pair = q[i]! + (q[i + 1] ?? '');
    if (i + 1 < q.length && SYN.has(pair)) {
      out.push(pair);
      i++;
    } else out.push(q[i]!);
  }
  return out;
}

/** Edit distance with one transposition counted as one, given up past `max` (null). */
export function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return false;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length]! <= max;
}

/** How many typos a typed word may carry: none under 4 letters, one up to 7, two from 8. */
const typos = (w: string): number => (w.length < 4 ? 0 : w.length < 8 ? 1 : 2);

export type SearchKind = 'page' | 'command' | 'section' | 'setting' | 'tab' | 'faq';

/** Lower ranks first among equal matches. */
const KIND_RANK: Readonly<Record<SearchKind, number>> = { page: 0, command: 1, section: 2, setting: 3, tab: 4, faq: 5 };

export interface Searchable {
  kind: SearchKind;
  label: string;
  /** Words a match on counts like the label's (a page id, command keywords). */
  keywords?: string;
  /** The place the entry is in (its section's title): a match there counts less. */
  under?: string;
  /** Help and answer words: a match there counts least. */
  body?: string;
}

/** The words plus each adjacent pair that joins to a table word (Sign-in → sign, in, signin). */
function withJoined(list: readonly string[]): string[] {
  const out = [...list];
  for (let i = 0; i + 1 < list.length; i++) if (SYN.has(list[i]! + list[i + 1]!)) out.push(list[i]! + list[i + 1]!);
  return out;
}

export interface Prepared<T extends Searchable> {
  item: T;
  label: string;
  labelWords: readonly string[];
  underWords: readonly string[];
  bodyWords: readonly string[];
}

export function prepare<T extends Searchable>(item: T): Prepared<T> {
  return {
    item,
    label: words(item.label).join(' '),
    labelWords: withJoined([...words(item.label), ...words(item.keywords ?? '')]),
    underWords: withJoined(words(item.under ?? '')),
    bodyWords: withJoined(words(item.body ?? '')),
  };
}

/** How well one typed word matches a list: 3 whole word, 2 start of a word, 1 a synonym or a typo, 0 not at all.
 *  `whole`: only a whole word or a synonym counts (a short word of a query that also joins, so "in" of "sign in" never
 *  matches "into" or "invite" on its own). */
function wordScore(q: string, list: readonly string[], whole = false): number {
  let best = 0;
  const syn = SYN.get(q) ?? [];
  const max = typos(q);
  for (const w of list) {
    if (w === q) return 3;
    if (w.startsWith(q)) {
      if (!whole) best = 2;
    }
    else if (best < 1 && (syn.some((x) => w === x || (x.length >= 3 && w.startsWith(x))) || (max > 0 && (within(q, w, max) || (w.length > q.length && within(q, w.slice(0, q.length), max)))))) best = 1;
  }
  return best;
}

/** The entry's score for the typed text, 0 when some typed word matches nothing. */
export function score(p: Prepared<Searchable>, query: string): number {
  const typed = words(query);
  const both = joined(typed);
  if (both.length === typed.length) return scoreWords(p, typed, false);
  return Math.max(scoreWords(p, typed, true), scoreWords(p, both, false));
}

function scoreWords(p: Prepared<Searchable>, q: readonly string[], strictShort: boolean): number {
  if (q.length === 0) return 0;
  const whole = q.join(' ');
  let total = 0;
  for (const w of q) {
    const l = wordScore(w, p.labelWords, strictShort && w.length < 3);
    if (l > 0) {
      total += 100 * l;
      continue;
    }
    const u = wordScore(w, p.underWords, strictShort && w.length < 3);
    if (u > 0) {
      total += 30 * u;
      continue;
    }
    const b = wordScore(w, p.bodyWords, strictShort && w.length < 3);
    if (b === 0) return 0;
    total += 10 * b;
  }
  if (p.label === whole) total += 1000;
  else if (p.label.startsWith(whole)) total += 500;
  // Then by kind, then fewer label words for the same match: the closer name ("Password" before "Ask for a password
  // reset"). Never below 1: a match always counts (the least is 10 points, so 1000 here).
  return total * 100 - KIND_RANK[p.item.kind] * 10 - Math.min(p.labelWords.length, 9);
}

/** The entries that match, best first (equal scores keep their order), at most `limit`. */
export function search<T extends Searchable>(entries: readonly Prepared<T>[], query: string, limit = 50): T[] {
  const hits: Array<{ s: number; i: number; item: T }> = [];
  entries.forEach((p, i) => {
    const s = score(p, query);
    if (s > 0) hits.push({ s, i, item: p.item });
  });
  hits.sort((a, b) => b.s - a.s || a.i - b.i);
  return hits.slice(0, limit).map((h) => h.item);
}
