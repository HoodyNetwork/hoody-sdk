// Vitest: the old /apps route redirects once, with what the link pointed at. The router may render the route once
// more after the move with the new address (no sel, tab=apps); that render must not send the person on again.
// Programs may resolve after the first render (no link yet, then hub), or not at all (hidden: the note stays).
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import strings from './strings.en.json';

type Link = { kind: 'hub'; href: string } | null;
const at: { search: Record<string, string | undefined>; link: Link } = { search: {}, link: null };
const go = vi.fn();
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return {
    ...kit,
    useGo: () => go,
    useSearchParam: (name: string) => [at.search[name], () => undefined],
    usePageLink: () => at.link,
  };
});
const { default: AppsRedirect } = await import('./view');

const replace = vi.fn();
beforeEach(() => {
  go.mockClear();
  replace.mockClear();
  at.link = { kind: 'hub', href: '#/programs' };
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, replace } as Location);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the old /apps route', () => {
  it('goes once to the selected app; a render with the new address after the move sends nothing more', () => {
    at.search = { sel: 'a1b2c3' };
    const r = render(<AppsRedirect />);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenLastCalledWith('/programs?tab=apps&appsel=a1b2c3', { replace: true });
    at.search = { tab: 'apps' };
    r.rerender(<AppsRedirect />);
    expect(go).toHaveBeenCalledTimes(1);
  });
  it('Find with its words lands on Launch an app, once', () => {
    at.search = { tab: 'find', q: 'jupyter' };
    const r = render(<AppsRedirect />);
    at.search = { tab: 'apps', launch: '1', launchq: 'jupyter' };
    r.rerender(<AppsRedirect />);
    expect(go.mock.calls).toEqual([['/programs?tab=apps&launch=1&launchq=jupyter', { replace: true }]]);
  });
  it('no Programs link yet: the note stays and nothing moves; once it resolves, one move to the original target', () => {
    at.search = { sel: 'a1b2c3', q: 'lab' };
    at.link = null;
    const r = render(<AppsRedirect />);
    expect(r.getByText(strings.moved)).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    at.link = { kind: 'hub', href: '#/programs' };
    r.rerender(<AppsRedirect />);
    expect(go.mock.calls).toEqual([['/programs?tab=apps&appsel=a1b2c3&appq=lab', { replace: true }]]);
    at.search = { tab: 'apps' };
    r.rerender(<AppsRedirect />);
    expect(go).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });
  it('no Programs link at all: the note stays and nothing is sent', () => {
    at.search = { tab: 'find', q: 'jupyter' };
    at.link = null;
    const r = render(<AppsRedirect />);
    r.rerender(<AppsRedirect />);
    expect(r.getByText(strings.moved)).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
