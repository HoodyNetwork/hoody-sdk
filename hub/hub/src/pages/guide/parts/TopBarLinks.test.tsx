// Vitest: the Guide's top-bar part is one "Skills / SDK" menu: Skills goes to the Guide's
// Skills section through the router; API goes to the API page through the router; Documentation, SDK on GitHub and
// Install Hoody open in a new tab with no opener.
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
  navigate.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const trigger = () => screen.getByRole('button', { name: 'Skills / SDK' });

describe('top-bar Skills / SDK menu', () => {
  it('one trigger, "Skills / SDK", opening a menu of five rows with their lines', async () => {
    const user = userEvent.setup();
    render(<TopBarLinks />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(trigger()).toHaveAttribute('aria-haspopup', 'true');
    await user.click(trigger());
    const menu = await screen.findByRole('menu');
    const rows = screen.getAllByRole('menuitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveAccessibleName(strings['top.skills']);
    expect(rows[1]).toHaveAccessibleName(strings['top.sdk']);
    expect(rows[2]).toHaveAccessibleName(strings['top.api']);
    expect(rows[3]).toHaveAccessibleName('Install Hoody');
    expect(rows[4]).toHaveAccessibleName('Documentation');
    expect(rows[0]).toHaveAccessibleDescription(strings['top.skills.desc']);
    expect(rows[1]).toHaveAccessibleDescription(strings['top.sdk.desc']);
    expect(rows[2]).toHaveAccessibleDescription(strings['top.api.desc']);
    expect(rows[3]).toHaveAccessibleDescription('Opens in a new tab');
    expect(rows[4]).toHaveAccessibleDescription('Opens in a new tab');
    // One rule, the kit menu's own, right above Documentation.
    const flow = [...document.querySelectorAll('[role="menuitem"], [role="separator"]')];
    expect(flow.map((e) => e.getAttribute('role'))).toEqual(['menuitem', 'menuitem', 'menuitem', 'menuitem', 'separator', 'menuitem']);
    expect(flow[3]).toBe(rows[3]);
    expect(flow[5]).toBe(rows[4]);
    expect(menu).toBeInTheDocument();
  });

  it('Skills goes to the Guide Skills section and opens no tab; the menu closes', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<TopBarLinks />);
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: strings['top.skills'] }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/guide#skills' });
    expect(open).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('SDK on GitHub opens the repository in a new tab, no opener; the keyboard reaches it', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<TopBarLinks />);
    trigger().focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: strings['top.sdk'] }));
    await user.keyboard('{Enter}');
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://github.com/HoodyNetwork/hoody-sdk', '_blank', 'noopener,noreferrer');
    expect(navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  const openRow = async (name: string, pageHost?: string) => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<TopBarLinks />);
    await user.click(trigger());
    const row = await screen.findByRole('menuitem', { name });
    if (pageHost) vi.stubGlobal('location', { ...window.location, host: pageHost, origin: `https://${pageHost}` });
    await user.click(row);
    return open;
  };

  it.each([
    ['api.hoody.com', 'https://install.hoody.com/?source=hub'],
    ['api.hoody.com', 'https://install.hoody.com/?source=hub'],
    ['api.other.example', 'https://install.hoody.com/?source=hub'],
    ['hub.hoody.com', 'https://install.hoody.com/?source=hub'],
  ])('Install Hoody on %s opens %s in a new tab, no opener', async (pageHost, url) => {
    const open = await openRow('Install Hoody', pageHost);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['api.hoody.com', 'api.other.example'])('Documentation on %s opens docs.hoody.com in a new tab, no opener', async (pageHost) => {
    const open = await openRow('Documentation', pageHost);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://docs.hoody.com/?source=hub', '_blank', 'noopener,noreferrer');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('API goes to the API page through the router and opens no tab', async () => {
    const open = await openRow(strings['top.api']);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/api' });
    expect(open).not.toHaveBeenCalled();
  });

  it('Escape closes the menu with nothing chosen and puts focus back on the trigger', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<TopBarLinks />);
    await user.click(trigger());
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
    expect(open).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
