// Vitest: a held folder copy's check reads SHA-256s a few
// at a time, never one read per file all at once, and a read that never answers gives up its place after
// HASH_READ_MS, so it cannot hold back the rest. The fixtures hold every SHA-256 read until the test answers it, so
// the counts are exact: projects gains 40 files, the copy is cut after README.md, then finishes, and Check again reads
// both trees and compares every file. What is bounded is the compare's own fill (the first time each file is read);
// the read-back a check runs after it (core re-reads every held read at once) is a separate row.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreQueryProvider, fixtureWorld, queryClient } from '@core';
import { act, renderHook, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computerOf, copyReadsForTest, useCopyCheck } from './data';
import { addDir, addFile, finishCopy, holdHashReads, resetFiles, rewriteFile, seen, sentChanges, slowListingOnce } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const enc = encodeURIComponent;
const PATH = `/files?a=atlas.00a1&ap=${enc('/home/ada')}&b=atlas.00a1&bp=${enc('/tmp')}`;
const paneA = () => screen.findByRole('region', { name: strings['pane.a'] });
const table = async () => within(await paneA()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const held = fill(ts['held.copy'], { name: 'projects', dest: '/tmp/projects' });
const part = (n: number) => fill(ts[n === 1 ? 'held.copyPartOne' : 'held.copyPart'], { count: String(n), dest: '/tmp/projects' });
const MORE = 40;
// README.md, site's 2 files and the 40 extras: 43 files, each read on both sides.
const FILL = 2 * (3 + MORE);
// The batch (data.ts HASH_BATCH, 8) plus the README.md pair core's read-back re-reads at Check again. Literals, so a
// changed HASH_BATCH or HASH_READ_MS turns these tests red.
const MOST_OPEN = 8 + 2;
const READ_MS = 60_000;
type Hold = ReturnType<typeof holdHashReads>;
/** Answers each SHA-256 read as it opens (one pass per waitFor try) until `until` holds. */
const drain = (h: Hold, until: () => void) => waitFor(() => { h.release(); until(); }, { timeout: 20_000 });

/** projects with MORE extra files, copied to /tmp and cut after README.md (site, its 2 files and the extras missing). */
async function cutCopy() {
  for (let i = 0; i < MORE; i++) addFile(`/home/ada/projects/f${i}.txt`);
  await renderPage(page, { path: PATH, state: 'folderCutFirst' });
  const r = await within(await table()).findByRole('row', { name: /projects/ });
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
  const d = await screen.findByRole('dialog');
  const go = within(d).getByRole('button', { name: ts['copy.primary'] });
  await waitFor(() => expect(go).toBeEnabled());
  await userEvent.click(go);
  expect(await within(d).findByText(part(3 + MORE), {}, { timeout: 10_000 })).toBeInTheDocument();
  await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

beforeEach(() => resetFiles());
afterEach(() => { vi.useRealTimers(); });

describe('a held folder copy\'s check reads SHA-256s in small batches', () => {
  it('the copy finished: every file of both trees is read, never more than the batch at once, and it proves the copy made', async () => {
    await cutCopy();
    const h = holdHashReads();
    finishCopy('/home/ada/projects', '/tmp/projects');
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await drain(h, () => expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0));
    for (let i = 0; i < MORE; i++) expect(h.asked()).toEqual(expect.arrayContaining([`/home/ada/projects/f${i}.txt`, `/tmp/projects/f${i}.txt`]));
    expect(h.total()).toBeGreaterThanOrEqual(FILL);
    expect(h.peakOf(FILL)).toBeLessThanOrEqual(MOST_OPEN);
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  }, 40_000);
  // Both panes show atlas, so each pane's held band checks this copy (HeldTransfer, useCopyCheck).
  // The fill reads each file once, not once per band: with react-query 5.105.2 #12230 one band subscribed a render late, and
  // its fresh-only reads asked files the other had just read. Only the fill (the first FILL reads) is checked; the read-back
  // after it re-reads on purpose. Guards dropping patches/@tanstack%2Freact-query@5.105.3.patch (the shared copy check relies on it).
  it('both panes\' held bands share the fill: no file\'s SHA-256 is asked twice before every file was read', async () => {
    await cutCopy();
    const h = holdHashReads();
    finishCopy('/home/ada/projects', '/tmp/projects');
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await drain(h, () => expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0));
    const fill = h.asked().slice(0, FILL);
    expect(fill.filter((p, i) => fill.indexOf(p) !== i)).toEqual([]);
    expect(new Set(fill).size).toBe(FILL);
  }, 40_000);

  it('one file differs: batching still finds it, and the copy stays held with that count (nothing sent)', async () => {
    await cutCopy();
    const h = holdHashReads();
    finishCopy('/home/ada/projects', '/tmp/projects');
    rewriteFile(`/tmp/projects/f${MORE - 1}.txt`);
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    // The compare reads every file in batches; its count shows at the next Check again (the band checks by itself
    // once per kind of result, and it already did for "differs" after the cut).
    await drain(h, () => { expect(h.total()).toBeGreaterThanOrEqual(FILL); expect(h.open()).toBe(0); });
    expect(h.peakOf(FILL)).toBeLessThanOrEqual(MOST_OPEN);
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    await drain(h, () => expect(screen.getAllByText(`${held} ${part(1)}`)).not.toHaveLength(0));
    expect(sentChanges).toEqual(['copy:/home/ada/projects>/tmp/projects']);
  }, 40_000);
});

describe('a SHA-256 read that never answers gives up its place after HASH_READ_MS, under a cap on reads out', () => {
  const SRC = '/home/ada/projects', DEST = '/tmp/projects';
  const LAST = `${SRC}/zz-last.txt`;
  // At most this many reads out at once, unknown ones included (data.ts HASH_CAP = 2 x HASH_BATCH). A literal.
  const CAP = 16;
  /** Both trees whole (40 extras and a last file), nothing held; the check's hook read through the page's core. */
  async function check(hold: (asked: () => readonly string[]) => Parameters<typeof holdHashReads>[0]) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (let i = 0; i < MORE; i++) addFile(`${SRC}/f${i}.txt`);
    addFile(LAST);
    finishCopy(SRC, DEST);
    const box: { h?: Hold } = {};
    const h = holdHashReads(hold(() => box.h?.asked() ?? []));
    box.h = h;
    await renderPage(page, { path: PATH, state: 'folderCutFirst' });
    const c = computerOf(fixtureWorld.computers.find((x) => x.name === 'atlas'));
    expect(c).not.toBeNull();
    const hook = renderHook(({ on }: { on: boolean }) => useCopyCheck(c!, SRC, DEST, on), { wrapper: CoreQueryProvider, initialProps: { on: true } });
    return { h, hook };
  }
  const state = (hook: { result: { current: ReturnType<typeof useCopyCheck> } }) => hook.result.current.compare?.state;
  const waiting = (hook: { result: { current: ReturnType<typeof useCopyCheck> } }) => { const x = hook.result.current.compare; return x?.state === 'reading' ? x.hashes : []; };
  /** Moves the clock READ_MS at a time (answering what may answer) until `done`, at most `rounds` times. */
  async function tick(h: Hold, done: () => boolean, rounds: number) {
    for (let i = 0; i < rounds && !done(); i++) {
      await act(async () => { vi.advanceTimersByTime(READ_MS); });
      const before = h.total();
      await waitFor(() => { h.release(); expect(done() || h.total() > before).toBe(true); }, { timeout: 5_000 }).catch(() => undefined);
    }
  }

  it('the first 8 reads never answer and a later file fails: their places go to the next paths after HASH_READ_MS, and the compare reaches failed', async () => {
    const { h, hook } = await check((asked) => ({ hang: (p) => asked().indexOf(p) < 8, fail: (p) => p === LAST }));
    await waitFor(() => expect(h.open()).toBe(8), { timeout: 20_000 });
    expect(state(hook)).toBe('reading');
    expect(h.asked()).not.toContain(LAST);
    await tick(h, () => state(hook) === 'failed', 4);
    await waitFor(() => { h.release(); expect(state(hook)).toBe('failed'); }, { timeout: 20_000 });
    expect(h.asked().indexOf(LAST)).toBeGreaterThanOrEqual(8);
    expect(h.peakOf()).toBeLessThanOrEqual(CAP);
    expect(sentChanges).toEqual([]);
  }, 60_000);

  it('every read stalls: never more than the cap out, the compare ends unchecked (unknown); one stalled read then fails: failed', async () => {
    const { h, hook } = await check((asked) => ({ hang: () => true, fail: (p) => asked()[0] === p }));
    await waitFor(() => expect(h.open()).toBe(8), { timeout: 20_000 });
    await tick(h, () => state(hook) !== 'reading', 6);
    await waitFor(() => expect(state(hook)).toBe('unchecked'), { timeout: 20_000 });
    // Stopped at the cap: the rest of the 88 reads are not asked while the cap is full of stalled ones.
    expect(h.open()).toBe(CAP);
    expect(h.total()).toBe(CAP);
    expect(h.peakOf()).toBeLessThanOrEqual(CAP);
    // A late answer still counts: a stalled read that answers with a failure makes the compare failed.
    const first = h.asked()[0]!;
    await act(async () => { h.answer(first); });
    await waitFor(() => expect(state(hook)).toBe('failed'), { timeout: 20_000 });
    expect(h.peakOf()).toBeLessThanOrEqual(CAP);
    expect(sentChanges).toEqual([]);
  }, 60_000);

  it('a new check generation starts with no late reads: unchecked, then off and on again (A, B, A), the stalled reads wait their own HASH_READ_MS again', async () => {
    const { h, hook } = await check(() => ({ hang: () => true }));
    await waitFor(() => expect(h.open()).toBe(8), { timeout: 20_000 });
    await tick(h, () => state(hook) !== 'reading', 6);
    await waitFor(() => expect(state(hook)).toBe('unchecked'), { timeout: 20_000 });
    const out = [...h.asked()];
    expect(out).toHaveLength(CAP);
    expect(h.aborted()).toEqual([]);
    hook.rerender({ on: false });
    await waitFor(() => expect(hook.result.current.compare).toBeNull(), { timeout: 20_000 });
    // Off cancels every read still out: all 16 aborted, none left open.
    await waitFor(() => { expect([...h.aborted()].sort()).toEqual([...out].sort()); expect(h.open()).toBe(0); }, { timeout: 20_000 });
    hook.rerender({ on: true });
    // The same check again is a new generation: its reads wait again, none is unknown yet.
    await waitFor(() => { expect(state(hook)).toBe('reading'); expect(waiting(hook)).toContain(out[0]); }, { timeout: 20_000 });
    await tick(h, () => state(hook) !== 'reading', 6);
    await waitFor(() => expect(state(hook)).toBe('unchecked'), { timeout: 20_000 });
    // On asked exactly those 16 again (the cap, nothing past it), and they are the 16 open now.
    expect([...h.asked().slice(CAP)].sort()).toEqual([...out].sort());
    expect(h.open()).toBe(CAP);
    expect(h.aborted()).toHaveLength(CAP);
    expect(sentChanges).toEqual([]);
  }, 60_000);

  it('a read that answered and then waits again (its answer reset) gets a fresh HASH_READ_MS timer', async () => {
    // Only the first read hangs; the test answers it by hand, so it is answered before its first timer runs out.
    const { h, hook } = await check((asked) => ({ hang: (p) => asked()[0] === p }));
    await waitFor(() => expect(h.open()).toBeGreaterThan(0), { timeout: 20_000 });
    const first = h.asked()[0]!;
    await act(async () => { h.answer(first); });
    await drain(h, () => expect(state(hook)).toBe('equal'));
    // Past its first timer while answered.
    await act(async () => { vi.advanceTimersByTime(READ_MS + 1_000); });
    expect(state(hook)).toBe('equal');
    // Its answer goes (a reset query refetches; not awaited, the refetch never answers): it waits again (the compare lists
    // both sides of a file while one waits).
    await act(async () => { void queryClient.resetQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(first) }); });
    await waitFor(() => { expect(h.asked().filter((p) => p === first)).toHaveLength(2); expect(waiting(hook)).toContain(first); expect(waiting(hook)).toHaveLength(2); }, { timeout: 20_000 });
    // A fresh timer: one more HASH_READ_MS and it is unknown, so the compare ends unchecked, not reading forever.
    await act(async () => { vi.advanceTimersByTime(READ_MS + 1_000); });
    await waitFor(() => expect(state(hook)).toBe('unchecked'), { timeout: 5_000 });
    expect(h.open()).toBe(1);
    expect(sentChanges).toEqual([]);
  }, 60_000);

  it('off and on again after a check that read more than 16 SHA-256s: the reads start again a few at a time, never more than the cap open', async () => {
    const { h, hook } = await check(() => ({}));
    await drain(h, () => expect(state(hook)).toBe('equal'));
    const done = h.total();
    expect(done).toBeGreaterThan(CAP);
    hook.rerender({ on: false });
    await waitFor(() => expect(hook.result.current.compare).toBeNull(), { timeout: 20_000 });
    const before = h.total();
    hook.rerender({ on: true });
    await drain(h, () => { expect(state(hook)).toBe('equal'); expect(h.open()).toBe(0); });
    // Read again (staleTime 0), but in batches: the whole earlier list is never asked at once.
    expect(h.total() - before).toBeGreaterThan(CAP);
    expect(h.peakSince(before)).toBeLessThanOrEqual(CAP);
    expect(sentChanges).toEqual([]);
  }, 60_000);
});

describe('a check moved to other folders while reads are pending keeps none of the old reads', () => {
  const A = { src: '/home/ada/projects', dest: '/tmp/projects' };
  const B = { src: '/home/ada/b', dest: '/tmp/b' };
  /** Both copies whole; the check's hook through the page's core, its ends given as props (`a` first, then the test's). */
  async function mount(hold?: Parameters<typeof holdHashReads>[0], a: { src: string; dest: string } = A) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    finishCopy(A.src, A.dest);
    addDir(B.src);
    addFile(`${B.src}/x.txt`);
    finishCopy(B.src, B.dest);
    const h = hold ? holdHashReads(hold) : null;
    await renderPage(page, { path: PATH, state: 'folderCutFirst' });
    const c = computerOf(fixtureWorld.computers.find((x) => x.name === 'atlas'));
    expect(c).not.toBeNull();
    const hook = renderHook(({ src, dest }: { src: string; dest: string }) => useCopyCheck(c!, src, dest, true), { wrapper: CoreQueryProvider, initialProps: a });
    return { h, hook };
  }
  /** Reads of the old check (`old` in the path) that are still asked for (an enabled query) or held for a copy's read-back. */
  const kept = (old: string) => queryClient.getQueryCache().findAll({ predicate: (q) => JSON.stringify(q.queryKey).includes(old) })
    .filter((q) => q.isActive() || copyReadsForTest.copyReads(q.queryKey)).map((q) => JSON.stringify(q.queryKey));

  it('a subfolder read still pending when the ends change: the new check is equal, and the old subfolder is neither asked for nor held', async () => {
    slowListingOnce(`${A.src}/site`);
    const { hook } = await mount();
    await waitFor(() => { expect(seen).toContain(`atlas:${A.src}/site`); expect(hook.result.current.walk.state).toBe('reading'); }, { timeout: 20_000 });
    hook.rerender(B);
    await waitFor(() => expect(hook.result.current.compare?.state).toBe('equal'), { timeout: 20_000 });
    expect(kept('/projects')).toEqual([]);
    expect(sentChanges).toEqual([]);
  }, 60_000);

  it('reads still pending when the ends change: the new check is equal, and none of the old reads is asked for or held', async () => {
    const { h, hook } = await mount({ hang: (p) => p.includes('/projects') });
    await waitFor(() => expect(h!.open()).toBeGreaterThan(0), { timeout: 20_000 });
    expect(hook.result.current.compare?.state).toBe('reading');
    hook.rerender(B);
    await waitFor(() => { h!.release(); expect(hook.result.current.compare?.state).toBe('equal'); }, { timeout: 20_000 });
    expect(kept('/projects')).toEqual([]);
    expect(sentChanges).toEqual([]);
  }, 60_000);

  it('ends whose paths hold the separator: two different pairs that would join to the same text are two checks', async () => {
    // '|' is a valid name character: joined with '|', these two pairs read the same; as JSON they differ.
    const C = { src: '/home/ada/p|/tmp/q', dest: '/tmp/r' };
    const D = { src: '/home/ada/p', dest: '/tmp/q|/tmp/r' };
    for (const d of ['/home/ada/p|', '/home/ada/p|/tmp', C.src, `${C.src}/sub`, D.src, '/tmp/q|', '/tmp/q|/tmp']) addDir(d);
    addFile(`${C.src}/a.txt`);
    addFile(`${C.src}/sub/s.txt`);
    addFile(`${D.src}/x.txt`);
    finishCopy(C.src, C.dest);
    finishCopy(D.src, D.dest);
    slowListingOnce(`${C.src}/sub`);
    const { hook } = await mount(undefined, C);
    await waitFor(() => { expect(seen).toContain(`atlas:${C.src}/sub`); expect(hook.result.current.walk.state).toBe('reading'); }, { timeout: 20_000 });
    hook.rerender(D);
    await waitFor(() => expect(hook.result.current.compare?.state).toBe('equal'), { timeout: 20_000 });
    expect(kept('/home/ada/p|')).toEqual([]);
    expect(sentChanges).toEqual([]);
  }, 60_000);
});
