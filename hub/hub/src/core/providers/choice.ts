// The choice contract of the model picker: what a picker hands its caller, and the one judgement
// every final action makes (save, Create, Confirm, Ask) against the newest evidence in today's scope. Pure.
// Readiness travels with the choice, consent is per model and per scope, and nothing unread is ever sent.
import { claudeModelOf } from '../agent/claude';
import { FREE, prefixOf, providerState } from './catalogue';
import { sameScope, type Evidence, type Scope } from './read';
import { readinessOf } from './readiness';

export type Choice =
  /** '' on the wire: the caller's own default (Bots: the bot agent's own model). No readiness claim, never replaced by Hoody Free. */
  | { kind: 'inherit' }
  | { kind: 'model'; spec: string; readiness: 'ready' | 'unknown'; consent: boolean; scope: Scope; seq: number };

export interface JudgeRules {
  /** The caller's API accepts '' (Bots). */
  inherit: boolean;
  /** Purpose and backend: explain = output cap, no ensembles, no Claude Code; agent = the backend filter. */
  eligible: (spec: string, ev: Evidence) => boolean;
  /** Explicit specs usable (with consent) after a settled catalogue failure: the caller's rows, its current value, Hoody Free. */
  fallback: ReadonlySet<string>;
}

export type Verdict =
  | { ok: true; readiness: 'ready' | 'unknown' | 'inherited' }
  | { ok: false; why: 'unread' | 'scope' | 'ineligible' | 'needs_consent' | 'needs_setup' | 'gone' };

export type Purpose = 'bot' | 'default' | 'explain' | 'agent';

const isFusion = (spec: string): boolean => prefixOf(spec) === 'fusion';
const isClaude = (spec: string): boolean => claudeModelOf(spec) !== null;

/** The rules of one caller, built once; the chooser and the caller's final action share them. */
export function rulesFor(purpose: Purpose, o: { inherit?: boolean; fallback?: Iterable<string> } = {}): JudgeRules {
  const eligible = (spec: string, ev: Evidence): boolean => {
    if (purpose === 'agent') return isClaude(spec) ? ev.claude !== null : true;
    if (isClaude(spec)) return false;
    if (purpose === 'bot') return true;
    if (isFusion(spec)) return false;
    if (purpose === 'default') return true;
    // explain: the provider must accept an output cap (never a ChatGPT sign-in); unknown without a catalogue.
    if (ev.catalogue.state !== 'ok') return true;
    const cat = ev.catalogue.value.cat;
    return providerState(cat, cat.byPrefix[prefixOf(spec)]).completion;
  };
  return { inherit: o.inherit === true, eligible, fallback: new Set([FREE, ...(o.fallback ?? [])]) };
}

const consented = (choice: Choice | null, spec: string, now: Scope): boolean =>
  !!choice && choice.kind === 'model' && choice.spec === spec && choice.consent && sameScope(choice.scope, now);

/**
 * At a final action: the held choice for `spec` (null = none held), against the newest accepted evidence, in
 * today's scope (null = no computer). In order: unread (no computer, no evidence, evidence of another scope),
 * inherit, a held choice of another scope, then the part that holds the spec.
 */
export function judge(choice: Choice | null, spec: string, ev: Evidence | null, now: Scope | null, rules: JudgeRules): Verdict {
  if (!now || !ev || !sameScope(ev.scope, now)) return { ok: false, why: 'unread' };
  if (choice?.kind === 'inherit') return rules.inherit ? { ok: true, readiness: 'inherited' } : { ok: false, why: 'ineligible' };
  if (choice && choice.kind === 'model' && !sameScope(choice.scope, now)) return { ok: false, why: 'scope' };
  const consent = consented(choice, spec, now);
  const unknown = (): Verdict => (consent ? { ok: true, readiness: 'unknown' } : { ok: false, why: 'needs_consent' });
  const part = isClaude(spec) ? ev.claude : ev.catalogue;
  if (!part) return { ok: false, why: 'ineligible' };
  if (part.state === 'loading') return { ok: false, why: 'unread' };
  // A settled failure leaves the caller's explicit fallback specs, still under the purpose's own rules (with no
  // catalogue those are the name exclusions: Claude Code rows, ensembles), so no fallback set can widen a purpose.
  if (part.state === 'failed') return rules.fallback.has(spec) && rules.eligible(spec, ev) ? unknown() : { ok: false, why: 'ineligible' };
  if (!rules.eligible(spec, ev)) return { ok: false, why: 'ineligible' };
  const r = readinessOf(ev, spec);
  if (r === 'ready') return { ok: true, readiness: 'ready' };
  if (r === 'needs_key') return { ok: false, why: 'needs_setup' };
  if (r === 'gone') return { ok: false, why: 'gone' };
  return unknown();
}
