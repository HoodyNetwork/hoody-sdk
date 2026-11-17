// Contributions: widgets and Guide topics from manifests, translated, sorted, stable lazy components.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ContributionsProvider, contributionsOf, useContributions } from './contributions';

const load = async () => ({ default: () => null });
const mk = (id: string, extra: Partial<PageManifest>): PageManifest =>
  ({ id, path: `/${id}`, title: 'title', layout: 'custom', status: 'ready', sensitive: false, strings: { title: 'T', w: `${id} widget`, g: `${id} topic`, gb: `${id} body` }, load, ...extra }) as unknown as PageManifest;

describe('contributionsOf', () => {
  const pages = [
    mk('bots', { widgets: [{ id: 'list', title: 'w', size: 's', order: 30, load }] }),
    mk('computers', { widgets: [{ id: 'mine', title: 'w', size: 'm', order: 10, load }], guide: [{ id: 'how', title: 'g', body: 'gb' }] }),
    mk('logs', { widgets: [{ id: 'fails', title: 'w', load }] }),
  ];
  it('translates, defaults size s and order 100, sorts by order, links to the page', () => {
    const c = contributionsOf(pages);
    expect(c.widgets.map((w) => [w.pageId, w.id, w.title, w.size, w.order, w.href])).toEqual([
      ['computers', 'mine', 'computers widget', 'm', 10, '/computers'],
      ['bots', 'list', 'bots widget', 's', 30, '/bots'],
      ['logs', 'fails', 'logs widget', 's', 100, '/logs'],
    ]);
    expect(c.guideTopics).toEqual([{ pageId: 'computers', pageTitle: 'T', id: 'how', title: 'computers topic', body: 'computers body' }]);
  });
  it('keeps the same lazy component across calls', () => {
    expect(contributionsOf(pages).widgets[0]?.Component).toBe(contributionsOf(pages).widgets[0]?.Component);
  });
});

function Count() {
  const c = useContributions();
  return <span>{`${c.widgets.length}/${c.guideTopics.length}`}</span>;
}

describe('useContributions', () => {
  it('is empty outside the shell and filled inside it', () => {
    const { unmount } = render(<Count />);
    expect(screen.getByText('0/0')).toBeInTheDocument();
    unmount();
    render(
      <ContributionsProvider pages={[mk('computers', { widgets: [{ id: 'a', title: 'w', load }], guide: [{ id: 'b', title: 'g', body: 'gb' }] })]}>
        <Count />
      </ContributionsProvider>,
    );
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });
});
