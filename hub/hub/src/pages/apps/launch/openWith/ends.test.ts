// Vitest: a launch's end reaches discovery for the launch's life. The launches store is the real
// one (parts/ops); only discovery's two invalidations are stand-ins. No drawer is mounted at all: the watch is what
// outlives it (a landing, a close, another launch).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenApp } from '../../logic';
import { ops } from '../../parts/ops';

const S = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('./probes', () => ({
  reprobeOn: (t: { container: { id: string } }, id: string) => void S.calls.push(`reprobe:${t.container.id}:${id}`),
  dropLauncherOn: (t: { container: { id: string } }) => void S.calls.push(`dropLauncher:${t.container.id}`),
}));
const { ENDS_MAX, resetEndsForTests, watchEnd, watchedForTests } = await import('./ends');

const CID = 'b'.repeat(24);
const SUB = 'c'.repeat(32);
const target = { project: { id: 'a'.repeat(24) }, container: { id: CID, server_name: 'n1' } };
const launch = (key: string, o: Partial<OpenApp> = {}): OpenApp => ({ key, name: 'Nano · a b.txt', state: 'started', opensIn: 'terminal', p: 'tpl', candidate: `other:ow-nano-${SUB}`, computer: CID, urls: {}, startedAt: 1, ...o } as OpenApp);

beforeEach(() => {
  resetEndsForTests();
  ops.reset();
  S.calls = [];
});

describe('watchEnd: discovery hears a launch end with no drawer open', () => {
  it('ends_outlive_the_drawer: an exit 127 that arrives later drops that template\'s paths, once', () => {
    ops.addLaunch(launch('k1'));
    watchEnd('k1', target);
    expect(S.calls).toEqual([]);
    ops.patch('k1', { exitCode: 127 });
    expect(S.calls).toEqual([`reprobe:${CID}:nano`]);
    ops.patch('k1', { signal: 'TERM' } as never);
    expect(S.calls).toHaveLength(1);
    expect(watchedForTests()).toEqual([]);
  });
  it('a refused launcher lookup drops the launcher row; nothing else', () => {
    ops.addLaunch(launch('k1'));
    watchEnd('k1', target);
    ops.addLaunch(launch('k1', { state: 'not_started', code: 'resolve_failed' }));
    expect(S.calls).toEqual([`dropLauncher:${CID}`]);
  });
  it('another end, a non-template 127 or a launch that leaves the store stops the watch and changes nothing', () => {
    ops.addLaunch(launch('k1'));
    ops.addLaunch(launch('k2', { p: 'cmd' }));
    ops.addLaunch(launch('k3'));
    watchEnd('k1', target);
    watchEnd('k2', target);
    watchEnd('k3', target);
    ops.addLaunch(launch('k1', { state: 'exited', exitCode: 1 }));
    ops.addLaunch(launch('k2', { p: 'cmd', state: 'exited', exitCode: 127 }));
    ops.forget('k3');
    expect(S.calls).toEqual([]);
    expect(watchedForTests()).toEqual([]);
  });
  it('one watch per key; at most ENDS_MAX, the oldest going first', () => {
    watchEnd('k1', target);
    watchEnd('k1', target);
    expect(watchedForTests()).toEqual(['k1']);
    for (let i = 0; i < ENDS_MAX; i++) watchEnd(`n${i}`, target);
    expect(watchedForTests()).toHaveLength(ENDS_MAX);
    expect(watchedForTests()).not.toContain('k1');
  });
});
