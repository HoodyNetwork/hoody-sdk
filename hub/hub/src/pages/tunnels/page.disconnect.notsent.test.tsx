// Disconnect: a press that never left the browser (core: not_sent) reads "Not sent", never
// "Could not disconnect", and the list names the session with "try again". This route keeps only its own codes on a
// refusal, so the page cannot be driven there through the transport; the disconnect definition's run answers it here.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { resetChanges } from '@core/changes';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetDisconnectForTests } from './disconnect';
import page from './page';
import strings from './strings.en.json';

vi.mock('@core', async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  const real = core.defineMutation as unknown as (route: { method: string }, opts: unknown) => Record<string, unknown>;
  const defineMutation = (route: { method: string }, opts: unknown) => {
    const def = real(route, opts);
    if (route.method !== 'DELETE') return def;
    return { ...def, run: () => Promise.resolve({ outcome: 'not_sent', error: { kind: 'not_sent', notSent: true, code: 'OFFLINE' } }) };
  };
  return { ...core, defineMutation };
});

const GROUP1 = 'Session 4f2a9c… · from 203.0.113.x · 3 streams of 1024';

beforeEach(() => {
  // eslint-disable-next-line no-restricted-globals -- each test starts with no held change kept by an earlier one
  localStorage.removeItem('hub.v3.changes');
  resetChanges();
  resetDisconnectForTests();
});

describe('tunnels disconnect: not sent', () => {
  it('the row says Not sent, never Could not disconnect; the list says try again; Disconnect comes back', async () => {
    await renderPage(page, { state: 'disconnect' });
    const tb = await screen.findByRole('table', { name: strings.title });
    const row = () => (within(tb).getByText(GROUP1).closest('tr') as HTMLElement);
    await waitFor(() => expect(within(tb).getByText(GROUP1)).toBeInTheDocument());
    const menu = async () => {
      const s1 = within(tb).getByText('127.0.0.1:5432').closest('tr') as HTMLElement;
      await userEvent.click(within(s1).getByRole('button', { name: /actions|more/i }));
      return screen.findByRole('menuitem', { name: new RegExp(`^${strings['disc.menu']}`) });
    };
    await userEvent.click(await menu());
    const dlg = await screen.findByRole('alertdialog', { name: strings['disc.title'] });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['disc.action'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await within(row()).findByText(strings['disc.notSent'])).toBeInTheDocument();
    expect(within(row()).queryByText(strings['disc.failed'])).toBeNull();
    expect(screen.getByText('Session 4f2a9c…: not sent. Try again.')).toBeInTheDocument();
    expect(await menu()).toBeInTheDocument();
  });
});
