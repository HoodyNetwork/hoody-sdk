// Vitest: the Connect a laptop drawer is one calm Verdict and one flat Track. The Verdict says what you get; the Track
// has three steps, What to connect, On the
// laptop, Run it on the laptop, and a wait row naming the outcome. The run step is the one framed step. Warnings about a
// field sit under that field (Band attach), never free-standing; the FAQ links sit only inside a Why or a Band's actions.
import { describe, expect, it } from 'vitest';
import { interpolate } from '@kit';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const TITLE = 'Connect a laptop to atlas';
const named = (key: keyof typeof strings) => interpolate(strings[key], { name: 'atlas' });
const open = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['setup.open'] }));
  return screen.findByRole('dialog', { name: TITLE });
};
const track = (dlg: HTMLElement) => within(dlg).getByRole('list', { name: strings['setup.track'] });
const step = (dlg: HTMLElement, id: string) => {
  const li = track(dlg).querySelector<HTMLElement>(`[data-step="${id}"]`);
  if (!li) throw new Error(`no step ${id}`);
  return li;
};

describe('tunnels setup: Verdict and Track', () => {
  it('a calm Verdict says what you get, naming the computer, and what comes next', async () => {
    await renderPage(page);
    const dlg = await open();
    const plate = within(dlg).getByRole('group', { name: strings['setup.verdict'] });
    expect(within(plate).getByText(named('setup.intro'))).toBeInTheDocument();
    expect(within(plate).getByText(strings['setup.next'])).toBeInTheDocument();
  });

  it('the track has the three steps in order and the wait row; the run step is the one open, framed step', async () => {
    await renderPage(page);
    const dlg = await open();
    const ids = [...track(dlg).querySelectorAll('[data-step]')].map((x) => x.getAttribute('data-step'));
    expect(ids).toEqual(['what', 'laptop', 'run', 'online']);
    expect(step(dlg, 'online')).toHaveAttribute('data-state', 'wait');
    const run = within(dlg).getByRole('region', { name: new RegExp(`^${strings['setup.run']}`) });
    expect(step(dlg, 'run').contains(run)).toBe(true);
    expect(within(dlg).getAllByRole('region')).toHaveLength(1);
    expect(run.textContent).toMatch(/hoody --computer \S+ tunnel expose 3000/);
    // The wait row names the outcome and holds where it shows up.
    expect(within(step(dlg, 'online')).getByText(strings['setup.wait.expose'])).toBeInTheDocument();
    expect(within(step(dlg, 'online')).getByText(strings['setup.address.later'])).toBeInTheDocument();
  });

  it('with a previewed place, the wait row still says the tunnel shows in the list, marked New', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`^${strings['setup.advanced']}`) }));
    await userEvent.type(await within(dlg).findByRole('textbox', { name: named('setup.computerPort') }), '8080');
    await waitFor(() => expect(dlg.textContent).toMatch(/tunnel expose 3000 --port 8080/));
    // The address is previewed, so the "address shows later" line gives way, but where to find it stays.
    expect(within(step(dlg, 'online')).queryByText(strings['setup.address.later'])).toBeNull();
    expect(within(step(dlg, 'online')).getByText(strings['setup.listed'])).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('radio', { name: new RegExp(strings['setup.pull']) }));
    expect(await within(step(dlg, 'online')).findByText('127.0.0.1:8080')).toBeInTheDocument();
    expect(within(step(dlg, 'online')).getByText(strings['setup.listed'])).toBeInTheDocument();
  });

  it('with a field to fix, the laptop step is the open one and the run step waits', async () => {
    await renderPage(page);
    const dlg = await open();
    const port = within(dlg).getByRole('textbox', { name: strings['setup.port'] });
    await userEvent.clear(port);
    await userEvent.type(port, '0');
    await waitFor(() => expect(step(dlg, 'laptop')).toHaveAttribute('data-state', 'now'));
    expect(step(dlg, 'run')).toHaveAttribute('data-state', 'later');
    expect(step(dlg, 'laptop').contains(within(dlg).getByRole('region'))).toBe(true);
    expect(within(within(dlg).getByRole('group', { name: strings['setup.verdict'] })).getByText(strings['setup.next.fix'])).toBeInTheDocument();
  });

  it('a database port warns under the Port field, which names the warning; no band stands alone', async () => {
    await renderPage(page);
    const dlg = await open();
    const port = within(dlg).getByRole('textbox', { name: strings['setup.port'] });
    await userEvent.clear(port);
    await userEvent.type(port, '5432');
    const band = (await within(dlg).findByText(strings['setup.warn.risky'])).closest<HTMLElement>('[id]');
    expect(band).not.toBeNull();
    expect(port.getAttribute('aria-describedby') ?? '').toContain(band!.id);
    expect(band!.closest('[data-band-attach]')).not.toBeNull();
  });

  it('a risky port on the computer warns under the computer Port field, not the laptop one; both risky warn under both', async () => {
    await renderPage(page);
    const dlg = await open();
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`^${strings['setup.advanced']}`) }));
    const computer = await within(dlg).findByRole('textbox', { name: named('setup.computerPort') });
    const laptop = within(dlg).getByRole('textbox', { name: strings['setup.port'] });
    await userEvent.type(computer, '8080');
    const describedBy = (field: HTMLElement) => (field.getAttribute('aria-describedby') ?? '').split(' ').map((id) => dlg.querySelector(`[id="${id}"]`)?.textContent ?? '').join(' ');
    await waitFor(() => expect(describedBy(computer)).toContain(strings['setup.warn.risky']));
    expect(describedBy(laptop)).not.toContain(strings['setup.warn.risky']);
    await userEvent.clear(laptop);
    await userEvent.type(laptop, '5432');
    await waitFor(() => expect(describedBy(laptop)).toContain(strings['setup.warn.risky']));
    expect(describedBy(computer)).toContain(strings['setup.warn.risky']);
  });

  it('the run step says where each tool runs: CLI lines in a terminal, the SDK example saved as a program and run', async () => {
    await renderPage(page);
    const dlg = await open();
    expect(step(dlg, 'run')).toHaveTextContent(strings['setup.run.why']);
    await userEvent.click(within(dlg).getByRole('radio', { name: strings['setup.tool.sdk'] }));
    await waitFor(() => expect(step(dlg, 'run')).not.toHaveTextContent(strings['setup.run.why']));
    expect(step(dlg, 'run').textContent).toMatch(/tunnel\.mjs and run it with node or bun/);
  });

  it('the failure causes are a closed "If it fails" Why inside the run step, ending with its FAQ link', async () => {
    await renderPage(page);
    const dlg = await open();
    const why = within(step(dlg, 'run')).getByRole('button', { name: strings['setup.fails'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(why);
    expect(await within(step(dlg, 'run')).findByRole('link', { name: strings['setup.fails.more'] })).toBeInTheDocument();
  });

  it('the drawer body holds no FAQ link outside a Why or a band: the old loose links are gone', async () => {
    await renderPage(page);
    const dlg = await open();
    // The old loose links' words (their keys left with them): the page's own questions still hold the answers.
    const gone = [strings['setup.intro.more'], 'About the port on the computer', 'About the password box'];
    for (const name of gone) expect(within(dlg).queryByRole('link', { name })).toBeNull();
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`^${strings['setup.advanced']}`) }));
    for (const name of gone) expect(within(dlg).queryByRole('link', { name })).toBeNull();
  });
});
