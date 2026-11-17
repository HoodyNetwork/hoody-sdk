// Vitest: one accent on the Apps list. The page header's Launch an app is the accent while nothing else is; it leaves
// the header while the empty list offers the same button, and it becomes a plain button while an open detail carries
// its own accent (Open), so the launcher stays one press away.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { ops } from './parts/ops';
import { harness as page } from './launch/harness';
import strings from './strings.en.json';

const launch = strings['launch.action'];
const pageHead = () => screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement;
const accent = (el: HTMLElement) => el.getAttribute('data-variant') === 'primary';

describe('Apps list: one accent', () => {
  beforeEach(() => ops.reset());

  it('a list with apps and no detail open: Launch an app is the header accent', async () => {
    await renderPage(page, { path: '/apps' });
    await screen.findByRole('row', { name: /htop/ });
    expect(accent(within(pageHead()).getByRole('button', { name: launch }))).toBe(true);
  });

  it('an empty list: the empty state offers Launch an app, the header does not repeat it', async () => {
    await renderPage(page, { path: '/apps', state: 'no-open' });
    await screen.findByText(strings['empty.open.title']);
    expect(screen.getAllByRole('button', { name: launch })).toHaveLength(1);
    expect(within(pageHead()).queryByRole('button', { name: launch })).toBeNull();
  });

  it('a detail with its own Open: Launch an app stays in the header as a plain button', async () => {
    await renderPage(page, { path: '/apps?appsel=b2c3d4' });
    await screen.findByRole('heading', { name: 'htop' });
    const b = within(pageHead()).getByRole('button', { name: launch });
    expect(accent(b)).toBe(false);
  });

  it('a detail with no accent of its own: Launch an app keeps the accent', async () => {
    await renderPage(page, { path: '/apps?appsel=f6a7b8' });
    await screen.findByRole('heading', { name: 'btop' });
    expect(accent(within(pageHead()).getByRole('button', { name: launch }))).toBe(true);
  });
});
