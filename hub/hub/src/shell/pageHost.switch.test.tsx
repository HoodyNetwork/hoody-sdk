// A page kept loaded (useKeepPage) is dropped on an account or realm switch, with everything else
// under the shell's ContextOutlet; a computer change keeps it.
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';

const core = vi.hoisted(() => {
  let snap = { account: 'acct-a', realm: 'realm-1', target: null as unknown };
  const ls = new Set<() => void>();
  return {
    get: () => snap,
    set(next: Partial<typeof snap>) {
      snap = { ...snap, ...next };
      for (const l of ls) l();
    },
    sub(l: () => void) {
      ls.add(l);
      return () => ls.delete(l);
    },
  };
});
vi.mock('@core', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useCore: () => useSyncExternalStore(core.sub, core.get, core.get) };
});

const { ContextOutlet } = await import('./switch');
const { PageHost, useKeepPage } = await import('./pageHost');

function Board() {
  useKeepPage(true);
  return <iframe title="tile" />;
}
const PAGES = [{ id: 'board', path: '/board' }, { id: 'home', path: '/home' }] as unknown as PageManifest[];
const at = (pathname: string) => ({ pathname, search: {}, hash: '', href: pathname, state: {} }) as never;
const host = (current: string, location: ReturnType<typeof at>) => (
  <ContextOutlet>
    <PageHost pages={PAGES} current={current} location={location} render={(p) => (p.id === 'board' ? <Board /> : <h1>Home</h1>)} />
  </ContextOutlet>
);

describe('kept pages and context switches', () => {
  it('a realm or account switch drops the kept page; a computer change keeps it', () => {
    const view = render(host('board', at('/board/main')));
    const first = document.querySelector('iframe');
    view.rerender(host('home', at('/home')));
    expect(document.querySelector('iframe')).toBe(first);
    act(() => core.set({ target: { container: 'c2' } }));
    expect(document.querySelector('iframe')).toBe(first);
    act(() => core.set({ realm: 'realm-2' }));
    expect(document.querySelector('iframe')).toBeNull();
    view.rerender(host('board', at('/board/main')));
    const second = document.querySelector('iframe');
    view.rerender(host('home', at('/home')));
    expect(document.querySelector('iframe')).toBe(second);
    act(() => core.set({ account: 'acct-b' }));
    expect(document.querySelector('iframe')).toBeNull();
  });
});
