// Vitest: the Support page's sentences are true for what is on screen. An empty status says that status is empty
// (never "no tickets yet") and leads back to every ticket; the search box names what it searches; a category this
// page does not know reads as Other; counts of one read as one; the nav count names tickets, as its tooltip does.
import { renderPage, screen, userEvent } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { categoryKey } from './logic';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 10000 };
const table = strings as Record<string, string>;

describe('support words', () => {
  it('an empty status names that status, keeps New ticket in the header and leads back to every ticket', async () => {
    await renderPage(page, { state: 'empty', path: '/support?status=closed' });
    expect(await screen.findByText(strings['empty.closed'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
    expect(screen.getAllByRole('button', { name: strings['action.new'] })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: strings['empty.showAll'] }));
    expect(await screen.findByText(strings['empty.title'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.closed'])).toBeNull();
  });

  it('the search box says it searches subjects', async () => {
    await renderPage(page, { path: '/support' });
    expect(await screen.findByPlaceholderText(strings.search, undefined, SLOW)).toBeInTheDocument();
  });

  it('a one-ticket limit reads without a plural', async () => {
    await renderPage(page, { state: 'banned', path: '/support?new=1' });
    expect(await screen.findByText('Open tickets: 1 of 1.', undefined, SLOW)).toBeInTheDocument();
  });

  it('a category this page does not know reads as Other', () => {
    expect(categoryKey('billing')).toBe('category.billing');
    expect(categoryKey('something_new')).toBe('category.other');
    expect(categoryKey('toString')).toBe('category.other');
  });

  it('counts of one have their own sentence, and the nav count names tickets', () => {
    expect(table['search.note_one']).toMatch(/loaded ticket\./);
    expect(table['search.note']).toBeUndefined();
    expect(table['nav.countLabel_one']).toMatch(/ticket with an unread reply/);
    expect(table['nav.countLabel_other']).toMatch(/tickets with unread replies/);
  });

  it('no sentence offers an access key for Support or promises text shows exactly as typed', () => {
    expect(table['access.token']).not.toMatch(/access key/);
    expect(table['faq.text.a']).not.toMatch(/exactly as you typed/);
  });

  it('holds no string the page never draws', () => {
    expect(table['action.checkAgain']).toBeUndefined();
    expect(table['action.tryAgain']).toBeUndefined();
  });
});
