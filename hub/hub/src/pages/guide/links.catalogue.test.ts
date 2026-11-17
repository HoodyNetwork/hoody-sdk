// Every link reads the computers page's program list (computers/links.ts KIT_PROGRAMS): the same programs,
// in the same order, as Computer › Connect, then the web port. A program used from code only offers no Open; exec keeps
// the path that answers in a browser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import { KIT_PROGRAMS } from '../computers/links';
import { LINKS, MORE_LINK_SLUGS } from './logic';
import page from './page';
import strings from './strings.en.json';

afterEach(() => vi.restoreAllMocks());

describe("the Guide's Every link", () => {
  it('lists the computers page catalogue, then the web port', () => {
    expect(LINKS.map((l) => l[0])).toEqual([...KIT_PROGRAMS.map((p) => p.key), 'http']);
    expect(LINKS.map((l) => l[1])).toEqual([...KIT_PROGRAMS.map((p) => p.slug), 'http']);
  });

  it('only the code programs offer no Open; exec keeps its hello path', () => {
    expect(LINKS.filter((l) => !l[4]).map((l) => l[0])).toEqual(['curl', 'watch']);
    expect(LINKS.find((l) => l[0] === 'exec')?.[3]).toBe('/api/hello');
  });

  it('every row has its name, and the "same pattern" examples are programs it does not list', () => {
    for (const [key] of LINKS) expect(strings[`program.${key}` as keyof typeof strings]).toBeTruthy();
    for (const slug of MORE_LINK_SLUGS) expect(LINKS.map((l) => l[1])).not.toContain(slug);
  });
});

describe('Every link, drawn', () => {
  it('a row for every program; cURL and Watch offer no Open; Exec opens its hello path', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderPage(page, { path: '/guide#links' });
    await screen.findByRole('heading', { level: 2, name: strings['links.title'] });
    const name = (k: string) => strings[`program.${k}` as keyof typeof strings];
    const openOf = (k: string) => screen.queryByRole('button', { name: strings['links.open'].replace('{{program}}', name(k)) });
    // The rows come once the picked computer is read (the computer list loads after the page).
    await screen.findByRole('button', { name: strings['links.copy'].replace('{{program}}', name('agent')) }, { timeout: 8000 });
    for (const [key, , , , offers] of LINKS) {
      expect(screen.getByRole('button', { name: strings['links.copy'].replace('{{program}}', name(key)) })).toBeInTheDocument();
      if (offers) expect(openOf(key)).toBeInTheDocument();
      else expect(openOf(key)).toBeNull();
    }
    expect(openOf('curl')).toBeNull();
    expect(openOf('watch')).toBeNull();
    await userEvent.click(openOf('exec') as HTMLElement);
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/-exec-1\.[^/]+\/api\/hello$/), '_blank', 'noopener,noreferrer');
  });
});
