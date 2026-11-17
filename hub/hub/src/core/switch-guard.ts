// Switch guard: what a user-started realm switch or sign-out would lose
// that nothing can bring back, asked about before anything is torn down. A page registers a guard while it holds such
// work (a New script draft with typed input or edited code); the guard answers the sentence that names what is lost, or
// null while nothing would be. Core's leave question (leave.ts askLeave, shell/LeaveConfirm) and the sign-out warning
// (shell/signOut) read every guard when they ask and show each sentence. Nothing here asks, blocks or tears down by
// itself: forced ends (an expired session, another tab's sign-out) never read it.
// - registerSwitchGuard(fn) returns its unregister. Unregistering twice changes nothing; an unregistered guard is never
//   read again, also when another guard unregisters it during a read.
// - A guard that throws names nothing: it is read as null, so a page's fault never blocks a switch or a sign-out.
// - Guards are read, never pushed: what they answer can change at any time. onSwitchGuards tells only of registrations
//   coming and going; a reader that waits re-reads on its own as well.
// - Confirmation coverage: the leave question records the sentences it showed when the person
//   confirmed (noteLossesConfirmed); lossesCovered() is true only while every loss named now was among them. askLeave
//   clears the record before it asks, and a realm switch checks it right before its teardown.
// - The state lives on one global, so a module replaced while the page lives (the dev server's hot update) keeps it.

type Guard = () => string | null;
interface SwitchGuardState { guards: Map<number, Guard>; seq: number; listeners?: Set<() => void>; confirmed?: readonly string[] }
const KEY = Symbol.for('hoody.hub.switch-guard');
const g = globalThis as unknown as Record<symbol, SwitchGuardState | undefined>;
const S: SwitchGuardState = g[KEY] ?? (g[KEY] = { guards: new Map(), seq: 0 });
const listeners: Set<() => void> = S.listeners ?? (S.listeners = new Set());

function changed(): void {
  for (const l of [...listeners]) {
    try { l(); } catch { /* a listener's fault stays its own */ }
  }
}

/** Registers a guard; call the returned function when the work it names ends (an unmount), however it ends. */
export function registerSwitchGuard(fn: Guard): () => void {
  const id = ++S.seq;
  S.guards.set(id, fn);
  changed();
  return () => {
    if (!S.guards.delete(id)) return;
    changed();
  };
}

/** Calls `fn` whenever a guard is registered or unregistered; returns the unsubscribe. */
export function onSwitchGuards(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** What a switch or a sign-out would lose now: each guard's sentence, in registration order (empty: nothing). */
export function switchLosses(): string[] {
  const out: string[] = [];
  for (const [id, fn] of [...S.guards]) {
    // Unregistered by an earlier guard during this read: never read again.
    if (S.guards.get(id) !== fn) continue;
    let said: string | null = null;
    try { said = fn(); } catch { said = null; }
    if (typeof said === 'string' && said.trim() !== '') out.push(said);
  }
  return out;
}

/** The leave question's record of what the person confirmed: the sentences it showed at the press (or [] to clear). */
export function noteLossesConfirmed(shown: readonly string[]): void {
  S.confirmed = [...shown];
}

/** True while every loss named now was shown when the person last confirmed (vacuously true with none named). */
export function lossesCovered(): boolean {
  const ok = S.confirmed ?? [];
  return switchLosses().every((l) => ok.includes(l));
}
