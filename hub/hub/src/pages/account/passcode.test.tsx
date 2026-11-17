// Vitest: the passcode lock's Account rows. The page runs on the real
// engine (core/applock.ts) over a fake browser: one storage map, FIFO Web Locks that count their grants, a deterministic
// PBKDF2. First set has no current step; change and remove need it and spend a try; the check and the write are one hold.
import { changeLock, setPasscode } from '@core';
import { configureAppLock, isLocked, resetAppLock, type LockRecord } from '@core/applock';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openableLockSheet } from './logic';
import page from './page';
import { digitsOnly, refusedWords } from './parts/LockSheet';
import strings from './strings.en.json';

const UID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const KEY = 'hub_lock:' + UID;
const PASS = '482913';
const NEWPASS = '730215';
const S = strings;

let map: Map<string, string>;
const storage = {
  getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
  setItem: (k: string, v: string) => void map.set(k, String(v)),
  removeItem: (k: string) => void map.delete(k),
};

/** Exclusive, FIFO, one holder per name; `grants` counts every hold the engine took. */
class FakeLocks {
  held = new Set<string>();
  grants = 0;
  queues = new Map<string, Array<() => void>>();
  request = (name: string, o: { mode?: string; signal?: AbortSignal }, cb: (l: unknown) => unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (o.mode !== 'exclusive') return reject(new TypeError('exclusive only'));
      const run = (): void => {
        this.held.add(name);
        this.grants++;
        Promise.resolve()
          .then(() => cb({ name }))
          .then(
            (v) => { this.held.delete(name); resolve(v); this.next(name); },
            (e) => { this.held.delete(name); reject(e); this.next(name); },
          );
      };
      const q = this.queues.get(name) ?? [];
      this.queues.set(name, q);
      q.push(run);
      if (!this.held.has(name)) this.next(name);
    });
  next(name: string): void {
    if (this.held.has(name)) return;
    this.queues.get(name)?.shift()?.();
  }
}

const subtle = {
  importKey: async (_f: string, bytes: Uint8Array) => ({ bytes: new Uint8Array(bytes) }),
  deriveBits: async (alg: { salt: Uint8Array; iterations: number }, key: { bytes: Uint8Array }) => {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = ((key.bytes[i % key.bytes.length] as number) * 31 + (alg.salt[i % alg.salt.length] as number) + i * 7 + alg.iterations) & 255;
    return out.buffer;
  },
} as unknown as SubtleCrypto;

let locks: FakeLocks;
let posted: string[];
let terminal: number;
let seq = 0;
const rnd = (n: number): Uint8Array => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (++seq * 13 + i) & 255;
  return b;
};

function browser(o: { locks?: boolean } = {}): void {
  configureAppLock({
    storage: () => storage,
    locks: () => (o.locks === false ? null : locks),
    subtle: () => subtle,
    random: rnd,
    uid: () => UID,
    sessionOk: () => true,
    visible: () => true,
    post: (uid) => void posted.push(uid),
    listen: () => () => undefined,
    terminal: () => void terminal++,
  });
}

const record = (): LockRecord => JSON.parse(map.get(KEY) as string) as LockRecord;
async function seed(o: { tries?: Partial<LockRecord['tries']>; idleMin?: 1 | 5 | 15 | 60 } = {}): Promise<void> {
  expect(await setPasscode(PASS, { digits: true, idleMin: o.idleMin ?? 15, onLeave: false })).toBe('set');
  if (o.tries) map.set(KEY, JSON.stringify({ ...record(), tries: { ...record().tries, ...o.tries } }));
  locks.grants = 0;
}

async function openDialog(): Promise<HTMLElement> {
  return waitFor(() => {
    const d = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!d) throw new Error('no open dialog');
    return d;
  });
}
const section = async () => (await screen.findByRole('heading', { name: S['lock.title'] }, { timeout: 8000 })).closest('section') ?? document.body;
const press = async (scope: HTMLElement, name: string) => userEvent.click(within(scope).getByRole('button', { name }));

beforeEach(() => {
  resetAppLock();
  map = new Map();
  locks = new FakeLocks();
  posted = [];
  terminal = 0;
  browser();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetAppLock();
});

describe('openableLockSheet (a ?sheet= link)', () => {
  const base = { suspended: false, token: false, record: 'none' as const, supported: true };
  it('opens Set only with no record on a browser that can keep one', () => {
    expect(openableLockSheet('lock-set', base)).toBe('lock-set');
    expect(openableLockSheet('lock-set', { ...base, supported: false })).toBeUndefined();
    expect(openableLockSheet('lock-set', { ...base, record: 'valid' })).toBeUndefined();
    expect(openableLockSheet('lock-set', { ...base, record: 'malformed' })).toBeUndefined();
  });
  it('opens Change and Remove only on a valid record', () => {
    for (const m of ['lock-change', 'lock-remove'] as const) {
      expect(openableLockSheet(m, { ...base, record: 'valid' })).toBe(m);
      expect(openableLockSheet(m, base)).toBeUndefined();
      expect(openableLockSheet(m, { ...base, record: 'malformed' })).toBeUndefined();
    }
  });
  it('opens nothing for a suspended account, a token session or another name', () => {
    expect(openableLockSheet('lock-change', { ...base, record: 'valid', suspended: true })).toBeUndefined();
    expect(openableLockSheet('lock-change', { ...base, record: 'valid', token: true })).toBeUndefined();
    expect(openableLockSheet('lock-set', { ...base, token: true })).toBeUndefined();
    expect(openableLockSheet('password', base)).toBeUndefined();
    expect(openableLockSheet(undefined, base)).toBeUndefined();
  });
});

describe('passcode section', () => {
  it('off: Set a passcode, kept in the URL', async () => {
    const { router } = await renderPage(page);
    const sec = await section();
    expect(within(sec).getByText(S['lock.offBody'])).toBeInTheDocument();
    await press(sec, S['lock.set']);
    const d = await openDialog();
    expect(router.state.location.search).toMatchObject({ sheet: 'lock-set' });
    expect(within(d).queryByLabelText(S['lock.current'])).toBeNull();
  });

  it('unsupported (no Web Locks): Set is disabled and says why', async () => {
    browser({ locks: false });
    await renderPage(page);
    const sec = await section();
    expect(within(sec).getByText(S['lock.err.unsupported'])).toBeInTheDocument();
    expect(within(sec).getByRole('button', { name: S['lock.set'] })).toBeDisabled();
  });

  it('on: the timer line, Lock now, Change, Remove, and what it protects', async () => {
    await seed();
    await renderPage(page);
    const sec = await section();
    expect(within(sec).getByText(S['lock.onBody'].replace('{{time}}', S['lock.min15'].toLowerCase()))).toBeInTheDocument();
    for (const b of ['lock.now', 'lock.change', 'lock.remove'] as const) expect(within(sec).getByRole('button', { name: S[b] })).toBeEnabled();
    expect(within(sec).getByText(S['lock.protects'])).toBeInTheDocument();
    expect(sec).toHaveTextContent(S['lock.limit']);
    await userEvent.click(within(sec).getByRole('link', { name: S['lock.protects'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: S['faq.lockProtects.q'] })).toHaveAttribute('aria-expanded', 'true'));
  });

  it('Lock now locks this tab and posts the lock-only message for the others', async () => {
    await seed();
    await renderPage(page);
    await press(await section(), S['lock.now']);
    expect(isLocked()).toBe(true);
    expect(posted).toEqual([UID]);
  });

  it('an unreadable record: no Change or Remove (Forget on the lock screen only)', async () => {
    map.set(KEY, '{"v":1}');
    await renderPage(page, { path: '/account?sheet=lock-remove' });
    const sec = await section();
    expect(within(sec).getByText(S['lock.err.noVerifier'])).toBeInTheDocument();
    expect(within(sec).queryByRole('button', { name: S['lock.change'] })).toBeNull();
    expect(within(sec).queryByRole('button', { name: S['lock.remove'] })).toBeNull();
    expect(within(sec).queryByRole('button', { name: S['lock.set'] })).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("another tab's set and remove show here (its storage event)", async () => {
    await renderPage(page);
    const sec = await section();
    expect(within(sec).getByRole('button', { name: S['lock.set'] })).toBeInTheDocument();
    await seed();
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: KEY })));
    expect(await within(sec).findByRole('button', { name: S['lock.change'] })).toBeInTheDocument();
    map.delete(KEY);
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: KEY })));
    expect(await within(sec).findByRole('button', { name: S['lock.set'] })).toBeInTheDocument();
  });

  it('a link to Change with no passcode, or to Set with one, opens nothing', async () => {
    await renderPage(page, { path: '/account?sheet=lock-change' });
    await section();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('a Change link refused with no passcode: after another tab sets one, the section Change button opens the sheet', async () => {
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const sec = await section();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await seed();
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: KEY })));
    await within(sec).findByRole('button', { name: S['lock.change'] });
    await press(sec, S['lock.change']);
    const d = await openDialog();
    expect(within(d).getByLabelText(S['lock.current'])).toBeInTheDocument();
  });

  it('a Set link refused with a passcode: after another tab removes it, the section Set button opens the sheet', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-set' });
    const sec = await section();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    map.delete(KEY);
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: KEY })));
    await within(sec).findByRole('button', { name: S['lock.set'] });
    await press(sec, S['lock.set']);
    const d = await openDialog();
    expect(within(d).getByLabelText(S['lock.field'])).toBeInTheDocument();
  });

  it('a link to Set while a passcode is set opens nothing', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-set' });
    await section();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('a suspended account has no passcode section', async () => {
    await renderPage(page, { state: 'suspended' });
    await screen.findByText(S['suspended.title'], {}, { timeout: 8000 });
    expect(screen.queryByRole('heading', { name: S['lock.title'] })).toBeNull();
  });
});

describe('set sheet', () => {
  it('defaults on a fine pointer: 5 minutes, leave off, numbers off', async () => {
    await renderPage(page, { path: '/account?sheet=lock-set' });
    const d = await openDialog();
    expect(within(d).getByRole('radio', { name: S['lock.min5'] })).toBeChecked();
    // Four short choices: one segmented control, never a row of loose radio buttons.
    expect(within(d).getByRole('radio', { name: S['lock.min5'] }).tagName).toBe('BUTTON');
    expect(within(d).getByRole('switch', { name: S['lock.leave'] })).not.toBeChecked();
    expect(within(d).getByRole('checkbox', { name: S['lock.digits'] })).not.toBeChecked();
    expect(within(d).getByText(S['lock.reuse'])).toBeInTheDocument();
    // The link is the end of the Why, after both groups.
    await userEvent.click(within(d).getByRole('button', { name: S['lock.why.q'] }));
    expect(within(d).getByText(S['lock.why.a'])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('link', { name: S['lock.more'] }));
    const peeks = await screen.findAllByRole('dialog');
    expect(within(peeks[peeks.length - 1]!).getByText(S['faq.lockScope.a'])).toBeInTheDocument();
  });

  it('defaults on a coarse pointer: numbers on, leave on', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    await renderPage(page, { path: '/account?sheet=lock-set' });
    const d = await openDialog();
    expect(within(d).getByRole('switch', { name: S['lock.leave'] })).toBeChecked();
    expect(within(d).getByRole('checkbox', { name: S['lock.digits'] })).toBeChecked();
  });

  it('refuses a weak passcode and a mismatch before any engine call', async () => {
    await renderPage(page, { path: '/account?sheet=lock-set' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.field']), '111111');
    await userEvent.type(within(d).getByLabelText(S['lock.again']), '111111');
    await press(d, S['lock.setSave']);
    expect(await within(d).findByText(S['lock.err.weak'])).toBeInTheDocument();
    await userEvent.clear(within(d).getByLabelText(S['lock.field']));
    await userEvent.type(within(d).getByLabelText(S['lock.field']), PASS);
    await press(d, S['lock.setSave']);
    expect(await within(d).findByText(S['lock.err.match'])).toBeInTheDocument();
    expect(locks.grants).toBe(0);
    expect(map.has(KEY)).toBe(false);
  });

  it('Numbers only refuses letters before any engine call, offers the numeric keypad, and full-width digits count', async () => {
    await renderPage(page, { path: '/account?sheet=lock-set' });
    const d = await openDialog();
    const field = () => within(d).getByLabelText(S['lock.field']);
    expect(field()).not.toHaveAttribute('inputmode');
    await userEvent.click(within(d).getByRole('checkbox', { name: S['lock.digits'] }));
    expect(field()).toHaveAttribute('inputmode', 'numeric');
    expect(within(d).getByLabelText(S['lock.again'])).toHaveAttribute('inputmode', 'numeric');
    await userEvent.type(field(), 'k7m2q9');
    await userEvent.type(within(d).getByLabelText(S['lock.again']), 'k7m2q9');
    await press(d, S['lock.setSave']);
    expect(await within(d).findByText(S['lock.err.digits'])).toBeInTheDocument();
    expect(locks.grants).toBe(0);
    expect(map.has(KEY)).toBe(false);
    // Turning the option off takes the refusal back; the same passcode then saves without it.
    await userEvent.click(within(d).getByRole('checkbox', { name: S['lock.digits'] }));
    expect(within(d).queryByText(S['lock.err.digits'])).toBeNull();
    await press(d, S['lock.setSave']);
    expect(await screen.findByText(S['lock.done.set'])).toBeInTheDocument();
    expect(record().digits).toBe(false);
    expect(digitsOnly('４８２９１３')).toBe(true);
    expect(digitsOnly('48291a')).toBe(false);
  });

  it('sets the passcode with the chosen timer, closes, says so, and the section turns on', async () => {
    const { router } = await renderPage(page, { path: '/account?sheet=lock-set' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.field']), PASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), PASS);
    await userEvent.click(within(d).getByRole('radio', { name: S['lock.min15'] }));
    await press(d, S['lock.setSave']);
    expect(await screen.findByText(S['lock.done.set'])).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(router.state.location.search).not.toHaveProperty('sheet');
    expect(record()).toMatchObject({ idleMin: 15, onLeave: false, digits: false, tries: { n: 0 } });
    expect(within(await section()).getByRole('button', { name: S['lock.change'] })).toBeInTheDocument();
  });
  it('another tab set one meanwhile: refused, says so, the other record is kept', async () => {
    await renderPage(page, { path: '/account?sheet=lock-set' });
    const d = await openDialog();
    await seed();
    const theirs = map.get(KEY);
    await userEvent.type(within(d).getByLabelText(S['lock.field']), NEWPASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), NEWPASS);
    await press(d, S['lock.setSave']);
    expect(await within(d).findByText(S['lock.err.changed'])).toBeInTheDocument();
    expect(map.get(KEY)).toBe(theirs);
    expect(within(d).getByLabelText(S['lock.field'])).toHaveValue('');
  });

  it('the session ended meanwhile: the sheet closes and nothing is written', async () => {
    await renderPage(page, { path: '/account?sheet=lock-set' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.field']), PASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), PASS);
    configureAppLock({ uid: () => null });
    await press(d, S['lock.setSave']);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(map.has(KEY)).toBe(false);
    expect(screen.queryByText(S['lock.done.set'])).toBeNull();
  });
});

describe('change sheet', () => {
  it('needs the current passcode before anything is sent', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.current'])).toBeInTheDocument();
    expect(locks.grants).toBe(0);
  });

  it('prefills from the record; a new timer alone keeps the passcode; check and write are one hold', async () => {
    await seed({ idleMin: 15 });
    const hash = record().hash;
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    expect(within(d).getByRole('radio', { name: S['lock.min15'] })).toBeChecked();
    expect(within(d).getByRole('checkbox', { name: S['lock.digits'] })).toBeChecked();
    expect(within(d).queryByLabelText(S['lock.again'])).toBeNull();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await userEvent.click(within(d).getByRole('radio', { name: S['lock.min60'] }));
    await press(d, S['lock.changeSave']);
    expect(await screen.findByText(S['lock.done.changed'])).toBeInTheDocument();
    expect(locks.grants).toBe(1);
    expect(record()).toMatchObject({ idleMin: 60, hash, tries: { n: 0 } });
  });

  it('a new passcode needs typing twice and replaces the verifier', async () => {
    await seed();
    const before = record();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await userEvent.type(within(d).getByLabelText(S['lock.newField']), NEWPASS);
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.match'])).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(S['lock.again']), NEWPASS);
    await press(d, S['lock.changeSave']);
    expect(await screen.findByText(S['lock.done.changed'])).toBeInTheDocument();
    expect(record().hash).not.toBe(before.hash);
    expect(record().rev).not.toBe(before.rev);
  });

  it('a wrong current passcode spends a try, keeps the sheet open and wipes every passcode field', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), '999999x');
    await userEvent.type(within(d).getByLabelText(S['lock.newField']), NEWPASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), NEWPASS);
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.wrong'])).toBeInTheDocument();
    expect(record().tries.n).toBe(1);
    expect(within(d).getByLabelText(S['lock.current'])).toHaveValue('');
    expect(within(d).getByLabelText(S['lock.newFieldAgain'])).toHaveValue('');
    expect(within(d).getByLabelText(S['lock.again'])).toHaveValue('');
    expect(screen.queryByText(S['lock.done.changed'])).toBeNull();
  });

  it('a refused change that carried a new passcode asks for it again: the current passcode alone saves nothing', async () => {
    await seed();
    const before = record();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), '999999x');
    await userEvent.type(within(d).getByLabelText(S['lock.newField']), NEWPASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), NEWPASS);
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.wrong'])).toBeInTheDocument();
    expect(within(d).getByText(S['lock.newAgainHelp'])).toBeInTheDocument();
    const grants = locks.grants;
    // Only the field "Wrong passcode" named is corrected: refused before the engine, the old passcode stays.
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.newAgain'])).toBeInTheDocument();
    expect(locks.grants).toBe(grants);
    expect(record().hash).toBe(before.hash);
    expect(screen.queryByText(S['lock.done.changed'])).toBeNull();
    // Typed again, the replacement goes through.
    await userEvent.type(within(d).getByLabelText(S['lock.newFieldAgain']), NEWPASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), NEWPASS);
    await press(d, S['lock.changeSave']);
    expect(await screen.findByText(S['lock.done.changed'])).toBeInTheDocument();
    expect(record().hash).not.toBe(before.hash);
  });

  it('after a refused replacement, Keep my current passcode saves the settings and keeps the passcode', async () => {
    await seed({ idleMin: 15 });
    const before = record();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    expect(within(d).queryByRole('button', { name: S['lock.keepCurrent'] })).toBeNull();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), '999999x');
    await userEvent.type(within(d).getByLabelText(S['lock.newField']), NEWPASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), NEWPASS);
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.wrong'])).toBeInTheDocument();
    await press(d, S['lock.keepCurrent']);
    expect(within(d).getByLabelText(S['lock.newField'])).toHaveValue('');
    expect(within(d).queryByLabelText(S['lock.again'])).toBeNull();
    await userEvent.click(within(d).getByRole('radio', { name: S['lock.min60'] }));
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await press(d, S['lock.changeSave']);
    expect(await screen.findByText(S['lock.done.changed'])).toBeInTheDocument();
    expect(record()).toMatchObject({ hash: before.hash, idleMin: 60 });
  });

  it('Numbers only refuses a new passcode with letters before any engine call', async () => {
    await seed();
    const before = record();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    expect(within(d).getByRole('checkbox', { name: S['lock.digits'] })).toBeChecked();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await userEvent.type(within(d).getByLabelText(S['lock.newField']), 'k7m2q9');
    await userEvent.type(within(d).getByLabelText(S['lock.again']), 'k7m2q9');
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.digits'])).toBeInTheDocument();
    expect(locks.grants).toBe(0);
    expect(record()).toEqual(before);
  });

  it('from 3 tries left the try count shows, with the wait under it', async () => {
    await seed({ tries: { n: 6, until: 0 } });
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), '999999x');
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText('Wrong passcode. 3 tries left before this browser signs out.')).toBeInTheDocument();
    expect(within(d).getByText(/^Too many wrong passcodes\. Try again in [45]:\d\d\.$/)).toBeInTheDocument();
    expect(record().tries.n).toBe(7);
  });

  it('while a wait runs nothing is checked and no try is spent', async () => {
    await seed({ tries: { n: 5, until: Date.now() + 90_000 } });
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(/^Too many wrong passcodes\. Try again in 1:(30|29)\.$/)).toBeInTheDocument();
    expect(record().tries.n).toBe(5);
    expect(record().idleMin).toBe(15);
  });

  it('the wait counts down once a second and its line goes when it ends', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
    try {
      await seed({ tries: { n: 5, until: Date.now() + 90_000 } });
      await renderPage(page, { path: '/account?sheet=lock-change' });
      const d = await openDialog();
      await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
      await press(d, S['lock.changeSave']);
      const WAIT = /^Too many wrong passcodes\. Try again in (\d):(\d\d)\.$/;
      const left = (): number => {
        const m = WAIT.exec(within(d).getByText(WAIT).textContent ?? '') as RegExpExecArray;
        return Number(m[1]) * 60 + Number(m[2]);
      };
      await within(d).findByText(WAIT);
      const first = left();
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(left()).toBe(first - 1);
      await act(async () => { vi.advanceTimersByTime(10_000); });
      expect(left()).toBe(first - 11);
      // Ended: a wait alone says nothing more (the banner goes), and nothing was checked or spent.
      await act(async () => { vi.advanceTimersByTime(90_000); });
      expect(within(d).queryByText(WAIT)).toBeNull();
      expect(within(d).queryByText(/Too many wrong passcodes/)).toBeNull();
      expect(record().tries.n).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  // The kit useNow clock is off while nothing waits, so when a refusal arrives long after the sheet
  // opened, the first render of its wait must read the time it arrives, not the clock's last value. Every text the
  // dialog shows is recorded (a MutationObserver keeps the replaced ones), so a render corrected by a later effect counts.
  it('a wait that arrives long after the sheet opened shows its own time in every render, never an older clock', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
    const seen: string[] = [];
    const keep = (rs: MutationRecord[]): void => {
      for (const r of rs) {
        if (r.oldValue) seen.push(r.oldValue);
        for (const n of [...r.addedNodes, ...r.removedNodes]) seen.push(n.textContent ?? '');
        seen.push(r.target.textContent ?? '');
      }
    };
    const mo = new MutationObserver(keep);
    try {
      await seed({ tries: { n: 5, until: 0 } });
      await renderPage(page, { path: '/account?sheet=lock-change' });
      const d = await openDialog();
      vi.setSystemTime(Date.now() + 10 * 60_000);
      map.set(KEY, JSON.stringify({ ...record(), tries: { ...record().tries, until: Date.now() + 90_000 } }));
      mo.observe(d, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
      await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
      await press(d, S['lock.changeSave']);
      await within(d).findByText(/^Too many wrong passcodes\. Try again in \d:\d\d\.$/);
      keep(mo.takeRecords());
      const times = seen.flatMap((x) => [...x.matchAll(/Try again in (\d+):(\d\d)/g)].map((m) => Number(m[1]) * 60 + Number(m[2])));
      expect(times.length).toBeGreaterThan(0);
      expect(Math.max(...times)).toBeLessThanOrEqual(90);
    } finally {
      mo.disconnect();
      vi.useRealTimers();
    }
  });

  // The clock moves only to redraw; the time shown is read at each render. After the system clock
  // goes back (a tick stored from the later time), a new wait still shows its full time at once, never less.
  it('after the system clock goes back, a new wait shows its full time in every render', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const seen: string[] = [];
    const keep = (rs: MutationRecord[]): void => {
      for (const r of rs) {
        if (r.oldValue) seen.push(r.oldValue);
        for (const n of [...r.addedNodes, ...r.removedNodes]) seen.push(n.textContent ?? '');
        seen.push(r.target.textContent ?? '');
      }
    };
    const mo = new MutationObserver(keep);
    try {
      await seed({ tries: { n: 5, until: Date.now() + 5 * 60_000 } });
      await renderPage(page, { path: '/account?sheet=lock-change' });
      const d = await openDialog();
      await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
      await press(d, S['lock.changeSave']);
      await within(d).findByText(/^Too many wrong passcodes\. Try again in [45]:\d\d\.$/);
      // One tick while the wait runs, so the clock holds a time; then the system clock goes back a minute.
      await act(async () => { vi.advanceTimersByTime(1000); });
      await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
      vi.setSystemTime(Date.now() - 60_000);
      map.set(KEY, JSON.stringify({ ...record(), tries: { ...record().tries, until: Date.now() + 90_000 } }));
      mo.observe(d, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
      await press(d, S['lock.changeSave']);
      await within(d).findByText(/^Too many wrong passcodes\. Try again in 1:30\.$/);
      keep(mo.takeRecords());
      const times = seen.flatMap((x) => [...x.matchAll(/Try again in (\d+):(\d\d)/g)].map((m) => Number(m[1]) * 60 + Number(m[2])));
      expect(times.length).toBeGreaterThan(0);
      expect(Math.min(...times)).toBeGreaterThanOrEqual(90);
    } finally {
      mo.disconnect();
      vi.useRealTimers();
    }
  });

  it('a wrong try with a wait: the wait line goes when it ends, the try count stays', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
    try {
      await seed({ tries: { n: 6, until: 0 } });
      await renderPage(page, { path: '/account?sheet=lock-change' });
      const d = await openDialog();
      await userEvent.type(within(d).getByLabelText(S['lock.current']), '999999x');
      await press(d, S['lock.changeSave']);
      const TRIES = 'Wrong passcode. 3 tries left before this browser signs out.';
      expect(await within(d).findByText(TRIES)).toBeInTheDocument();
      expect(within(d).getByText(/^Too many wrong passcodes\. Try again in [45]:\d\d\.$/)).toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(6 * 60_000); });
      expect(within(d).queryByText(/Too many wrong passcodes/)).toBeNull();
      expect(within(d).getByText(TRIES)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('removed in another window meanwhile: says so and writes nothing back', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    map.delete(KEY);
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.removedElsewhere'])).toBeInTheDocument();
    expect(map.has(KEY)).toBe(false);
  });
});

describe('change sheet, Numbers only over the kept passcode', () => {
  it('turned on over a passcode with letters: refused before the engine until a numeric one is typed', async () => {
    expect(await setPasscode('k7m2q9x', { digits: false, idleMin: 5, onLeave: false })).toBe('set');
    locks.grants = 0;
    const before = record();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    await userEvent.click(within(d).getByRole('checkbox', { name: S['lock.digits'] }));
    await userEvent.type(within(d).getByLabelText(S['lock.current']), 'k7m2q9x');
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.digitsCurrent'])).toBeInTheDocument();
    expect(locks.grants).toBe(0);
    expect(record()).toEqual(before);
    await userEvent.type(within(d).getByLabelText(S['lock.newField']), NEWPASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), NEWPASS);
    await press(d, S['lock.changeSave']);
    expect(await screen.findByText(S['lock.done.changed'])).toBeInTheDocument();
    expect(record().digits).toBe(true);
    expect(record().hash).not.toBe(before.hash);
  });
});

describe('Numbers only against the passcode in force (two windows)', () => {
  it('a sheet opened over a numeric passcode cannot save Numbers only over the lettered one another window wrote', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    expect(within(d).getByRole('checkbox', { name: S['lock.digits'] })).toBeChecked();
    // Window B: Numbers only off, a lettered passcode.
    expect(await changeLock(PASS, { digits: false, idleMin: 15, onLeave: false, passcode: 'k7m2q9x' })).toEqual({ k: 'saved' });
    const b = record();
    locks.grants = 0;
    // Window A: the new current passcode, no replacement, a new timer, Save.
    await userEvent.type(within(d).getByLabelText(S['lock.current']), 'k7m2q9x');
    await userEvent.click(within(d).getByRole('radio', { name: S['lock.min60'] }));
    await press(d, S['lock.changeSave']);
    expect(await within(d).findByText(S['lock.err.digitsCurrent'])).toBeInTheDocument();
    expect(screen.queryByText(S['lock.done.changed'])).toBeNull();
    expect(locks.grants).toBe(1);
    expect(record()).toMatchObject({ digits: false, hash: b.hash, rev: b.rev, idleMin: 15, tries: { n: 0 } });
    // A numeric replacement then goes through.
    await userEvent.type(within(d).getByLabelText(S['lock.current']), 'k7m2q9x');
    await userEvent.type(within(d).getByLabelText(S['lock.newField']), NEWPASS);
    await userEvent.type(within(d).getByLabelText(S['lock.again']), NEWPASS);
    await press(d, S['lock.changeSave']);
    expect(await screen.findByText(S['lock.done.changed'])).toBeInTheDocument();
    expect(record()).toMatchObject({ digits: true, idleMin: 60 });
    expect(record().hash).not.toBe(b.hash);
  });

  it('the engine: a settings-only digits:true over a lettered verifier writes nothing; a wrong one is still a wrong try', async () => {
    expect(await setPasscode('k7m2q9x', { digits: false, idleMin: 5, onLeave: false })).toBe('set');
    const before = record();
    expect(await changeLock('k7m2q9x', { digits: true, idleMin: 5, onLeave: false })).toEqual({ k: 'needsNumeric' });
    expect(record()).toEqual(before);
    expect(await changeLock('k7m2q9z', { digits: true, idleMin: 5, onLeave: false })).toMatchObject({ k: 'wrong', n: 1 });
    expect(await changeLock('k7m2q9x', { digits: false, idleMin: 15, onLeave: false })).toEqual({ k: 'saved' });
    expect(record()).toMatchObject({ digits: false, idleMin: 15, hash: before.hash, tries: { n: 0 } });
  });
});

describe('the wait words, read at a moment', () => {
  // Interpolates {{name}} and picks _one/_other by count, as the kit's translator does for these keys.
  const t = ((k: string, v?: Record<string, string | number>) => {
    const key = (v && 'count' in v ? `${k}_${v.count === 1 ? 'one' : 'other'}` : k) as keyof typeof S;
    return S[key].replace(/{{(\w+)}}/g, (_m, n: string) => String(v?.[n]));
  }) as unknown as Parameters<typeof refusedWords>[0];
  const until = 1_000_000;
  it('a wait says the time left at that moment, and nothing once it has ended', () => {
    expect(refusedWords(t, { k: 'wait', until }, 'change', until - 30_000)).toEqual({ title: 'Too many wrong passcodes. Try again in 0:30.' });
    expect(refusedWords(t, { k: 'wait', until }, 'remove', until - 29_000)).toEqual({ title: 'Too many wrong passcodes. Try again in 0:29.' });
    expect(refusedWords(t, { k: 'wait', until }, 'change', until - 61_500)).toEqual({ title: 'Too many wrong passcodes. Try again in 1:02.' });
    expect(refusedWords(t, { k: 'wait', until }, 'change', until)).toBeNull();
  });
  it('a wrong try keeps its try count after its wait ends', () => {
    const title = 'Wrong passcode. 3 tries left before this browser signs out.';
    expect(refusedWords(t, { k: 'wrong', n: 7, until }, 'change', until - 1000)).toEqual({ title, body: 'Too many wrong passcodes. Try again in 0:01.' });
    expect(refusedWords(t, { k: 'wrong', n: 7, until }, 'change', until)).toEqual({ title });
  });
});

describe('not saved: words per operation', () => {
  const t = ((k: keyof typeof S) => S[k]) as unknown as Parameters<typeof refusedWords>[0];
  it('a change that did not land and a removal that could not be seen gone say so, never "Not set"', () => {
    expect(refusedWords(t, { k: 'notSaved' }, 'change')).toEqual({ title: S['lock.err.notSavedChange'] });
    expect(refusedWords(t, { k: 'notSaved' }, 'remove')).toEqual({ title: S['lock.err.notSavedRemove'] });
  });

  it('remove: the record still there after the delete keeps the sheet open with the remove words', async () => {
    await seed();
    const del = vi.spyOn(storage, 'removeItem').mockImplementation(() => undefined);
    await renderPage(page, { path: '/account?sheet=lock-remove' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await press(d, S['lock.removeSave']);
    expect(await within(d).findByText(S['lock.err.notSavedRemove'])).toBeInTheDocument();
    expect(within(d).queryByText(S['lock.err.notSaved'])).toBeNull();
    expect(map.has(KEY)).toBe(true);
    del.mockRestore();
  });
});

describe('remove sheet', () => {
  it('a wrong current passcode spends a try and removes nothing', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-remove' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), '999999x');
    await press(d, S['lock.removeSave']);
    expect(await within(d).findByText(S['lock.err.wrong'])).toBeInTheDocument();
    expect(record().tries.n).toBe(1);
    expect(within(d).getByLabelText(S['lock.current'])).toHaveValue('');
  });

  it('the right one removes the record in one hold; the section turns off', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-remove' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), PASS);
    await press(d, S['lock.removeSave']);
    expect(await screen.findByText(S['lock.done.removed'])).toBeInTheDocument();
    expect(map.has(KEY)).toBe(false);
    expect(locks.grants).toBe(1);
    expect(within(await section()).getByRole('button', { name: S['lock.set'] })).toBeInTheDocument();
  });

  it('the 10th wrong try hands over to the engine (sign-out) and closes the sheet', async () => {
    await seed({ tries: { n: 9, until: 0 } });
    await renderPage(page, { path: '/account?sheet=lock-remove' });
    const d = await openDialog();
    await userEvent.type(within(d).getByLabelText(S['lock.current']), '999999x');
    await press(d, S['lock.removeSave']);
    await waitFor(() => expect(terminal).toBe(1));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });
});

describe('the passcode sheet in two groups, then its Why', () => {
  const group = (d: HTMLElement, name: string) => within(d).getByRole('heading', { name }).closest('section')!;
  const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it('set: the passcode fields under one heading with the reuse advice, the timer and the leave switch under Auto-lock', async () => {
    await renderPage(page, { path: '/account?sheet=lock-set' });
    const d = await openDialog();
    const pass = group(d, S['lock.group.passcode']);
    const auto = group(d, S['lock.group.auto']);
    expect(within(pass).getByLabelText(S['lock.field'])).toBeInTheDocument();
    expect(within(pass).getByLabelText(S['lock.again'])).toBeInTheDocument();
    expect(within(pass).getByRole('checkbox', { name: S['lock.digits'] })).toBeInTheDocument();
    expect(within(pass).getByText(S['lock.reuse'])).toBeInTheDocument();
    expect(within(auto).getByRole('radio', { name: S['lock.min5'] })).toBeInTheDocument();
    expect(within(auto).getByRole('switch', { name: S['lock.leave'] })).toBeInTheDocument();
    expect(within(auto).queryByLabelText(S['lock.field'])).toBeNull();
    const why = within(d).getByRole('button', { name: S['lock.why.q'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(follows(auto, why)).toBe(true);
    expect(within(d).queryByRole('link', { name: S['lock.more'] })).toBeNull();
  });

  it('change: the current passcode is the first field of the passcode group', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-change' });
    const d = await openDialog();
    const pass = group(d, S['lock.group.passcode']);
    const current = within(pass).getByLabelText(S['lock.current']);
    expect(follows(current, within(pass).getByLabelText(S['lock.newField']))).toBe(true);
    expect(within(group(d, S['lock.group.auto'])).getByRole('radio', { name: S['lock.min15'] })).toBeChecked();
  });

  it('remove: what it does is the subtitle under the title; only the current passcode is asked, with no groups and no Why', async () => {
    await seed();
    await renderPage(page, { path: '/account?sheet=lock-remove' });
    const d = await openDialog();
    expect(within(d.querySelector('header')!).getByText(S['lock.removeBody'])).toBeInTheDocument();
    expect(within(d).getByLabelText(S['lock.current'])).toBeInTheDocument();
    expect(within(d).queryByRole('heading', { name: S['lock.group.passcode'] })).toBeNull();
    expect(within(d).queryByRole('heading', { name: S['lock.group.auto'] })).toBeNull();
    expect(within(d).queryByRole('button', { name: S['lock.why.q'] })).toBeNull();
  });
});
