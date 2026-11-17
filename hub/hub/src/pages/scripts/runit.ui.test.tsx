// The "Run it from a terminal" section of a script's Overview (parts/RunIt.tsx).
import { fireEvent, render, screen } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maskId } from '@kit';
import { RunIt, terminalUrl } from './parts/RunIt';
import S from './parts/RunIt.strings.en.json';

const tgt = vi.hoisted(() => ({ id: 'cee2a1b2-42de-7af1-9c3d-2c4b00000000' as string | null }));
vi.mock('./data', () => ({
  useScriptsTarget: () => (tgt.id ? { project: { id: 'p1' }, container: { id: tgt.id, server_name: 'srv' } } : null),
}));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), portAddress: (_p: unknown, c: { id: string } | null, port: number, slug: string) => (c ? `https://p1-${c.id}-${slug}-${port}.srv.example.test/` : '') }));

const ID = 'cee2a1b2-42de-7af1-9c3d-2c4b00000000';
const origin = 'https://b7d4-exec-1.orbit.example.test';
const item = (o: object = {}) => ({ id: 'x', compId: ID, compName: 'atlas', compHandle: 'atlas.2c4b', path: 'default/1/address-web-form.ts', name: 'Address web form', route: '/address-web-form', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok', ...o }) as never;
const comp = (o: object = {}) => ({ id: ID, name: 'atlas', handle: 'atlas.2c4b', state: 'on', origin, rows: [{ path: 'default/1/address-web-form.ts' }, { path: 'default/1/notes.md' }], ...o }) as never;
const decode = (url: string): string | null => {
  const c = new URL(url).searchParams.get('cmd');
  return c === null ? null : new TextDecoder().decode(Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0)));
};
const btn = () => screen.getByRole('button', { name: S['run.test'] });
const off = (b: HTMLElement) => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';

let opened: string[] = [];
beforeEach(() => {
  tgt.id = ID;
  opened = [];
  vi.spyOn(window, 'open').mockImplementation(((u: string) => (opened.push(u), null)) as never);
});
afterEach(() => vi.restoreAllMocks());

describe('Run it from a terminal', () => {
  it('shows the CLI command with the computer id masked, and curl', () => {
    const { container } = render(<RunIt item={item()} comp={comp()} />);
    expect(container.textContent).toContain(`hoody --computer ${maskId(ID)} exec address-web-form`);
    expect(container.textContent).toContain(`curl -g '${origin}/address-web-form'`);
    expect(container.textContent).not.toContain(ID);
  });

  it('Test it in a terminal opens a new, empty temporary terminal on this computer: nothing is typed in', () => {
    render(<RunIt item={item()} comp={comp()} />);
    expect(off(btn())).toBe(false);
    fireEvent.click(btn());
    expect(opened).toHaveLength(1);
    const u = new URL(opened[0]!);
    expect(u.host).toBe(`p1-${ID}-terminal-0.srv.example.test`);
    expect(u.searchParams.get('ephemeral')).toBe('true');
    expect(decode(opened[0]!)).toBeNull();
  });

  it('a keyed script: a placeholder, the key line, and the terminal opens with nothing typed (the line says to copy and add the key)', () => {
    const { container } = render(<RunIt item={item({ keyed: true })} comp={comp()} />);
    expect(container.textContent).toContain(S['run.key']);
    expect(container.textContent).toContain("X-Token: <your key>");
    fireEvent.click(btn());
    expect(decode(opened[0]!)).toBeNull();
  });

  it('a dynamic route: the fill-in line, and the terminal opens with nothing typed', () => {
    const { container } = render(<RunIt item={item({ path: 'default/1/orders/[id].ts', route: '/orders/[id]' })} comp={comp({ rows: [{ path: 'default/1/orders/[id].ts' }] })} />);
    expect(container.textContent).toContain(S['run.fill']);
    expect(container.textContent).toContain(`exec orders-id <id>`);
    fireEvent.click(btn());
    expect(opened).toHaveLength(1);
    expect(decode(opened[0]!)).toBeNull();
  });

  it('another folder: only curl, with the folder line; the terminal runs curl on that folder\'s own host', () => {
    // A folder-2 page reads the exec-2 host (data.ts:293); the fixture pairs them.
    const origin2 = 'https://b7d4-exec-2.orbit.example.test';
    const { container } = render(<RunIt item={item({ path: 'default/2/address-web-form.ts' })} comp={comp({ origin: origin2, rows: [{ path: 'default/2/address-web-form.ts' }] })} />);
    expect(container.textContent).toContain(S['run.note.folder']);
    expect(container.textContent).not.toContain('hoody --computer');
    expect(container.textContent).not.toContain(S['run.cliCheck']);
    fireEvent.click(btn());
    expect(decode(opened[0]!)).toBeNull();
  });

  it('a shown CLI line carries the line to check its name with hoody exec --help', () => {
    const { container } = render(<RunIt item={item()} comp={comp()} />);
    expect(container.textContent).toContain(S['run.cliCheck']);
  });

  it('a catch-all opens the terminal empty, with the fill-in line', () => {
    const { container } = render(<RunIt item={item({ path: 'default/1/files/[...rest].ts', route: '/files/[...rest]' })} comp={comp({ rows: [{ path: 'default/1/files/[...rest].ts' }] })} />);
    expect(container.textContent).toContain(S['run.fill']);
    expect(container.textContent).toContain(`curl -g '${origin}/files/<rest>'`);
    fireEvent.click(btn());
    expect(decode(opened[0]!)).toBeNull();
  });

  it('a stopped computer, or a page on another computer: the button is off and says why', () => {
    const a = render(<RunIt item={item()} comp={comp({ state: 'off' })} />);
    expect(off(btn())).toBe(true);
    expect(a.container.textContent).toContain(S['run.off'].replace('{{computer}}', 'atlas'));
    a.unmount();
    tgt.id = 'another';
    const b = render(<RunIt item={item()} comp={comp()} />);
    expect(off(btn())).toBe(true);
    expect(b.container.textContent).toContain(S['run.noTerminal'].replace('{{computer}}', 'atlas'));
    fireEvent.click(btn());
    expect(opened).toEqual([]);
  });

  it('terminalUrl: only ephemeral, any earlier query dropped, never a command, nothing for no address', () => {
    expect(terminalUrl('')).toBe('');
    const u = new URL(terminalUrl('https://t.example.test/?terminal_id=1&cmd=ZWNobw'));
    expect([...u.searchParams.keys()]).toEqual(['ephemeral']);
  });
  // A script with no line has nothing to copy, so no terminal to paste into and no key words.
  it('a file name no address can carry: only the reason, no terminal button, no command block, no key line', () => {
    const { container } = render(<RunIt item={item({ path: "default/1/it's.ts", route: "/it's", keyed: true })} comp={comp({ rows: [{ path: "default/1/it's.ts" }] })} />);
    expect(container.textContent).toContain(S['run.note.unroutable']);
    expect(screen.queryByRole('button', { name: S['run.test'] })).toBeNull();
    expect(container.textContent).not.toContain(S['run.key']);
    expect(container.textContent).not.toContain('curl -g');
    expect(opened).toEqual([]);
  });
});
