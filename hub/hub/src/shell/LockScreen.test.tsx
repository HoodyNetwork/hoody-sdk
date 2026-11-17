// The lock screen against a fake engine: what it shows for each
// answer, that it shows nothing of the account, that Forget's confirm renders inside the lock host, and that an answer
// from an earlier lock is not shown as this one's. The real engine and two real pages are the Playwright run.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Res = { k: string; n?: number; until?: number };
const eng = vi.hoisted(() => ({
  view: { locked: true, record: 'valid', removed: false, noWebLocks: false, tries: null } as { locked: boolean; record: string; removed: boolean; noWebLocks: boolean; tries: { n: number; until: number; out: boolean } | null },
  digits: false,
  listeners: new Set<() => void>(),
  version: 0,
  check: vi.fn<(p: string) => Promise<Res>>(),
  forget: vi.fn<(o?: { terminal?: boolean }) => 'purged' | 'failed'>(),
  host: null as HTMLElement | null,
  set(v: Partial<{ locked: boolean; record: string; removed: boolean; noWebLocks: boolean; tries: { n: number; until: number; out: boolean } | null }>) {
    this.view = { ...this.view, ...v };
    this.version += 1;
    for (const l of [...this.listeners]) l();
  },
}));

vi.mock('@core/shell', async () => {
  const { useSyncExternalStore } = await import('react');
  const sub = (l: () => void) => { eng.listeners.add(l); return () => { eng.listeners.delete(l); }; };
  return {
    MAX_TRIES: 10,
    checkPasscode: (p: string) => eng.check(p),
    forgetHere: (o?: { terminal?: boolean }) => eng.forget(o),
    lockHost: () => eng.host,
    lockSettings: () => (eng.view.record === 'valid' ? { set: true, digits: eng.digits, idleMin: 5, onLeave: false } : null),
    lockView: () => eng.view,
    useLockVersion: () => useSyncExternalStore(sub, () => eng.version),
  };
});

import { clock, LockScreen } from './LockScreen';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => { resolve = r; });
  return { p, resolve };
}
const field = () => screen.getByLabelText('Passcode') as HTMLInputElement;
const unlock = () => screen.getByRole('button', { name: /^(Unlock|Try again in)/ });
// A wrong try as the real engine makes it: the shared record (count + wait) written and the lock view notified,
// then the answer. The screen's counts come only from that record.
const wrongAt = (n: number, until: number) => async (): Promise<Res> => {
  eng.set({ tries: { n, until, out: false } });
  return { k: 'wrong', n, until };
};
async function typeAndSubmit(v: string) {
  fireEvent.change(field(), { target: { value: v } });
  await act(async () => { fireEvent.click(unlock()); });
}

beforeEach(() => {
  eng.view = { locked: true, record: 'valid', removed: false, noWebLocks: false, tries: null };
  eng.digits = false;
  eng.listeners.clear();
  eng.check.mockReset();
  eng.forget.mockReset();
  eng.host = document.createElement('div');
  eng.host.id = 'hub-lock-host';
  document.body.appendChild(eng.host);
});
afterEach(() => { cleanup(); eng.host?.remove(); vi.useRealTimers(); });

describe('the lock screen', () => {
  it('unlocked: renders nothing', () => {
    eng.view.locked = false;
    const { container } = render(<LockScreen />);
    expect(container.textContent).toBe('');
  });

  it('locked: the title, one line, the field (focused), Unlock and Forget; nothing of the account', () => {
    const { container } = render(<LockScreen />);
    expect(screen.getByRole('heading', { name: 'Hoody Hub is locked' })).toBeTruthy();
    expect(screen.getByText('Enter your passcode to go on.')).toBeTruthy();
    expect(document.activeElement).toBe(field());
    expect(field().type).toBe('password');
    expect((unlock() as HTMLButtonElement).disabled || unlock().getAttribute('data-disabled') !== null).toBe(true);
    expect(screen.getByRole('button', { name: 'Forget this browser' })).toBeTruthy();
    expect(container.textContent).not.toMatch(/@|realm|computer/i);
  });

  it('numbers only: the field asks for the numeric keyboard', () => {
    eng.digits = true;
    render(<LockScreen />);
    expect(field().getAttribute('inputmode')).toBe('numeric');
  });

  it('a right passcode: checkPasscode with the typed text, the field cleared', async () => {
    eng.check.mockResolvedValue({ k: 'unlocked' });
    render(<LockScreen />);
    await typeAndSubmit('482915');
    expect(eng.check).toHaveBeenCalledWith('482915');
    expect(field().value).toBe('');
  });

  it('wrong with many tries left: "Wrong passcode." only; from 3 left: how many before this browser signs out', async () => {
    eng.check.mockImplementationOnce(wrongAt(6, 0)).mockImplementationOnce(wrongAt(7, 0)).mockImplementationOnce(wrongAt(9, 0));
    render(<LockScreen />);
    await typeAndSubmit('111111');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode.');
    await typeAndSubmit('111112');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 3 tries left before this browser signs out.');
    await typeAndSubmit('111113');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 1 try left before this browser signs out.');
  });

  it('the counts come only from the stored record: an answer whose own count disagrees shows the record\'s, never its own', async () => {
    // The answer says 9 (1 left) but the shared record holds 2: no warning. Then the record says 8 with no answer of this screen.
    eng.check.mockImplementationOnce(async () => { eng.set({ tries: { n: 2, until: 0, out: false } }); return { k: 'wrong', n: 9, until: 0 }; });
    render(<LockScreen />);
    await typeAndSubmit('111111');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode.');
    act(() => { eng.set({ tries: { n: 8, until: 0, out: false } }); });
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 2 tries left before this browser signs out.');
  });

  it('a wrong answer with no stored count (the record unreadable): "Wrong passcode." and no countdown of its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    eng.check.mockResolvedValueOnce({ k: 'wrong', n: 9, until: 1_030_000 });
    render(<LockScreen />);
    await typeAndSubmit('111111');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode.');
    expect(unlock().textContent).toBe('Unlock');
  });

  it('wrong tries 7 to 9 come with their real waits (5 min, 15 min, 1 h): the tries-left line stays while the button counts down', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    eng.check.mockImplementationOnce(wrongAt(9, 1_000_000 + 3_600_000));
    render(<LockScreen />);
    await typeAndSubmit('111113');
    expect(unlock().textContent).toBe('Try again in 60:00');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 1 try left before this browser signs out.');
  });

  it('the warning stays after the wait ends: the field and Unlock come back, the tries-left line does not go', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    eng.check.mockImplementationOnce(wrongAt(7, 1_000_000 + 300_000));
    render(<LockScreen />);
    await typeAndSubmit('111117');
    expect(unlock().textContent).toBe('Try again in 5:00');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 3 tries left before this browser signs out.');
    await act(async () => { vi.advanceTimersByTime(300_000); });
    expect(unlock().textContent).toBe('Unlock');
    expect(field().disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 3 tries left before this browser signs out.');
  });

  it('a reload after a wait ended keeps the warning from the stored count', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    eng.view.tries = { n: 8, until: 900_000, out: false };
    render(<LockScreen />);
    expect(unlock().textContent).toBe('Unlock');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 2 tries left before this browser signs out.');
  });

  it('a reload during a stored wait: the countdown and the disabled field at once, with no check of its own', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    eng.view.tries = { n: 8, until: 1_000_000 + 900_000, out: false };
    render(<LockScreen />);
    expect(unlock().textContent).toBe('Try again in 15:00');
    expect(field().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 2 tries left before this browser signs out.');
    expect(eng.check).not.toHaveBeenCalled();
  });

  it('a stored wait written by another tab while this screen shows: the countdown follows the engine', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    render(<LockScreen />);
    expect(unlock().textContent).toBe('Unlock');
    await act(async () => { eng.set({ tries: { n: 5, until: 1_030_000, out: false } }); });
    expect(unlock().textContent).toBe('Try again in 0:30');
  });

  it('another tab\'s count change updates both the countdown and the warning, with no input here', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    eng.view.tries = { n: 6, until: 1_000_000 + 60_000, out: false };
    render(<LockScreen />);
    expect(unlock().textContent).toBe('Try again in 1:00');
    expect(screen.getByRole('alert').textContent).toBe('');
    await act(async () => { eng.set({ tries: { n: 7, until: 1_000_000 + 300_000, out: false } }); });
    expect(unlock().textContent).toBe('Try again in 5:00');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 3 tries left before this browser signs out.');
    await act(async () => { eng.set({ tries: { n: 8, until: 1_000_000 + 900_000, out: false } }); });
    expect(unlock().textContent).toBe('Try again in 15:00');
    expect(screen.getByRole('alert').textContent).toBe('Wrong passcode. 2 tries left before this browser signs out.');
    expect(eng.check).not.toHaveBeenCalled();
  });

  it('a stored wait that arrives long after the screen last ticked counts from now, not from the last tick', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    render(<LockScreen />);
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
    await act(async () => { eng.set({ tries: { n: 5, until: Date.now() + 30_000, out: false } }); });
    expect(unlock().textContent).toBe('Try again in 0:30');
  });

  it('a wait: the button counts down "Try again in 0:30", the field is disabled; at the end both come back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, now: 1_000_000 });
    eng.check.mockImplementationOnce(wrongAt(5, 1_030_000));
    render(<LockScreen />);
    await typeAndSubmit('222222');
    expect(unlock().textContent).toBe('Try again in 0:30');
    expect(field().disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(29_000); });
    expect(unlock().textContent).toBe('Try again in 0:01');
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(unlock().textContent).toBe('Unlock');
    expect(field().disabled).toBe(false);
  });

  it('check failures and "locked again" have their own lines', async () => {
    eng.check.mockResolvedValueOnce({ k: 'check' }).mockResolvedValueOnce({ k: 'again' });
    render(<LockScreen />);
    await typeAndSubmit('333333');
    expect(screen.getByRole('alert').textContent).toBe("Couldn't check the passcode. Try again.");
    await typeAndSubmit('333334');
    expect(screen.getByRole('alert').textContent).toBe('Locked again. Enter your passcode.');
  });

  it('an answer that comes back after the tab unlocked and locked again is not shown as this lock\'s', async () => {
    const d = deferred<Res>();
    eng.check.mockReturnValue(d.p);
    render(<LockScreen />);
    await typeAndSubmit('444444');
    act(() => { eng.set({ locked: false }); });
    act(() => { eng.set({ locked: true }); });
    await act(async () => { d.resolve({ k: 'wrong', n: 9, until: 0 }); });
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(document.activeElement).toBe(field());
  });

  it('the passcode was removed in another window: that line and Reload, no field', () => {
    eng.view.removed = true;
    render(<LockScreen />);
    expect(screen.getByRole('alert').textContent).toBe('The passcode was turned off in another window. Reload to continue.');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.queryByLabelText('Passcode')).toBeNull();
  });

  it('no verifier (unreadable record) and no Web Locks: Forget this browser only', () => {
    eng.view.record = 'malformed';
    render(<LockScreen />);
    expect(screen.getByRole('alert').textContent).toMatch(/^This lock can't be opened on this browser/);
    expect(screen.queryByLabelText('Passcode')).toBeNull();
    cleanup();
    eng.view = { locked: true, record: 'valid', removed: false, noWebLocks: true, tries: null };
    render(<LockScreen />);
    expect(screen.getByRole('alert').textContent).toBe("This browser can't check your passcode safely. Forget this browser to continue.");
    expect(screen.getByRole('button', { name: 'Forget this browser' })).toBeTruthy();
    expect(screen.queryByLabelText('Passcode')).toBeNull();
  });
});

describe('Forget', () => {
  it('the Forgot confirm isolates what is behind it: the card and the lock notices are inert while it is open, back at close', async () => {
    render(<LockScreen><button type="button">notice action</button></LockScreen>);
    const screenEl = document.querySelector('[data-hub-lock-screen]')!;
    expect(screenEl.hasAttribute('inert')).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Forget this browser' })); });
    const dialog = await screen.findByRole('alertdialog');
    expect(screenEl.hasAttribute('inert')).toBe(true);
    expect(screenEl.contains(field())).toBe(true);
    expect(screenEl.contains(screen.getByText('notice action'))).toBe(true);
    expect(screenEl.contains(dialog)).toBe(false);
    const cancel = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!;
    await act(async () => { fireEvent.click(cancel); });
    expect(screenEl.hasAttribute('inert')).toBe(false);
  });

  it('Forgot → the confirm renders inside the lock host; confirming runs forgetHere()', async () => {
    eng.forget.mockReturnValue('purged');
    render(<LockScreen />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Forget this browser' })); });
    const dialog = await screen.findByRole('alertdialog');
    expect(eng.host!.contains(dialog)).toBe(true);
    expect(dialog.textContent).toContain('Forget this browser?');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Forget this browser')!;
    await act(async () => { fireEvent.click(confirm); });
    expect(eng.forget).toHaveBeenCalledTimes(1);
    expect(eng.forget.mock.calls[0]![0]).toEqual({});
  });

  it("'failed': the purge message and Try again, which runs Forget again", async () => {
    eng.forget.mockReturnValueOnce('failed').mockReturnValueOnce('purged');
    render(<LockScreen />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Forget this browser' })); });
    const dialog = await screen.findByRole('alertdialog');
    await act(async () => { fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Forget this browser')!); });
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't clear your data/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(eng.forget).toHaveBeenCalledTimes(2);
  });

  it('a reload with a stored out (the boot terminal path ran, its Forget failed): the purge message and Try again, no field', async () => {
    eng.view.tries = { n: 10, until: 0, out: true };
    eng.forget.mockReturnValue('failed');
    render(<LockScreen />);
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't clear your data/);
    expect(screen.queryByLabelText('Passcode')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(eng.forget).toHaveBeenCalledWith({ terminal: true });
  });

  it('the terminal answer with the page still here (its Forget failed): Try again runs the terminal Forget', async () => {
    eng.check.mockResolvedValue({ k: 'terminal' });
    eng.forget.mockReturnValue('failed');
    render(<LockScreen />);
    await typeAndSubmit('555555');
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't clear your data/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(eng.forget).toHaveBeenCalledWith({ terminal: true });
  });
});

describe('clock', () => {
  it('m:ss, rounded up, never negative', () => {
    expect(clock(28_000)).toBe('0:28');
    expect(clock(27_001)).toBe('0:28');
    expect(clock(3_600_000)).toBe('60:00');
    expect(clock(-5)).toBe('0:00');
  });
});

describe('the lock screen brand', () => {
  it('shows the Hoody logo: the filled mark beside the word, both hidden from the screen reader', () => {
    render(<LockScreen />);
    const brand = document.querySelector('[data-hub-lock-brand]') as HTMLElement;
    expect(brand).toBeTruthy();
    expect(brand.getAttribute('aria-hidden')).toBe('true');
    const mark = brand.querySelector('svg');
    expect(mark).toBeTruthy();
    expect(mark?.querySelector('path[fill-rule="evenodd"]')).toBeTruthy();
    expect(brand.textContent).toBe('Hoody');
    // Still one heading: the logo is not the title.
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });
});
