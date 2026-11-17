// The runtime of the fixture flavour's stand-ins (scripts/term/placeholder.ts synthesizes the modules that call this).
// Never part of a strict or shipped graph (the loader's strict flavour and scripts/term/build.ts refuse this module).
//   phComponent: a missing COMPONENT draws a dim labelled box, so an unported kit piece is visible where it would be.
//   phUnsupported: any other missing export (hook, function, value). Calling it, reading a property, iterating,
//     converting or constructing it throws TermUnsupportedError (code TERM_UNSUPPORTED) naming the export, its module
//     and the importer (the first stack frame outside this file); the page error boundary shows it. Missing behaviour
//     never looks like success.
//   phHole: the inert value of the old black-hole behaviour, ONLY for names on scripts/term/placeholder.allow.json (a
//     list that only shrinks); every use is recorded as `allowed`, and a page with an allowed use is never accepted.
import { createElement, type ReactElement, type ReactNode } from 'react';
import { Box } from './prim/Box';
import { Text, useInText } from './prim/Text';

export interface PlaceholderModule { file: string; reason: string; names: readonly string[] }
export interface PlaceholderUse { name: string; file: string; count: number; importer?: string }

const modules = new Map<string, PlaceholderModule>();
const rendered = new Map<string, PlaceholderUse>();
const allowed = new Map<string, PlaceholderUse>();
const unsupported = new Map<string, PlaceholderUse>();

export function phModule(file: string, reason: string, names: readonly string[]): void {
  modules.set(file, { file, reason, names });
}
const bump = (m: Map<string, PlaceholderUse>, name: string, file: string, importer?: string): void => {
  const k = file + '#' + name + (importer ? '@' + importer : '');
  const u = m.get(k);
  if (u) u.count++; else m.set(k, { name, file, count: 1, ...(importer ? { importer } : {}) });
};

export interface PlaceholderLedger {
  modules: PlaceholderModule[];
  /** Placeholder components drawn. */
  rendered: PlaceholderUse[];
  /** Allowance-list holes read or called (a page with any is not acceptable). */
  allowed: PlaceholderUse[];
  /** TERM_UNSUPPORTED throws. */
  unsupported: PlaceholderUse[];
  /** Compatibility name for `allowed` (older reports call it `touched`). */
  touched: PlaceholderUse[];
}

/** What the run has stood in for so far. */
export function placeholderLedger(): PlaceholderLedger {
  const a = [...allowed.values()];
  return { modules: [...modules.values()], rendered: [...rendered.values()], allowed: a, unsupported: [...unsupported.values()], touched: a };
}
export function clearPlaceholderUses(): void { rendered.clear(); allowed.clear(); unsupported.clear(); }

const CLOSED = ['isOpen', 'open', 'shown', 'visible'] as const;

export function phComponent(name: string, file: string): (props: Record<string, unknown>) => ReactElement | null {
  function Placeholder(props: Record<string, unknown>): ReactElement | null {
    const inText = useInText();
    for (const k of CLOSED) if (props[k] === false) return null;
    bump(rendered, name, file);
    const label = `‹${name}›`;
    if (inText) return createElement(Text, { dim: true }, label);
    const kids = props.children as ReactNode;
    const drawable = kids !== undefined && kids !== null && typeof kids !== 'function';
    return createElement(Box, { dir: 'column', border: ['left'], borderColour: 'line', pad: { left: 1 } },
      createElement(Text, { dim: true, truncate: true }, label),
      drawable ? createElement(PlaceholderChildren, null, kids) : null);
  }
  Object.defineProperty(Placeholder, 'name', { value: `Placeholder(${name})` });
  return Placeholder;
}

/** Children of a placeholder: bare text gets a Text around it. */
function PlaceholderChildren({ children }: { children?: ReactNode }): ReactNode {
  const list = Array.isArray(children) ? children : [children];
  return list.map((c, i) => (typeof c === 'string' || typeof c === 'number' ? createElement(Text, { key: i }, String(c)) : c)) as ReactNode;
}

/** The structured error of a missing non-visual export. */
export class TermUnsupportedError extends Error {
  readonly code = 'TERM_UNSUPPORTED';
  constructor(readonly exportName: string, readonly module: string, readonly importer: string, readonly operation: string) {
    super(`TERM_UNSUPPORTED: ${exportName} from ${module} (${operation}, used by ${importer}) has no terminal implementation; port it in a .term sibling or hand the feature off`);
    this.name = 'TermUnsupportedError';
  }
}

const SELF = /\/src\/term\/placeholder\.[jt]sx?/;
/** The first stack frame outside this module: the code that used the missing export. */
function importerOf(stack: string | undefined): string {
  for (const line of (stack ?? '').split('\n').slice(1)) {
    const m = /\(?((?:\/|[A-Za-z]:\\)[^():]+):\d+:\d+\)?\s*$/.exec(line.trim());
    if (m && !SELF.test(m[1]!)) {
      const at = m[1]!.indexOf('/src/');
      return at >= 0 ? m[1]!.slice(at + 1) : m[1]!;
    }
  }
  return 'unknown';
}

/** Keys React, the inspector and the runtime read on any value: answering them is not a use. */
const INTROSPECTION = new Set<PropertyKey>(['$$typeof', 'then', 'displayName', '_payload', '_init', 'prototype', 'constructor', Symbol.toStringTag, Symbol.for('nodejs.util.inspect.custom')]);

export function phUnsupported(name: string, file: string): unknown {
  const fail = (operation: string): never => {
    const e = new TermUnsupportedError(name, file, 'unknown', operation);
    const importer = importerOf(e.stack);
    const err = new TermUnsupportedError(name, file, importer, operation);
    bump(unsupported, name, file, importer);
    throw err;
  };
  const fn = function unsupported(): void {};
  Object.defineProperty(fn, 'name', { value: `Unsupported(${name})` });
  return new Proxy(fn, {
    get(t, k) {
      if (INTROSPECTION.has(k)) return k === 'prototype' ? undefined : k === 'displayName' ? `Unsupported(${name})` : undefined;
      if (k === 'name') return t.name;
      return fail(`read .${String(k)}`);
    },
    apply: () => fail('call'),
    construct: () => fail('new'),
    has: (_t, k) => fail(`'${String(k)}' in`),
    ownKeys: () => fail('keys'),
    set: (_t, k) => fail(`write .${String(k)}`),
  });
}

/** An inert value that takes anything done to it: ONLY for allowance-list names (placeholder.allow.json). */
export function phHole(name: string, file: string): unknown {
  const fn = (): unknown => proxy; // an arrow: no own non-configurable keys, so spread and keys() hold
  const proxy: unknown = new Proxy(fn, {
    get(_t, k) {
      if (k === 'then') return undefined; // never a thenable: `await hole` must settle
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toPrimitive) return () => '';
      if (k === '$$typeof' || k === 'displayName' || k === 'prototype') return undefined;
      if (k === 'toString' || k === 'valueOf') return () => '';
      if (k === 'length') return 0;
      if (typeof k === 'symbol') return undefined;
      bump(allowed, name, file);
      return proxy;
    },
    apply() { bump(allowed, name, file); return proxy; },
    has: () => false,
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => undefined,
  });
  return proxy;
}
