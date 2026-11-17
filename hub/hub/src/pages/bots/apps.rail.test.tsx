// Vitest: the list's Chat apps column. In a rail each row draws each app's mark alone (named by its
// label), on the row's meta line; a Bot with no chat app draws nothing there. The wide List table keeps the column, and a
// Bot with no chat app shows a dash in its cell, never a blank one.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, renderPage as renderPageRaw, screen } from '@app/testing';
import { localSetting } from '@core';
import page from './page';
import strings from './strings.en.json';

const present = () => localSetting('hub.v3.table.present.bots');
const renderPage = async (...a: Parameters<typeof renderPageRaw>) => {
  const r = await renderPageRaw(...a);
  await act(async () => void present().set('list'));
  return r;
};
afterEach(() => void present().set(null));
beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

describe('the Chat apps column', () => {
  it('in a rail a row with chat apps draws each app as its mark, named by its label', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await screen.findByRole('heading', { level: 2, name: 'Chief' });
    const rail = document.querySelector('[data-rail]') as HTMLElement;
    expect(rail, 'the list is a rail').not.toBeNull();
    const marks = [...rail.querySelectorAll('[data-chat-app]')];
    expect(marks.length, 'marks in the rail').toBeGreaterThan(1);
    for (const m of marks) expect(m.getAttribute('aria-label') ?? '').toMatch(/^(Telegram|Slack|Discord)$/);
  });

  it('in the table a Bot with no chat app shows a dash in its cell, not a blank one', async () => {
    await renderPage(page, { path: '/bots' });
    const head = await screen.findByRole('columnheader', { name: strings['col.apps'] });
    const table = head.closest('table') as HTMLElement;
    const at = [...(head.parentElement as HTMLElement).children].indexOf(head);
    const cells = [...table.querySelectorAll('tbody tr')].map((tr) => tr.children[at] as HTMLElement | undefined).filter(Boolean) as HTMLElement[];
    const empty = cells.filter((c) => !c.querySelector('[data-chat-app]'));
    expect(empty.length, 'a Bot with no chat app in the fixtures').toBeGreaterThan(0);
    for (const c of empty) expect(c.textContent?.trim()).toBe('—');
  });
});
