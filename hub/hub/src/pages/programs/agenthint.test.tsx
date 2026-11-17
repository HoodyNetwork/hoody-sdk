// "Use with your agent": the programs header offers it on the list, the Apps tab, with no computer shown
// and on a stopped computer.
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import page from './page';
import strings from './strings.en.json';

const HINT = 'Use with your agent';

describe('programs: agent hint', () => {
  it('the running list and the Apps tab offer it', async () => {
    const r = await renderPage(page);
    await screen.findByText(/\d+ programs on/);
    expect(screen.getByRole('button', { name: HINT })).toBeInTheDocument();
    r.unmount();
    await renderPage(page, { path: '/programs?tab=apps' });
    expect(await screen.findByRole('button', { name: HINT }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('no computer shown and a stopped computer keep it', async () => {
    const r = await renderPage(page, { computer: false });
    await screen.findByText(strings['st.title.noComputer']);
    expect(screen.getByRole('button', { name: HINT })).toBeInTheDocument();
    r.unmount();
    await renderPage(page);
    const fjord = fixtureWorld.computers.find((c) => c.name === 'fjord');
    if (!fjord) throw new Error('no fjord');
    act(() => {
      chooseComputer({ id: fjord.id, project_id: fjord.project_id, status: fjord.status });
    });
    await screen.findByText(strings['st.title.stopped']);
    expect(screen.getByRole('button', { name: HINT })).toBeInTheDocument();
  });
});
