// A New script draft: the settings and edits of one New script, held in
// memory per tab, keyed by account, realm and draft id. No storage key: what a reload can bring back comes from the attempt's
// stored record and its prompt (prompt.ts); what it cannot (typed input before a build, edited code, a changed setting, idea
// fields, the public-link choice) is what the leave guard names (dirty).
import type { Binding } from '../data';
import { addressOk } from '../logic';

export type Way = 'ai' | 'idea' | 'write';
export type StepId = 'what' | 'where' | 'build' | 'fill' | 'write' | 'check' | 'live';

export const DRAFT_ID = /^[0-9a-z]{10}$/;
const SCHEDULE = /^[0-9*,/-]+(?: [0-9*,/A-Za-z-]+){4}$/;

export interface Draft {
  readonly id: string;
  way: Way;
  /** Null until step 2 has a computer. */
  binding: Binding | null;
  description: string;
  idea: string | null;
  fields: Record<string, string>;
  route: string;
  routeTouched: boolean;
  /** Five-field cron (UTC); null = only when its address is called. */
  schedule: string | null;
  link: boolean;
  /** False after a restore until the person confirms the link choice (it cannot be recovered): Check and Live wait for it. */
  linkAcknowledged: boolean;
  /** False after a restore whose stored prompt did not read back (address, schedule, folder): Check and Live wait until the
   *  person confirms them (the same rule as linkAcknowledged). */
  settingsConfirmed: boolean;
  code: string;
  codeEdited: boolean;
  /** The current attempt n (0: no build started). */
  attempt: number;
  /** Rebuilt from a stored attempt. */
  restored: boolean;
  /** What the current attempt was asked with (or kept with, Keep this code), so Check names inputs changed since. A restore
   *  sets it to the inputs it rebuilt; it lives with the draft, so leaving the wizard and coming back keeps it. */
  builtWith: BuiltWith | null;
}

/** What a build was started with: Check names the inputs changed since. */
export interface BuiltWith { description: string; route: string; schedule: string | null; compId: string }

export function newDraft(id: string, way: Way): Draft {
  return { id, way, binding: null, description: '', idea: null, fields: {}, route: '', routeTouched: false, schedule: null, link: false, linkAcknowledged: true, settingsConfirmed: true, code: '', codeEdited: false, attempt: 0, restored: false, builtWith: null };
}

/** The steps of a way. An idea without fields has no Fill it in. */
export function stepsOf(way: Way, ideaHasFields: boolean): StepId[] {
  if (way === 'ai') return ['what', 'where', 'build', 'check', 'live'];
  if (way === 'write') return ['what', 'where', 'write', 'check', 'live'];
  return ideaHasFields ? ['what', 'where', 'fill', 'check', 'live'] : ['what', 'where', 'check', 'live'];
}

/** What a step still needs, as reasons the page words ("Check it first"); empty = the step can be left forward. */
export function missing(d: Draft, step: StepId, o: { ideaFields?: readonly string[]; codeReady?: boolean; checked?: boolean } = {}): string[] {
  const out: string[] = [];
  if (step === 'what') {
    if (d.way === 'ai' && !d.description.trim()) out.push('description');
    if (d.way === 'idea' && !d.idea) out.push('idea');
  } else if (step === 'where') {
    if (!d.binding) out.push('computer');
    if (!addressOk(d.route)) out.push('address');
    if (d.schedule !== null && !SCHEDULE.test(d.schedule)) out.push('schedule');
    if (!d.linkAcknowledged) out.push('link');
  } else if (step === 'fill') {
    for (const f of o.ideaFields ?? []) if (!(d.fields[f] ?? '').trim()) out.push(`field:${f}`);
  } else if (step === 'build' || step === 'write') {
    if (!o.codeReady) out.push('code');
  } else if (step === 'check') {
    if (!o.checked) out.push('check');
  }
  return out;
}

/** The steps that can be shown: each step whose earlier steps need nothing more. */
export function reachable(d: Draft, o: { ideaHasFields: boolean; ideaFields?: readonly string[]; codeReady?: boolean; checked?: boolean }): StepId[] {
  const steps = stepsOf(d.way, o.ideaHasFields);
  const out: StepId[] = [];
  for (const s of steps) {
    out.push(s);
    if (missing(d, s, o).length > 0) break;
  }
  return out;
}

/**
 * What the leave guard names ({what} in "Your changes here aren't kept: {what}"), or null when the draft leaves freely.
 * `recoverable` is the draft as a reload would rebuild it from the stored attempt and its prompt, or null when no attempt's
 * prompt is recoverable yet (no build, or one whose prompt is not stored with the session yet).
 */
export function dirty(d: Draft, recoverable: Draft | null): string[] | null {
  const what: string[] = [];
  if (d.attempt === 0 || recoverable === null) {
    // Nothing a reload could bring back: anything typed is lost.
    if (d.description.trim() || d.routeTouched || d.schedule !== null || d.link) what.push('typed');
    if (d.attempt > 0 && recoverable === null && !what.includes('typed')) what.push('typed');
  } else {
    const r = recoverable;
    if (d.description !== r.description) what.push('typed');
    const b = d.binding, rb = r.binding;
    if (d.route !== r.route || d.schedule !== r.schedule || d.link !== r.link || (b?.exec ?? null) !== (rb?.exec ?? null) || (b?.target.container.id ?? null) !== (rb?.target.container.id ?? null)) what.push('settings');
  }
  if (d.codeEdited) what.push('code');
  if (d.way === 'idea' && Object.values(d.fields).some((v) => v.trim())) what.push('fields');
  return what.length > 0 ? what : null;
}

// ── the in-memory map (per tab) ───────────────────────────────────────────────────────────────────

const drafts = new Map<string, Draft>();
const keyOf = (account: string, realm: string, id: string): string => `${account}\u0000${realm}\u0000${id}`;

export const getDraft = (account: string, realm: string, id: string): Draft | undefined => drafts.get(keyOf(account, realm, id));
export function putDraft(account: string, realm: string, d: Draft): void {
  if (!account || !DRAFT_ID.test(d.id)) return;
  drafts.set(keyOf(account, realm, d.id), d);
}
export const dropDraft = (account: string, realm: string, id: string): void => { drafts.delete(keyOf(account, realm, id)); };
/** Account or realm change and sign-out (after the guard was answered; forced teardown calls it without asking). */
export function clearDrafts(): void { drafts.clear(); }
/** Drafts of other accounts or realms are dropped when the shown one changes: none of them is ever shown under another. */
export function keepOnly(account: string, realm: string): void {
  const prefix = `${account}\u0000${realm}\u0000`;
  for (const k of [...drafts.keys()]) if (!k.startsWith(prefix)) drafts.delete(k);
}
export const draftCount = (): number => drafts.size;
