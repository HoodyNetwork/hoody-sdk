// Vitest: Last result widens to 346px only while a listed row of this computer shows a
// held note (working or may have gone through). Held changes are kept across computers, and a held change of a row
// that is not listed shows no note.
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

afterEach(() => opsStore.reset());

const wide = () => [...document.querySelectorAll('col')].some((c) => (c as HTMLElement).style.width === '346px');

describe('the Last result width', () => {
  it('widens for a listed row whose change may have gone through, and not for held changes it does not show', async () => {
    await renderPage(page, { state: 'act-pending' });
    const name = strings['action.pauseName'].replace('{{name}}', 'Nightly backup');
    await userEvent.click((await screen.findAllByRole('switch', { name }))[0]!);
    await waitFor(() => expect(screen.getAllByText('May have gone through').length).toBeGreaterThan(0));
    expect(wide()).toBe(true);
    const [key, op] = [...opsStore.snapshot()][0]!;
    const here = key.split('\u0001')[0]!;
    // The same change, held for another computer.
    act(() => {
      opsStore.reset();
      opsStore.set(`another-computer\u0001${key.split('\u0001')[1]}`, op);
    });
    expect(wide()).toBe(false);
    // A held change of a schedule this computer does not list.
    act(() => {
      opsStore.reset();
      opsStore.set(`${here}\u0001cron:user/not-listed`, op);
    });
    expect(wide()).toBe(false);
    // A definite outcome kept until dismissed (failed, not sent) is one short word and a close icon: the narrow width
    // holds it (measured at 1440: whole in 150px).
    for (const status of ['failed', 'refused'] as const) {
      act(() => {
        opsStore.reset();
        opsStore.set(key, { ...op, status });
      });
      expect(wide()).toBe(false);
    }
    // A held save shows in its editor, not in a row.
    act(() => {
      opsStore.reset();
      opsStore.set(`${here}\u0001save:new`, { act: 'save', status: 'unknown' });
    });
    expect(wide()).toBe(false);
  });
});
