// Vitest: the Bot's archive, the rows Start over and Forget take out of the conversation. Activity's Archive
// button opens it in a drawer (drawer=archive in the address); it reads a page of 100 at a time, newest page first, and steps back
// with Older (the page before the oldest row shown) and forward with Newer. A Bot with nothing archived says so. Read only.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { archiveKey } from './data';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const SUPPORT = 'c-atlas~a1b2c3d4e5f60718293a4b5c~support';
const drawer = async (name: string) => within(await screen.findByRole('dialog', { name: new RegExp(`^Archive of ${name}`) }));

describe('the archive drawer', () => {
  it('Activity opens it on the newest page; Older steps back to the first rows, Newer comes forward again', async () => {
    const { router } = await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await userEvent.click(await screen.findByRole('button', { name: strings['archive.open'] }));
    expect(router.state.location.search).toMatchObject({ drawer: 'archive' });
    let d = await drawer('Chief');
    expect(d.getByText(strings['archive.desc'])).toBeInTheDocument();
    expect(await d.findAllByRole('listitem')).toHaveLength(6);
    expect(d.queryByRole('button', { name: strings['archive.newer'] })).toBeNull();
    await userEvent.click(d.getByRole('button', { name: strings['archive.older'] }));
    d = await drawer('Chief');
    expect(await d.findAllByRole('listitem')).toHaveLength(4);
    expect(d.queryByRole('button', { name: strings['archive.older'] })).toBeNull();
    await userEvent.click(d.getByRole('button', { name: strings['archive.newer'] }));
    expect(await (await drawer('Chief')).findAllByRole('listitem')).toHaveLength(6);
  });

  it('a Bot with nothing archived says so', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(SUPPORT)}&drawer=archive` });
    const d = await drawer('Support');
    expect(await d.findByText(strings['archive.empty'])).toBeInTheDocument();
    expect(d.queryByRole('button', { name: strings['archive.older'] })).toBeNull();
  });

  it('a Bot switch while the drawer is open starts on the new Bot\'s newest page, never at the old Bot\'s cursor', async () => {
    const { router } = await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&drawer=archive` });
    const d = await drawer('Chief');
    await d.findAllByRole('listitem');
    await userEvent.click(d.getByRole('button', { name: strings['archive.older'] }));
    expect(await (await drawer('Chief')).findAllByRole('listitem')).toHaveLength(4);
    await router.navigate({ href: `/bots?sel=${encodeURIComponent(SUPPORT)}&drawer=archive` });
    const s2 = await drawer('Support');
    expect(await s2.findByText(strings['archive.empty'])).toBeInTheDocument();
    expect(s2.queryByRole('button', { name: strings['archive.newer'] })).toBeNull();
  });

  it('back to a Bot after another, or a close and reopen, starts again at its newest page', async () => {
    const { router } = await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&drawer=archive` });
    const older = async () => {
      const d = await drawer('Chief');
      await d.findAllByRole('listitem');
      await userEvent.click(d.getByRole('button', { name: strings['archive.older'] }));
      expect(await (await drawer('Chief')).findAllByRole('listitem')).toHaveLength(4);
    };
    await older();
    await router.navigate({ href: `/bots?sel=${encodeURIComponent(SUPPORT)}&drawer=archive` });
    expect(await (await drawer('Support')).findByText(strings['archive.empty'])).toBeInTheDocument();
    await router.navigate({ href: `/bots?sel=${encodeURIComponent(CHIEF)}&drawer=archive` });
    expect(await (await drawer('Chief')).findAllByRole('listitem')).toHaveLength(6);
    await older();
    await router.navigate({ href: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await router.navigate({ href: `/bots?sel=${encodeURIComponent(CHIEF)}&drawer=archive` });
    const d = await drawer('Chief');
    expect(await d.findAllByRole('listitem')).toHaveLength(6);
    expect(d.queryByRole('button', { name: strings['archive.newer'] })).toBeNull();
  });

  it('pages are held per Bot and per page', () => {
    expect(archiveKey(CHIEF, undefined)).toBe(`${CHIEF}|`);
    expect(archiveKey(CHIEF, 101)).toBe(`${CHIEF}|101`);
  });
});
