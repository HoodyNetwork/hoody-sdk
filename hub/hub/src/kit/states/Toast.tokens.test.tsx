// One toast per id (a repeat replaces it and counts), a shared link's refused change is said once by the
// shell (the page's error toast steps aside), and every permission leaf core can name has its words.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { errorInfo } from '@core';
import { routeLeaves } from '@core/routePerms';
import { errorSentence } from './ErrorDetails';
import { errorWords } from './errorWords';
import strings from './strings.en.json';
import { Toaster, closeToast, showErrorToast, showToast } from './Toast';

const open: string[] = [];
afterEach(() => { for (const k of open.splice(0)) act(() => closeToast(k)); });

describe('showToast id: one toast per id', () => {
  it('a repeat while it shows replaces it and says how many times; a new one after it closed starts again', () => {
    render(<Toaster />);
    let k1 = '', k2 = '', k3 = '';
    act(() => { k1 = showToast({ id: 'x', tone: 'warn', title: 'Atlas refused restarts', body: 'Ask the owner.' }); });
    act(() => { k2 = showToast({ id: 'x', tone: 'warn', title: 'Atlas refused restarts', body: 'Ask the owner.' }); });
    act(() => { k3 = showToast({ id: 'x', tone: 'warn', title: 'Atlas refused restarts', body: 'Ask the owner.' }); });
    open.push(k3);
    expect(screen.getAllByText('Atlas refused restarts')).toHaveLength(1);
    expect(screen.getByText('Ask the owner. This happened 3 times.')).toBeInTheDocument();
    expect(new Set([k1, k2, k3]).size).toBe(3);
    act(() => closeToast(k3));
    let k4 = '';
    act(() => { k4 = showToast({ id: 'x', tone: 'warn', title: 'Atlas refused restarts', body: 'Ask the owner.' }); });
    open.push(k4);
    expect(screen.getByText('Ask the owner.')).toBeInTheDocument();
  });
  it('different ids and no id stack as before', () => {
    render(<Toaster />);
    act(() => { open.push(showToast({ id: 'a', title: 'Saved Atlas' }), showToast({ id: 'b', title: 'Saved Atlas' }), showToast({ title: 'Saved Atlas' })); });
    expect(screen.getAllByText('Saved Atlas')).toHaveLength(3);
  });
});

describe("a shared link's refused change", () => {
  const lacks = { kind: 'not_sent', notSent: true, code: 'TOKEN_LACKS', perm: 'computers.actions.restart', route: 'POST /computers/{id}/{op}' };
  it("showErrorToast steps aside only for a refusal the shell's toast named (marked tokenSaid)", () => {
    render(<Toaster />);
    let k = 'unset';
    act(() => { k = showErrorToast("Couldn't restart Atlas", { ...lacks, tokenSaid: true }); });
    expect(k).toBe('');
    expect(screen.queryByText("Couldn't restart Atlas")).toBeNull();
    // Unmarked (a read, or the shell said nothing): the page's toast shows, with the same words.
    act(() => { open.push(showErrorToast("Couldn't load Atlas", { ...lacks, route: 'GET /bot-urls' })); });
    expect(screen.getByText("Couldn't load Atlas")).toBeInTheDocument();
    expect(screen.getByText("This shared link can't restart computers. Ask the owner for “Restart computers”.")).toBeInTheDocument();
  });
  it("a mutation result carrying a marked rejection steps aside as the rejection does", () => {
    render(<Toaster />);
    expect(showErrorToast("Couldn't restart Atlas", { outcome: 'not_sent', error: { ...lacks, tokenSaid: true } })).toBe('');
    let k = '';
    act(() => { k = showErrorToast("Couldn't restart Atlas", { outcome: 'not_sent', error: lacks }); });
    open.push(k);
    expect(k).not.toBe('');
  });
  it('a 403 marked said steps aside too; unmarked, named or not, it shows', () => {
    render(<Toaster />);
    expect(showErrorToast("Couldn't restart Atlas", { status: 403, code: 'INSUFFICIENT_PERMISSIONS', perm: 'computers.actions.restart', tokenSaid: true })).toBe('');
    for (const perm of [null, 'computers.actions.restart']) {
      let k = '';
      act(() => { k = showErrorToast("Couldn't restart Atlas", { status: 403, code: 'INSUFFICIENT_PERMISSIONS', perm }); });
      open.push(k);
      expect(k).not.toBe('');
    }
  });
  it('the words name what the link cannot do and the right to ask for', () => {
    expect(errorSentence(errorInfo(lacks))).toBe("This shared link can't restart computers. Ask the owner for “Restart computers”.");
    expect(errorWords(errorInfo({ status: 403, code: 'INSUFFICIENT_PERMISSIONS', perm: 'resources.bot_urls' })).key).toBe('err.tokenLacks');
    // A leaf core does not know is dropped: the general words.
    expect(errorInfo({ ...lacks, perm: 'made.up' }).perm).toBeNull();
    expect(errorWords(errorInfo({ status: 403, code: 'INSUFFICIENT_PERMISSIONS', perm: 'made.up' })).key).toBe('err.forbidden');
  });
});

describe('every leaf core can name has its words', () => {
  const table = strings as Record<string, string>;
  it.each(routeLeaves())('%s: a do and a right line', (leaf) => {
    expect(table[`perm.${leaf}.do`]).toMatch(/^[a-z]/);
    expect(table[`perm.${leaf}.right`]).toMatch(/^[A-Z]/);
  });
  it('no words for a leaf core cannot name', () => {
    const named = new Set(routeLeaves());
    const extra = Object.keys(table).filter((k) => k.startsWith('perm.')).map((k) => k.replace(/^perm\./, '').replace(/\.(do|right)$/, '')).filter((l) => !named.has(l));
    expect(extra).toEqual([]);
  });
});
