// The questions a new account is asked while it waits: what this page has words for, which of them the account still
// has to see, and the rules of a pick. Pure: the reads and the send are in ask.ts.
//
// The API owns the keys (question, version, options, how many picks); this page owns the words. A question shows only
// when the API lists it at the version this page has words for and the account has no stored answer or skip for it.
// Anything else (an unknown key, another version, an answer this page cannot read) shows nothing.

/** A question this page has words for: strings `q.<key>.v<version>.title` and `.o.<option>`. */
interface Worded {
  readonly key: string;
  readonly version: number;
  readonly options: readonly string[];
  /** The options are shown in a new order each time, so the first one is not picked for being first. */
  readonly shuffle?: true;
}

export const WORDED = [
  { key: 'first_goal', version: 1, options: ['ai_agents', 'dev_env', 'host_app', 'browser', 'files', 'automation', 'learn', 'other'], shuffle: true },
  { key: 'main_users', version: 1, options: ['me', 'team', 'customers', 'ai_agents'] },
  { key: 'found_via', version: 1, options: ['search', 'github', 'x', 'reddit', 'hacker_news', 'youtube', 'friend', 'ai_assistant', 'newsletter_blog', 'other'] },
  { key: 'ai_access', version: 1, options: ['claude_sub', 'chatgpt_sub', 'gemini', 'copilot', 'cursor', 'api_key', 'none', 'other'] },
] as const satisfies readonly Worded[];

export type QuestionKey = (typeof WORDED)[number]['key'];

export interface Question {
  readonly key: QuestionKey;
  readonly version: number;
  /** The options to show, in the API's order: those the API lists that this page has words for. */
  readonly options: readonly string[];
  /** How many may be picked. 1 is a single choice. */
  readonly max: number;
  /** Options that stand alone: picking one clears the rest, picking another clears it. */
  readonly exclusive: readonly string[];
  readonly shuffle: boolean;
}

const strs = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

/**
 * The questions still to show, in this page's order, from the answers read. null when the answer cannot be read as
 * the route's shape: then nothing is shown.
 */
export function openQuestions(data: unknown): Question[] | null {
  if (!data || typeof data !== 'object') return null;
  const { questions, answers } = data as { questions?: unknown; answers?: unknown };
  if (!Array.isArray(questions) || !Array.isArray(answers)) return null;
  const stored = new Set<string>();
  for (const a of answers) {
    const key = a && typeof a === 'object' ? (a as { question?: unknown }).question : undefined;
    if (typeof key !== 'string') return null;
    stored.add(key);
  }
  const out: Question[] = [];
  for (const w of WORDED) {
    const q = questions.find((x) => x && typeof x === 'object' && (x as { key?: unknown }).key === w.key) as { version?: unknown; max_picks?: unknown; options?: unknown; exclusive?: unknown } | undefined;
    if (!q || q.version !== w.version || stored.has(w.key)) continue;
    const listed = strs(q.options);
    const max = q.max_picks;
    if (!listed || typeof max !== 'number' || !Number.isInteger(max) || max < 1) continue;
    const worded: readonly string[] = w.options;
    const options = listed.filter((o, i) => worded.includes(o) && listed.indexOf(o) === i);
    if (options.length < 2) continue;
    const exclusive = (strs(q.exclusive) ?? []).filter((o) => options.includes(o));
    out.push({ key: w.key, version: w.version, options, max: Math.min(max, options.length), exclusive, shuffle: 'shuffle' in w });
  }
  return out;
}

/** The options in a new order (Fisher-Yates over `random`), with "other" kept last. */
export function shuffled(options: readonly string[], random: () => number = Math.random): string[] {
  const rest = options.filter((o) => o !== 'other');
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return options.includes('other') ? [...rest, 'other'] : rest;
}

/** The picks after the person sets them to `next` (a multiple choice): an option that stands alone clears the rest,
 *  any other clears it, and a pick over the limit is not taken. */
export function pick(q: Question, before: readonly string[], next: readonly string[]): string[] {
  const added = next.filter((o) => !before.includes(o) && q.options.includes(o));
  const kept = next.filter((o) => before.includes(o));
  const alone = added.find((o) => q.exclusive.includes(o));
  if (alone) return [alone];
  const open = kept.filter((o) => !added.length || !q.exclusive.includes(o));
  return [...open, ...added].slice(0, Math.max(q.max, open.length));
}

/** Whether `option` can still be picked: it is picked already, or the limit leaves room (an option that stands alone
 *  always can, and so can any option while one that stands alone is the only pick: it replaces it). */
export function canPick(q: Question, picked: readonly string[], option: string): boolean {
  if (picked.includes(option) || q.exclusive.includes(option)) return true;
  return picked.filter((o) => !q.exclusive.includes(o)).length < q.max;
}

/** The picks as sent: in the order the options are listed, whatever order they were pressed in. */
export const asSent = (q: Question, picked: readonly string[]): string[] => q.options.filter((o) => picked.includes(o));

export type Suggestion = 'claude' | 'accounts' | 'key' | 'allowance';

/** What the AI tools the person already has suggest doing next (their own pick, read here: nothing is asked back). */
export function suggestionOf(picked: readonly string[]): Suggestion | null {
  if (picked.includes('claude_sub')) return 'claude';
  if (picked.includes('chatgpt_sub')) return 'accounts';
  if (picked.includes('api_key')) return 'key';
  if (picked.includes('none')) return 'allowance';
  return null;
}
