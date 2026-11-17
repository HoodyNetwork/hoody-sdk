// Vitest: the Guide's reading column. Every section is the kit's
// strict section (one head: an h2 title, one sentence, its links; then the body), Skills and Build are split into kit
// sub-sections instead of loose h3s, and the keyboard list never shows a group title with no keys under it.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { SECTIONS } from './logic';
import page from './page';
import strings from './strings.en.json';

// One shell group with rows and one the shell left empty (every page it jumps to hidden).
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useShortcuts: () => [
    { id: 'all', title: 'Everywhere', rows: [{ keys: ['Ctrl K'], label: 'Search or jump to anything' }] },
    { id: 'go', title: 'Go to', rows: [] },
  ],
}));

// The first render of a file loads the page cold: up to 30 s for it to appear (the cold load can be slow on a busy machine).
const drawn = () => screen.findByRole('heading', { level: 2, name: strings['look.title'] }, { timeout: 30_000 });

describe('guide section anatomy', () => {
  it('every section is a kit strict section with its title as the h2', async () => {
    await renderPage(page);
    await drawn();
    for (const id of SECTIONS.filter((s) => s !== 'topics')) {
      const el = document.getElementById(`guide-${id}`);
      expect(el, id).not.toBeNull();
      expect(el?.hasAttribute('data-hub-section'), id).toBe(true);
      expect(el?.querySelector('[data-hub-heading]')?.tagName, id).toBe('H2');
    }
  }, 45_000);

  it('Skills and Build are kit sub-sections, each part with its own heading', async () => {
    await renderPage(page);
    await drawn();
    const skills = document.getElementById('guide-skills') as HTMLElement;
    const subs = [...skills.querySelectorAll('[data-hub-section="sub"]')].map((s) => s.querySelector('[data-hub-heading]')?.textContent);
    expect(subs).toEqual([strings['skills.install'], strings['skills.check'], strings['skills.update'], strings['skills.signIn']]);
    const build = document.getElementById('guide-build') as HTMLElement;
    expect([...build.querySelectorAll('[data-hub-section="sub"]')]).toHaveLength(3);
  });

  it('the keyboard list shows no group title without keys', async () => {
    await renderPage(page);
    await drawn();
    const keys = screen.getByRole('region', { name: strings['keys.title'] });
    expect(within(keys).getByRole('heading', { name: 'Everywhere' })).toBeInTheDocument();
    expect(within(keys).queryByRole('heading', { name: 'Go to' })).toBeNull();
  });

  it('Open Agent names its shortcut, and the note under Ask says it again in words', async () => {
    await renderPage(page);
    await drawn();
    const ask = screen.getByRole('region', { name: strings['ask.title'] });
    expect(within(ask).getByRole('button', { name: `${strings['ask.open']} (${strings['ask.shortcut']})` })).toBeInTheDocument();
    expect(ask.textContent).toContain(strings['ask.keyNote'].replace('{{keys}}', strings['ask.shortcut']));
  });

  it('Tools and Try are kit card lists: each card a list item whose title is a heading', async () => {
    await renderPage(page);
    await drawn();
    const tools = screen.getByRole('list', { name: strings['tools.title'] });
    expect(within(tools).getByRole('heading', { name: strings['tool.more'] })).toBeInTheDocument();
    expect(tools.querySelector('[data-action-card="more"]')?.tagName).toBe('LI');
    const recipes = within(screen.getByRole('list', { name: strings['try.title'] })).getAllByRole('listitem');
    expect(recipes).toHaveLength(6);
    expect(within(recipes[0] as HTMLElement).getByRole('heading', { name: strings['recipe.1'] })).toBeInTheDocument();
  });
});
