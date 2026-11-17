// Vitest: a reply's Linux paths open a kit menu at the path, by a press, Enter, a right-click or
// the ContextMenu key; v1's one choice is Copy path (the target as written, :line kept). Nothing happens before a choice. At most
// PATHS_MAX distinct paths per reply are actionable; a streaming reply and a text that is not the agent's own reply draw none.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATHS_MAX } from './paths';
import { Prose } from './Reply';

let unmount: (() => void) | null = null;
const draw = (text: string, props: { marks?: boolean; caret?: boolean } = { marks: true }) => {
  const r = render(<Prose text={text} {...props} />);
  unmount = r.unmount;
  return r.container;
};
afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
});
const pathButton = (target: string) => screen.getByRole('button', { name: target });
/** The open menu (named by its trigger, the path). */
const menu = () => screen.findByRole('menu');

describe('a path in a reply', () => {
  it('is a button named by its path; a press opens the menu with Copy path, and nothing happened before it', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    draw('The config is in /etc/nginx/nginx.conf now.');
    const b = pathButton('/etc/nginx/nginx.conf');
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(b);
    const m = await menu();
    expect(m).toHaveAccessibleName('/etc/nginx/nginx.conf');
    await userEvent.click(within(m).getByRole('menuitem', { name: 'Copy path' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('/etc/nginx/nginx.conf'));
  });

  it('Enter opens it from the keyboard', async () => {
    draw('See ~/.bashrc');
    pathButton('~/.bashrc').focus();
    await userEvent.keyboard('{Enter}');
    expect(await menu()).toBeInTheDocument();
  });

  it('a right-click opens it, and the browser menu is not shown', async () => {
    draw('See /var/log/syslog');
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => { pathButton('/var/log/syslog').dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(await menu()).toBeInTheDocument();
  });

  it('the ContextMenu key and Shift+F10 open it', async () => {
    draw('See /var/log/syslog');
    fireEvent.keyDown(pathButton('/var/log/syslog'), { key: 'ContextMenu' });
    expect(await menu()).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.keyDown(pathButton('/var/log/syslog'), { key: 'F10', shiftKey: true });
    expect(await menu()).toBeInTheDocument();
  });

  it('Copy path copies the target with its :line:col', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    draw('It broke at `/app/src/main.ts:42:7`.');
    const b = pathButton('/app/src/main.ts:42:7');
    expect(b.querySelector('code')).not.toBeNull();
    await userEvent.click(b);
    await userEvent.click(within(await menu()).getByRole('menuitem', { name: 'Copy path' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('/app/src/main.ts:42:7'));
  });
});

describe('where a path stays text', () => {
  it(`past ${PATHS_MAX} distinct paths the rest are text; a repeat of an actionable one is actionable too`, () => {
    const many = Array.from({ length: PATHS_MAX + 2 }, (_, i) => `/srv/p${i}/x`);
    draw([...many, many[0]].join(' and '));
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(PATHS_MAX + 1);
    expect(screen.queryByRole('button', { name: many[PATHS_MAX] })).toBeNull();
    expect(document.body.textContent).toContain(many[PATHS_MAX]);
  });

  it('while the reply streams, and in a text that is not a reply (no marks)', () => {
    draw('See /var/log/syslog', { marks: true, caret: true });
    expect(screen.queryByRole('button')).toBeNull();
    unmount?.();
    draw('See /var/log/syslog', {});
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).toContain('/var/log/syslog');
  });

  it('a fraction, a URL and a one-part path stay text', () => {
    draw('Use and/or 1/2 of https://example.com/a/b in /tmp.');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
