// Vitest: "Hide task updates" on the Activity log. Task reports, ended tasks and stops are the updates; the conversation and the
// other runtime lines stay. The choice is in the address (tasks=hide), so a reload or a shared link keeps it.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { TASK_UPDATE_KINDS, isTaskUpdate } from './logic';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (extra = '') => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}${extra}` });
const log = async () => within(await screen.findByRole('list', { name: strings['activity.title'] }));
const REPORT = /The deploy failed because the build step ran out of memory/;
const ENDED = /Task "Read deploy log" finished/;

describe('which lines are task updates', () => {
  it('task reports, ended tasks and stops; never the conversation or a failure', () => {
    expect([...TASK_UPDATE_KINDS].sort()).toEqual(['gone', 'report', 'stop']);
    for (const k of ['report', 'gone', 'stop'] as const) expect(isTaskUpdate(k)).toBe(true);
    for (const k of ['user', 'bot', 'note', 'provider', 'error'] as const) expect(isTaskUpdate(k)).toBe(false);
  });
});

describe('the Activity log', () => {
  it('shows every line until the box is ticked', async () => {
    await open();
    const l = await log();
    expect((await l.findAllByText(REPORT)).length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: strings['activity.hideTasks'] })).not.toBeChecked();
    expect(screen.queryByText(/task updates? hidden/)).toBeNull();
  });

  it('ticking it hides the reports and ended tasks, keeps the rest, says how many, and writes tasks=hide', async () => {
    const { router } = await open();
    await userEvent.click(await screen.findByRole('checkbox', { name: strings['activity.hideTasks'] }));
    await waitFor(() => expect(screen.queryAllByText(REPORT)).toHaveLength(0));
    expect(screen.queryAllByText(ENDED)).toHaveLength(0);
    const l = await log();
    expect(l.getAllByText(/Can you check why the last deploy/).length).toBeGreaterThan(0);
    expect(l.getAllByText(/The model provider stopped the answer/).length).toBeGreaterThan(0);
    expect(screen.getByText('3 task updates hidden')).toBeInTheDocument();
    expect((router.state.location.search as Record<string, unknown>).tasks).toBe('hide');
  });

  it('opens already hidden from the address, and unticking brings the lines back', async () => {
    const { router } = await open('&tasks=hide');
    const box = await screen.findByRole('checkbox', { name: strings['activity.hideTasks'] });
    expect(box).toBeChecked();
    expect(screen.queryAllByText(REPORT)).toHaveLength(0);
    await userEvent.click(box);
    expect((await screen.findAllByText(REPORT)).length).toBeGreaterThan(0);
    expect((router.state.location.search as Record<string, unknown>).tasks).toBeUndefined();
  });
});
