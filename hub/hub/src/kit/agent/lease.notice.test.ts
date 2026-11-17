// The lease manager over the REAL attach calls (lease-notice set): a tab that keeps a conversation open takes,
// renews and drops leases nobody pressed. When the agent has no answer for them (a lost connection, a 5xx), the shell's
// "a change may have gone through" notice must stay silent: the manager's own retry is the recovery. Fixture: the agent
// answers nothing for /attachments.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onPending, type PendingNotice } from '@core';
import { installTransport, type Transport } from '../../core/transport';
import { boot, R1, TARGET } from '../../core/test/env';
import { createLeaseManager, type SessionRef } from './lease';

const REF: SessionRef = { computer: 'p1-c1', realm: R1, sid: 's1', target: TARGET };
let reqs: Array<{ url: string; method: string }> = [];
let mode: 'lost' | '503' | 'ok' = 'lost';
const tr: Transport = {
  hoody: () => Promise.reject(new Error('x')),
  fetch(url, init) {
    reqs.push({ url, method: String(init.method) });
    if (mode === 'lost') return Promise.reject(new TypeError('Failed to fetch'));
    if (mode === '503') return Promise.resolve(new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }));
    return Promise.resolve(new Response(JSON.stringify({ lease_id: 'L1', expires_at: new Date(Date.now() + 600000).toISOString() }), { status: 201, headers: { 'content-type': 'application/json' } }));
  },
};
let notices: PendingNotice[] = [];
let off: () => void = () => {};
beforeEach(() => { boot({ realm: R1 }); reqs = []; mode = 'lost'; installTransport(tr); notices = []; off = onPending((n) => notices.push(n)); });
afterEach(() => { off(); installTransport(null); });

describe('lease manager: a lease nobody pressed never raises the shell notice', () => {
  for (const m of ['lost', '503'] as const) {
    it(`acquire with no answer (${m}): the call went out, no notice`, async () => {
      mode = m;
      const lm = createLeaseManager({ backoffMs: [60000] });
      const h = lm.track(REF, { pinned: true });
      await lm.ensure(REF);
      expect(reqs.some((r) => r.method === 'POST' && r.url.includes('/attachments'))).toBe(true);
      expect(notices).toEqual([]);
      h.close();
      lm.reset();
    });
  }
  it('a held lease dropped when the chat closes, its release unanswered: no notice', async () => {
    mode = 'ok';
    const lm = createLeaseManager({ backoffMs: [60000] });
    const h = lm.track(REF, { pinned: true });
    await lm.ensure(REF);
    expect(lm.state(REF).phase).toBe('held');
    mode = 'lost';
    h.close();
    await new Promise((r) => setTimeout(r, 20));
    expect(reqs.some((r) => r.method === 'DELETE')).toBe(true);
    expect(notices).toEqual([]);
    lm.reset();
  });
});
