// Where an SSH key is asked for, the page says a key is only for your own SSH client and that the
// terminal in your browser needs none: in the Connect tab's SSH section and in the SSH key drawer.
// (The Ports tab has no SSH key row: the key is set from Connect or the ⋯ menu's drawer.)
import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';

const NO_KEY = /terminal in your browser needs no key/;
const OWN = /your own (SSH client|terminal)/;

describe('computers: an SSH key is only for your own client', () => {
  it('the SSH section and the key drawer both say the browser terminal needs no key', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2&tab=connect' });
    await screen.findByRole('heading', { name: strings['ssh.title'] }, { timeout: 8000 });
    const direct = document.getElementById('connect-ssh') as HTMLElement;
    expect(direct).toHaveTextContent(NO_KEY);
    await userEvent.click(await screen.findByRole('button', { name: /^(Replace key|Add a key)$/ }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: interpolate(strings['sshd.title'], { name: 'borealis' }) });
    expect(within(d).getByText(strings['sshd.lede'])).toHaveTextContent(NO_KEY);
    expect(direct).toHaveTextContent(OWN);
    expect(within(d).getByText(strings['sshd.lede'])).toHaveTextContent(OWN);
  }, 40000);
});
