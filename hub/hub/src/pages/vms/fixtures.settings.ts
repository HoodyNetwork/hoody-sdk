// Fake-API states of the Settings tab: an update of a stopped VM saved, refused, or with its answer lost. Built inside
// functions (fixtures.ts imports this file for its states only). Open them at `/win11?tab=settings`.
import { reply, type FixtureRule } from '@core';
import { world } from './fixtures';
import { freshVms, lostUpdate, nameIn, updateRule, vmError } from './fixtures.ports';
import { routes } from './routes';

/** Tests: the VMs 'settings-saved' answers from, to change a VM as another person would meanwhile. */
export const settingsVms: { saved: Record<string, unknown>[]; madePending: Record<string, unknown>[] } = { saved: [], madePending: [] };

/** Tests: while `on`, the next read of a VM is slow and shows 4 CPUs (an answer asked before a change, which happens
 *  to show what the change sends). Used once, then reads answer as usual. */
export const slowRead = { on: false };
/** A new session: reads answer as usual again. */
export function resetSettingsFixtures(): void { slowRead.on = false; }

export function states(): Record<string, FixtureRule[]> {
  const saved = freshVms(), refused = freshVms(), pending = freshVms(), madePending = freshVms(), slow = freshVms();
  settingsVms.saved = saved;
  settingsVms.madePending = madePending;
  return {
    // Saving works: the next read shows the new settings.
    'settings-saved': [updateRule(saved), ...world({ vms: saved })],
    // The program refuses at once (another change of the VM is under way): nothing changed, the form stays as typed.
    'settings-refused': [updateRule(refused, { status: 409, body: vmError('OperationInProgress', 'another operation is in progress') }), ...world({ vms: refused })],
    // The answer is lost and nothing changed: held until the person stops tracking it.
    'settings-held': [lostUpdate(pending, false), ...world({ vms: pending })],
    // The answer is lost and the change was made: Check again proves it.
    'settings-held-made': [lostUpdate(madePending, true), ...world({ vms: madePending })],
    // The answer is lost and nothing changed, while a slow read asked before the change shows 4 CPUs: it proves nothing.
    'settings-held-slowread': [
      lostUpdate(slow, false),
      reply(routes.vm, (req) => {
        const vm = structuredClone(slow.find((v) => v.name === nameIn(req.path))) as Record<string, unknown> | undefined;
        if (vm?.spec) (vm.spec as Record<string, unknown>).vcpus = 4;
        return { status: 200, body: vm, delayMs: 6000 };
      }, { when: () => slowRead.on, times: 1 }),
      ...world({ vms: slow }),
    ],
  };
}
