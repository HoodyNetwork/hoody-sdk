// The Setup drawer says which computer the laptop connects to, says plainly what a
// tunnel is for, keeps the computer port (a web address does not need it) and the password box under Advanced, and
// never hides a field that blocks the command.
import { describe, expect, it } from 'vitest';
import { interpolate } from '@kit';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

// The fixture world's current computer.
const NAME = 'atlas';
const named = (key: keyof typeof strings) => interpolate(strings[key], { name: NAME });
// Literal expectations: a title, label or intro that stops naming the computer fails here, even when the
// strings table and the component change together.
const TITLE = 'Connect a laptop to atlas';
const PORT_LABEL = 'Port on atlas';
const LOGIN_LABEL = /^atlas\b.*password/;

const open = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['setup.open'] }));
  return screen.findByRole('dialog', { name: TITLE });
};
const advanced = (dlg: HTMLElement) => within(dlg).getByRole('button', { name: new RegExp(`^${strings['setup.advanced']}`) });

describe('tunnels setup: which computer, and what it is for', () => {
  it('the drawer is titled with the computer it connects to and says what a tunnel is for', async () => {
    await renderPage(page);
    const dlg = await open();
    const intro = within(dlg).getByText(named('setup.intro'));
    // What it is for, in plain words: like ngrok, from the laptop, straight from this computer, nothing outside to pay.
    expect(intro.textContent).toMatch(/\bngrok\b/);
    expect(intro.textContent).toMatch(/\blaptop\b/);
    expect(intro.textContent).toMatch(/\batlas\b/);
    expect(intro.textContent).toMatch(/no outside service/);
    // The command still goes to that computer.
    expect(dlg.textContent).toMatch(/hoody --computer \S+ tunnel expose 3000/);
  });
});

describe('tunnels setup: Advanced', () => {
  it('starts closed: the computer port and the password box are not shown, and the command needs neither', async () => {
    await renderPage(page);
    const dlg = await open();
    expect(advanced(dlg)).toHaveAttribute('aria-expanded', 'false');
    expect(within(dlg).queryByRole('textbox', { name: PORT_LABEL })).toBeNull();
    expect(within(dlg).queryByRole('checkbox', { name: LOGIN_LABEL })).toBeNull();
    expect(dlg.textContent).not.toMatch(/--port/);
  });

  it('opened, it holds the computer port (with the web-address hint) and the named password box', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.click(advanced(dlg));
    const port = await within(dlg).findByRole('textbox', { name: PORT_LABEL });
    expect(within(dlg).getByText(strings['setup.computerPort.hint'])).toBeInTheDocument();
    expect(within(dlg).getByText(named('setup.login.hint'))).toBeInTheDocument();
    await userEvent.type(port, '8080');
    await waitFor(() => expect(dlg.textContent).toMatch(/tunnel expose 3000 --port 8080/));
    // The web address preview shows, with its port.
    expect(within(dlg).queryByText(strings['setup.address.later'])).toBeNull();
    // The address field's own buttons name it by its port ("Copy port 8080" and the like).
    expect(within(dlg).getAllByRole('button', { name: new RegExp(interpolate(strings['web.label'], { port: 8080 })) }).length).toBeGreaterThan(0);
  });

  it('a computer port below 1024 shows its warning right under that field, inside Advanced', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.click(advanced(dlg));
    const port = await within(dlg).findByRole('textbox', { name: PORT_LABEL });
    await userEvent.type(port, '443');
    const band = await within(dlg).findByText(strings['setup.warn.privileged']);
    // Inside the panel the Advanced trigger controls.
    const panel = document.getElementById(advanced(dlg).getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    expect(panel?.contains(band)).toBe(true);
    expect(panel?.contains(port)).toBe(true);
    // After the computer port in document order, before the password box.
    const login = within(dlg).getByRole('checkbox', { name: LOGIN_LABEL });
    expect(port.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(band.compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Bring into this computer gives the computer port its own hint', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp(strings['setup.pull']) }));
    await userEvent.click(advanced(dlg));
    expect(await within(dlg).findByText(named('setup.computerPort.hint.pull'))).toBeInTheDocument();
    expect(within(dlg).queryByText(strings['setup.computerPort.hint'])).toBeNull();
  });

  it('the Hub was refused by the access settings: Advanced starts open with the password box ticked', async () => {
    await renderPage(page, { state: 'forbidden' });
    expect(await screen.findByText(strings['st.forbidden'])).toBeInTheDocument();
    const dlg = await open();
    expect(advanced(dlg)).toHaveAttribute('aria-expanded', 'true');
    expect(within(dlg).getByRole('checkbox', { name: LOGIN_LABEL })).toBeChecked();
    expect(within(dlg).getByRole('textbox', { name: strings['setup.user'] })).toBeInTheDocument();
  });

  it('a field inside with an error keeps Advanced open, so what blocks the command stays in view', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.click(advanced(dlg));
    await userEvent.type(await within(dlg).findByRole('textbox', { name: PORT_LABEL }), '79');
    expect(await within(dlg).findByText(strings['setup.err.low'])).toBeInTheDocument();
    await userEvent.click(advanced(dlg));
    expect(advanced(dlg)).toHaveAttribute('aria-expanded', 'true');
    expect(within(dlg).getByText(strings['setup.err.low'])).toBeVisible();
    expect(within(dlg).getByText(strings['setup.fixFirst'])).toBeInTheDocument();
  });

  it('a ticked password box with no user name keeps Advanced open too', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.click(advanced(dlg));
    await userEvent.click(await within(dlg).findByRole('checkbox', { name: LOGIN_LABEL }));
    expect(await within(dlg).findByText(strings['setup.fixFirst'])).toBeInTheDocument();
    await userEvent.click(advanced(dlg));
    expect(advanced(dlg)).toHaveAttribute('aria-expanded', 'true');
    expect(within(dlg).getByRole('textbox', { name: strings['setup.user'] })).toBeVisible();
  });
});
