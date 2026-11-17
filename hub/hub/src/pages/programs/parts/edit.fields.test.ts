// The program edit never names a port range or a terminal (parts/edit.ts, sandbox/data.ts). The daemon's edit keeps
// a stored field when the body leaves it out; a null there may clear it (the port range with its port parameter, the
// terminal with its shell settings). The Hub's two senders of the edit (Edit: name and command; the sandbox panel:
// sandbox) can never carry either key: the route declares only theirs, and core refuses any other key unsent. And
// whether an edit applies during the call is read from the program as stored before the edit (a port range there:
// at once), never from what the edit sends.
import { beforeEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, queryClient, reply, type FixtureRule, type Target } from '@core';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { sandboxRoutes } from '../sandbox/routes';
import { editStore, editableOf, readEditable, runEdit, type EditVars } from './edit';

type Loose = Record<string, unknown>;
const FIELDS = ['port_range', 'port_param', 'terminal_id', 'terminal_shell', 'terminal_interactive'] as const;

const sends: unknown[] = [];
function boot(program: Loose): Target {
  const rules: FixtureRule[] = [
    reply(sandboxRoutes.program, () => answers.ok({ success: true, program })),
    reply(sandboxRoutes.edit, (req) => {
      sends.push(req.body);
      return { status: 200, body: { success: true, program } };
    }),
  ];
  bootFixtureCore({ rules });
  queryClient.clear();
  return snapshot().target as Target;
}
const K = 'part|prog:7';
const ranged = { id: 7, name: 'api', command: 'node api.js', enabled: true, boot: false, port_range: { start: 8000, end: 8003 }, port_param: 'PORT', environment: {} };

beforeEach(() => {
  resetChanges();
  editStore.reset();
  sends.length = 0;
});

describe('the edit body never names a port range or a terminal', () => {
  it('the edit route takes only the sandbox, the name and the command', () => {
    expect([...((sandboxRoutes.edit as unknown as Loose).body as string[])].sort()).toEqual(['command', 'name', 'sandbox']);
  });

  it('an untouched field is absent from what is sent: a name-only Save sends the name alone', async () => {
    const target = boot(ranged);
    const v: EditVars = { id: '7', name: 'api2', command: 'node api.js', body: { name: 'api2' }, target };
    await runEdit(K, v);
    expect(sends).toEqual([{ name: 'api2' }]);
    for (const f of FIELDS) expect(Object.keys(sends[0] as Loose)).not.toContain(f);
  });

  it.each(FIELDS)('a body carrying %s (null or a value) is refused before it is sent', async (field) => {
    const target = boot(ranged);
    for (const value of [null, { start: 1, end: 2 }]) {
      editStore.reset();
      const v = { id: '7', name: 'api', command: 'node api.js', body: { command: 'node api.js', [field]: value }, target } as unknown as EditVars;
      expect(await runEdit(K, v)).toBeUndefined();
      expect(editStore.get(K)).toMatchObject({ status: 'notSent', code: 'ROUTE_BODY' });
    }
    expect(sends).toEqual([]);
  });
});

describe('applies at once: read from the program before the edit', () => {
  it('a program that has a port range before the edit: the edit applies during the call', async () => {
    const target = boot(ranged);
    expect((await readEditable('7', target))?.appliesNow).toBe(true);
    // Neither null nor absent is a range: no restart is promised for a program without one.
    expect(editableOf({ ...ranged, port_range: null })?.appliesNow).toBe(false);
    const { port_range: _gone, ...bare } = ranged;
    expect(editableOf(bare)?.appliesNow).toBe(false);
    // A terminal alone does not apply at once (the daemon applies the edit on the program's next start).
    expect(editableOf({ ...bare, terminal_id: 2 })?.appliesNow).toBe(false);
  });
});
