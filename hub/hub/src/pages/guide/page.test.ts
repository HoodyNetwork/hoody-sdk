// Vitest: the guide page's logic and interaction in every fixture state.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import {
  BOT_DOORS,
  CONNECT_DOORS,
  DOORS,
  cleanEntry,
  currentSection,
  docsUrl,
  doorById,
  fillTemplate,
  kitUrl,
  maskAddress,
  parseGuideState,
  resolveDoor,
  stepSection,
  type GuideFacts,
  type SectionId,
} from './logic';
import page from './page';
import strings from './strings.en.json';

const computer = { id: '0a1b2c3d4e5f60718293a4b5', name: 'atlas', project: 'proj1', node: 'n12', running: true, ssh: 'atlas.ssh.example.com' };
const facts: GuideFacts = { known: true, computer, domain: 'hoody.network', botLabel: 'chief-3', docsBase: 'https://docs.example.com', realm: { name: 'R', all: false } };

describe('guide logic', () => {
  it('fills a template only from valid facts', () => {
    expect(fillTemplate('hoody agent {c}', facts)).toBe('hoody agent 0a1b2c3d4e5f60718293a4b5');
    expect(fillTemplate('https://{label}.hoody.bot', facts)).toBe('https://chief-3.hoody.bot');
    expect(fillTemplate('hoody agent {c}', { ...facts, computer: null })).toBe('');
    expect(fillTemplate('https://{label}.hoody.bot', { ...facts, botLabel: null })).toBe('');
  });

  it('never fills a value that is not a plain host label', () => {
    expect(fillTemplate('https://{label}.hoody.bot', { ...facts, botLabel: 'a.b/evil' })).toBe('');
    expect(fillTemplate('hoody agent {c}', { ...facts, computer: { ...computer, id: 'x; rm -rf /' } })).toBe('');
    expect(fillTemplate('https://x.{domain}', { ...facts, domain: 'bad domain' })).toBe('');
  });

  it('keeps {{x}} in a value literal and fills in one pass', () => {
    expect(fillTemplate('{c}', { ...facts, computer: { ...computer, id: 'ab{c}' } })).toBe('');
  });

  it('resolves a door, saying what a missing line waits for', () => {
    const cli = resolveDoor(doorById('cli'), { ...facts, computer: null });
    // static lines stay whole; only the unknown part becomes a placeholder, and Copy waits for it
    expect(cli[0]?.text).toBe('curl -fsSL https://install.hoody.com | sh');
    const withHole = cli.filter((l) => l.needs.length > 0);
    expect(withHole.length).toBe(3);
    expect(withHole.every((l) => l.needs[0] === 'computer' && l.text === '')).toBe(true);
    expect(withHole[1]?.parts).toEqual(['hoody agent ', { placeholder: 'computer' }]);
    const models = resolveDoor(doorById('models'), { ...facts, botLabel: null });
    expect(models.every((l) => l.needs[0] === 'bot' && l.text === '')).toBe(true);
    expect(resolveDoor(doorById('ssh'), facts).map((l) => l.text)).toContain('ssh atlas.ssh.example.com');
    expect(resolveDoor(doorById('ssh'), { ...facts, computer: { ...computer, ssh: 'bad host!' } }).map((l) => l.text)).not.toContain('ssh bad host!');
  });

  it('has every door once, split between Connect and Bots', () => {
    const ids = DOORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...CONNECT_DOORS, ...BOT_DOORS].sort()).toEqual([...ids].sort());
  });

  it('builds kit addresses and masks the computer id', () => {
    const url = kitUrl(facts, 'agent', 1);
    expect(url).toBe('https://proj1-0a1b2c3d4e5f60718293a4b5-agent-1.n12.hoody.network');
    expect(maskAddress(url, [computer.id, computer.project])).toBe('https://proj1-0a1b…a4b5-agent-1.n12.hoody.network');
    expect(maskAddress(url, [computer.id, computer.project])).not.toContain(computer.id);
    expect(kitUrl({ computer: null, domain: 'x.com' }, 'agent', 1)).toBe('');
  });

  it('accepts a documentation base only over https', () => {
    expect(docsUrl('https://docs.example.com/', '/kit/files/')).toBe('https://docs.example.com/kit/files/');
    expect(docsUrl('http://docs.example.com', '/kit/')).toBe('');
    expect(docsUrl('javascript:alert(1)', '/kit/')).toBe('');
    expect(docsUrl('https://docs.example.com', '/../x?y')).toBe('');
  });

  it('steps between sections and clamps at the ends', () => {
    const v: SectionId[] = ['ask', 'connect', 'keys'];
    expect(stepSection(v, undefined, 1)).toBe('ask');
    expect(stepSection(v, 'ask', 1)).toBe('connect');
    expect(stepSection(v, 'keys', 1)).toBe('keys');
    expect(stepSection(v, 'ask', -1)).toBe('ask');
    expect(stepSection([], 'ask', 1)).toBeUndefined();
  });

  it('picks the section at the reading line', () => {
    const order: SectionId[] = ['ask', 'connect', 'links'];
    expect(currentSection(new Map(), order)).toBe('ask');
    expect(currentSection(new Map([['ask', -400], ['connect', 40], ['links', 600]]), order)).toBe('connect');
    expect(currentSection(new Map([['ask', -900], ['connect', -300], ['links', -10]]), order)).toBe('links');
    expect(currentSection(new Map([['ask', -900], ['connect', -300], ['links', 500]]), order, 96, true)).toBe('links');
  });

  it('at the end of the scroll, a section a jump went to stays current (there is no scroll room under the last section)', () => {
    const order: SectionId[] = ['ask', 'connect', 'links'];
    const tops = new Map<SectionId, number>([['ask', -900], ['connect', 300], ['links', 500]]);
    expect(currentSection(tops, order, 96, true, false, 'connect')).toBe('connect');
    expect(currentSection(tops, order, 96, true, false, 'links')).toBe('links');
    expect(currentSection(tops, order, 96, true, false, undefined)).toBe('links');
    // Away from the end the reading line decides; the top of the scroll is still the first section.
    expect(currentSection(tops, order, 96, false, false, 'connect')).toBe('ask');
    expect(currentSection(tops, order, 96, true, true, 'connect')).toBe('ask');
  });

  it('reads stored state fail-closed', () => {
    expect(parseGuideState('not json')).toEqual({});
    expect(parseGuideState(JSON.stringify({ v: 2, a: {} }))).toEqual({});
    expect(cleanEntry({ seen: 1, s2: 'yes', cl: 'nonsense', done: { computer: 1, ask: true } })).toMatchObject({ seen: 1, s2: 0, door: '', done: { computer: 1, ask: 0 } });
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`u${i}`, { at: i + 1 }]));
    expect(Object.keys(parseGuideState(JSON.stringify({ v: 1, a: many })))).toHaveLength(8);
    expect(Object.keys(parseGuideState(JSON.stringify({ v: 1, a: { '__proto__': {}, 'bad id': {}, ok: {} } })))).toEqual(['ok']);
  });
});

describe('guide page', () => {
  it('shows the sections and fills the first door', async () => {
    await renderPage(page);
    // The first render of a file loads the page cold: up to 30 s for it to appear (the cold load can be slow on a busy machine).
    expect(await screen.findByRole('heading', { level: 2, name: strings['connect.title'] }, { timeout: 30_000 })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: strings['sections.label'] });
    expect(within(nav).getAllByRole('link').length).toBeGreaterThanOrEqual(9);
  }, 45_000);

  it('switches doors with the keyboard and shows the filled command', async () => {
    await renderPage(page, { path: '/guide?door=cli' });
    // The CLI door is shell-coloured, so a command spans several elements: read the panel's text.
    const panel = await screen.findByRole('region', { name: strings['door.cli'] });
    await waitFor(() => expect(panel.textContent).toMatch(/hoody agent login -c [0-9a-f]{4}…[0-9a-f]{4}/));
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{24}/i);
    const door = screen.getAllByRole('button', { name: strings['door.cli'], pressed: true })[0];
    if (!door) throw new Error('no CLI door');
    door.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('button', { pressed: true })[0]).toHaveTextContent(strings['door.coding']);
  });

  it('never draws a full computer id in the address list', async () => {
    await renderPage(page, { path: '/guide#links' });
    await screen.findByRole('heading', { level: 2, name: strings['links.title'] });
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{24}/i);
    expect((await screen.findAllByText(/[0-9a-f]{4}…[0-9a-f]{4}/, { selector: 'span' })).length).toBeGreaterThan(0);
  });

  it('says a line is not filled in when no computer is picked', async () => {
    await renderPage(page, { state: 'noComputer', path: '/guide?door=cli' });
    expect((await screen.findAllByRole('img', { name: 'Missing: computer' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: strings['door.pickComputer'] }).length).toBeGreaterThan(0);
  });

  it('asks for a Bot when none exists', async () => {
    await renderPage(page, { path: '/guide?bdoor=models' });
    expect((await screen.findAllByRole('img', { name: 'Missing: bot' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: strings['door.pickBot'] }).length).toBeGreaterThan(0);
  });

  it('shows "could not read" with a retry when facts fail, never "none"', async () => {
    await renderPage(page, { state: 'unknown' });
    expect((await screen.findAllByText(strings['rail.unknown'])).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
  });

  it('hides the Topics section when no page contributes a topic', async () => {
    await renderPage(page);
    await screen.findByRole('heading', { level: 2, name: strings['connect.title'] });
    expect(screen.queryByRole('heading', { name: strings['topics.title'] })).not.toBeInTheDocument();
  });
});
