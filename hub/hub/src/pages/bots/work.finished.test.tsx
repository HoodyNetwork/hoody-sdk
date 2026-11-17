// Vitest: finished tasks on the Work tab. Closed by default (a count and a button), read only when opened, listed without a Stop
// action, the newest first with More reaching the older ones; the count comes from the agent, not from the open list.
// The page order and the reads are proved in work.finished.live.test.tsx.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state?: string, extra = '') => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work${extra}` });
const showBtn = (n: number) => screen.findByRole('button', { name: strings['work.showFinished'].replace('{{count}}', String(n)) });
const table = async () => within(await screen.findByRole('table', { name: strings['work.finishedTitle'] }));

describe('finished tasks', () => {
  it('are a count and a button until asked for, and not listed among the running tasks', async () => {
    await open();
    await showBtn(1);
    expect(screen.queryByText('Check dependencies')).toBeNull();
  });

  it('opening lists them as finished with nothing to stop, writes finished=1, and hiding them goes back', async () => {
    const { router } = await open();
    await userEvent.click(await showBtn(1));
    const t = await table();
    const row = await t.findByRole('row', { name: /Check dependencies/ });
    expect(within(row).getByText(strings['work.state.closed'])).toBeInTheDocument();
    expect(within(row).queryAllByRole('button')).toHaveLength(0);
    expect((router.state.location.search as Record<string, unknown>).finished).toBe('1');
    await userEvent.click(screen.getByRole('button', { name: strings['work.hideFinished'] }));
    await waitFor(() => expect(screen.queryByText('Check dependencies')).toBeNull());
    expect((router.state.location.search as Record<string, unknown>).finished).toBeUndefined();
  });

  it('opens from the address', async () => {
    await open(undefined, '&finished=1');
    expect(await screen.findByText('Check dependencies')).toBeInTheDocument();
  });

  it('the button counts the finished tasks by the agent\'s count, even when the list of running tasks holds none of them', async () => {
    await open('manyFinished');
    await showBtn(25);
  });

  it('lists the newest first and More reads the next older page until none is left', async () => {
    await open('manyFinished', '&finished=1');
    const t = await table();
    await t.findByText('Finished task 25');
    const rows = () => t.getAllByRole('row').filter((r) => /Finished task/.test(r.textContent ?? ''));
    expect(rows()).toHaveLength(10);
    expect(rows()[0]?.textContent).toMatch(/Finished task 25/);
    await userEvent.click(screen.getByRole('button', { name: strings['work.more'] }));
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['work.more'] })).toBeNull());
  });

  it('a count that cannot be read still offers the finished tasks, without a number', async () => {
    await open('finishedCountLost');
    expect(await screen.findByRole('button', { name: strings['work.showFinishedAny'] })).toBeInTheDocument();
  });

  it('has no button when nothing finished', async () => {
    await open('noFinished');
    await screen.findByRole('table', { name: strings['work.title'] });
    expect(screen.queryByRole('button', { name: /Show finished tasks/ })).toBeNull();
  });
});
