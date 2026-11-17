// The Ask dock's state, shared by the shell (which draws the dock) and pages (which
// open it, optionally with a question). Width and open state are remembered per device; on a phone, where the
// dock is a full-screen sheet, a load never starts with it open (it would cover the page the link opened).
import { useSyncExternalStore } from 'react';
import { ASK_ENABLED, DOCK_MIN, DOCK_MAX, focusFn, askPlain, agentStartText } from './ask.pure';
export { ASK_ENABLED, DOCK_MIN, DOCK_MAX, setAskFocus, ASK_MAX_TEXT, ASK_CONTEXT_MARK, ASK_REQUEST_MARK, ASK_LABEL_MAX, askPlain, splitAskContext, parseAskMessage, askStartRoom, agentStartText } from './ask.pure';
export type { AskDraft, AskStartOutcome, AgentStart, AskMessage, AskStartNames } from './ask.pure';
import type { AskDraft, AgentStart } from './ask.pure';
import { alive, capture, chooseComputer, onBump } from '@core';
import { hostEnv } from '../core/host-env';
import { afterDockDrawn, focusDockControl, phoneNow } from './ask.web';
import { closeToast, showToast } from './states/Toast';
import { makeT } from './strings';
import kitStrings from './strings.en.json';

// Fixture builds only (hub:dev, shots, tests): `?ask=1` or setAskForFixtures(true) turns Ask on in a build whose
// switch is off. It only adds: while ASK_ENABLED is on, setAskForFixtures(false) cannot turn Ask off.
// __HUB_FIXTURES__ is false in production builds, so this override folds away there. Read on first use, through the host
// (hostEnv().pageAddress: null in a terminal unless a web origin is lent), never at module load.
let fixtureAsk: boolean | null = null;
function fixtureAskNow(): boolean {
  if (!__HUB_FIXTURES__) return false;
  if (fixtureAsk === null) {
    try {
      const a = hostEnv().pageAddress;
      fixtureAsk = !!a && new URLSearchParams(a.search).get('ask') === '1';
    } catch {
      fixtureAsk = false;
    }
  }
  return fixtureAsk;
}

/** Fixture builds and tests only: turn the override on or off (Ask is on while either it or ASK_ENABLED is). No effect in production. */
export function setAskForFixtures(on: boolean): void {
  if (__HUB_FIXTURES__) fixtureAsk = on;
}

/** Whether Ask is on: ASK_ENABLED, or the fixture override in a fixture build. */
export function askOn(): boolean {
  return ASK_ENABLED || (__HUB_FIXTURES__ && fixtureAskNow());
}

interface AskState {
  open: boolean;
  /** User-chosen width; undefined = the default for the viewport (400 / 360). */
  width: number | undefined;
  /** A question a page asked the dock to start with; the dock takes it once. */
  draft: AskDraft | undefined;
}

const KEY = 'hub.v3.ask';

function read(): AskState {
  try {
    const raw = JSON.parse(hostEnv().local?.getItem(KEY) ?? '{}') as { open?: unknown; width?: unknown };
    const w = typeof raw.width === 'number' && raw.width >= DOCK_MIN && raw.width <= DOCK_MAX ? raw.width : undefined;
    return { open: raw.open === true && !phoneNow(), width: w, draft: undefined };
  } catch {
    return { open: false, width: undefined, draft: undefined };
  }
}

// Read from the host's storage on first use (never at module load: the host may not be installed yet).
let loaded: AskState | null = null;
const cur = (): AskState => (loaded ??= read());
const listeners = new Set<() => void>();

/** Tests only (the terminal test preload calls it after every test): the dock's state is kept for the process, so a
 *  dock left open by one test file would be open in the next. Forgets it and its stored record. Not in the kit barrel. */
export function resetAskForTests(): void {
  if (!__HUB_FIXTURES__) return;
  try { hostEnv().local?.removeItem(KEY); } catch { /* no storage */ }
  loaded = null;
}

function commit(next: Partial<AskState>): void {
  const state = (loaded = { ...cur(), ...next });
  try {
    hostEnv().local?.setItem(KEY, JSON.stringify({ open: state.open, width: state.width }));
  } catch {
    /* not remembered */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Focus inside the dock (the shell marks it data-hub-dock): the panel's own focus, else its first drawn control
 *  (a link, button, input or textarea, or a tabbable element; never a disabled one, also when it has a tabindex, and
 *  never the resize grip, hidden on a phone), else the dock itself. A loading or error panel has no gate card or
 *  composer, so its focus says false and the first control takes it. AppShell's focusDock is to call this. */
export function focusAskDock(): void {
  if (focusFn?.()) return;
  // Only a web page has a dock element to search (a terminal draws its own dock and focuses it: term/shell/AskDock).
  focusDockControl();
}

/** Drop a question a page handed the dock and the dock has not taken (the shell calls this on an account or realm switch). */
export function dropAskDraft(): void {
  const d = cur().draft;
  if (d === undefined) return;
  commit({ draft: undefined });
  // A start nobody took was never sent: its page hears so and keeps the text.
  d.onStart?.('notSent');
}

/**
 * Starts a NEW Agent conversation with this question (and the page's context) and opens the panel on it, under
 * the same rules as Home's quick ask: the conversation open before stays in Recent, untouched, and is never
 * appended to; the text is sent once; 'unknown' means it may have gone through (C9), never re-send it.
 * False (and onStart 'notSent') when the Agent is off, the message cannot be sent as asked (agentStartText), or
 * another start is still waiting to be taken, or no computer is given or shown. The start is always bound to its
 * computer (the given one, else the one shown now): only that computer's panel takes it, so a panel still showing
 * another computer leaves it alone.
 */
export function startAgentConversation(o: AgentStart): boolean {
  const text = agentStartText(o.text ?? '', o.context, { title: o.title, contextLabel: o.contextLabel });
  if (!askOn() || !text) { o.onStart?.('notSent'); return false; }
  if (cur().draft?.start) { o.onStart?.('notSent'); commit({ open: true }); return false; }
  const computer = o.computer ? o.computer.id : capture().target?.container.id;
  if (!computer) { o.onStart?.('notSent'); commit({ open: true }); return false; }
  if (o.computer) chooseComputer(o.computer);
  commit({ open: true, draft: { text, source: o.source, start: true, onStart: o.onStart, computer } });
  return true;
}

export interface AskDock {
  isOpen: boolean;
  width: number | undefined;
  draft: AskDraft | undefined;
  /** Open the dock, optionally starting a question ({ text, source }; a bare string is the text). False when the dock does not
   *  hold the given words: Ask is off, or a start not taken yet keeps them out (a start then hears 'notSent'; a plain prefill is
   *  told in a toast whose one way tries again). */
  open: (draft?: AskDraft | string) => boolean;
  close: () => void;
  toggle: () => void;
  /** Open the dock if it is closed, then move focus into it on the next frame (as Ctrl/⌘J does). */
  focus: () => void;
  setWidth: (w: number | undefined) => void;
  /** The dock calls this once it has put the draft in its composer; with its computer, it takes only a draft for
   *  that computer (or for any), and leaves one bound to another computer for that computer's panel. */
  takeDraft: (computer?: string) => AskDraft | undefined;
}

const t = makeT(kitStrings);
/** The one held-words toast's bump listener: a new report replaces it, so a dismissed toast keeps at most this one. */
let heldOff: (() => void) | null = null;

function openDock(draft?: AskDraft | string): boolean {
  if (!askOn()) return false;
  const given = typeof draft === 'string' ? { text: draft } : draft;
  const d = given && { ...given, text: askPlain(given.text) };
  // A start the dock has not taken yet wins over a second press: one press, one start.
  const held = cur().draft?.start ? cur().draft : undefined;
  commit({ open: true, draft: held ?? (d && d.text.trim() ? d : cur().draft) });
  if (!held || !d || d === held) return true;
  // Another start while one is held is not taken: its page hears so and keeps its text.
  if (d.start) {
    d.onStart?.('notSent');
    return false;
  }
  if (!d.text.trim()) return true;
  // Plain words a held start keeps out are never dropped without a word: the toast says so, and its one way tries again, in
  // the context it was told in: a switch of account or realm closes it, and words never cross into the next one;
  // words bound to the computer shown then show that computer again first, as the page that bound them did.
  const ctx = capture();
  const to = d.computer && ctx.target?.container.id === d.computer ? ctx.target : null;
  heldOff?.();
  let id = '';
  const stop = onBump(() => { off(); if (id) closeToast(id); });
  const off = () => { stop(); if (heldOff === off) heldOff = null; };
  heldOff = off;
  id = showToast({
    // One at a time: a later report replaces this one (and its words) instead of stacking.
    id: 'ask-held',
    title: t('ask.heldTitle', { source: d.source ?? t('ask.heldHere') }),
    body: t('ask.heldBody'),
    tone: 'error',
    action: {
      label: t('ask.heldRetry'),
      onAction: () => {
        off();
        if (!alive(ctx)) return;
        if (to && capture().target?.container.id !== to.container.id) {
          chooseComputer({ id: to.container.id, project_id: to.project.id, ...(to.container.server_name !== undefined ? { server_name: to.container.server_name } : {}) });
        }
        openDock(d);
      },
    },
  });
  return false;
}

export function useAskDock(): AskDock {
  const s = useSyncExternalStore(subscribe, cur, cur);
  return {
    isOpen: askOn() && s.open,
    width: s.width,
    draft: s.draft,
    open: openDock,
    close: () => {
      commit({ open: false });
      // Closed before the panel took a start (no computer, still loading): nothing was sent.
      if (cur().draft?.start) dropAskDraft();
    },
    toggle: () => {
      if (!askOn()) return;
      commit({ open: !cur().open });
      if (!cur().open && cur().draft?.start) dropAskDraft();
    },
    focus: () => {
      if (!askOn()) return;
      if (!cur().open) commit({ open: true });
      // After the dock is drawn. A terminal has no animation frame: the panel's own focus, when it is registered.
      afterDockDrawn(focusAskDock);
    },
    setWidth: (w) => commit({ width: w === undefined ? undefined : Math.min(DOCK_MAX, Math.max(DOCK_MIN, w)) }),
    takeDraft: (computer) => {
      const d = cur().draft;
      if (d !== undefined && d.computer && computer !== undefined && d.computer !== computer) return undefined;
      if (d !== undefined) commit({ draft: undefined });
      return d;
    },
  };
}
