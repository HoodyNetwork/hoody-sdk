// Vitest: Import entries from the vault page's More menu: paste or a .env file → a preview of names only →
// Skip (default) or Overwrite per name that is here already → one savePut per row → a read-back by write id. Every value
// below carries MARK, and the leak sweep after each step proves MARK is nowhere but the vault write itself: not in the
// page (text, attributes, field values), a toast, the URL, browser storage, core's held changes, the query or mutation
// cache, or any console call.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness: the page mounted again on the same router (leaving the page)
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness: the page mounted again on the same router (leaving the page)
import { RouterProvider } from '@tanstack/react-router';
import { heldChanges, queryClient } from '@core';
import { bump, capture, resetCore, setRealm, startLoggingOut } from '@core/ctx';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import errWords from '@kit/states/strings.en.json';
import kitWords from '@kit/strings.en.json';
import formWords from '@kit/forms/forms.strings.en.json';
import { decrypt } from './crypto';
import { LOCK, keepLeftImportReport, leftImportReportHeldForTests, takeLeftImportReports } from './data';
import { REALM_A, REALM_B, fixtureAdd, fixtureEntry, importScript, requestLog, resetFixtureVaults } from './fixtures';
import { importHeldForTests } from './importEnv';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const toasts = vi.hoisted(() => ({ shown: [] as unknown[] }));
vi.mock('../../kit/states/Toast', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const real = m.showToast as (c: unknown, timeout?: number) => string;
  return {
    ...m,
    showToast: (c: unknown, timeout?: number) => {
      toasts.shown.push(c);
      return real(c, timeout);
    },
  };
});

const MARK = 'QZMARK7';
/** The import shows its result in the dialog, never as a toast (inline first; Toast.calls `quiet`).
 *  Every toast the test saw: beforeEach clears the list and each test drives only the import flow, so any toast is the
 *  import's (no filter on copy). */
const importToasts = () => [...toasts.shown];
const v = (n: number | string) => `${MARK}-value-${n}`;
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'group', 'groupCollapsed'] as const;
let spies: MockInstance[] = [];
let router: Awaited<ReturnType<typeof renderPage>>['router'] | null = null;
let rendered: Awaited<ReturnType<typeof renderPage>> | null = null;

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  toasts.shown.length = 0;
  vi.stubGlobal('isSecureContext', true);
  spies = CONSOLE.map((m) => vi.spyOn(console, m));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  router = null;
  rendered = null;
});

const text = (x: unknown): string => {
  try {
    return typeof x === 'string' ? x : (JSON.stringify(x) ?? String(x));
  } catch {
    return String(x);
  }
};

/** MARK is nowhere outside the vault write. `paste`: the paste box, which may hold it before the parse (it never shows it:
 *  the box is masked, so even then its DOM value holds bullets). */
function sweep(where: string) {
  const out: string[] = [];
  const body = document.body;
  if (body.textContent?.includes(MARK)) out.push('body text');
  for (const el of body.querySelectorAll('*')) for (const a of el.attributes) if (a.value.includes(MARK)) out.push(`attribute ${a.name} on <${el.tagName}>`);
  for (const el of body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) if (el.value.includes(MARK)) out.push(`value of <${el.tagName}>`);
  for (const el of body.querySelectorAll<HTMLInputElement>('input[type=file]')) if (el.value !== '' || (el.files?.length ?? 0) > 0) out.push('a file input still holds a file');
  for (const tt of toasts.shown) if (text(tt).includes(MARK)) out.push('toast');
  if (window.location.href.includes(MARK)) out.push('window.location');
  if (router && text({ href: router.state.location.href, search: router.state.location.search, state: router.state.location.state }).includes(MARK)) out.push('router location');
  // eslint-disable-next-line no-restricted-globals -- the sweep reads browser storage to prove no value reached it
  for (const s of [localStorage, sessionStorage])
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)!;
      if (k.includes(MARK) || (s.getItem(k) ?? '').includes(MARK)) out.push('storage');
    }
  if (text(heldChanges(LOCK)).includes(MARK)) out.push('core held changes');
  for (const q of queryClient.getQueryCache().getAll()) if (text({ k: q.queryKey, d: q.state.data, e: q.state.error }).includes(MARK)) out.push(`query ${text(q.queryKey)}`);
  for (const m of queryClient.getMutationCache().getAll()) if (text({ v: m.state.variables, d: m.state.data }).includes(MARK)) out.push('mutation cache');
  for (const sp of spies) for (const call of sp.mock.calls) if (call.some((a) => text(a).includes(MARK) || String(a).includes(MARK))) out.push('console');
  expect(out, `leak at ${where}`).toEqual([]);
}

async function openImport(state = 'import') {
  const r = await renderPage(page, { state, path: '/vault' });
  router = r.router;
  rendered = r;
  await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.import'] }));
  const dlg = await screen.findByRole('dialog', { name: 'Import into Personal' });
  sweep('opened');
  return dlg;
}
const pasteBox = (dlg: HTMLElement) => within(dlg).getByLabelText(strings['import.paste']) as HTMLTextAreaElement;
async function pasteAndRead(dlg: HTMLElement, body: string) {
  await userEvent.click(pasteBox(dlg));
  await userEvent.paste(body);
  sweep('pasted');
  await userEvent.click(within(dlg).getByRole('button', { name: strings['import.read'] }));
}
const list = (dlg: HTMLElement) => within(dlg).getByRole('list', { name: strings['import.list'] });
const rowOf = (dlg: HTMLElement, key: string): HTMLElement => {
  const li = within(list(dlg))
    .getAllByRole('listitem')
    .find((el) => within(el).queryAllByText(key, { exact: true }).length > 0);
  if (!li) throw new Error(`no row ${key}`);
  return li;
};
/** The row's status pill text, exactly (a label that only starts the same, such as "Not sent: a change is held", differs). */
const pillOf = (dlg: HTMLElement, key: string): string => {
  const words = Object.entries(strings)
    .filter(([k]) => k.startsWith('import.st.'))
    .map(([, w]) => w)
    .sort((a, b) => b.length - a.length);
  const text = rowOf(dlg, key).textContent ?? '';
  return words.find((w) => text.includes(w)) ?? '';
};
const statusOf = (dlg: HTMLElement, key: string, label: string) => waitFor(() => expect(rowOf(dlg, key)).toHaveTextContent(label), { timeout: 15_000 });
const puts = () => requestLog.filter((r) => r.method === 'PUT');
const putKeys = () => puts().map((r) => decodeURIComponent(r.path.split('/').pop()!));
const bodyValue = (r: { body?: unknown }) => (r.body as { value: string }).value;
const send = async (dlg: HTMLElement, count: number) => {
  await userEvent.click(within(dlg).getByRole('button', { name: count === 1 ? `Send ${count} entry` : `Send ${count} entries` }));
};
const finished = (dlg: HTMLElement) => waitFor(() => expect(within(dlg).queryByRole('button', { name: strings['import.stop'] })).toBeNull(), { timeout: 20_000 });
/** The finished import's plate: its sentence and its counts as label/value facts ("Sent: 2"), in the order shown. */
const resultOf = (dlg: HTMLElement): { sentence: string; facts: string[] } => {
  const plate = within(dlg).getByRole('group', { name: strings['import.verdictDone'] });
  return {
    sentence: plate.querySelector('p')?.textContent ?? '',
    facts: [...plate.querySelectorAll('dt')].map((dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent ?? ''}`),
  };
};
/** Opens a failure band's Details and returns the facts it shows, by label (Status, Code, …); closes it again. */
async function detailsOf(dlg: HTMLElement, words: string): Promise<Record<string, string>> {
  const band = within(dlg).getByText(words).closest('[role="alert"]') as HTMLElement;
  expect(band).not.toBeNull();
  await userEvent.click(within(band).getByRole('button', { name: errWords['err.details'] }));
  const shown = await screen.findByRole('dialog', { name: errWords['err.detailsTitle'] });
  const facts: Record<string, string> = {};
  for (const dt of shown.querySelectorAll('dt')) facts[dt.textContent ?? ''] = dt.nextElementSibling?.textContent ?? '';
  sweep('details');
  await userEvent.click(within(shown).getAllByRole('button', { name: errWords['err.close'] }).at(-1)!);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: errWords['err.detailsTitle'] })).toBeNull());
  return facts;
}
const switchRealm = (r: string) => act(() => { setRealm(r); bump('switch'); });

describe('Import: paste → preview → send → read-back', () => {
  it('previews names only (one fixed mask), skips a name that is here unless Overwrite is chosen, sends the rest, confirms by write id', async () => {
    fixtureAdd('import', REALM_A, 'GITHUB_TOKEN', 'fixture-gt');
    const dlg = await openImport();
    await pasteAndRead(dlg, ['# a comment', `export NEW_ONE=${v(1)}`, `GITHUB_TOKEN="${v(2)}"`, `bad name=${v(3)}`, 'EMPTY=', `NEW_TWO='${v(4)}'`, 'no equals here'].join('\n'));
    // The paste box is gone, and the preview lists names, lines and statuses.
    expect(within(dlg).queryByLabelText(strings['import.paste'])).toBeNull();
    await statusOf(dlg, 'GITHUB_TOKEN', strings['import.st.skip']);
    sweep('preview');
    expect(rowOf(dlg, 'NEW_ONE')).toHaveTextContent(strings['import.st.new']);
    expect(rowOf(dlg, 'NEW_TWO')).toHaveTextContent(strings['import.st.new']);
    // A name that fails is shown by its line only: its text is never on screen.
    expect(rowOf(dlg, 'Line 4')).toHaveTextContent(strings['import.st.invalid']);
    expect(dlg).not.toHaveTextContent('bad name');
    // Every refused row is its line and reason only: EMPTY is never named.
    expect(rowOf(dlg, 'Line 5')).toHaveTextContent(strings['import.st.empty']);
    expect(dlg).not.toHaveTextContent('EMPTY');
    expect(rowOf(dlg, 'Line 7')).toHaveTextContent(strings['import.st.no_equals']);
    // The same mask on every row that has a value, and nowhere else.
    const mask = strings['import.mask'];
    for (const k of ['NEW_ONE', 'GITHUB_TOKEN', 'NEW_TWO']) expect(rowOf(dlg, k)).toHaveTextContent(mask);
    for (const k of ['Line 4', 'Line 5']) expect(rowOf(dlg, k)).not.toHaveTextContent(mask);
    expect(dlg).toHaveTextContent('Sends 2 entries. This takes under a minute.');
    expect(dlg).toHaveTextContent('1 name is here already. It is skipped unless you choose Overwrite.');
    // Overwrite and back: shown on screen each time; the send count follows.
    await userEvent.click(within(rowOf(dlg, 'GITHUB_TOKEN')).getByRole('button', { name: 'Overwrite GITHUB_TOKEN' }));
    expect(rowOf(dlg, 'GITHUB_TOKEN')).toHaveTextContent(strings['import.st.overwrite']);
    expect(within(dlg).getByRole('button', { name: 'Send 3 entries' })).toBeInTheDocument();
    await userEvent.click(within(rowOf(dlg, 'GITHUB_TOKEN')).getByRole('button', { name: 'Skip GITHUB_TOKEN' }));
    expect(rowOf(dlg, 'GITHUB_TOKEN')).toHaveTextContent(strings['import.st.skip']);
    sweep('choices');
    await send(dlg, 2);
    await finished(dlg);
    await statusOf(dlg, 'NEW_TWO', strings['import.st.confirmed']);
    sweep('done');
    expect(rowOf(dlg, 'NEW_ONE')).toHaveTextContent(strings['import.st.confirmed']);
    expect(rowOf(dlg, 'GITHUB_TOKEN')).toHaveTextContent(strings['import.st.skipped']);
    expect(putKeys()).toEqual(['NEW_ONE', 'NEW_TWO']);
    expect(puts().map(bodyValue)).toEqual([v(1), v(4)]);
    expect(resultOf(dlg)).toEqual({ sentence: 'The import ended.', facts: ['Sent: 2', 'Confirmed saved: 2', 'Skipped: 1', 'Not imported: 3'] });
    expect(importToasts()).toEqual([]);
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
  }, 30_000);

  it('Overwrite all sends the names that are here as Replace', async () => {
    fixtureAdd('import', REALM_A, 'GITHUB_TOKEN', 'fixture-gt');
    fixtureAdd('import', REALM_A, 'DEPLOY_NOTES', 'fixture-dn');
    fixtureEntry('import', REALM_A, 'DEPLOY_NOTES', { owner: 'ops' });
    const dlg = await openImport();
    await pasteAndRead(dlg, `GITHUB_TOKEN=${v('gt')}\nDEPLOY_NOTES=${v('dn')}`);
    await statusOf(dlg, 'DEPLOY_NOTES', strings['import.st.skip']);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.overwriteAll'] }));
    await send(dlg, 2);
    await finished(dlg);
    await statusOf(dlg, 'DEPLOY_NOTES', strings['import.st.confirmed']);
    expect(putKeys()).toEqual(['GITHUB_TOKEN', 'DEPLOY_NOTES']);
    // Replace keeps the entry's own metadata.
    expect((puts()[1]!.body as { metadata: Record<string, unknown> }).metadata).toMatchObject({ owner: 'ops' });
    sweep('overwritten');
  }, 30_000);

  it('an unclosed quote refuses the whole import, and the paste box is emptied all the same', async () => {
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v(1)}\nB="${v(2)}\nC=${v(3)}`);
    expect(await within(dlg).findByText(/Line 2: a quote is not closed/)).toBeInTheDocument();
    expect(pasteBox(dlg).value).toBe('');
    expect(within(dlg).queryByRole('list', { name: strings['import.list'] })).toBeNull();
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    sweep('refused');
  });
});

describe('Import: Back from the preview', () => {
  it('Back from the keyboard puts focus in the paste box again (the pressed button is gone with the preview)', async () => {
    const dlg = await openImport();
    await pasteAndRead(dlg, `NEW_ONE=${v(1)}`);
    await statusOf(dlg, 'NEW_ONE', strings['import.st.new']);
    const back = within(dlg).getByRole('button', { name: strings['import.back'] });
    back.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(within(dlg).getByLabelText(strings['import.paste'])).toHaveFocus());
    expect(pasteBox(dlg).value).toBe('');
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    sweep('back');
  });
});

describe('Import: what the preview never shows', () => {
  it('the paste field starts hidden, and a Show from before is reset when the dialog opens again', async () => {
    const dlg = await openImport();
    expect(within(dlg).getByRole('button', { name: formWords['secretInput.show'] })).toBeInTheDocument();
    expect(within(dlg).queryByRole('button', { name: formWords['secretInput.hide'] })).toBeNull();
    await userEvent.click(pasteBox(dlg));
    await userEvent.paste(`A=${v('s')}`);
    // Hidden, the field holds bullets only.
    expect(pasteBox(dlg).value).not.toContain(MARK);
    // Show is the person's own reveal: only then does the field hold what they pasted.
    await userEvent.click(within(dlg).getByRole('button', { name: formWords['secretInput.show'] }));
    expect(pasteBox(dlg).value).toContain(MARK);
    await userEvent.click(within(dlg).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    sweep('closed after show');
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.import'] }));
    const again = await screen.findByRole('dialog', { name: 'Import into Personal' });
    expect(within(again).getByRole('button', { name: formWords['secretInput.show'] })).toBeInTheDocument();
    expect(within(again).queryByRole('button', { name: formWords['secretInput.hide'] })).toBeNull();
    expect(pasteBox(again).value).toBe('');
    sweep('reopened');
  });

  it('key material and text that is not a name show by line number only; the value they follow is refused as cut', async () => {
    const dlg = await openImport();
    // MARK outside any value: a continuation line with =, a stray connection string, base64 of letters and digits
    // ending in one = (a valid .env name with an empty value: its own unnamed row, which does not cut TOKEN), a hoody.* name, and an invalid assignment after a value.
    await pasteAndRead(
      dlg,
      [
        'CERT=-----BEGIN KEY-----',
        `${MARK}AbCd+EfGh/IjKl==`,
        '-----END KEY-----',
        fake('postgres://user:', MARK, '@db.example.com/app?sslmode=require'),
        `TOKEN=${v('t')}`,
        `${MARK}abc123=`,
        `hoody.${MARK}=x`,
        'KEY=first line',
        `more ${MARK} text=continued`,
        `GOOD=${v('g')}`,
      ].join('\n'),
    );
    await statusOf(dlg, 'GOOD', strings['import.st.new']);
    const goesOn = (n: number) => strings['import.st.continued'].replace('{{line}}', String(n));
    expect(rowOf(dlg, 'Line 1')).toHaveTextContent(goesOn(2));
    // The pill stays short; the remedy is its tip: the kit InfoTip makes the pill's words the
    // button that opens it, as for an invalid name's reason.
    expect(rowOf(dlg, 'Line 1')).not.toHaveTextContent(/quotes/);
    await userEvent.click(within(rowOf(dlg, 'Line 1')).getByRole('button', { name: goesOn(2) }));
    expect(await screen.findByText(strings['import.st.continuedTip'].replace('{{line}}', '2'))).toBeInTheDocument();
    expect(rowOf(dlg, 'Line 2')).toHaveTextContent(strings['import.st.continuation']);
    expect(rowOf(dlg, 'Line 3')).toHaveTextContent(strings['import.st.no_equals']);
    expect(rowOf(dlg, 'Line 4')).toHaveTextContent(strings['import.st.invalid']);
    expect(rowOf(dlg, 'TOKEN')).toHaveTextContent(strings['import.st.new']);
    expect(rowOf(dlg, 'Line 6')).toHaveTextContent(strings['import.st.empty']);
    expect(rowOf(dlg, 'Line 7')).toHaveTextContent(strings['import.st.invalid']);
    expect(rowOf(dlg, 'Line 8')).toHaveTextContent(goesOn(9));
    expect(rowOf(dlg, 'Line 9')).toHaveTextContent(strings['import.st.invalid']);
    for (const name of ['postgres', 'CERT', 'hoody.', 'KEY']) expect(list(dlg)).not.toHaveTextContent(name);
    expect(dlg).toHaveTextContent('Sends 2 entries.');
    sweep('material');
    await send(dlg, 2);
    await finished(dlg);
    await statusOf(dlg, 'GOOD', strings['import.st.confirmed']);
    expect(rowOf(dlg, 'TOKEN')).toHaveTextContent(strings['import.st.confirmed']);
    expect(putKeys()).toEqual(['TOKEN', 'GOOD']);
    sweep('material sent');
  }, 30_000);
});

describe('Import: partial outcomes', () => {
  it('a pending row stops the run there: its hold shows with Check again, later rows are "not sent"', async () => {
    importScript.put = (key) => (key === 'B' ? { answer: { status: 502, body: { error: 'BAD_GATEWAY' } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, ['A', 'B', 'C', 'D'].map((k) => `${k}=${v(k)}`).join('\n'));
    await statusOf(dlg, 'D', strings['import.st.new']);
    await send(dlg, 4);
    await finished(dlg);
    await statusOf(dlg, 'A', strings['import.st.confirmed']);
    expect(rowOf(dlg, 'B')).toHaveTextContent(strings['import.st.pending']);
    // Exactly "Not sent": the run stopped at B, so C was never tried (not tried and refused as held).
    expect(pillOf(dlg, 'C')).toBe(strings['import.st.notSent']);
    expect(pillOf(dlg, 'D')).toBe(strings['import.st.notSent']);
    expect(putKeys()).toEqual(['A', 'B']);
    expect(resultOf(dlg)).toEqual({ sentence: 'The import ended.', facts: ['Sent: 1', 'Confirmed saved: 1', 'May have gone through: 1 (B)', 'Not sent: 2'] });
    expect(within(dlg).getByText('Saving B in Personal may have gone through')).toBeInTheDocument();
    // The result shows in the dialog only: no toast, for a run that stopped too.
    expect(importToasts()).toEqual([]);
    expect(dlg).not.toHaveTextContent(/unknown/i);
    sweep('pending');
  }, 30_000);

  it('a row whose answer is lost stops the run: later rows are never tried, never PUT, and read exactly "not sent"', async () => {
    // B lands, then its answer is lost: it may have gone through.
    importScript.put = (key) => (key === 'B' ? { apply: true, answer: { network: true, delayMs: 300 } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, ['A', 'B', 'C', 'D'].map((k) => `${k}=${v(k)}`).join('\n'));
    await statusOf(dlg, 'D', strings['import.st.new']);
    await send(dlg, 4);
    await finished(dlg);
    await statusOf(dlg, 'B', strings['import.st.pending']);
    expect(pillOf(dlg, 'A')).toBe(strings['import.st.confirmed']);
    expect(pillOf(dlg, 'C')).toBe(strings['import.st.notSent']);
    expect(pillOf(dlg, 'D')).toBe(strings['import.st.notSent']);
    expect(putKeys()).toEqual(['A', 'B']);
    expect(resultOf(dlg)).toEqual({ sentence: 'The import ended.', facts: ['Sent: 1', 'Confirmed saved: 1', 'May have gone through: 1 (B)', 'Not sent: 2'] });
    expect(within(dlg).getByText('B may have gone through, so the import stopped there. The rest was not sent.')).toBeInTheDocument();
    sweep('lost answer');
  }, 30_000);

  it('a 429 waits its Retry-After with the countdown shown, then sends the same row again', async () => {
    const at: number[] = [];
    importScript.put = (key, n) => {
      if (key === 'A') at.push(Date.now());
      return key === 'A' && n === 0 ? { answer: { status: 429, body: { error: 'Too Many Requests' }, headers: { 'retry-after': '2' } } } : undefined;
    };
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    expect(await within(dlg).findByText(/The vault asked to wait\. Sending the same entry again in [12] s\./, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: strings['import.stop'] })).toBeInTheDocument();
    sweep('waiting');
    await finished(dlg);
    await statusOf(dlg, 'B', strings['import.st.confirmed']);
    expect(rowOf(dlg, 'A')).toHaveTextContent(strings['import.st.confirmed']);
    expect(putKeys()).toEqual(['A', 'A', 'B']);
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(1500);
    sweep('after wait');
  }, 30_000);

  it('a name added since the preview is skipped, never overwritten', async () => {
    importScript.put = (key) => {
      if (key === 'A') fixtureAdd('import', REALM_A, 'B', 'fixture-elsewhere');
      return undefined;
    };
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}\nC=${v('c')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 3);
    await finished(dlg);
    await statusOf(dlg, 'C', strings['import.st.confirmed']);
    expect(rowOf(dlg, 'B')).toHaveTextContent(strings['import.st.meanwhile']);
    expect(putKeys()).toEqual(['A', 'C']);
    expect(resultOf(dlg)).toEqual({ sentence: 'The import ended.', facts: ['Sent: 2', 'Confirmed saved: 2', 'Skipped: 1'] });
    sweep('meanwhile');
  }, 30_000);

  it('Stop: the row in flight ends as answered, the rest is "not sent", and the password is gone at once', async () => {
    importScript.put = (key) => (key === 'A' ? { apply: true, answer: { status: 200, body: { statusCode: 200 }, delayMs: 1500 } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}\nC=${v('c')}`);
    await statusOf(dlg, 'C', strings['import.st.new']);
    await userEvent.click(within(dlg).getByRole('checkbox', { name: new RegExp(strings['import.encrypt']) }));
    // The password carries MARK too: the sweeps below prove it reaches no text, toast, cache or log.
    await userEvent.type(within(dlg).getByLabelText(strings['import.password']), `${MARK}-pw`);
    await userEvent.type(within(dlg).getByLabelText(strings['import.repeat']), `${MARK}-pw`);
    await send(dlg, 3);
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 15_000 });
    expect(importHeldForTests().passwords).toBe(1);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.stop'] }));
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    await finished(dlg);
    expect(await within(dlg).findByText(strings['import.stopped'])).toBeInTheDocument();
    expect(rowOf(dlg, 'B')).toHaveTextContent(strings['import.st.notSent']);
    expect(rowOf(dlg, 'C')).toHaveTextContent(strings['import.st.notSent']);
    expect(putKeys()).toEqual(['A']);
    // What was sent is the envelope under the password, never the value.
    expect(await decrypt(bodyValue(puts()[0]!), `${MARK}-pw`)).toBe(v('a'));
    expect(importToasts()).toEqual([]);
    sweep('stopped');
  }, 40_000);

  it('a realm switch during a wait: the dialog closes (the kit closes it at a context end), the page says the 429 row was refused (busy) and the rest "not sent" (never unknown), and the password is gone at once', async () => {
    importScript.put = (key) => (key === 'A' ? { answer: { status: 429, body: { error: 'Too Many Requests' }, headers: { 'retry-after': '30' } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}\nC=${v('c')}`);
    await statusOf(dlg, 'C', strings['import.st.new']);
    await userEvent.click(within(dlg).getByRole('checkbox', { name: new RegExp(strings['import.encrypt']) }));
    await userEvent.type(within(dlg).getByLabelText(strings['import.password']), `${MARK}-pw`);
    await userEvent.type(within(dlg).getByLabelText(strings['import.repeat']), `${MARK}-pw`);
    await send(dlg, 3);
    await within(dlg).findByText(/The vault asked to wait/, {}, { timeout: 15_000 });
    expect(importHeldForTests().passwords).toBe(1);
    await switchRealm(REALM_B);
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The page, now on the other realm, says what the import into Personal did.
    // A's PUT went out and came back 429: it was refused, never "not sent".
    const report = await screen.findByText('The import into Personal stopped before the end: 1 refused (busy), not saved · 2 not sent.', {}, { timeout: 10_000 });
    // Bans any claim of saved ("1 saved", "confirmed saved"), not the refused label "not saved".
    expect(report).not.toHaveTextContent(/unknown|may have gone through|(?<!not )saved/i);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(putKeys()).toEqual(['A']);
    sweep('realm switched');
  }, 40_000);

  it('closing the dialog mid-run stops it and drops everything', async () => {
    importScript.put = (key) => (key === 'A' ? { answer: { status: 429, body: { error: 'Too Many Requests' }, headers: { 'retry-after': '30' } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await within(dlg).findByText(/The vault asked to wait/, {}, { timeout: 15_000 });
    await userEvent.click(within(dlg).getByRole('button', { name: (n, el) => n === strings['import.close'] && !el.hasAttribute('data-dialog-close') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    expect(await screen.findByText('The import into Personal stopped before the end: 1 refused (busy), not saved · 1 not sent.', {}, { timeout: 10_000 })).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(putKeys()).toEqual(['A']);
    sweep('closed');
  }, 30_000);
});

describe('Import: a 429 cut short, Stop and the read-back', () => {
  it('Stop during a 429 wait: the row whose PUT came back 429 reads exactly "Refused (busy), not saved", the rest "Not sent"', async () => {
    importScript.put = (key) => (key === 'A' ? { answer: { status: 429, body: { error: 'Too Many Requests' }, headers: { 'retry-after': '30' } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}\nC=${v('c')}`);
    await statusOf(dlg, 'C', strings['import.st.new']);
    await send(dlg, 3);
    await within(dlg).findByText(/The vault asked to wait/, {}, { timeout: 15_000 });
    sweep('busy wait');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.stop'] }));
    await finished(dlg);
    await waitFor(() => expect(pillOf(dlg, 'A')).toBe(strings['import.st.busy']), { timeout: 10_000 });
    expect(pillOf(dlg, 'B')).toBe(strings['import.st.notSent']);
    expect(pillOf(dlg, 'C')).toBe(strings['import.st.notSent']);
    expect(putKeys()).toEqual(['A']);
    // The first row's request went out and was refused, so the sentence never says nothing was sent.
    expect(resultOf(dlg)).toEqual({ sentence: 'The import ended.', facts: ['Refused (busy), not saved: 1', 'Not sent: 2'] });
    expect(importToasts()).toEqual([]);
    sweep('busy stopped');
  }, 40_000);

  it('Stop is disabled once every row is answered, while the read-back runs', async () => {
    importScript.put = (key) => {
      if (key === 'B') importScript.listSlowMs = 2500;
      return undefined;
    };
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await statusOf(dlg, 'B', strings['import.st.reading']);
    expect(within(dlg).getByRole('button', { name: strings['import.stop'] })).toBeDisabled();
    await finished(dlg);
    await statusOf(dlg, 'B', strings['import.st.confirmed']);
    expect(within(dlg).queryByText(strings['import.stopped'])).toBeNull();
    sweep('read-back stop');
  }, 30_000);
});

describe('Import: a full pass is never "stopped before the end"', () => {
  it('an overwrite whose entry vanished, then another row: the pass goes on to the end and the dialog never says stopped', async () => {
    fixtureAdd('import', REALM_A, 'GITHUB_TOKEN', 'fixture-gt');
    // The entry is gone by the time its Replace lands: 404, a refusal of that row only (the loop goes on).
    importScript.put = (key) => (key === 'GITHUB_TOKEN' ? { answer: { status: 404, body: { error: 'NOT_FOUND' } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `GITHUB_TOKEN=${v('gt')}\nNEW_ONE=${v(1)}`);
    await statusOf(dlg, 'GITHUB_TOKEN', strings['import.st.skip']);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.overwriteAll'] }));
    await send(dlg, 2);
    await finished(dlg);
    await statusOf(dlg, 'NEW_ONE', strings['import.st.confirmed']);
    expect(pillOf(dlg, 'GITHUB_TOKEN')).toBe(strings['import.st.failed']);
    expect(putKeys()).toEqual(['GITHUB_TOKEN', 'NEW_ONE']);
    expect(within(dlg).queryByText(strings['import.stopped'])).toBeNull();
    expect(importToasts()).toEqual([]);
    sweep('full pass with a vanished overwrite');
  }, 30_000);
  it('a full pass where every row was refused or vanished: each row says refused, the dialog never says stopped', async () => {
    fixtureAdd('import', REALM_A, 'GITHUB_TOKEN', 'fixture-gt');
    importScript.put = (key) => (key === 'GITHUB_TOKEN' ? { answer: { status: 404, body: { error: 'NOT_FOUND' } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `GITHUB_TOKEN=${v('gt')}`);
    await statusOf(dlg, 'GITHUB_TOKEN', strings['import.st.skip']);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.overwriteAll'] }));
    await send(dlg, 1);
    await finished(dlg);
    expect(pillOf(dlg, 'GITHUB_TOKEN')).toBe(strings['import.st.failed']);
    expect(putKeys()).toEqual(['GITHUB_TOKEN']);
    // The row's request went out and was refused: the result never says nothing was sent.
    expect(resultOf(dlg).sentence).toBe('The import ended.');
    expect(within(dlg).queryByText('Nothing was sent.')).toBeNull();
    expect(within(dlg).queryByText(strings['import.stopped'])).toBeNull();
    expect(importToasts()).toEqual([]);
    sweep('full pass where every row was refused');
  }, 30_000);
  it('closed during the read-back of a full pass with a vanished row: the page says the last entry was reached, none confirmed, never "stopped"', async () => {
    // GITHUB_TOKEN vanished (404, refused; the loop goes on); NEW_ONE is written and its answer slows the list, so the
    // read-back is still running when the dialog is closed. The pass was not cut short; its read-back is dropped.
    fixtureAdd('import', REALM_A, 'GITHUB_TOKEN', 'fixture-gt');
    importScript.put = (key) => {
      if (key === 'GITHUB_TOKEN') return { answer: { status: 404, body: { error: 'NOT_FOUND' } } };
      importScript.listSlowMs = 3000;
      return undefined;
    };
    const dlg = await openImport();
    await pasteAndRead(dlg, `GITHUB_TOKEN=${v('gt')}\nNEW_ONE=${v(1)}`);
    await statusOf(dlg, 'GITHUB_TOKEN', strings['import.st.skip']);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.overwriteAll'] }));
    await send(dlg, 2);
    await statusOf(dlg, 'NEW_ONE', strings['import.st.reading']);
    expect(pillOf(dlg, 'GITHUB_TOKEN')).toBe(strings['import.st.failed']);
    await userEvent.click(within(dlg).getAllByRole('button', { name: strings['import.close'] }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const band = await screen.findByText('The import into Personal reached the last entry, but its result was not read back, so none is confirmed saved: 1 sent · 1 refused.', {}, { timeout: 15_000 });
    expect(band.textContent).not.toContain(MARK);
    expect(screen.queryByText(/stopped before the end/)).toBeNull();
    expect(putKeys()).toEqual(['GITHUB_TOKEN', 'NEW_ONE']);
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    expect(importToasts()).toEqual([]);
    sweep('close during the read-back of a full pass');
  }, 30_000);

  /** A is written (its answer slows the list, so the read-back is still out); `pend` answers 502 (may have gone through). */
  async function pendingThenClose(names: readonly string[], pend: string) {
    importScript.put = (key) => {
      if (key === pend) return { answer: { status: 502, body: { error: 'BAD_GATEWAY' } } };
      importScript.listSlowMs = 3000;
      return undefined;
    };
    const dlg = await openImport();
    await pasteAndRead(dlg, names.map((k) => `${k}=${v(k)}`).join('\n'));
    await statusOf(dlg, names.at(-1)!, strings['import.st.new']);
    await send(dlg, names.length);
    await statusOf(dlg, pend, strings['import.st.pending']);
    await statusOf(dlg, 'A', strings['import.st.reading']);
    await userEvent.click(within(dlg).getAllByRole('button', { name: strings['import.close'] }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }

  it('a pending answer on the last row: every row was reached, so closed during the read-back the page says so (that row "may have gone through")', async () => {
    await pendingThenClose(['A', 'B'], 'B');
    const band = await screen.findByText('The import into Personal reached the last entry, but its result was not read back, so none is confirmed saved: 1 sent · 1 may have gone through (B).', {}, { timeout: 15_000 });
    expect(band.textContent).not.toContain(MARK);
    expect(screen.queryByText(/stopped before the end/)).toBeNull();
    expect(putKeys()).toEqual(['A', 'B']);
    sweep('pending last row');
  }, 30_000);

  it('a pending answer on a middle row still stops the run: closed during the read-back, the page says it stopped before the end', async () => {
    await pendingThenClose(['A', 'B', 'C'], 'B');
    const band = await screen.findByText('The import into Personal stopped before the end: 1 sent · 1 may have gone through (B) · 1 not sent.', {}, { timeout: 15_000 });
    expect(band.textContent).not.toContain(MARK);
    expect(putKeys()).toEqual(['A', 'B']);
    sweep('pending middle row');
  }, 30_000);

  /** A is written, then every list read is slow: Stop is pressed once B is the row in flight, while its fresh list read is out. */
  async function stopWhileLastGetsReady() {
    importScript.put = (key) => {
      if (key === 'A') importScript.listSlowMs = 3000;
      return undefined;
    };
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 15_000 });
    // A is answered (after its slow refresh) and B is the row in flight: its own fresh list read is out, no PUT yet.
    await statusOf(dlg, 'B', strings['import.st.sending']);
    expect(puts()).toHaveLength(1);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.stop'] }));
    return dlg;
  }

  it('Stop while the last row is still getting ready: that row is "not sent" and the dialog says it stopped', async () => {
    const dlg = await stopWhileLastGetsReady();
    await finished(dlg);
    await statusOf(dlg, 'B', strings['import.st.notSent']);
    // Past the read-back of A: the stopped band is still there (a full pass would have cleared it).
    await statusOf(dlg, 'A', strings['import.st.confirmed']);
    expect(within(dlg).getByText(strings['import.stopped'])).toBeInTheDocument();
    expect(putKeys()).toEqual(['A']);
    expect(importToasts()).toEqual([]);
    sweep('stop on the last row before its PUT');
  }, 40_000);

  it('the same Stop, then closed during the read-back: the page says it stopped before the end, never "reached the last entry"', async () => {
    const dlg = await stopWhileLastGetsReady();
    await statusOf(dlg, 'A', strings['import.st.reading']);
    await userEvent.click(within(dlg).getAllByRole('button', { name: strings['import.close'] }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const band = await screen.findByText('The import into Personal stopped before the end: 1 sent · 1 not sent.', {}, { timeout: 15_000 });
    expect(band.textContent).not.toContain(MARK);
    expect(screen.queryByText(/reached the last entry/)).toBeNull();
    expect(putKeys()).toEqual(['A']);
    sweep('stop on the last row before its PUT, closed');
  }, 40_000);
});

describe('Import: leaving the page mid-run', () => {
  /** Starts A and B, A waits out a 429, and the page is left (unmounted) during the wait; the run ends with it gone. */
  async function leaveMidRun() {
    importScript.put = (key) => (key === 'A' ? { answer: { status: 429, body: { error: 'Too Many Requests' }, headers: { 'retry-after': '30' } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await within(dlg).findByText(/The vault asked to wait/, {}, { timeout: 15_000 });
    const left = rendered!;
    left.unmount();
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    // The wait ticks every 250 ms: the run sees the page gone and ends, with nothing more sent.
    await act(() => new Promise((r) => setTimeout(r, 700)));
    expect(putKeys()).toEqual(['A']);
    sweep('left mid-run');
    return left;
  }
  const comeBack = async (left: NonNullable<typeof rendered>) => {
    let back: ReturnType<typeof render> | undefined;
    await act(async () => {
      back = render(
        <QueryClientProvider client={left.queryClient}>
          <RouterProvider router={left.router} />
        </QueryClientProvider>,
      );
    });
    return back!;
  };
  /** The view has mounted and taken whatever waited (its stats strip is drawn), and a moment more. */
  const settled = async () => {
    await screen.findByText(strings['stats.entries'], {}, { timeout: 10_000 });
    await act(() => new Promise((r) => setTimeout(r, 300)));
  };

  it('on return the page shows what the cut-short import did (names and counts, no value), once', async () => {
    const left = await leaveMidRun();
    const second = await comeBack(left);
    const want = 'The import into Personal stopped before the end: 1 refused (busy), not saved · 1 not sent.';
    const band = await screen.findByText(want, {}, { timeout: 10_000 });
    expect(band).toHaveTextContent('Personal');
    expect(band.textContent).not.toMatch(/(?<!not )saved|may have gone through/i);
    expect(band.textContent).not.toContain(MARK);
    sweep('back after leaving');
    // Once: left and back again, the page shows no report (the first return took it).
    second.unmount();
    await comeBack(left);
    await settled();
    expect(screen.queryByText(/stopped before the end/)).toBeNull();
  }, 30_000);

  it('a realm switch while away drops it: the page shows no report on return', async () => {
    const left = await leaveMidRun();
    await switchRealm(REALM_B);
    await comeBack(left);
    await settled();
    expect(screen.queryByText(/stopped before the end/)).toBeNull();
    sweep('back after a realm switch');
  }, 30_000);

  it('back before the run settled: the band shows once the old request is answered (a late report reaches the mounted page)', async () => {
    // A is answered after 5 s; the page is left while it is out and comes back at once, before the answer.
    importScript.put = (key) => (key === 'A' ? { apply: true, answer: { status: 200, body: { statusCode: 200 }, delayMs: 5000 } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 15_000 });
    const left = rendered!;
    left.unmount();
    await comeBack(left);
    await settled();
    expect(screen.queryByText(/stopped before the end/)).toBeNull();
    const band = await screen.findByText(/^The import into Personal stopped before the end: .*1 not sent\.$/, {}, { timeout: 10_000 });
    expect(band.textContent).not.toContain(MARK);
    expect(putKeys()).toEqual(['A']);
    expect(leftImportReportHeldForTests()).toBe(false);
    sweep('back before the run settled');
  }, 30_000);
});

describe('Import: the leave-report holder', () => {
  it('a write from a dead context is refused, and a context bump (a realm switch) clears a waiting report', () => {
    const ctx = capture();
    keepLeftImportReport('The import into Personal stopped before the end: 1 not sent.', ctx);
    expect(leftImportReportHeldForTests()).toBe(true);
    bump('switch');
    expect(leftImportReportHeldForTests()).toBe(false);
    keepLeftImportReport('The import into Personal stopped before the end: 1 not sent.', ctx);
    expect(leftImportReportHeldForTests()).toBe(false);
  });

  it('a sign-out clears a waiting report, and nothing is kept after it', () => {
    try {
      keepLeftImportReport('The import into Personal stopped before the end: 1 not sent.', capture());
      expect(leftImportReportHeldForTests()).toBe(true);
      // As lifecycle.ts signs out: the latch, then the account ends (a bump).
      startLoggingOut();
      bump('logout');
      expect(leftImportReportHeldForTests()).toBe(false);
      keepLeftImportReport('The import into Personal stopped before the end: 1 not sent.', capture());
      expect(leftImportReportHeldForTests()).toBe(false);
    } finally {
      resetCore();
    }
  });

  it('a waiting report whose context ended without a bump (the sign-out latch alone) is dropped at take, never shown', () => {
    try {
      keepLeftImportReport('The import into Personal stopped before the end: 1 not sent.', capture());
      expect(leftImportReportHeldForTests()).toBe(true);
      startLoggingOut();
      const taken: string[] = [];
      const stop = takeLeftImportReports((t) => taken.push(t));
      stop();
      expect(taken).toEqual([]);
      expect(leftImportReportHeldForTests()).toBe(false);
    } finally {
      resetCore();
    }
  });
});

describe('Import: the page band of a run cut short', () => {
  it('closed during the read-back of a run cut short: the band still gets its counts and names the realm', async () => {
    // A is answered after 1.5 s and Stop is pressed while it is out; its answer slows the list, so the read-back is
    // still running when the dialog is closed.
    importScript.put = (key) => {
      if (key !== 'A') return undefined;
      importScript.listSlowMs = 4000;
      return { apply: true, answer: { status: 200, body: { statusCode: 200 }, delayMs: 1500 } };
    };
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 15_000 });
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.stop'] }));
    await statusOf(dlg, 'A', strings['import.st.reading']);
    await userEvent.click(within(dlg).getAllByRole('button', { name: strings['import.close'] }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const band = await screen.findByText('The import into Personal stopped before the end: 1 sent · 1 not sent.', {}, { timeout: 15_000 });
    expect(band).toHaveTextContent('Personal');
    expect(band.textContent).not.toMatch(/saved|may have gone through/i);
    expect(putKeys()).toEqual(['A']);
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    sweep('band after a close during the read-back');
  }, 30_000);

  it('closed while a row is out: the band names the realm, calls that row "may have gone through" (never sent), and holds no value', async () => {
    // B is answered 502 after 1.5 s: it may have gone through. The dialog is closed while it is out.
    importScript.put = (key) => (key === 'B' ? { answer: { status: 502, body: { error: 'BAD_GATEWAY' }, delayMs: 1500 } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}\nC=${v('c')}`);
    await statusOf(dlg, 'C', strings['import.st.new']);
    await send(dlg, 3);
    await waitFor(() => expect(putKeys()).toEqual(['A', 'B']), { timeout: 15_000 });
    await userEvent.click(within(dlg).getAllByRole('button', { name: strings['import.close'] }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const want = 'The import into Personal stopped before the end: 1 sent · 1 may have gone through (B) · 1 not sent.';
    const band = await screen.findByText(want, {}, { timeout: 15_000 });
    // The realm is named; B is named only as "may have gone through", and no other word says it was sent. A, answered
    // without a read-back, is "sent", never "saved".
    expect(band).toHaveTextContent('Personal');
    expect(band).toHaveTextContent('1 may have gone through (B)');
    expect(band.textContent!.replace('1 sent · ', '').replace('1 not sent', '')).not.toMatch(/sent/i);
    expect(band.textContent).not.toMatch(/saved/i);
    expect(band.textContent).not.toContain(MARK);
    // C was never sent; B's hold stays on the page with its Check again.
    expect(putKeys()).toEqual(['A', 'B']);
    expect(screen.getByText('Saving B in Personal may have gone through')).toBeInTheDocument();
    expect(importHeldForTests()).toEqual({ values: 0, passwords: 0 });
    sweep('band after close');
  }, 30_000);
});

describe('Import: the read-back', () => {
  it('a row whose write id the list does not show reads "Sent, not shown yet", never confirmed', async () => {
    // B is answered 200 but not applied: the list never carries its write id.
    importScript.put = (key) => (key === 'B' ? { answer: { status: 200, body: { statusCode: 200 } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await finished(dlg);
    await statusOf(dlg, 'A', strings['import.st.confirmed']);
    expect(rowOf(dlg, 'B')).toHaveTextContent(strings['import.st.notShown']);
    expect(rowOf(dlg, 'B')).not.toHaveTextContent(strings['import.st.confirmed']);
    sweep('not shown');
  }, 30_000);

  it('an unreadable read-back says so and confirms nothing', async () => {
    let failLists = false;
    importScript.put = (key) => {
      if (key === 'B') failLists = true;
      return undefined;
    };
    importScript.list = () => (failLists ? { status: 503, body: { error: 'UNAVAILABLE' } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await finished(dlg);
    expect(await within(dlg).findByText(strings['import.readBackFailed'], {}, { timeout: 15_000 })).toBeInTheDocument();
    for (const k of ['A', 'B']) expect(rowOf(dlg, k)).toHaveTextContent(strings['import.st.unreadBack']);
    expect(dlg).not.toHaveTextContent(strings['import.st.confirmed']);
    sweep('unread back');
    // The band carries the read-back's own error: Details names its status and code.
    const facts = await detailsOf(dlg, strings['import.readBackFailed']);
    expect(facts[errWords['err.f.status']]).toBe('503');
    expect(facts[errWords['err.f.code']]).toBe('UNAVAILABLE');
  }, 30_000);

  it('an unreadable preview list says so with its error in Details, and Read again recovers', async () => {
    const dlg = await openImport();
    let failNext = true;
    importScript.list = () => {
      if (!failNext) return undefined;
      failNext = false;
      return { status: 503, body: { error: 'UNAVAILABLE' } };
    };
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    expect(await within(dlg).findByText(strings['import.unread'], {}, { timeout: 15_000 })).toBeInTheDocument();
    expect(rowOf(dlg, 'A')).toHaveTextContent(strings['import.st.checking']);
    sweep('unread list');
    const facts = await detailsOf(dlg, strings['import.unread']);
    expect(facts[errWords['err.f.status']]).toBe('503');
    expect(facts[errWords['err.f.code']]).toBe('UNAVAILABLE');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['import.readAgain'] }));
    await statusOf(dlg, 'B', strings['import.st.new']);
    expect(within(dlg).queryByText(strings['import.unread'])).toBeNull();
    expect(puts()).toHaveLength(0);
    sweep('read again');
  }, 30_000);
});

describe('Import: an empty vault', () => {
  it('Import is offered once: the empty state alone on an empty vault, More alone when there are entries', async () => {
    const empty = await renderPage(page, { state: 'empty', path: '/vault' });
    await screen.findByText(strings['empty.title']);
    expect(screen.getByRole('button', { name: strings['empty.import'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['action.more'] })).toBeNull();
    empty.unmount();
    await renderPage(page, { state: 'import', path: '/vault' });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    expect(await screen.findByRole('menuitem', { name: strings['action.import'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['empty.import'] })).toBeNull();
  });

  it('an empty vault offers Import .env beside New entry; it opens the dialog and fills the empty partition', async () => {
    const r = await renderPage(page, { state: 'empty', path: '/vault' });
    router = r.router;
    await screen.findByText(strings['empty.title']);
    expect(screen.queryByRole('button', { name: strings['action.more'] })).toBeNull();
    expect(screen.getByRole('button', { name: strings['action.new'] })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: strings['empty.import'] }));
    const dlg = await screen.findByRole('dialog', { name: 'Import into Personal' });
    sweep('opened from empty');
    await pasteAndRead(dlg, `A=${v('a')}\nB=${v('b')}`);
    await statusOf(dlg, 'A', strings['import.st.new']);
    expect(rowOf(dlg, 'B')).toHaveTextContent(strings['import.st.new']);
    sweep('empty preview');
    await send(dlg, 2);
    await finished(dlg);
    await statusOf(dlg, 'A', strings['import.st.confirmed']);
    await statusOf(dlg, 'B', strings['import.st.confirmed']);
    expect(putKeys()).toEqual(['A', 'B']);
    sweep('empty filled');
  }, 30_000);
});

describe('Import: a .env file', () => {
  it('reads the file as text, keeps no File and no value in the input, never shows the file name', async () => {
    const dlg = await openImport();
    const input = dlg.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(input).not.toBeNull();
    const file = new File([`# deploy\nFILE_ONE=${v('f1')}\nFILE_TWO="${v('f2')}"\n`], 'prod-secrets-QZFILE.env', { type: 'text/plain' });
    await userEvent.upload(input, file);
    await statusOf(dlg, 'FILE_TWO', strings['import.st.new']);
    expect(input.value).toBe('');
    expect(input.files?.length ?? 0).toBe(0);
    expect(document.body.textContent).not.toContain('QZFILE');
    sweep('file read');
    await send(dlg, 2);
    await finished(dlg);
    await statusOf(dlg, 'FILE_TWO', strings['import.st.confirmed']);
    expect(puts().map(bodyValue)).toEqual([v('f1'), v('f2')]);
    sweep('file sent');
  }, 30_000);

  it('a file over 64 KB is refused unread', async () => {
    const dlg = await openImport();
    const input = dlg.querySelector<HTMLInputElement>('input[type=file]')!;
    await userEvent.upload(input, new File([`A=${MARK}` + 'x'.repeat(70 * 1024)], 'big.env', { type: 'text/plain' }));
    expect(await within(dlg).findByText(/An import takes at most 64 KB/)).toBeInTheDocument();
    expect(input.value).toBe('');
    sweep('big file');
  });
});

describe("Import: a held row's banner in the dialog", () => {
  const heldB = async () => {
    importScript.put = (key) => (key === 'B' ? { answer: { status: 502, body: { error: 'BAD_GATEWAY' } } } : undefined);
    const dlg = await openImport();
    await pasteAndRead(dlg, ['A', 'B'].map((k) => `${k}=${v(k)}`).join('\n'));
    await statusOf(dlg, 'B', strings['import.st.new']);
    await send(dlg, 2);
    await finished(dlg);
    expect(within(dlg).getByText('Saving B in Personal may have gone through')).toBeInTheDocument();
    return dlg;
  };
  it('offers no Stop tracking inside the dialog: its warning would open a second dialog (the page banner keeps the warned stop)', async () => {
    const dlg = await heldB();
    expect(within(dlg).queryByRole('button', { name: new RegExp(`^${errWords['err.stopTracking']}`) })).toBeNull();
    // Closed, the page's banner for the same hold offers it (warned there).
    await userEvent.click(within(dlg).getAllByRole('button', { name: strings['import.close'] }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('button', { name: new RegExp(`^${errWords['err.stopTracking']}`) })).toBeInTheDocument();
    sweep('held row: no stop');
  }, 30_000);
  it('Check again adds what it found after the hold sentence, as the page banner does', async () => {
    const dlg = await heldB();
    await userEvent.click(within(dlg).getByRole('button', { name: kitWords['outcome.pending.check'] }));
    await waitFor(() => expect(dlg).toHaveTextContent(`${strings['hold.bodyPut']} ${strings['hold.unproven']}`));
    sweep('held row: check');
  }, 30_000);
});
