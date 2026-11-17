// Vitest: Export vault from the page. The More menu opens it; Encrypted is the default and
// takes a password twice; Readable asks a danger confirm before anything is read; the passwords are never prefilled and
// clear on every press, mode change and close; a file with entries left out waits for Save file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { decrypt } from './crypto';
import type * as ExportModule from './exportVault';
import { requestLog, resetFixtureVaults } from './fixtures';

const saved = vi.hoisted(() => ({ files: [] as { text: string; file: string }[], leaveOut: null as string | null, reject: false, runs: 0 }));
vi.mock('./exportVault', async (orig) => {
  const m = await orig<typeof ExportModule>();
  return {
    ...m,
    saveExport: (text: string, file: string) => saved.files.push({ text, file }),
    // leaveOut: the run reports that entry as unreadable (the read loop's own arm is in exportVault.test.ts).
    runExport: async (...a: Parameters<typeof m.runExport>) => {
      saved.runs++;
      // reject: the run throws (a failure the run itself did not turn into a result).
      if (saved.reject) throw new Error('unexpected');
      const r = await m.runExport(...a);
      if (!r.ok || saved.leaveOut === null) return r;
      const f = JSON.parse(r.text) as Record<string, unknown>;
      delete f[saved.leaveOut];
      return { ...r, text: JSON.stringify(f, null, 2), count: r.count - 1, failed: [saved.leaveOut] };
    },
  };
});

const PW = 'page-export-pw';
const valueReads = () => requestLog.filter((r) => r.method === 'GET' && r.path.startsWith('/vault/keys/'));

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  saved.files.length = 0;
  saved.leaveOut = null;
  saved.reject = false;
  saved.runs = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function openExport() {
  await renderPage(page, { path: '/vault' });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.export'] }));
  return screen.findByRole('alertdialog');
}
const pwFields = (dlg: HTMLElement) => [
  within(dlg).getByLabelText(strings['export.password']) as HTMLInputElement,
  within(dlg).getByLabelText(strings['export.repeat']) as HTMLInputElement,
];

describe('Export vault', () => {
  it('the More menu opens it: Encrypted by default, both password fields empty', async () => {
    const dlg = await openExport();
    expect(dlg).toHaveTextContent('Export Personal');
    expect(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.encrypted']) })).toBeChecked();
    expect(dlg).toHaveTextContent(strings['export.encryptedDesc']);
    for (const f of pwFields(dlg)) expect(f.value).toBe('');
    expect(valueReads()).toHaveLength(0);
  });

  it('a missing or mismatched password reads nothing and clears both fields', async () => {
    const dlg = await openExport();
    const go = within(dlg).getByRole('button', { name: strings['export.confirm'] });
    await userEvent.click(go);
    expect(dlg).toHaveTextContent(strings['password.required']);
    const [a, b] = pwFields(dlg);
    await userEvent.type(a!, PW);
    await userEvent.type(b!, PW + 'x');
    await userEvent.click(go);
    expect(dlg).toHaveTextContent(strings['password.mismatch']);
    for (const f of pwFields(dlg)) expect(f.value).toBe('');
    expect(valueReads()).toHaveLength(0);
    expect(saved.files).toHaveLength(0);
  });

  it('Encrypted: one file of envelopes under the password, named for the realm; the page says what was saved', async () => {
    const dlg = await openExport();
    const [a, b] = pwFields(dlg);
    await userEvent.type(a!, PW);
    await userEvent.type(b!, PW);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['export.confirm'] }));
    await waitFor(() => expect(saved.files).toHaveLength(1), { timeout: 15_000 });
    const { text, file } = saved.files[0]!;
    expect(file).toMatch(/^vault-personal-\d{4}-\d{2}-\d{2}\.json$/);
    const f = JSON.parse(text) as Record<string, { value: string }>;
    expect(Object.keys(f)).toEqual(['db-password', 'deploy.notes', 'github-token']);
    expect(await decrypt(f['github-token']!.value, PW)).toBe('fixture-token-value-000000000001');
    expect(text).not.toContain(PW);
    expect(JSON.stringify(requestLog)).not.toContain(PW);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const done = await screen.findByText(new RegExp(file.replace(/[.]/g, '\\.')));
    expect(done).toHaveTextContent('3 entries');
    // The browser was handed the file; whether it was saved is not known here.
    expect(done).toHaveTextContent(/^Download started/);
    expect(done).not.toHaveTextContent(/saved/i);
    expect(document.body.textContent).not.toContain('fixture-token-value');
  }, 30_000);

  it('Readable asks a danger confirm first: Cancel there reads nothing', async () => {
    const dlg = await openExport();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }));
    expect(within(dlg).queryByLabelText(strings['export.password'])).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['export.confirm'] }));
    const danger = await screen.findByRole('alertdialog', { name: strings['export.readableTitle'] });
    expect(danger).toHaveTextContent(strings['export.readableBody']);
    await userEvent.click(within(danger).getByRole('button', { name: /cancel/i }));
    expect(valueReads()).toHaveLength(0);
    expect(saved.files).toHaveLength(0);
  });

  it('Readable, confirmed: the values as stored', async () => {
    const dlg = await openExport();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['export.confirm'] }));
    const danger = await screen.findByRole('alertdialog', { name: strings['export.readableTitle'] });
    await userEvent.click(within(danger).getByRole('button', { name: strings['export.readableConfirm'] }));
    await waitFor(() => expect(saved.files).toHaveLength(1));
    expect(JSON.parse(saved.files[0]!.text)['github-token']).toEqual({ value: 'fixture-token-value-000000000001' });
  });

  it('switching to Readable and back clears what was typed', async () => {
    const dlg = await openExport();
    const [a] = pwFields(dlg);
    await userEvent.type(a!, PW);
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }));
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.encrypted']) }));
    for (const f of pwFields(dlg)) expect(f.value).toBe('');
  });

  it('no secure context: Encrypted says why and cannot start; Readable still can', async () => {
    vi.stubGlobal('isSecureContext', false);
    const dlg = await openExport();
    expect(dlg).toHaveTextContent('needs a secure connection');
    expect(within(dlg).queryByLabelText(strings['export.password'])).toBeNull();
    expect(within(dlg).getByRole('button', { name: strings['export.confirm'] })).toBeDisabled();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }));
    expect(within(dlg).getByRole('button', { name: strings['export.confirm'] })).toBeEnabled();
  });

  it('an entry that cannot be read: the dialog says so and waits for Save file', async () => {
    saved.leaveOut = 'deploy.notes';
    const dlg = await openExport();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['export.confirm'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: strings['export.readableTitle'] })).getByRole('button', { name: strings['export.readableConfirm'] }));
    const again = await screen.findByRole('alertdialog');
    expect(await within(again).findByText(/1 entry could not be read and is not in the file\. Not in the file: deploy\.notes\./)).toBeTruthy();
    // The left-out entry is named (its name only).
    expect(again).toHaveTextContent('deploy.notes');
    expect(saved.files).toHaveLength(0);
    await userEvent.click(within(again).getByRole('button', { name: strings['export.save'] }));
    expect(saved.files).toHaveLength(1);
    expect(Object.keys(JSON.parse(saved.files[0]!.text))).toEqual(['db-password', 'github-token']);
  });

  it('closing while it reads saves nothing', async () => {
    await renderPage(page, { path: '/vault', state: 'slowRead' });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.export'] }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['export.confirm'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: strings['export.readableTitle'] })).getByRole('button', { name: strings['export.readableConfirm'] }));
    await waitFor(() => expect(valueReads().length).toBeGreaterThan(0));
    await userEvent.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 1500));
    expect(saved.files).toHaveLength(0);
    expect(valueReads().length).toBeLessThan(3);
  }, 15_000);
  it('the Readable confirm pressed twice before a render starts one run, and closing stops it', async () => {
    await renderPage(page, { path: '/vault', state: 'slowRead' });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.export'] }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['export.confirm'] }));
    const ok = within(await screen.findByRole('alertdialog', { name: strings['export.readableTitle'] })).getByRole('button', { name: strings['export.readableConfirm'] });
    act(() => {
      ok.click();
      ok.click();
    });
    await waitFor(() => expect(valueReads().length).toBeGreaterThan(0));
    expect(saved.runs).toBe(1);
    await userEvent.keyboard('{Escape}');
    const after = valueReads().length;
    await new Promise((r) => setTimeout(r, 1500));
    expect(valueReads().length).toBeLessThanOrEqual(after + 1);
    expect(saved.files).toHaveLength(0);
  }, 15_000);

  it('a run that throws ends with a fixed message, and Export works again', async () => {
    saved.reject = true;
    const dlg = await openExport();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp('^' + strings['export.readable']) }));
    const go = within(dlg).getByRole('button', { name: strings['export.confirm'] });
    await userEvent.click(go);
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: strings['export.readableTitle'] })).getByRole('button', { name: strings['export.readableConfirm'] }));
    const again = await screen.findByRole('alertdialog');
    expect(await within(again).findByText(strings['export.failed'])).toBeTruthy();
    expect(again).not.toHaveTextContent('unexpected');
    saved.reject = false;
    await userEvent.click(within(again).getByRole('button', { name: strings['export.confirm'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: strings['export.readableTitle'] })).getByRole('button', { name: strings['export.readableConfirm'] }));
    await waitFor(() => expect(saved.files).toHaveLength(1));
  });
});
