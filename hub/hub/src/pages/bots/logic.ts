// Pure functions of the bots page (no React, no I/O): status words, list filtering, name and
// label rules, allowed-address parsing, key states, limits.
import type { BotRow, BotStatus, BotView, Delegate, RouteTier, RoutingSet, SettingsPatch, SpeechConfig, WorkerBackend, WorkerEffort, WorkerOptions, Workers, KeyStatus, LinkKey, LinkStatus, LogKind, LogRow, LogVoice, Person, PersonInput, Right, SpeechUsage, VoiceCaps, VoiceCheck, VoiceOrigin } from './data';
import type { MicReason, RealmColor } from '@kit';
import { cleanAgentText, scrubSecrets } from '@kit';
import { computerHandle } from '@core';
import { links as guideLinks } from '../guide/links';
import strings from './strings.en.json';

// ── identity in the URL ─────────────────────────────────────────────────────────────

/** The row key of a Bot: `<computer>~<realm>~<id>`; the parts never contain `~`. */
export function botKey(computerId: string, realm: string, id: string): string {
  return `${computerId}~${realm}~${id}`;
}

export function parseBotKey(key: string | undefined): { computerId: string; realm: string; id: string } | null {
  if (!key) return null;
  const parts = key.split('~');
  if (parts.length !== 3 || parts.some((p) => p === '')) return null;
  const [computerId, realm, id] = parts as [string, string, string];
  return { computerId, realm, id };
}

/** A 24-hex id or UID shown masked: first and last four characters. The full value stays behind a copy. */
export function maskId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

// ── status ──────────────────────────────────────────────────────────────────────────

export const BOT_STATUSES: readonly BotStatus[] = ['waiting', 'working', 'queued', 'paused', 'idle'];

/** Order for the Status column: what needs the person first. */
export const STATUS_RANK: Record<BotStatus, number> = { waiting: 0, working: 1, queued: 2, paused: 3, idle: 4 };

/** The head status of a Bot view: waiting for you > paused at its limit > working > queued > idle. */
export function statusOf(v: Pick<BotView, 'gate' | 'turnRunning' | 'pausedAtLimit' | 'queued'>): BotStatus {
  if (v.gate) return 'waiting';
  if (v.pausedAtLimit) return 'paused';
  if (v.turnRunning) return 'working';
  if (v.queued > 0) return 'queued';
  return 'idle';
}

/** The one primary action of the Bot page: approve/answer > fix > link. */
export type PrimaryKind = 'approve' | 'answer' | 'fix' | 'link' | null;

export function primaryOf(v: Pick<BotView, 'gate'>, attention: boolean, canLink: boolean): PrimaryKind {
  if (v.gate) return v.gate.type === 'question' ? 'answer' : 'approve';
  if (attention) return 'fix';
  return canLink ? 'link' : null;
}

// ── names ───────────────────────────────────────────────────────────────────────────

const ADJECTIVES = ['quiet', 'brisk', 'sunny', 'steady', 'clever', 'gentle', 'bold', 'nimble', 'bright', 'calm', 'swift', 'keen'];
const COLORS = ['amber', 'indigo', 'coral', 'teal', 'violet', 'olive', 'crimson', 'cobalt', 'ivory', 'jade', 'slate', 'rose'];
const ANIMALS = ['otter', 'heron', 'lynx', 'badger', 'falcon', 'gecko', 'marten', 'ibis', 'wren', 'bison', 'koala', 'panda'];

/** A suggested Bot name: adjective-color-animal. `rng` returns [0, 1) (Math.random in the UI). */
export function suggestName(rng: () => number): string {
  const pick = (list: readonly string[]): string => list[Math.min(list.length - 1, Math.floor(rng() * list.length))] ?? list[0] ?? '';
  return `${pick(ADJECTIVES)}-${pick(COLORS)}-${pick(ANIMALS)}`;
}

const BOT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Turns a typed name into the Bot id the agent accepts: lower-case, hyphens, at most 64 characters. */
export function botIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Ids the Bot's agent refuses for a new Bot (400 bad_request, field id): each is a route word under /bots/{id}/ (the
 *  agent's own list of sub-routes, plus every registered /bots/{id}/<word> route). A word the agent adds later
 *  is still refused there; the drawer then says so from the refusal's field. */
export const RESERVED_BOT_IDS: readonly string[] = ['archive', 'audio', 'cancel', 'channel-settings', 'channels', 'delegates', 'forget', 'gate', 'guardrails', 'log', 'messages', 'purge', 'realtime', 'reset', 'stream', 'twilio', 'voice'];

export type NameProblem = 'empty' | 'bad_id' | 'reserved' | 'taken' | null;

export function nameProblem(name: string, takenIds: readonly string[]): NameProblem {
  if (name.trim() === '') return 'empty';
  const id = botIdFromName(name);
  if (!BOT_ID.test(id)) return 'bad_id';
  if (RESERVED_BOT_IDS.includes(id)) return 'reserved';
  return takenIds.includes(id) ? 'taken' : null;
}

// ── link label (public address) ─────────────────────────────────────────────────────

const LABEL_RE = /^[a-z](?:[a-z0-9]|-(?!-)){6,46}[a-z0-9]$/;

export type LabelProblem = 'empty' | 'bad_char' | 'too_short' | 'too_long' | 'bad_start' | 'bad_end' | 'double_hyphen' | 'invalid' | null;

/** The public Bot label rule (External Bots contract 1.1): the first problem with what was typed. */
export function labelProblem(s: string): LabelProblem {
  if (s === '') return 'empty';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) return 'bad_char';
  }
  if (s.length < 8) return 'too_short';
  if (s.length > 48) return 'too_long';
  if (!/^[a-z]/.test(s)) return 'bad_start';
  if (!/[a-z0-9]$/.test(s)) return 'bad_end';
  if (s.includes('--')) return 'double_hyphen';
  return LABEL_RE.test(s) ? null : 'invalid';
}

/** What the address will look like before it exists. An empty label shows the generated one. */
export function previewUrl(label: string, zone: string, suggested: string): string {
  const l = label === '' ? suggested : label;
  return zone === '' ? '' : `https://${l}.${zone}`;
}

/** The model a New Bot starts on: Hoody's own, never a third party's. */
export const DEFAULT_MODEL = 'hoody-ai/hoody-free';

/** What the New Bot drawer needs of a computer to judge it: can a Bot be made on it from the shown realm. */
export interface HostCandidate {
  id: string;
  name: string;
  state: 'running' | 'stopped' | 'starting';
  listState: 'ok' | 'failed' | 'other_realm';
}

/** A computer a new Bot can run on: running, and serving the shown realm. */
export const canHostBot = (c: HostCandidate): boolean => c.state === 'running' && c.listState !== 'other_realm';

/** Why the drawer did not start on a computer: none can host a Bot, or the shown one (`name`) cannot. */
export type HostWhy = { kind: 'none' } | { kind: 'notRunning' | 'otherRealm'; name: string };

/**
 * The computer a New Bot drawer starts on: the one the page opened it for (`initial`), else the computer shown in the
 * top bar (`current`), when it can host a Bot. When that computer cannot, `why` says so and the choice stays open. With
 * no such computer (or a shown one the list does not hold) it is the only computer that can, and nothing is said.
 */
export function startComputer(computers: readonly HostCandidate[], initial: string | undefined, current: string | undefined): { id: string | undefined; why: HostWhy | null } {
  const named = initial ? computers.find((c) => c.id === initial) : undefined;
  // A computer the list does not hold yet is taken as given: the list may still be on its way.
  if (initial && (!named || canHostBot(named))) return { id: initial, why: null };
  const able = computers.filter(canHostBot);
  const shown = named ?? (current ? computers.find((c) => c.id === current) : undefined);
  if (shown && canHostBot(shown)) return { id: shown.id, why: null };
  if (able.length === 0) return { id: undefined, why: computers.length > 0 ? { kind: 'none' } : null };
  if (shown) return { id: undefined, why: { kind: shown.state === 'running' ? 'otherRealm' : 'notRunning', name: shown.name } };
  return { id: able.length === 1 ? able[0]?.id : undefined, why: null };
}

/** The link zone of the first address in a list of links whose url is https://<label>.<zone>; '' when none shows one. */
export function zoneOfLinks(links: Iterable<{ url: string; label: string } | null | undefined>): string {
  for (const l of links) {
    const z = l ? zoneOfUrl(l.url, l.label) : '';
    if (z !== '') return z;
  }
  return '';
}

/** The zone of an address the API returned: https://<label>.<zone>. Anything else gives ''. */
export function zoneOfUrl(url: string, label: string): string {
  if (!LABEL_RE.test(label)) return '';
  const prefix = `https://${label}.`;
  if (!url.startsWith(prefix)) return '';
  const zone = url.slice(prefix.length).replace(/\/$/, '');
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(zone) ? zone : '';
}

// ── keys ────────────────────────────────────────────────────────────────────────────

export const KEYS_MAX = 20;
const KEY_NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9 ._-]{0,30}[A-Za-z0-9])?$/;

export function keyNameOk(s: string): boolean {
  return KEY_NAME_RE.test(s);
}

/** A link's live keys have distinct names, whatever the case (the API's own check: 409
 *  BOT_KEY_NAME_TAKEN). `others`: the names of the link's other keys. */
export function keyNameTaken(name: string, others: readonly string[]): boolean {
  const n = name.toLowerCase();
  return others.some((o) => o.toLowerCase() === n);
}

/** The name a New key form starts on: "default" while the link has no such key (New Bot makes one), else the first free
 *  of key-2, key-3 and so on. */
export function freeKeyName(others: readonly string[]): string {
  if (!keyNameTaken('default', others)) return 'default';
  for (let i = 2; i <= others.length + 2; i++) {
    if (!keyNameTaken(`key-${i}`, others)) return `key-${i}`;
  }
  return '';
}

/** An expiry picked as YYYY-MM-DD becomes the end of that UTC day; '' means none; anything else is undefined. */
export function expiryFromDate(d: string): string | null | undefined {
  if (d === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return undefined;
  const iso = `${d}T23:59:59.999Z`;
  return Number.isNaN(Date.parse(iso)) || new Date(iso).toISOString() !== iso ? undefined : iso;
}

/** The state of a key now: expired wins over paused wins over active. */
export function keyStateOf(k: Pick<LinkKey, 'enabled' | 'expiresAt'>, now: number): KeyStatus {
  if (k.expiresAt !== null && Date.parse(k.expiresAt) <= now) return 'expired';
  return k.enabled ? 'active' : 'paused';
}

// ── limits (contract 9) ─────────────────────────────────────────────────────────────

export type LimitName = 'key_rpm' | 'bot_rpm' | 'key_concurrency' | 'bot_concurrency';

export const LIMITS: ReadonlyArray<{ name: LimitName; min: number; max: number; fallback: number }> = [
  { name: 'key_rpm', min: 1, max: 600, fallback: 60 },
  { name: 'bot_rpm', min: 1, max: 3000, fallback: 120 },
  { name: 'key_concurrency', min: 1, max: 16, fallback: 4 },
  { name: 'bot_concurrency', min: 1, max: 32, fallback: 8 },
];

export function limitProblem(name: LimitName, raw: string): 'empty' | 'range' | null {
  const spec = LIMITS.find((l) => l.name === name);
  if (raw.trim() === '') return 'empty';
  const n = Number(raw);
  if (!spec || !Number.isInteger(n) || n < spec.min || n > spec.max) return 'range';
  return null;
}

// ── link status ─────────────────────────────────────────────────────────────────────

export const LINK_TONE: Record<LinkStatus, 'ok' | 'neutral' | 'warn' | 'danger'> = {
  active: 'ok',
  disabled: 'neutral',
  detached: 'warn',
  frozen: 'danger',
  unknown: 'neutral',
};

/** A propagation block is still working while anything is pending and nothing has failed. */
export function propagationBusy(p: { state: string; pending: number } | null): boolean {
  return p !== null && p.pending > 0 && p.state !== 'failed';
}

// ── gate decision (remember is always false) ────────────────────────────────────────

export const DENY_REASON_MAX = 500;

export function denyReasonOk(reason: string): boolean {
  return reason.length <= DENY_REASON_MAX;
}

/** Where a runtime row's task is: its session lives on the Bot's own computer (the agent the Bot is read from),
 *  and it runs on the delegate's `computer`, which is empty when that is the Bot's own machine. `runs` is null when both are the
 *  same computer and '' when the computer is not one of the listed ones. Null for a message, a row naming no session, or a
 *  session that is not one of the Bot's listed tasks. */
export interface RowPlace {
  sid: string;
  title: string;
  session: string;
  runs: string | null;
}

export function rowPlace(row: Pick<LogRow, 'kind' | 'sessionId'>, delegates: readonly Delegate[], home: { id: string; name: string }, computers: readonly { id: string; name: string }[]): RowPlace | null {
  if (row.kind === 'user' || row.kind === 'bot' || !row.sessionId) return null;
  const d = delegates.find((x) => x.sessionId === row.sessionId);
  if (!d) return null;
  const at = d.computerId || home.id;
  const runs = at === home.id ? null : (computers.find((c) => c.id === at)?.name ?? '');
  return { sid: d.sessionId, title: d.title, session: home.name, runs };
}

// ── untrusted text ──────────────────────────────────────────────────────────────────

/** Makes agent or Bot text plain: control characters dropped, one line, bounded. Always shown as text. */
export function plainLine(s: unknown, max = 120): string {
  const text = typeof s === 'string' ? s : '';
  const clean = text.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const HIDDEN = '[hidden]';

/** A user's or the Bot's message for the kit Prose: control characters, escape sequences and bidi overrides dropped, newlines
 *  kept, secrets hidden, bounded. It is scrubbed before it is cleaned, since cleaning can glue a key to the word before it; the
 *  scrub reads the text as the cleaner shows it, so nothing it cleans can show a key. The bound never cuts through a hidden marker or a surrogate pair. Prose draws it as React text, never
 *  as HTML, and checks each link address after the browser normalises it. */
export function messageText(s: unknown, max = 4000): string {
  const text = cleanAgentText(typeof s === 'string' ? scrubSecrets(s) : s).text;
  if (text.length <= max) return text;
  const mark = text.lastIndexOf(HIDDEN, max - 1);
  let end = mark >= 0 && mark + HIDDEN.length > max ? mark : max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return `${text.slice(0, end)}…`;
}

/** The kit's one secret pattern (kit/agent/code.ts), which the kit Prose also applies to link addresses. */
export { scrubSecrets };

// ── connect examples ────────────────────────────────────────────────────────────────
// The examples never embed a real key: they read it from HOODY_BOT_KEY. A fresh key is shown only
// in the secret box.

export type SnippetKind = 'curl' | 'openai' | 'anthropic' | 'mcp';
export const SNIPPET_KINDS: readonly SnippetKind[] = ['curl', 'openai', 'anthropic', 'mcp'];

/** The colouring each connect example takes in the code block (the MCP example is JSON). */
export const SNIPPET_LANG: Record<SnippetKind, 'shell' | 'python' | 'json'> = { curl: 'shell', openai: 'python', anthropic: 'python', mcp: 'json' };

const json = (s: string): string => JSON.stringify(s);

export function snippets(baseUrl: string, model: string): Record<SnippetKind, string> {
  const b = baseUrl.replace(/\/+$/, '');
  return {
    curl: [
      `curl -sS ${b}/v1/chat/completions \\`,
      '  -H "Authorization: Bearer $HOODY_BOT_KEY" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '${JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello' }] })}'`,
    ].join('\n'),
    openai: [
      'import os',
      'from openai import OpenAI',
      '',
      `client = OpenAI(base_url=${json(`${b}/v1`)}, api_key=os.environ["HOODY_BOT_KEY"])`,
      'reply = client.chat.completions.create(',
      `    model=${json(model)},`,
      '    messages=[{"role": "user", "content": "Hello"}],',
      ')',
      'print(reply.choices[0].message.content)',
    ].join('\n'),
    anthropic: [
      'import os',
      'import anthropic',
      '',
      `client = anthropic.Anthropic(base_url=${json(b)}, api_key=os.environ["HOODY_BOT_KEY"])`,
      'reply = client.messages.create(',
      `    model=${json(model)},`,
      '    max_tokens=1024,',
      '    messages=[{"role": "user", "content": "Hello"}],',
      ')',
      'print(reply.content[0].text)',
    ].join('\n'),
    mcp: JSON.stringify({ mcpServers: { [model]: { url: `${b}/mcp`, headers: { Authorization: 'Bearer $HOODY_BOT_KEY' } } } }, null, 2), // reason: the MCP snippet text, shown by the Link tab's CodeBlock with lang=json (SNIPPET_LANG) and copied as is
  };
}

// ── list order, tabs and settings sections ──────────────────────────────────────────

/** Default order of the list: waiting for you, then working, then the most recent activity. */
export function compareBots(a: Pick<BotRow, 'status' | 'lastActivityAt' | 'name'>, b: Pick<BotRow, 'status' | 'lastActivityAt' | 'name'>): number {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus;
  const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
  const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
  if (ta !== tb) return tb - ta;
  return a.name.localeCompare(b.name);
}

// ── the list's cards and summary ────────────────────────────────────────────────────

const TINTS: readonly RealmColor[] = ['blue', 'green', 'orange', 'pink', 'purple', 'red', 'teal', 'yellow'];

/** The colour of a Bot's mark: one palette colour picked from its row key, so a Bot keeps its colour on every visit.
 *  Decoration only: it means nothing, and the name beside it says which Bot it is. */
export function botTint(seed: string): RealmColor {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return TINTS[(h >>> 0) % TINTS.length] as RealmColor;
}

/** A Bot that waits on the person: a question or approval, a pause at its limit, or groups asking to be let in. A Bot
 *  another program serves has no actions here, so it never counts. */
export function needsYou(r: Pick<BotRow, 'status' | 'chatsWaiting' | 'locked'>): boolean {
  return !r.locked && (r.status === 'waiting' || r.status === 'paused' || r.chatsWaiting > 0);
}

/** The counts of the summary above the list. `suspended`: the Bots paused after a sign-in change, which the computers
 *  report as a number (they are not rows). */
export function listSummary(rows: readonly BotRow[], suspended: number): { bots: number; computers: number; working: number; needs: number; suspended: number; inChat: number } {
  return {
    // The Bots paused after a sign-in change are Bots too: without them "Need you" could count more Bots than "Bots".
    bots: rows.length + suspended,
    computers: new Set(rows.map((r) => r.computerId)).size,
    working: rows.filter((r) => r.status === 'working').length,
    needs: rows.filter(needsYou).length,
    suspended,
    inChat: rows.filter((r) => r.chatApps.length > 0).length,
  };
}

export const BOT_TABS = ['activity', 'link', 'apps', 'work'] as const;
export type BotTab = (typeof BOT_TABS)[number];

export function tabOf(raw: string | undefined): BotTab {
  return (BOT_TABS as readonly string[]).includes(raw ?? '') ? (raw as BotTab) : 'activity';
}

export const SETTINGS_SECTIONS = ['model', 'behaviour', 'workers', 'guardrails', 'voice', 'advanced'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The section a `?settings=` value opens; anything else opens the first. */
export function settingsSectionOf(raw: string | undefined): SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as SettingsSection) : 'model';
}

/** What the Home widget lists: Bots waiting for you first, then the rest by the list order. */
export function widgetRows<T extends Pick<BotRow, 'status' | 'lastActivityAt' | 'name' | 'locked'>>(rows: readonly T[], limit = 5): T[] {
  return rows
    .filter((r) => !r.locked)
    .slice()
    .sort(compareBots)
    .slice(0, limit);
}

type BotLabel = { name: string; computer?: undefined; realm?: undefined } | { name: string; computer: string; realm?: string };
type LabelRow = Pick<BotRow, 'key' | 'name' | 'computerId' | 'realmName'>;
const normName = (n: string) => n.trim().toLocaleLowerCase();

/** The label before any computer handle: the rule below. */
function plainLabel<T extends LabelRow>(row: T, all: readonly T[], computerName: (id: string) => string | undefined): BotLabel {
  const twins = all.filter((b) => b.key !== row.key && normName(b.name) === normName(row.name));
  if (twins.length === 0 && all.every((b) => b.computerId === row.computerId)) return { name: row.name };
  const computer = computerName(row.computerId) || row.computerId.slice(-4);
  return twins.some((b) => b.computerId === row.computerId) ? { name: row.name, computer, realm: row.realmName } : { name: row.name, computer };
}

// A label as it reads: trimmed, without case; a missing realm never equals an empty one.
const labelKey = (l: BotLabel) => [normName(l.name), normName(l.computer ?? ''), l.realm === undefined ? '\u0001' : normName(l.realm)].join('\0');

/** How a list of several Bots names one (the TUI's botsDisplayName rule): the name alone while it says which
 *  Bot it is; with its computer when the Bots span computers or another Bot has the same name (every computer's
 *  first Bot is often "Chief"); with its realm too when the same name repeats on one computer. Names compare
 *  trimmed and without case. A computer the caller cannot name shows the last four characters of its id. Only when
 *  that label would read the same as a Bot's on another computer (two computers of one name) does the computer part
 *  become the computer handle (computerHandle, name.abcd); every other label keeps its look. */
export function botDisplayName<T extends LabelRow>(row: T, all: readonly T[], computerName: (id: string) => string | undefined): BotLabel {
  const plain = plainLabel(row, all, computerName);
  const named = computerName(row.computerId);
  if (plain.computer === undefined || named === undefined || named.trim() === '') return plain;
  const key = labelKey(plain);
  const clash = all.some((b) => b.key !== row.key && b.computerId !== row.computerId && labelKey(plainLabel(b, all, computerName)) === key);
  return clash ? { ...plain, computer: computerHandle({ id: row.computerId, name: named.trim() }) } : plain;
}

/** The outcome a confirm dialog shows: only the one that sent the change owns it, so a pending or failed
 *  result of Delete never appears in Reset's dialog (they share one lock, not one message). */
export function dialogOwnOutcome(outcome: string, acted: string | null, key: string): { kind: 'failed' | 'pending' } | undefined {
  if (acted !== key) return undefined;
  return outcome === 'failed' || outcome === 'pending' ? { kind: outcome } : undefined;
}

/** The log page with the older rows loaded so far placed before it (by seq, no repeats). */
export function withOlder<P extends { rows: readonly { seq: number }[]; hasOlder: boolean }>(page: P, older: { rows: readonly { seq: number }[]; hasOlder: boolean } | null): P {
  if (!older) return page;
  const have = new Set(page.rows.map((r) => r.seq));
  const rows = [...older.rows.filter((r) => !have.has(r.seq)), ...page.rows].sort((a, b) => a.seq - b.seq);
  return { ...page, rows, hasOlder: older.hasOlder };
}

export type GateState = 'idle' | 'running' | 'pending' | 'decided' | 'elsewhere' | 'failed';
const GATE_ELSEWHERE = new Set(['gate_already_resolved', 'gate_already_answered', 'gate_cancelled']);

/**
 * What the gate card shows. A lock still held for an unknown answer shows on any gate (nothing is sent
 * again); every other outcome belongs only to the gate this card sent it for, so a used decision never
 * hides the next gate's buttons. The daemon's 409 gate_decision_pending means the answer is not known yet
 * (not a failure); gate_already_* means someone decided first (not a failure either).
 */
export function gateStateOf(outcome: string, code: string | undefined, mine: boolean): GateState {
  if (outcome === 'pending') return 'pending';
  if (!mine) return 'idle';
  if (outcome === 'running') return 'running';
  if (outcome === 'done') return 'decided';
  if (outcome === 'failed' || outcome === 'not_sent' || outcome === 'stale') {
    if (code === 'gate_decision_pending') return 'pending';
    if (code && GATE_ELSEWHERE.has(code)) return 'elsewhere';
    return 'failed';
  }
  return 'idle';
}

/** Our decision won: the daemon names the request that decided the gate, and it is ours. */
export function decisionWasOurs(details: Readonly<Record<string, unknown>> | undefined, ownRequest: string | undefined): boolean {
  const id = details?.request_id;
  return typeof id === 'string' && id !== '' && id === ownRequest;
}

/**
 * Which destructive action (reset, forget, purge, delete) has an answer nobody knows: the daemon takes no
 * Idempotency-Key for them, so after "may have gone through" a second press would be a second real call.
 * The dialog's confirm stays off for that action until it is dismissed on purpose (or the Bot is gone).
 */
export function heldAfter(held: string | null, key: string, outcome: string): string | null {
  if (outcome === 'pending') return key;
  if (outcome === 'done') return null;
  return held;
}

/** The log lines that are about the Bot's tasks (a report, an ended task, a stop): what "Hide task updates" leaves out. */
export const TASK_UPDATE_KINDS: ReadonlySet<LogKind> = new Set<LogKind>(['report', 'gone', 'stop']);
export const isTaskUpdate = (kind: LogKind): boolean => TASK_UPDATE_KINDS.has(kind);

/** The address a link's rows and QR show: its origin and `/`. null for anything that is not a plain https origin (credentials, a port, another scheme). */
export function botOrigin(url: string): string | null {
  const m = /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(?:\/[^#?]*)?$/i.exec(url);
  return m ? `https://${m[1]!.toLowerCase()}/` : null;
}

export type AddressKind = 'chat' | 'openai' | 'anthropic' | 'mcp' | 'skill';

/** The connect examples each address carries in its "How to use it" drawer: the curl call goes to the OpenAI-compatible
 *  address (/v1/chat/completions); the chat page and the skill file are opened, not called from code. */
export const DOOR_EXAMPLES: Readonly<Record<AddressKind, readonly SnippetKind[]>> = { chat: [], openai: ['curl', 'openai'], anthropic: ['anthropic'], mcp: ['mcp'], skill: [] };

/** Every address a link answers on. Only the chat page and the skill file are pages a person opens; the rest are copied into a client. */
export function linkAddresses(url: string): Array<{ id: AddressKind; value: string; open?: string }> {
  const origin = botOrigin(url);
  if (!origin) return [];
  const host = origin.slice(0, -1);
  return [
    { id: 'chat', value: origin, open: origin },
    { id: 'openai', value: `${host}/v1` },
    { id: 'anthropic', value: host },
    { id: 'mcp', value: `${host}/mcp` },
    { id: 'skill', value: `${host}/SKILL.md`, open: `${host}/SKILL.md` },
  ];
}

/** Where "How to connect" goes: the Guide's Bots section (`#bots`). The classic branch (`#g-bots`) is dead, as no load
 *  gives a classic link. */
export function guideConnectTarget(link: { kind: 'hub' | 'classic'; href: string }): string {
  return link.kind === 'hub' ? guideLinks.section('bots') : `${link.href.replace(/#.*$/, '')}#g-bots`;
}

/** What a person's edit sends: only the fields that differ from the person as listed, so a field nobody touched is never rewritten. */
export function personPatch(p: Person, next: { name: string; lang: string; rights: readonly Right[]; owner: boolean }): PersonInput {
  const sameRights = next.rights.length === p.rights.length && next.rights.every((r) => p.rights.includes(r));
  return {
    ...(next.name !== p.name ? { name: next.name } : {}),
    // A cleared language is null (use the chat app's own); the agent refuses an empty string.
    ...(next.lang !== p.lang ? { lang: next.lang === '' ? null : next.lang } : {}),
    ...(!sameRights ? { rights: next.rights } : {}),
    ...(next.owner !== p.owner ? { owner: next.owner } : {}),
  };
}

/** The doors a message reaches the Bot through that the agent names (its `via`); the page adds none and trusts none. */
export const DOORS = ['tui', 'openai', 'anthropic', 'mcp', 'voice', 'twilio', 'telegram', 'slack', 'discord'] as const;
export type Door = (typeof DOORS)[number];

/** A message's door: a named one, `direct` when it came with none (a plain post to the Bot), `other` for a door this page does not know. */
export function doorOf(via: string): Door | 'direct' | 'other' {
  if (via === '') return 'direct';
  return (DOORS as readonly string[]).includes(via) ? (via as Door) : 'other';
}

/**
 * The sender's name as the agent recorded it: `key:<name>` (exactly that prefix, read before any cleaning, as the agent reads it) for a
 * caller holding a key, a chat app display name otherwise; '' when unknown. The name is outside text: made plain, scrubbed and cut.
 */
export function senderWho(who: string): { key: boolean; name: string } {
  const clean = (s: string) => plainLine(scrubSecrets(s), 60);
  if (who.startsWith('key:')) {
    const name = clean(who.slice(4));
    return name === '' ? { key: false, name: '' } : { key: true, name };
  }
  return { key: false, name: clean(who) };
}

type Translate = (key: string, params?: Record<string, string>) => string;
type Sender = { via: string; who: string } | null;

function senderText(t: Translate, sender: Sender, doorText?: string): string {
  const door = doorOf(sender?.via ?? '');
  const w = senderWho(sender?.who ?? '');
  const named = w.name === '' ? '' : w.key ? t('sender.key', { name: w.name }) : w.name;
  if (door === 'direct') return named === '' ? t('sender.direct') : named;
  const doorLabel = doorText ?? (door === 'other' ? t('sender.other') : t(`sender.via.${door}`));
  return named === '' ? doorLabel : t('sender.line', { who: named, door: doorLabel });
}

/** The line under a message: who sent it and the door, from what the agent recorded. `t` is the page's translator. */
export function senderLabel(t: Translate, sender: Sender): string {
  return senderText(t, sender);
}

/** The doors that are chat apps: the line shows the app's own logo (kit icon of the same name) before its name. */
export const CHAT_DOORS = ['telegram', 'slack', 'discord'] as const satisfies readonly Door[];
export type ChatDoor = (typeof CHAT_DOORS)[number];

// Stands in for the door's name while the line is built; cleaning drops control characters from names, so none holds it.
const DOOR_SLOT = '\u0000';

/**
 * The same line split around a chat app's name, so its logo sits right before it: `before` + logo + `door` + `after`.
 * Any other door gives the whole line in `before`, no logo and no `door`.
 */
export function senderLine(t: Translate, sender: Sender): { before: string; mark: ChatDoor | null; door: string; after: string } {
  const door = doorOf(sender?.via ?? '');
  const mark = (CHAT_DOORS as readonly string[]).includes(door) ? (door as ChatDoor) : null;
  if (mark === null) return { before: senderText(t, sender), mark: null, door: '', after: '' };
  const [before = '', after = ''] = senderText(t, sender, DOOR_SLOT).split(DOOR_SLOT);
  return { before, mark, door: t(`sender.via.${mark}`), after };
}

/** The longest message about a task the form takes (the agent takes 64 KiB; a task note is short). */
export const TASK_MESSAGE_MAX = 4000;

/**
 * What the Bot is sent for a message about one task: the words, led by the task's title and session id so it knows which one to pass them on to.
 * The title is the Bot's own text about a task (outside text): made plain, scrubbed and cut. The words are sent as the person typed them.
 */
export function taskMessageText(task: { title: string; sessionId: string }, text: string): string {
  const title = plainLine(scrubSecrets(task.title), 80);
  return `For the task “${title}” (session ${task.sessionId}): ${text.trim()}`;
}

// ---- Helpers (Settings > Helpers): which helpers the Bot hands work to ------------------------------

/** What the Helpers form holds: which backends the Bot may give work to, the one new helpers run on, and Claude Code's model (a stored one is kept as it is). */
export interface WorkersForm {
  llm: boolean;
  acp: boolean;
  backend: WorkerBackend;
  model: string;
  /** The helper options; drawn and sent only when the agent reports them (Workers.options). */
  hModel: string;
  hThinking: RouteTier['thinking'];
  effort: WorkerEffort;
}

const NO_OPTIONS: WorkerOptions = { model: '', thinking: '', effort: '' };

/** The backend that stands for a form: an unticked one cannot be the default, and the only one left is. */
export function workersBackend(f: Pick<WorkersForm, 'llm' | 'acp' | 'backend'>): WorkerBackend {
  if (f.acp && !f.llm) return 'acp';
  if (f.llm && !f.acp) return 'llm';
  return f.backend;
}

export function workersFormOf(w: Workers): WorkersForm {
  const o = w.options ?? NO_OPTIONS;
  return { llm: w.allowed.includes('llm'), acp: w.allowed.includes('acp'), backend: w.backend, model: w.model, hModel: o.model, hThinking: o.thinking, effort: o.effort };
}

/** The backends a form allows, in the agent's order. */
export const workersAllowed = (f: Pick<WorkersForm, 'llm' | 'acp'>): WorkerBackend[] => [...(f.llm ? (['llm'] as const) : []), ...(f.acp ? (['acp'] as const) : [])];

/** Why the form cannot be sent: at least one backend stays allowed. */
export const workersProblem = (f: WorkersForm): 'none' | undefined => (f.llm || f.acp ? undefined : 'none');

/** Whether the form differs from what the Bot holds. Claude Code's model counts only while Claude Code is allowed (it is kept, unused, otherwise). */
export function workersDirty(f: WorkersForm, w: Workers): boolean {
  if (!w.known) return false;
  if (workersAllowed(f).join() !== w.allowed.join()) return true;
  if (workersBackend(f) !== w.backend) return true;
  if (w.options && f.llm && (f.hModel !== w.options.model || f.hThinking !== w.options.thinking)) return true;
  if (w.options && f.acp && f.effort !== w.options.effort) return true;
  return f.acp && f.model.trim() !== w.model;
}

/**
 * The PATCH for the form: only what changed. The default is named only when it moves by the person's choice: when Claude Code is
 * taken away the agent itself moves a Claude Code default to Hoody models and keeps its agent and model. Claude Code needs its
 * agent, which the Hub names (the agent has the one choice). Nothing is sent when nothing changed.
 */
export function workersPatch(
  f: WorkersForm,
  w: Workers,
): Pick<SettingsPatch, 'worker_backend' | 'allowed_worker_backends' | 'worker_delegated_agent' | 'worker_delegated_model' | 'worker_model' | 'worker_thinking' | 'worker_delegated_effort'> {
  const out: ReturnType<typeof workersPatch> = {};
  if (!w.known || workersProblem(f) !== undefined) return out;
  const allowed = workersAllowed(f);
  const backend = workersBackend(f);
  if (allowed.join() !== w.allowed.join()) out.allowed_worker_backends = allowed;
  if (backend !== w.backend && !(backend === 'llm' && !f.acp)) out.worker_backend = backend;
  if (f.acp && f.model.trim() !== w.model) out.worker_delegated_model = f.model.trim();
  // The helper options of a kind the Bot may use (a kind taken away keeps its options, unused, as its model is kept). Thinking is the
  // model's: it goes with a model, and taking the model away takes it too (the agent clears it then).
  if (w.options && f.llm) {
    if (f.hModel !== w.options.model) out.worker_model = f.hModel;
    if (f.hModel !== '' && f.hThinking !== w.options.thinking) out.worker_thinking = f.hThinking;
  }
  if (w.options && f.acp && f.effort !== w.options.effort) out.worker_delegated_effort = f.effort;
  // Claude Code needs its agent whenever it is allowed: the agent refuses a merged policy without one, whatever else the save changes.
  if (f.acp && w.agent !== 'claude' && Object.keys(out).length > 0) out.worker_delegated_agent = 'claude';
  return out;
}

/**
 * The policy the agent holds once the form's save is applied: what the next edit of the same form is compared with until the Bot is read
 * again (a second save before the refresh must not be worked out against the policy from before the first one).
 */
export function workersAfter(f: WorkersForm, w: Workers): Workers {
  if (!w.known) return w;
  const after: Workers = { known: true, backend: workersBackend(f), allowed: workersAllowed(f), agent: f.acp ? 'claude' : w.agent, model: f.acp ? f.model.trim() : w.model };
  if (!w.options) return after;
  const llm = f.llm ? { model: f.hModel, thinking: f.hModel === '' ? ('' as const) : f.hThinking } : { model: w.options.model, thinking: w.options.thinking };
  return { ...after, options: { ...llm, effort: f.acp ? f.effort : w.options.effort } };
}

/** The words for a refused Helpers save, from the agent's code and details (never its text); undefined when it names nothing known. */
export function workersRefusalKey(code: string | undefined, details: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const field = typeof details?.field === 'string' ? details.field : '';
  if (code === 'model_unavailable' && field === 'worker_delegated_model') return 'workers.refused.model';
  if (code === 'model_unavailable' && field === 'worker_model') return 'workers.refused.hModel';
  if (code === 'bad_request' && ['worker_backend', 'allowed_worker_backends', 'worker_delegated_agent', 'worker_delegated_model', 'worker_model', 'worker_thinking', 'worker_delegated_effort'].includes(field)) return `workers.refused.${field}`;
  return undefined;
}

// ---- Helpers' models (Settings > Helpers): Routing and the agents a task may name ------------------

/** What the Routing fields hold: the mode, and both tiers' model and thinking (kept while the mode is off, so turning it back on finds them). */
export interface RoutingForm {
  mode: RoutingSet['mode'];
  light: RouteTier;
  heavy: RouteTier;
}

const NO_TIER: RouteTier = { model: '', thinking: '' };

export function routingFormOf(r: RoutingSet | undefined): RoutingForm {
  return { mode: r?.mode ?? 'off', light: r?.light ?? NO_TIER, heavy: r?.heavy ?? NO_TIER };
}

/** Why the Routing fields cannot be sent: a tier without a model while routing is on (the agent requires both), or an ensemble (it refuses those). */
export function routingProblem(f: RoutingForm): { tier: 'light' | 'heavy'; why: 'model' | 'fusion' } | undefined {
  if (f.mode === 'off') return undefined;
  for (const tier of ['light', 'heavy'] as const) {
    const m = f[tier].model.trim();
    if (m === '') return { tier, why: 'model' };
    if (m.startsWith('fusion/')) return { tier, why: 'fusion' };
  }
  return undefined;
}

/** The routing a form sends: off is the mode alone (the agent then drops the tiers), on is the mode with both tiers, trimmed. */
export function routingBody(f: RoutingForm): NonNullable<SettingsPatch['routing']> {
  if (f.mode === 'off') return { mode: 'off' };
  const tier = (t: RouteTier): RouteTier => ({ model: t.model.trim(), thinking: t.thinking });
  return { mode: f.mode, light: tier(f.light), heavy: tier(f.heavy) };
}

/** Whether the Routing fields differ from what the Bot holds: what each would send is compared, so tiers kept under off are no edit. */
export function routingDirty(f: RoutingForm, r: RoutingSet | undefined): boolean {
  return JSON.stringify(routingBody(f)) !== JSON.stringify(routingBody(routingFormOf(r)));
}

/** Which Routing field a refused save names (from the agent's code and details, never its text). */
export function routingRefusal(code: string | undefined, details: Readonly<Record<string, unknown>> | undefined): { tier: 'light' | 'heavy' | null; field: 'model' | 'thinking' | 'mode' } | undefined {
  const field = typeof details?.field === 'string' ? details.field : '';
  const m = /^routing\.(?:(light|heavy)(?:\.(model|thinking))?|(mode))$/.exec(field);
  if (!m || (code !== 'model_unavailable' && code !== 'bad_request')) return undefined;
  if (m[3]) return { tier: null, field: 'mode' };
  return { tier: m[1] as 'light' | 'heavy', field: (m[2] as 'model' | 'thinking' | undefined) ?? 'model' };
}

/** Helpers' Routing and agents as a baseline the form compares with: what the Bot holds (no routing read = off). */
export interface HelpersBase {
  routingSet: RoutingSet;
  allowedAgents: string[] | null;
}

export function helpersOf(b: { routingSet?: RoutingSet; allowedAgents: readonly string[] | null }): HelpersBase {
  return { routingSet: b.routingSet ?? { mode: 'off', light: null, heavy: null }, allowedAgents: b.allowedAgents ? [...b.allowedAgents] : null };
}

/** The agents a task may name: null is any agent. The list is sent as the person ticked it; empty is not sendable (the agent reads it as any). */
export function agentsDirty(any: boolean, picked: readonly string[], held: readonly string[] | null): boolean {
  if (any !== (held === null)) return true;
  return !any && [...picked].sort().join(',') !== [...(held ?? [])].sort().join(',');
}

// ---- Voice (Settings > Voice) --------------------------------------------------------------------

/** What the Voice form holds. `custom` off means the Bot holds no voice setting of its own: the agent's default voices apply. */
export interface VoiceForm {
  custom: boolean;
  stt: string;
  tts: string;
  voice: string;
  language: string;
  speed: number | null;
  speakWakes: boolean;
  speakGates: boolean;
  /** The transcription prompt, shown whenever there is a listening model: a hidden one could block a save the person cannot fix. */
  sttPrompt: string;
}

/** The longest transcription prompt the agent takes. */
export const STT_PROMPT_MAX = 500;

export function voiceFormOf(c: SpeechConfig | null): VoiceForm {
  return c
    ? { custom: true, stt: c.sttModel, tts: c.ttsModel, voice: c.voice, language: c.language, speed: c.speed, speakWakes: c.speakWakes, speakGates: c.speakGates, sttPrompt: typeof c.raw.stt_prompt === 'string' ? c.raw.stt_prompt : '' }
    : { custom: false, stt: '', tts: '', voice: '', language: '', speed: null, speakWakes: false, speakGates: true, sttPrompt: '' };
}

/** The form's words as the agent's language code, or '' when empty. */
export const languageOf = (s: string): string => s.trim().toLowerCase();
/** Go's strings.TrimSpace: the Unicode white space the agent strips before it counts a prompt (U+0085 yes, U+FEFF no), which JavaScript's trim does not match. */
const GO_SPACE = /^[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
export const promptOf = (s: string): string => s.replace(GO_SPACE, '');
const LANGUAGE_CODE = /^(auto|[a-z]{2,3}(-[a-z0-9]{2,8})*)$/;

/** Why the form cannot be saved, as a string key suffix; undefined when it can. Only what the agent would refuse for its shape; the models decide the rest. */
export function voiceProblem(f: VoiceForm): 'language' | 'speed' | 'prompt' | undefined {
  if (!f.custom) return undefined;
  const lang = languageOf(f.language);
  if (lang !== '' && !LANGUAGE_CODE.test(lang)) return 'language';
  if (f.tts !== '' && f.speed !== null && !(f.speed > 0)) return 'speed';
  if (f.stt !== '' && [...promptOf(f.sttPrompt)].length > STT_PROMPT_MAX) return 'prompt';
  return undefined;
}

export function voiceDirty(f: VoiceForm, c: SpeechConfig | null): boolean {
  const o = voiceFormOf(c);
  if (f.custom !== o.custom) return true;
  if (!f.custom) return false;
  // Only what a save would send: a prompt kept in the form with no listening model is not sent, so it is not a change once saved.
  const prompt = (x: VoiceForm): string => (x.stt !== '' ? promptOf(x.sttPrompt) : '');
  // A voice and a speed go with a speaking model; without one they are not sent, so they are not a change either.
  const voice = (x: VoiceForm): string => (x.tts !== '' ? x.voice.trim() : '');
  const speed = (x: VoiceForm): number | null => (x.tts !== '' ? x.speed : null);
  return f.stt !== o.stt || f.tts !== o.tts || voice(f) !== voice(o) || languageOf(f.language) !== languageOf(o.language) || speed(f) !== speed(o) || f.speakWakes !== o.speakWakes || f.speakGates !== o.speakGates || prompt(f) !== prompt(o);
}

/**
 * The `speech` a save sends. A PATCH replaces it whole, so what the form does not edit (the transcription prompt and the Bot's own daily
 * limits) is carried over from what the Bot holds; a voice or speed with no speaking model, and a prompt with no listening model, are left
 * out because the agent refuses them. null takes the setting away (the default voices apply).
 */
export function speechPatch(f: VoiceForm, c: SpeechConfig | null): Record<string, unknown> | null {
  if (!f.custom) return null;
  const out: Record<string, unknown> = {};
  if (f.stt !== '') out.stt_model = f.stt;
  if (f.tts !== '') out.tts_model = f.tts;
  // A typed voice keeps its inner spaces while it is typed; the ends are trimmed here.
  if (f.tts !== '' && f.voice.trim() !== '') out.voice = f.voice.trim();
  const lang = languageOf(f.language);
  if (lang !== '') out.language = lang;
  if (f.tts !== '' && f.speed !== null) out.speed = f.speed;
  // The prompt the form shows. A model that does not take one is refused by the agent, and the person clears the field.
  const prompt = promptOf(f.sttPrompt);
  if (f.stt !== '' && prompt !== '') out.stt_prompt = prompt;
  out.speak_wakes = f.speakWakes;
  out.speak_gates = f.speakGates;
  const limits = c?.raw.limits;
  if (limits && typeof limits === 'object' && Object.keys(limits).length > 0) out.limits = limits;
  return out;
}

/** The words for a refused voice save, from the agent's code and details (never its text); undefined when it names nothing known. */
export function voiceRefusalKey(code: string | undefined, details: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const field = typeof details?.field === 'string' ? details.field.replace(/^speech\./, '') : '';
  const reason = typeof details?.reason === 'string' ? details.reason : '';
  if (code === 'model_unavailable' && (field === 'tts_model' || field === 'stt_model')) {
    return reason === 'not_tts' || reason === 'not_stt' || reason === 'provider_refused' || reason === 'unknown_model' ? `voice.refused.${field}.${reason}` : `voice.refused.${field}.unknown_model`;
  }
  if (code === 'bad_request' && ['voice', 'language', 'speed', 'stt_prompt'].includes(field)) return `voice.refused.${field}`;
  // The Bot's own daily limits, carried whole from what it holds (speechPatch): one the realm no longer allows refuses every save.
  if (code === 'bad_request' && (field === 'limits.tts_chars' || field === 'limits.stt_seconds')) return 'voice.refused.limits';
  return undefined;
}

/**
 * What a save with the Bot's own voice settings turned off takes away besides the models (speech becomes null): the transcription
 * prompt, the Bot's own daily limits, and with them a speech output or spoken messages turned off by a limit of 0 (the agent reads 0 as
 * off). null when the Bot holds none of these.
 */
export interface VoiceOffLoss {
  prompt: boolean;
  limits: boolean;
  speechOff: boolean;
  listenOff: boolean;
}
export function voiceOffLoss(c: SpeechConfig | null): VoiceOffLoss | null {
  if (!c) return null;
  const prompt = promptOf(typeof c.raw.stt_prompt === 'string' ? c.raw.stt_prompt : '') !== '';
  const lim = c.raw.limits;
  const held = lim !== null && typeof lim === 'object' && !Array.isArray(lim) ? (lim as Record<string, unknown>) : {};
  // The same test speechPatch uses to carry them.
  const limits = Object.keys(held).length > 0;
  const speechOff = held.tts_chars === 0;
  const listenOff = held.stt_seconds === 0;
  return prompt || limits ? { prompt, limits, speechOff, listenOff } : null;
}

/** A check stage as the agent answers it (the fields the page reads). */
export interface StageLike {
  ok: boolean;
  code: string;
  reason: string;
  message: string;
}

/** The reasons the agent gives when it could not ask the speech resolver at all: nothing is known about the model. */
const UNKNOWN_REASONS = ['check_timeout', 'check_failed'];

/** ok, failed (the agent said it does not work), or unknown (it could not be asked: not a "does not work"). */
export function stageKind(s: StageLike): 'ok' | 'failed' | 'unknown' {
  if (s.ok) return 'ok';
  return s.code === 'service_unavailable' && UNKNOWN_REASONS.includes(s.reason) ? 'unknown' : 'failed';
}

/** The whole check: ready; not ready when a stage failed; unknown when nothing failed but something could not be asked (or nothing was checked). */
export function checkSummary(c: { stt: StageLike | null; tts: StageLike | null }): 'ready' | 'notReady' | 'unknown' {
  const kinds = [c.stt, c.tts].filter((s): s is StageLike => s !== null).map(stageKind);
  if (kinds.includes('failed')) return 'notReady';
  if (kinds.length === 0 || kinds.includes('unknown')) return 'unknown';
  return 'ready';
}

// An agent message that names a setting, a route or a command is for its developers: it is never shown to the person.
const TECHNICAL = /(?<![a-z0-9])(?:speech|audio|stt|tts)[._][a-z_]+|\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/|\/api\/|\bsettings?\.[a-z]/i;

/** What to tell the person about a stage that did not work: plain guidance for a known reason, else the agent's message when it is plain, else a general line. */
export function stageWords(s: { message: string; reason: string; code: string }): string {
  const known = (strings as Record<string, string>)[`voice.why.${s.reason}`];
  if (known) return known;
  const msg = plainLine(scrubSecrets(s.message), 200);
  if (msg !== '' && !TECHNICAL.test(msg)) return msg;
  if (msg !== '') return (strings as Record<string, string>)['voice.why.other'] ?? '';
  // Scrubbed before an underscore turns to a space, which would take a key apart.
  return plainLine(scrubSecrets(s.reason || s.code).replace(/_/g, ' '), 200);
}

/** The model's name without its provider, and the provider, for grouping. */
export function audioModelParts(id: string): { provider: string; name: string } {
  const i = id.indexOf('/');
  return i < 0 ? { provider: '', name: id } : { provider: id.slice(0, i), name: id.slice(i + 1) };
}

// ── voice spine ─────────────────────────────────

/** The Mic's state before a press: a kit MicReason when it cannot talk, 'unknownYet' when nothing says it cannot
 *  but readiness or capability is not known yet (the Mic stays enabled and the press runs the voice check), null when
 *  it can. A framed Hub wins; an unknown capability is never "too old". */
export function micReason(o: { framed: boolean; caps: VoiceCaps; check: VoiceCheck | undefined }): MicReason | 'unknownYet' | null {
  if (o.framed) return 'ownTab';
  if (o.caps.check === false) return 'agentOld';
  if (o.check?.ready === false) return 'notSetUp';
  if (o.caps.check === undefined || o.check === undefined) return 'unknownYet';
  return null;
}

/** The log row a spoken send was made from: the user row whose voice names exactly this connection and utterance.
 *  conn compares as sent (no trimming, no case folding); nothing else (sender, text, time) ever counts. */
export function rowForUtterance(rows: readonly LogRow[], conn: string, utt: number): { row: LogRow; seq: number } | null {
  if (conn === '' || !Number.isSafeInteger(utt) || utt <= 0) return null;
  const row = rows.find((r) => r.kind === 'user' && r.voice != null && r.voice.conn === conn && r.voice.utt === utt);
  return row ? { row, seq: row.seq } : null;
}

/** The numbers of a "Today: n of m · resets 00:00 UTC" line: characters read aloud and whole minutes transcribed
 *  (used rounds up, so a started minute shows), and the reset time in UTC. null without a usage read: never zeros. */
export function speechUsageLine(u: SpeechUsage | null): { tts: { used: number; limit: number }; sttMinutes: { used: number; limit: number }; resetsUtc: string } | null {
  if (!u) return null;
  const d = new Date(u.resetsAt);
  if (!Number.isFinite(d.getTime())) return null;
  const hhmm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return {
    tts: { used: Math.round(u.used.ttsChars), limit: u.limits.ttsChars },
    sttMinutes: { used: Math.ceil(u.used.sttSeconds / 60), limit: Math.floor(u.limits.sttSeconds / 60) },
    resetsUtc: hhmm,
  };
}

/** The parts of a spoken row's Activity mark ("Spoken · 0:12 · en"): the origin's strings key, m:ss of its length
 *  (seconds rounded down, at least 0:00), and its language when the agent recorded one. */
export function voiceMarkParts(v: LogVoice): { originKey: `voice.origin.${VoiceOrigin}`; duration: string; lang: string | null } {
  const secs = Math.max(0, Math.floor(v.durationMs / 1000));
  return { originKey: `voice.origin.${v.origin}`, duration: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, lang: v.lang };
}

/** The reasons the agent's voice check gives a stage that does not work (the agent's own
 *  list), each with plain words in strings (voice.why.*, read by stageWords). The relay's own reasons
 *  carry a plain agent message instead. A reason added here without words fails voice.spine.test.ts. */
export const VOICE_CHECK_REASONS = [
  'not_configured', 'wire_not_built', 'unknown_model', 'not_an_stt_model', 'not_a_tts_model', 'provider_refused', 'unavailable',
  'voice_not_found', 'language_not_supported', 'no_credentials',
] as const;


/** The API's 2FA lockout (429): too many wrong two-step codes. The one code a key mint's refusal keeps. */
export const MINT_LOCKED = 'TWOFACTOR_RATE_LIMIT';

/** A failed outcome that is the 2FA lockout gets the page's words for it; every other outcome is returned as it is. */
export function lockNote<O extends { kind: string; code?: string; message?: string }>(o: O | undefined, note: string): O | undefined {
  return o && o.kind === 'failed' && o.code === MINT_LOCKED ? { ...o, message: note } : o;
}
