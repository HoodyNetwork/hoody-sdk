// New realm's questions: the page shows all nine under the wizard, each with a kit-valid anchor id, a question
// that ends "?" and its answer; the strings hold no FAQ key the page does not show.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetRealmsWorld } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const S = strings as Record<string, string>;
const IDS = ['whatIs', 'startsWith', 'pickMoves', 'projects', 'keysShares', 'whatElse', 'cost', 'nameColour', 'switchRemove'];

beforeEach(() => resetRealmsWorld());

describe('realms: New realm questions', () => {
  it('lists every question under the wizard, with kit-valid ids, and no stray FAQ string', async () => {
    await renderPage(page, { path: '/realms/new' });
    await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
    expect(IDS).toHaveLength(9);
    for (const id of IDS) {
      expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      const q = S[`faq.${id}.q`] ?? '';
      expect(q, id).toMatch(/\?$/);
      expect(S[`faq.${id}.a`], id).toBeTruthy();
      const anchor = document.getElementById(`faq-${id}`);
      expect(anchor, id).not.toBeNull();
      expect(within(anchor as HTMLElement).getByText(q)).toBeInTheDocument();
    }
    const keys = Object.keys(strings).filter((k) => k.startsWith('faq.'));
    expect(keys.sort()).toEqual(IDS.flatMap((id) => [`faq.${id}.a`, `faq.${id}.q`]).sort());
  });

  it('opening a question shows its answer', async () => {
    await renderPage(page, { path: '/realms/new' });
    const q = await screen.findByRole('button', { name: strings['faq.whatIs.q'] }, { timeout: T });
    await userEvent.click(q);
    await waitFor(() => expect(screen.getByText(strings['faq.whatIs.a'])).toBeVisible(), { timeout: T });
  });

  it('says what an empty realm does after a reload, and never offers a Delete realm', () => {
    expect(strings['faq.switchRemove.a']).toContain('An empty realm may not reopen after a reload');
    expect(strings['faq.switchRemove.a']).toContain('There is no Delete realm');
  });

  it('says a share can outlast its key and can bill you, and that Projects can show other realms\' projects', () => {
    expect(strings['faq.keysShares.a']).toContain('Its key stops when the share ends; SSH keys, program addresses, storage shares and Bot links they set up can keep working');
    expect(strings['faq.keysShares.a']).toContain('are billed to you');
    expect(strings['faq.whatIs.a']).not.toContain('every list');
    expect(strings['faq.whatIs.a']).toContain('Projects also shows a project from another realm');
  });
});
