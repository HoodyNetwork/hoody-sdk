// Which computer a new Bot runs on: the API's colour survives the page's list
// mapping, and the New Bot drawer's computer picker draws each computer's mark from it (fixture state colours: atlas
// blue, cinder a value that is not a hex colour, so no mark and nothing in a style).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { computerOf } from './data';
import page from './page';
import strings from './strings.en.json';

const markIn = (el: Element) => el.querySelector<HTMLElement>('[data-computer-color]');

describe('bots: the computer list keeps the API colour', () => {
  it('a listed computer keeps its colour as the API sends it; none when the API sends none or not a string', () => {
    expect(computerOf({ id: 'c1', name: 'atlas', status: 'running', color: '#3b82f6' }).color).toBe('#3b82f6');
    expect(computerOf({ id: 'c1', name: 'atlas', status: 'running', color: 'red;x:url()' }).color).toBe('red;x:url()');
    expect(computerOf({ id: 'c1', name: 'atlas', status: 'running' })).not.toHaveProperty('color');
    expect(computerOf({ id: 'c1', name: 'atlas', status: 'running', color: 7 })).not.toHaveProperty('color');
  });
});

describe('bots: the New Bot computer picker shows each computer’s colour', () => {
  it('the rows and, once picked, the trigger draw the mark; a colour that is not a hex value draws none', async () => {
    // No shown computer: atlas and cinder can both host, so the drawer preselects none (with a shown one it starts there).
    await renderPage(page, { state: 'colours', path: '/bots?drawer=new', computer: false });
    const dialog = await screen.findByRole('dialog', { name: strings['newBot.title'] });
    const trigger = () => within(dialog).getByRole('button', { name: new RegExp(strings['picker.computer.label']) });
    expect(markIn(trigger())).toBeNull(); // nothing picked yet
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: strings['picker.computer.label'] });
    const row = (name: string) => within(list).getByRole('radio', { name: new RegExp(`^${name}\\b`) });
    expect(markIn(row('atlas'))?.dataset.computerColor).toBe('#3B82F6');
    expect(markIn(row('cinder'))).toBeNull();
    for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style') ?? '').not.toContain('url(');
    await userEvent.click(row('atlas'));
    expect(markIn(trigger())?.dataset.computerColor).toBe('#3B82F6');
  });
});
