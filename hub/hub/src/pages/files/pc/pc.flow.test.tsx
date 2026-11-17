// Vitest: "Use from your PC". The tab shows hoody mount / hoody share commands for
// the computer pane A shows: its id masked on screen and copied whole; the read-only line first, with the line that the
// CLI signs in on its own, for a session that cannot change files; the network-drive steps open the Mount panel (its
// address masked); the Hoody SDK's mount (in this tab, not in the Mount dialog) shows the files
// address masked and copies it whole; no pane computer asks for one. At a glance (computer,
// masked id, files address, access rules, this session), three mount lines first and the other variants in a
// Disclosure. The tab asks what the person wants first (four ways, kept in the URL as way=) and shows only that way's
// steps: install by every method (the script, PowerShell, npm, npx), what else the PC needs in the open, then the lines.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cliCommand, maskId, platformHosts } from '@kit';
import { fixtureWorld } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetFiles } from '../fixtures';
import page from '../page';
import { CLI_INSTALL, NPX, SDK_INSTALL, WAYS, sh, wayOf } from './PcPanel';
import ps from './pc.strings.en.json';
import ms from '../Mount.strings.en.json';
import fs from '../strings.en.json';

const ATLAS = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const fill = (s: string, v: Record<string, string> = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const written: string[] = [];
const block = (label: string) => screen.findByRole('figure', { name: label });
const step = (n: number, what: string) => fill(ps.step, { n: String(n), what });
/** The choice of a way: its radio, by the way's own sentence. */
const wayRadio = (way: (typeof WAYS)[number]) => screen.findByRole('radio', { name: (n) => n.startsWith(fill(ps[`way.${way}`], { name: 'atlas' })) }, { timeout: 20_000 });
const codes = (el: HTMLElement) => [...el.querySelectorAll('code')].map((c) => c.textContent ?? '');
/** Open the mount section's Disclosure and return its block. */
async function moreBlock() {
  await userEvent.click(await screen.findByRole('button', { name: (n) => n.startsWith(ps['mount.more']) }));
  return block(fill(ps['mount.moreLabel'], { name: 'atlas' }));
}

beforeEach(() => {
  resetFiles();
  written.length = 0;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
});
afterEach(() => { written.length = 0; });

describe('Use from your PC', () => {
  it('is the third tab, in tab=pc; mount and share commands show the id masked and copy it whole', async () => {
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp' });
    await userEvent.click(await screen.findByRole('tab', { name: ps['tab.pc'] }, { timeout: 20_000 }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'pc' }));
    const mount = await block(fill(ps['mount.label'], { name: 'atlas' }));
    expect(codes(mount)).toContain(`hoody mount ${maskId(ATLAS.id)} ~/hoody/atlas`);
    expect(codes(mount)).toContain(`hoody mount ${maskId(ATLAS.id)}:/srv/app ~/hoody/app`);
    expect(document.body.textContent).not.toContain(ATLAS.id);
    await userEvent.click(within(mount).getByRole('button', { name: new RegExp(`Copy.*${ps['mount.whole']}`) }));
    await waitFor(() => expect(written).toEqual([`hoody mount ${ATLAS.id} ~/hoody/atlas`]));
    await userEvent.click(await wayRadio('share'));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: 'pc', way: 'share' }));
    const share = await block(fill(ps['share.label'], { name: 'atlas' }));
    await userEvent.click(within(share).getByRole('button', { name: new RegExp(`Copy.*${ps['share.readOnly']}`) }));
    await waitFor(() => expect(written.at(-1)).toBe(`hoody -c ${ATLAS.id} share ~/docs --read-only`));
    expect(document.body.textContent).not.toContain(ATLAS.id);
  }, 40_000);

  it('a session that can change files sees the read-write line first and no sign-in line', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
    const mount = await block(fill(ps['mount.label'], { name: 'atlas' }));
    const captions = within(mount).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(captions[0]).toContain(ps['mount.whole']);
    // with no folder in pane A the second line is read-only; unmount is third
    expect(captions[1]).toContain(ps['mount.readOnly']);
    expect(captions[2]).toContain(ps['mount.unmount']);
    expect(screen.queryByText(ps['mount.signIn'])).toBeNull();
  }, 40_000);

  it('a session that cannot change files sees the read-only line first and that the CLI signs in on its own', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc', state: 'tokenRead' });
    const mount = await block(fill(ps['mount.label'], { name: 'atlas' }));
    const first = within(mount).getAllByRole('listitem')[0]!;
    expect(first.textContent).toContain(ps['mount.readOnly']);
    expect(first.textContent).toContain('--read-only');
    expect(within(mount).getAllByRole('listitem')[1]!.textContent).toContain(ps['mount.whole']);
    expect(screen.getByText(ps['mount.signIn'])).toBeInTheDocument();
  }, 40_000);

  it('At a glance: Mount as a network drive opens the Mount panel with its address masked', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
    const glance = await screen.findByRole('region', { name: ps['atGlance.title'] }, { timeout: 20_000 });
    await userEvent.click(within(glance).getByRole('button', { name: new RegExp(`^${ms['mount.short']}`) }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(fill(ms['mount.title'], { name: 'atlas' }))).toBeInTheDocument();
    expect(d.textContent).not.toContain(ATLAS.id);
  }, 40_000);

  it('a computer with no files address says so and offers no Mount button; the CLI lines stay', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc', state: 'noAddress' });
    expect(await screen.findByText(ps['atGlance.noAddress'], {}, { timeout: 20_000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(`^${ms['mount.short']}`) })).toBeNull();
    expect(codes(await block(fill(ps['mount.label'], { name: 'atlas' })))).toContain(`hoody mount ${maskId(ATLAS.id)} ~/hoody/atlas`);
    // the network drive way says why it has no steps
    await userEvent.click(await wayRadio('drive'));
    expect(await screen.findByText(fill(ps['nocli.noAddress'], { name: 'atlas' }))).toBeInTheDocument();
    expect(screen.queryByText(ps['drive.body'])).toBeNull();
    expect(screen.queryByText(ms['mount.system'])).toBeNull();
  }, 40_000);

  it('the folder-only mount has its own unmount lines; the whole computer\'s are named so', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&tab=pc' });
    const mount = await block(fill(ps['mount.label'], { name: 'atlas' }));
    expect(codes(mount)).toEqual([`hoody mount ${maskId(ATLAS.id)} ~/hoody/atlas`, `hoody mount ${maskId(ATLAS.id)}:/srv/app ~/hoody/app`, 'hoody unmount ~/hoody/atlas']);
    expect(within(mount).getByText(ps['mount.unmount'])).toBeInTheDocument();
    const more = await moreBlock();
    expect(codes(more)).toContain('hoody unmount ~/hoody/app');
    expect(codes(more)).toContain('hoody unmount ~/hoody/app --force');
    expect(codes(more)).toContain('hoody unmount ~/hoody/atlas --force');
    expect(codes(more)).toContain(`hoody mount ${maskId(ATLAS.id)} ~/hoody/atlas --read-only`);
    expect(codes(more)).toContain('hoody mount --list');
    expect(within(more).getByText(fill(ps['mount.unmountFolder'], { folder: 'app' }))).toBeInTheDocument();
    // every line is in exactly one of the two blocks
    expect(codes(mount).filter((c) => codes(more).includes(c))).toEqual([]);
    // the --force lines' cost (unsent files wait in the cache) is said with them, in the open Disclosure
    expect(screen.getByText(ps['mount.forceNote'])).toBeVisible();
    await userEvent.click(within(more).getByRole('button', { name: new RegExp(`Copy.*${fill(ps['mount.forceFolder'], { folder: 'app' })}`) }));
    await waitFor(() => expect(written.at(-1)).toBe('hoody unmount ~/hoody/app --force'));
  }, 40_000);

  it('a path with a quote says how PowerShell writes it instead; one without says only that the lines are for macOS or Linux', async () => {
    await renderPage(page, { path: `/files?a=atlas.00a1&ap=${encodeURIComponent("/srv/it's")}&tab=pc` });
    const mount = await block(fill(ps['mount.label'], { name: 'atlas' }));
    expect(codes(mount)).toContain(`hoody mount ${maskId(ATLAS.id)}:'/srv/it'\\''s' ~/hoody/'it'\\''s'`);
    // said under the lines it is about
    expect(mount.textContent).toContain(ps['shell.quote']);
    expect(mount.textContent).not.toContain(ps['shell.posix']);
  }, 40_000);

  it('the mount step: what the person gets, and the access-rules line as a notice above the lines; the sync caveat is in the questions', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc', state: 'rulesUnknown' });
    await block(fill(ps['mount.label'], { name: 'atlas' }));
    const region = screen.getByRole('region', { name: step(3, fill(ps['mount.title'], { name: 'atlas' })) });
    const rules = within(region).getByText(fill(ps['mount.rulesUnknown'], { name: 'atlas' }));
    // above the lines, not under them
    const figure = within(region).getByRole('figure', { name: fill(ps['mount.label'], { name: 'atlas' }) });
    expect(rules.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.textContent).not.toContain('not a sync client');
  }, 40_000);

  it('without a quote in the path, no PowerShell note', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&tab=pc' });
    const mount = await block(fill(ps['mount.label'], { name: 'atlas' }));
    expect(within(mount).getByText(ps['shell.posix'])).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(ps['shell.quote']);
  }, 40_000);

  it('a session that cannot change files sees the read-only share line first, and why', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc&way=share', state: 'tokenRead' });
    const share = await block(fill(ps['share.label'], { name: 'atlas' }));
    expect(within(share).getAllByRole('listitem')[0]!.textContent).toContain('--read-only');
    expect(screen.getByText(fill(ps['share.signIn'], { name: 'atlas' }))).toBeInTheDocument();
  }, 40_000);

  it('a session that can change files sees the share line first and no read-only note', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc&way=share' });
    const share = await block(fill(ps['share.label'], { name: 'atlas' }));
    expect(within(share).getAllByRole('listitem')[0]!.textContent).toContain(ps['share.start']);
    expect(screen.queryByText(fill(ps['share.signIn'], { name: 'atlas' }))).toBeNull();
  }, 40_000);

  it('At a glance names the computer, its id masked, its access rules and what this session may do', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc', state: 'tokenRead' });
    const glance = await screen.findByRole('region', { name: ps['atGlance.title'] }, { timeout: 20_000 });
    expect(glance.textContent).toContain('atlas');
    expect(glance.textContent).toContain(maskId(ATLAS.id));
    expect(glance.textContent).toContain(ps['atGlance.session.read']);
    // the shared world says nothing of access rules: not known
    expect(glance.textContent).toContain(ps['atGlance.rules.unknown']);
    expect(glance.textContent).not.toContain(ATLAS.id);
    // the files address: masked here, Copy takes the real one
    // the id: masked here, Copy takes the whole one
    await userEvent.click(within(glance).getByRole('button', { name: /^Copy full reference/ }));
    await waitFor(() => expect(written.at(-1)).toBe(ATLAS.id));
    await userEvent.click(within(glance).getByRole('button', { name: /^Copy .*address/i }));
    await waitFor(() => expect(written.at(-1)).toMatch(/^https:\/\//));
    expect(glance.textContent).not.toContain(written.at(-1)!);
  }, 40_000);

  for (const [state, key] of [['rules', 'atGlance.rules.set'], ['many', 'atGlance.rules.open']] as const) {
    it(`At a glance with access rules ${state === 'rules' ? 'set' : 'none'} says so, and only that`, async () => {
      await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc', state });
      const glance = await screen.findByRole('region', { name: ps['atGlance.title'] }, { timeout: 20_000 });
      expect(glance.textContent).toContain(ps[key]);
      for (const other of (['atGlance.rules.set', 'atGlance.rules.open', 'atGlance.rules.unknown'] as const).filter((k) => k !== key)) expect(glance.textContent).not.toContain(ps[other]);
    }, 40_000);
  }

  it('a session that can change files reads so At a glance', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
    const glance = await screen.findByRole('region', { name: ps['atGlance.title'] }, { timeout: 20_000 });
    expect(glance.textContent).toContain(ps['atGlance.session.change']);
  }, 40_000);

  it('Install: every way to get the CLI, each with its sign-in line; what else the PC needs shows without a click', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
    const install = await block(ps['need.cliLabel']);
    // the script first (this browser is not Windows)
    expect(codes(install)).toEqual([CLI_INSTALL.unix, 'hoody login --web']);
    const methods = screen.getByRole('radiogroup', { name: ps['need.method'] });
    expect(within(methods).getAllByRole('radio').map((r) => r.textContent)).toEqual([ps['need.m.unix'], ps['need.m.windows'], ps['need.m.npm'], ps['need.m.npx']]);
    await userEvent.click(within(methods).getByRole('radio', { name: ps['need.m.windows'] }));
    expect(codes(await block(ps['need.cliLabel']))).toEqual(['irm https://install.hoody.com/install.ps1 | iex', 'hoody login --web']);
    expect(screen.getByText(ps['need.m.windows.note'])).toBeInTheDocument();
    await userEvent.click(within(methods).getByRole('radio', { name: ps['need.m.npm'] }));
    expect(codes(await block(ps['need.cliLabel']))).toEqual(['npm install -g hoody-sdk', 'hoody login --web']);
    // without installing: the sign-in alone, through npx, and the line that says how the later lines read
    await userEvent.click(within(methods).getByRole('radio', { name: ps['need.m.npx'] }));
    expect(codes(await block(ps['need.cliLabel']))).toEqual([`${NPX} login --web`]);
    expect(screen.getByText(ps['need.m.npx.note'])).toBeInTheDocument();
    await userEvent.click(within(await block(ps['need.cliLabel'])).getByRole('button', { name: new RegExp(`Copy.*${ps['need.signIn']}`) }));
    await waitFor(() => expect(written.at(-1)).toBe('npx hoody-sdk login --web'));
    for (const k of ['need.rclone', 'need.mac', 'need.windows', 'need.linux', 'need.kit'] as const) expect(screen.getByText(ps[k])).toBeVisible();
  }, 40_000);

  it('Install: a Windows browser sees the PowerShell line first', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    try {
      await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
      expect(codes(await block(ps['need.cliLabel']))[0]).toBe(CLI_INSTALL.windows);
    } finally {
      ua.mockRestore();
    }
  }, 40_000);

  // The sign-in names the platform only off hoody.com, the npm CLI's default.
  it('Install: on another platform the sign-in names its API', async () => {
    try {
      vi.stubGlobal('location', { ...window.location, host: 'api.example.test', origin: 'https://api.example.test' });
      await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
      const install = await block(ps['need.cliLabel']);
      expect(install.textContent).toContain(cliCommand('login --web', platformHosts('api.example.test')));
      expect(install.textContent).toContain('--base-url');
    } finally {
      vi.unstubAllGlobals();
    }
  }, 40_000);

  it('Install: on hoody.com, the npm CLI\'s default, the sign-in is bare', async () => {
    try {
      vi.stubGlobal('location', { ...window.location, host: 'api.hoody.com', origin: 'https://api.hoody.com' });
      await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
      const install = await block(ps['need.cliLabel']);
      expect(install.textContent).toContain('hoody login --web');
      expect(install.textContent).not.toContain('--base-url');
    } finally {
      vi.unstubAllGlobals();
    }
  }, 40_000);

  it('no computer in pane A asks for one', async () => {
    await renderPage(page, { path: '/files?tab=pc', computer: false });
    expect(await screen.findByText(ps['pick.title'], {}, { timeout: 20_000 })).toBeInTheDocument();
  }, 40_000);

  it('shell words are quoted only when they need it', () => {
    expect(sh('app')).toBe('app');
    expect(sh('/srv/my app')).toBe(`'/srv/my app'`);
    expect(sh("it's")).toBe(`'it'\\''s'`);
  });
});

describe('Use from your PC: by the files address', () => {
  it('the CLI line by the files address needs no sign-in: masked on screen, copied whole', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
    const lines = await moreBlock();
    expect(codes(lines).at(-2)).toMatch(/^hoody mount https:\/\/\S+ \.\/hoody$/);
    expect(codes(lines).at(-1)).toBe('hoody unmount ./hoody');
    await userEvent.click(within(lines).getByRole('button', { name: new RegExp(`Copy.*${ps['address.mount'].replace(/[()]/g, '.')}`) }));
    await waitFor(() => expect(written.at(-1)).toMatch(/^hoody mount https:\/\/\S+ \.\/hoody$/));
    // the address grants access: whole on the clipboard, never on screen
    expect(written.at(-1)).toContain(ATLAS.id);
    expect(written.at(-1)).not.toBe(codes(lines).at(-2));
    expect(document.body.textContent).not.toContain(written.at(-1)!.split(' ')[2]!);
  }, 40_000);

  it('a computer with no files address shows no address line', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc', state: 'noAddress' });
    const lines = await moreBlock();
    expect(codes(lines).some((c) => c.includes('https://') || c.includes('./hoody'))).toBe(false);
  }, 40_000);
});

describe('Use from your PC: from your code', () => {
  it('the Hoody SDK lines show the files address masked and copy it whole', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc&way=code' });
    const sdk = await block(ps['sdk.label']);
    expect(screen.getByRole('heading', { name: step(3, ps['sdk.title']) })).toBeInTheDocument();
    expect(codes(sdk)[0]).toBe("import { mount } from 'hoody-sdk/mount';");
    expect(codes(sdk)[1]).toMatch(/^await mount\(\{ kitUrl: 'https:\/\/\S+', localPath: '\.\/hoody' \}\);$/);
    expect(document.body.textContent).not.toContain(ATLAS.id);
    await userEvent.click(within(sdk).getByRole('button', { name: ps['sdk.copyCall'] }));
    await waitFor(() => expect(written.at(-1)).toMatch(/^await mount\(\{ kitUrl: 'https:\/\/\S+', localPath: '\.\/hoody' \}\);$/));
    expect(written.at(-1)).toContain(ATLAS.id);
    await userEvent.click(within(sdk).getByRole('button', { name: 'Copy all' }));
    await waitFor(() => expect(written.at(-1)).toBe(`import { mount } from 'hoody-sdk/mount';\n${written.at(-2)}`));
  }, 40_000);
});

describe('Use from your PC: which way', () => {
  it('asks what the person wants first: four ways, the folder on the PC chosen, and only its steps below', async () => {
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
    const ask = await screen.findByRole('region', { name: ps['way.title'] }, { timeout: 20_000 });
    const radios = within(ask).getAllByRole('radio');
    expect(radios).toHaveLength(WAYS.length);
    for (const w of WAYS) expect(ask.textContent).toContain(fill(ps[`way.${w}`], { name: 'atlas' }));
    expect(await wayRadio('folder')).toBeChecked();
    // the choice is the first thing on the tab
    expect(within(screen.getByRole('tabpanel', { name: ps['tab.pc'] })).getAllByRole('region')[0]).toBe(ask);
    // the folder way: install, needs, mount, in that order, numbered; no other way's lines
    const titles = screen.getAllByRole('heading').map((h) => h.textContent ?? '');
    const at = (t: string) => titles.findIndex((x) => x.includes(t));
    expect(at(step(1, ps['need.title']))).toBeGreaterThan(-1);
    expect(at(step(2, ps['need.more']))).toBeGreaterThan(at(step(1, ps['need.title'])));
    expect(at(step(3, fill(ps['mount.title'], { name: 'atlas' })))).toBeGreaterThan(at(step(2, ps['need.more'])));
    expect(screen.queryByRole('figure', { name: fill(ps['share.label'], { name: 'atlas' }) })).toBeNull();
    expect(screen.queryByRole('figure', { name: ps['sdk.label'] })).toBeNull();
    expect(screen.queryByText(ms['mount.system'])).toBeNull();
    // what the person gets is said with the lines
    expect(screen.getByText(fill(ps['mount.get'], { name: 'atlas', dir: '~/hoody/atlas' }))).toBeInTheDocument();
    expect(router.state.location.search).not.toHaveProperty('way');
  }, 40_000);

  it('the network drive: nothing to install, the steps for this device in place, the address masked', async () => {
    const { router } = await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc' });
    await userEvent.click(await wayRadio('drive'));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ way: 'drive' }));
    const drive = await screen.findByRole('region', { name: fill(ps['drive.title'], { name: 'atlas' }) });
    expect(within(drive).getByText(ms['mount.system'])).toBeInTheDocument();
    expect(within(drive).getByText(ps['drive.body'])).toBeInTheDocument();
    // the per-system details are in the page's questions, not in the section
    expect(drive.textContent).not.toContain('50 MB');
    expect(within(drive).getByText(ms['mount.key'])).toBeInTheDocument();
    await userEvent.click(within(drive).getByRole('button', { name: /^Copy .*files address/i }));
    await waitFor(() => expect(written.at(-1)).toMatch(/^https:\/\//));
    expect(document.body.textContent).not.toContain(ATLAS.id);
    // no CLI step on this way, and the address shows once
    expect(screen.queryByRole('figure', { name: ps['need.cliLabel'] })).toBeNull();
    expect(screen.queryByRole('figure', { name: fill(ps['mount.label'], { name: 'atlas' }) })).toBeNull();
    const about = screen.getByRole('region', { name: ps['atGlance.title'] });
    expect(within(about).queryByRole('button', { name: /^Copy .*address/i })).toBeNull();
    expect(within(about).queryByRole('button', { name: new RegExp(`^${ms['mount.short']}`) })).toBeNull();
    // back to the first way: the URL is clean again
    await userEvent.click(await wayRadio('folder'));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('way'));
    expect(await block(fill(ps['mount.label'], { name: 'atlas' }))).toBeInTheDocument();
  }, 40_000);

  it('a PC folder into the computer: the CLI and rclone, no mount driver; what the person gets is said', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc&way=share' });
    expect(await wayRadio('share')).toBeChecked();
    expect(codes(await block(ps['need.cliLabel']))[0]).toBe(CLI_INSTALL.unix);
    expect(screen.getByText(ps['need.rclone'])).toBeVisible();
    expect(screen.getByText(ps['need.kit'])).toBeVisible();
    for (const k of ['need.mac', 'need.windows', 'need.linux'] as const) expect(screen.queryByText(ps[k])).toBeNull();
    expect(screen.getByRole('heading', { name: step(3, fill(ps['share.title'], { name: 'atlas' })) })).toBeInTheDocument();
    expect(screen.getByText(fill(ps['share.get'], { name: 'atlas' }))).toBeInTheDocument();
    expect(screen.queryByRole('figure', { name: fill(ps['mount.label'], { name: 'atlas' }) })).toBeNull();
    // what deleting does stays with the share, above its lines; when it works is in the questions
    const share = screen.getByRole('region', { name: step(3, fill(ps['share.title'], { name: 'atlas' })) });
    const warn = within(share).getByText(ps['share.deletes']);
    expect(warn.compareDocumentPosition(within(share).getByRole('figure', { name: fill(ps['share.label'], { name: 'atlas' }) })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(share.textContent).not.toContain('Ctrl+C waits');
  }, 40_000);

  it('from code: the package by npm or bun, the same needs as a mount, then the call', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc&way=code' });
    const add = await block(ps['sdk.installLabel']);
    expect(add.textContent).toContain(SDK_INSTALL.npm);
    await userEvent.click(screen.getByRole('radio', { name: ps['sdk.m.bun'] }));
    const bun = await block(ps['sdk.installLabel']);
    expect(bun.textContent).toContain('bun add hoody-sdk');
    expect(bun.textContent).not.toContain('npm');
    for (const k of ['need.rclone', 'need.mac', 'need.windows', 'need.linux', 'need.kit'] as const) expect(screen.getByText(ps[k])).toBeVisible();
    expect(screen.queryByRole('figure', { name: ps['need.cliLabel'] })).toBeNull();
    expect(await block(ps['sdk.label'])).toBeInTheDocument();
  }, 40_000);

  it('from code with no files address says there is nothing to mount, and shows no call', async () => {
    await renderPage(page, { path: '/files?a=atlas.00a1&tab=pc&way=code', state: 'noAddress' });
    expect(await screen.findByText(fill(ps['sdk.noAddress'], { name: 'atlas' }), {}, { timeout: 20_000 })).toBeInTheDocument();
    expect(screen.queryByRole('figure', { name: ps['sdk.label'] })).toBeNull();
  }, 40_000);

  it('the Files question about the command line names every install way the picker offers', () => {
    for (const line of [...Object.values(CLI_INSTALL), NPX]) expect(fs['faq.mountCli.a']).toContain(line);
  });

  it('a way the URL does not know is the first way', () => {
    expect(wayOf(undefined)).toBe('folder');
    expect(wayOf('ftp')).toBe('folder');
    expect(wayOf('drive')).toBe('drive');
    expect(WAYS[0]).toBe('folder');
  });
});
