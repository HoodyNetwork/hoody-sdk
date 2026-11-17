// Vitest: the programs page's logic and interaction in every fixture state.
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import { many } from './fixtures';
import { programModel as model, programProof as proves } from '@core';
import { ask, parsePort, portStartOk, stateTest } from './logic';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

const overview = many;

// The header summary names its computer as a link, so the sentence spans elements: match the whole text of the
// header's context row (kit PageHeader: the <div> beside the title line in the title box, never clamped).
function summaryLine(re: RegExp): HTMLElement;
function summaryLine(re: RegExp, wait: true): Promise<HTMLElement>;
function summaryLine(re: RegExp, wait?: true) {
  const m = (_: string, el: Element | null) =>
    el?.tagName === 'DIV' &&
    !el.querySelector('h1') &&
    [...(el.parentElement?.children ?? [])].some((c) => c.firstElementChild?.matches('h1[data-hub-title]')) &&
    re.test(el.textContent ?? '');
  return wait ? screen.findByText(m) : screen.getByText(m);
}

function rowOf(key: string) {
  const row = model(overview)?.rows.find((r) => r.key === key);
  if (!row) throw new Error(`no fixture row ${key}`);
  return row;
}

describe('programs logic', () => {
  const m = model(overview);

  it('reads the overview and counts yours, system and attention', () => {
    expect(m).not.toBeNull();
    expect(m?.counts.yours).toBe(9);
    expect(m?.counts.system).toBe(9);
    expect(m?.counts.systemAttention).toBe(1);
    expect(m?.counts.attention).toBeGreaterThanOrEqual(4);
  });

  it('refuses a body that is not the daemon answer', () => {
    expect(model(null)).toBeNull();
    expect(model({ programs: 'x' })).toBeNull();
  });

  it('orders yours before system and attention before the rest', () => {
    const rows = m?.rows ?? [];
    expect(rows[0]?.attention).toBe(true);
    const firstSystem = rows.findIndex((r) => r.scope === 'system');
    expect(rows.slice(0, firstSystem).every((r) => r.scope !== 'system')).toBe(true);
  });

  it('filters by state: problems never count as stopped', () => {
    expect(stateTest(rowOf('prog:3'), 'problems')).toBe(true);
    expect(stateTest(rowOf('prog:3'), 'stopped')).toBe(false);
    expect(stateTest(rowOf('prog:1'), 'running')).toBe(true);
    expect(stateTest(rowOf('prog:2'), 'running')).toBe(true);
    expect(stateTest(rowOf('prog:6'), 'stopped')).toBe(true);
  });

  it('offers no action on a program whose state is unreadable', () => {
    const r = rowOf('prog:9');
    expect(r.state).toBe('unknown');
    expect(r.can).toMatchObject({ start: false, stop: false, restart: false, boot: false });
  });

  it('treats a turned-off program as off and not startable', () => {
    const r = rowOf('prog:8');
    expect(r.state).toBe('off');
    expect(r.can.start).toBe(false);
  });

  it('keeps boot switches to the user own programs', () => {
    expect(rowOf('prog:1').can.boot).toBe(true);
    expect(rowOf('prog:100').can.boot).toBe(false);
  });

  it('asks before stopping or restarting a system program, and names what relies on it', () => {
    expect(ask(rowOf('prog:120'), 'restart')).toEqual({ dep: 'scripts' });
    expect(ask(rowOf('prog:100'), 'stop')).toEqual({ dep: 'agent' });
    expect(ask(rowOf('prog:100'), 'start')).toBeNull();
    expect(ask(rowOf('prog:1'), 'stop')).toBeNull();
  });

  it('checks a typed port against the range', () => {
    const api = rowOf('prog:2');
    expect(parsePort('8003', api)).toBe(8003);
    expect(parsePort(' 8001 ', api)).toBeNull();
    expect(parsePort('9000', api)).toBeNull();
    expect(parsePort('80a', api)).toBeNull();
    expect(portStartOk(api, 8002)).toBe(true);
  });

  it('a port action needs evidence for that exact port: a missing part proves nothing', () => {
    const api = rowOf('prog:2');
    expect(api.parts.some((p) => p.port === 8003)).toBe(false);
    expect(proves('start', api, 8003)).toBe(false);
    expect(proves('stop', api, 8003)).toBe(false);
  });

  it('a stopped lazy program (idle: it waits for its first visitor) proves a stop', () => {
    const lazy = rowOf('prog:7');
    expect(lazy.state).toBe('idle');
    expect(proves('stop', lazy, null)).toBe(true);
  });

  it('proves a start or stop from the read-back, never a restart', () => {
    const up = rowOf('prog:1');
    const down = rowOf('prog:6');
    expect(proves('start', up, null)).toBe(true);
    expect(proves('start', down, null)).toBe(false);
    expect(proves('stop', down, null)).toBe(true);
    expect(proves('stop', up, null)).toBe(false);
    expect(proves('stop', null, null)).toBe('gone');
    expect(proves('restart', up, null)).toBe(false);
    expect(proves('boot', up, null, { boot: true })).toBe(true);
    expect(proves('boot', up, null, { boot: false })).toBe(false);
  });
});

describe('programs page', () => {
  beforeEach(() => opsStore.reset());

  it('lists every program, names the computer the shell shows, and keeps system programs in a collapsed group', async () => {
    const first = await renderPage(page);
    await screen.findByRole('row', { name: /web/ });
    // System programs sit in one collapsed group row, counted in the header all the same.
    expect(screen.queryByRole('row', { name: /hoody-agent/ })).toBeNull();
    expect(summaryLine(/19 programs on atlas/)).toBeInTheDocument();
    first.unmount();
  });

  it('the system group row opens to show the system programs, with its problem count', async () => {
    await renderPage(page);
    const group = await screen.findByRole('button', { name: new RegExp(strings['group.system']) });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('1 problem')).toBeInTheDocument();
    await userEvent.click(group);
    expect(await screen.findByRole('row', { name: /hoody-agent/ })).toBeInTheDocument();
  });

  it('opens a program with the keyboard and keeps the selection in the URL', async () => {
    const { router } = await renderPage(page);
    await screen.findByRole('row', { name: /web/ });
    const first = within(screen.getByRole('table', { name: strings.title })).getAllByRole('row')[1];
    if (!first) throw new Error('no data row');
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.search).toMatchObject({ sel: expect.stringMatching(/^prog:/) });
  });

  it('shows the detail of a deep-linked program with its glance and its ports', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A2' });
    expect(await screen.findAllByLabelText(strings['detail.facts'])).not.toHaveLength(0);
    expect(await screen.findByRole('heading', { name: strings['detail.glance'] })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Ports of api' })).toBeInTheDocument();
  });

  it('says so when the program is no longer on the computer', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A999' });
    expect(await screen.findByText(strings['detail.notFound'])).toBeInTheDocument();
  });

  it('asks before restarting a system program and sends nothing until confirmed', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A100' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart hoody-agent' }))[0] as HTMLElement);
    expect(await screen.findByText('Restart hoody-agent?')).toBeInTheDocument();
    expect(screen.getByText(strings['dep.agent'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['confirm.cancel'] }));
    expect(screen.queryByText('Restart hoody-agent?')).toBeNull();
  });

  it('keeps a press whose outcome is unknown as "may have gone through" with Check again, and sends nothing twice', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    expect(await screen.findAllByText(strings['op.pendingRow'])).not.toHaveLength(0);
    // While held, the row's inline action is off with its reason (the kit's soft disable: aria-disabled and a described
    // reason, still focusable): a second press cannot go out.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Restart web' })[0]).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getAllByRole('button', { name: 'Restart web' })[0]).toHaveAccessibleDescription(expect.stringContaining(strings['ports.held']));
    expect((await screen.findAllByRole('button', { name: /Check again/ })).length).toBeGreaterThan(0);
  });

  it('shows the failure words of a definite refusal and lets the user dismiss it', async () => {
    await renderPage(page, { state: 'press-failed', path: '/programs?sel=prog%3A6' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Start docs-preview' }))[0] as HTMLElement);
    expect(await screen.findAllByText(strings['op.failedShort'])).not.toHaveLength(0);
  });

  it('shows the empty state', async () => {
    await renderPage(page, { state: 'empty' });
    expect(await screen.findByText(strings['empty.none.title'])).toBeInTheDocument();
  });

  it('shows the error state with a retry', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('explains a computer that does not let the Hub read its programs', async () => {
    await renderPage(page, { state: 'private' });
    expect(await screen.findByText(strings['st.title.private'])).toBeInTheDocument();
  });

  it('a held "may have gone through" stays with its computer: another computer shows none and can act; back on the first it is still held', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A6' });
    await screen.findByRole('row', { name: /docs-preview/ });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Start docs-preview' }))[0] as HTMLElement);
    expect(await screen.findAllByText(strings['op.pendingRow'], {}, { timeout: 4000 })).not.toHaveLength(0);
    const other = fixtureWorld.computers.find((c) => c.name === 'harbor');
    const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas');
    if (!other || !atlas) throw new Error('no world computers');
    act(() => {
      chooseComputer({ id: other.id, project_id: other.project_id, status: other.status, server_name: other.server_name });
    });
    await summaryLine(/\d+ programs on harbor/, true);
    await screen.findByRole('row', { name: /docs-preview/ });
    expect(screen.queryAllByText(strings['op.pendingRow'])).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Start docs-preview' })[0]).toBeEnabled();
    act(() => {
      chooseComputer({ id: atlas.id, project_id: atlas.project_id, status: atlas.status, server_name: atlas.server_name });
    });
    await summaryLine(/\d+ programs on atlas/, true);
    await screen.findByRole('row', { name: /docs-preview/ });
    expect(await screen.findAllByText(strings['op.pendingRow'], {}, { timeout: 4000 })).not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Start docs-preview' })[0]).toHaveAttribute('aria-disabled', 'true');
  });

  it('a system-program confirmation closes when the computer changes and sends nothing to the new one', async () => {
    await renderPage(page, { path: '/programs?sel=prog%3A100' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart hoody-agent' }))[0] as HTMLElement);
    expect(await screen.findByText('Restart hoody-agent?')).toBeInTheDocument();
    const other = fixtureWorld.computers.find((c) => c.name === 'harbor');
    if (!other) throw new Error('no harbor');
    act(() => {
      chooseComputer({ id: other.id, project_id: other.project_id, status: other.status, server_name: other.server_name });
    });
    await summaryLine(/\d+ programs on harbor/, true);
    await screen.findByRole('button', { name: new RegExp(strings['group.system']) });
    expect(screen.queryByText('Restart hoody-agent?')).toBeNull();
  });

  it('explains a stopped computer (the one the shell has selected)', async () => {
    await renderPage(page);
    const fjord = fixtureWorld.computers.find((c) => c.name === 'fjord');
    if (!fjord) throw new Error('no fjord');
    act(() => {
      chooseComputer({ id: fjord.id, project_id: fjord.project_id, status: fjord.status });
    });
    expect(await screen.findByText(strings['st.title.stopped'])).toBeInTheDocument();
    expect(screen.getByText(/fjord is not running/)).toBeInTheDocument();
  });
});
