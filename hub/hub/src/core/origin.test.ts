// origin.ts over the real shared.js: where the Hub's Hoody lives.
//   Served mode (no data-hub-standalone on <html>): every address is built exactly as before the seam, and none of
//   the standalone setters has any effect.
//   Standalone mode: nothing is sent until an origin is named; the base host, the realm host and a computer's agent
//   then come from that choice only; an origin the file does not list is refused; the link's `hoody` parameter chooses
//   only among the listed ones; token-session routing and the framed lock are unchanged; leaving for sign-in loads this
//   page again (there is no /auth/login beside a file).
import sharedSource from '../../../public/auth/shared.js?raw';
import { afterEach, describe, expect, it } from 'vitest';
import { api, hoodyRoute, type HubError } from './api';
import { setIdentity } from './ctx';
import { agentBaseFor, proxyDomain, setProxyDomain } from './hosts';
import { bootLive, configureLifecycle, initLive } from './lifecycle';
import { apiOrigin, checkApiOrigin, clearStandaloneApi, hubFileUrl, hubSiteOrigin, isStandalone, readHubConfig, servedHubUrl, setStandaloneApi, standaloneApi, standaloneChoice, STANDALONE_API_KEY } from './origin';
import { defineRoute } from './routes';
import { API_BASE, hubApiBase, installShared, realmDomain, SHARED_NAMES, SHARED_OPTIONAL, type Shared } from './session';
import { boot, calls, DOMAIN, env, onFetch, PROXY, R1, settle, TARGET, UID } from './test/env';
import { resetToken } from './token';

const ORIGIN = 'https://hoody.test';
const CFG = { origin: ORIGIN, realmApiDomain: DOMAIN, proxyDomain: PROXY };
const RECORD = JSON.stringify({ v: 1, origin: ORIGIN, realm: DOMAIN, proxy: PROXY });
const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const tokenRecord = (realm: string) => JSON.stringify({ v: 1, token: TOKEN, realm, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });

const listProjects = defineRoute({ method: 'GET', path: '/projects', scope: 'base' });
const listComputers = defineRoute({ method: 'GET', path: '/computers', scope: 'realm' });
const startComputer = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
const listRealms = defineRoute({ method: 'GET', path: '/realms', scope: 'realm' });
const tokensList = defineRoute({ method: 'GET', path: '/auth/tokens', scope: 'base' });
const payments = defineRoute({ method: 'POST', path: '/wallet/payments', scope: 'base', body: ['amount'] });
const agentBots = defineRoute({ method: 'GET', path: '/bots', scope: 'agent' });

/** The two origins this file is built with (shared.js STANDALONE_ORIGIN, STANDALONE_ALT_ORIGIN), put in by the test:
 *  `other.test` stands for the alternative, so another listed origin exists (the two differ). With both equal
 *  (`alt` equal to `default`) the file lists its one origin. No test names the literals the file ships with. */
const OTHER = 'https://other.test';
interface Built { default?: string; alt?: string }
function builtWith(src: string, b: Built): string {
  const def = /var STANDALONE_ORIGIN = '[^']*';/;
  const alt = /var STANDALONE_ALT_ORIGIN = '[^']*';/;
  expect(def.test(src) && alt.test(src)).toBe(true);
  return src
    .replace(def, `var STANDALONE_ORIGIN = '${b.default ?? ORIGIN}';`)
    .replace(alt, `var STANDALONE_ALT_ORIGIN = '${b.alt ?? OTHER}';`);
}

/** The real shared.js with every member session.ts reads, the optional ones included (test/env's loader keeps the
 *  required ones only). isFramedPage follows env.framed, as there. */
function loadFullShared(b: Built = {}): Shared {
  const names = [...SHARED_NAMES, ...SHARED_OPTIONAL];
  const src = builtWith(sharedSource, b).replace(/^'use strict';/, '');
  const tail = `\n;isFramedPage = function () { return __env.framed; };\nreturn { ${names.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ')} };`;
  return (new Function('__env', src + tail) as (e: typeof env) => Shared)(env);
}

interface TabOpts { standalone?: string; set?: boolean; framed?: boolean; token?: string; realm?: string; search?: string; built?: Built }
/** A tab on the real shared.js. `standalone` is the attribute's value (absent: a served page); `set` names CFG as its API;
 *  `search` is the page's query when shared.js loads; `built` the two origins the file is built with. */
const START_URL = window.location.href;
function tab(o: TabOpts = {}): void {
  window.history.replaceState(null, '', o.search === undefined ? START_URL : window.location.pathname + o.search);
  if (o.standalone === undefined) document.documentElement.removeAttribute('data-hub-standalone');
  else document.documentElement.setAttribute('data-hub-standalone', o.standalone);
  const storage: Record<string, string> = {};
  if (o.set) storage[STANDALONE_API_KEY] = RECORD;
  if (o.token) storage.hub_token_session_v1 = tokenRecord(o.token);
  boot({ realm: o.realm ?? R1, framed: o.framed, storage, ...(o.token ? { signedIn: false, identity: false } : {}) });
  installShared(loadFullShared(o.built));
  // The page's proxy domain is read from the page (served) or the chosen API (standalone), not test/env's fixed one.
  setProxyDomain(null);
  if (o.set) expect(setStandaloneApi(CFG)).toBe('set');
  if (o.token) { resetToken(); setIdentity({ id: UID, banned: false }); }
}
const outcome = (p: Promise<unknown>) => p.then(() => 'done', (e: HubError) => e);

afterEach(() => {
  window.history.replaceState(null, '', START_URL);
  document.documentElement.removeAttribute('data-hub-standalone');
  document.documentElement.removeAttribute('data-proxy-domain');
  document.documentElement.removeAttribute('data-hub-file');
  setProxyDomain(null);
});

describe('served mode: unchanged', () => {
  it('is not standalone: the API is this page\'s origin and the addresses are the ones built before the seam', async () => {
    document.documentElement.setAttribute('data-proxy-domain', PROXY);
    tab();
    expect(isStandalone()).toBe(false);
    expect(standaloneApi()).toBeNull();
    expect(apiOrigin()).toBe('');
    expect(API_BASE).toBe('/api/v1');
    expect(hubApiBase(R1)).toBe(`https://${R1}.${DOMAIN}/api/v1`);
    expect(hubApiBase('all')).toBe('/api/v1');
    expect(hubApiBase('not-a-realm')).toBe('/api/v1');
    expect(realmDomain()).toBe(DOMAIN);
    expect(proxyDomain()).toBe(PROXY);
    expect(agentBaseFor(TARGET.project, TARGET.container)).toBe(`https://p1-c1-agent-1.sv1.${PROXY}`);
    expect(hoodyRoute('GET', '/projects', null, 'base', R1)).toEqual({ base: '/api/v1' });
    expect(hoodyRoute('GET', '/computers', null, 'realm', R1)).toEqual({ base: `https://${R1}.${DOMAIN}/api/v1` });
    expect(hoodyRoute('GET', '/realms', null, 'realm', R1)).toEqual({ base: '/api/v1' });
    await api(listProjects);
    await api(listComputers);
    await api(payments, { body: { amount: 5 } });
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/projects', `https://${R1}.${DOMAIN}/api/v1/computers`, '/api/v1/wallet/payments']);
  });

  it('cannot be switched: every setter answers not_standalone, and a stored record is ignored', async () => {
    tab();
    localStorage.setItem(STANDALONE_API_KEY, JSON.stringify({ v: 1, origin: 'https://evil.test', realm: 'evil.test', proxy: 'evil.test' }));
    expect(setStandaloneApi(CFG)).toBe('not_standalone');
    expect(clearStandaloneApi()).toBe('not_standalone');
    expect(isStandalone()).toBe(false);
    expect(realmDomain()).toBe(DOMAIN);
    await api(listProjects);
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/projects']);
  });

  it('the served Hub link is this page; leaving for sign-in goes to the sign-in page', async () => {
    tab();
    expect(servedHubUrl('/billing')).toBe(window.location.origin + '/auth/home#/billing');
    expect(hubSiteOrigin()).toBe(window.location.origin);
    const navs: string[] = [];
    configureLifecycle({ navigate: (u) => navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    onFetch(() => ({ status: 401, body: { statusCode: 401, error: 'UNAUTHORIZED' } }));
    await bootLive();
    await settle();
    expect(navs).toEqual(['/auth/login']);
  });
});

describe('standalone mode', () => {
  it('sends nothing until an API is named', async () => {
    tab({ standalone: '' });
    expect(isStandalone()).toBe(true);
    expect(standaloneApi()).toBeNull();
    expect(apiOrigin()).toBeNull();
    expect(hubSiteOrigin()).toBe('');
    expect(proxyDomain()).toBe('');
    expect(realmDomain()).toBe('');
    expect(await outcome(api(listProjects))).toMatchObject({ code: 'BAD_API_BASE', notSent: true });
    expect(calls).toEqual([]);
  });

  it('base, realm and agent hosts all come from the chosen API', async () => {
    document.documentElement.setAttribute('data-proxy-domain', 'template.invalid');
    tab({ standalone: '', set: true });
    expect(standaloneApi()).toEqual(CFG);
    expect(apiOrigin()).toBe(ORIGIN);
    expect(realmDomain()).toBe(DOMAIN);
    expect(hubApiBase(R1)).toBe(`https://${R1}.${DOMAIN}/api/v1`);
    expect(proxyDomain()).toBe(PROXY);
    expect(agentBaseFor(TARGET.project, TARGET.container)).toBe(`https://p1-c1-agent-1.sv1.${PROXY}`);
    // The route table is the same one: the base host is still named API_BASE, shared.js says where it is.
    expect(hoodyRoute('GET', '/projects', null, 'base', R1)).toEqual({ base: '/api/v1' });
    expect(hoodyRoute('GET', '/realms', null, 'realm', R1)).toEqual({ base: '/api/v1' });
    await api(listProjects);
    await api(listComputers);
    await api(listRealms);
    onFetch(() => ({ status: 200, body: [] }));
    await api(agentBots).catch(() => 0);
    expect(calls.map((c) => c.url.replace(/\?.*$/, ''))).toEqual([
      `${ORIGIN}/api/v1/projects`,
      `https://${R1}.${DOMAIN}/api/v1/computers`,
      `${ORIGIN}/api/v1/realms`,
      `https://p1-c1-agent-1.sv1.${PROXY}/api/v1/agent/bots`,
    ]);
    // The bearer goes to the Hoody API only, never to a computer's agent.
    expect(calls.slice(0, 3).every((c) => /^Bearer /.test(c.headers.authorization ?? ''))).toBe(true);
    expect(calls[3]?.headers.authorization).toBeUndefined();
  });

  it('refuses a bad origin: not https (except this machine), credentials, a path, a query', () => {
    tab({ standalone: '' });
    for (const origin of ['http://hoody.test', 'https://hoody.test/api/v1', 'https://a:b@hoody.test', 'https://hoody.test?x=1', 'javascript:alert(1)', 'hoody.test', '']) {
      expect([origin, checkApiOrigin(origin)]).toEqual([origin, '']);
      expect([origin, setStandaloneApi({ origin, realmApiDomain: DOMAIN, proxyDomain: PROXY })]).toEqual([origin, 'invalid']);
    }
    expect(checkApiOrigin('https://hoody.test/')).toBe(ORIGIN);
    expect(checkApiOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(checkApiOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(standaloneApi()).toBeNull();
    expect(localStorage.getItem(STANDALONE_API_KEY)).toBeNull();
  });

  it('only the origins this file lists: never a free https origin, a look-alike or a third loopback spelling', () => {
    tab({ standalone: '' });
    for (const origin of ['https://evil.test', 'https://hoody.test.evil.test', 'https://api-hoody.test', 'https://xn--hoody-9za.test', 'https://other.test:8443',
      'http://other.test', 'https://localhost', 'http://[::1]:3000', 'http://192.168.1.4:3000', 'http://localhost.evil.test:3000']) {
      expect([origin, checkApiOrigin(origin)]).toEqual([origin, '']);
      expect([origin, setStandaloneApi({ origin, realmApiDomain: DOMAIN, proxyDomain: PROXY })]).toEqual([origin, 'invalid']);
    }
    expect(checkApiOrigin(OTHER)).toBe(OTHER);
    expect(localStorage.getItem(STANDALONE_API_KEY)).toBeNull();
  });

  it('two equal origins: the file lists that one origin only, no alternative, no http', () => {
    tab({ standalone: '', built: { default: ORIGIN, alt: ORIGIN } });
    expect(checkApiOrigin(ORIGIN)).toBe(ORIGIN);
    for (const origin of [OTHER, 'http://localhost:3000', 'http://127.0.0.1:3000']) expect([origin, checkApiOrigin(origin)]).toEqual([origin, '']);
  });

  it('one API per page load, and never another one while a session is stored', () => {
    tab({ standalone: '', set: true });
    expect(setStandaloneApi({ origin: 'https://other.test', realmApiDomain: '', proxyDomain: '' })).toBe('locked');
    expect(clearStandaloneApi()).toBe('signed_in');
    expect(standaloneApi()).toEqual(CFG);
    // A fresh page load of the same browser, signed in under hoody.test: another API is refused.
    installShared(loadFullShared());
    expect(setStandaloneApi({ origin: 'https://other.test', realmApiDomain: '', proxyDomain: '' })).toBe('signed_in');
    expect(apiOrigin()).toBeNull();
  });

  it('a token session keeps its routing: every call to its pinned realm host, account routes refused unsent', async () => {
    tab({ standalone: '', set: true, token: R1 });
    await api(listProjects);
    await api(listComputers);
    expect(calls.map((c) => c.url)).toEqual([`https://${R1}.${DOMAIN}/api/v1/projects`, `https://${R1}.${DOMAIN}/api/v1/computers`]);
    expect(calls.every((c) => c.headers.authorization === 'Bearer ' + TOKEN)).toBe(true);
    expect(await outcome(api(listRealms))).toMatchObject({ code: 'TOKEN_SESSION_REFUSED', notSent: true });
    expect(calls.length).toBe(2);
  });

  it('a token session pinned to every realm talks to the chosen base host', async () => {
    tab({ standalone: '', set: true, token: 'all' });
    await api(listComputers);
    expect(calls.map((c) => c.url)).toEqual([`${ORIGIN}/api/v1/computers`]);
  });

  it('the framed lock is unchanged: a framed standalone Hub refuses every change and the sensitive reads, unsent', async () => {
    tab({ standalone: '', set: true, framed: true });
    expect(await outcome(api(startComputer, { params: { id: 'c1' } }))).toMatchObject({ code: 'FRAMED_ACTION_REFUSED', kind: 'not_sent' });
    expect(await outcome(api(tokensList))).toMatchObject({ code: 'FRAMED_ACTION_REFUSED', kind: 'not_sent' });
    await api(listProjects);
    expect(calls.map((c) => c.url)).toEqual([`${ORIGIN}/api/v1/projects`]);
  });

  it('payments are handed to the served Hub: refused unsent, never pending, with the link to finish there', async () => {
    tab({ standalone: '', set: true });
    const e = await outcome(api(payments, { body: { amount: 5 } }));
    expect(e).toMatchObject({ code: 'STANDALONE_HANDOFF', notSent: true });
    expect((e as HubError).kind).not.toBe('pending');
    expect(calls).toEqual([]);
    expect(servedHubUrl('/billing')).toBe(`${ORIGIN}/auth/home#/billing`);
    expect(servedHubUrl()).toBe(`${ORIGIN}/auth/home`);
    expect(servedHubUrl('javascript:alert(1)')).toBe(`${ORIGIN}/auth/home`);
    // Links for other people (a share text, a QR code) name the chosen Hoody's pages, never this file's place.
    expect(hubSiteOrigin()).toBe(ORIGIN);
  });

  it('leaving for sign-in loads this page again: there is no sign-in page beside a file', async () => {
    tab({ standalone: '', set: true });
    const navs: string[] = [];
    configureLifecycle({ navigate: (u) => navs.push(u), loginPath: '/auth/login', herePath: () => '/tmp/hoody-hub.html' });
    initLive();
    onFetch(() => ({ status: 401, body: { statusCode: 401, error: 'UNAUTHORIZED' } }));
    await bootLive();
    await settle();
    expect(navs).toEqual(['/tmp/hoody-hub.html']);
  });
});

describe('the two origins the file is built with', () => {
  it('are plain literals on the API host stem, each written once', () => {
    expect(/var STANDALONE_ORIGIN = 'https:\/\/api\.hoody\.[a-z]+';/.test(sharedSource)).toBe(true);
    expect(/var STANDALONE_ALT_ORIGIN = 'https:\/\/api\.hoody\.[a-z]+';/.test(sharedSource)).toBe(true);
    expect(sharedSource.match(/https:\/\/api\.hoody\./g)?.length).toBe(2);
  });
});

describe('standaloneChoice: the Hoody the link chose', () => {
  it('no parameter (or an empty one): the default', () => {
    for (const search of ['', '?', '?hoody=', '?hoody', '?x=1#hoody=dev', '?HOODY=dev', '?hoody[]=dev', '?xhoody=dev']) {
      tab({ standalone: '', search });
      expect([search, standaloneChoice()]).toEqual([search, { origin: ORIGIN, asked: 'default' }]);
    }
  });

  it('each accepted value while the two origins differ', () => {
    tab({ standalone: '', search: '?hoody=dev' });
    expect(standaloneChoice()).toEqual({ origin: OTHER, asked: 'alt' });
    tab({ standalone: '', search: '?hoody=localhost:3000' });
    expect(standaloneChoice()).toEqual({ origin: 'http://localhost:3000', asked: 'local' });
    tab({ standalone: '', search: '?x=1&hoody=127.0.0.1:65535' });
    expect(standaloneChoice()).toEqual({ origin: 'http://127.0.0.1:65535', asked: 'local' });
  });

  it('anything else is refused: the default is used, and the choice says so; the value is read raw, never decoded', () => {
    for (const v of ['https://evil.test', 'evil.test', 'other.test', 'https://other.test', 'hoody.test.evil.test', 'DEV', 'Dev', 'dev%20', '%64ev', 'dev/', 'prod',
      'http://192.168.1.4:3000', 'localhost', 'localhost:0', 'localhost:65536', 'localhost:080', 'localhost:03000', '127.0.0.1', '[::1]:3000', 'localhost:3000/x',
      'user@localhost:3000', '10.0.0.2:3000', 'localhost%3A8080']) {
      tab({ standalone: '', search: '?hoody=' + v });
      expect([v, standaloneChoice()]).toEqual([v, { origin: ORIGIN, asked: 'refused' }]);
    }
    for (const search of ['?hoody=dev&hoody=dev', '?hoody=dev&hoody=', '?hoody=&hoody=dev', '?hoody=dev&hoody=localhost:3000']) {
      tab({ standalone: '', search });
      expect([search, standaloneChoice()]).toEqual([search, { origin: ORIGIN, asked: 'refused' }]);
    }
  });

  it('two equal origins accept no value: dev and this machine are refused too', () => {
    for (const search of ['?hoody=dev', '?hoody=localhost:3000', '?hoody=127.0.0.1:3000']) {
      tab({ standalone: '', search, built: { default: ORIGIN, alt: ORIGIN } });
      expect([search, standaloneChoice()]).toEqual([search, { origin: ORIGIN, asked: 'refused' }]);
    }
  });

  it('read once when shared.js loads: a later change of the address changes nothing', () => {
    tab({ standalone: '', search: '?hoody=dev' });
    window.history.replaceState(null, '', window.location.pathname + '?hoody=localhost:3000');
    expect(standaloneChoice()).toEqual({ origin: OTHER, asked: 'alt' });
  });

  it('served mode: no choice at all', () => {
    tab({ search: '?hoody=dev' });
    expect(standaloneChoice()).toBeNull();
  });

  it('a stored session for one Hoody is never moved by a link naming another', () => {
    // Signed in (test/env signs every tab in) under the default, on record; the page loads with ?hoody=dev.
    tab({ standalone: '', search: '?hoody=dev' });
    localStorage.setItem(STANDALONE_API_KEY, RECORD);
    expect(standaloneChoice()).toEqual({ origin: OTHER, asked: 'alt' });
    expect(setStandaloneApi({ origin: OTHER, realmApiDomain: '', proxyDomain: '' })).toBe('signed_in');
    expect(JSON.parse(localStorage.getItem(STANDALONE_API_KEY) ?? '{}').origin).toBe(ORIGIN);
  });
});

describe('readHubConfig: the two domains a chosen Hoody names', () => {
  const answer = (body: unknown, status = 200) => { onFetch(() => ({ status, body })); };

  it('asks only GET <origin>/api/v1/hub/config, with no credentials and no bearer', async () => {
    tab({ standalone: '' });
    answer({ statusCode: 200, data: { realm_api_domain: DOMAIN, proxy_domain: PROXY, hub_file_min: 1 } });
    expect(await readHubConfig(ORIGIN)).toEqual({ ok: true, realmApiDomain: DOMAIN, proxyDomain: PROXY, fileMin: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: `${ORIGIN}/api/v1/hub/config`, method: 'GET', credentials: 'omit' });
    expect(calls[0]?.headers.authorization).toBeUndefined();
  });

  it('null or malformed domains read as none; a wrong shape, a refusal or no answer is not a Hoody', async () => {
    tab({ standalone: '' });
    answer({ data: { realm_api_domain: null, proxy_domain: 'https://x.test/evil' } });
    expect(await readHubConfig(ORIGIN)).toEqual({ ok: true, realmApiDomain: '', proxyDomain: '', fileMin: null });
    answer({ data: 'nope' });
    expect(await readHubConfig(ORIGIN)).toEqual({ ok: false, why: 'shape' });
    answer({ data: { realm_api_domain: DOMAIN } });
    expect(await readHubConfig(ORIGIN)).toEqual({ ok: false, why: 'shape' });
    answer({ message: 'not found' }, 404);
    expect(await readHubConfig(ORIGIN)).toEqual({ ok: false, why: 'refused' });
    onFetch(() => ({ status: 0, network: true }));
    expect(await readHubConfig(ORIGIN)).toEqual({ ok: false, why: 'network' });
  });

  it('hub_file_min: a whole number from 1 is the floor; absent (an older Hoody) names none; present and malformed is not this answer', async () => {
    tab({ standalone: '' });
    const floor = async (v: unknown) => {
      answer({ data: { realm_api_domain: DOMAIN, proxy_domain: PROXY, hub_file_min: v } });
      const r = await readHubConfig(ORIGIN);
      return r.ok ? r.fileMin : 'not ok';
    };
    expect(await floor(3)).toBe(3);
    expect(await floor(1_000_000)).toBe(1_000_000);
    // A floor that is there but is not one cannot be read as "no floor": sign-in would be offered to a file the
    // Hoody may refuse. The whole answer is refused (the page offers only Try again). NaN travels as null in JSON.
    for (const bad of [0, -1, 1.5, '3', '99', null, true, Number.NaN, 2 ** 53, {}, []]) expect(await floor(bad)).toBe('not ok');
    answer({ data: { realm_api_domain: DOMAIN, proxy_domain: PROXY, hub_file_min: '99' } });
    expect(await readHubConfig(ORIGIN)).toEqual({ ok: false, why: 'shape' });
    answer({ data: { realm_api_domain: DOMAIN, proxy_domain: PROXY } });
    expect(await readHubConfig(ORIGIN)).toEqual({ ok: true, realmApiDomain: DOMAIN, proxyDomain: PROXY, fileMin: null });
  });

  it('never asks a refused origin', async () => {
    tab({ standalone: '' });
    expect(await readHubConfig('http://hoody.test')).toEqual({ ok: false, why: 'invalid' });
    expect(await readHubConfig('https://hoody.test/x')).toEqual({ ok: false, why: 'invalid' });
    expect(calls).toEqual([]);
  });
});

describe('hubFileUrl: the one-file Hub as a download', () => {
  it('a served page whose Hoody says it has the file names the fixed address', () => {
    document.documentElement.setAttribute('data-hub-file', '1');
    tab();
    expect(hubFileUrl()).toBe('/auth/hoody-hub.html');
  });

  it.each([[null], [''], ['0'], ['true'], ['{{HUB_FILE}}'], ['https://evil.test/hoody-hub.html']])('a served page saying %j offers none', (value) => {
    if (value !== null) document.documentElement.setAttribute('data-hub-file', value);
    tab();
    expect(hubFileUrl()).toBeNull();
  });

  it('the one-file Hub never offers itself, whatever the page says, with or without a chosen Hoody', () => {
    document.documentElement.setAttribute('data-hub-file', '1');
    tab({ standalone: '' });
    expect(hubFileUrl()).toBeNull();
    tab({ standalone: '', set: true });
    expect(hubFileUrl()).toBeNull();
  });
});
