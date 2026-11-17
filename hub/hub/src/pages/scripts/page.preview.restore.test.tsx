// Vitest at the Code tab: an older version is read before it is restored. Preview opens a dialog with what
// restoring would change in the code and what is worth knowing about the header; only its own button restores. The caller key never
// reaches the screen (the editor shows the file without its `@token` line, and so does the comparison).
import { render, screen, userEvent } from '@app/testing';
import { formatDateTime } from '@kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from './parts/useEditor';

const world = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  pending: false,
  error: false,
  reads: [] as Array<string | number | null>,
}));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useVersionRead: (_id: string, version: string | number | null) => {
    world.reads.push(version);
    const content = world.files[String(version)];
    return { isPending: world.pending, isError: world.error, refetch: async () => undefined, data: world.pending || world.error || content === undefined ? undefined : { revision: 'old', content } };
  },
}));

import { CodeTab } from './parts/CodeTab';
import strings from './strings.en.json';

const CURRENT = '// @token CURRENTKEYVALUE0123456789\nexport default () => new Response("two");\n';
const comp = { id: 'c1', caps: { revisions: true, history: true }, instances: {}, agentRealm: null } as never;
const item = { id: 'atlas.1111~a.ts', path: 'default/1/a.ts', managed: null } as never;
const edFor = (extra: Record<string, unknown> = {}) => ({
  file: { isPending: false, isError: false, data: { revision: 'r1', content: CURRENT }, refetch: vi.fn() },
  text: 'export default () => new Response("two");\n',
  setText: vi.fn(), save: vi.fn(), dismiss: vi.fn(), setNote: vi.fn(), keepMine: vi.fn(), loadTheirs: vi.fn(),
  canWrite: true, locked: false, dirty: false, conflict: false, note: null, out: null, verdict: null, changes: [],
  versions: { isPending: false, data: [{ version: 3, revision: 'r1', savedAt: '2026-10-24T01:00:00Z' }, { version: 2, savedAt: '2026-10-23T01:00:00Z' }, { version: 1, savedAt: '2026-10-22T01:00:00Z' }] },
  restoreVersion: vi.fn(),
  ...extra,
}) as unknown as EditorState;
// Each Preview is named with its version's time ("Preview the version from …"); a dialog is titled the same way.
const previews = () => screen.findAllByRole('button', { name: /^Preview the version from / });
const titled = (savedAt: string) => strings['versions.previewTitle'].replace('{{at}}', formatDateTime(savedAt));

describe('Preview before restore', () => {
  beforeEach(() => {
    world.files = { '2': '// @schedule 0 8 * * *\nexport default () => new Response("one");\n', '1': CURRENT };
    world.pending = false;
    world.error = false;
    world.reads.length = 0;
  });

  it('opens the older version\'s changes and header notes without restoring anything', async () => {
    const ed = edFor();
    render(<CodeTab item={item} comp={comp} ed={ed} />);
    await userEvent.click((await previews())[0]!);
    expect(await screen.findByRole('dialog', { name: titled('2026-10-23T01:00:00Z') })).toBeTruthy();
    const diffText = screen.getByLabelText(strings['versions.diff']).textContent ?? '';
    expect(diffText).toContain('- export default () => new Response("two");');
    expect(diffText).toContain('+ export default () => new Response("one");');
    expect(screen.getByText(strings['change.protection_removed'])).toBeTruthy();
    expect(screen.getByText('It will run on a schedule: 0 8 * * *.')).toBeTruthy();
    expect(ed.restoreVersion).not.toHaveBeenCalled();
    expect(world.reads).toContain(2);
  });

  it('the caller key is never on the screen: not in the comparison, not in the notes', async () => {
    render(<CodeTab item={item} comp={comp} ed={edFor()} />);
    await userEvent.click((await previews())[0]!);
    await screen.findByRole('dialog', { name: titled('2026-10-23T01:00:00Z') });
    expect(document.body.textContent).not.toContain('CURRENTKEYVALUE0123456789');
  });

  it('only its own button restores, once, the version read', async () => {
    const ed = edFor();
    render(<CodeTab item={item} comp={comp} ed={ed} />);
    await userEvent.click((await previews())[0]!);
    await userEvent.click(await screen.findByRole('button', { name: strings['versions.restoreThis'] }));
    expect(ed.restoreVersion).toHaveBeenCalledTimes(1);
    expect(ed.restoreVersion).toHaveBeenCalledWith(2);
    expect(screen.queryByText(strings['versions.previewBody'])).toBeNull();
  });

  it('closing it restores nothing', async () => {
    const ed = edFor();
    render(<CodeTab item={item} comp={comp} ed={ed} />);
    await userEvent.click((await previews())[0]!);
    await userEvent.click(await screen.findByRole('button', { name: (n, el) => n === strings['versions.close'] && !el.hasAttribute('data-dialog-close') }));
    expect(ed.restoreVersion).not.toHaveBeenCalled();
    expect(screen.queryByText(strings['versions.previewBody'])).toBeNull();
  });

  it('with unsaved edits, or where the script cannot be changed, it can be read but not restored, and says why', async () => {
    for (const extra of [{ dirty: true }, { canWrite: false }, { locked: true }]) {
      const ed = edFor(extra);
      const view = render(<CodeTab item={item} comp={comp} ed={ed} />);
      await userEvent.click((await previews())[0]!);
      expect(await screen.findByText(strings['versions.cantRestore'])).toBeTruthy();
      expect((screen.getByRole('button', { name: strings['versions.restoreThis'] }) as HTMLButtonElement).disabled).toBe(true);
      expect(ed.restoreVersion).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it('a version with the same code says so', async () => {
    world.files['2'] = CURRENT;
    render(<CodeTab item={item} comp={comp} ed={edFor()} />);
    await userEvent.click((await previews())[0]!);
    expect(await screen.findByText(strings['versions.same'])).toBeTruthy();
  });

  it('while it is read, or when the read fails, nothing can be restored', async () => {
    world.pending = true;
    const ed = edFor();
    const view = render(<CodeTab item={item} comp={comp} ed={ed} />);
    await userEvent.click((await previews())[0]!);
    expect((await screen.findByRole('button', { name: strings['versions.restoreThis'] }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    world.pending = false;
    world.error = true;
    render(<CodeTab item={item} comp={comp} ed={ed} />);
    await userEvent.click((await previews())[0]!);
    expect((await screen.findByRole('button', { name: strings['versions.restoreThis'] }) as HTMLButtonElement).disabled).toBe(true);
    expect(ed.restoreVersion).not.toHaveBeenCalled();
  });
});

// The history route lists the code each save replaced, newest first, never the code in use. The newest row was named
// Current and had no Preview, so the code the last save replaced could not be read back or restored.
describe('which version is the one in use', () => {
  beforeEach(() => {
    world.files = { '3': 'export default () => new Response("one");\n' };
    world.pending = false;
    world.error = false;
  });

  it('the newest version is the code the last save replaced: it has Preview, and none is named Current', async () => {
    const versions = { isPending: false, data: [{ version: 3, revision: 'r0', savedAt: '2026-10-24T01:00:00Z' }, { version: 2, revision: 'rz', savedAt: '2026-10-23T01:00:00Z' }] };
    render(<CodeTab item={item} comp={comp} ed={edFor({ versions })} />);
    expect(await previews()).toHaveLength(2);
    expect(screen.queryByText(strings['versions.current'])).toBeNull();
    await userEvent.click((await previews())[0]!);
    expect(await screen.findByRole('dialog', { name: titled('2026-10-24T01:00:00Z') })).toBeTruthy();
  });

  it('a version that holds the code in use (the file\'s revision) is named Current and has no Preview (the control)', async () => {
    const versions = { isPending: false, data: [{ version: 3, revision: 'r0', savedAt: '2026-10-24T01:00:00Z' }, { version: 2, revision: 'r1', savedAt: '2026-10-23T01:00:00Z' }] };
    render(<CodeTab item={item} comp={comp} ed={edFor({ versions })} />);
    expect(await previews()).toHaveLength(1);
    expect(screen.getByText(strings['versions.current'])).toBeTruthy();
  });
});
