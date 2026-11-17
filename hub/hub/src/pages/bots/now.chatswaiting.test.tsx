// Vitest: a Bot card's "now" line. Groups asking a chat app to let them in wait on the person (Let in), so the line says
// so even while the Bot is working, waiting or paused; only a locked Bot says it is locked first.
import { renderPage, screen, within } from '@app/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import strings from './strings.en.json';
import page from './page';

type Row = Record<string, unknown>;
type State = { bots?: { data: Row[] } } & Record<string, unknown>;
vi.mock('./fixtures', async (importOriginal) => {
  const real = (await importOriginal<object>()) as { default: { default: string; states: Record<string, State> } };
  const base = real.default.states.chatsWaiting as State;
  const rows = base.bots?.data ?? [];
  const as = (patch: Row): State => ({ ...base, bots: { data: rows.map((r) => ((r.chatsWaiting as number) > 0 ? { ...r, ...patch } : r)) } });
  return {
    ...real,
    default: { ...real.default, states: { ...real.default.states, waitWorking: as({ status: 'working' }), waitWaiting: as({ status: 'waiting' }), waitPaused: as({ status: 'paused' }), waitLocked: as({ status: 'working', locked: true }) } },
  };
});

beforeAll(async () => {
  await import('./view');
}, 30000);

const chief = async () => within(await screen.findByRole('table', { name: strings.title })).findByRole('row', { name: /Chief/ });

describe('the card\'s now line, with groups waiting', () => {
  it.each(['waitWorking', 'waitWaiting', 'waitPaused'])('%s: says the groups wait', async (state) => {
    await renderPage(page, { state });
    expect((await chief()).textContent).toContain('2 groups waiting');
  });

  it('a locked Bot says it is locked first', async () => {
    await renderPage(page, { state: 'waitLocked' });
    const row = await chief();
    expect(row.textContent).toContain(strings['now.locked']);
    expect(row.textContent).not.toContain('2 groups waiting');
  });
});
