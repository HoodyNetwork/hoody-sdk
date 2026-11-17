// Fake-API states of a VM's Screen tab: what the VM program answers to a key press, and VMs whose screen cannot be
// shown, over the read rules of fixtures.ts. keysLog holds every key body sent, for tests.
import { answers, reply, type FixtureAnswer, type FixtureRule } from '@core';
import { VMS, world } from './fixtures';
import { routes } from './routes';

type Row = Record<string, unknown>;

/** Every key body the states' rules received, in order. */
export const keysLog: unknown[] = [];
/** A new session: forget the keys the last one sent. */
export function resetScreenFixtures(): void { keysLog.length = 0; }

const OTHER_ID = '0195c0de00000777';

function vmError(code: string, message: string) { return { error: { code, message, retryable: false } }; }

/** The default VMs with `web-1` changed. */
function withWeb(patch: (web: Row) => Row): Row[] {
  return VMS.details.map((d) => (d.name === 'web-1' ? patch(d) : d));
}
function noDisplay(web: Row): Row {
  const { display: _display, ...spec } = web.spec as Row;
  return { ...web, spec };
}

function keys(answer: () => FixtureAnswer, vms?: Row[]): FixtureRule[] {
  return [
    reply(routes.vmKeys, (req) => {
      keysLog.push(req.body);
      return answer();
    }),
    ...world(vms ? { vms } : {}),
  ];
}

// A function declaration, and nothing above it runs at import: fixtures.ts calls it while this file may still be loading.
export function states(): Record<string, FixtureRule[]> { return {
  // A key press is taken.
  'screen-keys-ok': keys(() => answers.ok(VMS.detail('web-1'))),
  // The answer to a key press is lost: it may have been pressed.
  'screen-keys-lost': keys(() => answers.lost()),
  // The VM program refuses the keys.
  'screen-keys-refused': keys(() => ({ status: 409, body: vmError('BadState', 'the VM is not running') })),
  // A running VM made without a screen.
  'screen-headless': keys(() => answers.ok({}), withWeb(noDisplay)),
  // The VM list gives the name `web-1` to another VM than the one on screen.
  'screen-renamed': [
    reply(routes.vms, () => answers.ok(VMS.details.map((d) => ({ name: d.name, vm_id: d.name === 'web-1' ? OTHER_ID : d.vm_id, phase: d.progress ? 'creating' : 'committed', state: d.state })))),
    ...keys(() => answers.ok({})),
  ],
  // A paused VM: its screen still shows, keys are not sent.
  'screen-paused': keys(() => answers.ok({}), withWeb((w) => ({ ...w, state: 'Paused' }))),
}; }
