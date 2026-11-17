// Vitest: a computer leads to Files: its row in "On <name>" opens Files on that computer when this load serves Files,
// and is absent otherwise. links.ports is the URL of
// the computer's Ports & addresses tab, the one the page itself opens.
import type { ReactElement } from 'react';
import { definePage } from '@kit';
import { renderPage } from '@app/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { links as files } from '../files/links';
import { computers } from './fixtures';
import { links } from './links';
import { handleOf } from './logic';
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

describe('computers: the way to Files', () => {
  it('a served Files page gets a tile that opens Files on this computer', async () => {
    served.pages = new Set(['files']);
    await render(<OnThis c={c} current={false} />);
    const tile = screen.getByRole('link', { name: strings['on.files'] });
    expect(tile.getAttribute('href') ?? '').toContain(files.at(handleOf(c)));
    expect(files.at(handleOf(c))).toBe(`/files?computer=${encodeURIComponent(handleOf(c))}`);
  });

  it('no tile while this load does not serve Files', async () => {
    served.pages = new Set(['schedules']);
    await render(<OnThis c={c} current />);
    expect(screen.queryByText(strings['on.files'])).toBeNull();
    expect(screen.getByText(strings['on.schedules'])).toBeInTheDocument();
  });

  it('links.ports opens the Ports & addresses tab of that computer', () => {
    expect(links.ports('atlas.00a1')).toBe('/computers?sel=atlas.00a1&tab=ports');
  });
});
