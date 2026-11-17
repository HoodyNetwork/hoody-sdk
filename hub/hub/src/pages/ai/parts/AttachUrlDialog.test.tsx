// From a URL… in the chat composer's add menu: the item (only with the chat's computer), the address check, what is handed to
// the composer's add path for each choice, the long-page choice and the failure lines. Fixture programs: fixtures.url.ts.
import { FIXTURE_TARGET, answers, bootFixtureCore, reply } from '@core';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attach as A } from '@ask/io';
import { AttachUrlDialog } from './AttachUrlDialog';
import { fromOf } from './attachOrigin';
import { useAttachSources } from './attachSources';
import { resetReaderHoldsForTests, urlRoutes } from './attachUrl';
import { urlRules } from './fixtures.url';
import strings from './Conversation.strings.en.json';

const S = strings as Record<string, string>;
const max = '24 KB';
const fill = (s: string, v: Record<string, string> = {}) => s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => v[k] ?? '');

beforeEach(() => { resetReaderHoldsForTests(); bootFixtureCore({ rules: urlRules() }); });
afterEach(() => cleanup());

function open() {
  const onAdd = vi.fn<(files: readonly File[]) => void>();
  const onClose = vi.fn();
  render(<AttachUrlDialog target={FIXTURE_TARGET} onAdd={onAdd} onClose={onClose} />);
  const dialog = screen.getByRole('dialog');
  const type = (v: string) => fireEvent.change(within(dialog).getByLabelText(S['conv.add.url.address']!), { target: { value: v } });
  const press = (name: string) => fireEvent.click(within(dialog).getByRole('button', { name }));
  return { onAdd, onClose, dialog, type, press };
}

describe('the add menu item', () => {
  const input = { chat: 's1', refused: '', textRoom: 3, onAddFiles: () => {}, show: () => {} };
  it('is offered with the chat computer, and disabled with a reason without it', () => {
    const on = renderHook(() => useAttachSources({ ...input, at: { target: FIXTURE_TARGET, cwd: '/home/ada' } })).result.current.menu.find((x) => x.id === 'url');
    expect(on).toMatchObject({ label: S['conv.add.url'], icon: 'globe' });
    expect(on?.isDisabled).toBeFalsy();
    const off = renderHook(() => useAttachSources({ ...input, at: null })).result.current.menu.find((x) => x.id === 'url');
    expect(off).toMatchObject({ isDisabled: true, disabledReason: S['conv.add.url.noComputer'] });
  });
  it('is disabled while the chat takes no files', () => {
    const it = renderHook(() => useAttachSources({ ...input, refused: 'Busy', at: { target: FIXTURE_TARGET, cwd: '' } })).result.current.menu.find((x) => x.id === 'url');
    expect(it).toMatchObject({ isDisabled: true, disabledReason: 'Busy' });
  });
});

describe('the dialog', () => {
  it('offers As Markdown (chosen) and As it is', () => {
    const { dialog } = open();
    expect(within(dialog).getByRole('radio', { name: new RegExp(S['conv.add.url.markdown']!) })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: new RegExp(S['conv.add.url.asis']!) })).not.toBeChecked();
  });

  it('refuses an address that is not public http(s) and reads nothing', async () => {
    const { type, press, onAdd, dialog } = open();
    type('file:///etc/passwd');
    press(S['conv.add.attach']!);
    expect(await within(dialog).findByText(S['conv.add.url.bad.scheme']!)).toBeInTheDocument();
    type('http://192.168.1.1/admin');
    press(S['conv.add.attach']!);
    expect(await within(dialog).findByText(S['conv.add.url.bad.local']!)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('attaches the page as one Markdown file that knows where it came from', async () => {
    const { type, press, onAdd, onClose } = open();
    type('https://example.com/notes?token=abc');
    press(S['conv.add.attach']!);
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const [f] = onAdd.mock.calls[0]![0];
    expect(f!.name).toBe('Release notes.md');
    expect(f!.type).toBe('text/markdown');
    expect(await f!.text()).toContain('# Release notes');
    expect(fromOf(f!)).toBe('example.com/notes');
    expect(onClose).toHaveBeenCalled();
  });

  it('as it is: an image is handed over as image bytes', async () => {
    const { type, press, onAdd, dialog } = open();
    fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(S['conv.add.url.asis']!) }));
    type('https://example.com/logo.png');
    press(S['conv.add.attach']!);
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const [f] = onAdd.mock.calls[0]![0];
    expect(f!.name).toBe('logo.png');
    expect(A.sniff(new Uint8Array(await f!.arrayBuffer()))).toBe('image/png');
  });

  it('a long page waits for "Attach the first part", then attaches a file that fits and says the rest was left out', async () => {
    const { type, press, onAdd, dialog } = open();
    type('https://example.com/long-page');
    press(S['conv.add.attach']!);
    expect(await within(dialog).findByText(fill(S['conv.add.url.long']!, { max }))).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    press(fill(S['conv.add.url.attachFirst']!, { max }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const [f] = onAdd.mock.calls[0]![0];
    expect(f!.size).toBeLessThanOrEqual(A.TXT_BYTES);
    expect((await f!.text()).trimEnd().endsWith(fill(S['conv.add.url.cutNote']!, { max }))).toBe(true);
  });

  it('changing the address after a long read asks again (the first part belongs to that page)', async () => {
    const { type, press, onAdd, dialog } = open();
    type('https://example.com/long-page');
    press(S['conv.add.attach']!);
    await within(dialog).findByText(fill(S['conv.add.url.long']!, { max }));
    type('https://example.com/short');
    expect(within(dialog).queryByText(fill(S['conv.add.url.long']!, { max }))).toBeNull();
    expect(within(dialog).getByRole('button', { name: S['conv.add.attach']! })).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('a reader start whose answer was lost says it may have gone through; Check again only reads', async () => {
    let starts = 0, reads = 0;
    bootFixtureCore({ rules: [
      reply(urlRoutes.readerStart, () => { starts += 1; return answers.pending5xx(); }),
      reply(urlRoutes.markdown, () => { reads += 1; return answers.refused(404, 'NOT_FOUND'); }),
    ] });
    const { type, press, onAdd, dialog } = open();
    type('https://example.com/notes');
    press(S['conv.add.attach']!);
    expect(await within(dialog).findByText(S['conv.add.url.starting']!)).toBeInTheDocument();
    press(S['conv.add.url.checkAgain']!);
    await waitFor(() => expect(reads).toBe(2));
    expect(starts).toBe(1);
    expect(await within(dialog).findByText(S['conv.add.url.starting']!)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it.each([
    ['asis', 'https://example.com/to-private', S['conv.add.url.redirected']!],
    ['markdown', 'https://example.com/missing', fill(S['conv.add.url.status']!, { status: '404' })],
    ['asis', 'https://example.com/a.zip', S['conv.add.url.notText']!],
  ])('%s: %s attaches nothing and says why', async (mode, url, line) => {
    const { type, press, onAdd, onClose, dialog } = open();
    if (mode === 'asis') fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(S['conv.add.url.asis']!) }));
    type(url);
    await act(async () => { press(S['conv.add.attach']!); });
    expect(await within(dialog).findByText(line)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
