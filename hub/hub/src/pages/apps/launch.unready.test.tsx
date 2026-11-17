// Vitest: a Find row's controls in both presentations of Launch an app. A starter this Hub
// cannot launch (the fixtures' Open WebUI) says "Not available here" where it would say how it opens, and offers no
// control at all: no Open, no ⋯. A ready one (JupyterLab) offers Open, with Options in its ⋯ menu: the table as kit row
// actions, the compact list (Board's Add a program panel) as an Open button beside a kit ActionMenu.
import { beforeEach, describe, expect, it } from 'vitest';
import { useCurrentComputer, type Target } from '@core';
import type { ReactNode } from 'react';
import type { PageManifest } from '@kit';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureStore } from '@app/fixtures';
import { harness } from './launch/harness';
import { FindPane } from './launch/FindPane';
import { useApps } from './launch/useApps';
import { useHere } from './launch/AppLauncher';
import strings from './strings.en.json';

let View: () => ReactNode = () => null;
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: () => <>{View()}</> }) };

function Pane({ variant }: { variant: 'table' | 'list' }) {
  const target = useCurrentComputer() as Target;
  const a = useHere(useApps({ target, nav: { select: () => undefined } }), undefined, target);
  return <FindPane a={a} target={target} variant={variant} />;
}

async function show(variant: 'table' | 'list') {
  View = () => <Pane variant={variant} />;
  await renderPage(page, { path: '/apps' });
  await screen.findByRole('heading', { name: strings['launch.hoody'] }, { timeout: 4000 });
}

const hoody = () => screen.getByRole('heading', { name: strings['launch.hoody'] }).closest('section') as HTMLElement;
const menuName = (name: string) => strings['act.menu'].replace('{{name}}', name);

/** The Ready to install section's entry for one app: a table row, or a compact list item. */
async function entryOf(variant: 'table' | 'list', name: string): Promise<HTMLElement> {
  return waitFor(() => {
    const all = variant === 'table' ? within(hoody()).getAllByRole('row') : within(within(hoody()).getByRole('list', { name: strings['tab.find'] })).getAllByRole('listitem');
    const e = all.find((r) => within(r).queryByText(name, { exact: true }) !== null);
    if (!e) throw new Error(`no ${variant} entry for ${name}`);
    return e;
  });
}

beforeEach(() => {
  fixtureStore.set({ state: null, latency: 'instant' });
});

describe.each(['table', 'list'] as const)('Launch an app (%s): a Find row offers only what it can do', (variant) => {
  it('a starter this Hub cannot launch says Not available here and has no Open and no ⋯', async () => {
    await show(variant);
    const row = await entryOf(variant, 'Open WebUI');
    expect(row).toHaveTextContent(strings['row.unavailable']);
    expect(within(row).queryAllByRole('button')).toHaveLength(0);
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
  });

  it('a ready starter offers Open, and Options in its ⋯ menu', async () => {
    await show(variant);
    const row = await entryOf(variant, 'JupyterLab');
    expect(row).not.toHaveTextContent(strings['row.unavailable']);
    expect(within(row).getByRole('button', { name: strings['act.open'] })).toBeInTheDocument();
    // The table's ⋯ is the kit's Row actions; the compact list's is its ActionMenu, named for the app.
    const more = variant === 'table' ? within(row).getByRole('button', { name: 'Row actions' }) : within(row).getByRole('button', { name: menuName('JupyterLab') });
    await userEvent.click(more);
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((m) => (m.textContent ?? '').trim());
    expect(items.some((n) => n.startsWith(strings['act.options']))).toBe(true);
    expect(items.some((n) => n.startsWith(strings['act.open']))).toBe(false);
  });
});
