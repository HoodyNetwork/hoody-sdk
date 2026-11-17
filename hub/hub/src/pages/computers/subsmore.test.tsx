// The Servers subscriptions panel says when the list may be cut. The page reads one page of 50
// subscriptions and only the API's total can say the list is whole: total > rows shows the notice, total <= rows
// hides it, and without a number there the list stays unknown (the notice shows). An answer without a list is a
// failed read: a server's panel says its subscription is not known, never that it has none.
import { describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import detail from './parts/ServerDetail.strings.en.json';

const open = async (state: string) => {
  await renderPage(page, { path: '/computers/servers', state });
  // The panel title and the table's label both read "Subscriptions": wait for the rows to be drawn.
  expect((await screen.findAllByText(strings['srv.subs'], {}, { timeout: 8000 })).length).toBeGreaterThan(0);
};
const notice = () => screen.queryByText(strings['srv.subsMore']);
const PAID = fixtureWorld.servers.find((x) => !x.free);
if (!PAID) throw new Error('fixture paid server');

describe('subscriptions notice', () => {
  it('a total over the rows read says more are not shown', async () => {
    await open('subsMore');
    expect(notice()).toBeInTheDocument();
  });
  it('a total equal to a full page hides the notice', async () => {
    await open('subsFullWhole');
    expect(notice()).toBeNull();
  });
  it('the default answer, total equal to its rows, hides the notice', async () => {
    await open('many');
    expect(notice()).toBeNull();
  });
  it('a total below the rows (0) hides the notice', async () => {
    await open('subsTotalLow');
    expect(notice()).toBeNull();
  });
  it('an answer without a total is not said to be whole', async () => {
    await open('subsNoTotal');
    expect(notice()).toBeInTheDocument();
  });
  it('a total that is not a number is as unknown as none', async () => {
    await open('subsTotalText');
    expect(notice()).toBeInTheDocument();
  });
  it('an answer without a list is a failed read: no panel, and a server says its subscription is not known', async () => {
    await renderPage(page, { path: '/computers/servers', state: 'subsMalformed' });
    const row = (await screen.findByText(PAID.name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
    expect(screen.queryByText(strings['srv.subs'])).toBeNull();
    await userEvent.click(row);
    const d = await screen.findByRole('dialog', { name: PAID.name });
    expect(await within(d).findByText(detail['sd.subUnknown'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByText(detail['sd.noSub'])).toBeNull();
  });
});
