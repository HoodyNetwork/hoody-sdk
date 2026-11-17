// The scenario API's types and helpers. A plain `X.scenario.ts` file is shared by the web and terminal runners, so it
// imports nothing from the terminal: scenario files import from here, and src/term/scenario/types.ts re-exports this
// module for the runners. Guide: src/term/docs/scenarios.md.
//
// Shared behaviour scenarios: one `X.scenario.ts` beside `X.tsx` describes what the component DOES, as a person sees and
// uses it (find by role and name, press, type, keys), and what must follow (callbacks and their arguments, states,
// focus, text that must never show). The same file runs twice:
//   - web: under vitest + testing-library (happy-dom), `./X` is the web component;
//   - terminal: under the terminal loader, `./X` resolves to `X.term.tsx`, driven through the semantics tree.
// Both must pass: that is the behavioural contract between a component and its terminal sibling. Guide: src/term/docs/scenarios.md.
//
// Plain TS, no platform imports: this file is loaded by both drivers.
import type { ReactElement, ReactNode } from 'react';

/** ARIA role names (the web's getByRole names; the terminal tree uses the same). */
export type ScRole = string;

/** How a step finds a thing: by role (+ name / states), by visible text, or whatever has the focus. */
export type Target =
  | { role: ScRole; name?: string | RegExp; exact?: boolean; checked?: boolean | 'mixed'; selected?: boolean; expanded?: boolean; pressed?: boolean | 'mixed'; level?: number; nth?: number }
  | { text: string | RegExp }
  | 'focused';

export type Step =
  /** Keyboard activation: focus it, then Enter (Space for checkbox / switch / radio). */
  | { press: Target; force?: boolean }
  /** Mouse activation: primary button down + up on it. */
  | { click: Target; force?: boolean }
  /** Focus it and type (appends). */
  | { type: [Target, string]; force?: boolean }
  /** Replace the value: clear, then type. */
  | { setValue: [Target, string]; force?: boolean }
  | { clear: Target; force?: boolean }
  | { focus: Target }
  /** A key to whatever has the focus: 'tab', 'shift+tab', 'enter', 'space', 'escape', 'up', 'down', 'home', 'end', 'ctrl+a', 'x'. */
  | { key: string }
  /** New props for the mounted component (merged over the case's props): a controlled parent changing its value. */
  | { rerender: Record<string, unknown> }
  /** Fire the long timers the terminal driver holds (a slow fixture answer, a toast's dismissal; idle.ts), then settle.
   *  The web driver holds none: it only settles. */
  | { releaseHeld: true }
  | { expect: Expect };

/** `force: true`: send the input even though the node offers no such action (to prove a disabled control is inert). */

export interface NodeExpect {
  target: Target;
  /** The node must not exist (or be hidden). */
  absent?: true;
  name?: string | RegExp;
  /** Description (aria-describedby / disabled reason / error text), substring or regex. */
  description?: string | RegExp;
  value?: string;
  /** Only the states named are compared; `false` means "absent or false". */
  states?: Partial<Record<'disabled' | 'readonly' | 'required' | 'invalid' | 'busy' | 'focused' | 'checked' | 'selected' | 'expanded' | 'pressed' | 'current' | 'secret', boolean | 'mixed' | string>>;
}

export interface Expect {
  /** Spy name -> number of calls, or the exact argument lists (use ANY / M.* for loose matching). */
  calls?: Record<string, number | unknown[][]>;
  nodes?: NodeExpect[];
  /** What has the focus afterwards (null: nothing in the component). */
  focused?: Target | null;
  /** Strings that must appear NOWHERE a person or an agent can read: drawn frame / DOM text, semantics tree, attributes. */
  neverShown?: string[];
  /** Strings that must never reach the agent-readable tree (semantics text and JSON; on the web the accessibility
   *  names, descriptions and values), while the frame / page text MAY show them (a revealed secret). */
  treeNever?: string[];
  /** What went to the clipboard, in order (terminal: the renderer's OSC 52 copies; web: navigator.clipboard.writeText).
   *  0: nothing was copied. */
  copied?: string[] | 0;
  /** What was handed outside the Hub to be opened, in order (terminal: the host's openExternal, which openOutside and
   *  the hand-off's Open use; web: window.open and a followed new-tab link). 0: nothing was opened. Pair it with
   *  `neverShown` to prove a masked address still opens whole. */
  opened?: string[] | 0;
  /** Where the router is after the steps: pathname plus search (`/page?tab=2`). Cases start at `at` (default /page). */
  location?: string | RegExp;
}

/** Builds raw HTML the way each platform does (web: React's createElement; terminal: the compat runtime). Use it for
 *  every DOM tag in `mount` (a plain createElement('div') is not a compat element in the terminal). Components: pass them
 *  as `type` too. */
export type Html = (type: string | ((p: never) => ReactElement | null), props: Record<string, unknown> | null, ...children: unknown[]) => ReactElement;

/** Records calls of named callbacks: `s.fn('onPress')`. */
export interface Spies {
  fn<A extends unknown[] = unknown[], R = void>(name: string, impl?: (...args: A) => R): (...args: A) => R;
  calls(name: string): unknown[][];
}

/** Every prop name of P (of each member, when P is a union). */
type PropName<P> = P extends unknown ? keyof P : never;

/** The props a case writes: the component's prop names with plain data for values, any of them left out. One scenario
 *  text feeds two components (the web one and its terminal sibling) whose prop types differ in detail, and a `mount` may
 *  add what a case leaves out, so the names are typed here and the values are proved by the run on both platforms. */
export type CaseProps<P> = { [K in PropName<P>]?: unknown };

/** The component as a `mount` receives it: an element type for `html(C, props)`, never called. */
export type CaseComponent<P> = (p: P) => ReactElement;

/** The props as a `mount` receives them: the case's props, readable as the component's props or as a plain record. */
export type MountProps<P> = P & Record<string, unknown>;

export interface Case<P> {
  name: string;
  /** Props, or a function of the spies (callbacks are spies, so `calls` can see them). */
  props: CaseProps<P> | ((s: Spies) => CaseProps<P>);
  /** Optional wrapper: what to mount around the component (a parent row that is itself pressable, a form ...).
   *  Raw HTML here is fine: the terminal draws it through the compat runtime. Default: `createElement(C, props)`. */
  mount?: (C: CaseComponent<P>, props: MountProps<P>, s: Spies, html: Html) => ReactElement;
  /** Keep the component's value in a parent: `{ value: 'isSelected', onChange: 'onChange' }` makes it controlled by
   *  a stateful parent that stores what the callback reports (the callback spy still records the call). */
  control?: { value: string; onChange: string };
  steps: Step[];
  expect?: Expect;
  /** Run on one platform only, with the reason (reported). */
  only?: { platform: 'web' | 'term'; why: string };
  /** Props this case exercises beyond its own props (set by `mount`). */
  covers?: string[];
  /** The router's starting path and search (default `/page`): a component that reads the route sees it. */
  at?: string;
  /** Terminal only: the web Hub's origin the host reports (its page address, as HubTermOptions.webOrigin gives it), for a
   *  component that builds a web address or offers Open (Handoff). Default none: the path form, no Open. The web page
   *  keeps its own location. */
  webOrigin?: string;
}

export interface ScenarioFile<P = Record<string, unknown>> {
  /** The export name in the base file ('Button'). */
  component: string;
  /** The component under test (imported from './X': web or terminal by resolution). */
  impl: CaseComponent<P>;
  cases: Case<P>[];
  /** Props the terminal sibling does not read at all, with the reason (contract check a). Keys may end in '*'
   *  ('aria-*', 'onHover*') to cover a family. */
  ignored?: Record<string, string>;
  /** Behavioural props no case exercises, with the reason (contract check b). */
  unsupported?: Record<string, string>;
  /** Behavioural props proved by a page shot that presses the control: `{ onOpen: 'account/twofa-turn-on' }` (`<page>/<shot
   *  name>` in src/pages/<page>/shots.ts, with click, act or keys and a waitForText). For a component whose mount needs the
   *  whole page's data; with every behavioural prop proved, zero cases pass the contract. */
  pageProof?: Record<string, string>;
  /** Extra props to treat as behavioural for this component (beyond the default rule). */
  behavioural?: string[];
}

/** Matchers usable inside `calls` argument lists. */
export const ANY: unique symbol = Symbol.for('scenario.any');
export const M = {
  any: ANY,
  type: (t: 'string' | 'number' | 'boolean' | 'object' | 'function'): { $type: string } => ({ $type: t }),
  partial: (o: Record<string, unknown>): { $partial: Record<string, unknown> } => ({ $partial: o }),
  match: (r: RegExp): { $match: RegExp } => ({ $match: r }),
};

/** The props a component takes, whatever its kind (a function, memo, forwardRef; a generic one at its constraint). */
type PropsOf<C> = C extends (p: infer P) => unknown ? P : never;

/** The props of a scenario file: the ones named in `scenarios<Props>(…)`, else the component's own. */
type FileProps<P, C> = [P] extends [never] ? PropsOf<C> : P;

/** Declare the scenarios of a component (identity at runtime). The props type comes from the component alone, or from
 *  `scenarios<Props>(…)` (the component must then take them); the cases never decide it. */
export function scenarios<P = never, C extends (p: never) => ReactNode = (p: P) => ReactNode>(component: string, impl: C, body: Omit<ScenarioFile<FileProps<P, C>>, 'component' | 'impl'>): ScenarioFile<FileProps<P, C>> {
  // A component is only ever handed to createElement, so what it renders is not part of the file's type.
  return { component, impl: impl as unknown as CaseComponent<FileProps<P, C>>, ...body };
}
