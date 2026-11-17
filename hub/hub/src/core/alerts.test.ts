// alerts.test.ts: browser alerts and hints (pure rules, the per-account choices, permission and one native alert).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AlertNotice,
  type BrowserEnv,
  addShown,
  alertStatus,
  cleanAlertText,
  disableAlerts,
  enableAlerts,
  firstHelp,
  freshNotices,
  getChoice,
  hintSection,
  hintWanted,
  isBroken,
  planAlerts,
  platformOf,
  readList,
  setChoice,
  showAlert,
  SHOWN_RING,
} from './alerts';
import { resetPrefs } from './prefs';
import { boot, UID } from './test/env';

const n = (id: string, at: string, read = false): AlertNotice => ({ id, at, read });
const ENV: BrowserEnv = { hasNotification: true, permission: 'default', secure: true, ua: 'Mozilla/5.0 Chrome/130', platform: 'Linux', touch: 0, standalone: false };
const GRANTED: BrowserEnv = { ...ENV, permission: 'granted' };

beforeEach(() => { boot(); resetPrefs(); });

describe('alertStatus', () => {
  const st = (e: Partial<BrowserEnv>, alerts: string | null = null, broken = false) => alertStatus({ ...ENV, ...e }, { alerts, broken }).state;
  it('walks the permission states', () => {
    expect(st({})).toBe('ask');
    expect(st({ permission: 'denied' })).toBe('blocked');
    expect(st({ permission: 'granted' })).toBe('off');
    expect(st({ permission: 'granted' }, 'on')).toBe('on');
    expect(st({ permission: 'granted' }, 'on', true)).toBe('broken');
    expect(st({ secure: false })).toBe('unsupported');
    expect(st({ hasNotification: false, permission: undefined })).toBe('unsupported');
  });
  it('says an iPhone tab cannot alert and points at the iOS help', () => {
    const e = { ...ENV, hasNotification: false, permission: undefined, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604', platform: 'iPhone', touch: 5 };
    expect(alertStatus(e, { alerts: null, broken: false }).why).toBe('ios_tab');
    expect(firstHelp(platformOf(e))).toBe('ios');
  });
});

describe('cleanAlertText', () => {
  it('strips controls and bidi overrides and cuts on a code point', () => {
    expect(cleanAlertText('a‮b\u0007  c', 20)).toBe('a b c');
    expect(cleanAlertText('x'.repeat(10), 5)).toBe('xxxx…');
    const cut = cleanAlertText(`${'x'.repeat(4)}😀tail`, 6);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/[\uD800-\uDBFF]…$/);
  });
});

describe('hints', () => {
  it('draws only when there is something to offer', () => {
    expect(hintWanted('bell', [], 'ask')).toBe(true);
    expect(hintWanted('bell', ['bell'], 'ask')).toBe(false);
    expect(hintWanted('bell', [], 'on')).toBe(false);
    expect(hintWanted('nope', [], 'ask')).toBe(false);
    expect(hintWanted('bot', [], 'unsupported')).toBe(false);
    expect(hintWanted('computer', [], 'unsupported')).toBe(true);
    expect(hintSection('computer', 'broken')).toBe('where');
    expect(hintSection('computer', 'ask')).toBe('browser');
  });
});

describe('alert engine', () => {
  const rows = [n('d', '2026-10-23T03:00:00Z'), n('c', '2026-10-23T02:00:00Z'), n('b', '2026-10-23T01:00:00Z'), n('a', '2026-10-23T00:00:00Z')];
  it('finds new, unread, never-alerted notices oldest first', () => {
    expect(freshNotices(rows, { id: 'a', at: '2026-10-23T00:00:00Z' }, []).map((r) => r.id)).toEqual(['b', 'c', 'd']);
    expect(freshNotices(rows, { id: 'a', at: '2026-10-23T00:00:00Z' }, ['c']).map((r) => r.id)).toEqual(['b', 'd']);
    expect(freshNotices([n('x', '2026-10-23T05:00:00Z', true)], { id: '', at: '' }, [])).toEqual([]);
  });
  it('alerts up to three one by one, else once for all', () => {
    expect(planAlerts([], false)).toBeNull();
    const two = planAlerts(rows.slice(0, 2), false);
    expect(Array.isArray(two) && two.length).toBe(2);
    expect(planAlerts(rows, false)).toMatchObject({ kind: 'many', n: 4, tagId: 'a' });
    expect(planAlerts(rows.slice(0, 1), true)).toMatchObject({ kind: 'many', more: true });
  });
  it('keeps a bounded ring of alerted ids', () => {
    const ids = Array.from({ length: SHOWN_RING + 5 }, (_, i) => `id${i}`);
    const ring = addShown([], ids);
    expect(ring).toHaveLength(SHOWN_RING);
    expect(ring.at(-1)).toBe(`id${SHOWN_RING + 4}`);
    expect(addShown(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('choices: per account, under the registered keys', () => {
  it('stores under the caller uid, refuses a malformed uid and reads lists fail-closed', () => {
    expect(setChoice(UID, 'alerts', 'on')).toBe(true);
    expect(localStorage.getItem(`hub_notify:${UID}:alerts`)).toBe('on');
    expect(getChoice(UID, 'alerts')).toBe('on');
    expect(getChoice('other_uid', 'alerts')).toBeNull();
    expect(setChoice('bad uid!', 'alerts', 'on')).toBe(false);
    expect(getChoice('bad uid!', 'alerts')).toBeNull();
    setChoice(UID, 'shown', JSON.stringify(['a', 1, 'b']));
    expect(localStorage.getItem(`hub_notify_shown:${UID}`)).toBe('["a",1,"b"]');
    expect(readList(UID, 'shown')).toEqual(['a', 'b']);
    setChoice(UID, 'hints', '{oops');
    expect(readList(UID, 'hints')).toEqual([]);
  });
  it('disable switches off and resets the baseline', () => {
    setChoice(UID, 'seen', '{"id":"x"}');
    expect(disableAlerts(UID)).toEqual({ remembered: true });
    expect(getChoice(UID, 'alerts')).toBe('off');
    expect(getChoice(UID, 'seen')).toBe('');
  });
});

describe('enableAlerts: permission only from a call', () => {
  it('a blocked browser is not asked; a grant switches on with a fresh baseline', async () => {
    const N = { requestPermission: vi.fn(async () => 'granted') } as unknown as typeof Notification;
    expect((await enableAlerts(UID, { ...ENV, permission: 'denied' }, N)).state).toBe('blocked');
    expect(N.requestPermission).not.toHaveBeenCalled();
    setChoice(UID, 'seen', '{"id":"old"}');
    const r = await enableAlerts(UID, ENV, N);
    expect(r).toEqual({ state: 'on', remembered: true, answer: 'granted' });
    expect(getChoice(UID, 'seen')).toBe('');
  });
  it('the account ends while the prompt is open: a late grant writes no empty seen key (removed at sign-out)', async () => {
    let answer: (p: string) => void = () => {};
    const N = { requestPermission: vi.fn(() => new Promise<string>((r) => { answer = r; })) } as unknown as typeof Notification;
    const pending = enableAlerts(UID, ENV, N);
    const { endAccount } = await import('./realm');
    endAccount('expired');
    answer('granted');
    await pending;
    expect(localStorage.getItem(`hub_notify_seen:${UID}`)).toBeNull();
  });
  it('a dismissed prompt decides nothing', async () => {
    const N = { requestPermission: vi.fn(async () => 'default') } as unknown as typeof Notification;
    expect(await enableAlerts(UID, ENV, N)).toEqual({ state: 'ask', remembered: true, answer: 'default' });
    expect(getChoice(UID, 'alerts')).toBeNull();
  });
});

describe('showAlert', () => {
  it('builds a cleaned alert, and remembers a browser that refuses to build one from a page', async () => {
    const made: { title: string; body?: string }[] = [];
    class Ok { onclick: (() => void) | null = null; constructor(title: string, o: NotificationOptions) { made.push({ title, body: o.body }); } close() {} }
    expect(await showAlert({ title: 'Hi‮', body: 'x\u0007y' }, GRANTED, Ok as unknown as typeof Notification)).toEqual({ ok: true, via: 'page' });
    expect(made).toEqual([{ title: 'Hi', body: 'x y' }]);
    class Bad { constructor() { throw new TypeError('Illegal constructor'); } }
    expect(await showAlert({ title: 't', body: 'b' }, GRANTED, Bad as unknown as typeof Notification)).toEqual({ ok: false, reason: 'ctor' });
    expect(isBroken()).toBe(true);
    expect(await showAlert({ title: 't', body: 'b' }, ENV, Ok as unknown as typeof Notification)).toEqual({ ok: false, reason: 'denied' });
    await showAlert({ title: 't', body: 'b' }, GRANTED, Ok as unknown as typeof Notification);
    expect(isBroken()).toBe(false);
  });
});
