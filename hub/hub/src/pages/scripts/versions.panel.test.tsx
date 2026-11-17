// Vitest at the Code tab's Versions panel: a row is known by when its version was kept (the Hub's date format), never by
// the opaque id the computer gives the stored copy. Its second line is its size, only when the computer said; Preview is
// named with the row's time; the version holding the code in use is named Current.
import { render, screen, within } from '@app/testing';
import { formatBytes, formatDateTime } from '@kit';
import { describe, expect, it } from 'vitest';
import { CodeTab, versionMeta } from './parts/CodeTab';
import type { EditorState } from './parts/useEditor';
import strings from './strings.en.json';
import type { Version } from './types';

const comp = { id: 'c1', caps: { revisions: true, history: true }, instances: {}, agentRealm: null } as never;
const item = { id: 'atlas.1111~a.ts', path: 'default/1/a.ts', managed: null } as never;
const CODE = 'export default () => new Response("two");\n';
const VERSIONS: Version[] = [
  { version: 'h-mwiqexlc-da26aefe', revision: 'rA', savedAt: '2026-11-16T11:56:00Z', replacedBy: 'write', size: 1834 },
  { version: 'h-mwipyps8-606459be', revision: 'rB', savedAt: '2026-11-16T11:44:00Z', replacedBy: 'magic-comments', size: 2048 },
  { version: 'h-mwipxjca-bb7d527e', revision: 'rIn', savedAt: '2026-11-16T11:43:00Z', replacedBy: 'restore' },
  { version: 'h-mwipv80a-40c33792', savedAt: '2026-11-16T11:41:00Z', replacedBy: 'something-new' },
];
const edWith = (versions: Version[]) =>
  ({
    file: { isPending: false, isError: false, data: { revision: 'rIn', content: CODE }, refetch: () => undefined },
    text: CODE, setText: () => undefined, save: () => undefined, dismiss: () => undefined, setNote: () => undefined, keepMine: () => undefined, loadTheirs: () => undefined,
    canWrite: true, locked: false, dirty: false, conflict: false, note: null, out: null, verdict: null, changes: [],
    versions: { isPending: false, data: versions },
    restoreVersion: () => undefined,
  }) as unknown as EditorState;

const panel = () => screen.getByRole('complementary', { name: strings['versions.title'] });
const rows = () => within(panel()).getAllByRole('listitem');

describe('the Versions panel', () => {
  it('titles each row with the time its version was kept, newest first, and never shows the stored copy\'s id', () => {
    render(<CodeTab item={item} comp={comp} ed={edWith(VERSIONS)} />);
    expect(rows()).toHaveLength(4);
    rows().forEach((row, n) => expect(row.textContent).toContain(formatDateTime(VERSIONS[n]!.savedAt)));
    expect(panel().textContent).not.toMatch(/h-mwi/);
    expect(panel().textContent).not.toContain('Version ');
  });

  it('names each Preview with its row\'s time, and only the version holding the code in use is Current (no Preview)', () => {
    render(<CodeTab item={item} comp={comp} ed={edWith(VERSIONS)} />);
    const names = within(panel()).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([0, 1, 3].map((n) => strings['versions.previewName'].replace('{{at}}', formatDateTime(VERSIONS[n]!.savedAt))));
    expect(within(rows()[2]!).getByText(strings['versions.current'])).toBeTruthy();
    expect(within(rows()[2]!).queryByRole('button')).toBeNull();
    expect(within(rows()[0]!).queryByText(strings['versions.current'])).toBeNull();
  });

  it('says each row\'s size under its time, only when the computer said', () => {
    render(<CodeTab item={item} comp={comp} ed={edWith(VERSIONS)} />);
    expect(rows()[0]!.textContent).toContain(formatBytes(1834));
    expect(rows()[1]!.textContent).toContain(formatBytes(2048));
    // No size: nothing under the time.
    expect(rows()[2]!.querySelector('p')).toBeNull();
    expect(rows()[3]!.querySelector('p')).toBeNull();
  });
});

describe('versionMeta', () => {
  it('takes a real size, and nothing else', () => {
    expect(versionMeta({ version: 'h-a-00000000', savedAt: '', size: 10 })).toEqual([formatBytes(10)]);
    expect(versionMeta({ version: 'h-a-00000000', savedAt: '', size: 0 })).toEqual([formatBytes(0)]);
    expect(versionMeta({ version: 'h-a-00000000', savedAt: '' })).toBeUndefined();
    expect(versionMeta({ version: 'h-a-00000000', savedAt: '', size: Number.NaN })).toBeUndefined();
    expect(versionMeta({ version: 'h-a-00000000', savedAt: '', size: -1 })).toBeUndefined();
  });
});
