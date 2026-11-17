// Vitest: the dialog after a password change needs its one action (every session ended, so sign in again). It is an alert
// dialog that opens with focus on itself, so its title and sentence are read first; Sign in again is the next Tab, never
// pressed by an Enter meant for something else.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { bootFixtureCore } from '@core';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

vi.mock('./parts/PasswordSheet', () => ({
  PasswordSheet: ({ onChanged }: { onChanged: () => void }) => {
    useEffect(() => onChanged(), [onChanged]);
    return null;
  },
}));

beforeEach(() => {
  bootFixtureCore();
});

describe('the password-changed dialog', () => {
  it('is an alert dialog that opens on itself, with Sign in again next', async () => {
    await renderPage(page, { path: '/account?sheet=password' });
    const d = await screen.findByRole('alertdialog', { name: strings['pw.doneTitle'] }, { timeout: 8000 });
    await waitFor(() => expect(document.activeElement).toBe(d));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: strings['pw.signIn'] }));
  });
});
