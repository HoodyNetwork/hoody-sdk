// The Skills and "Build your own" sections and the platform hosts in every command. The top-bar menu has its
// own file (parts/TopBarLinks.test.tsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { doorById, resolveDoor, SECTIONS, type GuideFacts } from './logic';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';
import { cliCommand, platformHosts } from '@kit';

// A jump scrolls the page's own scroller through the kit (scrollSettingsSection); record each one.
const jumps = vi.hoisted(() => ({ scrolled: [] as string[] }));
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  scrollSettingsSection: (el: HTMLElement | null | undefined) => {
    jumps.scrolled.push(el?.id ?? '');
  },
}));

let scrolled: string[] = [];
beforeEach(() => {
  scrolled = jumps.scrolled = [];
});
afterEach(() => vi.restoreAllMocks());

const nav = () => screen.getByRole('navigation', { name: strings['sections.label'] });

describe('skills and build sections', () => {
  it('come right after Connect, in the order and in the index', async () => {
    expect(SECTIONS.slice(0, 4)).toEqual(['ask', 'connect', 'skills', 'build']);
    expect(links.section('skills')).toBe('/guide#skills');
    await renderPage(page);
    // The first render of a file loads the page cold: up to 30 s for it to appear (the cold load can be slow on a busy machine).
    expect(await screen.findByRole('heading', { level: 2, name: strings['skills.title'] }, { timeout: 30_000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: strings['build.title'] })).toBeInTheDocument();
    expect(document.getElementById('guide-skills')).not.toBeNull();
    expect(document.getElementById('guide-build')).not.toBeNull();
    const hrefs = within(nav()).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#/guide#skills');
    expect(hrefs).toContain('#/guide#build');
  }, 45_000);

  it('opens on #skills from a link', async () => {
    await renderPage(page, { path: '/guide#skills' });
    await waitFor(() => expect(scrolled).toEqual(['guide-skills']));
  });

  it('J reaches Skills then Build from Connect', async () => {
    await renderPage(page, { path: '/guide#connect' });
    await waitFor(() => expect(scrolled).toEqual(['guide-connect']));
    await userEvent.keyboard('j');
    await waitFor(() => expect(scrolled.at(-1)).toBe('guide-skills'));
    await userEvent.keyboard('j');
    await waitFor(() => expect(scrolled.at(-1)).toBe('guide-build'));
  });

  it('teaches both installs, the check and the update with the real commands', async () => {
    await renderPage(page, { path: '/guide#skills' });
    const sec = await screen.findByRole('region', { name: strings['skills.title'] });
    const text = sec.textContent ?? '';
    for (const c of [
      'npx skills add https://hoody.com/SKILLS/SKILL.md',
      'npx skills add HoodyNetwork/hoody-sdk',
      'npx skills list',
      'npx skills list -g',
      'npx skills check',
      'npx skills update',
    ]) expect(text).toContain(c);
    for (const agent of ['claude-code', 'codex', 'cursor', 'gemini-cli', 'github-copilot', 'opencode']) expect(text).toContain(agent);
    expect(within(sec).getByRole('link', { name: strings['skills.keysLink'] })).toHaveAttribute('href', '#/keys');
  });

  it('shows how to see the Hub calls, warns about the token and gives the same call three ways', async () => {
    await renderPage(page, { path: '/guide#build' });
    const sec = await screen.findByRole('region', { name: strings['build.title'] });
    const text = sec.textContent ?? '';
    for (const k of ['F12', 'Ctrl+Shift+I', 'Cmd+Option+I', 'Fetch/XHR']) expect(text).toContain(k);
    expect(text).toContain(strings['build.token']);
    expect(text).toContain('curl -H "Authorization: Bearer $HOODY_TOKEN" https://api.hoody.com/api/v1/computers/');
    // On hoody.com (the CLI's default platform) the command names no --base-url.
    expect(text).toContain('hoody computers list');
    expect(text).not.toContain('--base-url');
    expect(text).toContain('hoody.api.computers.list()');
    expect(within(sec).getByRole('link', { name: strings['build.skillsLink'] })).toHaveAttribute('href', '#/guide#skills');
  });
});

describe('platform hosts in the doors', () => {
  const plat: GuideFacts = { known: true, computer: null, domain: 'hoody.com', botLabel: null, docsBase: '', realm: { name: '', all: false }, hosts: platformHosts('api.hoody.com') };

  it('points every hoody.com command at the platform the Hub runs on', () => {
    const text = (id: Parameters<typeof doorById>[0]) => resolveDoor(doorById(id), plat).map((l) => l.parts.filter((p) => typeof p === 'string').join(''));
    expect(text('coding')).toEqual(['npx skills add https://hoody.com/SKILLS/SKILL.md', 'npx skills add HoodyNetwork/hoody-sdk']);
    expect(text('cli')[0]).toBe('curl -fsSL https://install.hoody.com | sh');
    expect(text('ai')[0]).toBe('@https://hoody.com Connect to Hoody');
    expect(text('http')[0]).toContain('https://api.hoody.com/api/v1/computers/');
    expect(text('sdk')[1]).toContain("baseURL: 'https://api.hoody.com'");
    expect(text('ssh')[0]).toBe('ssh hoody.com');
    expect(text('browser')[0]).toBe('https://hub.hoody.com');
  });

  it('the CLI sign-in names the platform API only off the CLI\'s default platform (the CLI remembers it)', () => {
    const signIn = (f?: GuideFacts) => resolveDoor(doorById('cli'), f).find((l) => l.cap === 'signIn')?.text;
    // The exact flagged lines are pinned once, in kit cliCommand.test.ts (the conformance test bans them anywhere else).
    expect(signIn(plat)).toBe(cliCommand('login', platformHosts('api.hoody.com')));
    expect(signIn({ ...plat, hosts: platformHosts('api.example.net') })).toContain('api.example.net');
    expect(signIn({ ...plat, hosts: platformHosts('api.hoody.com') })).toBe('hoody login');
    expect(signIn({ ...plat, hosts: platformHosts('api.example.net') })).toBe(cliCommand('login', platformHosts('api.example.net')));
  });

  it('uses the public install command when no platform facts are given', () => {
    expect(resolveDoor(doorById('cli'))[0]?.text).toBe('curl -fsSL https://install.hoody.com | sh');
  });

  it('uses the page\'s own platform while facts are loading or failed', async () => {
    vi.stubGlobal('location', { ...window.location, host: 'api.hoody.com', origin: 'https://api.hoody.com' });
    try {
      expect(resolveDoor(doorById('cli'))[0]?.text).toBe('curl -fsSL https://install.hoody.com | sh');
      const noHosts: GuideFacts = { ...plat, hosts: undefined };
      expect(resolveDoor(doorById('http'), noHosts)[0]?.parts.join('')).toContain('https://api.hoody.com/');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the CLI line names the platform API like curl and the SDK do', async () => {
    vi.stubGlobal('location', { ...window.location, host: 'api.example.test', origin: 'https://api.example.test' });
    try {
      await renderPage(page, { path: '/guide#build' });
      const sec = await screen.findByRole('region', { name: strings['build.title'] });
      expect(sec.textContent).toContain(cliCommand('computers list', platformHosts('api.example.test')));
      expect(sec.textContent).toContain('--base-url');
      expect(sec.textContent).not.toContain('api.hoody.com');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('code colour (kit CodeBlock lang)', () => {
  const panel = async (door: string) => {
    await renderPage(page, { path: `/guide?door=${door}#connect` });
    return screen.findByRole('region', { name: strings[`door.${door}` as 'door.sdk'] });
  };

  it('the CLI door reads as shell; the AI chat line stays plain', async () => {
    const cli = await panel('cli');
    await waitFor(() => expect(cli.querySelector('[class*="sh_"]')).not.toBeNull());
    const ai = await panel('ai');
    expect(ai.querySelector('[class*="sh_"], [class*="hl_"]')).toBeNull();
  });

  const stepCodes = (door: Element) => [...door.querySelectorAll('code')] as HTMLElement[];

  it.each(['ready', 'noComputer'] as const)('the SDK door: npm is shell, the sample TypeScript (%s)', async (state) => {
    await renderPage(page, { state, path: '/guide?door=sdk#connect' });
    const sdk = await screen.findByRole('region', { name: strings['door.sdk'] });
    await waitFor(() => expect(sdk.textContent).toContain('HoodyClient'));
    const [npm, sample] = stepCodes(sdk) as [HTMLElement, HTMLElement];
    expect(npm.querySelector('[class*="sh_cmd"]')?.textContent).toBe('npm');
    expect(npm.querySelector('[class*="hl_"]')).toBeNull();
    expect(sample.querySelector('[class*="hl_kw"]')?.textContent).toBe('import');
    expect(sample.querySelector('[class*="sh_"]')).toBeNull();
  });

  it('the SDK door with no computer: the placeholder sits in the string, the string coloured on both sides', async () => {
    await renderPage(page, { state: 'noComputer', path: '/guide?door=sdk#connect' });
    const sdk = await screen.findByRole('region', { name: strings['door.sdk'] });
    await waitFor(() => expect(sdk.textContent).toContain('HoodyClient'));
    const sample = stepCodes(sdk)[1] as HTMLElement;
    const strs = [...sample.querySelectorAll('[class*="hl_str"]')].map((e) => e.textContent);
    expect(strs.slice(-2)).toEqual(["'", "'"]);
    expect(sample.querySelector('[role="img"]')?.closest('[class*="hl_"]')).toBeNull();
  });

  it('the HTTP door: curl is shell, the address stays plain', async () => {
    const http = await panel('http');
    await waitFor(() => expect(stepCodes(http).length).toBe(2));
    const [curl, address] = stepCodes(http) as [HTMLElement, HTMLElement];
    expect(curl.querySelector('[class*="sh_cmd"]')?.textContent).toBe('curl');
    expect(address.querySelector('[class*="hl_"], [class*="sh_"]')).toBeNull();
  });

  it('the model door: the two addresses stay plain, the claude line is shell', async () => {
    await renderPage(page, { path: '/guide?bdoor=models#bots' });
    const models = await screen.findByRole('region', { name: strings['door.models'] });
    await waitFor(() => expect(stepCodes(models).length).toBe(3));
    const [openai, anthropic, claude] = stepCodes(models) as [HTMLElement, HTMLElement, HTMLElement];
    expect(openai.querySelector('[class*="hl_"], [class*="sh_"]')).toBeNull();
    expect(anthropic.querySelector('[class*="hl_"], [class*="sh_"]')).toBeNull();
    expect(claude.querySelector('[class*="sh_"]')).not.toBeNull();
  });

  // One block for the four ways to make the same call (no second and third block repeating their caption as a header):
  // each line keeps its own colour.
  it('Build: one block; the curl and CLI lines read as shell, the SDK sample as TypeScript, the agent prompt stays plain', async () => {
    await renderPage(page, { path: '/guide#build' });
    const sec = await screen.findByRole('region', { name: strings['build.title'] });
    expect(within(sec).queryByRole('figure', { name: strings['build.cap.sdk'] })).toBeNull();
    expect(within(sec).queryByRole('figure', { name: strings['build.cap.agent'] })).toBeNull();
    const same = within(sec).getByRole('figure', { name: strings['build.same'] });
    const [curl, cli, sdk, agent] = stepCodes(same) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(stepCodes(same)).toHaveLength(4);
    expect(curl.querySelector('[class*="sh_cmd"]')?.textContent).toBe('curl');
    expect(cli.querySelector('[class*="sh_"]')).not.toBeNull();
    expect(sdk.querySelector('[class*="hl_kw"]')?.textContent).toBe('import');
    expect(sdk.querySelector('[class*="sh_"]')).toBeNull();
    expect(agent.textContent).toContain(strings['skills.prompt']);
    expect(agent.querySelector('[class*="sh_"], [class*="hl_"]')).toBeNull();
  });
});
