// Vitest: two things the Security summary and the page's links owe a reader.
//  - The "sessions" link and command name a section the page has (?section=<id>, which the settings layout follows).
//    A "#sessions" fragment names nothing on the page: it scrolls nowhere.
//  - A read that failed on a later try is unknown in the summary, as it is in its section: the summary never keeps
//    saying the earlier answer ("Email verified", a session count) beside a section that says it did not load.
import { bootFixtureCore } from '@core';
import { renderPage, screen, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({ failed: false }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  // A query whose latest read failed while it still holds the earlier answer.
  const stale = <Q extends object>(q: Q): Q => (world.failed ? { ...q, error: new Error('read failed'), isError: true } : q);
  return {
    ...real,
    useProfile: () => stale(real.useProfile()),
    useSessions: (...a: Parameters<typeof real.useSessions>) => stale(real.useSessions(...a)),
  };
});

import type * as dataModule from './data';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

const SLOW = { timeout: 8000 };

beforeEach(() => {
  bootFixtureCore();
  world.failed = false;
});

describe('account: the sessions link', () => {
  it('the public link and the command name a section the page draws', async () => {
    const cmd = (page.commands ?? []).find((c) => c.id === 'sessions');
    expect(cmd?.to).toBe(links.sessions);
    const [path, query = ''] = links.sessions.split('?');
    expect(path).toBe('/account');
    const id = new URLSearchParams(query).get('section');
    expect(id).not.toBeNull();
    await renderPage(page, { path: links.sessions });
    await screen.findByRole('list', { name: strings['sum.railTitle'] }, SLOW);
    expect(document.querySelector(`[data-section="${id}"]`)).not.toBeNull();
  });
});

describe('account: the Security summary after a read that failed on a later try', () => {
  it('the email and sessions rows say unknown with Try again, never the earlier answer', async () => {
    world.failed = true;
    await renderPage(page);
    const list = await screen.findByRole('list', { name: strings['sum.railTitle'] }, SLOW);
    expect(within(list).queryByText(strings['sum.emailOk'])).toBeNull();
    for (const text of [strings['sum.emailUnknown'], strings['sum.sessionsUnknown']]) {
      const row = within(list).getByText(text).closest('li') as HTMLElement;
      expect(within(row).getByRole('button', { name: strings['sum.tryAgain'] })).toBeInTheDocument();
    }
  });
});
