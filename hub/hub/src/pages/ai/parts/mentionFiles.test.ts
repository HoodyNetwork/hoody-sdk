// The AI composer's "@" host: the chat's computer as the Files page reads it, the folder joined under the chat's
// folder, lossy names left out, and only reads of its own: one per folder per menu session, never a cached answer.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LinksModule from '../../files/links';
import { filesComputerOf, mentionEntries, mentionPath, useMentionFiles } from './mentionFiles';

/** What a read of `path` answers when the hook starts one: a listing, 'fail', or 'never' (still out). */
type Reply = unknown[] | 'fail' | 'never' | 'old' | 'later';
/** The 'later' reads, answered when called. */
const later: Array<() => void> = [];
let replies: Record<string, Reply> = {};
/** Every read the hook started, by path. */
const asked: string[] = [];
/** What each render's query holds: a cached answer (never to be used by the hook). */
let cached: unknown = undefined;
const enabledSeen: boolean[] = [];
vi.mock('../../files/links', async (orig) => ({
  ...(await orig<typeof LinksModule>()),
  useFolder: vi.fn((_c: unknown, path: string, enabled: boolean) => {
    enabledSeen.push(enabled);
    const refetch = vi.fn(() => {
      asked.push(path);
      const r = replies[path] ?? 'never';
      if (r === 'never') return new Promise(() => {});
      if (r === 'later') return new Promise((res) => { later.push(() => res({ isSuccess: true, data: { entries: [] }, dataUpdatedAt: Date.now() })); });
      if (r === 'fail') return Promise.resolve({ isSuccess: false, data: undefined, dataUpdatedAt: 0 });
      // 'old': the call answers with data that landed before it was asked (a fetch it joined).
      if (r === 'old') return Promise.resolve({ isSuccess: true, data: { entries: [{ name: 'x', dir: true, lossy: false, type: 'dir' }] }, dataUpdatedAt: 0 });
      return Promise.resolve({ isSuccess: true, data: { entries: r }, dataUpdatedAt: Date.now() });
    });
    return { data: cached, dataUpdatedAt: Date.now(), isPending: false, isError: false, isFetching: false, fetchStatus: 'idle', refetch: stableRefetch(path, refetch) };
  }),
}));
// One refetch identity per path (as one query observer keeps), calling the latest reply.
const fns = new Map<string, () => Promise<unknown>>();
const latest = new Map<string, () => Promise<unknown>>();
function stableRefetch(path: string, f: () => Promise<unknown>) {
  latest.set(path, f);
  if (!fns.has(path)) fns.set(path, () => latest.get(path)!());
  return fns.get(path)!;
}
const dirE = (name: string, type: string | null = 'dir') => ({ name, dir: true, lossy: false, ...(type ? { type } : {}) });
const fileE = (name: string) => ({ name, dir: false, lossy: false, type: 'file' });
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

const TARGET = { project: { id: 'p1' }, container: { id: 'c-123456', server_name: 'node-a' } };

beforeEach(() => {
  replies = {};
  asked.length = 0;
  enabledSeen.length = 0;
  later.length = 0;
  cached = undefined;
});

describe('mentionFiles helpers', () => {
  it('the chat target becomes the Files computer its folder read needs', () => {
    expect(filesComputerOf(TARGET)).toMatchObject({ id: 'c-123456', project_id: 'p1', server_name: 'node-a', rules: 'unknown' });
  });
  it('a sub folder joins under the chat folder, never above it', () => {
    expect(mentionPath('/home/ada/proj', '')).toBe('/home/ada/proj');
    expect(mentionPath('/home/ada/proj/', 'src/kit/')).toBe('/home/ada/proj/src/kit');
    expect(mentionPath('/', '')).toBe('/');
    expect(mentionPath('/', 'etc/')).toBe('/etc');
  });
  it('lossy names and names with a control character are left out (they cannot be written back as a path)', () => {
    const e = (name: string, dir: boolean, lossy = false) => ({ name, dir, lossy, size: null, modified: null, type: dir ? 'dir' as const : 'file' as const });
    const bell = 'bell' + String.fromCharCode(7) + '.txt';
    const esc = 'esc' + String.fromCharCode(27) + '[31m';
    expect(mentionEntries([e('a', true), e('b' + String.fromCharCode(0xfffd), false, true), e(bell, false), e(esc, false), e('c.ts', false)])).toEqual([{ name: 'a', dir: true }, { name: 'c.ts', dir: false }]);
    expect(mentionEntries(undefined)).toEqual([]);
  });
});

describe('useMentionFiles', () => {
  it('no chat folder: no "@" menu at all', () => {
    const { result } = renderHook(() => useMentionFiles(null));
    expect(result.current).toBeNull();
    expect(asked).toEqual([]);
  });
  it('reads nothing until the menu asks; a folder below is read only once its way down was read as real folders', async () => {
    replies['/home/ada/proj'] = [dirE('src'), fileE('README.md')];
    replies['/home/ada/proj/src'] = [dirE('kit'), fileE('main.ts')];
    const { result } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/home/ada/proj' }));
    expect(asked, 'nothing read before the menu opens').toEqual([]);
    expect(enabledSeen.every((e) => !e), 'the query never reads on its own').toBe(true);
    act(() => result.current!.want('src/'));
    expect(asked, 'first the chat folder itself: it proves src/').toEqual(['/home/ada/proj']);
    expect(result.current).toMatchObject({ reading: true, dir: null, entries: [] });
    await flush();
    expect(asked).toEqual(['/home/ada/proj', '/home/ada/proj/src']);
    await flush();
    expect(result.current?.entries).toEqual([{ name: 'kit', dir: true }, { name: 'main.ts', dir: false }]);
    expect(result.current).toMatchObject({ dir: 'src/', reading: false });
    act(() => result.current!.want(''));
    expect(result.current?.entries, 'a folder already read this session is not read again').toEqual([{ name: 'src', dir: true }, { name: 'README.md', dir: false }]);
    expect(asked).toHaveLength(2);
    act(() => result.current!.want(null));
    expect(result.current?.entries).toEqual([]);
  });
  it('a link to a folder is never gone into: offered as a name, and a typed path through it says outside and reads nothing there', async () => {
    replies['/home/ada/proj'] = [dirE('link', 'symlink'), dirE('old', null), dirE('src')];
    const { result } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/home/ada/proj' }));
    act(() => result.current!.want(''));
    await flush();
    expect(result.current?.entries, 'a link, or a folder the listing did not type, is no folder to open').toEqual([{ name: 'link', dir: false }, { name: 'old', dir: false }, { name: 'src', dir: true }]);
    for (const through of ['link/', 'link/etc/', 'old/']) {
      act(() => result.current!.want(through));
      await flush();
      expect(result.current, through).toMatchObject({ outside: true, entries: [], dir: null });
    }
    expect(asked.filter((p) => p !== '/home/ada/proj'), 'nothing under the link or the untyped folder is read').toEqual([]);
    act(() => result.current!.want('nope/'));
    await flush();
    expect(result.current, 'a folder that is not there').toMatchObject({ failed: true, entries: [] });
  });
  it('a cached answer (another page\'s, or from before the menu opened) is never shown or used as proof', async () => {
    cached = { entries: [dirE('x'), fileE('cached.txt')] };
    const { result } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/a' }));
    act(() => result.current!.want('x/'));
    expect(result.current).toMatchObject({ reading: true, entries: [], dir: null });
    expect(asked, 'its own read of the chat folder, not the cache').toEqual(['/a']);
    act(() => result.current!.want(''));
    expect(result.current).toMatchObject({ reading: true, entries: [] });
  });
  it('an answer that landed before the read was asked (a fetch it joined) proves nothing: failed', async () => {
    replies['/a'] = 'old';
    const { result } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/a' }));
    act(() => result.current!.want('x/'));
    await flush();
    expect(result.current).toMatchObject({ failed: true, entries: [] });
    expect(asked).toEqual(['/a']);
  });
  it('closing the menu drops every answer and proof: a folder later swapped for a link is read again and refused', async () => {
    replies['/a'] = [dirE('x')];
    replies['/a/x'] = [fileE('f')];
    const { result } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/a' }));
    act(() => result.current!.want('x/'));
    await flush(); await flush();
    expect(result.current?.dir).toBe('x/');
    act(() => result.current!.want(null));
    replies['/a'] = [dirE('x', 'symlink')];
    asked.length = 0;
    act(() => result.current!.want('x/'));
    await flush(); await flush();
    expect(result.current).toMatchObject({ outside: true, entries: [] });
    expect(asked, 'the chat folder again, never x/ through the link').toEqual(['/a']);
  });
  it('a failed read says failed and is not retried in the same session (no read storm); a new session reads again', async () => {
    replies['/a'] = 'fail';
    const { result, rerender } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/a' }));
    act(() => result.current!.want(''));
    await flush();
    rerender(); rerender();
    await flush();
    expect(result.current?.failed).toBe(true);
    expect(asked).toEqual(['/a']);
    act(() => result.current!.want(null));
    act(() => result.current!.want(''));
    expect(asked).toEqual(['/a', '/a']);
  });
  it('a computer the folder read cannot reach (no server) sends nothing and says failed', async () => {
    const { result } = renderHook(() => useMentionFiles({ target: { project: { id: 'p1' }, container: { id: 'c-9' } }, folder: '/a' }));
    act(() => result.current!.want(''));
    await flush();
    expect(result.current?.failed).toBe(true);
    expect(asked).toEqual([]);
  });
  it('a folder left before its read answered (that read dropped) is read again on coming back, not failed', async () => {
    replies['/a'] = [dirE('x')];
    const { result } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/a' }));
    act(() => result.current!.want(''));
    await flush();
    replies['/a/x'] = 'old';
    act(() => result.current!.want('x/'));
    act(() => result.current!.want(''));
    await flush();
    replies['/a/x'] = [fileE('f')];
    act(() => result.current!.want('x/'));
    await flush();
    expect(asked.filter((p) => p === '/a/x'), 'read again').toHaveLength(2);
    expect(result.current).toMatchObject({ dir: 'x/', entries: [{ name: 'f', dir: false }] });
  });
  it('a read that answers after the composer is gone changes nothing (no state after unmount)', async () => {
    replies['/a'] = 'later';
    const { result, unmount } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/a' }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => result.current!.want(''));
    unmount();
    expect(later).toHaveLength(1);
    later[0]!();
    await flush();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('want keeps one identity across renders (the kit calls it from an effect on it)', () => {
    const { result, rerender } = renderHook(() => useMentionFiles({ target: TARGET, folder: '/a' }));
    const w = result.current!.want;
    act(() => w(''));
    rerender();
    expect(result.current!.want).toBe(w);
  });
  it('another chat folder starts again from its own read', async () => {
    replies['/a'] = [dirE('x')];
    replies['/a/x'] = [fileE('f')];
    replies['/b'] = [];
    let at = { target: TARGET, folder: '/a' };
    const { result, rerender } = renderHook(() => useMentionFiles(at));
    act(() => result.current!.want('x/'));
    await flush(); await flush();
    expect(result.current?.dir).toBe('x/');
    at = { target: TARGET, folder: '/b' };
    rerender();
    await flush();
    expect(asked.at(-1), 'x/ is not proven under /b').toBe('/b');
    expect(result.current).toMatchObject({ failed: true });
  });
});
