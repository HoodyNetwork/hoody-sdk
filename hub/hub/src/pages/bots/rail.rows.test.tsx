// Vitest: the Bots listed beside an open Bot (the rail) are two lines of one height: the name, then the status in one
// column as wide on every row, and one line that fills the rest (what the Bot is doing), ending in the row's word or its
// chat apps' marks. No control sits on that line besides
// the row's own actions: a control there (the privacy tip's button) made every field of the line a control-height box,
// so a row with chat apps stood far taller than its neighbours. The realm shows only where the listed Bots differ in it;
// the row's words still carry the status, the realm and the chat apps (privacy included).
import { act, renderPage as renderPageRaw, screen } from '@app/testing';
import { localSetting } from '@core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
const SUPPORT = 'c-atlas~a1b2c3d4e5f60718293a4b5c~support';
const railRows = (): HTMLElement[] => [...(document.querySelector('[data-rail]') as HTMLElement).querySelectorAll<HTMLElement>('td[class*="listCell"]')];
const rowOf = (name: string): HTMLElement => {
  const row = railRows().find((td) => td.querySelector('[class*="listPrimary"]')?.textContent?.trim() === name);
  expect(row, `a rail row named ${name}`).toBeDefined();
  return row as HTMLElement;
};
const line2 = (td: HTMLElement) => td.querySelector('[class*="listLine2"]') as HTMLElement;
const track2 = (td: HTMLElement) => td.querySelector('[class*="railStatusTrack"]')?.textContent ?? '';

describe('the Bots rail rows', () => {
  it('a row with chat apps and privacy on keeps one line 2: its fields, then only the row\'s own actions', async () => {
    await renderPage(page, { state: 'chatsWaiting', path: `/bots?sel=${encodeURIComponent(SUPPORT)}` });
    await screen.findByRole('heading', { level: 2, name: 'Support' });
    const chief = rowOf('Chief');
    const fields = line2(chief).querySelector('[class*="listMeta"]') as HTMLElement;
    // No control among the fields: the privacy note is words there, never a tip button.
    expect(fields.querySelectorAll('button, a[href], [role="button"]')).toHaveLength(0);
    // Status, then one field that fills the line.
    const items = [...fields.children];
    expect(items).toHaveLength(2);
    expect(items[1]?.hasAttribute('data-list-fill')).toBe(true);
    // A row with its word (Let in) says why on its line (the groups waiting), keeps its marks and Privacy on, and ends
    // with the word after them.
    expect(line2(chief).querySelector('[data-row-actions]')?.textContent).toContain(strings['row.letIn']);
    expect(items[1]?.textContent).toContain('2 groups waiting');
    expect([...(items[1]?.querySelectorAll('[data-chat-app]') ?? [])].map((m) => m.getAttribute('aria-label'))).toEqual(['Telegram', 'Slack', 'Discord']);
    expect(items[1]?.textContent).toContain(strings['list.privacySubject']);
    // A row with an app and no button draws the app's mark at its line's end.
    const support = rowOf('Support');
    expect([...support.querySelectorAll('[data-list-fill] [data-chat-app]')].map((m) => m.getAttribute('aria-label'))).toEqual(['Discord']);
  });

  it('every rail row draws two lines: no realm, model or computer field of its own', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await screen.findByRole('heading', { level: 2, name: 'Chief' });
    const rows = railRows();
    expect(rows.length).toBeGreaterThan(3);
    for (const td of rows) {
      const fields = [...(line2(td).querySelector('[class*="listMeta"]') as HTMLElement).children];
      expect(fields.length, td.textContent ?? '').toBeLessThanOrEqual(2);
      expect(fields.filter((f) => f.hasAttribute('data-list-fill'))).toHaveLength(1);
      expect(td.textContent).not.toContain(strings['col.model']);
    }
  });

  it('the realm shows where the listed Bots differ in it, and is only in the row\'s words where they share one', async () => {
    // The fixtures' Bots sit in three realms: each row shows its own.
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await screen.findByRole('heading', { level: 2, name: 'Chief' });
    const fill = rowOf('Notes').querySelector('[data-list-fill]') as HTMLElement;
    expect(fill.textContent).toContain('Personal');
    expect(fill.querySelector('[class*="srOnly" i]')).toBeNull();
  });

  it('one realm among the listed Bots: the realm is in the row\'s words, not drawn', async () => {
    await renderPage(page, { state: 'railOne', path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await screen.findByRole('heading', { level: 2, name: 'Chief' });
    const row = rowOf('Chief');
    expect(row.querySelector('[data-list-fill]')?.textContent ?? '').not.toContain('Acme client');
    const hidden = [...row.querySelectorAll<HTMLElement>('*')].filter((e) => e.textContent?.includes('Acme client'));
    expect(hidden.length, 'the realm is in the row').toBeGreaterThan(0);
    // The innermost element holding it is the visually hidden text.
    const inner = hidden[hidden.length - 1] as HTMLElement;
    expect(inner.className).toMatch(/sr/i);
  });

  it('a dot sits only between two drawn phrases: the realm first, then what the Bot is doing', async () => {
    await renderPage(page, { state: 'chatsWaiting', path: `/bots?sel=${encodeURIComponent(SUPPORT)}` });
    await screen.findByRole('heading', { level: 2, name: 'Support' });
    const phrasesOf = (name: string) => [...(rowOf(name).querySelector('[data-list-fill]') as HTMLElement).querySelectorAll<HTMLElement>('[class*="railPhrase"]')].map((e) => e.textContent ?? '');
    // An idle Bot in a rail of differing realms: its realm, then when it was last active after a dot.
    const notes = phrasesOf('Notes');
    expect(notes).toHaveLength(2);
    expect(notes[0]).toBe('Personal');
    expect(notes[1]?.trim().startsWith('·')).toBe(true);
    // A working Bot: its moving dots say it on the line; its words are in the row's words only.
    const support = rowOf('Support');
    expect(support.querySelector('[data-list-fill]')?.textContent).not.toContain(strings['now.working']);
    expect(support.textContent).toContain(strings['now.working']);
    for (const td of railRows()) {
      const first = td.querySelector('[data-list-fill] [class*="railPhrase"]');
      if (first) expect(first.textContent?.trim().startsWith('·'), td.textContent ?? '').toBe(false);
    }
  });

  it('the status column: short words, the whole status in the row\'s words, a box only where the Bot waits on the person', async () => {
    await renderPage(page, { state: 'chatsWaiting', path: `/bots?sel=${encodeURIComponent(SUPPORT)}` });
    await screen.findByRole('heading', { level: 2, name: 'Support' });
    const track = (td: HTMLElement) => td.querySelector<HTMLElement>('[class*="railStatusTrack"]') as HTMLElement;
    for (const td of railRows()) {
      expect(track(td), td.textContent ?? '').not.toBeNull();
      // One width on every row comes from the stylesheet, never from the listed Bots.
      expect(track(td).getAttribute('style')).toBeNull();
      // The box only where the Bot waits on the person: Needs you, Paused.
      const word = (track(td).querySelector('[data-rail-status-word]') ?? track(td)).textContent ?? '';
      expect(track(td).hasAttribute('data-boxed'), td.textContent ?? '').toBe(word === strings['status.needsYou'] || word === strings['status.paused']);
    }
    // Queued messages say the short form on the line; the row's words keep the whole status.
    const digest = track(rowOf('Digest'));
    expect(digest.querySelector('[data-rail-status-word]')?.textContent).toBe(strings['status.queuedRail'].replace('{{count}}', '2'));
    expect(digest.textContent).toContain(strings['status.queuedN_other'].replace('{{count}}', '2'));
  });

  it('a locked Bot in the rail: no lock before its name (LOCKED on line 2 says it), and a short reason', async () => {
    // Harbor sits past the first page of the rail.
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&page=2` });
    await screen.findByRole('heading', { level: 2, name: 'Chief' });
    const harbor = rowOf('Harbor');
    expect(harbor.querySelector('[class*="listPrimary"] [class*="nameMark"]')).toBeNull();
    expect(track2(harbor)).toContain(strings['status.locked']);
    expect(harbor.querySelector('[data-list-fill]')?.textContent).toContain(strings['now.lockedShort']);
    expect(harbor.textContent).toContain(strings['now.locked']);
  });

  it('a group header counts its Bots and its paused Bots in the same quiet words', async () => {
    await renderPage(page, { state: 'railPaused', path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await screen.findByRole('heading', { level: 2, name: 'bright-crimson-lynx' });
    const heads = [...(document.querySelector('[data-rail]') as HTMLElement).querySelectorAll<HTMLElement>('[class*="groupCount"]')].map((e) => e.textContent);
    expect(heads).toEqual(expect.arrayContaining(['1 Bot · 2 paused', '1 paused']));
    expect(document.querySelector('[data-rail] [data-group-extra], [data-rail] [data-group-extra-end], [data-rail] [data-group-extra-inline]')).toBeNull();
  });
});
