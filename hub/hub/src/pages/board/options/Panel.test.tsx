// The drawer as the user meets it: opens on the tile's options, nothing leaves before Save, Save is aria-disabled
// with a reason (and a press opens the invalid section), the preview follows the draft, Reset all goes back to
// the start view, loading and failure states.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's leave guard, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmbedValue } from '../embed/build';
import type { Catalog, TileProgram } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { OptionsPanel, type Saved } from './index';
import { parseProgramTile } from '../model/persist';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CAT = catalog as unknown as Catalog;

function Host({ program, view, params, dropped, defaults, running = true, onSave, cat = CAT, catFailed, onOpenComputer }: { program: TileProgram; view?: string; params?: Readonly<Record<string, EmbedValue>>; dropped?: readonly string[]; defaults?: Record<string, EmbedValue>; running?: boolean; onSave: (s: Saved) => void; cat?: Catalog | null; catFailed?: boolean; onOpenComputer?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <OptionsPanel isOpen={open} onOpenChange={setOpen} cat={cat} catFailed={catFailed} onRetry={() => undefined} program={program} tileName={`${program}-2`} computerName="atlas" view={view} params={params} dropped={dropped} defaults={defaults} running={running} onOpenComputer={onOpenComputer} onSave={onSave} />
  );
}

const press = async (el: Element) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const wait = (ms = 30) => act(async () => new Promise((r) => window.setTimeout(r, ms)));
const dialog = () => screen.getByRole('dialog');
const saveButton = () => within(dialog()).getByRole('button', { name: 'Save' });
const section = (name: string) => within(dialog()).getByRole('button', { name: new RegExp('^' + name) });
const row = (id: string) => dialog().querySelector(`[data-opt="${id}"]`) as HTMLElement;
const type = async (el: Element, value: string) => {
  await act(async () => {
    fireEvent.change(el, { target: { value } });
    fireEvent.blur(el);
  });
};
/** A phone viewport for useIsPhone (kit PHONE_QUERY). */
const phone = () => {
  const mq = (query: string) => ({ matches: query.includes('600px'), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  vi.spyOn(window, 'matchMedia').mockImplementation(mq as never);
};

afterEach(() => vi.restoreAllMocks());
const unmountAll = () => cleanup();
const css = readFileSync(path.join(import.meta.dirname, 'options.module.css'), 'utf8');

describe('the Options drawer', () => {
  it('names the tile, says Save reloads it, and Save waits for a change (aria-disabled, not disabled)', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" onSave={onSave} />);
    expect(within(dialog()).getByRole('heading', { name: 'Options for terminal-2' })).toBeInTheDocument();
    expect(within(dialog()).getByText('On atlas')).toBeInTheDocument();
    expect(within(dialog()).getByText('Saving reloads terminal-2.')).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(saveButton()).not.toBeDisabled();
    await press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a stopped tile says the options apply when it next opens; files warns to save work first', () => {
    const { unmount } = render(<Host program="terminal" running={false} onSave={() => undefined} />);
    expect(within(dialog()).getByText('Saved options apply when terminal-2 next opens.')).toBeInTheDocument();
    unmount();
    render(<Host program="files" view="root" onSave={() => undefined} />);
    expect(within(dialog()).getByText('Saving reloads files-2. Save your work in it first.')).toBeInTheDocument();
  });

  it('opens the first section with a change; a change in a field reaches onSave only on Save, cleaned', async () => {
    const onSave = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<Host program="terminal" params={{ cursorStyle: 'bar' }} onSave={onSave} />);
    expect(section('Cursor')).toHaveAttribute('aria-expanded', 'true');
    expect(section('Text')).toHaveAttribute('aria-expanded', 'false');
    await press(section('Text'));
    expect(section('Cursor')).toHaveAttribute('aria-expanded', 'false');
    const size = within(dialog()).getByRole('textbox', { name: 'Font size' });
    await act(async () => {
      fireEvent.change(size, { target: { value: '18' } });
      fireEvent.blur(size);
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(dialog().querySelector('iframe')).toBeNull();
    expect(saveButton()).not.toHaveAttribute('aria-disabled');
    await press(saveButton());
    expect(onSave).toHaveBeenCalledWith({ params: { cursorStyle: 'bar', fontSize: 18 } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the preview draws the draft\'s font size and theme, locally', async () => {
    render(<Host program="terminal" params={{ fontSize: 22, theme: { background: '#102030', foreground: '#ffeeaa' } }} onSave={() => undefined} />);
    const preview = within(dialog()).getByRole('figure', { name: 'Terminal preview' });
    const term = preview.firstElementChild as HTMLElement;
    expect(term.style.fontSize).toBe('22px');
    expect(term.style.backgroundColor).toMatch(/^(#102030|rgb\(16, 32, 48\))$/);
  });

  it('with no theme kept, the preview draws the Board default (the Hub look); a kept theme wins', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" defaults={{ theme: { background: '#141414', foreground: '#eeeeee' }, 'hide-toolbar': true }} onSave={onSave} />);
    const term = within(dialog()).getByRole('figure', { name: 'Terminal preview' }).firstElementChild as HTMLElement;
    expect(term.style.backgroundColor).toMatch(/^(#141414|rgb\(20, 20, 20\))$/);
    unmountAll();
    render(<Host program="terminal" params={{ theme: { background: '#102030' } }} defaults={{ theme: { background: '#141414' } }} onSave={onSave} />);
    const kept = within(dialog()).getByRole('figure', { name: 'Terminal preview' }).firstElementChild as HTMLElement;
    expect(kept.style.backgroundColor).toMatch(/^(#102030|rgb\(16, 32, 48\))$/);
  });

  it('the preview draws only values Save would keep: a refused theme shows the default until fixed', async () => {
    render(<Host program="terminal" params={{ theme: { foreground: '#ffeeaa' } }} onSave={() => undefined} />);
    const term = within(dialog()).getByRole('figure', { name: 'Terminal preview' }).firstElementChild as HTMLElement;
    const editor = within(dialog()).getByRole('textbox', { name: 'Theme JSON' });
    await type(editor, JSON.stringify({ foreground: '#123456', note: 'x'.repeat(2100) }));
    expect(term.style.color).toMatch(/^(#ffffff|rgb\(255, 255, 255\))$/);
    await type(editor, JSON.stringify({ foreground: '#123456' }));
    expect(term.style.color).toMatch(/^(#123456|rgb\(18, 52, 86\))$/);
  });

  it('an invalid field: the section shows "1 to fix", Save names the place and a press opens it without saving', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" onSave={onSave} />);
    await press(section('Side panel'));
    const page = within(dialog()).getByRole('textbox', { name: 'Page' });
    await type(page, 'docs.example.com');
    expect(within(dialog()).getByText('Start with http:// or https://')).toBeInTheDocument();
    await press(section('Side panel'));
    expect(section('Side panel')).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog()).getByText('1 to fix')).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    await press(saveButton());
    await wait();
    expect(onSave).not.toHaveBeenCalled();
    expect(section('Side panel')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(within(dialog()).getByRole('textbox', { name: 'Page' }));
  });

  it('an invalid desktop Width behind a collapsed Desktop: a Save press opens Desktop and focuses Width', async () => {
    const onSave = vi.fn();
    render(<Host program="display" params={{ override_width: '1280' }} onSave={onSave} />);
    if (section('Desktop').getAttribute('aria-expanded') !== 'true') await press(section('Desktop'));
    expect(within(dialog()).queryByRole('textbox', { name: 'Height' })).toBeNull(); // the catalogue refuses override_height
    await type(within(dialog()).getByRole('textbox', { name: 'Width' }), '1'.repeat(2047)); // over the 2048-character value limit
    await press(section('Desktop'));
    expect(section('Desktop')).toHaveAttribute('aria-expanded', 'false');
    await press(saveButton());
    await wait();
    expect(onSave).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(dialog()).getByRole('textbox', { name: 'Width' }));
  });

  it('files on Search with an empty field: the inline error shows at once and Save is held', async () => {
    const onSave = vi.fn();
    render(<Host program="files" view="root" onSave={onSave} />);
    await press(within(dialog()).getByRole('radio', { name: 'Search' }));
    // The folder starts at /; what to search for has no start value.
    expect(within(dialog()).getByRole('textbox', { name: 'Search in' })).toHaveValue('/');
    expect(within(dialog()).queryByText('Enter a folder to search in')).toBeNull();
    expect(within(dialog()).getByText('Enter what to search for')).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    await press(saveButton());
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Search in' }), { target: { value: '/srv' } });
      fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Search for' }), { target: { value: 'log' } });
    });
    await press(saveButton());
    expect(onSave).toHaveBeenCalledWith({ view: 'search', params: { directory: '/srv', q: 'log' } });
  });

  describe('a view switch starts a folder at / and never carries a value into a field that means something else', () => {
    const radio = (name: string) => within(dialog()).getByRole('radio', { name });
    const box = (name: string) => within(dialog()).getByRole('textbox', { name });

    it('Files: Root → A folder shows / with no error; → A file shows an empty file path, its error, and Save is held', async () => {
      const onSave = vi.fn();
      render(<Host program="files" view="root" onSave={onSave} />);
      await press(radio('A folder'));
      expect(box('Folder')).toHaveValue('/');
      expect(within(dialog()).queryByText('Enter a folder for this view')).toBeNull();
      await press(radio('A file'));
      expect(box('File')).toHaveValue('');
      expect(within(dialog()).getByText('Enter a file')).toBeInTheDocument();
      await press(saveButton());
      expect(onSave).not.toHaveBeenCalled();
      await press(radio('A folder'));
      expect(box('Folder')).toHaveValue('/');
      await press(saveButton());
      expect(onSave).toHaveBeenCalledWith({ view: 'folder', params: { path: '/' } });
    });

    it('Files: a typed file path comes back after a visit to A folder, which showed /; Save writes what shows', async () => {
      const onSave = vi.fn();
      render(<Host program="files" view="root" onSave={onSave} />);
      await press(radio('A file'));
      await type(box('File'), '/etc/hosts');
      await press(radio('A folder'));
      expect(box('Folder')).toHaveValue('/');
      await type(box('Folder'), '/srv');
      await press(radio('A file'));
      expect(box('File')).toHaveValue('/etc/hosts');
      await press(saveButton());
      expect(onSave).toHaveBeenCalledWith({ view: 'editor', params: { path: '/etc/hosts' } });
    });

    it('Files: a cleared folder shows the required error and holds Save (no seed while editing)', async () => {
      const onSave = vi.fn();
      render(<Host program="files" view="root" onSave={onSave} />);
      await press(radio('A folder'));
      await type(box('Folder'), '');
      expect(box('Folder')).toHaveValue('');
      expect(within(dialog()).getByText('Enter a folder for this view')).toBeInTheDocument();
      await press(saveButton());
      expect(onSave).not.toHaveBeenCalled();
    });

    it('Code: A folder shows / with no error; One extension has an empty optional folder; back to A folder: /', async () => {
      const onSave = vi.fn();
      render(<Host program="code" view="root" onSave={onSave} />);
      await press(radio('A folder'));
      expect(box('Folder')).toHaveValue('/');
      expect(within(dialog()).queryByText('Enter a folder for this view')).toBeNull();
      await press(radio('One extension'));
      expect(box('Folder (optional)')).toHaveValue('');
      await type(box('Extension'), 'ms-python.python');
      await press(saveButton());
      expect(onSave).toHaveBeenCalledWith({ view: 'extension', params: { extension: 'ms-python.python' } });
    });

    it('Code: back from One extension, A folder has its / again and saves it', async () => {
      const onSave = vi.fn();
      render(<Host program="code" view="root" onSave={onSave} />);
      await press(radio('A folder'));
      await press(radio('One extension'));
      await press(radio('A folder'));
      expect(box('Folder')).toHaveValue('/');
      await press(saveButton());
      expect(onSave).toHaveBeenCalledWith({ view: 'editor', params: { folder: '/' } });
    });

    it.each([
      ['files', 'folder', 'Folder', { path: '/' }],
      ['code', 'editor', 'Folder', { folder: '/' }],
    ] as const)('a %s tile saved on %s without its folder opens at / with Save enabled, and Save stores it', async (program, view, label, params) => {
      const onSave = vi.fn();
      render(<Host program={program} view={view} onSave={onSave} />);
      expect(box(label)).toHaveValue('/');
      expect(saveButton()).not.toHaveAttribute('aria-disabled');
      await press(saveButton());
      expect(onSave).toHaveBeenCalledWith({ view, params });
    });

    it('a tile that already holds its folder opens unchanged: Save waits for a change', () => {
      render(<Host program="files" view="folder" params={{ path: '/srv' }} onSave={() => undefined} />);
      expect(box('Folder')).toHaveValue('/srv');
      expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    });

    it('a tile saved with no view opens on the start view, not a view that needs a field it never had', () => {
      render(<Host program="files" onSave={() => undefined} />);
      expect(radio('Root folder')).toBeChecked();
      unmountAll();
      render(<Host program="code" onSave={() => undefined} />);
      expect(radio('Default folder')).toBeChecked();
    });
  });

  it('Reset all clears every option and goes back to the start view, still needing Save', async () => {
    const onSave = vi.fn();
    render(<Host program="files" view="folder" params={{ path: '/srv', sort: 'size' }} onSave={onSave} />);
    expect(within(dialog()).getByRole('radio', { name: 'A folder' })).toBeChecked();
    await press(within(dialog()).getByRole('button', { name: 'Reset all' }));
    expect(within(dialog()).getByRole('radio', { name: 'Root folder' })).toBeChecked();
    expect(onSave).not.toHaveBeenCalled();
    await press(saveButton());
    expect(onSave).toHaveBeenCalledWith({ view: 'root', params: {} });
  });

  it('Notes: a Page needs your user id and the page id; the sidebar shows by default, and Edit writes the share mode', async () => {
    const onSave = vi.fn();
    render(<Host program="notes" view="home" onSave={onSave} />);
    await press(within(dialog()).getByRole('radio', { name: 'Page' }));
    expect(within(dialog()).getByText('Enter your user id in the notebook')).toBeInTheDocument();
    expect(within(dialog()).getByText('Enter a page id')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Your user id in the notebook' }), { target: { value: 'a'.repeat(24) } });
      fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Page id' }), { target: { value: 'b'.repeat(24) } });
    });
    await press(section('Page parts'));
    const side = within(dialog()).getByRole('switch', { name: 'Show the notebook sidebar' });
    expect(side).toBeChecked();
    await press(side);
    await press(within(dialog()).getByRole('radio', { name: 'Edit' }));
    await press(saveButton());
    expect(onSave).toHaveBeenCalledWith({ view: 'node', params: { userId: 'a'.repeat(24), nodeId: 'b'.repeat(24), sidebar: 'hidden', mode: 'readwrite' } });
  });

  it('a hide flag is a switch named after the thing; the terminal toolbar is off on a Board: on writes the show value', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" onSave={onSave} />);
    await press(section('Window'));
    const toolbar = within(dialog()).getByRole('switch', { name: 'Toolbar' });
    expect(toolbar).not.toBeChecked();
    await press(toolbar);
    await press(saveButton());
    expect(onSave).toHaveBeenCalledWith({ params: { 'hide-toolbar': false } });
  });

  it('dirty close asks first, inline', async () => {
    render(<Host program="terminal" onSave={() => undefined} />);
    expect(section('Session')).toHaveAttribute('aria-expanded', 'true');
    await act(async () => {
      fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Start in' }), { target: { value: '/srv' } });
    });
    await press(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog()).getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
  });

  it('saved options the catalogue no longer accepts show the notice band', () => {
    render(<Host program="terminal" params={{ shell: '/bin/sh' } as never} onSave={() => undefined} />);
    expect(within(dialog()).getByText('Some saved options no longer apply and will be removed when you save.')).toBeInTheDocument();
    expect(saveButton()).not.toHaveAttribute('aria-disabled');
  });

  it('loading shows a skeleton; a failed catalogue offers Try again and no Save', () => {
    const { unmount } = render(<Host program="terminal" cat={null} onSave={() => undefined} />);
    expect(within(dialog()).queryByRole('button', { name: 'Save' })).toBeNull();
    unmount();
    render(<Host program="terminal" cat={null} catFailed onSave={() => undefined} />);
    expect(within(dialog()).getByText('Options could not be loaded')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('display: picking a quality card writes its preset; Custom opens Fine-tune', async () => {
    const onSave = vi.fn();
    render(<Host program="display" onSave={onSave} />);
    expect(within(dialog()).getByRole('radio', { name: /Sharp text/ })).toBeChecked();
    await press(within(dialog()).getByRole('radio', { name: /Low bandwidth/ }));
    expect(within(dialog()).queryByRole('textbox', { name: 'Bandwidth limit' })).toBeNull();
    await press(within(dialog()).getByRole('radio', { name: /Custom/ }));
    expect(within(dialog()).getByRole('textbox', { name: 'Bandwidth limit' })).toHaveValue('2');
    await press(saveButton());
    expect(onSave).toHaveBeenCalledWith({ params: { encoding: 'jpeg', bandwidth_limit: 2000000 } });
  });
});

describe('display options of the catalogue', () => {
  const open = async (name: string) => { if (section(name).getAttribute('aria-expanded') !== 'true') await press(section(name)); };

  it('Fine-tune writes Fixed quality', async () => {
    const onSave = vi.fn();
    render(<Host program="display" params={{ quality_mode: 'best' }} onSave={onSave} />);
    expect(within(dialog()).getByRole('radio', { name: /Custom/ })).toBeChecked();
    await type(within(dialog()).getByRole('textbox', { name: 'Fixed quality' }), '40');
    await press(saveButton());
    expect(onSave).toHaveBeenLastCalledWith({ params: { quality_mode: 'best', quality: 40 } });
  });

  it('Sharp text clears values the tile already holds (encoding included), not only a fresh draft', async () => {
    const onSave = vi.fn();
    render(<Host program="display" params={{ encoding: 'png', video: false }} onSave={onSave} />);
    expect(within(dialog()).getByRole('radio', { name: /Custom/ })).toBeChecked();
    await press(within(dialog()).getByRole('radio', { name: /Sharp text/ }));
    expect(within(dialog()).getByRole('radio', { name: /Sharp text/ })).toBeChecked();
    await press(saveButton());
    expect(onSave).toHaveBeenLastCalledWith({ params: {} });
  });

  it('a preset card clears Image quality and Fixed quality', async () => {
    const onSave = vi.fn();
    render(<Host program="display" params={{ quality_mode: 'best', quality: 40 }} onSave={onSave} />);
    await press(within(dialog()).getByRole('radio', { name: /Sharp text/ }));
    expect(within(dialog()).queryByRole('textbox', { name: 'Fixed quality' })).toBeNull();
    await press(saveButton());
    expect(onSave).toHaveBeenLastCalledWith({ params: {} });
  });

  it('Look holds Colour scheme, Theme and Font; a font name the catalogue refuses is held with its own line', async () => {
    const onSave = vi.fn();
    render(<Host program="display" params={{ colorScheme: 'dark' }} onSave={onSave} />);
    await open('Look');
    expect(within(row('colorScheme')).getByRole('radiogroup', { name: 'Colour scheme' })).toHaveAccessibleDescription(/System wins over Dark appearance/);
    expect(row('theme')).not.toBeNull();
    await type(within(row('font')).getByRole('textbox', { name: 'Font' }), 'Inter;x');
    expect(within(dialog()).getByText('Use letters, digits, spaces, _ and - only')).toBeInTheDocument();
    await type(within(row('font')).getByRole('textbox', { name: 'Font' }), 'IBM Plex Mono');
    await press(saveButton());
    expect(onSave).toHaveBeenLastCalledWith({ params: { colorScheme: 'dark', font: 'IBM Plex Mono' } });
  });

  it('Input takes a mouse wheel speed within the catalogue bounds', async () => {
    const onSave = vi.fn();
    render(<Host program="display" params={{ readonly: true }} onSave={onSave} />);
    await open('Input');
    await type(within(row('scroll_speed')).getByRole('textbox', { name: 'Mouse wheel speed' }), '1.5');
    expect(within(row('touchpad_scroll_scale')).getByRole('textbox', { name: 'Touchpad scroll speed' })).toHaveValue('');
    await press(saveButton());
    expect(onSave).toHaveBeenLastCalledWith({ params: { readonly: true, scroll_speed: 1.5 } });
  });

  it('Advanced offers the clipboard watch as Default · Off (its default depends on the browser) and no recording or retry row anywhere', async () => {
    const onSave = vi.fn();
    render(<Host program="display" params={{ clipboard_poll: false }} onSave={onSave} />);
    await open('Advanced');
    const watch = within(row('clipboard_poll')).getByRole('radiogroup', { name: "Watch this device's clipboard" });
    expect(within(watch).getByRole('radio', { name: 'Off' })).toBeChecked();
    expect(within(watch).queryByRole('radio', { name: 'On' })).toBeNull();
    expect(row('clipboard_poll')).toHaveTextContent("Default depends on the browser: off in Firefox and in Safari over https.");
    await press(within(watch).getByRole('radio', { name: 'Default' }));
    await press(saveButton());
    expect(onSave).toHaveBeenLastCalledWith({ params: {} });
  });

  it('after a load: a stored tile whose options the load dropped shows the notice and an enabled Save, ids only', async () => {
    const t = parseProgramTile({ project: 'p1a2b3', computer: 'c0ffee', program: 'display', session: 1, params: { readonly: true, override_height: '720', record: true } });
    expect(t?.params).toEqual({ readonly: true });
    expect(t?.dropped).toEqual(['override_height', 'record']);
    const onSave = vi.fn();
    render(<Host program="display" params={t?.params} dropped={t?.dropped} onSave={onSave} />);
    expect(within(dialog()).getByText('Some saved options no longer apply and will be removed when you save.')).toBeInTheDocument();
    expect(saveButton()).not.toHaveAttribute('aria-disabled');
    await press(saveButton());
    expect(onSave).toHaveBeenLastCalledWith({ params: { readonly: true } });
  });

  it('a stored tile the load kept whole shows no stale-options notice and Save waits for a change', () => {
    const t = parseProgramTile({ project: 'p1a2b3', computer: 'c0ffee', program: 'display', session: 1, params: { readonly: true } });
    expect(t?.dropped).toBeUndefined();
    render(<Host program="display" params={t?.params} dropped={t?.dropped} onSave={() => undefined} />);
    expect(within(dialog()).queryByText('Some saved options no longer apply and will be removed when you save.')).toBeNull();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('no recording, retry or removed row is drawn in any section', async () => {
    render(<Host program="display" params={{ clipboard_poll: false }} onSave={() => undefined} />);
    await open('Advanced');
    expect(row('scroll')).not.toBeNull();
    for (const id of ['record', 'record_codec', 'record_format', 'record_fps', 'reconnect_count', 'slow_retry_delay', 'slow_retry_max_ms', 'soft_giveup_attempts', 'soft_giveup_ms', 'web_notifications', 'notification_connection_type', 'override_height']) {
      expect(row(id), id).toBeNull();
    }
  });
});

describe('the panel: help lines and the phone layout', () => {
  it('every control is described by its help line (aria-describedby)', () => {
    render(<Host program="terminal" params={{ fontSize: 22, backgroundColor: '#000000' }} onSave={() => undefined} />);
    expect(within(dialog()).getByRole('textbox', { name: 'Font size' })).toHaveAccessibleDescription('In pixels.');
  });

  it('a select row and a switch row are described too', async () => {
    render(<Host program="display" params={{ clipboard: false }} onSave={() => undefined} />);
    expect(within(row('clipboard')).getByRole('switch')).toHaveAccessibleDescription(/Copy and paste between this device/);
    unmountAll();
    render(<Host program="terminal" params={{ theme: { foreground: '#ffeeaa' } }} onSave={() => undefined} />);
    expect(row('theme').querySelector('button[aria-haspopup]')).toHaveAccessibleDescription(/Colours for text, background, cursor/);
  });

  it('a bad theme JSON marks the editor invalid and ties the error to it', async () => {
    render(<Host program="terminal" params={{ theme: { foreground: '#ffeeaa' } }} onSave={() => undefined} />);
    const editor = within(dialog()).getByRole('textbox', { name: 'Theme JSON' });
    await type(editor, '{');
    expect(editor).toHaveAttribute('aria-invalid', 'true');
    expect(editor).toHaveAccessibleDescription(/Use a JSON object/);
  });

  it('the page-part ticks are one named group', () => {
    render(<Host program="files" view="root" params={{ hideHeader: true }} onSave={() => undefined} />);
    const group = within(dialog()).getByRole('group', { name: 'Show' });
    expect(within(group).getAllByRole('checkbox').length).toBeGreaterThan(1);
    expect(group).toHaveAccessibleDescription(/Minimal hides them all/);
  });

  it('on a phone the reset still follows the control in the DOM (the kit field row stacks the label above, and the reset sits after the field)', () => {
    phone();
    render(<Host program="terminal" params={{ fontSize: 22 }} onSave={() => undefined} />);
    const reset = within(row('fontSize')).getByRole('button', { name: 'Back to default' });
    const field = within(row('fontSize')).getByRole('textbox', { name: 'Font size' });
    expect(field.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row('fontSize')).toHaveAttribute('data-sg-row');
  });

  it('on a phone a switch row (no label column) keeps its control before the reset', () => {
    phone();
    render(<Host program="display" params={{ clipboard: false }} onSave={() => undefined} />);
    const sw = within(row('clipboard')).getByRole('switch');
    const reset = within(row('clipboard')).getByRole('button', { name: 'Back to default' });
    expect(sw.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('on a wide drawer the reset stays after the control', () => {
    render(<Host program="terminal" params={{ fontSize: 22 }} onSave={() => undefined} />);
    const reset = within(row('fontSize')).getByRole('button', { name: 'Back to default' });
    const field = within(row('fontSize')).getByRole('textbox', { name: 'Font size' });
    expect(field.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the preview is 96 px tall on the phone sheet, 132 px in the drawer', () => {
    expect(css).toMatch(/\.sheet \.term \{\s*block-size: 96px;/);
    expect(css).toMatch(/\n\.term \{[^}]*block-size: 132px;/);
  });

  it('the phone sheet stacks the rows; the 640 px drawer keeps label | control | reset (its 592 px body is not a phone)', () => {
    const { unmount } = render(<Host program="terminal" onSave={() => undefined} />);
    const body = () => dialog().querySelector('[class*="sheet"]');
    expect(body()).toBeNull();
    unmount();
    phone();
    render(<Host program="terminal" onSave={() => undefined} />);
    expect(body()).not.toBeNull();
    expect(css).not.toMatch(/@container \(width < 600px\)/);
  });

  it('the row reset and Reset all close the custom theme editor', async () => {
    const { unmount } = render(<Host program="terminal" params={{ theme: { foreground: '#ffeeaa' } }} onSave={() => undefined} />);
    expect(within(dialog()).getByRole('textbox', { name: 'Theme JSON' })).toBeInTheDocument();
    await press(within(row('theme')).getByRole('button', { name: 'Back to default' }));
    expect(within(dialog()).queryByRole('textbox', { name: 'Theme JSON' })).toBeNull();
    unmount();
    render(<Host program="terminal" params={{ theme: { foreground: '#ffeeaa' } }} onSave={() => undefined} />);
    await press(within(dialog()).getByRole('button', { name: 'Reset all' }));
    expect(within(dialog()).queryByRole('textbox', { name: 'Theme JSON' })).toBeNull();
  });

  it('number fields take the catalogue bounds: the stepper starts at the minimum, a typed value is kept in range', async () => {
    render(<Host program="terminal" params={{ lineHeight: 2 }} onSave={() => undefined} />);
    const size = within(dialog()).getByRole('textbox', { name: 'Font size' });
    await press(within(row('fontSize')).getByRole('button', { name: 'Increase' }));
    expect(size).toHaveValue('8');
    await type(size, '100');
    expect(size).toHaveValue('72');
  });

  it('a typed out-of-range value is clamped on commit, and Save sends exactly the clamped value shown', async () => {
    const onSave = vi.fn();
    render(<Host program="terminal" params={{ lineHeight: 2 }} onSave={onSave} />);
    const size = within(dialog()).getByRole('textbox', { name: 'Font size' });
    await type(size, '100');
    expect(size).toHaveValue('72');
    expect(within(row('fontSize')).queryByText(/Use 8 to 72/)).toBeNull();
    expect(saveButton()).not.toHaveAttribute('aria-disabled', 'true');
    await press(saveButton());
    expect(onSave).toHaveBeenLastCalledWith({ params: { lineHeight: 2, fontSize: 72 } });
    unmountAll();
    const low = vi.fn();
    render(<Host program="terminal" params={{ lineHeight: 2 }} onSave={low} />);
    const again = within(dialog()).getByRole('textbox', { name: 'Font size' });
    await type(again, '2');
    expect(again).toHaveValue('8');
    await press(saveButton());
    expect(low).toHaveBeenLastCalledWith({ params: { lineHeight: 2, fontSize: 8 } });
  });
});

describe('kit props', () => {
  it('a Default · On · Off row and the Fit · Fixed size row are described by their help line', () => {
    render(<Host program="terminal" params={{ readonly: true }} onSave={() => undefined} />);
    expect(within(row('readonly')).getByRole('radiogroup', { name: 'View only' })).toHaveAccessibleDescription(/typing is blocked/);
    unmountAll();
    render(<Host program="display" params={{ override_width: '1280' }} onSave={() => undefined} />);
    expect(within(row('override_width')).getByRole('radiogroup', { name: 'Desktop size' })).toHaveAccessibleDescription(/Fit the tile: follows the tile's width/);
  });

  it('the Fine-tune Video row is described by its help line', async () => {
    render(<Host program="display" params={{ video: true }} onSave={() => undefined} />);
    if (!row('video')) await press(section('Quality'));
    expect(within(row('video')).getByRole('radiogroup', { name: 'Video' })).toHaveAccessibleDescription(/Allow video encodings/);
  });

  it('Opens is described by the chosen view’s help line', () => {
    render(<Host program="browser" view="display" onSave={() => undefined} />);
    expect(within(row('view')).getByRole('radiogroup', { name: 'Opens' })).toHaveAccessibleDescription("The browser's display, full size.");
  });

  it('theme presets show their colours, font presets are drawn in their font', async () => {
    render(<Host program="terminal" params={{ fontSize: 14 }} onSave={() => undefined} />);
    if (!row('theme')) await press(section('Colours'));
    await press(row('theme').querySelector('button[aria-haspopup]') as Element);
    const dracula = screen.getByRole('option', { name: 'Dracula' });
    expect(dracula.querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(3);
    await act(async () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }));
    await press(row('fontFamily').querySelector('button[aria-haspopup]') as Element);
    expect(within(screen.getByRole('option', { name: 'Fira Code' })).getByText('Fira Code').style.fontFamily).toMatch(/Fira Code/);
  });

  it('an empty number field with a known automatic value says so (placeholder)', async () => {
    render(<Host program="display" onSave={() => undefined} />);
    expect(row('vrefresh').querySelector('input[aria-label="Refresh rate"]')).toHaveAttribute('placeholder', 'Automatic');
  });
});

describe('links and defaults', () => {
  it('the computer name links to Computers when the board can open it; plain text otherwise', async () => {
    const open = vi.fn();
    render(<Host program="terminal" onSave={() => undefined} onOpenComputer={open} />);
    await press(within(dialog()).getByRole('button', { name: 'Open atlas in Computers' }));
    expect(open).toHaveBeenCalledTimes(1);
    unmountAll();
    render(<Host program="terminal" onSave={() => undefined} />);
    expect(within(dialog()).getByText('On atlas')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: /in Computers/ })).toBeNull();
  });

  it('an empty number field says Default (integer row); one with a known automatic value keeps its own word', () => {
    render(<Host program="terminal" params={{ lineHeight: 2 }} onSave={() => undefined} />);
    expect(within(dialog()).getByRole('textbox', { name: 'Font size' })).toHaveAttribute('placeholder', 'Default');
    unmountAll();
    render(<Host program="display" onSave={() => undefined} />);
    expect(row('vrefresh').querySelector('input[aria-label="Refresh rate"]')).toHaveAttribute('placeholder', 'Automatic');
  });

  it('files themes show three swatch colours each; Default shows none', async () => {
    render(<Host program="files" view="root" params={{ theme: 'nord' }} onSave={() => undefined} />);
    await press(row('theme').querySelector('button[aria-haspopup]') as Element);
    expect(screen.getByRole('option', { name: 'Nord' }).querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(3);
    expect(screen.getByRole('option', { name: /^Default/ }).querySelector('[aria-hidden="true"] > span')).toBeNull();
  });
});

describe('Open in Computers with unsaved options', () => {
  // The board wires the link to a router navigation (followPageLink → go); a dirty draft must ask first.
  async function inBoard() {
    const nav: { to: (() => void) | null } = { to: null };
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <Host program="terminal" onSave={() => undefined} onOpenComputer={() => nav.to?.()} /> }),
      history: createMemoryHistory({ initialEntries: ['/board'] }),
    });
    nav.to = () => void router.navigate({ to: '/computers' as never, search: { sel: 'atlas' } as never });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    return router;
  }
  const startIn = () => within(dialog()).getByRole('textbox', { name: 'Start in' });
  const openLink = () => within(dialog()).getByRole('button', { name: 'Open atlas in Computers' });

  it('a dirty draft asks before leaving; Keep editing stays with the draft, Discard goes to Computers', async () => {
    const router = await inBoard();
    await act(async () => {
      fireEvent.change(startIn(), { target: { value: '/srv' } });
    });
    await press(openLink());
    await wait(50);
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Discard changes?');
    expect(router.state.location.pathname).toBe('/board');
    await press(within(dialog()).getByRole('button', { name: 'Keep editing' }));
    await wait(50);
    expect(router.state.location.pathname).toBe('/board');
    expect(startIn()).toHaveValue('/srv');
    await press(openLink());
    await wait(50);
    await press(within(dialog()).getByRole('button', { name: 'Discard' }));
    await wait(50);
    expect(router.state.location.pathname).toBe('/computers');
  });

  it('an unchanged draft goes straight to Computers', async () => {
    const router = await inBoard();
    await press(openLink());
    await wait(50);
    expect(router.state.location.pathname).toBe('/computers');
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
  });
});

describe('dropdowns', () => {
  it('the font list: Default first, says which fonts it means, presets sorted by name, Custom last', async () => {
    render(<Host program="terminal" params={{ fontSize: 14 }} onSave={() => undefined} />);
    if (!row('fontFamily')) await press(section('Text'));
    await press(row('fontFamily').querySelector('button[aria-haspopup]') as Element);
    const names = screen.getAllByRole('option').map((o) => o.querySelector('span > span')?.textContent ?? '');
    expect(names).toEqual(['Default', 'Cascadia Code', 'Consolas', 'Fira Code', 'JetBrains Mono', 'Menlo', 'Ubuntu Mono', 'Custom…']);
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('The first of Consolas, Liberation Mono, Menlo or Courier this device has');
  });

  it('encoding options say what WebP and Auto do', async () => {
    render(<Host program="display" params={{ encoding: 'png' }} onSave={() => undefined} />);
    if (!row('encoding')) await press(section('Quality'));
    await press(row('encoding').querySelector('button[aria-haspopup]') as Element);
    expect(screen.getByRole('option', { name: /^WebP/ })).toHaveTextContent('Keeps text sharp.');
    expect(screen.getByRole('option', { name: /^Auto/ })).toHaveTextContent('The server chooses; busy windows may switch to video, which can look blurry.');
  });
});
