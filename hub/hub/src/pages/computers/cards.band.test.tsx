// Vitest: every computer card closes with its footer holding the one start
// button its state offers (Start, Resume or Restart) before the row menu, and a running card has no worded Open terminal
// (it stays first in the row menu and on the `t` key). The name is the card's whole title (its h3) with the
// project on the line under it. Table and list rows are unchanged.
import { afterEach, describe, expect, it } from 'vitest';
import { localSetting } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const present = () => localSetting('hub.v3.table.present.machines');
afterEach(() => {
  present().set(null);
});

const T = 8000;
// The name: the card's h3, or the list row's strong.
const NAME = 'h3, strong';
const card = (name: string) => screen.getByText(name, { selector: NAME }).closest('[data-row-id]') as HTMLElement;
const band = (name: string) => card(name).querySelector('article [class*="foot"]') as HTMLElement | null;
// A button that shows its words (not an icon-only one named the same).
const worded = (root: HTMLElement, label: string) => within(root).queryAllByRole('button', { name: new RegExp(label) }).filter((b) => (b.textContent ?? '').includes(label));

describe('computers: the card band and title', () => {
  it('a failed card offers Restart before the row menu; a running one has no worded Open terminal', async () => {
    await renderPage(page, { path: '/computers' });
    await screen.findByText('atlas', { selector: NAME }, { timeout: T });
    const run = band('atlas');
    expect(run).not.toBeNull();
    expect(worded(run!, strings['menu.openTerminal'])).toHaveLength(0);
    expect(within(run!).getByRole('button', { name: /actions/i })).toBeInTheDocument();
    const failed = band('ember')!;
    const restart = worded(failed, strings['menu.restart']);
    expect(restart).toHaveLength(1);
    expect(restart[0]!.compareDocumentPosition(within(failed).getByRole('button', { name: /actions/i })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the name is the whole title, alone on its line; the project sits on the line under it', async () => {
    await renderPage(page, { path: '/computers' });
    const name = await screen.findByText('atlas', { selector: NAME }, { timeout: T });
    expect(name.tagName).toBe('H3');
    const titleLine = name;
    expect(titleLine.textContent).toBe('atlas');
    const project = within(card('atlas')).getByText('Home base');
    expect(titleLine.contains(project)).toBe(false);
    expect(project.textContent).toBe('Home base');
  });

  it('with Cards chosen and a computer open, the list beside it draws rows: one-line names, no worded Open terminal', async () => {
    present().set('cards');
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await screen.findByRole('tab', { name: /overview/i }, { timeout: T });
    const rows = await screen.findAllByText((_, el) => el?.hasAttribute('data-row-id') === true && (el.textContent ?? '').includes('Home base'), undefined, { timeout: T });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.querySelector('article, [class*="nameCard"], [class*="nameSub"], [class*="cardBottom"]')).toBeNull();
      expect(worded(row, strings['menu.openTerminal'])).toHaveLength(0);
    }
  });

  it('a List row keeps one line and gets no worded Open terminal button', async () => {
    await renderPage(page, { path: '/computers' });
    await screen.findByText('atlas', { selector: NAME }, { timeout: T });
    await userEvent.click(screen.getByRole('radio', { name: 'List' }));
    const row = card('atlas');
    expect(row.querySelector('article, [class*="cardBottom"]')).toBeNull();
    expect(worded(row, strings['menu.openTerminal'])).toHaveLength(0);
    expect(within(row).getByText('· Home base')).toBeTruthy();
  });
});
