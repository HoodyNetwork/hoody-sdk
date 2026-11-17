// Fake-API states of the Storage tab: a bigger disk, a disc changed while the VM is stopped (an update) or while it
// runs (swap and eject in place). Built inside functions (fixtures.ts imports this file for its states only).
// Open them at `/win11?tab=storage` (stopped, two discs) or `/web-1?tab=storage` (running).
import { answers, reply, type FixtureRule } from '@core';
import { world } from './fixtures';
import { changeLog, freshVms, lostUpdate, nameIn, updateRule, vmError } from './fixtures.ports';
import { routes } from './routes';

type Row = Record<string, unknown>;

/** The disc slot a request's path names. */
function slotIn(path: string): number { return Number(path.split('/cdroms/')[1] ?? 'x'); }

/** Swap and eject in place over `vms`: the program answers with the VM as it now is. */
function liveDiscRules(vms: Row[], lost: boolean, noDrive = false): FixtureRule[] {
  const set = (path: string, source: string | null) => {
    const vm = vms.find((v) => v.name === nameIn(path));
    const spec = vm?.spec as Row | undefined;
    if (!vm || !spec) return { status: 404, body: vmError('NotFound', 'no such VM') };
    // A drive that was empty when the VM started has none in this run: the program refuses a disc for it.
    if (noDrive && source !== null) return { status: 409, body: vmError('BadState', 'cd-rom slot 0 was empty when this VM started') };
    const discs = [...((spec.cdroms as (string | null)[] | undefined) ?? [])];
    discs[slotIn(path)] = source;
    spec.cdroms = discs;
    return lost ? answers.lost() : answers.ok(vm);
  };
  return [
    reply(routes.cdChange, (req) => {
      changeLog.push({ route: 'swap', path: req.path, body: structuredClone(req.body ?? null) });
      return set(req.path, String((req.body as Row | null)?.source ?? ''));
    }),
    reply(routes.cdEject, (req) => {
      changeLog.push({ route: 'eject', path: req.path, body: null });
      return set(req.path, null);
    }),
  ];
}

/** A running VM with an installer disc in its first slot (a live swap needs a slot that held a disc at start). */
function withDisc(vms: Row[]): Row[] {
  const web = vms.find((v) => v.name === 'web-1');
  if (web?.spec) (web.spec as Row).cdroms = ['/var/lib/hoody-vm/isos/debian-13.iso'];
  return vms;
}

export function states(): Record<string, FixtureRule[]> {
  const saved = withDisc(freshVms()), full = freshVms(), pending = freshVms(), live = withDisc(freshVms()), liveLost = withDisc(freshVms());
  const emptied = freshVms(), busy = freshVms();
  const web = emptied.find((v) => v.name === 'web-1');
  if (web?.spec) (web.spec as Row).cdroms = [null];
  return {
    // Disk grows and disc changes are made; the next read shows them.
    'storage-saved': [updateRule(saved), ...liveDiscRules(saved, false), ...world({ vms: saved })],
    // A bigger disk does not fit: the program answers 507 InsufficientSpace, which reads as not known (held) with its reason.
    'storage-full-held': [updateRule(full, { status: 507, body: vmError('InsufficientSpace', 'need 107374182400 bytes, 21474836480 available', { need: 100 * 1024 ** 3, have: 20 * 1024 ** 3 }) }), ...world({ vms: full })],
    // Another change of the VM is under way: a bigger disk is refused for sure, said in the page's words.
    'storage-busy': [updateRule(busy, { status: 409, body: vmError('OperationInProgress', 'operation in progress') }), ...world({ vms: busy })],
    // A disc change of a stopped VM whose answer is lost and was not made.
    'storage-held': [lostUpdate(pending, false), ...world({ vms: pending })],
    // A running VM with a disc: swaps and ejects in place work.
    'storage-live': [...liveDiscRules(live, false), ...world({ vms: live })],
    // A running VM's swap or eject whose answer is lost (the swap stays held: no read proves it; an eject is proved).
    'storage-live-held': [...liveDiscRules(liveLost, true), ...world({ vms: liveLost })],
    // A running VM whose one drive reads empty: the drive is offered; the program says it was empty at the start.
    'storage-live-nodrive': [...liveDiscRules(emptied, false, true), ...world({ vms: emptied })],
  };
}
