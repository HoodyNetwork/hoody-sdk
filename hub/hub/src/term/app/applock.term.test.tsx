// App-lock passcodes are refused in the terminal by an explicit host capability, never inferred
// from memory storage: core's own support check (storage + locks + WebCrypto) would pass here.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | In a mount: hostEnv().passcodeLock is false, lockSupport() false although storage, locks and WebCrypto exist; setPasscode refuses ('unsupported') and stores nothing; the Account page says the terminal has no passcode lock, in its own words (not the web's browser sentence), and draws no Set a passcode | 'passcode refused' |
import { expect, setDefaultTimeout, test } from 'bun:test';
import { PassThrough, Writable } from 'node:stream';
import { hostEnv, lockSettings, lockSupport, queryClient, setPasscode } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { startTermHub } from './lifecycle';
import { UNSTYLED_FOR_TESTS } from './styles';
import strings from '../../pages/account/strings.en.json';
import lockTerm from '../../pages/account/parts/lockTerm.strings.en.json';

setDefaultTimeout(60_000);
const pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
const plain = (s: string) => s.replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-_]/g, '');
// Text as read across a wrapped card: box sides and runs of space are one space.
const flat = (s: string) => plain(s).replace(/[\s│]+/g, ' ');
// Tall enough that the settled Account page shows its Passcode lock card whole (the fourth card).
const ROWS = 100;

test('passcode refused', async () => {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin });
  const w = new Writable({ write(_c, _e, d) { d(); } });
  Object.defineProperties(w, { isTTY: { value: true }, columns: { get: () => 120 }, rows: { get: () => ROWS } });
  const hub = await startTermHub({ pages, path: '/account', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'account', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, stdin, stdout: w as unknown as NodeJS.WriteStream, width: 120, height: ROWS });
  try {
    expect(hostEnv().passcodeLock).toBe(false);
    // What core would otherwise accept: storage, locks and WebCrypto are all present.
    expect(hostEnv().local).toBeTruthy();
    expect(hostEnv().locks).toBeTruthy();
    expect(globalThis.crypto?.subtle).toBeTruthy();
    expect(lockSupport()).toBe(false);
    expect(await setPasscode('482913', { digits: true, idleMin: 15, onLeave: false } as Parameters<typeof setPasscode>[1])).toBe('unsupported');
    expect(lockSettings()).toBeNull();
    // The settled screen, never the output stream: the stream also holds frames drawn while the page was loading.
    const idle = await hub.whenIdle();
    expect(idle.settled).toBe(true);
    // The section's own words are on the screen (the card is drawn), and the web's unsupported state is not: no
    // browser sentence, no Set a passcode that could never work.
    expect(flat(idle.frame)).toContain(lockTerm['term.lock.none']);
    expect(flat(idle.frame)).not.toContain(strings['lock.err.unsupported']);
    expect(flat(idle.frame)).not.toContain(strings['lock.set']);
  } finally {
    await hub.end('quit');
  }
});
