// Vitest: the On column never leaves a cell empty without a reason. A script schedule has no switch here (it is turned
// on and off in Scripts), so its cell carries a mark that says so. And a signed-out agent hides only its loops: the
// sentence above the list names loops, while the agent timers it still lists stay shown beneath it.
import { renderPage, screen, waitFor, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import defaultFixtures from './fixtures';
import { model, type RawSchedules } from './logic';
import page from './page';
import strings from './strings.en.json';

const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
const rows = model(raw).rows;
const scriptRow = rows.find((r) => r.ref.script === 'default/1/queue-drain.ts')!;
const commandRow = rows.find((r) => r.src === 'cron' && r.can.pause)!;
const rowEl = (key: string) => document.querySelector<HTMLElement>(`tbody tr[data-row-id="${key}"]`);

describe('schedules: the On column', () => {
  it('a script row shows a mark saying it is turned on and off in Scripts, and no switch', async () => {
    expect(typeof strings['on.inScripts']).toBe('string');
    await renderPage(page, {});
    await waitFor(() => expect(rowEl(scriptRow.key)).not.toBeNull());
    const r = rowEl(scriptRow.key)!;
    expect(within(r).getByRole('img', { name: strings['on.inScripts'] })).toBeTruthy();
    expect(within(r).queryByRole('switch')).toBeNull();
  });

  it('a command row keeps its switch and has no such mark', async () => {
    await renderPage(page, {});
    await waitFor(() => expect(rowEl(commandRow.key)).not.toBeNull());
    const r = rowEl(commandRow.key)!;
    expect(within(r).getByRole('switch')).toBeTruthy();
    expect(within(r).queryByRole('img', { name: strings['on.inScripts'] })).toBeNull();
  });
});

describe('schedules: a signed-out agent', () => {
  it('the sentence names only the loops it hides, while an agent timer is still listed', async () => {
    expect(strings['n.agentSignedOut']).toMatch(/\bloops\b/);
    expect(strings['n.agentSignedOut']).not.toMatch(/\bschedules\b/);
    await renderPage(page, { state: 'signed-out' });
    expect(await screen.findByText(strings['n.agentSignedOut'])).toBeTruthy();
    await waitFor(() => expect(document.querySelector('tbody tr[data-row-id^="timer:"]')).not.toBeNull());
  });
});
