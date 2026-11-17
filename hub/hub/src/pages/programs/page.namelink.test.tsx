// Vitest: the Programs summary names its computer as a link to that computer ("19 programs on atlas · 13 running":
// atlas was plain text). It goes to the computer by its handle; a load that hides Computers keeps the name as text; the
// loading line stays plain.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { computerHandle, computerHref, fixtureWorld } from '@core';
import { links as computersLinks } from '../computers/links';
import type * as Kit from '@kit';
import type { PageLink } from '@kit';
import page from './page';

const link = vi.hoisted(() => ({ current: undefined as PageLink | null | undefined }));
const pick = (id: string, orig: (id: string) => PageLink | null) => (id === 'computers' && link.current !== undefined ? link.current : orig(id));
// A load that does not serve Computers answers null. The page asks through the kit barrel; the kit ComputerLink (PageLinkTo)
// asks the shell itself, so both are mocked.
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return { ...kit, usePageLink: (id: string) => pick(id, kit.usePageLink) };
});
vi.mock('../../shell/pageLinks', async (orig) => {
  const shell = await orig<{ usePageLink: (id: string) => PageLink | null }>();
  return { ...shell, usePageLink: (id: string) => pick(id, shell.usePageLink) };
});

afterEach(() => {
  link.current = undefined;
});

describe('the Programs summary names its computer as a link', () => {
  it('core\'s computer href is the one Computers publishes (the kit link and the pages cannot drift)', () => {
    for (const h of ['atlas.4b5c', 'a b.1234', 'x/y.9999']) expect(computerHref(h)).toBe(computersLinks.item(h));
  });

  it('the computer name in "N programs on <name> · M running" is a link to that computer, by handle', async () => {
    await renderPage(page);
    await screen.findByRole('row', { name: /web/ });
    const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');
    if (!atlas) throw new Error('no atlas');
    const a = await screen.findByRole('link', { name: 'atlas' });
    expect(a.getAttribute('href')).toMatch(new RegExp(`/computers\\?sel=${encodeURIComponent(computerHandle(atlas))}$`));
    // The line reads whole around the link, and the link is not inside a button or another link.
    expect(a.parentElement?.textContent).toMatch(/19 programs on atlas · \d+ running/);
    expect(a.parentElement?.closest('a, button')).toBeNull();
  });

  it('a computer with programs that need a look keeps that count after the linked name, in the same line', async () => {
    await renderPage(page, { state: 'attention' });
    const a = await screen.findByRole('link', { name: 'atlas' });
    expect(a.parentElement?.textContent).toMatch(/^\d+ programs? on atlas · \d+ running · \d+ needs? a look$/);
  });

  it('a load that hides Computers keeps the name as plain text in the same line', async () => {
    link.current = null;
    await renderPage(page);
    await screen.findByRole('row', { name: /web/ });
    // The line is the header's context row, not a <p> (summary.context.test.tsx).
    expect(document.querySelector('h1[data-hub-title]')?.closest('header')?.textContent).toMatch(/19 programs on atlas · \d+ running/);
    expect(screen.queryByRole('link', { name: 'atlas' })).toBeNull();
  });
});
