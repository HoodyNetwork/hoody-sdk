// Vitest: a Notes page as a tile: what the notebook and page lists keep, a page address, and the pages
// read a hundred at a time on core's fixture transport.
import { answers, boardFixtureRoute, bootFixtureCore, CoreQueryProvider, fixtureWorld, reply } from '@core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { BoardComputer } from './computers';
import { notebooksOf, notesLink, pagesOf, PAGE_SIZE, useNotebooks, useNotesPages } from './notesPages';

const ID = (c: string) => c.repeat(24);
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
const wrapper = ({ children }: { children: ReactNode }) => createElement(CoreQueryProvider, null, children);

describe('notebooksOf / pagesOf / notesLink', () => {
  it('keeps the notebooks the viewer can open, with the viewer\'s own id, sorted by name', () => {
    expect(notebooksOf({ notebooks: [
      { id: ID('b'), name: 'Zeta', user: { id: ID('u'), role: 'guest' } },
      { id: ID('a'), name: ' Alpha\nteam ', user: { id: ID('v'), role: 'owner' } },
      { id: ID('c'), name: 'None', user: { id: ID('u'), role: 'none' } },
      { id: 'short', name: 'Bad id', user: { id: ID('u'), role: 'owner' } },
      { id: ID('d'), name: 'No user' },
      { id: ID('e'), user: { id: ID('w'), role: 'admin' } },
    ] })).toEqual([{ id: ID('e'), name: '', userId: ID('w') }, { id: ID('a'), name: 'Alpha team', userId: ID('v') }, { id: ID('b'), name: 'Zeta', userId: ID('u') }]);
    expect(notebooksOf([])).toEqual([]);
    expect(notebooksOf({ notebooks: 'x' })).toEqual([]);
  });

  it('keeps only pages with a Notes id, and the count when given', () => {
    expect(pagesOf({ nodes: [{ id: ID('1'), type: 'page', name: 'A' }, { id: ID('2'), type: 'folder', name: 'F' }, { id: 'x', type: 'page', name: 'Bad' }, { id: ID('3'), type: 'page' }], total: 9 }))
      .toEqual({ pages: [{ id: ID('1'), name: 'A' }, { id: ID('3'), name: '' }], total: 9 });
    expect(pagesOf({ nodes: [], total: -1 })).toEqual({ pages: [], total: null });
    expect(pagesOf(null)).toEqual({ pages: [], total: null });
  });

  it('reads the ids from a Notes page address: the route behind it, or the address bar\'s own short form; nothing else', () => {
    expect(notesLink(` https://n.example/notebook/${ID('u')}/${ID('p')}?x=1 `)).toEqual({ userId: ID('u'), nodeId: ID('p') });
    expect(notesLink(`/notebook/${ID('u')}/${ID('p')}`)).toEqual({ userId: ID('u'), nodeId: ID('p') });
    expect(notesLink(`/notebook/${ID('u')}/${ID('p')}x`)).toEqual({ userId: ID('u'), nodeId: ID('p') + 'x' });
    expect(notesLink(` https://notes.example/${ID('n')}/${ID('p')} `)).toEqual({ notebookId: ID('n'), nodeId: ID('p') });
    expect(notesLink(`/${ID('n')}/${ID('p')}/`)).toEqual({ notebookId: ID('n'), nodeId: ID('p') });
    for (const bad of [`/notebook/${ID('u')}`, `/notebook/${ID('U')}/${ID('p')}`, `/notebook/${ID('u')}/${'p'.repeat(29)}`, `https://x.example/app/${ID('n')}/${ID('p')}`, `/${ID('n')}/${ID('p')}/more`, `${ID('n')}/${ID('p')}`, '']) expect(notesLink(bad)).toBeNull();
  });
});

describe('useNotesPages / useNotebooks', () => {
  it('reads a hundred pages, then the next hundred on More, until the count is reached', async () => {
    const offsets: string[] = [];
    bootFixtureCore({ rules: [reply(boardFixtureRoute('notes', 'GET', `/api/v1/notes/notebooks/${ID('n')}/nodes`), (req) => {
      offsets.push(req.query.offset + '/' + req.query.limit + '/' + req.query.type);
      const from = Number(req.query.offset);
      const n = Math.min(PAGE_SIZE, 150 - from);
      return answers.ok({ nodes: Array.from({ length: n }, (_, i) => ({ id: (from + i).toString(36).padStart(24, '0'), type: 'page', name: 'P' + (from + i) })), total: 150 });
    })] });
    const { result } = renderHook(() => useNotesPages(computer, ID('n')), { wrapper });
    await waitFor(() => expect(result.current.pages).toHaveLength(100));
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.more());
    await waitFor(() => expect(result.current.pages).toHaveLength(150));
    expect(result.current.hasMore).toBe(false);
    act(() => result.current.more());
    expect(offsets).toEqual(['0/100/page', '100/100/page']);
  });

  it('a failed read keeps what was read and can be tried again; no notebook or a stopped computer reads nothing', async () => {
    let fail = true;
    let reads = 0;
    bootFixtureCore({ rules: [
      reply(boardFixtureRoute('notes', 'GET', '/api/v1/notes/notebooks'), () => { reads++; return fail ? answers.refused(500, 'SERVER_ERROR') : answers.ok({ notebooks: [{ id: ID('n'), name: 'N', user: { id: ID('u'), role: 'owner' } }] }); }),
    ] });
    const { result } = renderHook(() => useNotebooks(computer), { wrapper });
    await waitFor(() => expect(result.current.rows).toBe('failed'));
    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.rows).toEqual([{ id: ID('n'), name: 'N', userId: ID('u') }]));
    const stopped = renderHook(() => useNotebooks({ ...computer, status: 'stopped' }), { wrapper });
    const none = renderHook(() => useNotesPages(computer, null), { wrapper });
    let pageReads = 0;
    bootFixtureCore({ rules: [reply(boardFixtureRoute('notes', 'GET', `/api/v1/notes/notebooks/${ID('n')}/nodes`), () => { pageReads++; return answers.ok({ nodes: [] }); })] });
    const stoppedPages = renderHook(() => useNotesPages({ ...computer, status: 'stopped' }, ID('n')), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(stopped.result.current.rows).toBeNull();
    expect(none.result.current).toMatchObject({ pages: [], loading: false, hasMore: false });
    expect(stoppedPages.result.current).toMatchObject({ pages: [], loading: false, hasMore: false });
    expect(reads).toBe(2);
    expect(pageReads).toBe(0);
  });
});
