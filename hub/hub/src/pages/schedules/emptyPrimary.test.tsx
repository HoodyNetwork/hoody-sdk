// One primary a screen: on an empty Schedules page the empty state's New schedule is the accent button; the header keeps
// its own New schedule (adding one never depends on the list) but draws it quiet. With schedules listed it is the accent.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const accents = () => screen.getAllByRole('button', { name: strings['action.new'] }).filter((b) => b.getAttribute('data-variant') === 'primary');

describe('schedules: one primary New schedule', () => {
  it.each(['empty', 'partial-empty'] as const)('%s list: two New schedule buttons, one accent (the empty state\'s)', async (state) => {
    await renderPage(page, { state });
    await screen.findByText(state === 'empty' ? 'No schedules on atlas yet' : strings['st.incomplete']);
    expect(screen.getAllByRole('button', { name: strings['action.new'] }).length).toBeGreaterThanOrEqual(2);
    const accent = accents();
    expect(accent).toHaveLength(1);
    expect(accent[0]!.closest('header'), 'the accent one is not the page header\'s').toBeNull();
  });

  it('with schedules listed the header\'s New schedule is the accent', async () => {
    await renderPage(page, { state: 'many' });
    await screen.findByRole('table');
    const accent = accents();
    expect(accent).toHaveLength(1);
    expect(accent[0]!.closest('header')).not.toBeNull();
  });
});
