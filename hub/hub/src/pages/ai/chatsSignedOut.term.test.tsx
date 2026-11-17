// AI › Chats › This computer when the computer's agent lost its platform login (GET /sessions answered 503
// restriction_unknown on two real computers): the list's place holds the shared agent sign-in, never "This didn't load"
// (kit agent.ts: a signed-out agent is not an outage). Fixture: pages/ai/fixtures.ts `chatsSignedOut`.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`a signed-out agent's chat list offers the sign-in (${cols}x${rows})`, async () => {
    const s = await renderPage({ page: 'ai', fx: 'chatsSignedOut', path: '/ai', cols, rows, settleMs: 30000 });
    close = () => s.close();
    expect(s.failures).toEqual([]);
    const flat = s.frame.replace(/\s+/g, ' ');
    expect(flat).toContain("isn't signed in");
    expect(flat).toContain('Sign the agent in');
    expect(flat).not.toContain("This didn't load");
  }, 120_000);
}
