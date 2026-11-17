// Vitest: the Security summary reads the first page of sessions (50) only. Real accounts:
// "49 other browsers or devices are signed in" beside a sessions list of 266. With more pages it says "N+".
import { renderPage, screen } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const more = new RegExp(`^${strings['sum.sessionsMore'].replace(/[.+]/g, '\\$&').replace('{{count}}', '\\d+')}$`);
const exact = new RegExp(`^${strings['sum.sessions_other'].replace('{{count}}', '\\d+').replace('.', '\\.')}$`);

describe('account: the sessions line of the Security summary', () => {
  it('says "N+" when more pages of sessions exist', async () => {
    await renderPage(page, { state: 'sessions-more' });
    expect((await screen.findAllByText(more, {}, { timeout: 10000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(exact)).toBeNull();
  });
  it('gives the exact count when one page holds them all', async () => {
    await renderPage(page);
    expect((await screen.findAllByText(exact, {}, { timeout: 10000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(more)).toBeNull();
  });
});
