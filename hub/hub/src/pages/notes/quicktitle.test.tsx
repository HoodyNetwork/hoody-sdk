// New note > Title: the clock button inside the field's end names a quick note from the date and time.
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '@kit';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const open = async () => userEvent.click((await screen.findAllByRole('button', { name: strings['action.new'] }, { timeout: 8000 }))[0] as HTMLElement);
const named = (ms: number) => strings['new.quickTitle'].replace('{{when}}', formatDateTime(ms));

describe('New note quick title', () => {
  it('the button fills the title with the date and time, replacing what was typed, and Create adds that note', async () => {
    await renderPage(page, {});
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    await open();
    const field = (await screen.findByLabelText(strings['new.field'])) as HTMLInputElement;
    await userEvent.type(field, 'draft');
    const before = Date.now();
    await userEvent.click(screen.getByRole('button', { name: strings['new.quickTitleName'] }));
    const after = Date.now();
    expect([named(before), named(after)]).toContain(field.value);
    expect(field.value).not.toContain('draft');
    await userEvent.click(screen.getByRole('button', { name: strings['new.create'] }));
    // Created: the dialog goes (the page opens the note; create.opens.test.tsx).
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 8000 });
  });

  it('it clears an earlier refusal of the empty title', async () => {
    await renderPage(page, {});
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    await open();
    await userEvent.click(await screen.findByRole('button', { name: strings['new.create'] }));
    const field = (await screen.findByLabelText(strings['new.field'])) as HTMLInputElement;
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
    await userEvent.click(screen.getByRole('button', { name: strings['new.quickTitleName'] }));
    await waitFor(() => expect(field.getAttribute('aria-invalid')).not.toBe('true'));
  });

  it('while a send is out, the button cannot change the title', async () => {
    // A slow answer: the field stays on screen, disabled, while the create is out.
    await renderPage(page, { latency: 'slow' });
    await screen.findByText('Weekly plan', {}, { timeout: 15000 }); // the computer's place for a new note is read
    await open();
    await userEvent.type(await screen.findByLabelText(strings['new.field'], {}, { timeout: 15000 }), 'Q4 plan');
    expect(screen.getByRole('button', { name: strings['new.quickTitleName'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['new.create'] }));
    expect(screen.getByLabelText(strings['new.field'])).toBeDisabled();
    expect(screen.queryByRole('button', { name: strings['new.quickTitleName'] })).toBeNull();
  });

  it('a held create shows its name and no field, and no quick-title button', async () => {
    await renderPage(page, { state: 'createPending' });
    await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
    await open();
    await userEvent.type(await screen.findByLabelText(strings['new.field']), 'Q4 plan');
    await userEvent.click(screen.getByRole('button', { name: strings['new.create'] }));
    await screen.findByRole('button', { name: 'Check again' }, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: strings['new.quickTitleName'] })).toBeNull();
  });
});
