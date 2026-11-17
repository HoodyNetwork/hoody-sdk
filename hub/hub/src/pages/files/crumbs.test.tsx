// Vitest: a deep folder's breadcrumbs fold to the top folder "/", "…", the parent
// and the folder, so the row stays one line in a phone or split pane. "…" opens the deepest folder it hides; a short
// path keeps every crumb.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const at = (p: string) => `/files?a=atlas.00a1&ap=${encodeURIComponent(p)}`;
const crumbs = async () => within(await screen.findByRole('region', { name: strings['pane.a'] })).findByRole('list', { name: 'Breadcrumbs' });
const labels = (nav: HTMLElement) => within(nav).getAllByRole('listitem').map((li) => li.textContent);

describe('Files breadcrumbs', () => {
  it('a deep folder folds to "/", "…", the parent and the folder; "…" opens the deepest folder it hides', async () => {
    await renderPage(page, { path: at('/srv/a/b/c/d/e/f/g') });
    const nav = await crumbs();
    expect(labels(nav)).toEqual(['/', strings['crumbs.more'], 'f', 'g']);
    // It shows \u2026 and its name says where it goes.
    const more = within(nav).getByRole('link', { name: 'Open folder /srv/a/b/c/d/e' });
    expect(more.textContent).toBe(strings['crumbs.more']);
    expect(new URLSearchParams(more.getAttribute('href')!.split('?')[1]).get('ap')).toBe('/srv/a/b/c/d/e');
  });

  it('a short path keeps every crumb', async () => {
    await renderPage(page, { path: at('/home/ada') });
    expect(labels(await crumbs())).toEqual(['/', 'home', 'ada']);
  });

  it('three folders deep still shows every crumb', async () => {
    await renderPage(page, { path: at('/home/ada/projects') });
    expect(labels(await crumbs())).toEqual(['/', 'home', 'ada', 'projects']);
  });

  // The computer picker is the path's root. One row: Up, the picker, then "/" (the computer's top
  // folder, one click) and the folders; the computer's name is not shown a second time, and no head above the bar.
  it('the picker is the path root: Up, the picker and the crumbs share one bar; "/" opens the top folder', async () => {
    await renderPage(page, { path: at('/home/ada') });
    const pane = await screen.findByRole('region', { name: strings['pane.a'] });
    const nav = await within(pane).findByRole('list', { name: 'Breadcrumbs' });
    const top = within(nav).getByRole('link', { name: 'Top folder of atlas' });
    expect(top.textContent).toBe('/');
    // the top folder is the pane's default: its link drops `ap` (or names '/'), and keeps the computer
    const q = new URLSearchParams(top.getAttribute('href')!.split('?')[1]);
    expect(q.get('ap') ?? '/').toBe('/');
    expect(q.get('a')).toBe('atlas.00a1');
    const up = within(pane).getByRole('button', { name: strings['action.up'] });
    const picker = within(pane).getByRole('button', { name: new RegExp(`^atlas .*${strings['pick.label'].replace('{{pane}}', strings['pane.a'])}$`) });
    const bar = up.parentElement!;
    expect(picker.parentElement).toBe(bar);
    expect(nav.closest('div')!.parentElement).toBe(bar);
    // In order: Up, the picker, the crumbs.
    expect(up.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picker.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One picker in the pane, and the computer's name only in it (never again as a crumb).
    expect(within(pane).getAllByRole('button', { name: /: computer$/ })).toHaveLength(1);
    expect(within(nav).queryByText('atlas')).toBeNull();
  });

  it('with no folder to show (a computer no longer there) the picker stays in its own head', async () => {
    await renderPage(page, { path: '/files?a=ghost.00ff' });
    const pane = await screen.findByRole('region', { name: strings['pane.a'] });
    expect(await within(pane).findByRole('button', { name: /: computer$/ })).toBeInTheDocument();
    expect(within(pane).queryByRole('list', { name: 'Breadcrumbs' })).toBeNull();
  });
});
