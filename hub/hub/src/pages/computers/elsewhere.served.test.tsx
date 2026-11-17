// Vitest: the other pages in "On <name>" show a row only for a page this load serves; the tabs of this page (programs,
// backups, addresses) are always there, so the section never stands empty.
import type { ReactElement } from 'react';
import { definePage } from '@kit';
import { renderPage } from '@app/testing';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { computers } from './fixtures';
import { OnThis } from './parts/Elsewhere';
import strings from './strings.en.json';

const served = vi.hoisted(() => ({ pages: new Set<string>() }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, useGo: () => () => undefined, usePageLink: (id: string) => (served.pages.has(id) ? { kind: 'hub', href: `/${id}` } : null) };
});

// OnThis reads the Programs tab's query (only while running), so it renders inside the page harness (query client,
// router), as a one-part page.
async function render(ui: ReactElement) {
  const Harness = () => ui;
  const p = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
  await renderPage(p, { path: '/computers' });
}
const c = computers[0]!;
const title = strings['goto.title'].replace('{{name}}', c.name);

describe('computers: the other pages in On <name> follow the served pages', () => {
  it('shows a row for each served page and none for the others', async () => {
    served.pages = new Set(['schedules', 'logs']);
    await render(<OnThis c={c} current />);
    const nav = screen.getByRole('navigation', { name: title });
    expect(within(nav).getByRole('link', { name: strings['on.schedules'] })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: strings['on.logs'] })).toBeInTheDocument();
    expect(within(nav).queryByText(strings['goto.bots'])).toBeNull();
  });

  it('with no page served, the rows of this page\'s own tabs stay', async () => {
    served.pages = new Set();
    await render(<OnThis c={c} current={false} />);
    const nav = screen.getByRole('navigation', { name: title });
    expect(within(nav).getByText(strings['tab.backups'], { selector: 'dt' })).toBeInTheDocument();
    expect(within(nav).queryByText(strings['goto.files'], { selector: 'dt' })).toBeNull();
    // Nothing that makes the computer current is served, so the section says nothing about it.
    expect(screen.queryByText(/your current computer\.$/)).toBeNull();
  });
});
