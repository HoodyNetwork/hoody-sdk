// Vitest: the pure parts of the search proofs (e2e-search.ts): the URL decoder, the history-state walk, the
// survival policy, the link phases and the sample check. The browser behaviour is kit/e2e-search/helpers.spec.ts.
import { describe, expect, it } from 'vitest';
import { decodeAll, decodings, firstSampleLeak, extendBudget, keepProblem, linkPath, markProof, queryPairs, stateLeak, stringLeaves, textProblem, urlLeak, withSampler } from './e2e-search';
import type { Sampler } from './e2e-search';

const at = (hash: string, search = '?fxbar=0&theme=light') => `http://127.0.0.1:5173/${search}#${hash}`;

describe('decodeAll and queryPairs', () => {
  it('reads the real query and the hash query, keys and values, and the decoded paths', () => {
    const href = at('/x%20y?sort=name&page=2&status=active');
    expect(queryPairs(href)).toEqual([['fxbar', '0'], ['theme', 'light'], ['sort', 'name'], ['page', '2'], ['status', 'active']]);
    expect(decodeAll(href)).toContain('#/x y');
  });
  it('a malformed escape falls back to the raw text, never throws', () => {
    expect(decodeAll(at('/x%E0%A4%A?sort=a'))).toContain('#/x%E0%A4%A');
    expect(decodeAll('not a url %ZZ')).toEqual(['not a url %ZZ']);
  });
});

describe('urlLeak', () => {
  it('the view’s own search key is a leak whatever its value; another view’s key is not', () => {
    expect(urlLeak(at('/x?accq=zzz'), 'atlas', 'acc')).toBe('the accq key');
    expect(urlLeak(at('/x?q=zzz'), 'atlas', 'acc')).toBeNull();
  });
  it('the text under any other key is a leak', () => {
    expect(urlLeak(at('/x?zq=atlas'), 'atlas', 'acc')).toBe('the zq key');
    expect(urlLeak(at('/x?sort=name'), 'atlas', '')).toBeNull();
  });
  it('escaping: a quote, a backslash, a space as + or %20, inside the hash query, any case', () => {
    expect(urlLeak(at('/x?f=a%22b'), 'a"b!', '')).toBeNull();
    expect(urlLeak(at('/x?f=xa%22b%21'), 'a"b!', '')).toBe('the f key');
    expect(urlLeak(at('/x?f=c%5Cd99'), 'c\\d99', '')).toBe('the f key');
    expect(urlLeak(at('/x?f=new+york'), 'new york', '')).toBe('the f key');
    expect(urlLeak(at('/x?f=new%20york'), 'new york', '')).toBe('the f key');
    expect(urlLeak(at('/x?f=ATLAS'), 'atlas', '')).toBe('the f key');
    expect(urlLeak(at('/atlas/x'), 'atlas', '')).toBe('the path');
  });
  it('adoption phase: exactly <param>q=<text> is allowed, nothing else', () => {
    expect(urlLeak(at('/x?q=atlas&sort=name'), 'atlas', '', true)).toBeNull();
    expect(urlLeak(at('/x?q=atlas'), 'atlas', '', false)).toBe('the q key');
    expect(urlLeak(at('/x?q=atlas&z=atlas'), 'atlas', '', true)).toBe('the z key');
    expect(urlLeak(at('/x?q=other'), 'atlas', '', true)).toBe('the q key');
    expect(urlLeak(at('/x?aq=atlas'), 'atlas', '', true)).toBe('the aq key');
  });
  it('adoption phase, narrowly: only one pair, only in the hash query, quoted only when the router quotes', () => {
    expect(urlLeak(at('/x?q=%22atlas%22'), 'atlas', '', true)).toBe('the q key');
    expect(urlLeak(at('/x?q=atlas', '?q=atlas'), 'atlas', '', true)).toBe('the q key');
    expect(urlLeak(at('/x?q=atlas&q=atlas'), 'atlas', '', true)).toBe('the q key');
    expect(urlLeak(at('/x?q=%223050%22'), '3050', '', true)).toBeNull();
    expect(urlLeak(at('/x?q=3050'), '3050', '', true)).toBeNull();
  });
  it('an encoded copy is the text: once, twice, with + or %20', () => {
    expect(urlLeak(at('/x?f=%252Fdownload%252Freport.pdf'), '/download/report.pdf', '')).toBe('the f key');
    expect(urlLeak(at('/x?f=Job%252011'), 'Job 11', '')).toBe('the f key');
    expect(urlLeak(at('/x%2520atlas'), ' atlas', '')).toBe('the path');
  });
});

describe('decodings', () => {
  it('the string and its forms to a fixed point (URL decoding, + as a space, JSON escapes); a malformed escape stays as written', () => {
    expect(decodings('a%2520b').forms).toEqual(expect.arrayContaining(['a%2520b', 'a%20b', 'a b']));
    expect(decodings('Job+11').forms).toContain('Job 11');
    expect(decodings('Job%2B11').forms).toContain('Job 11');
    expect(decodings('100%')).toEqual({ forms: ['100%'], undecodable: false });
  });
});

describe('stateLeak', () => {
  it('walks every string leaf, keys included, and the JSON', () => {
    expect(stringLeaves({ a: ['x', { atlas: 1 }], b: 'y' })).toEqual(['a', 'x', 'atlas', 'b', 'y']);
    expect(stateLeak(JSON.stringify({ hubSearchId: { q: 'm3xk2a' }, __TSR_key: 'k1' }), 'atlas')).toBeNull();
    expect(stateLeak(JSON.stringify({ hubSearchId: { q: 'atlas' } }), 'atlas')).toBe('history state');
    expect(stateLeak(JSON.stringify({ deep: [{ Atlas: 0 }] }), 'atlas')).toBe('history state');
    expect(stateLeak(JSON.stringify({ s: 'a"b!' }), 'a"b!')).toBe('history state');
    // Percent-encoded history strings.
    expect(stateLeak(JSON.stringify({ q: '%2Fdownload%2Freport.pdf' }), '/download/report.pdf')).toBe('history state');
    expect(stateLeak(JSON.stringify({ q: 'Job%2011' }), 'Job 11')).toBe('history state');
    expect(stateLeak(JSON.stringify({ q: 'Job+11' }), 'Job 11')).toBe('history state');
    expect(stateLeak(JSON.stringify({ q: '%256Bestrel' }), 'kestrel')).toBe('history state');
    expect(stateLeak('null', 'atlas')).toBeNull();
  });
});

describe('keepProblem: the survival policy (M5a-c)', () => {
  it('empty keep, a missing sort or page, unprefixed keys on a prefixed view', () => {
    expect(keepProblem('list', '', {}, 'atlas')).toMatch(/keep is empty/);
    expect(keepProblem('list', '', { sort: 'name' }, 'atlas')).toBe('required keep key page missing for a list view');
    expect(keepProblem('list', 'a', { sort: 'name', page: '2' }, 'atlas')).toBe('required keep key asort missing for a list view');
    expect(keepProblem('list', 'a', { asort: 'name', apage: '2' }, 'atlas')).toBeNull();
  });
  it('a cursor view keeps a cursor key; a status view keeps status; a program view keeps program', () => {
    expect(keepProblem('cursor', '', { level: 'error' }, 'atlas')).toMatch(/cursor view must keep one of before, after, cursor, at/);
    expect(keepProblem('cursor', '', { before: '42' }, 'atlas')).toBeNull();
    expect(keepProblem('status', '', { sel: 't1' }, 'atlas')).toBe('required keep key status missing for a status view');
    expect(keepProblem('status', '', { status: 'open' }, 'atlas')).toBeNull();
    expect(keepProblem('program', '', { src: 'programs' }, 'atlas')).toBe('required keep key program missing for a program view');
    expect(keepProblem('program', '', { src: 'programs', program: '3' }, 'atlas')).toBeNull();
    // scroll (one scrolled list, no pager): sort only.
    expect(keepProblem('scroll', '', { op: 'x' }, 'atlas', '/api')).toBe('required keep key sort missing for a scroll view');
    expect(keepProblem('scroll', '', { sort: 'path' }, 'atlas', '/api')).toBeNull();
    // A paged page cannot pick scroll to skip proving its page key: only SCROLL_PAGES may.
    expect(keepProblem('scroll', '', { sort: 'name' }, 'atlas', '/vault')).toMatch(/a scroll view is only for a page with no pager \(api\); \/vault pages/);
    expect(keepProblem('scroll', '', { sort: 'name' }, 'atlas')).toMatch(/only for a page with no pager/);
    // Dot segments resolve as the browser does: these open Vault, not the API page.
    for (const p of ['/api/../vault', '/api/%2e%2e/vault', '/./vault?x=api']) expect(keepProblem('scroll', '', { sort: 'name' }, 'atlas', p)).toMatch(/only for a page with no pager/);
    expect(keepProblem('scroll', '', { sort: 'path' }, 'atlas', '/api?service=api')).toBeNull();
    expect(keepProblem('list', '', { sort: 'name' }, 'atlas', '/vault')).toBe('required keep key page missing for a list view');
  });
  it('the text on a kept value or the path is a precondition error, and the search key is never kept', () => {
    expect(keepProblem('list', '', { sort: 'name', page: '2', sel: 'atlas-1' }, 'atlas')).toBe('precondition: "atlas" is already on keep sel');
    expect(keepProblem('list', '', { sort: 'name', page: '2' }, 'atlas', '/atlas')).toBe('precondition: "atlas" is already on the path');
    expect(keepProblem('list', '', { sort: 'name', page: '2', q: 'x' }, 'atlas')).toBe('keep names the search key q');
  });
});

describe('textProblem and linkPath', () => {
  it('the text is at least 4 characters', () => {
    expect(textProblem('abc')).toMatch(/at least 4/);
    expect(textProblem('atla')).toBeNull();
  });
  it('builds the link from the path, the kept keys and the search key; a path that contradicts keep throws', () => {
    expect(linkPath('/demo?status=active', { sort: 'name', page: '2' }, '', 'atlas')).toBe('/demo?status=active&sort=name&page=2&q=atlas');
    expect(linkPath('/files', { asort: 'name', apage: '2' }, 'a')).toBe('/files?asort=name&apage=2');
    expect(() => linkPath('/demo?sort=size', { sort: 'name', page: '2' }, '')).toThrow(/sets sort=size, keep says name/);
  });
});

describe('firstSampleLeak', () => {
  it('names the first leaking sample and its step; an exempt sample allows only the incoming key', () => {
    const ok = { href: at('/x?q=atlas'), state: 'null', exempt: true, step: 'the link' };
    const late = { href: at('/x?q=atlas'), state: 'null', exempt: false, step: 'the settle window' };
    const st = { href: at('/x'), state: '{"t":"atlas"}', exempt: false, step: 'the search' };
    expect(firstSampleLeak([ok], 'atlas', '')).toBeNull();
    expect(firstSampleLeak([ok, late, st], 'atlas', '')).toBe('leak: "atlas" appeared on the q key after the settle window');
    expect(firstSampleLeak([st], 'atlas', '')).toBe('leak: "atlas" appeared on history state after the search');
  });
});

describe('Sampler: reads skipped during a navigation, and a run must end on a read that answered', () => {
  const gone = () => Promise.reject(new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation'));
  const read = (href: string) => Promise.resolve({ href, state: 'null' });
  it('a page that never comes back fails the run, even when the body ends at once', async () => {
    const page = { evaluate: gone } as unknown as ConstructorParameters<typeof Sampler>[0];
    await expect(withSampler(page, 'atlas', '', false, async () => {}, 300)).rejects.toThrow('the page did not come back within 300 ms of a navigation');
  });
  it('a page that comes back after a few skipped reads: the run waits for the read that answers, and it counts', async () => {
    let n = 0;
    const page = { evaluate: () => (++n <= 4 ? gone() : read(at(n > 5 ? '/x?zq=atlas' : '/x'))) } as unknown as ConstructorParameters<typeof Sampler>[0];
    await expect(withSampler(page, 'atlas', '', false, async () => {}, 5000)).resolves.toBeUndefined();
    n = 0;
    const late = { evaluate: () => (++n <= 4 ? gone() : read(at('/x?zq=atlas'))) } as unknown as ConstructorParameters<typeof Sampler>[0];
    await expect(withSampler(late, 'atlas', '', false, async () => {}, 5000)).rejects.toThrow('leak: "atlas" appeared on the zq key');
  });
  it('any other read error ends the run with that error', async () => {
    const page = { evaluate: () => Promise.reject(new Error('boom')) } as unknown as ConstructorParameters<typeof Sampler>[0];
    await expect(withSampler(page, 'atlas', '', false, async () => {})).rejects.toThrow('boom');
  });
});

describe('decoding to a fixed point, credentials kept, the last read and the phase of a read', () => {
  const enc = (s: string, n: number): string => (n === 0 ? s : enc(encodeURIComponent(s), n - 1));
  it('a + that percent decoding exposes is a space; any number of rounds up to 8; JSON \\u escapes inside a value', () => {
    expect(stateLeak(JSON.stringify({ q: 'Job%2B11' }), 'Job 11')).toBe('history state');
    expect(stateLeak(JSON.stringify({ q: '%2525256bestrel' }), 'kestrel')).toBe('history state');
    expect(stateLeak(JSON.stringify({ q: enc('a kestrel', 8) }), 'kestrel')).toBe('history state');
    expect(urlLeak(at(`/x?f=${enc('a kestrel', 9)}`), 'kestrel', '')).toBe('the f key');
    expect(stateLeak(JSON.stringify({ q: '\\u006b\\u0065\\u0073\\u0074\\u0072\\u0065\\u006c' }), 'kestrel')).toBe('history state');
    expect(urlLeak(at(`/x?f=${encodeURIComponent('\\u006bestrel')}`), 'kestrel', '')).toBe('the f key');
  });
  it('a value still changing after 8 rounds is red, never read as absent', () => {
    expect(stateLeak(JSON.stringify({ q: enc('a b', 9) }), 'kestrel')).toBe('history state (still changing after 8 decoding rounds)');
    expect(urlLeak(at(`/x?f=${enc('a b', 10)}`), 'kestrel', '')).toBe('the f key (still changing after 8 decoding rounds)');
    expect(stateLeak(JSON.stringify({ q: enc('a b', 8) }), 'kestrel')).toBeNull();
  });
  it('the adoption allowance takes out only its pair: the text in the user name or password is still a leak', () => {
    expect(urlLeak('http://kestrel@localhost/#/demo?q=kestrel', 'kestrel', '', true)).toBe('the address');
    expect(urlLeak('http://u:kestrel@localhost/#/demo?q=kestrel', 'kestrel', '', true)).toBe('the address');
    expect(urlLeak('http://u:p@localhost/#/demo?q=kestrel&sort=a', 'kestrel', '', true)).toBeNull();
  });
  const read = (href: string) => Promise.resolve({ href, state: 'null' });
  const waitFor = async (ok: () => boolean) => {
    while (!ok()) await new Promise((r) => setTimeout(r, 1));
  };
  it('a navigation in the gap after a good read: the run ends only on a read that starts after the stop', async () => {
    let href = at('/before');
    let reads = 0;
    const page = { evaluate: () => (reads++, read(href)) } as unknown as ConstructorParameters<typeof Sampler>[0];
    await expect(
      withSampler(page, 'kestrel', '', false, async () => {
        await waitFor(() => reads >= 1);
        await new Promise((r) => setTimeout(r, 5));
        href = at('/after?zq=kestrel');
      }),
    ).rejects.toThrow('leak: "kestrel" appeared on the zq key');
  });
  it('a read is judged in the phase it started in: an adoption read that answers after the switch is still exempt', async () => {
    let release: (() => void) | undefined;
    let n = 0;
    const page = {
      evaluate: () => (++n === 1 ? new Promise((r) => (release = () => r({ href: at('/x?q=kestrel'), state: 'null' }))) : read(at('/x'))),
    } as unknown as ConstructorParameters<typeof Sampler>[0];
    await expect(
      withSampler(page, 'kestrel', '', true, async (s) => {
        await waitFor(() => release !== undefined);
        s.exempt = false;
        s.step = 'the adoption';
        release!();
      }),
    ).resolves.toBeUndefined();
  });
});

describe('a mark goes only to the test that started the helper; a stray % and JSON short escapes', () => {
  type Owner = { annotations: { type: string; description?: string }[]; duration: number; testId: string };
  let ids = 0;
  const owner = (): Owner => ({ annotations: [], duration: 0, testId: `t-${++ids}` });
  it('a helper started by test A that completes while B runs marks neither (B ran no helper of its own)', () => {
    const a = owner();
    const b = owner();
    a.duration = 1200;
    expect(markProof(a, () => b, 'S')).toBe(false);
    expect(a.annotations).toEqual([]);
    expect(b.annotations).toEqual([]);
    // Identity alone decides when A's duration still reads 0 (Playwright rounds a body under 1 ms down to 0).
    expect(markProof(owner(), () => b, 'S')).toBe(false);
    expect(b.annotations).toEqual([]);
  });
  it('reverse: a listed test whose helper completes after its body ended is not marked, in its teardown or between tests', () => {
    const l = owner();
    l.duration = 900;
    expect(markProof(l, () => l, 'S')).toBe(false);
    const between = () => {
      throw new Error('test.info() can only be called while test is running');
    };
    expect(markProof(owner(), between, 'S')).toBe(false);
    expect(l.annotations).toEqual([]);
  });
  it('a helper with no owner (started outside a test) marks nothing; one completing in its own running test is marked', () => {
    const n = owner();
    expect(markProof(null, () => n, 'R')).toBe(false);
    expect(n.annotations).toEqual([]);
    expect(markProof(n, () => n, 'R')).toBe(true);
    expect(n.annotations).toEqual([{ type: 'l064', description: `R ${n.testId}` }]);
  });
  it('a stray % does not stop the valid escapes beside it from decoding; a plain 100% stays clean', () => {
    expect(stateLeak(JSON.stringify({ q: '%256bestrel%25' }), 'kestrel')).toBe('history state');
    expect(urlLeak('http://local/#/demo?zq=%25256bestrel%2525', 'kestrel', '')).toBe('the zq key');
    expect(stateLeak(JSON.stringify({ q: '100% %6bestrel' }), 'kestrel')).toBe('history state');
    expect(stateLeak(JSON.stringify({ q: 'sale 100%' }), 'kestrel')).toBeNull();
    expect(decodings('100%').forms).toEqual(['100%']);
  });
  it('JSON short escapes (\\t \\n \\r \\b \\f) are decoded like \\u ones', () => {
    for (const text of ['Job\t11', 'Job\n11', 'Job\r11']) {
      expect(stateLeak(JSON.stringify({ q: JSON.stringify(text) }), text)).toBe('history state');
    }
    expect(decodings('a\\bb\\fc').forms).toContain('a\bb\fc');
  });
});

describe('the budget share: once per test per helper, only for a test the mark binding would accept', () => {
  const budget = (timeout = 30_000, duration = 0) => {
    const o = { annotations: [] as { type: string; description?: string }[], duration, testId: 't-budget', timeout, setTimeout: (ms: number) => (o.timeout = ms) };
    return o;
  };
  it('a test calling R twice gains R’s share once; S and R each add their own once', () => {
    const t = budget();
    const seen = { S: new WeakSet<object>(), R: new WeakSet<object>() };
    expect(extendBudget(t, 'R', 30_000, seen)).toBe(true);
    expect(extendBudget(t, 'R', 30_000, seen)).toBe(false);
    expect(extendBudget(t, 'S', 15_000, seen)).toBe(true);
    expect(extendBudget(t, 'S', 15_000, seen)).toBe(false);
    expect(t.timeout).toBe(75_000);
  });
  it('no owner, a test whose body ended (another test’s leftover), a new try (own TestInfo) and no timeout', () => {
    const seen = { S: new WeakSet<object>(), R: new WeakSet<object>() };
    expect(extendBudget(null, 'S', 15_000, seen)).toBe(false);
    const ended = budget(30_000, 1200);
    expect(extendBudget(ended, 'S', 15_000, seen)).toBe(false);
    expect(ended.timeout).toBe(30_000);
    const unlimited = budget(0);
    expect(extendBudget(unlimited, 'R', 30_000, seen)).toBe(false);
    expect(unlimited.timeout).toBe(0);
    const try0 = budget();
    const try1 = budget();
    expect(extendBudget(try0, 'R', 30_000, seen)).toBe(true);
    expect(extendBudget(try1, 'R', 30_000, seen)).toBe(true);
    expect([try0.timeout, try1.timeout]).toEqual([60_000, 60_000]);
  });
});
