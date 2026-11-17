// A link that opens New realm on a later step (a reload, a shared link) while the realm names are still being read:
// a name typed before the read ends must not carry the wizard past Computers once the read lands. The wizard stays
// on the name step, the URL drops the step, and Next leads to Computers as on any other visit.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { resetRealmsWorld } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const T = 12000;

beforeEach(() => resetRealmsWorld());

describe('New realm opened on a later step while the names are read', () => {
  it('a name typed before the read ends stays on the name step; Next then goes to Computers', async () => {
    const { router } = await renderPage(page, { path: '/realms/new?step=review', latency: 'slow' });
    const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
    // The names are still out: the field's help line says so.
    expect(screen.getByText(strings['names.reading'])).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'Studio' } });
    expect(screen.getByText(strings['names.reading'])).toBeInTheDocument();
    // The read lands.
    await waitFor(() => expect(screen.queryByText(strings['names.reading'])).toBeNull(), { timeout: T });
    const strip = screen.getByRole('navigation', { name: kitStrings['wizard.steps'] });
    const current = () => within(strip).getAllByRole('listitem').findIndex((li) => li.getAttribute('aria-current') === 'step');
    expect(current()).toBe(0);
    await waitFor(() => expect(router.state.location.href).not.toContain('step='), { timeout: T });
    expect(current()).toBe(0);
    expect(screen.getByLabelText(strings['name.label'])).toHaveValue('Studio');
    await userEvent.click(screen.getByRole('button', { name: strings.next }));
    await waitFor(() => expect(current()).toBe(1), { timeout: T });
    expect(router.state.location.href).toContain('step=computers');
  }, 40000);
});
