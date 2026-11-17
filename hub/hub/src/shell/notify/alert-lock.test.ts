// notifyAlert while a passcode is set: a hint alert (a Bot waiting, a script
// finished) carries the generic text, so showAlert says "New notice" and the fixed line, never the caller's words.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreShell from '@core/shell';
import strings from '../strings.en.json';

const shown = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@core/shell', async (orig) => ({
  ...(await orig<typeof CoreShell>()),
  currentStatus: () => ({ state: 'on' }),
  isAway: () => true,
  showAlert: async (a: unknown) => { shown.calls.push(a); return { ok: true, via: 'page' }; },
  snapshot: () => ({ identity: { id: 'u1', banned: false } }),
}));

import { notifyAlert } from './alert';

beforeEach(() => { shown.calls = []; });

describe('notifyAlert and the passcode', () => {
  it('every hint alert carries the generic text: the one-notice title and the fixed line', async () => {
    expect(await notifyAlert('bot', { title: 'Bot "payroll" waits', body: 'Approve wire to ACME', tag: 'b1' })).toBe(true);
    expect(shown.calls).toHaveLength(1);
    expect(shown.calls[0]).toMatchObject({
      title: 'Bot "payroll" waits',
      generic: { title: strings['alert.untitled'], body: strings['alert.body'] },
    });
  });
});
