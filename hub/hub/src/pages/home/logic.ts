// Pure functions of the home page (no React, no I/O): easy to unit-test.
import { computerState, type ComputerState } from '@core';
import type { Overview, SetupKind } from './data';

/** Setup states poll for a new computer every POLL_MS, at most POLLS times, then say they stalled. */
export const POLL_MS = 5000;

/** The page key that opens Customize (registered in view.tsx, shown on the Shortcuts card). */
export const CUSTOMIZE_KEY = 'c';
export const POLLS = 36;

// ── First steps: milestones Home can see, and suggestions it cannot ─────────────────────────────

/** A milestone is ticked only from a fact Home reads; everything else is a "Try next" suggestion with no tick. */
export type MilestoneId = 'computer' | 'key';
const MILESTONES: readonly MilestoneId[] = ['computer', 'key'];

/** A fact is true, false, or null while it is unknown (a failed read is "unknown", never "none"). */
export type Fact = boolean | null;
export type Facts = Readonly<Record<MilestoneId, Fact>>;

/** A fact seen true stays true, so a tick never flickers off when a later read fails. */
export function latchFacts(previous: Facts, next: Facts): Facts {
  const out = { ...next };
  for (const id of MILESTONES) if (previous[id] === true) out[id] = true;
  return out;
}

export interface Step {
  id: MilestoneId;
  done: boolean;
  unknown: boolean;
  /** Unknown because its read failed (not because it is still being read). */
  failed?: boolean;
}

export function stepsFrom(facts: Facts, failed?: Partial<Record<MilestoneId, boolean>>): Step[] {
  return MILESTONES.map((id) => ({ id, done: facts[id] === true, unknown: facts[id] === null, ...(facts[id] === null && failed?.[id] ? { failed: true } : {}) }));
}

function doneCount(steps: readonly Step[]): number {
  return steps.filter((s) => s.done).length;
}

/** "{done} of {total}" only when every milestone is known: an unknown one never shrinks the count into "all done". */
export function progressOf(steps: readonly Step[]): { done: number; total: number } | null {
  return steps.some((s) => s.unknown) ? null : { done: doneCount(steps), total: steps.length };
}

/** Every milestone is known to be done. */
export function allDone(steps: readonly Step[]): boolean {
  return steps.every((s) => s.done);
}

/** Suggestions with a real destination and no tick (Home cannot see whether they were done). */
export type TryId = 'open' | 'bot';
export function trySteps(o: { hasComputer: boolean }): TryId[] {
  return [...(o.hasComputer ? (['open'] as const) : []), 'bot'];
}

// ── Greeting and modes ───────────────────────────────────────────────────────────────────────

export type GreetingKey = 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening';

export function greetingKey(hour: number): GreetingKey {
  if (hour >= 5 && hour < 12) return 'greeting.morning';
  if (hour >= 12 && hour < 18) return 'greeting.afternoon';
  return 'greeting.evening';
}

/**
 * The page title. A newcomer (setup, or the first-run view of the computer Home saw being made) is welcomed by name:
 * short enough for a phone, and Open names the computer. An expired account (its server ended or was reinstalled) is a
 * returning one and gets the ordinary greeting.
 */
export function titleOf(o: { mode: HomeMode | undefined; setup?: string; firstRun: boolean; userName?: string; computerName?: string; computerRunning?: boolean; hour: number }): { key: 'greeting.setupNamed' | 'greeting.setup' | 'ready.title' | 'greeting.named' | GreetingKey; params?: Record<string, string> } {
  const returning = o.setup === 'expired' || o.setup === 'reinstalled';
  const newcomer = (o.mode === 'setup' && !returning) || o.firstRun;
  if (newcomer && o.userName) return { key: 'greeting.setupNamed', params: { name: o.userName } };
  if (o.mode === 'setup' && !returning) return { key: 'greeting.setup' };
  // "is ready" only for a computer read as running: one still starting is never announced as ready.
  if (o.firstRun && o.computerName && o.computerRunning) return { key: 'ready.title', params: { name: o.computerName } };
  return o.userName ? { key: 'greeting.named', params: { name: o.userName } } : { key: greetingKey(o.hour) };
}

export type HomeMode = 'shared-empty' | 'setup' | 'empty-realm' | 'pick-one' | 'ready';

/** What the dashboard shows, from the computer list alone. */
export function homeMode(ov: Overview): HomeMode {
  if (ov.computers.length === 0) {
    // Page 1 of a longer account-wide list held none of this realm's rows: that is not "empty", so offer the chooser
    // (its link opens Computers, which pages).
    if (!ov.listWhole) return 'pick-one';
    if (ov.shared) return 'shared-empty';
    if (ov.accountEmpty) return 'setup';
    return 'empty-realm';
  }
  if (!ov.pickedId || !ov.computers.some((c) => c.id === ov.pickedId)) return 'pick-one';
  return 'ready';
}

/** True while a provisioning setup should be read again. */
export function shouldPoll(kind: SetupKind | undefined, polls: number): boolean {
  return kind === 'provisioning' && polls < POLLS;
}

/** A provisioning setup that has used up its polls is shown as stalled. */
export function effectiveSetup(kind: SetupKind, polls: number): SetupKind {
  return kind === 'provisioning' && polls >= POLLS ? 'stalled' : kind;
}

// ── Welcome (onboarding): observed, dismissed, re-opened ──────────────────────────────────────

/** The setup states of a new account getting its first computer. An expired trial is an old account. */
const FIRST_RUN: readonly SetupKind[] = ['provisioning', 'stalled', 'invite', 'inviteFailed', 'capacity', 'mailbox'];

/**
 * The account is being onboarded only when Home saw its initial setup (no computer yet, a first-run setup state as
 * the server answered it: never the 'provisioning' shown while the setup read is pending or failed).
 * Nothing is guessed from a computer's age: a new realm, a replaced computer or a return after sign-out are not a new
 * account. An account Home never saw in setup keeps the explicit "What is Hoody?" entry.
 */
export function observesOnboarding(o: { mode: HomeMode; setup: SetupKind | undefined; shared: boolean }): boolean {
  return !o.shared && o.mode === 'setup' && !!o.setup && FIRST_RUN.includes(o.setup);
}

/**
 * The Welcome panel (value line, Open, how it fits together, first steps) shows for an account session on a
 * computer-ready mode while onboarding and not hidden, or while asked for (?intro=1). Setup shows its own
 * "how it fits together" under the setup panel instead.
 */
export function welcomeVisible(o: { account: boolean; mode: HomeMode; onboarding: boolean; introHidden: boolean; asked: boolean }): boolean {
  if (!o.account || o.mode === 'setup' || o.mode === 'shared-empty') return false;
  return o.asked || (o.onboarding && !o.introHidden);
}

/** A list status that says a computer is being made and has not run yet. Starting and restarting are not: an old
 *  account's stopped computer passes through them too. */
export function beingMade(status: unknown): boolean {
  const v = typeof status === 'string' ? status.toLowerCase() : '';
  return v === 'creating' || v === 'claiming' || v === 'copying' || v === 'provisioning' || v === 'pending';
}

/** A computer's state bucket as Home words it: one still being made is starting (as the Computers page and its card
 *  say), never one that "needs a look". */
export function homeState(status: unknown): ComputerState {
  return beingMade(status) ? 'starting' : computerState(status);
}

/** The context line's word and dot for the shown computer's state: each state has its own word; only a computer read
 *  as stopped is called stopped. */
export function contextState(state: ComputerState): { key: `context.${ComputerState}`; tone: 'ok' | 'neutral' | 'info' | 'warn' } {
  return { key: `context.${state}`, tone: state === 'running' ? 'ok' : state === 'starting' ? 'info' : state === 'attention' ? 'warn' : 'neutral' };
}

/**
 * Home opens the tour by itself once, and only on what it read: an account session in the All-realms view whose whole
 * list is one computer still being made (a new account's first computer; never a first computer of a realm: a
 * single-realm view cannot prove the account has no other computer). "Once" is the stored flag `toured` in Home's
 * prefs, which sign-out purges: once per sign-in in this browser. Decided only once those prefs are read (`prefsRead`):
 * while the store opens they read as defaults, and the hand-over and the offer happen once.
 * Nothing is guessed from age; an account whose computer already runs keeps the explicit ways in (the Welcome's link,
 * the command menu). Seeing that first computer being made is also Home seeing the account onboarded: the Welcome
 * shows when the person comes back.
 */
export function opensTour(o: { prefsRead: boolean; shared: boolean; toured: boolean; firstMaking: boolean }): boolean {
  return o.prefsRead && !o.shared && !o.toured && o.firstMaking;
}

/**
 * An account Home never opened the tour for, whose one computer already runs on this load (it was ready before Home
 * could see it being made): no redirect, the Welcome shows once with the tour as its marked way in. Never for an
 * account that hid the Welcome: its Hide stands.
 */
export function offersTour(o: { prefsRead: boolean; shared: boolean; toured: boolean; introHidden: boolean; firstRunning: boolean }): boolean {
  return o.prefsRead && !o.shared && !o.toured && !o.introHidden && o.firstRunning;
}

/** The setup panel's teaching title: waiting only makes sense while provisioning runs. */
export function fitsTitleKey(kind: SetupKind): 'intro.setupTitle' | 'intro.title' {
  return kind === 'provisioning' ? 'intro.setupTitle' : 'intro.title';
}

// ── Needs you: only things Home has seen, never an all-clear ───────────────────────────────────

export type NeedKey = 'bots' | 'computers' | 'changes' | 'more' | `held:${string}`;
export interface NeedItem {
  key: NeedKey;
  count: number;
  /** The one computer's name when exactly one needs a look. */
  name?: string;
  /** The computer's link handle when exactly one needs a look. */
  handle?: string;
  /** A held change's line: what it is and where it is checked ('held:' items, and 'more' for the first one not shown). */
  held?: HeldLine;
  /** realm: counted in the shown realm; account: the whole account in this browser. */
  scope: 'realm' | 'account';
  /** Always a warning: "needs a look" covers unknown statuses too, so it is never the red of a known failure. */
  tone: 'warn';
}

/** One held change (sent, outcome not known) as Home names it: a script save, a change of a known page, another Scripts
 *  change (`look`: no page lists it to check, so it says where to look and gets no Check), or one whose page is not known.
 *  `href` is where its sender page checks it (null: no page to send the person to). */
export interface HeldLine {
  id: string;
  kind: 'script' | 'page' | 'look' | 'unknown';
  /** The script's path inside its folder (kind 'script'). */
  path?: string;
  /** The computer's name, from Home's own computers list (never an id); absent when the list does not hold it. */
  computer?: string;
  /** The sender page's id (kind 'page' and 'look'). */
  page?: string;
  href: string | null;
}

/** One unresolved change as Home reads it (core changesOverview, or an attempt hold mapped to the same facts). */
export interface UnresolvedInput {
  /** Opaque and stable for this one send (core's ChangeOverview.ref, or an attempt's own): the line's id and list key, so a
   *  line never takes over another hold's key when one before it resolves. */
  ref: string;
  base: string | null;
  page: string | null;
  identity: unknown;
  target: unknown;
  at: number;
  /** Sent, its outcome not known; false: its send is out now. */
  held: boolean;
}

/** The scripts write definition's base (scripts data.ts `write`, a coreSource change): its identity is { path, opId }. */
export const SCRIPT_WRITE_BASE = 's:scripts:write';
/** How many held lines the strip shows; the rest are one "more" line. */
export const HELD_SHOWN = 3;

// core's ChangeTarget names the computer `container` (the store writes it as `computer`; core reads it back as `container`).
const computerIdOf = (target: unknown): string | null => {
  const c = target && typeof target === 'object' ? (target as { container?: unknown }).container : null;
  const id = c && typeof c === 'object' ? (c as { id?: unknown }).id : null;
  return typeof id === 'string' && id ? id : null;
};

/**
 * Names one held change. A script save names its path and computer and links to that script on Scripts (scriptHref:
 * scripts links.script; null when it can't select it, then the Scripts page itself). Any other Scripts change (a template
 * deploy, a restore, comments, env, tests, a delete, a run) is a `look` line with no link: /scripts lists only held script
 * saves (HeldWrites), so a Check there would find nothing to check. A script save that names no path
 * links to /scripts, which lists it with its Stop tracking. Another page's change links to that page (its Check lives
 * there). A change whose page is not known gets no link. The computer's name comes only from
 * `computers` (Home's list, by id); an id is never shown. `n` tells apart two changes of one base sent at the same time
 * (0 for the first), so a line keeps its key while the ones before it resolve.
 */
export function heldLine(
  u: UnresolvedInput,
  computers: readonly { id: string; name: string; handle: string }[],
  scriptHref: (handle: string, rootRel: string) => string | null,
): HeldLine {
  const id = u.ref;
  const cid = computerIdOf(u.target);
  const comp = cid ? computers.find((c) => c.id === cid) : undefined;
  const named = comp ? { computer: comp.name } : {};
  const ident = u.identity && typeof u.identity === 'object' ? (u.identity as { path?: unknown }) : {};
  if (u.base === SCRIPT_WRITE_BASE && typeof ident.path === 'string') {
    // Shown as the Scripts list names it: inside its folder (`default/1/a/b.ts` → `a/b.ts`).
    const path = ident.path.replace(/^default\/[1-9][0-9]{0,3}\//, '') || ident.path;
    return { id, kind: 'script', path, ...named, href: (comp ? scriptHref(comp.handle, ident.path) : null) ?? '/scripts' };
  }
  if (u.page === 'scripts' && u.base !== SCRIPT_WRITE_BASE) return { id, kind: 'look', page: u.page, ...named, href: null };
  if (u.page) return { id, kind: 'page', page: u.page, ...named, href: '/' + u.page };
  return { id, kind: 'unknown', href: null };
}

/** The Scripts sends that only ask the computer something and change nothing (scripts/data.ts, `proves: NOTHING_CHANGED`):
 *  the code check, the address lookup, the three comments checks and the op settle. A held one is a question whose answer
 *  was lost, never a change, and core frees it at its next read-back, so Home names no line for it, held or being sent
 *  (a false "a change was made" is worse than a list to keep). needs.held.test.tsx pins this list to
 *  data.ts, so a new question there cannot drift. */
export const SCRIPT_QUESTION_BASES: ReadonlySet<string> = new Set([
  's:scripts:validate',
  's:scripts:resolve',
  's:scripts:commentsCheck',
  's:scripts:commentsParse',
  's:scripts:commentsPrint',
  's:scripts:settle',
]);

/** Home's held lines (oldest first, as `rows`) and how many sends are out now, read-only questions left out. */
export function unresolvedLines(
  rows: readonly UnresolvedInput[],
  computers: readonly { id: string; name: string; handle: string }[],
  scriptHref: (handle: string, rootRel: string) => string | null,
): { held: HeldLine[]; sending: number } {
  const changes = rows.filter((r) => r.base === null || !SCRIPT_QUESTION_BASES.has(r.base));
  const held = changes.filter((r) => r.held).map((r) => heldLine(r, computers, scriptHref));
  return { held, sending: changes.length - held.length };
}

/**
 * Where focus goes when the focused item `gone` leaves the list: the first surviving item after it in the old order,
 * else the nearest surviving one before it, else none.
 */
export function survivorAfter(oldOrder: readonly string[], gone: string, now: readonly string[]): string | undefined {
  const at = oldOrder.indexOf(gone);
  const alive = (k: string) => now.includes(k);
  return oldOrder.slice(at + 1).find(alive) ?? [...oldOrder.slice(0, Math.max(at, 0))].reverse().find(alive);
}

export interface NeedsInput {
  /** Bots of the shown realm waiting for a person, as the shell last read them; undefined = not known. */
  botsWaiting: number | undefined;
  /** The shown realm's computers with their state bucket. */
  computers: readonly { name: string; handle: string; state: ComputerState }[];
  /** Changes and attempts of this account held (sent, outcome not known), named, oldest first. */
  held: readonly HeldLine[];
  /** Changes and attempts of this account whose send is out now. */
  sending: number;
}

/**
 * What needs the person, from reads already made. Only positive observations become items: a count that is 0 or
 * not known adds nothing, and there is no "nothing needs you" item (a partial or stale read can say 0). Each held
 * change is its own line, up to HELD_SHOWN; the rest are one "more" line that links to the first of them.
 */
export function needsItems(i: NeedsInput): NeedItem[] {
  const out: NeedItem[] = [];
  const look = i.computers.filter((c) => c.state === 'attention');
  if (look.length > 0) {
    const one = look.length === 1 ? look[0] : undefined;
    out.push({ key: 'computers', count: look.length, scope: 'realm', tone: 'warn', ...(one ? { name: one.name, handle: one.handle } : {}) });
  }
  if (typeof i.botsWaiting === 'number' && i.botsWaiting > 0) out.push({ key: 'bots', count: i.botsWaiting, scope: 'realm', tone: 'warn' });
  for (const h of i.held.slice(0, HELD_SHOWN)) out.push({ key: `held:${h.id}`, count: 1, held: h, scope: 'account', tone: 'warn' });
  const rest = i.held.slice(HELD_SHOWN);
  if (rest.length > 0) out.push({ key: 'more', count: rest.length, held: rest.find((h) => h.href) ?? rest[0], scope: 'account', tone: 'warn' });
  if (i.sending > 0) out.push({ key: 'changes', count: i.sending, scope: 'account', tone: 'warn' });
  return out;
}

/** What the live region says: it changes only when an item, its count or its computer changes, not on every poll. */
export function needsSignature(items: readonly NeedItem[]): string {
  return items.map((n) => `${n.key}:${n.count}:${n.name ?? ''}:${n.held ? `${n.held.kind}/${n.held.path ?? n.held.page ?? ''}/${n.held.computer ?? ''}` : ''}`).join('|');
}

// ── Start something: tiles and their prerequisites ─────────────────────────────────────────────

export type TileId = 'bot' | 'board' | 'script' | 'schedule' | 'keys' | 'vault' | 'ai' | 'computer';
export interface TileDef {
  id: TileId;
  /** The page whose link (served or none) decides the tile. */
  page: string;
  /** Needs a computer in the shown realm to be useful. */
  needsComputer: boolean;
  /** One of the four big tiles; the rest are the More links. */
  main: boolean;
}

const TILES: readonly TileDef[] = [
  { id: 'bot', page: 'bots', needsComputer: true, main: true },
  { id: 'board', page: 'board', needsComputer: true, main: true },
  { id: 'script', page: 'scripts', needsComputer: true, main: true },
  { id: 'schedule', page: 'schedules', needsComputer: true, main: true },
  { id: 'keys', page: 'keys', needsComputer: false, main: false },
  { id: 'vault', page: 'vault', needsComputer: false, main: false },
  { id: 'ai', page: 'ai', needsComputer: true, main: false },
  { id: 'computer', page: 'computers', needsComputer: false, main: false },
];

/** The tiles whose prerequisites hold. */
export function tilesFor(o: { hasComputer: boolean }): TileDef[] {
  return TILES.filter((t) => o.hasComputer || !t.needsComputer);
}

/**
 * A tile's target: the creation place when this load serves the page, nothing when it hides it. (The classic
 * branch, asPage, is unused: no load gives a classic link.)
 */
export function tileTarget(link: { kind: 'hub' | 'classic'; href: string } | null, hubPath: string): { href: string; asPage: boolean } | null {
  if (!link) return null;
  return link.kind === 'hub' ? { href: hubPath, asPage: false } : { href: link.href, asPage: true };
}

// ── Widgets: what manifests contribute plus Home's own cards, arranged by the user's preferences ──

export interface Prefs {
  /** Widget keys in the user's order; keys not listed follow in manifest order. */
  order: readonly string[];
  hidden: readonly string[];
  /** The first-steps checklist was hidden by the user. */
  checklistHidden?: boolean;
  /** The first-visit welcome was seen. */
  welcomed?: boolean;
  /** The user has opened Ask with a question from Home. */
  asked?: boolean;
  /** Home saw this account being onboarded (setup, or its first computer on its first day). */
  onboarding?: boolean;
  /** The person hid the Welcome panel. */
  introHidden?: boolean;
  /** Home opened the tour (pages/onboarding) for this account once. */
  toured?: boolean;
}

export type PrefFlag = 'checklistHidden' | 'welcomed' | 'asked' | 'onboarding' | 'introHidden' | 'toured';
const FLAGS: readonly PrefFlag[] = ['checklistHidden', 'welcomed', 'asked', 'onboarding', 'introHidden', 'toured'];

export const DEFAULT_PREFS: Prefs = { order: [], hidden: [] };

export function widgetKey(pageId: string, id: string): string {
  return `${pageId}:${id}`;
}

export interface Arrangeable {
  key: string;
  order?: number;
}

/** Default order: by `order` then by key. Then the user's order wins for the keys it names. */
export function arrange<T extends Arrangeable>(widgets: readonly T[], prefs: Prefs): { all: T[]; shown: T[] } {
  const base = [...widgets].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.key.localeCompare(b.key));
  const rank = new Map(prefs.order.map((k, i) => [k, i] as const));
  const named = base.filter((w) => rank.has(w.key)).sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
  const rest = base.filter((w) => !rank.has(w.key));
  const all = [...named, ...rest];
  const hidden = new Set(prefs.hidden);
  return { all, shown: all.filter((w) => !hidden.has(w.key)) };
}

/** Moves `key` one place up (-1) or down (+1) inside `keys`; a key at the edge stays. */
export function moveKey(keys: readonly string[], key: string, delta: -1 | 1): string[] {
  const i = keys.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= keys.length) return [...keys];
  const out = [...keys];
  const a = out[i];
  const b = out[j];
  if (a === undefined || b === undefined) return out;
  out[i] = b;
  out[j] = a;
  return out;
}

export function setHidden(prefs: Prefs, key: string, hidden: boolean): Prefs {
  const rest = prefs.hidden.filter((k) => k !== key);
  return { ...prefs, hidden: hidden ? [...rest, key] : rest };
}

/** Cleans a stored value: anything that is not two string lists becomes the default; the flags are kept only when true. */
export function parsePrefs(raw: unknown): Prefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 64) : []);
  const out: Prefs = { order: list(r.order), hidden: list(r.hidden) };
  return FLAGS.reduce<Prefs>((p, f) => (r[f] === true ? { ...p, [f]: true } : p), out);
}

/** Index of the next focus target when moving through `count` items with an arrow key. */
export function stepFocus(current: number, count: number, key: string): number {
  if (count === 0) return -1;
  if (current < 0) return 0;
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(current + 1, count - 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(current - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return current;
}

// ── What a fresh read proves about a setup change (the `proves` of its useLockedChange) ──────────────
/** The fresh answers of a read-back, per read: [the computers query's `{ rows, whole }` per fresh list, setup states per fresh read]. */
type Answers = readonly (readonly unknown[])[];
type Verdict = 'applied' | undefined;
// Any row proves a computer, whole list or not.
const rowsOf = (answer: unknown): unknown => (answer && typeof answer === 'object' ? (answer as { rows?: unknown }).rows : undefined);
const hasComputer = (answers: Answers): boolean =>
  (answers[0] ?? []).some((answer) => {
    const rows = rowsOf(answer);
    return Array.isArray(rows) && rows.length > 0;
  });
const setupKinds = (answers: Answers): string[] =>
  (answers[1] ?? []).map((s) => (s && typeof s === 'object' ? (s as { kind?: unknown }).kind : undefined)).filter((k): k is string => typeof k === 'string');

/** Retry: a computer row exists. A list that is still empty, or the same setup state, proves nothing. */
export function retryProves(_identity: unknown, answers: Answers): Verdict {
  return hasComputer(answers) ? 'applied' : undefined;
}

/** Redeem: a computer row exists, or the setup state is no longer "invite" (the code was taken). */
export function redeemProves(_identity: unknown, answers: Answers): Verdict {
  return hasComputer(answers) || setupKinds(answers).some((k) => k !== 'invite') ? 'applied' : undefined;
}
