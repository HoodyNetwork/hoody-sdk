// New VM: the one change (POST /vms on the VM program), the two lists its form offers, and the keys the Screen tab
// sends. Reads and changes go through core; this file declares them and nothing else sends.
//
// Create, in plain words:
//   - One create per name and computer at a time (lock `vm.create`, keyed by the name; core files it under the
//     computer). The VM program has no idempotency key, so a create is never sent twice for one press.
//   - The ids already under the name (`before`) come from a VM list read right before the send (freshVmList), never
//     from the list on screen: a cached list can lack an earlier VM or failed create of the name, whose id a later
//     read would take for this create's.
//   - A 2xx answer means the request was accepted (the VM is then being made; its own screen shows the progress).
//   - A lost answer or a 5xx is unknown: held, never resent. A fresh VM list proves it (create-logic.ts createVerdict):
//     a row under the name with an id the list did not hold before the send. A list without the name proves nothing
//     (the computer may still be working on the request): only Stop tracking frees it then. While it is held the
//     drawer shows what was sent, Check again (reads only) and Stop tracking.
//   - A 4xx is a definite refusal with the VM program's code.
// Keys (Ctrl+Alt+Del, Enter): one press, one request, lock `vm.input` by the VM's own id, so a key whose answer was
// lost never blocks the VM's power changes. No read can prove a key press: it stays held until the person stops
// tracking it.
import { defineMutation, defineQuery, isFramed, useRunner, type HeldChange, type RunnerMutation, type Target } from '@core';
import { useMemo } from 'react';
import { createVerdict, ownKeyHold, parseImages, parseTemplates, sentOf, type CreateBody, type Image, type Template } from './create-logic';
import { vmsQ } from './data';
import type { VmRow } from './logic';
import { routes } from './routes';

const unreadable = (): never => { throw { kind: 'unavailable', status: 0, code: 'BAD_ANSWER' }; };
const must = <T,>(v: T | null): T => (v === null ? unreadable() : v);

const imagesQ = defineQuery<unknown, Image[]>(routes.isos, { select: (w) => must(parseImages(w)) });
const templatesQ = defineQuery<unknown, Template[]>(routes.templates, { select: (w) => must(parseTemplates(w)) });

/** The computer's installer images; `enabled` false: not read. */
export const useImages = (enabled: boolean) => imagesQ.use(undefined, { enabled });
/** The ready-made disks the computer offers; `enabled` false: not read. */
export const useTemplates = (enabled: boolean) => templatesQ.use(undefined, { enabled });

// ── create ───────────────────────────────────────────────────────────────────────────

export const CREATE_LOCK = 'vm.create';

/** The current computer's VM list, read now for a create about to be sent (never the cache): the ids already under
 *  the name are this create's baseline. Null: no fresh answer (failed, cancelled, or only the cache answered). */
export const freshVmList = (): Promise<{ data: VmRow[] } | null> => vmsQ.readFresh().catch(() => null);

export interface CreateVars {
  /** The computer the VM is made inside, taken at the press. */
  readonly target: Target;
  readonly name: string;
  readonly body: CreateBody;
  /** The ids listed under the name before the send. */
  readonly before: readonly string[];
  /** The press, ms. */
  readonly at: number;
}

export const createVm = defineMutation<CreateVars, unknown>(routes.vmCreate, {
  input: (v) => ({ target: v.target, body: v.body }),
  reads: [vmsQ],
  lock: CREATE_LOCK,
  lockKey: (v) => v.name,
  identity: (v) => ({ computer: v.target.container.id, name: v.name, before: [...v.before], at: v.at }),
  proves: (identity, answers) => {
    const sent = sentOf(identity);
    if (!sent) return undefined;
    return createVerdict(sent, (answers[0] ?? []).filter((a): a is VmRow[] => Array.isArray(a)));
  },
  page: 'vms',
});

type Sent = Awaited<ReturnType<RunnerMutation<CreateVars>['mutateAsync']>>;

/** A core change as the shared runner takes it: the outcome with the refusal's code and status, Check again limited
 *  to the hold shown, and Stop tracking of exactly that hold. */
function runnerOf<V>(def: { dismiss(vars: V, hold: string): Promise<boolean> }, hook: { run(v: V): Promise<{ outcome: Sent['outcome']; data?: unknown; error?: { code?: string | null; status?: number; traceId?: string; route?: string } }>; readBack(only?: { hold: string }): Promise<boolean> }): RunnerMutation<V> {
  return {
    mutateAsync: async (v) => {
      const r = await hook.run(v);
      const e = r.error;
      return {
        outcome: r.outcome, data: r.data,
        ...(typeof e?.code === 'string' ? { code: e.code } : {}), ...(typeof e?.status === 'number' ? { status: e.status } : {}),
        ...(e?.traceId ? { traceId: e.traceId } : {}), ...(e?.route ? { route: e.route } : {}),
      };
    },
    readBack: (only) => hook.readBack(only),
    dismiss: ((vars?: V, hold?: string) => (vars !== undefined && hold ? def.dismiss(vars, hold) : Promise.resolve(false))) as RunnerMutation<V>['dismiss'],
  };
}

/** Stop tracking of exactly the hold a band shows: that send's variables and its hold token, never "whatever this
 *  mount sent". Another sender's hold, or none shown, frees nothing (false). */
async function stopShown<V>(def: { dismiss(vars: V, hold: string): Promise<boolean> }, r: { held: Record<string, unknown> | null; hold: string | undefined; elsewhere: unknown; reset(): void }, vars: (i: Record<string, unknown>) => V): Promise<boolean> {
  if (!r.held || !r.hold || r.elsewhere) return false;
  const freed = await def.dismiss(vars(r.held), r.hold);
  r.reset();
  return freed;
}

/** The create runner of the computer shown: `held` is this computer's create whose outcome is unknown (what was sent),
 *  `elsewhere` when another sender holds it. */
export function useCreateVm(target: Target | null) {
  const hook = createVm.use();
  const m = useMemo(() => runnerOf(createVm, hook), [hook.run, hook.readBack]); // eslint-disable-line react-hooks/exhaustive-deps -- the hook object is new each render; its two calls are stable
  const computer = target?.container.id ?? '';
  const opts = useMemo(() => ({
    lock: CREATE_LOCK,
    pick: (i: Record<string, unknown>) => computer !== '' && i.computer === computer,
    // Stop tracking names the held send again: the same name on the computer shown (pick keeps only its holds).
    vars: (i: Record<string, unknown>): CreateVars => ({ target: target as Target, name: String(i.name ?? ''), body: { name: String(i.name ?? ''), source: {}, memory_mib: 0, vcpus: 0 }, before: [], at: Number(i.at ?? 0) }),
    heldBy: (h: HeldChange) => createVm.heldBy(h),
  }), [computer]); // eslint-disable-line react-hooks/exhaustive-deps -- the target is read through its computer id
  const r = useRunner(m, opts);
  return { ...r, stopTracking: () => stopShown(createVm, r, opts.vars) };
}

/** What stops every create before it is sent: `framed`, the Hub is shown inside another page (core refuses the
 *  request unsent as well). */
export function useCreateGate(): { readonly framed: boolean } {
  return { framed: isFramed() };
}

// ── keys ─────────────────────────────────────────────────────────────────────────────

export const INPUT_LOCK = 'vm.input';
/** The chords the Screen tab offers (the VM program's key names). */
export const KEY_CHORDS = { ctrlAltDel: ['ctrl', 'alt', 'delete'], enter: ['ret'] } as const;
export type KeyChord = keyof typeof KEY_CHORDS;

export interface KeysVars {
  readonly target: Target;
  readonly name: string;
  /** The VM's own id: the lock, so a later VM under the same name is another one. */
  readonly vmId: string;
  readonly chord: KeyChord;
}

export const sendKeys = defineMutation<KeysVars, unknown>(routes.vmKeys, {
  input: (v) => ({ target: v.target, params: { name: v.name }, body: { keys: [...KEY_CHORDS[v.chord]] } }),
  lock: INPUT_LOCK,
  name: 'vms.keys',
  lockKey: (v) => v.vmId,
  identity: (v) => ({ computer: v.target.container.id, vmId: v.vmId, name: v.name, what: 'keys', chord: v.chord }),
  page: 'vms',
});

/** The key runner of one VM: `held` is a key press of this VM whose outcome is unknown. */
export function useSendKeys(target: Target | null, vmId: string | null, name: string) {
  const hook = sendKeys.use();
  const m = useMemo(() => runnerOf(sendKeys, hook), [hook.run, hook.readBack]); // eslint-disable-line react-hooks/exhaustive-deps -- the hook object is new each render; its two calls are stable
  const computer = target?.container.id ?? null;
  const opts = useMemo(() => ({
    lock: INPUT_LOCK,
    // The lock is shared with the VM's console line (Logs tab): only a key press is this runner's own.
    pick: (i: Record<string, unknown>) => ownKeyHold(i, computer, vmId),
    vars: (i: Record<string, unknown>): KeysVars => ({ target: target as Target, name, vmId: String(i.vmId ?? ''), chord: i.chord === 'enter' ? 'enter' : 'ctrlAltDel' }),
    heldBy: (h: HeldChange) => sendKeys.heldBy(h),
  }), [computer, vmId, name]); // eslint-disable-line react-hooks/exhaustive-deps -- the target is read through its computer id
  const r = useRunner(m, opts);
  return { ...r, stopTracking: () => stopShown(sendKeys, r, opts.vars) };
}
