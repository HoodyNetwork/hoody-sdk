// Vitest: what the Bots list shows after Resume of a computer's paused Bots. One that may have gone through says so, names the
// computer, offers Check again (a read) and a warned Stop tracking; a further press sends nothing. One that did not go through,
// or was not sent, says that and closes. The press carries the paused count it saw.
import { act, renderPage as renderPageRaw, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localSetting } from '@core';
import page from './page';
import strings from './strings.en.json';
import kit from '@kit/strings.en.json';
import ks from '@kit/states/strings.en.json';
import K from '@kit/data/GroupNotes.strings.en.json';

// The page's changes as sent; a Resume answers what the test sets (fixture mode sends a change through the source's mutation).
const W = vi.hoisted(() => ({ sent: [] as Array<{ key: string; vars: unknown }>, answer: 'done' as string }));
vi.mock('@app/fixtures', async (orig) => {
  const fx = await orig<typeof Fixtures>();
  return {
    ...fx,
    fixtureSource: (pageId: string) => {
      const real = fx.fixtureSource(pageId);
      return {
        ...real,
        useMutation: <T, V = void>(key: string) => {
          const mu = real.useMutation<T, V>(key);
          return {
            ...mu,
            mutateAsync: (vars: V, o?: unknown) => {
              W.sent.push({ key, vars });
              if (key === 'botAction') return Promise.resolve({ outcome: W.answer });
              return (mu.mutateAsync as (a: V, b?: unknown) => Promise<unknown>)(vars, o);
            },
          } as typeof mu;
        },
      };
    },
  };
});
beforeEach(() => {
  W.sent = [];
  W.answer = 'done';
});
const present = () => localSetting('hub.v3.table.present.bots');
const renderPage = async (...a: Parameters<typeof renderPageRaw>) => {
  const r = await renderPageRaw(...a);
  await act(async () => void present().set('list'));
  return r;
};
afterEach(() => void present().set(null));

const paused2 = strings['notice.paused_other'].replace('{{count}}', '2');
const resumeOn = (name: string) => screen.getByRole('button', { name: K['groupNotes.actionOn'].replace('{{action}}', strings['notice.resume']).replace('{{name}}', name) });
const resumes = () => W.sent.filter((x) => x.key === 'botAction');

describe('Resume on the Bots list', () => {
  it('carries the paused count the press saw', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused2);
    await userEvent.click(resumeOn('sunny-red-lemur'));
    await waitFor(() => expect(resumes().map((x) => x.vars)).toEqual([{ action: 'resume', computerId: 'c-atlas', suspended: 2 }]));
  });

  it('one that may have gone through names its computer, offers Check again and a warned Stop tracking; another press sends nothing', async () => {
    W.answer = 'pending';
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused2);
    await userEvent.click(resumeOn('sunny-red-lemur'));
    await screen.findByText(strings['notice.resumeHeld'].replace('{{name}}', 'sunny-red-lemur'));
    expect(screen.getByRole('button', { name: kit['outcome.pending.check'] })).toBeInTheDocument();
    // A further press is refused here, unsent.
    await userEvent.click(resumeOn('sunny-red-lemur'));
    expect(resumes()).toHaveLength(1);
    // Stop tracking asks first, then frees it.
    await userEvent.click(screen.getByRole('button', { name: ks['err.stopTracking'] }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(strings['start.dismissBody'])).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['start.dismissGo'] }));
    await waitFor(() => expect(screen.queryByText(strings['notice.resumeHeld'].replace('{{name}}', 'sunny-red-lemur'))).toBeNull());
    expect(resumes()).toHaveLength(1);
  });

  it('one that did not go through says so, and closes', async () => {
    W.answer = 'failed';
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused2);
    await userEvent.click(resumeOn('sunny-red-lemur'));
    await screen.findByText(kit['outcome.failed.title']);
    await userEvent.click(screen.getByRole('button', { name: ks['err.hide'] }));
    await waitFor(() => expect(screen.queryByText(kit['outcome.failed.title'])).toBeNull());
  });

  it('one that was not sent says nothing was sent', async () => {
    W.answer = 'not_sent';
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused2);
    await userEvent.click(resumeOn('sunny-red-lemur'));
    await screen.findByText(kit['outcome.notSent.title']);
  });
});
