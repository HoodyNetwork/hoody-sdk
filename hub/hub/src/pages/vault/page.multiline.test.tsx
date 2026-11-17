// Vitest: the Value field takes a secret of several lines. A pasted key or certificate
// reaches the PUT body byte for byte, LF or CRLF line ends, plain or encrypted; while hidden the page never shows it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';
import { decrypt } from './crypto';
import { resetChanges } from '@core/changes';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const PEM = fake('-----BEGIN ', 'PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nk3Zq9pLmXw==\n-----END PRIVATE KEY-----\n');
const puts = () => requestLog.filter((r) => r.method === 'PUT');
const lastValue = () => (puts().at(-1)!.body as { value: string }).value;
const valueBox = () => screen.getByRole('textbox', { name: strings['edit.value'] }) as HTMLTextAreaElement;
const paste = async (text: string) => {
  await act(async () => {
    expect(fireEvent.paste(valueBox(), { clipboardData: { getData: (k: string) => (k === 'text/plain' ? text : '') } })).toBe(false);
  });
};

describe('a multi-line value', () => {
  it('New: a pasted PEM key is sent with its line ends, and is never on the page while hidden', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'tls-key');
    expect(valueBox().tagName).toBe('TEXTAREA');
    await paste(PEM);
    expect(document.body.innerHTML).not.toContain('MIIEvQ');
    expect(valueBox().value.split('\n')).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(lastValue()).toBe(PEM);
  });

  it('CRLF line ends reach the request unchanged', async () => {
    const crlf = PEM.replace(/\n/g, '\r\n');
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'tls-crlf');
    await paste(crlf);
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(lastValue()).toBe(crlf);
  });

  it('encrypted: the envelope opens to the exact pasted bytes', async () => {
    const crlf = PEM.replace(/\n/g, '\r\n');
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'tls-enc');
    await paste(crlf);
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) }));
    await userEvent.type(screen.getByLabelText(strings['edit.password']), 'correct horse 9');
    await userEvent.type(screen.getByLabelText(strings['edit.repeat']), 'correct horse 9');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 15000 });
    expect(lastValue()).not.toContain('MIIEvQ');
    expect(await decrypt(lastValue(), 'correct horse 9')).toBe(crlf);
  });

  it('Replace uses the same multi-line field', async () => {
    await renderPage(page, { path: '/vault?sel=deploy.notes&edit=replace:deploy.notes' });
    await waitFor(() => expect(valueBox().tagName).toBe('TEXTAREA'));
    await paste(PEM);
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(lastValue()).toBe(PEM);
  });
});
