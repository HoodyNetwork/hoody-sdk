// alerts.ts showAlert while a passcode is set: the title and body are generic,
// decided at delivery: right before the page alert is built, and again after the worker fallback's await.
import { beforeEach, describe, expect, it } from 'vitest';
import shellStrings from '../shell/strings.en.json';
import { GENERIC_ALERT, showAlert, type BrowserEnv } from './alerts';
import { resetPrefs } from './prefs';
import { boot, UID } from './test/env';

const GRANTED: BrowserEnv = { hasNotification: true, permission: 'granted', secure: true, ua: 'Mozilla/5.0 Chrome/130', platform: 'Linux', touch: 0, standalone: false };
const KEY = 'hub_lock:' + UID;
const SECRET = { title: 'Bot "payroll" waits at 10.0.0.1', body: 'Approve wire to ACME' };
const GENERIC = { title: '2 new notices', body: 'Open the Hub to read it.' };

type Made = { title: string; body?: string };
function pageAlerts() {
  const made: Made[] = [];
  class Ok { onclick: (() => void) | null = null; constructor(title: string, o: NotificationOptions) { made.push({ title, body: o.body }); } close() {} }
  return { made, N: Ok as unknown as typeof Notification };
}
class Ctor { constructor() { throw new TypeError('Illegal constructor'); } }

/** The worker fallback: getRegistration answers after `during` ran. */
function worker(during: () => void) {
  const made: Made[] = [];
  const reg = { showNotification: async (title: string, o: NotificationOptions) => { made.push({ title, body: o.body }); } };
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: () => new Promise((r) => { setTimeout(() => { during(); r(reg); }, 0); }) },
  });
  return made;
}

beforeEach(() => { boot(); resetPrefs(); delete (window.navigator as { serviceWorker?: unknown }).serviceWorker; });

describe('showAlert while a passcode is set', () => {
  it('no passcode: the alert says what it was given', async () => {
    const p = pageAlerts();
    expect(await showAlert({ ...SECRET, generic: GENERIC }, GRANTED, p.N)).toEqual({ ok: true, via: 'page' });
    expect(p.made).toEqual([{ title: SECRET.title, body: SECRET.body }]);
  });

  it('a passcode set (locked or not): the generic title and body, nothing of what it was given', async () => {
    localStorage.setItem(KEY, '{"v":1,"any":"record"}');
    const p = pageAlerts();
    expect(await showAlert({ ...SECRET, generic: GENERIC }, GRANTED, p.N)).toEqual({ ok: true, via: 'page' });
    expect(p.made).toEqual([GENERIC]);
  });

  it('a passcode set and no generic text given (a test alert): the one-notice wording, nothing of what it was given', async () => {
    localStorage.setItem(KEY, '{"v":1,"any":"record"}');
    const p = pageAlerts();
    await showAlert(SECRET, GRANTED, p.N);
    expect(p.made).toEqual([{ title: 'New notice', body: 'Open the Hub to read it.' }]);
  });

  it("the fallback is the shell's own alert wording (they cannot drift apart)", () => {
    expect(GENERIC_ALERT).toEqual({ title: shellStrings['alert.untitled'], body: shellStrings['alert.body'] });
  });

  it('another account\'s passcode does not make this account\'s alerts generic', async () => {
    localStorage.setItem('hub_lock:64f0c0ffee0000000000beef', '{"v":1}');
    const p = pageAlerts();
    await showAlert({ ...SECRET, generic: GENERIC }, GRANTED, p.N);
    expect(p.made).toEqual([{ title: SECRET.title, body: SECRET.body }]);
  });

  it('the worker fallback decides again after its await: a passcode set meanwhile → generic', async () => {
    const made = worker(() => { localStorage.setItem(KEY, '{"v":1}'); });
    expect(await showAlert({ ...SECRET, generic: GENERIC }, GRANTED, Ctor as unknown as typeof Notification)).toEqual({ ok: true, via: 'worker' });
    expect(made).toEqual([GENERIC]);
  });

  it('the worker fallback with no passcode meanwhile: the given text', async () => {
    const made = worker(() => {});
    await showAlert({ ...SECRET, generic: GENERIC }, GRANTED, Ctor as unknown as typeof Notification);
    expect(made).toEqual([{ title: SECRET.title, body: SECRET.body }]);
  });

  it('a passcode record that cannot be read counts as set (fail closed)', async () => {
    localStorage.setItem(KEY, 'not json');
    const p = pageAlerts();
    await showAlert({ ...SECRET, generic: GENERIC }, GRANTED, p.N);
    expect(p.made).toEqual([GENERIC]);
  });
});
