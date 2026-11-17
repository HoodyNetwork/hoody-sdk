// The instructions edits that hold work, kept while their page is away. A draft, a
// save out, a save whose answer was lost or a conflict waiting for the person is never dropped because the page unmounted: picking
// the same computer again (a new Target object), another computer, another realm or another page and coming back shows the same
// edit, and a save's late answer still lands on it.
//   - The key is what the edit is about, never an object's identity: account, project, computer (id and server), realm. An edit
//     whose account cannot be read has no key and is never kept.
//   - Only work is kept. An edit holding none is dropped (its answers ignored) when its page goes, and a kept edit is dropped as
//     soon as it stops holding work while away (a save out that lands): coming back reads afresh rather than show an old read.
//   - A bump core's changes do not keep (changes.ts keepsChanges: sign-out, log-out, another account) drops them all; one they keep
//     (a realm switch, a fallback, a suspension) keeps them.
//   - While any holds work, a switch guard names it: core's leave question and the sign-out warning read it. A realm switch keeps
//     the edit and a sign-out drops it; the sentence says both.
//   - While any holds work, shown or not, closing or reloading the tab asks first (the browser's own beforeunload prompt):
//     a kept edit lives in memory only. The listener is added when the first edit holds work and removed when none
//     does, so a tab with nothing held keeps the browser's back-forward cache.
import { capture, hostEnv, keepsChanges, onBump, registerSwitchGuard, type Target } from '@core';
import type { EditStore, EditView } from './edit';

const kept = new Map<string, EditStore>();
/** Kept edits whose page is gone: dropped once they hold no work. */
const away = new Set<EditStore>();
/** One subscription per kept edit: what it holds decides the unload prompt, and an edit away is dropped once it holds nothing. */
const subs = new Map<EditStore, () => void>();

/** A save out, a lost answer, a conflict or a draft: work a reload cannot bring back. (A save phase other than idle/saved only
 *  follows a dirty draft, so `dirty` alone covers them today; they are named so the rule survives a change to edit.ts.) */
export const holdsWork = (v: EditView): boolean => v.dirty || v.save === 'saving' || v.save === 'unsure' || v.save === 'conflict';

/** What the edit is about. '' when the account cannot be read: such an edit is never kept. */
export function editKey(target: Target, realm: string): string {
  const account = capture().account;
  if (!account) return '';
  return [account, target.project.id, target.container.id, target.container.server_name ?? '', realm].join('\u0000');
}

/** The kept edit for `key`, or a new one from `make`. */
export function editFor(key: string, make: () => EditStore): EditStore {
  return (key && kept.get(key)) || make();
}

function drop(key: string, store: EditStore): void {
  if (kept.get(key) === store) kept.delete(key);
  away.delete(store);
  subs.get(store)?.();
  subs.delete(store);
  store.reset();
}

function changed(key: string, store: EditStore): void {
  if (away.has(store) && !holdsWork(store.view())) drop(key, store);
  sync();
}

/** The page shows `store`: keep it findable while it is shown. */
export function showing(key: string, store: EditStore): void {
  away.delete(store);
  if (key) {
    kept.set(key, store);
    if (!subs.has(store)) subs.set(store, store.subscribe(() => changed(key, store)));
  }
  sync();
}

/** The page went: an edit holding work stays (its answers still land) until it holds none; any other is dropped. */
export function gone(key: string, store: EditStore): void {
  if (!key || kept.get(key) !== store || !holdsWork(store.view())) drop(key, store);
  else away.add(store);
  sync();
}

/** Whether `key` has a kept edit (tests). */
export const isKept = (key: string): boolean => kept.has(key);

let sentence: (n: number) => string = () => '';
/** The guard's words, set by the page (strings live there). */
export function setLossWords(fn: (n: number) => string): void { sentence = fn; }

function heldCount(): number {
  let n = 0;
  for (const s of kept.values()) if (holdsWork(s.view())) n++;
  return n;
}

// Through the host's lifecycle seam (core host-env), never `window`: the web env adds the page's beforeunload listener, a
// terminal host has no tab to close and registers nothing (a `window` read there is a TERM_GLOBAL trap).
const onBeforeUnload = (e: { preventDefault(): void; setReturnValue(v: string): void }): void => {
  if (heldCount() === 0) return;
  e.preventDefault();
  // Older engines show the prompt only for a set returnValue.
  e.setReturnValue('');
};

let off: (() => void) | null = null;
let unloadOff: (() => void) | null = null;
// The switch guard is registered while any edit is kept and read each time a question asks, so it names only what holds work
// then; the unload listener is on exactly while something holds work.
function sync(): void {
  if (kept.size > 0 && !off) off = registerSwitchGuard(() => { const n = heldCount(); return n > 0 ? sentence(n) || null : null; });
  else if (kept.size === 0 && off) { off(); off = null; }
  const want = heldCount() > 0;
  if (want === (unloadOff !== null)) return;
  if (want) unloadOff = hostEnv().onLifecycle('beforeunload', onBeforeUnload);
  else { const o = unloadOff!; unloadOff = null; o(); }
}

onBump((reason) => {
  if (keepsChanges(reason)) return;
  for (const [key, store] of [...kept]) drop(key, store);
  sync();
});
