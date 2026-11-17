// Vitest: another page's held change (HELD_BY_OTHER) is shown read-only with a link to its page, never as "Nothing was changed".
import { renderHook, act, render, screen } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
// eslint-disable-next-line no-restricted-imports -- the shell's link provider, a test harness for the banner's link, not page code
import { PagesProvider } from '@shell/pageLinks';
import { aliasHeldElsewhere } from './data';
import { ChangeBanner, InlineOutcome } from './parts/Bits';
import { heldByOther, useChange } from './parts/ops';
import strings from './strings.en.json';

const held = { outcome: 'not_sent' as const, code: 'HELD_BY_OTHER', heldFrom: { page: 'computers', path: '/computers' } };

describe('a change held by another page', () => {
  it('keeps the sender in the outcome and never frees or resends anything', async () => {
    const { result } = renderHook(() => useChange('t'));
    await act(async () => { await result.current.run(async () => held); });
    expect(heldByOther(result.current.out)).toBe(true);
    expect(result.current.out?.from).toEqual({ page: 'computers', path: '/computers' });
    expect(result.current.locked).toBe(false);
  });
  it('the banner says it may have gone through, offers no Check or Dismiss for it, and only hides itself', async () => {
    let hid = 0;
    render(<ChangeBanner out={{ kind: 'not_sent', code: 'HELD_BY_OTHER', from: { page: 'computers', path: '/computers' } }} what="settings" onDismiss={() => { hid++; }} onCheck={() => undefined} />);
    expect(screen.getByText(strings['held.title'])).toBeTruthy();
    expect(screen.queryByText(strings['outcome.not_sent.settings'])).toBeNull();
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
    expect(screen.getByRole('button', { name: strings['held.hide'] })).toBeTruthy();
    expect(hid).toBe(0);
  });
  it('an unknown sender says another page and links nowhere', () => {
    render(<InlineOutcome out={{ kind: 'not_sent', code: 'HELD_BY_OTHER', from: null }} what="settings" onDismiss={() => undefined} />);
    expect(screen.getByText(/A change from another page/)).toBeTruthy();
    expect(screen.queryByText(/Open /)).toBeNull();
  });
});

describe('a change this page holds', () => {
  it('READ_BACK_FIRST reads as pending, never as not sent', async () => {
    const { result } = renderHook(() => useChange('t'));
    await act(async () => { await result.current.run(async () => ({ outcome: 'not_sent' as const, code: 'READ_BACK_FIRST' })); });
    expect(result.current.out?.kind).toBe('pending');
    expect(result.current.locked).toBe(true);
  });
  it('a change still held after a remount shows again as pending', async () => {
    const { result } = renderHook(() => useChange('t', { pending: true }));
    await vi.waitFor(() => expect(result.current.out?.kind).toBe('pending'));
    expect(result.current.locked).toBe(true);
    act(() => result.current.settle());
    expect(result.current.out).toBeNull();
  });
});

describe('an alias hold is another page\'s only when no alias key of this page owns it', () => {
  const scope = { ids: ['a1'], compId: 'c1', target: '/x', exec: 1 };
  const hold = (identity: unknown) => ({ identity }) as never;
  it('own aliasState or aliasRemove is not "held by another page"', () => {
    const owner = (key: string) => (key === 'aliasState' ? 'self' : 'other') as 'self' | 'other';
    expect(aliasHeldElsewhere([hold({ alias: 'a1', enabled: false })], owner, scope)).toBeNull();
    const removeOwner = (key: string) => (key === 'aliasRemove' ? 'self' : 'other') as 'self' | 'other';
    expect(aliasHeldElsewhere([hold({ alias: 'a1' })], removeOwner, scope)).toBeNull();
  });
  it('a hold no alias key owns is another page\'s and names the sender', () => {
    const other = () => 'other' as const;
    const h = { identity: { alias: 'a1' }, from: { page: 'computers', path: '/computers' } } as never;
    expect(aliasHeldElsewhere([h], other, scope)).toEqual({ from: { page: 'computers', path: '/computers' } });
    expect(aliasHeldElsewhere([hold({ alias: 'zzz' })], other, scope)).toBeNull();
  });
  it("a create for the same address in another folder is another script's; one without a folder is folder 1's", () => {
    const other = () => 'other' as const;
    expect(aliasHeldElsewhere([hold({ compId: 'c1', target: '/x' })], other, scope)).toEqual({ from: null });
    expect(aliasHeldElsewhere([hold({ compId: 'c1', target: '/x', exec: 3 })], other, scope)).toBeNull();
    expect(aliasHeldElsewhere([hold({ compId: 'c1', target: '/x', exec: 3 })], other, { ...scope, exec: 3 })).toEqual({ from: null });
    expect(aliasHeldElsewhere([hold({ compId: 'c1', target: '/x' })], other, { ...scope, exec: 3 })).toBeNull();
    // An existing link is matched by its id, whatever the folder.
    expect(aliasHeldElsewhere([hold({ alias: 'a1' })], other, { ...scope, exec: 3 })).toEqual({ from: null });
  });
});

describe('the link to the page that sent a held change', () => {
  const served = (...ids: string[]) => ids.map((id) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest);
  const out = { kind: 'not_sent' as const, code: 'HELD_BY_OTHER', from: { page: 'computers', path: '/computers' } };
  const open = { name: strings['held.go'].replace('{{page}}', 'Computers') };
  it('is offered while this load serves the sender page', () => {
    render(<PagesProvider pages={served('scripts', 'computers')}><ChangeBanner out={out} what="settings" onDismiss={() => undefined} /></PagesProvider>);
    expect(screen.getByRole('link', open).getAttribute('href')).toBe('/computers');
  });
  it('a hidden sender page gets no link, not even the classic one, and Hide stays (banner and inline)', () => {
    for (const where of ['banner', 'inline'] as const) {
      const view = render(
        <PagesProvider pages={served('scripts')}>
          {where === 'banner' ? <ChangeBanner out={out} what="settings" onDismiss={() => undefined} /> : <InlineOutcome out={out} what="settings" onDismiss={() => undefined} />}
        </PagesProvider>,
      );
      expect(screen.queryByRole('link', open)).toBeNull();
      expect(screen.queryByRole('button', open)).toBeNull();
      expect(screen.getByRole('button', { name: strings['held.hide'] })).toBeTruthy();
      view.unmount();
    }
  });
});
