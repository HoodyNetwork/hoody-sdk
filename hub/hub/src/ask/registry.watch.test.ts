// A pinned engine follows the strongest watch of its holders (stream > state > off), at the
// best rank among the holders that want a stream; a holder that never asked counts as stream at `dock`. So a passive holder (a
// Board tile in view) never downgrades another's (the AI tab's open chat), and the last holder's level is the engine's.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    liveIO: (t: { container: { id: string } }) => {
      const g = globalThis as { __fake?: InstanceType<typeof FakeAgent> };
      g.__fake ??= new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'] }, realClock);
      return real.withFixtureDest(g.__fake, t.container.id);
    },
  };
});

import './data';
import { computerHandle } from '@core';
import { AskEngine } from './engine';
import { ACCOUNT, REALM, slot, world, type World } from './accept/env';

let w: World | null = null;
afterEach(async () => {
  const R = await import('./registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
  w?.dispose();
  w = null;
  delete (globalThis as { __fake?: unknown }).__fake;
});

const AT = { project: slot.project, id: slot.computer, name: 'atlas' };
const ref = { computer: computerHandle(AT), realm: REALM, sid: 'sess-1' };

async function two() {
  w = world();
  const set = vi.spyOn(AskEngine.prototype, 'setWatch');
  const R = await import('./registry');
  const a = R.openRef(ACCOUNT, ref, AT)!;
  const b = R.openRef(ACCOUNT, ref, AT)!;
  expect(a.current()).toBe(b.current());
  const last = () => set.mock.calls.at(-1);
  return { a, b, set, last };
}

describe('the pinned engine\'s watch: the strongest of its holders', () => {
  it('a passive holder never downgrades one that never asked (stream at dock)', async () => {
    const { a, b, last } = await two();
    b.watch('off');
    expect(last()).toEqual(['stream', 'dock']);
    b.watch('stream', 'visible');
    expect(last()).toEqual(['stream', 'dock']);
    a.release(); b.release();
  });

  it('the best rank among the holders that want a stream wins; state and off never lend theirs', async () => {
    const { a, b, last } = await two();
    a.watch('stream', 'visible');
    b.watch('stream', 'focused');
    expect(last()).toEqual(['stream', 'focused']);
    b.watch('state', 'open');
    expect(last()).toEqual(['stream', 'visible']);
    a.release(); b.release();
  });

  it('stream > state > off, and a holder that lets go leaves the others\' level', async () => {
    const { a, b, last } = await two();
    a.watch('off');
    b.watch('state');
    expect(last()).toEqual(['state', undefined]);
    b.release();
    expect(last()).toEqual(['off', undefined]);
    a.watch('stream', 'focused');
    expect(last()).toEqual(['stream', 'focused']);
    a.release();
  });

  it('a holder that joins later sets the demand again: it counts as stream at dock until it asks', async () => {
    w = world();
    const set = vi.spyOn(AskEngine.prototype, 'setWatch');
    const R = await import('./registry');
    const last = () => set.mock.calls.at(-1);
    const a = R.openRef(ACCOUNT, ref, AT)!;
    a.watch('off');
    expect(last()).toEqual(['off', undefined]);
    // The AI tab's chat (never asks) joins the hidden tile's engine: the stream comes back at dock.
    const b = R.openRef(ACCOUNT, ref, AT)!;
    expect(b.current()).toBe(a.current());
    expect(last()).toEqual(['stream', 'dock']);
    b.release();
    expect(last()).toEqual(['off', undefined]);
    // A visible tile joins a stream asked at visible: the unasked joiner lends dock, then its own watch keeps the best.
    a.watch('stream', 'visible');
    const c = R.openRef(ACCOUNT, ref, AT)!;
    expect(last()).toEqual(['stream', 'dock']);
    c.watch('stream', 'focused');
    expect(last()).toEqual(['stream', 'focused']);
    c.release();
    expect(last()).toEqual(['stream', 'visible']);
    a.release();
  });

  it('a released holder\'s watch is ignored', async () => {
    const { a, b, set } = await two();
    b.watch('off');
    b.release();
    const n = set.mock.calls.length;
    b.watch('stream', 'open');
    expect(set.mock.calls.length).toBe(n);
    a.release();
  });
});
