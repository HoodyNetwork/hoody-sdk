// The restart's C9 lock (core's shared lock): only the restart's receipt proves a restart, so a
// fresh overview never frees a held one; and Programs and Computers hold one lock for the same restart
// (core's programLock.restart, identity {id, port, all} from programOp), so a restart held on one page holds the other.
import { beforeEach, describe, expect, it } from 'vitest';
import { defineMutation, programLock, programOp, type Target } from '@core';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import * as data from './data';
import { opsStore } from './parts/ops';
import page from './page';

function webOp() {
  for (const [k, op] of opsStore.snapshot()) if (k.endsWith('|prog:1')) return op;
  return undefined;
}

async function holdRestart() {
  await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
  await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
  await waitFor(() => expect(webOp()?.status).toBe('unknown'));
  const op = webOp();
  if (!op) throw new Error('no op');
  return op;
}

describe('programs: the restart lock', () => {
  beforeEach(() => opsStore.reset());

  it('a fresh overview is no proof: a held restart stays held until its receipt answers', async () => {
    const op = await holdRestart();
    const send = data.usePress();
    const first = await send(op.press);
    expect(first.code).toBe('READ_BACK_FIRST');
    // The refusal's own read-back (a fresh overview) must not have freed it.
    await new Promise((r) => setTimeout(r, 50));
    const again = await send(op.press);
    expect(again.outcome).toBe('not_sent');
    expect(again.code).toBe('READ_BACK_FIRST');
  });

  it('a restart held on Programs holds the same restart sent from Computers', async () => {
    const op = await holdRestart();
    // Computers' restart, built through the shared builder exactly as its Programs tab sends it.
    type V = { id: string; port: number | null; target: Target };
    const restartOf = (v: V) => programOp({ id: v.id, act: 'restart', port: v.port, range: false });
    const computers = defineMutation<V>(data.routes.restart, {
      input: (v) => ({ index: 1, recovers: true, target: v.target, params: { id: v.id }, body: restartOf(v).body }),
      lock: programLock.restart,
      lockKey: (v) => restartOf(v).identity,
    });
    const res = await computers.run({ id: '1', port: null, target: op.target });
    expect(res.outcome).toBe('not_sent');
    // READ_BACK_FIRST, or HELD_BY_OTHER once core names another sender's hold: never sent either way.
    expect(['READ_BACK_FIRST', 'HELD_BY_OTHER']).toContain(res.error?.code);
  });
});
