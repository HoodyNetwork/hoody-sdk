// Vitest: the entry's one value control. While masked the page holds no copy of the
// value; Copy reads, copies the exact bytes and drops; every exit (eye-off, the tab hidden, Cancel, closing the entry)
// fences a read still in flight and aborts it; an encrypted value copies through "Open and copy" without showing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type { HeldSecret } from '@core';
import { resetChanges } from '@core/changes';
import { bump, loggingOut, resetCore, setView, startLoggingOut } from '@core/ctx';
import page from './page';
import entrySource from './parts/Entry.tsx?raw';
import strings from './strings.en.json';
import { FIXTURE_PASSWORD, FIXTURE_PLAINTEXT, REALM_A, requestLog, resetFixtureVaults } from './fixtures';

const TOKEN = 'fixture-token-value-000000000001';
const track = vi.hoisted(() => ({ made: [] as HeldSecret[], dropped: new Set<HeldSecret>(), signals: [] as AbortSignal[], sentinels: [] as HeldSecret[], apiSignals: [] as AbortSignal[], ignoreSignal: false, gate: null as Promise<void> | null, decrypts: [] as Promise<unknown>[], afterDecrypt: null as (() => void) | null, afterRead: null as (() => void) | null, afterHold: null as (() => void) | null }));

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));
vi.mock('@core', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const hold = m.holdSecret as (v: unknown, ctx: unknown) => HeldSecret | null;
  const api = m.api as (route: unknown, input?: { signal?: AbortSignal }) => Promise<unknown>;
  return {
    ...m,
    // Which signal each request was sent with (the signal only, never the answer).
    api: (route: unknown, input?: { signal?: AbortSignal }) => {
      if (input?.signal) track.apiSignals.push(input.signal);
      return api(route, input);
    },
    holdSecret: (v: unknown, ctx: unknown) => {
      const h = hold(v, ctx);
      // The kit's wipe sentinel is not a value: only the values the page holds are tracked.
      if (h && v === 'wipe-signal') track.sentinels.push(h);
      else if (h) {
        track.made.push(h);
        h.onDrop(() => track.dropped.add(h));
        // afterHold: run in the microtask right after the value was held, before the read's caller continues (the gap
        // between readValue's hold and the page's continuation).
        const after = track.afterHold;
        if (after) queueMicrotask(after);
      }
      return h;
    },
  };
});
vi.mock('./data', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const read = m.readValue as (p: unknown, key: string, signal?: AbortSignal) => Promise<unknown>;
  return {
    ...m,
    readValue: (p: unknown, key: string, signal?: AbortSignal) => {
      if (signal) track.signals.push(signal);
      // ignoreSignal: a read that does not honour the abort (the signal is only a liveness check): the generation alone fences.
      const run = read(p, key, track.ignoreSignal ? undefined : signal);
      // afterRead: run in the microtask right after the read answers (only that it answered, never what).
      const after = track.afterRead;
      if (after) void run.then(() => queueMicrotask(after), () => undefined);
      return run;
    },
  };
});

vi.mock('./crypto', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const decrypt = m.decrypt as (env: string, pw: string) => Promise<string>;
  return {
    ...m,
    decrypt: (env: string, pw: string) => {
      const run = (async () => {
        if (track.gate) await track.gate;
        return decrypt(env, pw);
      })();
      // afterDecrypt: run in the microtask right after the decrypt answers, after the page's own check of that answer
      // and before what the page does with it (the gap between decryptNow's check and its caller).
      const after = track.afterDecrypt;
      if (after) void run.then(() => queueMicrotask(after), () => undefined);
      // Only that it settled is kept: the plaintext never reaches the tracker.
      track.decrypts.push(run.then(() => undefined, () => undefined));
      return run;
    },
  };
});

let written: string[] = [];
beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  track.made.length = 0;
  track.dropped.clear();
  track.signals.length = 0;
  track.sentinels.length = 0;
  track.apiSignals.length = 0;
  track.ignoreSignal = false;
  track.gate = null;
  track.decrypts.length = 0;
  track.afterDecrypt = null;
  track.afterRead = null;
  track.afterHold = null;
  written = [];
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
afterEach(() => {
  // A sign-out test leaves core signing out; the next render boots a fresh core.
  if (loggingOut()) resetCore();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'ClipboardItem');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

const live = () => track.made.filter((h) => !track.dropped.has(h));
const reads = () => requestLog.filter((r) => r.method === 'GET' && r.path.startsWith('/vault/keys/'));
const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const btn = (key: keyof typeof strings) => screen.queryByRole('button', { name: strings[key] });
const goHidden = () =>
  act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

describe('masked holds nothing', () => {
  it('an opened entry has read nothing and holds nothing; the unread box offers the eye and Copy', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await screen.findByRole('button', { name: strings['value.showEye'] });
    expect(btn('value.copy')).toBeEnabled();
    expect(reads()).toEqual([]);
    expect(track.made).toEqual([]);
    // Unread, the field holds no secret, so it arms no wipe sentinel either.
    expect(track.sentinels.filter((h) => !h.dropped)).toEqual([]);
  });

  it('eye-off drops every held copy; the next eye reads again', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    expect(document.body.textContent).toContain(TOKEN);
    await userEvent.click(btn('value.hideEye')!);
    expect(live()).toEqual([]);
    expect(document.body.textContent).not.toContain(TOKEN);
    await userEvent.click(btn('value.showEye')!);
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    expect(reads()).toHaveLength(2);
  });

  it('the tab going to the background drops the shown value', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    await goHidden();
    expect(live()).toEqual([]);
    expect(document.body.textContent).not.toContain(TOKEN);
  });
});

describe('Copy without looking', () => {
  it('copies the exact stored bytes, never shows them, and keeps no hold', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await waitFor(() => expect(written).toEqual([TOKEN]));
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(document.body.innerHTML).not.toContain(TOKEN);
    expect(track.made.length).toBe(1);
    expect(live()).toEqual([]);
    expect(btn('value.showEye')).toBeEnabled();
  });

  it('with ClipboardItem the write starts inside the press, before the read answers', async () => {
    const calls: Array<Promise<Blob>> = [];
    class FakeItem {
      constructor(items: Record<string, Promise<Blob>>) {
        calls.push(items['text/plain']!);
      }
    }
    vi.stubGlobal('ClipboardItem', FakeItem);
    const write = vi.fn(async (items: FakeItem[]) => {
      void items;
      await calls[0];
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write, writeText: vi.fn() } });
    await renderPage(page, { state: 'slowRead', path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    expect(write).toHaveBeenCalledTimes(1);
    const blob = await calls[0]!;
    expect(await blob.text()).toBe(TOKEN);
    expect(live()).toEqual([]);
  });
});

describe('every exit fences the read in flight', () => {
  it('the tab hidden while the eye reads: the answer keeps nothing, the read was aborted, the field is unread', async () => {
    await renderPage(page, { state: 'slowRead', path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    expect(screen.getByRole('status', { name: strings['value.showing'] })).toBeInTheDocument();
    await goHidden();
    expect(track.signals.at(-1)?.aborted).toBe(true);
    await pause(700);
    expect(live()).toEqual([]);
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(btn('value.showEye')).toBeEnabled();
  });

  it('the read goes out with the attempt\'s signal, and the exit aborts that same signal', async () => {
    await renderPage(page, { state: 'slowRead', path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    const mine = track.signals.at(-1)!;
    expect(track.apiSignals).toContain(mine);
    await goHidden();
    expect(mine.aborted).toBe(true);
  });

  it('a read that ignores the abort still keeps nothing after an exit (the generation fences it)', async () => {
    track.ignoreSignal = true;
    await renderPage(page, { state: 'slowRead', path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await goHidden();
    await pause(700);
    expect(track.made.length).toBe(1);
    expect(live()).toEqual([]);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it('closing the entry while Copy reads: nothing is written and nothing kept', async () => {
    const { router } = await renderPage(page, { state: 'slowRead', path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await act(async () => {
      await router.navigate({ to: '/vault' as never, search: { in: REALM_A, sel: 'deploy.notes' } as never });
    });
    expect(track.signals[0]?.aborted).toBe(true);
    await pause(700);
    expect(written).toEqual([]);
    expect(live()).toEqual([]);
  });

  it('a second eye press supersedes the first read: only the newest answer is kept', async () => {
    await renderPage(page, { state: 'slowRead', path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await goHidden();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await userEvent.click(btn('value.showEye')!);
    await screen.findByRole('button', { name: strings['value.hideEye'] }, { timeout: 2000 });
    expect(track.signals[0]?.aborted).toBe(true);
    expect(track.signals[1]?.aborted).toBe(false);
    expect(live()).toHaveLength(1);
  });
});

describe('encrypted values', () => {
  it('Copy opens the password row with "Open and copy": the plaintext goes only to the clipboard', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    expect(btn('value.open')).toBeNull();
    expect(btn('value.cancel')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
    await waitFor(() => expect(written).toEqual([FIXTURE_PLAINTEXT]));
    expect(await screen.findByText(strings['value.openCopied'])).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(FIXTURE_PLAINTEXT);
    expect(screen.queryByLabelText(strings['value.password'])).toBeNull();
    expect(live()).toEqual([]);
  });

  it('the envelope dropped mid-decrypt (sign-out, realm switch): "Open and copy" puts nothing on the clipboard', async () => {
    let release!: () => void;
    track.gate = new Promise<void>((r) => (release = r));
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
    // Core drops the envelope as a context ends; the panel is still mounted while the decrypt runs on.
    await act(async () => {
      for (const h of live()) h.drop();
    });
    release();
    await act(async () => {
      await Promise.all(track.decrypts);
    });
    await pause(50);
    expect(track.decrypts).toHaveLength(1);
    expect(written).toEqual([]);
    expect(document.body.textContent).not.toContain(FIXTURE_PLAINTEXT);
    expect(live()).toEqual([]);
  });

  // Every context end core announces, mid-decrypt: the decrypt answers after it, and nothing reaches the clipboard,
  // the screen, or a held copy.
  for (const [name, end] of [
    ['a realm switch', () => void bump('switch')],
    ['sign-out', () => startLoggingOut()],
    ['a view change', () => setView('elsewhere')],
  ] as const) {
    it(`${name} while "Open and copy" decrypts: nothing is copied or kept`, async () => {
      let release!: () => void;
      track.gate = new Promise<void>((r) => (release = r));
      await renderPage(page, { path: '/vault?sel=db-password' });
      await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
      await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
      await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
      await act(async () => end());
      release();
      await act(async () => {
        await Promise.all(track.decrypts);
      });
      await pause(50);
      expect(track.decrypts).toHaveLength(1);
      expect(written).toEqual([]);
      expect(document.body.textContent).not.toContain(FIXTURE_PLAINTEXT);
      expect(live()).toEqual([]);
    });
  }

  it('the tab hidden while Open decrypts: nothing is shown or kept', async () => {
    let release!: () => void;
    track.gate = new Promise<void>((r) => (release = r));
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    await goHidden();
    release();
    await act(async () => {
      await Promise.all(track.decrypts);
    });
    await pause(50);
    expect(track.decrypts).toHaveLength(1);
    expect(document.body.textContent).not.toContain(FIXTURE_PLAINTEXT);
    expect(live()).toEqual([]);
  });

  it('the tab hidden while "Open and copy" decrypts: nothing is copied or kept', async () => {
    let release!: () => void;
    track.gate = new Promise<void>((r) => (release = r));
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
    await goHidden();
    release();
    await act(async () => {
      await Promise.all(track.decrypts);
    });
    await pause(50);
    expect(written).toEqual([]);
    expect(document.body.textContent).not.toContain(FIXTURE_PLAINTEXT);
    expect(live()).toEqual([]);
  });

  it('a refused clipboard write says so under the field, and nothing is kept', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('refused', 'NotAllowedError')) },
    });
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
    expect(await screen.findByText(strings['value.openCopyRefused'])).toBeInTheDocument();
    expect(screen.queryByText(strings['value.openCopied'])).toBeNull();
    expect(document.body.textContent).not.toContain(FIXTURE_PLAINTEXT);
    expect(live()).toEqual([]);
  });

  it('with ClipboardItem, "Open and copy" starts the write inside the press, before the decrypt answers', async () => {
    let release!: () => void;
    track.gate = new Promise<void>((r) => (release = r));
    const calls: Array<Promise<Blob>> = [];
    class FakeItem {
      constructor(items: Record<string, Promise<Blob>>) {
        calls.push(items['text/plain']!);
      }
    }
    vi.stubGlobal('ClipboardItem', FakeItem);
    const write = vi.fn(async () => {
      await calls.at(-1);
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write, writeText: vi.fn() } });
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    // The unread Copy made one write (it settled with nothing: the value is encrypted); the press makes the next.
    const before = write.mock.calls.length;
    // A plain dispatch, asserted at once: the write must already be out when the press returns (no tick in between).
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
      expect(write).toHaveBeenCalledTimes(before + 1);
    });
    expect(track.decrypts).toHaveLength(1);
    release();
    const blob = await calls.at(-1)!;
    expect(await blob.text()).toBe(FIXTURE_PLAINTEXT);
    expect(document.body.textContent).not.toContain(FIXTURE_PLAINTEXT);
  });

  it('a drop in the microtask after the decrypt answered: "Open and copy" still copies nothing', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    track.afterDecrypt = () => {
      for (const h of live()) h.drop();
    };
    await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
    await act(async () => {
      await Promise.all(track.decrypts);
    });
    await pause(50);
    expect(track.decrypts).toHaveLength(1);
    expect(written).toEqual([]);
    expect(live()).toEqual([]);
  });

  // A context end or a drop d microtasks after the decrypt answered (d = 0 is the microtask right after it): every
  // boundary between the decrypt's answer and the clipboard handoff, or the plaintext hold, is covered. Text handed to
  // the browser before the end is a copy made in time (nothing can call it back); none may be handed over after it.
  const later = (d: number, f: () => void): void => {
    if (d <= 0) f();
    else queueMicrotask(() => later(d - 1, f));
  };
  const DEPTHS = [0, 1, 2, 3, 4, 5];

  it.each(DEPTHS)('a context end %i microtask(s) after the decrypt answered: "Open and copy" writes nothing (writeText)', async (d) => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    let ended = false;
    const after: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => (ended && after.push(text), written.push(text), Promise.resolve()) },
    });
    track.afterDecrypt = () => later(d, () => {
      ended = true;
      setView('elsewhere');
    });
    await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
    await act(async () => {
      await Promise.all(track.decrypts);
    });
    await pause(50);
    expect(ended).toBe(true);
    expect(after).toEqual([]);
    if (d <= 1) expect(written).toEqual([]); // the gap this guards: the end lands before the handoff
    expect(live()).toEqual([]);
  });

  it.each(DEPTHS)('a context end %i microtask(s) after the decrypt answered: "Open and copy" hands no text to ClipboardItem', async (d) => {
    const calls: Array<Promise<Blob>> = [];
    class FakeItem {
      constructor(items: Record<string, Promise<Blob>>) {
        calls.push(items['text/plain']!);
      }
    }
    vi.stubGlobal('ClipboardItem', FakeItem);
    const write = vi.fn(async () => {
      await calls.at(-1);
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write, writeText: vi.fn() } });
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    let ended = false;
    const madeAfter: boolean[] = [];
    const RealBlob = Blob;
    vi.stubGlobal('Blob', class extends RealBlob {
      constructor(parts?: BlobPart[], o?: BlobPropertyBag) {
        super(parts, o);
        madeAfter.push(ended);
      }
    });
    track.afterDecrypt = () => later(d, () => {
      ended = true;
      setView('elsewhere');
    });
    await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
    const handed = await calls.at(-1)!.then(() => true, () => false);
    await pause(50);
    expect(ended).toBe(true);
    expect(madeAfter.filter(Boolean)).toEqual([]); // no text Blob made after the end
    if (d <= 1) expect(handed).toBe(false);
    expect(live()).toEqual([]);
  });

  it.each(DEPTHS)('a context end %i microtask(s) after the read answered: Copy on the unread box writes nothing after it', async (d) => {
    let ended = false;
    const after: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => (ended && after.push(text), written.push(text), Promise.resolve()) },
    });
    await renderPage(page, { path: '/vault?sel=github-token' });
    track.afterRead = () => later(d, () => {
      ended = true;
      setView('elsewhere');
    });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await pause(50);
    expect(ended).toBe(true);
    expect(after).toEqual([]);
    if (d === 0) expect(written).toEqual([]);
    expect(live()).toEqual([]);
  });

  // A local exit (the tab hidden: the panel's own exit, core context and view unchanged) after the read answered.
  const hideNow = () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it.each(DEPTHS)('the panel exits %i microtask(s) after the read answered: Copy on the unread box writes nothing after it (writeText)', async (d) => {
    let ended = false;
    const after: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => (ended && after.push(text), written.push(text), Promise.resolve()) },
    });
    await renderPage(page, { path: '/vault?sel=github-token' });
    track.afterRead = () => later(d, () => {
      ended = true;
      hideNow();
    });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await pause(50);
    expect(ended).toBe(true);
    expect(after).toEqual([]);
    if (d <= 1) expect(written).toEqual([]);
    expect(live()).toEqual([]);
  });

  it.each(DEPTHS)('the panel exits %i microtask(s) after the read answered: Copy on the unread box makes no text Blob after it (ClipboardItem)', async (d) => {
    const calls: Array<Promise<Blob>> = [];
    class FakeItem {
      constructor(items: Record<string, Promise<Blob>>) {
        calls.push(items['text/plain']!);
      }
    }
    vi.stubGlobal('ClipboardItem', FakeItem);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: vi.fn(async () => { await calls.at(-1); }), writeText: vi.fn() } });
    let ended = false;
    const madeAfter: boolean[] = [];
    const RealBlob = Blob;
    vi.stubGlobal('Blob', class extends RealBlob {
      constructor(parts?: BlobPart[], o?: BlobPropertyBag) {
        super(parts, o);
        madeAfter.push(ended);
      }
    });
    await renderPage(page, { path: '/vault?sel=github-token' });
    track.afterRead = () => later(d, () => {
      ended = true;
      hideNow();
    });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    const handed = await calls.at(-1)!.then(() => true, () => false);
    await pause(50);
    expect(ended).toBe(true);
    expect(madeAfter.filter(Boolean)).toEqual([]);
    if (d <= 1) expect(handed).toBe(false);
    expect(live()).toEqual([]);
  });

  it.each(DEPTHS)('the envelope dropped %i microtask(s) after the decrypt answered: Open keeps no plaintext hold', async (d) => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    track.afterDecrypt = () => later(d, () => {
      for (const h of live()) h.drop();
    });
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    await act(async () => {
      await Promise.all(track.decrypts);
    });
    await pause(50);
    expect(document.body.textContent).not.toContain(FIXTURE_PLAINTEXT);
    expect(live()).toEqual([]);
  });

  it('after a context end mid-decrypt with the entry still open, the next read can be opened (not stuck "Opening…")', async () => {
    let release!: () => void;
    track.gate = new Promise<void>((r) => (release = r));
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    // A view change: core drops what the old view held, and this entry stays open.
    await act(async () => setView('elsewhere'));
    release();
    await act(async () => {
      await Promise.all(track.decrypts);
    });
    track.gate = null;
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByLabelText(strings['value.password']);
    expect(btn('value.open')).toBeEnabled();
  });

  it('a view change in the gap between the read\'s hold and the page\'s continuation: no password row for a value already gone', async () => {
    let ran = false;
    track.afterHold = () => {
      ran = true;
      setView('elsewhere');
    };
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    // The read reached the hold and the view change ran (the gap was exercised) before anything is asserted.
    await waitFor(() => expect(ran).toBe(true));
    await pause(50);
    expect(live()).toEqual([]);
    expect(screen.queryByLabelText(strings['value.password'])).toBeNull();
    // The eye is offered again: nothing is stuck reading or opening.
    track.afterHold = null;
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByLabelText(strings['value.password']);
    expect(btn('value.open')).toBeEnabled();
  });

  it('a wrong password copies nothing and says why in the field', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: strings['value.openCopy'] }));
    expect(await screen.findByText(strings['crypto.decrypt-failed'])).toBeInTheDocument();
    expect(written).toEqual([]);
    expect(screen.queryByText(strings['value.openCopied'])).toBeNull();
  });

  it('Cancel is always on the password row, and drops what was read', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByLabelText(strings['value.password']);
    await userEvent.click(btn('value.cancel')!);
    expect(live()).toEqual([]);
    expect(btn('value.showEye')).toBeEnabled();
  });
});

describe('a plain value dropped in the gap after its read', () => {
  it('a view change between the read\'s hold and the page\'s continuation: the eye shows no value row', async () => {
    let ran = false;
    track.afterHold = () => {
      ran = true;
      setView('elsewhere');
    };
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await waitFor(() => expect(ran).toBe(true));
    await pause(50);
    expect(live()).toEqual([]);
    expect(btn('value.hideEye')).toBeNull();
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(btn('value.showEye')).not.toBeNull();
  });
});

describe('a replaced or empty value', () => {
  const replaceWith = async (v: string) => {
    await userEvent.click(await screen.findByRole('button', { name: strings['action.replace'] }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.type(within(drawer).getByLabelText(strings['edit.value']), v);
    await userEvent.click(within(drawer).getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };

  it('a value shown before Replace is gone after it, and Copy copies the new value', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    await replaceWith('fixture-new-value-0003');
    await waitFor(() => expect(document.body.textContent).not.toContain(TOKEN));
    expect(live()).toEqual([]);
    await userEvent.click(await screen.findByRole('button', { name: strings['value.copy'] }));
    await waitFor(() => expect(written).toEqual(['fixture-new-value-0003']));
  });

  it('an empty value keeps a way back: Replace brings the eye again', async () => {
    await renderPage(page, { state: 'jsonValues', path: '/vault?sel=blank.value' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    expect(await screen.findByText(strings['value.empty'])).toBeInTheDocument();
    await replaceWith('abc');
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    expect(screen.queryByText(strings['value.empty'])).toBeNull();
  });

  it('an empty value: the tab hidden and back offers the eye again', async () => {
    await renderPage(page, { state: 'jsonValues', path: '/vault?sel=blank.value' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByText(strings['value.empty']);
    await goHidden();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(await screen.findByRole('button', { name: strings['value.showEye'] })).toBeEnabled();
  });
});

describe('one control', () => {
  it('the entry draws no Button of its own for show, hide or copy: the field owns them', () => {
    const src = entrySource;
    for (const [prop, key] of [['showLabel', 'value.showEye'], ['hideLabel', 'value.hideEye'], ['copyLabel', 'value.copy']]) {
      expect(src.split(`t('${key}')`).length - 1).toBe(1);
      expect(src).toContain(`${prop}={t('${key}')}`);
    }
    expect(src).not.toMatch(/value\.(show|hide)'\)/);
  });
});
