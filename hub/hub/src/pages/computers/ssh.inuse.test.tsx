// A key can be on one computer only. The SSH key drawer says so up front, and when the API refuses a key that is
// already on another computer, the field says what happened and what to do, not just
// "Didn't go through".
import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHfixturefixturefixturefixturefixturefixtur ada@laptop';

describe('computers: one SSH key per computer', () => {
  it('a key already on another computer gets a field error that says what to do', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2&tab=connect', state: 'failedOps' });
    await userEvent.click(await screen.findByRole('button', { name: /^(Replace key|Add a key)$/ }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: interpolate(strings['sshd.title'], { name: 'borealis' }) });
    expect(d).toHaveTextContent(strings['sshd.lede']);
    await userEvent.type(within(d).getByRole('textbox', { name: strings['sshd.field'] }), KEY);
    await userEvent.click(within(d).getByRole('button', { name: /^(Replace key|Save key)$/ }));
    expect(await within(d).findByText(strings['sshd.inUse'], {}, { timeout: 4000 })).toBeInTheDocument();
    // The footer's alert is left out for this refusal, so focus goes to the field: a screen reader reads its error.
    const field = within(d).getByRole('textbox', { name: strings['sshd.field'] });
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field).toHaveAccessibleDescription(expect.stringContaining(strings['sshd.inUse']));
    // Typing a whole key a keystroke at a time takes most of the default 15 s on a loaded host.
  }, 40000);
});
