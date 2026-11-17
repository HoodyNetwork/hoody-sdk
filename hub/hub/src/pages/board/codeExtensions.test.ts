// Vitest: what the Board keeps of the editor's extension list, the params a picked or
// typed extension opens with, and the one read on core's fixture transport.
import { answers, boardFixtureRoute, bootFixtureCore, CoreQueryProvider, fixtureWorld, reply } from '@core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { BoardComputer } from './computers';
import { EXTENSIONS_PATH, extensionParams, extensionsOf, listComplete, MAX_EXTENSIONS, useCodeExtensions } from './codeExtensions';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = (status = 'running') => ({ id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status }) as BoardComputer;
const wrapper = ({ children }: { children: ReactNode }) => createElement(CoreQueryProvider, null, children);
const inst = (publisher: string, name: string, status = 'running') => ({ logicalKey: (publisher + '.' + name).toLowerCase(), publisher, name, stagedVersion: null, installedVersion: '1.0.0', status, reason: '', installedOnly: true });
const staged = (publisher: string | null, name: string | null, status = 'ok') => ({ fileName: 'x.vsix', status, reason: null, scannable: true, canonicalName: true, logicalKey: null, publisher, name, version: '1.0.0', targetPlatform: null, sha256: null, sizeBytes: 1, stagedAt: null });
const list = (observed: unknown[] | null, desired: unknown[] | null) => ({
  instance: { id: 1, state: 'running', startedAt: null },
  observed: observed ? { status: 'ok', scope: 'instance', instanceId: 1, extensions: observed } : { status: 'unavailable', scope: 'instance', instanceId: 1 },
  desired: desired ? { status: 'ok', scope: 'shared-across-instances', extensions: desired } : { status: 'unavailable', scope: 'shared-across-instances' },
  partial: !observed || !desired,
  message: '',
});

describe('extensionParams', () => {
  it('opens a PUBLISHER.NAME id on the extension view, as the catalogue checks it', () => {
    expect(extensionParams('ms-python.python')).toEqual({ extension: 'ms-python.python' });
    expect(extensionParams('A-b.C-d9')).toEqual({ extension: 'A-b.C-d9' });
  });
  it('refuses anything that is not one id', () => {
    for (const bad of ['', 'python', 'a.b.c', '.b', 'a.', 'a b.c', 'a.b ', ' a.b', 'a_b.c', 'a/b.c', 'a.b\n']) expect(extensionParams(bad)).toBeNull();
  });
});

describe('extensionsOf', () => {
  it('keeps the installed ones, then the staged ones not installed yet, one per id, sorted by name', () => {
    expect(extensionsOf(list(
      [inst('ms-python', 'python'), inst('esbenp', 'prettier-vscode', 'stopped'), inst('bad', 'one', 'failed')],
      [staged('ms-python', 'python'), staged('golang', 'go'), staged('x', 'unreadable', 'unreadable'), staged(null, 'nopub')],
    ))).toEqual([
      { id: 'golang.go', name: 'go', publisher: 'golang', note: 'staged' },
      { id: 'bad.one', name: 'one', publisher: 'bad', note: 'failed' },
      { id: 'esbenp.prettier-vscode', name: 'prettier-vscode', publisher: 'esbenp', note: null },
      { id: 'ms-python.python', name: 'python', publisher: 'ms-python', note: null },
    ]);
  });
  it('one row per id whatever its case, the installed one first', () => {
    expect(extensionsOf(list([inst('MS-Python', 'Python')], [staged('ms-python', 'python')]))).toEqual([{ id: 'MS-Python.Python', name: 'Python', publisher: 'MS-Python', note: null }]);
    expect(extensionsOf(list([inst('a', 'b'), inst('A', 'B')], []))).toHaveLength(1);
  });
  it('leaves out an id the tile cannot open and cleans control characters', () => {
    expect(extensionsOf(list([inst('a b', 'c'), inst('a', 'b.c'), inst('a\u0000', 'b'), inst('', 'x'), { publisher: 7, name: 'x' }, null, 'x'], []))).toEqual([{ id: 'a.b', name: 'b', publisher: 'a', note: null }]);
  });
  it('a section that could not be read adds nothing; a body that is not a list gives none', () => {
    expect(extensionsOf(list(null, [staged('golang', 'go')]))).toEqual([{ id: 'golang.go', name: 'go', publisher: 'golang', note: 'staged' }]);
    expect(extensionsOf(list([inst('a', 'b')], null))).toEqual([{ id: 'a.b', name: 'b', publisher: 'a', note: null }]);
    expect(extensionsOf(list(null, null))).toEqual([]);
    for (const b of [null, undefined, 'x', [], { observed: { status: 'ok', extensions: 'x' } }]) expect(extensionsOf(b)).toEqual([]);
  });
  it('keeps at most MAX_EXTENSIONS', () => {
    const many = Array.from({ length: MAX_EXTENSIONS + 20 }, (_, i) => inst('p' + i, 'n' + i));
    expect(extensionsOf(list(many, []))).toHaveLength(MAX_EXTENSIONS);
  });
});

describe('useCodeExtensions', () => {
  it('reads the list once from code-1, then again on retry after a failure', async () => {
    let n = 0;
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => (++n === 1 ? answers.refused(500, 'internal-error') : answers.ok(list([inst('golang', 'go')], []))))] });
    const { result } = renderHook(() => useCodeExtensions(computer()), { wrapper });
    expect(result.current.rows).toBeNull();
    await waitFor(() => expect(result.current.rows).toBe('failed'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'golang.go', name: 'go', publisher: 'golang', note: null }]));
    expect(n).toBe(2);
  });
  it('reads nothing for a computer that is not running, or none', async () => {
    let n = 0;
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => { n++; return answers.ok(list([], [])); })] });
    const a = renderHook(() => useCodeExtensions(computer('stopped')), { wrapper });
    const b = renderHook(() => useCodeExtensions(null), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(a.result.current.rows).toBeNull();
    expect(b.result.current.rows).toBeNull();
    expect(n).toBe(0);
  });
});

// Installation facts, section availability, the kit's 503 body.
const seen = (publisher: string, name: string, status: string, installedVersion: string | null, stagedVersion: string | null) => ({ logicalKey: (publisher + '.' + name).toLowerCase(), publisher, name, stagedVersion, installedVersion, status, reason: '', installedOnly: false });
const cedar = fixtureWorld.computers.find((c) => c.name !== 'atlas' && c.id !== atlas.id)!;

describe('extensionsOf: installation facts', () => {
  it('an observed entry with nothing installed but a staged version installs at the next start, whatever its status', () => {
    for (const status of ['stale', 'stopped', 'running', 'unavailable']) {
      expect(extensionsOf(list([seen('acme', 'future', status, null, '1.0.0')], [staged('acme', 'future')]))).toEqual([{ id: 'acme.future', name: 'future', publisher: 'acme', note: 'staged' }]);
    }
  });
  it('a failed install keeps its note; an installed version, any status, is installed', () => {
    expect(extensionsOf(list([seen('acme', 'x', 'failed', null, '1.0.0')], []))[0]!.note).toBe('failed');
    expect(extensionsOf(list([seen('acme', 'x', 'stale', '0.9.0', '1.0.0')], []))[0]!.note).toBeNull();
    expect(extensionsOf(list([seen('acme', 'x', 'stopped', '0.9.0', null)], []))[0]!.note).toBeNull();
  });
  it('an observed entry with neither version leaves the row to the staged section, or out', () => {
    expect(extensionsOf(list([seen('acme', 'x', 'unavailable', null, null)], [staged('acme', 'x')]))).toEqual([{ id: 'acme.x', name: 'x', publisher: 'acme', note: 'staged' }]);
    expect(extensionsOf(list([seen('acme', 'x', 'unavailable', null, null)], []))).toEqual([]);
  });
});

describe('listComplete', () => {
  it('only an answer whose two sections were both read is complete', () => {
    expect(listComplete(list([], []))).toBe(true);
    expect(listComplete(list(null, []))).toBe(false);
    expect(listComplete(list([], null))).toBe(false);
    expect(listComplete({ ...list([], []), partial: true })).toBe(false);
    for (const b of [null, undefined, 'x', [], {}, { observed: { status: 'ok', extensions: [] } }]) expect(listComplete(b)).toBe(false);
  });
});

describe('useCodeExtensions: incomplete answers', () => {
  it('keeps the usable rows of the kit\'s 503 list body, and says the list is incomplete', async () => {
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => ({ status: 503, body: list([inst('acme', 'ready')], null) }))] });
    const { result } = renderHook(() => useCodeExtensions(computer()), { wrapper });
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'acme.ready', name: 'ready', publisher: 'acme', note: null }]));
    expect(result.current.incomplete).toBe(true);
  });
  it('a 503 without a list body, or any other refusal, is a failed read', async () => {
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => answers.refused(503, 'unavailable'))] });
    const { result } = renderHook(() => useCodeExtensions(computer()), { wrapper });
    await waitFor(() => expect(result.current.rows).toBe('failed'));
  });
  it('an unreadable installed section is incomplete, not an empty list', async () => {
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => answers.ok(list(null, [])))] });
    const { result } = renderHook(() => useCodeExtensions(computer()), { wrapper });
    await waitFor(() => expect(result.current.rows).toEqual([]));
    expect(result.current.incomplete).toBe(true);
  });
  it('a complete answer is not incomplete', async () => {
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => answers.ok(list([], [])))] });
    const { result } = renderHook(() => useCodeExtensions(computer()), { wrapper });
    await waitFor(() => expect(result.current.rows).toEqual([]));
    expect(result.current.incomplete).toBe(false);
  });
  it('a late answer for the computer left behind never shows for the new one', async () => {
    let n = 0;
    bootFixtureCore({ rules: [reply(boardFixtureRoute('code', 'GET', EXTENSIONS_PATH), () => (++n === 1 ? { ...answers.ok(list([inst('old', 'one')], [])), delayMs: 300 } : answers.ok(list([inst('new', 'one')], []))))] });
    const other = { id: cedar.id, name: cedar.name, project_id: cedar.project_id, server_name: cedar.server_name, status: 'running' } as BoardComputer;
    const { result, rerender } = renderHook(({ c }) => useCodeExtensions(c), { wrapper, initialProps: { c: computer() } });
    rerender({ c: other });
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'new.one', name: 'one', publisher: 'new', note: null }]));
    await new Promise((r) => setTimeout(r, 400));
    expect(result.current.rows).toEqual([{ id: 'new.one', name: 'one', publisher: 'new', note: null }]);
  });
});
