// Which computer each pane acts on: with the API's colours (fixture state
// colours), each pane's picker draws its own computer's mark, so two panes on two computers show two colours; a
// colour that is not a hex value draws no mark and reaches no style. The colour comes from the computer list as the
// API answers it, through the page's own mapping.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const paneLabel = (pane: 'pane.a' | 'pane.b') => fill(strings['pick.label'], { pane: strings[pane] });
const pickerOf = (pane: 'pane.a' | 'pane.b', name: string) =>
  screen.findByRole('button', { name: (n: string) => n.startsWith(`${name} `) && n.endsWith(` ${paneLabel(pane)}`) }, { timeout: 15_000 });
const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');

describe('files: each pane picker shows its computer’s colour', () => {
  it('two panes on two computers: two marks in their own colours', async () => {
    await renderPage(page, { state: 'colours', path: '/files?a=atlas.00a1&b=fjord.00f6' });
    const a = await pickerOf('pane.a', 'atlas');
    const b = await pickerOf('pane.b', 'fjord');
    await waitFor(() => expect(markIn(a)?.dataset.computerColor).toBe('#3B82F6'));
    expect(markIn(b)?.dataset.computerColor).toBe('#10B981');
  });

  it('a computer whose colour is not a hex value draws no mark, on the trigger or in the list', async () => {
    await renderPage(page, { state: 'colours', path: '/files?a=atlas.00a1&b=cedar.00c3' });
    const b = await pickerOf('pane.b', 'cedar');
    expect(markIn(b)).toBeNull();
    await userEvent.click(b);
    const list = await screen.findByRole('dialog', { name: paneLabel('pane.b') });
    const row = (name: string) => within(list).getByRole('radio', { name: new RegExp(`^${name}\\b`) });
    expect(markIn(row('cedar'))).toBeNull();
    expect(markIn(row('atlas'))?.dataset.computerColor).toBe('#3B82F6');
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style') ?? '').not.toContain('url(');
  });

  it('with no colours (the default state), no pane draws a mark', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&b=fjord.00f6' });
    const a = await pickerOf('pane.a', 'atlas');
    expect(markIn(a)).toBeNull();
  });
});
