// Vitest: "Download the Hub" in the top-bar Skills / SDK menu. The row shows only where the served page says its Hoody
// has the one-file Hub (<html data-hub-file="1">, core hubFileUrl); choosing it saves /auth/hoody-hub.html through a
// link with `download`, so the Hub neither navigates nor opens a tab. Without the mark the menu is the five rows it was.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@app/testing';
import strings from '../strings.en.json';
import TopBarLinks from './TopBarLinks';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@tanstack/react-router')),
  useNavigate: () => navigate,
}));

afterEach(() => {
  document.documentElement.removeAttribute('data-hub-file');
  navigate.mockReset();
  vi.restoreAllMocks();
});

const trigger = () => screen.getByRole('button', { name: 'Skills / SDK' });
/** Every link click the page made, as [href attribute, download name]. */
function watchSaves(): [string | null, string][] {
  const saved: [string | null, string][] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push([this.getAttribute('href'), this.download]);
  });
  return saved;
}

describe('top-bar Skills / SDK menu: Download the Hub', () => {
  it('with the file on this Hoody: a sixth row after Install Hoody, above the rule', async () => {
    document.documentElement.setAttribute('data-hub-file', '1');
    const user = userEvent.setup();
    render(<TopBarLinks />);
    await user.click(trigger());
    await screen.findByRole('menu');
    const rows = screen.getAllByRole('menuitem');
    expect(rows).toHaveLength(6);
    expect(rows[3]).toHaveAccessibleName('Install Hoody');
    expect(rows[4]).toHaveAccessibleName(strings['top.file']);
    expect(rows[4]).toHaveAccessibleDescription(strings['top.file.desc']);
    expect(rows[5]).toHaveAccessibleName('Documentation');
    const flow = [...document.querySelectorAll('[role="menuitem"], [role="separator"]')].map((e) => e.getAttribute('role'));
    expect(flow).toEqual(['menuitem', 'menuitem', 'menuitem', 'menuitem', 'menuitem', 'separator', 'menuitem']);
  });

  it('choosing it saves /auth/hoody-hub.html as hoody-hub.html: no tab, no route change, the link is gone again', async () => {
    document.documentElement.setAttribute('data-hub-file', '1');
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const saved = watchSaves();
    render(<TopBarLinks />);
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: strings['top.file'] }));
    expect(saved).toEqual([['/auth/hoody-hub.html', 'hoody-hub.html']]);
    expect(open).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it.each([[null], [''], ['{{HUB_FILE}}']])('page mark %j: no such row, the menu keeps its five', async (mark) => {
    if (mark !== null) document.documentElement.setAttribute('data-hub-file', mark);
    const user = userEvent.setup();
    render(<TopBarLinks />);
    await user.click(trigger());
    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
    expect(screen.queryByRole('menuitem', { name: 'Download the Hub' })).toBeNull();
  });

  it('the strings name the row', () => {
    expect((strings as Record<string, string>)['top.file']).toBe('Download the Hub');
  });
});
