// The Setup drawer and the page's notes say only what is true for the choice made: bringing a service in promises no
// public address, a computer port's error names the range that works, a refused read of the computer's programs ticks
// the password box, and a note never names a control or a mark that may not be there.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const open = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['setup.open'] }));
  return screen.findByRole('dialog', { name: 'Connect a laptop to atlas' });
};
const advanced = (dlg: HTMLElement) => within(dlg).getByRole('button', { name: new RegExp(`^${strings['setup.advanced']}`) });
const pickPull = (dlg: HTMLElement) => userEvent.click(within(dlg).getByRole('radio', { name: new RegExp(strings['setup.pull']) }));

describe('tunnels setup: true for the choice made', () => {
  it('bringing a service in: the outcome says no public address, and no longer promises to put an app online', async () => {
    await renderPage(page);
    const dlg = await open();
    expect(dlg.textContent).toMatch(/put a laptop app online straight from atlas/);
    await pickPull(dlg);
    expect(await within(dlg).findByText('Bring a laptop service into atlas: programs on atlas reach it, and it gets no public address.')).toBeInTheDocument();
    expect(dlg.textContent).toMatch(/no public address/);
    expect(dlg.textContent).not.toMatch(/put a laptop app online straight from/);
  });

  it('another machine as the host: online when put online, reachable from the computer when brought in', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.type(within(dlg).getByRole('textbox', { name: strings['setup.host'] }), '10.0.0.5');
    expect(await within(dlg).findByText('This puts another machine on your network online.')).toBeInTheDocument();
    await pickPull(dlg);
    expect(await within(dlg).findByText('This lets programs on atlas reach another machine on your network.')).toBeInTheDocument();
    expect(within(dlg).queryByText('This puts another machine on your network online.')).toBeNull();
  });

  it('a computer port out of range: the error names the range that works on the computer', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.click(advanced(dlg));
    await userEvent.type(await within(dlg).findByRole('textbox', { name: 'Port on atlas' }), '70000');
    expect(await within(dlg).findByText('Use a port from 80 to 65535.')).toBeInTheDocument();
    // The laptop's port keeps its own range.
    const port = within(dlg).getByRole('textbox', { name: strings['setup.port'] });
    await userEvent.clear(port);
    await userEvent.type(port, '0');
    expect(await within(dlg).findByText('Use a port from 1 to 65535.')).toBeInTheDocument();
  });

  it('the computer refused the read of its programs: Advanced starts open with the password box ticked', async () => {
    await renderPage(page, { state: 'daemon-forbidden' });
    expect(await screen.findByText(strings['st.forbiddenDaemon'])).toBeInTheDocument();
    const dlg = await open();
    expect(advanced(dlg)).toHaveAttribute('aria-expanded', 'true');
    expect(within(dlg).getByRole('checkbox', { name: /^atlas\b.*password/ })).toBeChecked();
  });

  it('the wait row promises the list, not a mark that needs an earlier read to compare with', async () => {
    await renderPage(page);
    const dlg = await open();
    expect(within(dlg).getByText('Its address shows in the list when it connects.')).toBeInTheDocument();
    expect(dlg.textContent).not.toMatch(/marked New/);
  });
});

describe('tunnels: notes that hold in every layout and state', () => {
  it('the detail of a waiting address says the same as its group: reconnecting or closing', () => {
    expect(strings['status.reconnecting']).toBe(strings['group.reconnecting']);
  });
  it('"Not loading?" says where Refresh is (the list), since a narrow detail hides it', () => {
    expect(strings['note.why']).toMatch(/press Refresh in the list\.$/);
  });
  it('a failed read does not claim there was no answer (an unreadable answer fails the same way)', () => {
    expect(strings['st.failed']).not.toMatch(/did not answer/);
  });
  it('a session that shares nothing says how to share: the Connect a laptop action, by its name', () => {
    expect(strings['idle.line']).toContain(`press ${strings['setup.open']}`);
  });
  it('a cut-off session list is counted as "or more"', () => {
    expect(strings['summary.more_other']).toBe('{{count}} or more sessions connected to {{name}}');
  });
});
