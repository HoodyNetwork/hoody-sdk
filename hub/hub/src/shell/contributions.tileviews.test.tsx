// Contributions: tile views. A page offers a view of one of its things by target; a host reads it
// through useContributions() and never imports the page. Translated, in page order, one stable lazy component per
// view, empty outside the shell, and absent when the contributing page is not served.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { ContributionsProvider, contributionsOf, useContributions } from './contributions';

const load = async () => ({ default: () => null });
const view = async () => ({ default: ({ target }: { target: string }) => <span>{target}</span> });
const mk = (id: string, extra: Partial<PageManifest>): PageManifest =>
  ({ id, path: `/${id}`, title: 'title', layout: 'custom', status: 'ready', sensitive: false, strings: { title: 'T', v: `${id} view` }, load, ...extra }) as unknown as PageManifest;

const pages = [mk('bots', { tileViews: [{ id: 'bot', title: 'v', load: view }] }), mk('logs', {}), mk('notes', { tileViews: [{ id: 'note', title: 'v', load: view }] })];

describe('tile views', () => {
  it('are translated, in page order, and link to their page', () => {
    expect(contributionsOf(pages).tileViews.map((v) => [v.pageId, v.id, v.title, v.href])).toEqual([
      ['bots', 'bot', 'bots view', '/bots'],
      ['notes', 'note', 'notes view', '/notes'],
    ]);
  });

  it('keep one lazy component per view across calls', () => {
    expect(contributionsOf(pages).tileViews[0]?.Component).toBe(contributionsOf(pages).tileViews[0]?.Component);
  });

  it('a page that is not served contributes nothing', () => {
    expect(contributionsOf(pages.filter((p) => p.id !== 'bots')).tileViews.map((v) => v.id)).toEqual(['note']);
  });

  it('are empty outside the shell and filled inside it', () => {
    function Ids() {
      return <span>{useContributions().tileViews.map((v) => v.id).join(',') || 'none'}</span>;
    }
    const { unmount } = render(<Ids />);
    expect(screen.getByText('none')).toBeInTheDocument();
    unmount();
    render(
      <ContributionsProvider pages={pages}>
        <Ids />
      </ContributionsProvider>,
    );
    expect(screen.getByText('bot,note')).toBeInTheDocument();
  });

  it('definePage refuses a tile view with a bad id, no loader or a title that is not a string key', () => {
    const base = { id: 'x', path: '/x', title: 'title', layout: 'custom', status: 'ready', sensitive: false, strings: { title: 'T', v: 'V' }, load } as const;
    expect(() => definePage({ ...base, tileViews: [{ id: 'Bad id', title: 'v', load: view }] } as never)).toThrow(/bad tile view/);
    expect(() => definePage({ ...base, tileViews: [{ id: 'ok', title: 'v' }] } as never)).toThrow(/bad tile view/);
    expect(() => definePage({ ...base, tileViews: [{ id: 'ok', title: 'missing', load: view }] } as never)).toThrow(/bad tile view/);
    expect(definePage({ ...base, tileViews: [{ id: 'ok', title: 'v', load: view }] } as never).tileViews?.[0]?.id).toBe('ok');
  });
});
