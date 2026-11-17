// Vitest: the New schedule drawer's form step and a script row's upcoming runs.
// - The form's title names what is made (a command schedule) and differs from the back arrow, named "Back to" the chooser
//   it returns to: the header never reads "New schedule" twice.
// - Picking Command puts focus in Name, so typing goes there (not on the drawer or its resize handle).
// - A row that knows only its next run says "Next run", never "Next 5 runs" over one line.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import defaultFixtures from './fixtures';
import { model, type RawSchedules } from './logic';
import page from './page';
import strings from './strings.en.json';

async function openCommandForm() {
  await renderPage(page);
  await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
  await screen.findByText(strings['new.pick']);
  await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['new.cmd']) }));
  await screen.findByLabelText(strings['e.cmd']);
  return screen.getByRole('dialog');
}

describe('New schedule: the form step', () => {
  it('the title and the back arrow say different things', async () => {
    const dialog = await openCommandForm();
    expect(within(dialog).getByRole('button', { name: strings['new.back'] })).toBeInTheDocument();
    // The drawer is named by its title.
    expect(dialog).toHaveAccessibleName(strings['ed.title.new']);
    expect(strings['ed.title.new']).not.toBe(strings['new.title']);
  });

  it('Name has focus after picking Command', async () => {
    await openCommandForm();
    const name = screen.getByLabelText(strings['e.name']);
    await waitFor(() => expect(document.activeElement).toBe(name));
    await userEvent.keyboard('nightly');
    expect(name).toHaveValue('nightly');
  });

  it('an untouched form says what Create waits for: the command', async () => {
    const dialog = await openCommandForm();
    expect(within(dialog).getByRole('button', { name: strings['ed.create'] })).toBeDisabled();
    expect(within(dialog).getByText(strings['e.badCmd'])).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(strings['e.cmd']), '/usr/local/bin/backup.sh');
    await waitFor(() => expect(within(dialog).queryByText(strings['e.badCmd'])).toBeNull());
  });
});

describe('Upcoming runs', () => {
  it('a script row that knows only its next run titles the section by that count', async () => {
    const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
    const row = model(raw).rows.find((r) => r.src === 'exec' && r.upcoming.length === 1);
    expect(row).toBeDefined();
    await renderPage(page, { path: `/schedules?sel=${encodeURIComponent(row!.key)}` });
    expect(await screen.findByRole('heading', { name: strings['detail.nextRuns_one'] })).toBeInTheDocument();
    expect(screen.queryByText('Next 5 runs')).toBeNull();
  });

  it('a row with five upcoming runs keeps "Next 5 runs"', async () => {
    const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
    const row = model(raw).rows.find((r) => r.upcoming.length === 5);
    expect(row).toBeDefined();
    await renderPage(page, { path: `/schedules?sel=${encodeURIComponent(row!.key)}` });
    expect(await screen.findByRole('heading', { name: 'Next 5 runs' })).toBeInTheDocument();
  });
});
