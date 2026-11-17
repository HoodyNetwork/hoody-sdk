// "Share with another computer…" in Files' menus (the Shared folders switch is on): nothing at all for a session
// that may not change shares; else one entry that only opens the Storage tab's dialog for that folder (nothing is
// sent), shown off with why for a folder sharing would refuse.
import { bootFixtureCore } from '@core';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHref } from '../logic';
import strings from './strings.en.json';

const go = vi.fn();
let account = true;
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useGo: () => go }));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useCan: () => account }));
import { shareHref, useShareEntry } from './entry';

const ATLAS = { id: 'c0a71500000000000000a1a1', name: 'atlas' };
const OTHER = { id: 'c0a71500000000000000c3c3', name: 'cedar' };
const entries = (path: string, where: 'row' | 'bar' = 'row', listed: readonly { id: string; name: string }[] = [ATLAS, OTHER]) => {
  bootFixtureCore({ rules: [] });
  return renderHook(() => useShareEntry()).result.current(ATLAS, path, where, listed);
};
const linkOf = (path: string, listed?: readonly { id: string; name: string }[]): string => {
  go.mockClear();
  (entries(path, 'row', listed)[0] as { onAction: () => void }).onAction();
  return go.mock.calls[0]![0] as string;
};
afterEach(() => { window.history.replaceState({}, '', '/'); go.mockClear(); account = true; });

describe('the Share entry of a folder', () => {
  it('is not there for a session that may not change shares', () => {
    account = false;
    expect(entries('/srv/data')).toEqual([]);
    expect(entries('/srv/data', 'bar')).toEqual([]);
  });
  it('for an account session, opens the Storage tab on Share a folder for that folder and sends nothing', () => {
    const [row] = entries('/srv/app_(1)');
    expect(row).toMatchObject({ id: 'share', label: strings['act.shareRow'] });
    expect((row as { isDisabled?: boolean }).isDisabled).toBeUndefined();
    (row as { onAction: () => void }).onAction();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go.mock.calls[0]![0]).toContain('/files?computer=atlas.a1a1&tab=storage&share=%2Fsrv%2Fapp_(1)');
    expect(entries('/srv', 'bar')[0]).toMatchObject({ label: strings['act.shareThis'] });
  });
  it('is shown off, with why, for a folder sharing would refuse', () => {
    const [top] = entries('/');
    expect(top).toMatchObject({ isDisabled: true, disabledReason: strings['why.root'] });
    const [got] = entries('/hoody/shares/x-0123abcd');
    expect(got).toMatchObject({ isDisabled: true, disabledReason: strings['why.received'] });
  });
  it('names the computer by its id too when another listed computer has the same handle, as the panes do', () => {
    expect(linkOf('/srv/data')).not.toContain('cid=');
    const twin = { id: 'c0a7150000000000000ba1a1', name: 'atlas' };
    const href = linkOf('/srv/data', [ATLAS, twin]);
    expect(href).toContain(`cid=${ATLAS.id}`);
    // The Files start move keeps it as pane A's exact computer, with the Storage tab and the folder.
    const moved = startHref(Object.fromEntries(new URLSearchParams(href.slice(href.indexOf('?') + 1))));
    expect(moved).toContain(`acid=${ATLAS.id}`);
    expect(moved).toContain('tab=storage');
    expect(moved).toContain('share=%2Fsrv%2Fdata');
    // A computer the list does not hold (yet) is named by its id as well: its handle proves nothing.
    expect(linkOf('/srv/data', [])).toContain(`cid=${ATLAS.id}`);
  });
  it('the link names the computer by its handle and the folder percent-encoded', () => {
    expect(shareHref('atlas.00a1', '/a b/c&d')).toMatch(/^\/files\?computer=atlas\.00a1&tab=storage&share=%2Fa%20b%2Fc%26d$/);
  });
});
