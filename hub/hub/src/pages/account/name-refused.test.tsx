// Vitest: a display name the server refuses (direction or control characters, or a name that reads as an official Hoody
// identity: both a 400 with no code) is said at the field as "not accepted", in place of the general "That didn't
// work. Try again." banner; any other failure keeps the banner. The fixture source carries no status, so the send
// itself is stubbed.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { bootFixtureCore } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

const answer = vi.hoisted(() => ({ next: { outcome: 'failed', status: 400 } as Record<string, unknown> }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  return { ...real, useRename: () => ({ ...real.useRename(), run: () => Promise.resolve(answer.next) }) };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

async function rename(): Promise<HTMLElement> {
  await renderPage(page, { path: '/account?sheet=name' });
  const d = await screen.findByRole('dialog', { name: strings['p.renameTitle'] }, { timeout: 8000 });
  const field = within(d).getByLabelText(strings['p.alias']);
  await userEvent.type(field, ' L.');
  await userEvent.click(within(d).getByRole('button', { name: strings['p.save'] }));
  return d;
}

describe('a refused display name', () => {
  it('a plain 400 says the name is not accepted, at the field', async () => {
    answer.next = { outcome: 'failed', status: 400 };
    const d = await rename();
    await waitFor(() => expect(d).toHaveTextContent(strings['p.nameRefused']));
    expect(d).not.toHaveTextContent(strings['err.generic']);
    expect(within(d).getByLabelText(strings['p.alias'])).toBeInvalid();
  });

  it('a server fault keeps the general banner', async () => {
    answer.next = { outcome: 'failed', status: 500, code: 'SERVER' };
    const d = await rename();
    await waitFor(() => expect(d).toHaveTextContent(strings['err.generic']));
    expect(d).not.toHaveTextContent(strings['p.nameRefused']);
  });
});
