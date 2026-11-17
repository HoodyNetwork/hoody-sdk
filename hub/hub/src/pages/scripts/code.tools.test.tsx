// The Code tab's editor: the script is coloured by its file's language, and its toolbar copies the code, saves it as a
// file named like the script.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, R1, settle } from '@core/test/env';
import { CODE_SAVE_MAX, CodeTab, codeFileName, codeLangOf } from './parts/CodeTab';
import type { EditorState } from './parts/useEditor';
import strings from './strings.en.json';
import type { CompScripts, ScriptItem } from './types';

const CODE = 'export default async function handler() {\n  return "ok";\n}\n';
const itemOf = (path: string) => ({ id: 'atlas.1111~x', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path, name: path.split('/').pop(), route: '/x', description: '', status: null, schedule: null, keyed: false, calls: null, failed: null, managed: null, ownershipUnknown: false, group: 'ok' }) as unknown as ScriptItem;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: {}, agent: {}, rows: [], summary: {}, instances: {}, aliases: [], deleted: [] } as unknown as CompScripts;
const edOf = (text: string) => ({
  file: { isPending: false, isError: false, data: { revision: 'r3', content: text }, refetch: () => undefined },
  text, setText: () => undefined, save: async () => undefined, canWrite: true, locked: false, dirty: false, changes: [],
  verdict: null, conflict: false, note: null, setNote: () => undefined, out: null, dismiss: () => undefined, keepMine: async () => undefined, loadTheirs: async () => undefined,
  versions: { isPending: false, data: [] }, restoreVersion: async () => undefined,
}) as unknown as EditorState;
const mount = async (o: { path?: string; text?: string } = {}) => {
  boot({ realm: R1 });
  queryClient.clear();
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CodeTab item={itemOf(o.path ?? 'default/1/webhooks/stripe.ts')} comp={comp} ed={edOf(o.text ?? CODE)} />, { wrapper: CoreQueryProvider }); await settle(); });
  return view;
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('the Code tab: colours', () => {
  it('reads the language from the file name; a file it has no colours for stays plain', () => {
    expect(codeLangOf('default/1/weather.ts')).toBe('ts');
    expect(codeLangOf('a/b.MTS')).toBe('ts');
    expect(codeLangOf('hook.js')).toBe('js');
    expect(codeLangOf('hook.mjs')).toBe('js');
    expect(codeLangOf('notes.txt')).toBeUndefined();
    expect(codeLangOf('Makefile')).toBeUndefined();
  });

  it('a TypeScript script is drawn in colours: a coloured mirror holds exactly the code, with more than one kind of token', async () => {
    const view = await mount();
    const mirror = view.container.querySelector('pre[aria-hidden="true"]');
    expect(mirror).not.toBeNull();
    expect(mirror!.textContent!.startsWith(CODE)).toBe(true);
    const kinds = new Set([...mirror!.querySelectorAll('span[class]')].map((n) => n.className));
    expect(kinds.size).toBeGreaterThan(1);
    // The editor itself still holds the text and the name.
    expect((screen.getByRole('textbox', { name: strings['code.label'] }) as HTMLTextAreaElement).value).toBe(CODE);
  });

  it('a file with no known language has no coloured mirror', async () => {
    const view = await mount({ path: 'default/1/notes.txt' });
    expect(view.container.querySelector('pre[aria-hidden="true"]')).toBeNull();
  });
});

describe('the Code tab: somebody saved first', () => {
  it('the banner says it in words and holds its two ways on in its actions, not inside the sentence', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const ed = { ...edOf(CODE), conflict: true, dirty: true } as unknown as EditorState;
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<CodeTab item={itemOf('default/1/weather.ts')} comp={comp} ed={ed} />, { wrapper: CoreQueryProvider }); await settle(); });
    const actions = view.container.querySelector('[data-outcome-actions]');
    expect(actions).not.toBeNull();
    expect([...actions!.querySelectorAll('button')].map((b) => b.textContent)).toEqual([strings['code.keepMine'], strings['code.loadTheirs']]);
    expect(screen.getByText(strings['code.conflictBody']).querySelector('button')).toBeNull();
  });
});

describe('the Code tab: copy, download', () => {
  it('Copy code puts the editor\'s text on the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['code.copy'] })); await settle(); });
    expect(writeText).toHaveBeenCalledWith(CODE);
  });

  it('Download saves the code as a file named like the script, without its folders', async () => {
    expect(codeFileName('default/1/webhooks/stripe.ts')).toBe('stripe.ts');
    expect(codeFileName('weather.ts')).toBe('weather.ts');
    const made: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { made.push(b); return 'blob:x'; }, revokeObjectURL: () => undefined }));
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['code.download'] })); await settle(); });
    expect(names).toEqual(['stripe.ts']);
    expect(made.length).toBe(1);
    expect(await made[0]!.text()).toBe(CODE);
    expect(screen.queryByText(strings['code.downloadRefused'])).toBeNull();
  });

  it('a script too long to save says so over the editor and saves nothing; the line can be closed', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await mount({ path: 'default/1/notes.txt', text: 'x'.repeat(CODE_SAVE_MAX + 1) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['code.download'] })); await settle(); });
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByText(strings['code.downloadRefused'])).toBeTruthy();
  });

  it('the toolbar adds exactly Copy code and Download after the editor\'s own two buttons', async () => {
    const view = await mount();
    const bar = screen.getByRole('button', { name: strings['code.copy'] }).parentElement!;
    const names = [...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
    expect(names.length).toBe(4);
    expect(names.slice(2)).toEqual([strings['code.copy'], strings['code.download']]);
    expect(view.container.querySelectorAll('button[aria-label]').length).toBeGreaterThanOrEqual(2);
  });
});
