// Vitest: the Programs bar's inputs. The port field reports what is typed or
// stepped, held to the program's own range; the program picker narrows as the person types and reports the pick; and
// only a program the daemon marks hoody_kit: true counts as a system program.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, userEvent, within } from '@app/testing';
import { ProgramOutput } from './parts/ProgramOutput';
import { createLogs, type Computer, type ProgramsState, type Snapshot } from './controller';
import fixtures from './fixtures';
import { DEFAULT_VIEW, type Tx } from './logic';
import strings from './strings.en.json';
import type { T } from './parts/words';
import { fixtureApi, type World } from './world';

const t = ((k: string, v?: Record<string, unknown>) => (strings as Record<string, string>)[k]?.replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v?.[n] ?? '')) ?? k) as unknown as T;

// Eight programs: one more than the kit Select's search limit, so the picker shows its search box.
const list: ProgramsState['list'] = [
  { id: '1', name: 'api', range: null },
  { id: '2', name: 'web', range: { start: 8080, end: 8083 } },
  { id: '3', name: 'worker', range: null },
  { id: '4', name: 'cron', range: null },
  { id: '5', name: 'docs', range: null },
  { id: '6', name: 'queue', range: null },
  { id: '7', name: 'hoody-terminal', range: null, system: true },
  { id: '9', name: 'hoody-exec', range: null, system: true },
];
const state: ProgramsState = { list, current: list[1]!, snap: { text: 'a\nb\n', at: 0 } };
const bar = (over: Partial<Parameters<typeof ProgramOutput>[0]> = {}) => {
  const onPort = vi.fn<(p: number) => void>();
  const onProgram = vi.fn<(id: string) => void>();
  render(<ProgramOutput t={t} state={state} port={8080} channel="stdout" find="" onProgram={onProgram} onChannel={() => {}} onPort={onPort} onRefresh={() => {}} onExplain={() => {}} {...over} />);
  return { onPort, onProgram, box: screen.getByRole('textbox', { name: strings['prog.port'] }) as HTMLInputElement };
};

describe('the port field', () => {
  afterEach(cleanup);
  it('reports a port typed inside the range', async () => {
    const { onPort, box } = bar();
    await userEvent.clear(box);
    await userEvent.type(box, '8082');
    await userEvent.tab();
    expect(onPort).toHaveBeenLastCalledWith(8082);
  });
  it('steps by one with the arrow keys', async () => {
    const { onPort, box } = bar({ port: 8081 });
    await userEvent.click(box);
    await userEvent.keyboard('{ArrowUp}');
    expect(onPort).toHaveBeenLastCalledWith(8082);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(onPort).toHaveBeenLastCalledWith(8080);
  });
  it('holds a typed port above the range to its last port', async () => {
    const { onPort, box } = bar();
    await userEvent.clear(box);
    await userEvent.type(box, '9999');
    await userEvent.tab();
    expect(onPort).toHaveBeenLastCalledWith(8083);
    expect(onPort.mock.calls.every(([p]) => p >= 8080 && p <= 8083)).toBe(true);
  });
  it('holds a typed port below the range to its first port', async () => {
    // From the last port, so the held value is a change the field reports (the page owns the value).
    const { onPort, box } = bar({ port: 8083 });
    await userEvent.clear(box);
    await userEvent.type(box, '80');
    await userEvent.tab();
    expect(onPort).toHaveBeenLastCalledWith(8080);
    expect(onPort.mock.calls.every(([p]) => p >= 8080 && p <= 8083)).toBe(true);
  });
});

describe('the program picker', () => {
  afterEach(cleanup);
  it('narrows to what is typed, under the system heading, and reports the program picked', async () => {
    const { onProgram } = bar();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(` ${strings['prog.pick']}$`) }));
    const panel = await screen.findByRole('dialog', { name: strings['prog.pick'] });
    await userEvent.type(within(panel).getByRole('searchbox'), 'hoody');
    expect(within(panel).getAllByRole('radio').map((o) => o.textContent)).toEqual(['hoody-exec', 'hoody-terminal']);
    expect(within(panel).getByRole('group', { name: strings['prog.groupSystem'] })).toBeTruthy();
    expect(within(panel).queryByRole('group', { name: strings['prog.groupYours'] })).toBeNull();
    await userEvent.click(within(panel).getByRole('radio', { name: /hoody-terminal/ }));
    expect(onProgram).toHaveBeenCalledWith('7');
  });
});

describe('system programs from the daemon list', () => {
  const computer: Computer = { id: 'c0a7150000000000000000a1', projectId: '6a0000000000000000000001', name: 'atlas', running: true };
  const tx: Tx = (key) => key;
  const store = () => { let p = {}; return { read: () => p, write: (n: object) => { p = n; return true; } }; };
  it('counts only hoody_kit: true; false, a missing flag and the string "true" are the person\'s own', async () => {
    const base = (fixtures.states.quiet as { world: { data: World } }).world.data;
    const world: World = {
      ...base,
      delayMs: 0,
      programs: [
        { id: 1, name: 'kit-true', hoody_kit: true },
        { id: 2, name: 'kit-false', hoody_kit: false },
        { id: 3, name: 'kit-missing' },
        { id: 4, name: 'kit-string', hoody_kit: 'true' as unknown as boolean },
      ],
    };
    const view = { ...DEFAULT_VIEW, source: 'programs' as const };
    const l = createLogs({ api: fixtureApi(world), computer, initial: view, prefs: store(), t: tx, visible: () => true, online: () => true });
    l.setView(view);
    let s: Snapshot = l.get();
    for (let i = 0; i < 400 && !s.programs; i++) {
      await new Promise((r) => setTimeout(r, 10));
      s = l.get();
    }
    l.dispose();
    expect(Object.fromEntries(s.programs!.list.map((p) => [p.name, p.system === true]))).toEqual({
      'kit-true': true, 'kit-false': false, 'kit-missing': false, 'kit-string': false,
    });
  });
});
