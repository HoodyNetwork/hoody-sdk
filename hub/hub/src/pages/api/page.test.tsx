// Vitest: the API page through the real router on the stored catalog (catalog.gen.json):
// the services as closed categories over their resources, search and the service filter opening them, what is
// open kept across the Overview switch, search, one endpoint's authorisation and example (an account call sends the token, a program call
// never does), the language switch in ?lang, the Overview view, and a catalog that fails to load, then loads on Retry.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as KitModule from '@kit';
import type * as CatalogModule from './catalog';
import { unpackCatalog, type PackedCatalog } from './catalog';
import packed from './catalog.gen.json';
import hintStrings from '@kit/widgets/AgentHint.strings.en.json';
import page from './page';
import strings from './strings.en.json';

const fail = vi.hoisted(() => ({ next: 0 }));
const current = vi.hoisted(() => ({ target: null as unknown }));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useCurrentComputer: () => current.target }));
// The host the page is served from ('' = hoody.com's): currentPlatformHosts reads it, as a page on location.host does.
const served = vi.hoisted(() => ({ host: '' }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof KitModule>();
  return { ...real, currentPlatformHosts: () => real.platformHosts(served.host) };
});
vi.mock('./catalog', async (orig) => {
  const real = await orig<typeof CatalogModule>();
  return { ...real, loadCatalog: () => (fail.next-- > 0 ? Promise.reject(new Error('chunk')) : real.loadCatalog()) };
});

const list = () => screen.findByRole('table', { name: strings['list.label'] }, { timeout: 10000 });
/** api-cat-exact-counts: what a service's header says, from the stored catalog itself (its distinct tags, untagged as
 *  one, and its operations), whitespace dropped on both sides: "Agent26resources·346endpoints". */
const OPS = unpackCatalog(packed as unknown as PackedCatalog).ops;
const plural = (n: number, word: string) => `${n}${word}${n === 1 ? '' : 's'}`;
const svcWord = (id: string) => (strings as Record<string, string>)[`svc.${id}`] ?? id;
const counted = (id: string, ops = OPS.filter((o) => o.service === id)) =>
  `${svcWord(id)}${plural(new Set(ops.map((o) => o.tag)).size, 'resource')}·${plural(ops.length, 'endpoint')}`.replace(/\s+/g, '');
const said = (b: HTMLElement | undefined) => b?.textContent?.replace(/\s+/g, '');
/** The group headers drawn (each a disclosure button); one by the start of its name. */
const heads = (l: HTMLElement) => within(l).queryAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
const depthOf = (b: HTMLElement) => (b.closest('tr')?.dataset.groupDepth === '1' ? 1 : 0);
/** A service's header (a category) by the start of its name. */
const head = (l: HTMLElement, name: string) => heads(l).find((b) => depthOf(b) === 0 && b.textContent?.startsWith(name));
/** A resource's header under its service (the Agent service's first resource is also named Agent). */
const kid = (l: HTMLElement, name: string) => heads(l).find((b) => depthOf(b) === 1 && b.textContent?.startsWith(name));
const code = () => screen.getByRole('figure', { name: / example$/ });
/** The list is one scrolled list of virtual rows (no pager): jsdom lays nothing out, so give the scroller a
 *  size for the rows in sight to be drawn. */
function drawRows() {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
}

describe('the endpoint list', () => {
  beforeEach(drawRows);
  afterEach(() => vi.restoreAllMocks());
  it('every service starts closed as a category, with its resource and endpoint counts; opening one shows its resources', async () => {
    await renderPage(page);
    const l = await list();
    await waitFor(() => expect(heads(l)).toHaveLength(21));
    expect(heads(l).every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(within(l).queryByText('/api/v1/agent/logs/export')).toBeNull();
    // Every service's counts, exactly as the catalog holds them, in catalog order.
    const services = [...new Set(OPS.map((o) => o.service))];
    expect(heads(l).map(said)).toEqual(services.map((id) => counted(id)));
    expect(said(head(l, 'Agent'))).toBe(counted('agent'));
    await userEvent.click(head(l, 'Agent')!);
    expect(await within(l).findByText('/api/v1/agent/logs/export')).toBeInTheDocument();
    expect(kid(l, 'Agent')?.getAttribute('aria-expanded')).toBe('true');
    // Every other service drawn stays closed (Agent's 346 endpoints are virtual rows: the later ones are off screen).
    expect(heads(l).filter((b) => depthOf(b) === 0 && b.getAttribute('aria-expanded') === 'true').map((b) => b.textContent)).toEqual([expect.stringMatching(/^Agent/)]);
  });

  it('a search opens the services and resources with a match, counted by what matches', async () => {
    await renderPage(page);
    const l = await list();
    await waitFor(() => expect(heads(l)).toHaveLength(21));
    await userEvent.type(screen.getByRole('searchbox'), 'auth/tokens');
    await waitFor(() => expect(within(l).getAllByText('/api/v1/auth/tokens').length).toBe(2));
    expect(head(l, 'Account API')?.textContent).toMatch(/^Account API\s*\d+ resources? · \d+ endpoints?$/);
    expect(kid(l, 'Auth Tokens')).toBeDefined();
  });

  it('search narrows by path, summary or id', async () => {
    await renderPage(page);
    const l = await list();
    await waitFor(() => expect(heads(l)).toHaveLength(21));
    await userEvent.type(screen.getByRole('searchbox'), 'waitlist');
    await waitFor(() => expect(within(l).getAllByText('/api/v1/waitlist').length).toBe(2));
    expect(within(l).queryByText('/api/v1/agent/logs/export')).toBeNull();
    // Counted by what matches: the account API's one Waitlist resource and its two endpoints; every service with no
    // match (Agent among them) is not drawn at all.
    expect(heads(l).filter((b) => depthOf(b) === 0).map(said)).toEqual([counted('api', OPS.filter((x) => x.service === 'api' && x.tag === 'Waitlist'))]);
    expect(said(kid(l, 'Waitlist'))).toBe(`Waitlist${plural(2, 'endpoint')}`);
    expect(head(l, 'Agent')).toBeUndefined();
  });

  it('the service filter opens that service', async () => {
    await renderPage(page, { path: '/api?service=agent' });
    const l = await list();
    expect(await within(l).findByText('/api/v1/agent/logs/export')).toBeInTheDocument();
    expect(heads(l).filter((b) => depthOf(b) === 0).map(said)).toEqual([counted('agent')]);
  });

  it('what is open is kept across the Overview switch', async () => {
    await renderPage(page);
    const l = await list();
    await waitFor(() => expect(heads(l)).toHaveLength(21));
    await userEvent.click(head(l, 'Agent')!);
    await userEvent.click(kid(l, 'Agent')!);
    await userEvent.click(screen.getByRole('tab', { name: strings['view.overview'] }));
    expect(await screen.findByText(strings['ov.desc'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: strings['view.endpoints'] }));
    const back = await list();
    await waitFor(() => expect(head(back, 'Agent')?.getAttribute('aria-expanded')).toBe('true'));
    expect(kid(back, 'Agent')?.getAttribute('aria-expanded')).toBe('false');
    expect(within(back).queryByText('/api/v1/agent/logs/export')).toBeNull();
  });

  it("a link to an endpoint opens its service and resource", async () => {
    await renderPage(page, { path: '/api?op=agent_exportLogs' });
    const l = await list();
    expect(await within(l).findByText('/api/v1/agent/logs/export')).toBeInTheDocument();
    expect(head(l, 'Agent')?.getAttribute('aria-expanded')).toBe('true');
    expect(heads(l).filter((b) => depthOf(b) === 0 && b.getAttribute('aria-expanded') === 'true')).toHaveLength(1);
  });
});

describe('one endpoint', () => {
  it('an account call sends Bearer $HOODY_TOKEN, and the language is kept in ?lang', async () => {
    const r = await renderPage(page, { path: '/api?op=api_listAuthTokens' });
    await screen.findByText(strings['auth.account'], undefined, { timeout: 10000 });
    expect(code()).toHaveTextContent('Bearer $HOODY_TOKEN');
    await userEvent.click(screen.getByRole('radio', { name: strings['lang.python'] }));
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ lang: 'python' }));
    expect(code()).toHaveTextContent('os.environ["HOODY_TOKEN"]');
  });

  it('a program call never names the account token', async () => {
    await renderPage(page, { path: '/api?op=browser_startInstance' });
    await screen.findByText(strings['auth.kit'], undefined, { timeout: 10000 });
    for (const l of ['lang.curl', 'lang.js', 'lang.python', 'lang.cli', 'lang.url'] as const) {
      const tab = screen.queryByRole('radio', { name: strings[l] });
      if (!tab) continue;
      await userEvent.click(tab);
      expect(code()).not.toHaveTextContent(/HOODY_TOKEN|token:/);
    }
  });

  it('a program call has a URL tab: one link through the computer\'s cURL program, with what it carries said', async () => {
    const r = await renderPage(page, { path: '/api?op=browser_startInstance' });
    await screen.findByText(strings['auth.kit'], undefined, { timeout: 10000 });
    await userEvent.click(screen.getByRole('radio', { name: strings['lang.url'] }));
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ lang: 'url' }));
    expect(code()).toHaveTextContent(/-curl-1\..*\/api\/v1\/curl\/request\?url=https:\/\/.*-browser-1\..*&method=/);
    expect(screen.getByText(strings['snip.urlNote'])).toBeInTheDocument();
  });

  it('an account call has no URL tab', async () => {
    await renderPage(page, { path: '/api?op=api_listAuthTokens' });
    await screen.findByText(strings['auth.account'], undefined, { timeout: 10000 });
    expect(screen.queryByRole('radio', { name: strings['lang.url'] })).toBeNull();
    expect(screen.queryByText(strings['snip.urlNote'])).toBeNull();
  });

  it('an undeclared account call carries the note', async () => {
    await renderPage(page, { path: '/api?op=api_login' });
    expect(await screen.findByText(strings['auth.undeclared'], undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it('a public call needs no token and, off the docs, says so', async () => {
    await renderPage(page, { path: '/api?op=api_waitlistJoin' });
    await screen.findByText(strings['auth.public'], undefined, { timeout: 10000 });
    expect(code()).not.toHaveTextContent('HOODY_TOKEN');
    expect(screen.getByText(strings['docs.none'])).toBeInTheDocument();
  });
});

describe('an endpoint the catalog does not have', () => {
  it('says so, and Back to the list clears the address', async () => {
    const r = await renderPage(page, { path: '/api?op=api_noSuchThing' });
    expect(await screen.findByText(strings['detail.gone'], undefined, { timeout: 10000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['detail.backList'] }));
    await waitFor(() => expect(r.router.state.location.search).not.toHaveProperty('op'));
    expect(screen.queryByText(strings['detail.gone'])).toBeNull();
  });
});

describe('the Current computer switch', () => {
  const project = { id: '0123456789abcdef01234567' };
  const row = (server_name: string) => ({ project, container: { id: '89abcdef0123456789abcdef', server_name } });
  const open = async () => {
    await renderPage(page, { path: '/api?op=browser_startInstance' });
    await screen.findByText(strings['auth.kit'], undefined, { timeout: 10000 });
  };
  afterEach(() => { current.target = null; });

  it('no computer: no switch, and the example keeps its placeholders', async () => {
    await open();
    expect(screen.queryByRole('radio', { name: strings['computer.mine'] })).toBeNull();
    expect(code()).toHaveTextContent('<computer-id>');
  });

  it('a computer with no routing server: no switch', async () => {
    current.target = row('');
    await open();
    expect(screen.queryByRole('radio', { name: strings['computer.mine'] })).toBeNull();
  });

  it('a computer: the switch fills the example, with its address masked on screen', async () => {
    current.target = row('node-example-1');
    await open();
    await userEvent.click(screen.getByRole('radio', { name: strings['computer.mine'] }));
    await waitFor(() => expect(code()).toHaveTextContent('node-example-1'));
    expect(code()).not.toHaveTextContent('89abcdef0123456789abcdef');
    expect(code()).not.toHaveTextContent('<computer-id>');
  });

  /* eslint-disable no-restricted-globals, no-restricted-properties -- the test plants what a session could hold in
     storage and a cookie, where a page could read it, to prove none of it reaches the link; the page itself reads none */
  it('the URL tab copies the whole link, and no credential or identity the session holds reaches it: headers are placeholders', async () => {
    // Values a session could hold, planted where a page could read them; with characters a URL encodes, so a link can't
    // hide one by encoding it. None may appear in a link meant for sharing, raw or decoded, outer or nested.
    const SECRET = 'sess 0123/secret+value&x=1';
    const cookieWas = document.cookie.split('; ').find((c) => c.startsWith('hub_session='));
    const had = { local: localStorage.getItem('hub_token'), session: sessionStorage.getItem('hub_token') };
    const clip = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    localStorage.setItem('hub_token', SECRET);
    sessionStorage.setItem('hub_token', SECRET);
    document.cookie = `hub_session=${encodeURIComponent(SECRET)}`;
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (x: string) => (written.push(x), Promise.resolve()) } });
    try {
      current.target = row('node-example-1');
      await renderPage(page, { path: '/api?op=notes_healthCheck' });
      await screen.findByText(strings['auth.notes'], undefined, { timeout: 10000 });
      await userEvent.click(screen.getByRole('radio', { name: strings['computer.mine'] }));
      await userEvent.click(screen.getByRole('radio', { name: strings['lang.url'] }));
      await waitFor(() => expect(code()).toHaveTextContent('node-example-1'));
      await userEvent.click(within(code()).getByRole('button', { name: 'Copy all' }));
      await waitFor(() => expect(written.length).toBe(1));
      const link = written[0]!;
      // Whole in Copy: the computer's own address, unmasked.
      expect(link).toContain('0123456789abcdef01234567-89abcdef0123456789abcdef-curl-1.node-example-1.');
      const q = new URLSearchParams(link.split('?').slice(1).join('?'));
      const target = q.get('url') ?? '';
      const nested = new URLSearchParams(target.split('?').slice(1).join('?'));
      // every form of the link a reader or a log could see: raw, each decoded parameter, the nested target and its own
      const seen = [link, code().textContent ?? '', ...[...q.entries()].flat(), ...[...nested.entries()].flat()];
      for (const text of seen) for (const v of [SECRET, encodeURIComponent(SECRET), 'secret+value', 'secret value']) expect(text, text).not.toContain(v);
      expect(link).not.toMatch(/HOODY_TOKEN/);
      const headers = q.getAll('header');
      expect(headers.length).toBeGreaterThan(0);
      // An HTTP header name (RFC 9110 token), then a placeholder in <>, after an optional scheme word: never a value.
      for (const h of headers) expect(h, h).toMatch(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+: (?:[A-Za-z]+ )?<[^<>\s]+>$/);
    } finally {
      if (clip) Object.defineProperty(navigator, 'clipboard', clip);
      else delete (navigator as { clipboard?: unknown }).clipboard;
      if (had.local === null) localStorage.removeItem('hub_token');
      else localStorage.setItem('hub_token', had.local);
      if (had.session === null) sessionStorage.removeItem('hub_token');
      else sessionStorage.setItem('hub_token', had.session);
      document.cookie = cookieWas ?? 'hub_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  });
  /* eslint-enable no-restricted-globals, no-restricted-properties */
});

describe('the overview and the load', () => {
  afterEach(() => vi.restoreAllMocks());
  it('Overview shows the counts and the links', async () => {
    await renderPage(page, { path: '/api?view=overview' });
    expect(await screen.findByText(strings['ov.desc'], undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText(strings['link.sdk'])).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  // The header holds the control every page places for an agent: the same words, the agent icon, the same drawer.
  it('"Use with your agent" is the shared control, with its icon, and opens the drawer with the API page\'s own lead', async () => {
    await renderPage(page);
    const hint = await screen.findByRole('button', { name: hintStrings['hint.label'] }, { timeout: 10000 });
    expect(hint.closest('header')).not.toBeNull();
    expect(hint.querySelector('svg')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Use it with an agent');
    await userEvent.click(hint);
    const drawer = await screen.findByRole('dialog', { name: hintStrings['hint.title'] });
    expect(drawer).toHaveAttribute('data-hub-overlay', 'agent-hint');
    expect(drawer).toHaveTextContent(hintStrings['hint.api.what']);
  });

  it('the control stays in the header on the Overview, whose first section says how to add the Hoody skill', async () => {
    await renderPage(page, { path: '/api?view=overview' });
    const agent = await screen.findByRole('figure', { name: strings['agent.install'] }, { timeout: 10000 });
    expect(agent).toHaveTextContent('npx skills add https://hoody.com/SKILLS/SKILL.md');
    expect(agent).toHaveTextContent('npx skills add HoodyNetwork/hoody-sdk');
    expect(screen.getByText(strings['agent.desc'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings['agent.guide'] }).getAttribute('href')).toMatch(/guide#skills$/);
    expect(screen.getByRole('button', { name: hintStrings['hint.label'] }).closest('header')).not.toBeNull();
  });

  it('Overview says where the OpenAPI description is, with real commands', async () => {
    await renderPage(page, { path: '/api?view=overview' });
    const spec = await screen.findByRole('figure', { name: strings['spec.pkg'] }, { timeout: 10000 });
    expect(spec).toHaveTextContent('npm install hoody-sdk');
    expect(spec).toHaveTextContent('cp node_modules/hoody-sdk/generated/openapi.public.json openapi.json');
    expect(spec).toHaveTextContent('cp node_modules/hoody-sdk/generated/openapi.public.yaml openapi.yaml');
  });

  it('Overview links the two OpenAPI files in the public repository on GitHub, and gives their raw addresses to import by URL', async () => {
    await renderPage(page, { path: '/api?view=overview' });
    const raw = await screen.findByRole('figure', { name: strings['spec.raw'] }, { timeout: 10000 });
    const section = document.getElementById('openapi') as HTMLElement;
    expect(section.contains(raw)).toBe(true);
    expect(within(section).getByText(strings['spec.desc'])).toBeInTheDocument();
    expect(strings['spec.desc']).toMatch(/GitHub/);
    expect(strings['spec.desc']).not.toMatch(/comes with the hoody-sdk package/);
    // The page of each file on GitHub: real links, opening in a new tab without an opener.
    const hrefs = within(section).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      'https://github.com/HoodyNetwork/hoody-sdk/blob/main/generated/openapi.public.json',
      'https://github.com/HoodyNetwork/hoody-sdk/blob/main/generated/openapi.public.yaml',
    ]);
    for (const a of within(section).getAllByRole('link')) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect((a.getAttribute('rel') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    }
    // The raw addresses, whole, as copyable lines.
    expect(raw).toHaveTextContent('https://raw.githubusercontent.com/HoodyNetwork/hoody-sdk/main/generated/openapi.public.json');
    expect(raw).toHaveTextContent('https://raw.githubusercontent.com/HoodyNetwork/hoody-sdk/main/generated/openapi.public.yaml');
    expect(within(raw).getAllByRole('button', { name: /copy/i }).length).toBeGreaterThanOrEqual(2);
    // GitHub first, then the raw addresses, then the package commands; no Hoody address serves the file.
    const pkg = screen.getByRole('figure', { name: strings['spec.pkg'] });
    expect(raw.compareDocumentPosition(pkg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.textContent).not.toMatch(/https:\/\/[a-z0-9.-]*hoody\.[a-z]+\/[^ ]*openapi/i);
  });

  it('a catalog that fails to load shows the error, and Retry loads it', async () => {
    fail.next = 1;
    drawRows();
    await renderPage(page);
    await userEvent.click(await screen.findByRole('button', { name: /Retry|Try again/ }, { timeout: 10000 }));
    const l = await list();
    await waitFor(() => expect(heads(l)).toHaveLength(21));
  });
});

// On another platform every example names that platform's API, never hoody.com's (the
// cURL, Python and SDK account base, the CLI's --base-url, and the Overview's account address).
describe('on another platform', () => {
  beforeEach(() => { served.host = 'api.example.test'; });
  afterEach(() => { served.host = ''; vi.restoreAllMocks(); });

  it('an account call\'s examples and the CLI line name the platform\'s API', async () => {
    await renderPage(page, { path: '/api?op=api_listAuthTokens' });
    await screen.findByText(strings['auth.account'], undefined, { timeout: 10000 });
    for (const l of ['lang.curl', 'lang.js', 'lang.python', 'lang.cli'] as const) {
      await userEvent.click(screen.getByRole('radio', { name: strings[l] }));
      await waitFor(() => expect(code(), l).toHaveTextContent('https://api.example.test'));
      expect(code(), l).not.toHaveTextContent('api.hoody.com');
    }
  });

  it('a program call\'s SDK example names the platform\'s API', async () => {
    await renderPage(page, { path: '/api?op=browser_startInstance&lang=js' });
    await screen.findByText(strings['auth.kit'], undefined, { timeout: 10000 });
    expect(code()).toHaveTextContent("baseURL: 'https://api.example.test'");
  });

  it('on a platform with hosts of its own the skill address is that platform\'s', async () => {
    served.host = 'api.hoody.com';
    await renderPage(page, { path: '/api?view=overview' });
    const agent = await screen.findByRole('figure', { name: strings['agent.install'] }, { timeout: 10000 });
    // The one skill address shown is on the serving platform's own domain, and no other host's.
    const root = served.host.replace(/^api\./, '');
    expect(agent.textContent?.match(/https:\/\/[^\s/]+\/SKILLS\/SKILL\.md/g)).toEqual([`https://${root}/SKILLS/SKILL.md`]);
    expect(agent).toHaveTextContent(`npx skills add https://${root}/SKILLS/SKILL.md`);
  });

  it('Overview names the platform\'s account API', async () => {
    await renderPage(page, { path: '/api?view=overview' });
    await screen.findByText(strings['ov.desc'], undefined, { timeout: 10000 });
    // The address is drawn as a link (Facts makes a URL one), with "with Bearer $HOODY_TOKEN" after it. The description
    // shows before the catalog (a lazy import) has loaded, and the fact needs the catalog: wait for the link itself.
    const account = await screen.findByRole('link', { name: /^https:\/\/api\.example\.test\b/ }, { timeout: 10000 });
    expect(account).toHaveAttribute('href', 'https://api.example.test');
    expect(screen.queryByText(/api\.hoody\.com/)).toBeNull();
  });
});
