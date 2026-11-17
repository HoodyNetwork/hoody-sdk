// The platform-neutral scenario runner: mounts a case through a Driver, plays its steps, checks its expectations.
// No DOM, no engine here: the web driver (web-driver.ts, vitest + testing-library) and the terminal driver
// (term-driver.ts, semantics tree) implement `Driver`.
import { createElement, useState, type ReactElement } from 'react';
import { ANY, type Case, type Html, type Expect, type NodeExpect, type ScenarioFile, type Spies, type Step, type Target } from './types';

/** What a driver reports about one node (role and states in ARIA terms). */
export interface NodeInfo {
  role: string;
  name: string;
  description: string;
  value?: string;
  states: Record<string, boolean | 'mixed' | string | undefined>;
}

export type ActKind = 'press' | 'click' | 'type' | 'setValue' | 'clear' | 'focus';

export interface Session<H = unknown> {
  /** One node or a ScenarioError naming the target and dumping what is there. */
  find(t: Exclude<Target, 'focused'>): Promise<H>;
  /** All nodes the target matches (no throw). */
  findAll(t: Exclude<Target, 'focused'>): Promise<H[]>;
  info(h: H): NodeInfo;
  focused(): Promise<NodeInfo | null>;
  act(h: H, kind: ActKind, arg: string | undefined, force: boolean): Promise<void>;
  key(k: string): Promise<void>;
  /** Let updates land (after a rerender). */
  settle(): Promise<void>;
  /** Fire held long timers, then settle (web: settle). */
  releaseHeld?(): Promise<void>;
  /** What was still under way when the last settle gave up (queries, mutations, timers), else null. */
  unsettled?(): string | null;
  /** Everything a person or an agent could read: drawn text / DOM text, the semantics tree, attribute values. */
  readable(): Promise<string>;
  /** Only what an agent reads: the semantics tree (text form and JSON) / the accessibility tree. */
  treeText(): Promise<string>;
  /** What was copied to the clipboard since mount, in order. */
  copies(): Promise<string[]>;
  /** What was handed outside the Hub to be opened since mount, in order. */
  opened(): Promise<string[]>;
  /** The router's pathname plus search now. */
  location(): Promise<string>;
  dump(): string;
  unmount(): void;
}

export interface Driver {
  platform: 'web' | 'term';
  html: Html;
  /** `watchOpen`: the case checks `opened` (the terminal then gives the mount a host that records openings). */
  mount(el: ReactElement, o?: { at?: string; webOrigin?: string; watchOpen?: boolean }): Promise<Session>;
}

export class ScenarioError extends Error {}

export interface CaseResult { name: string; ok: boolean; skipped?: string; error?: string; ms: number }
export interface FileResult { component: string; platform: 'web' | 'term'; cases: CaseResult[] }

// ---------------------------------------------------------------------------------------------------------------

export function makeSpies(): Spies & { names(): string[] } {
  const log = new Map<string, unknown[][]>();
  return {
    fn(name, impl) {
      if (!log.has(name)) log.set(name, []);
      return ((...args: unknown[]) => { log.get(name)!.push(args); return impl?.(...(args as never)); }) as never;
    },
    calls: (name) => log.get(name) ?? [],
    names: () => [...log.keys()],
  };
}

/** The mounted tree: props live in state so `rerender` and `control` work the same on both platforms. */
interface HarnessApi { set(p: Record<string, unknown>): void }

function harness(file: ScenarioFile<Record<string, unknown>>, c: Case<Record<string, unknown>>, initial: Record<string, unknown>, spies: Spies, api: HarnessApi, html: Html): ReactElement {
  const C = file.impl;
  function Host(): ReactElement | null {
    const [props, setProps] = useState(initial);
    api.set = (p) => setProps((old) => ({ ...old, ...p }));
    let eff = props;
    if (c.control) {
      const { value, onChange } = c.control;
      const inner = props[onChange] as ((...a: unknown[]) => unknown) | undefined;
      eff = { ...props, [onChange]: (v: unknown, ...rest: unknown[]) => { setProps((old) => ({ ...old, [value]: v })); return inner?.(v, ...rest); } };
    }
    return c.mount ? c.mount(C, eff, spies, html) : createElement(C as never, eff);
  }
  return createElement(Host);
}

// ---------------------------------------------------------------------------------------------------------------
// Matching

const show = (v: unknown): string => (typeof v === 'symbol' ? 'ANY' : v instanceof RegExp ? String(v) : (() => { try { return JSON.stringify(v, (_k, x) => (typeof x === 'function' ? '[fn]' : x)); } catch { return String(v); } })());

export function argMatches(want: unknown, got: unknown): boolean {
  if (want === ANY) return true;
  if (want && typeof want === 'object') {
    const w = want as Record<string, unknown>;
    if ('$type' in w) return typeof got === w.$type;
    if ('$match' in w) return typeof got === 'string' && (w.$match as RegExp).test(got);
    if ('$partial' in w) return !!got && typeof got === 'object' && Object.entries(w.$partial as object).every(([k, v]) => argMatches(v, (got as Record<string, unknown>)[k]));
    if (Array.isArray(want)) return Array.isArray(got) && got.length === want.length && want.every((x, i) => argMatches(x, got[i]));
    if (!got || typeof got !== 'object') return false;
    const gk = Object.keys(got as object);
    return gk.length === Object.keys(w).length && Object.entries(w).every(([k, v]) => argMatches(v, (got as Record<string, unknown>)[k]));
  }
  return Object.is(want, got);
}

const nameOk = (n: string, want: string | RegExp | undefined, exact = true): boolean =>
  want === undefined || (want instanceof RegExp ? want.test(n) : exact ? n === want.replace(/\s+/g, ' ').trim() : n.toLowerCase().includes(want.toLowerCase()));

export function infoMatches(i: NodeInfo, t: Target): boolean {
  if (t === 'focused') return i.states.focused === true;
  if ('text' in t) return nameOk(i.name, t.text, false);
  if (i.role !== t.role || !nameOk(i.name, t.name, t.exact)) return false;
  for (const k of ['checked', 'selected', 'expanded', 'pressed'] as const) if (t[k] !== undefined && (i.states[k] ?? false) !== t[k]) return false;
  return true;
}

const describeTarget = (t: Target): string => (t === 'focused' ? 'the focused node' : 'text' in t ? `text ${show(t.text)}` : `${t.role}${t.name !== undefined ? ` ${show(t.name)}` : ''}${t.nth !== undefined ? ` #${t.nth}` : ''}`);

async function resolve(s: Session, t: Target): Promise<unknown> {
  if (t === 'focused') {
    const f = await s.focused();
    if (!f) throw new ScenarioError(`nothing has the focus\n${s.dump()}`);
    return s.find({ role: f.role, name: f.name });
  }
  if (typeof t === 'object' && 'role' in t && t.nth !== undefined) {
    const all = await s.findAll(t);
    const h = all[t.nth];
    if (h === undefined) throw new ScenarioError(`${describeTarget(t)}: only ${all.length} found\n${s.dump()}`);
    return h;
  }
  return s.find(t);
}

const stateOk = (want: unknown, got: unknown): boolean => (want === false ? got === undefined || got === false : want === got);

async function check(s: Session, e: Expect, spies: Spies, where: string): Promise<void> {
  const fail = (m: string): never => { throw new ScenarioError(`${where}: ${m}`); };
  for (const [name, want] of Object.entries(e.calls ?? {})) {
    const got = spies.calls(name);
    if (typeof want === 'number') { if (got.length !== want) fail(`${name} called ${got.length} time(s), expected ${want}${got.length ? `: ${got.map((a) => show(a)).join(' ')}` : ''}`); }
    else if (got.length !== want.length || !want.every((w, i) => argMatches(w, got[i]))) fail(`${name} calls ${show(got)}, expected ${show(want)}`);
  }
  for (const n of e.nodes ?? []) await checkNode(s, n, fail);
  if (e.focused !== undefined) {
    const f = await s.focused();
    if (e.focused === null) { if (f) fail(`focus on ${f.role} ${show(f.name)}, expected none`); }
    else if (!f || !infoMatches(f, e.focused)) fail(`focus on ${f ? `${f.role} ${show(f.name)}` : 'nothing'}, expected ${describeTarget(e.focused)}\n${s.dump()}`);
  }
  if (e.neverShown?.length) {
    const all = await s.readable();
    for (const x of e.neverShown) if (all.includes(x)) fail(`${show(x)} is readable (it must never show)`);
  }
  if (e.copied !== undefined) {
    const got = await s.copies();
    const want = e.copied === 0 ? [] : e.copied;
    if (got.length !== want.length || !want.every((w, i) => w === got[i])) fail(`copied ${got.length ? got.map((x) => show(x)).join(' ') : 'nothing'}, expected ${want.length ? want.map((x) => show(x)).join(' ') : 'nothing'}`);
  }
  if (e.opened !== undefined) {
    const got = await s.opened();
    const want = e.opened === 0 ? [] : e.opened;
    if (got.length !== want.length || !want.every((w, i) => w === got[i])) fail(`opened ${got.length ? got.map((x) => show(x)).join(' ') : 'nothing'}, expected ${want.length ? want.map((x) => show(x)).join(' ') : 'nothing'}`);
  }
  if (e.location !== undefined) {
    const at = await s.location();
    if (!(e.location instanceof RegExp ? e.location.test(at) : at === e.location)) fail(`the router is at ${show(at)}, expected ${show(e.location)}`);
  }
  if (e.treeNever?.length) {
    const tr = await s.treeText();
    for (const x of e.treeNever) if (tr.includes(x)) fail(`${show(x)} is in the agent-readable tree (it may show on screen only)`);
  }
}

async function checkNode(s: Session, n: NodeExpect, fail: (m: string) => never): Promise<void> {
  if (n.target === 'focused') {
    const f = await s.focused();
    if (n.absent) { if (f) fail(`expected no focused node, found ${f.role} ${show(f.name)}`); return; }
    if (!f) fail('nothing has the focus');
  }
  if (n.absent) {
    const found = typeof n.target === 'object' ? await s.findAll(n.target) : [];
    if (found.length) fail(`${describeTarget(n.target)} is present, expected absent`);
    return;
  }
  const i = s.info(await resolve(s, n.target));
  const where = describeTarget(n.target);
  if (n.name !== undefined && !nameOk(i.name, n.name)) fail(`${where}: name ${show(i.name)}, expected ${show(n.name)}`);
  if (n.description !== undefined && !(n.description instanceof RegExp ? n.description.test(i.description) : i.description.includes(n.description))) fail(`${where}: description ${show(i.description)}, expected ${show(n.description)}`);
  if (n.value !== undefined && i.value !== n.value) fail(`${where}: value ${show(i.value)}, expected ${show(n.value)}`);
  for (const [k, v] of Object.entries(n.states ?? {})) if (!stateOk(v, i.states[k])) fail(`${where}: ${k} is ${show(i.states[k] ?? false)}, expected ${show(v)}\n${s.dump()}`);
}

async function play(s: Session, step: Step, spies: Spies, api: HarnessApi, where: string): Promise<void> {
  const force = 'force' in step && step.force === true;
  if ('press' in step) return s.act(await resolve(s, step.press), 'press', undefined, force);
  if ('click' in step) return s.act(await resolve(s, step.click), 'click', undefined, force);
  if ('type' in step) return s.act(await resolve(s, step.type[0]), 'type', step.type[1], force);
  if ('setValue' in step) return s.act(await resolve(s, step.setValue[0]), 'setValue', step.setValue[1], force);
  if ('clear' in step) return s.act(await resolve(s, step.clear), 'clear', undefined, force);
  if ('focus' in step) return s.act(await resolve(s, step.focus), 'focus', undefined, false);
  if ('key' in step) return s.key(step.key);
  if ('rerender' in step) { api.set(step.rerender); return s.settle(); }
  if ('releaseHeld' in step) return s.releaseHeld ? s.releaseHeld() : s.settle();
  if ('expect' in step) return check(s, step.expect, spies, where);
}

/** The case checks what was opened, at the end or in an `expect` step. */
const watchesOpen = (c: Case<Record<string, unknown>>): boolean => c.expect?.opened !== undefined || c.steps.some((st) => 'expect' in st && st.expect.opened !== undefined);

/** Runs every case of a scenario file on one driver. */
export async function runScenarioFile(file: ScenarioFile<never>, driver: Driver, only?: (name: string) => boolean): Promise<FileResult> {
  const f = file as unknown as ScenarioFile<Record<string, unknown>>;
  const cases: CaseResult[] = [];
  for (const c of f.cases) {
    if (only && !only(c.name)) continue;
    const t0 = performance.now();
    if (c.only && c.only.platform !== driver.platform) { cases.push({ name: c.name, ok: true, skipped: c.only.why, ms: 0 }); continue; }
    const spies = makeSpies();
    const api: HarnessApi = { set() {} };
    const props = typeof c.props === 'function' ? (c.props as (s: Spies) => Record<string, unknown>)(spies) : c.props;
    let s: Session | null = null;
    try {
      s = await driver.mount(harness(f, c, props, spies, api, driver.html), { ...(c.at ? { at: c.at } : {}), ...(c.webOrigin !== undefined ? { webOrigin: c.webOrigin } : {}), ...(watchesOpen(c) ? { watchOpen: true } : {}) });
      for (const [i, st] of c.steps.entries()) await play(s, st, spies, api, `step ${i + 1}`);
      if (c.expect) await check(s, c.expect, spies, 'expect');
      // Judged on a settled tree only: work still under way (a query, a mutation, a short timer) means the expectation
      // may have read a frame from before it landed.
      const still = s.unsettled?.();
      if (still) throw new ScenarioError(`unsettled: ${still}`);
      cases.push({ name: c.name, ok: true, ms: performance.now() - t0 });
    } catch (err) {
      cases.push({ name: c.name, ok: false, error: err instanceof Error ? err.message : String(err), ms: performance.now() - t0 });
    } finally {
      s?.unmount();
    }
  }
  return { component: f.component, platform: driver.platform, cases };
}

/** The props a scenario file exercises (case props, evaluated with throwaway spies, plus `covers`). */
export function exercisedProps(file: ScenarioFile<never>): Set<string> {
  const out = new Set<string>();
  for (const c of (file as unknown as ScenarioFile<Record<string, unknown>>).cases) {
    const p = typeof c.props === 'function' ? (c.props as (s: Spies) => Record<string, unknown>)(makeSpies()) : c.props;
    for (const k of Object.keys(p)) out.add(k);
    for (const k of c.covers ?? []) out.add(k);
    if (c.control) { out.add(c.control.value); out.add(c.control.onChange); }
    for (const st of c.steps) if ('rerender' in st) for (const k of Object.keys(st.rerender)) out.add(k);
  }
  return out;
}

/** Scenario module default export: one file or several. */
export const filesOf = (mod: { default?: unknown }): ScenarioFile<never>[] => {
  const d = mod.default;
  return (Array.isArray(d) ? d : d ? [d] : []) as ScenarioFile<never>[];
};
