// Vitest: a Bot's card has structure. Its lead line says what the Bot is doing, then what it is for, then its facts as
// label and value rows (Computer, Realm, Model); the ways to reach it are one row of marks, the public link among them
// as a mark and its word.
import { renderPage, screen, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import page from './page';
import pane from './parts/pane.module.css';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const card = async (name: RegExp) => within(await screen.findByRole('table', { name: strings.title })).findByRole('row', { name });
const css = readFileSync(join(import.meta.dirname, 'parts/pane.module.css'), 'utf8');
const rule = (selector: string) => /\{([^}]*)\}/.exec(css.slice(css.indexOf(`\n${selector} {`)))?.[1]?.replace(/\s+/g, ' ').trim();

describe('a Bot card', () => {
  it('shows its facts as label and value rows: Computer, Realm, Model, in that order', async () => {
    await renderPage(page);
    const chief = await card(/Chief/);
    const labels = [...chief.querySelectorAll('[class*="listLabel"]')].map((x) => x.textContent);
    expect(labels).toEqual([strings['col.computer'], strings['col.realm'], strings['col.model']]);
    const values = [...chief.querySelectorAll('[class*="listLabel"]')].map((x) => x.nextElementSibling?.textContent);
    expect(values[0]).toBe('atlas');
    expect(values[1]).toBe('Acme client');
    expect(values[2]).toBeTruthy();
    // The realm is a plain value on the facts' edge, not a boxed tag; the two are no longer one joined line.
    expect(chief.textContent).not.toContain(' · ');
  });

  it('leads with what the Bot is doing: the first line of the card, before what it is for', async () => {
    await renderPage(page);
    const chief = await card(/Chief/);
    const lines = [...chief.querySelectorAll('[class*="cardItem"]')].map((x) => x.textContent);
    expect(lines[0]).toBe(strings['now.waiting']);
    expect(lines[1]).toMatch(/^Runs the team day/);
  });

  it('draws the ways to reach it as one row of marks with one gap, the public link as a mark and its word', async () => {
    await renderPage(page);
    const chief = await card(/Chief/);
    const link = within(chief).getByText(strings['reach.link']);
    expect(link.closest(`.${pane.reachLink}`)).not.toBeNull();
    expect(link.closest(`.${pane.reachWays}`)).not.toBeNull();
    expect(rule('.reachWays')).toBe('display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3); align-items: center; min-width: 0;');
    expect(rule('.reachLink')).toBe('display: inline-flex; gap: var(--sp-1); align-items: center; white-space: nowrap;');
  });
});
