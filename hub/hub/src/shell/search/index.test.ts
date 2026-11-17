// Jump to's deep index: built from the pages' own sources, every settings section, setting row,
// URL-kept tab and FAQ question is in it, and the reader fails closed on anything it cannot read.
import { describe, expect, it } from 'vitest';
import { DEEP } from 'virtual:hub-search-index';
import { checkHosts, HOSTS, pageFiles, readSrc, searchIndex, TAB_HOSTS, wordsOf } from '../../../scripts/search-index-gen';
import { prepare, search } from './match';

const files = pageFiles();
const index = searchIndex(files, readSrc);

describe('the deep index of the pages', () => {
  it('is what the palette loads (the virtual module reads the same sources)', () => {
    expect(DEEP).toEqual(index);
  });

  it('finds the passcode lock and lands on its section', () => {
    expect(index).toContainEqual(expect.objectContaining({ page: 'account', kind: 'section', label: 'Passcode lock', to: '?section=passcode' }));
    expect(index.filter((e) => e.kind === 'setting' && e.under === 'Passcode lock').length).toBeGreaterThan(0);
    // Both texts of a conditional help (LockSection: t(on.onLeave ? 'lock.onBodyLeave' : 'lock.onBody', …)) are words.
    expect(index.find((e) => e.label === 'Passcode on')?.words).toMatch(/\bleave\b|\bleaves\b/);
  });

  it('the matcher finds the real entries the way people type them (passcode, PIN, sign in, signin, login)', () => {
    const prepared = index.map((e) => prepare({ kind: e.kind, label: e.label, under: e.under, body: e.words, to: e.to }));
    const labels = (q: string) => search(prepared, q).map((e) => e.label);
    expect(labels('passcode')[0]).toBe('Passcode lock');
    expect(labels('pin')).toContain('Passcode lock');
    for (const q of ['sign in', 'signin', 'login', 'log in']) expect(labels(q), q).toContain('Sign-in sessions');
    // Every spelling finds the same sign-in places (rows under the sign-in sections included).
    const signIn = new Set(labels('sign in'));
    for (const q of ['signin', 'login', 'log in']) expect(new Set(labels(q)), q).toEqual(signIn);
  });

  it('holds every section of every SettingsPage, by its id, on the path its file is shown at', () => {
    const drawing = files.filter((f) => /<SettingsPage\b/.test(readSrc(f) ?? ''));
    expect(drawing.length).toBeGreaterThan(0);
    for (const rel of drawing) {
      const src = readSrc(rel)!;
      const page = rel.split('/')[1]!;
      const tail = HOSTS[rel]!;
      // Every object with an id and a content is a section (the reader also refuses one it could not read).
      const ids = [...src.matchAll(/\{\s*id:\s*'([a-z0-9-]+)',(?:(?!\{\s*id:)[\s\S]){0,400}?\bcontent:/g)].map((m) => m[1]);
      expect(ids.length, rel).toBeGreaterThan(0);
      for (const id of ids) expect(index.some((e) => e.page === page && e.kind === 'section' && e.to === `${tail}?section=${id}`), `${rel} ${id}`).toBe(true);
    }
  });

  it('lands where the manifests\' own commands land: a section a command opens has the command\'s path', () => {
    let checked = 0;
    for (const f of files.filter((x) => /^pages\/[^/]+\/page\.ts$/.test(x))) {
      const page = f.split('/')[1]!;
      const base = /\bpath:\s*['"]([^'"]+)['"]/.exec(readSrc(f)!)![1]!;
      for (const m of readSrc(f)!.matchAll(/\bto:\s*['"]([^'"?#]*)\?section=([a-z0-9-]+)['"]/g)) {
        const entry = index.find((e) => e.page === page && e.kind === 'section' && e.to.endsWith(`section=${m[2]}`));
        if (!entry) continue;
        expect(`${base}${entry.to}`, `${f} ${m[2]}`).toBe(`${m[1]}?section=${m[2]}`);
        checked++;
      }
    }
    // The AI page's Claude Code and Spending commands at least (the AI settings live at /ai/models).
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it('names no host whose file is gone', () => {
    expect(() => checkHosts(files)).not.toThrow();
    expect(() => checkHosts(files.filter((f) => f !== 'pages/programs/view.tsx'))).toThrow(/pages\/programs\/view\.tsx is named here but is gone/);
    expect(() => checkHosts(files.filter((f) => f !== 'pages/ai/parts/Claude.tsx'))).toThrow(/Claude\.tsx is named here but is gone/);
  });

  it('every file that draws Tabs is listed (with its tabs\' tails, or as no place)', () => {
    const drawing = files.filter((f) => /<Tabs\b/.test(readSrc(f) ?? ''));
    expect(drawing.sort()).toEqual(Object.keys(TAB_HOSTS).sort());
  });

  it('holds every question of every page FAQ, landing on its anchor', () => {
    for (const f of files.filter((x) => /^pages\/[^/]+\/faq\.ts$/.test(x))) {
      const page = f.split('/')[1]!;
      const ids = [...readSrc(f)!.matchAll(/\bid:\s*'([a-zA-Z0-9]+)',\s*q:/g)].map((m) => m[1]);
      expect(ids.length, f).toBeGreaterThan(0);
      for (const id of ids) expect(index.some((e) => e.page === page && e.kind === 'faq' && e.to.endsWith(`#faq-${id}`)), `${f} ${id}`).toBe(true);
    }
    // The AI page's questions are drawn by Settings → Models & keys, at /ai/models; Notifications' by Get notified.
    expect(index.find((e) => e.page === 'ai' && e.kind === 'faq')?.to).toMatch(/^\/models#faq-/);
    expect(index.find((e) => e.page === 'notifications' && e.kind === 'faq')?.to).toMatch(/^\/learn#faq-/);
    // New realm draws its page FAQ in view.tsx at the page path.
    expect(index.find((e) => e.page === 'realms' && e.kind === 'faq')?.to).toBe('#faq-whatIs');
  });

  it('holds every tab of the tabs kept in the URL', () => {
    for (const [rel, tails] of Object.entries(TAB_HOSTS)) {
      if (!tails) continue;
      const page = rel.split('/')[1]!;
      for (const to of Object.values(tails)) expect(index.some((e) => e.page === page && e.kind === 'tab' && e.to === to), `${rel} ${to}`).toBe(true);
    }
    // Route tabs drawn from a helper (keys' Frame: item('ssh', t('tab.ssh'))) and link tabs (Notifications) are read too.
    expect(index).toContainEqual(expect.objectContaining({ page: 'keys', kind: 'tab', label: 'SSH keys', to: '/ssh' }));
    expect(index).toContainEqual(expect.objectContaining({ page: 'notifications', kind: 'tab', to: '/learn' }));
  });

  it('names only pages that exist, and only text (no placeholders, no empty labels)', () => {
    for (const e of index) {
      expect(files, e.page).toContain(`pages/${e.page}/page.ts`);
      expect(e.label.trim(), JSON.stringify(e)).not.toBe('');
      expect(e.label, JSON.stringify(e)).not.toMatch(/\{\{/);
    }
  });

  it('stays small: the lazy chunk under 64 KB of text', () => {
    expect(JSON.stringify(index).length).toBeLessThan(64 * 1024);
  });
});

describe('wordsOf', () => {
  it('folds accents and case, drops placeholders, short and common words, keeps each word once', () => {
    expect(wordsOf('Ünïcode PIN and the {{name}} Code code')).toBe('unicode pin code');
    expect(wordsOf('Two-step sign-in')).toBe('two step sign twostep signin');
  });
});

describe('the reader fails closed', () => {
  const page = "export default definePage({ id: 'x', path: '/x' });";
  const strings = JSON.stringify({ 's.a': 'Alpha', 'r.a': 'Row', 'r.h': 'Row help', 'n_one': 'One row', 'n_other': '{{count}} rows', 'faq.one.q': 'One?', 'faq.one.a': 'Yes.' });
  const head = "import strings from './strings.en.json';\nconst t = useStrings(strings);\n";
  const listed = { hosts: { 'pages/x/view.tsx': '/sub' }, tabHosts: { 'pages/x/view.tsx': { a: '' } } };
  const run = (extra: Record<string, string>, h: Parameters<typeof searchIndex>[2] = listed) => {
    const fake: Record<string, string> = { 'pages/x/page.ts': page, 'pages/x/strings.en.json': strings, ...extra };
    return () => searchIndex(Object.keys(fake).filter((f) => !f.endsWith('.json')), (f) => fake[f], h);
  };
  const settings = (rows: string) => `${head}<SettingsPage sections={[{ id: 'a', title: t('s.a'), content: <>${rows}</> }]} />`;

  it('reads a section and its rows at its host\'s path', () => {
    expect(run({ 'pages/x/view.tsx': settings("<SettingRow label={t('r.a')} help={t('r.h')} />") })()).toEqual([
      { page: 'x', kind: 'section', label: 'Alpha', to: '/sub?section=a', words: '' },
      { page: 'x', kind: 'setting', label: 'Row', to: '/sub?section=a', under: 'Alpha', words: 'row help' },
    ]);
  });

  it('a SettingsPage in a file with no host', () => {
    expect(run({ 'pages/x/other.tsx': settings('') })).toThrow(/add where it is shown to HOSTS/);
  });

  it('a section whose title is not a literal key', () => {
    expect(run({ 'pages/x/view.tsx': `${head}<SettingsPage sections={[{ id: 'a', title: t('s.a'), content: null }, { id: 'b', title: name, content: null }]} />` })).toThrow(/section "b" has a title that is not a literal string key/);
  });

  it('a row label that is neither a key nor a row list', () => {
    expect(run({ 'pages/x/view.tsx': settings('<SettingRow label={name} />') })).toThrow(/neither a literal string key/);
  });

  it('a translator-like call it cannot resolve (help={tk(\'…\')})', () => {
    expect(run({ 'pages/x/view.tsx': settings("<SettingRow label={t('r.a')} help={tk('r.h')} />") })).toThrow(/translator tk reads no strings table/);
  });

  it('a conditional key reads both texts; a key read from a value fails', () => {
    expect(run({ 'pages/x/view.tsx': settings("<SettingRow label={t('r.a')} help={t(on ? 'r.h' : 's.a', { x })} />") })()[1]).toMatchObject({ words: 'row help alpha' });
    expect(run({ 'pages/x/view.tsx': settings("<SettingRow label={t('r.a')} help={t(state)} />") })).toThrow(/t\(state\) reads its key from a value: list it in VALUE_TEXT/);
    expect(run({ 'pages/x/view.tsx': settings("<SettingRow label={t('r.a')} help={t(flag ? 'r.h' : state)} />") })).toThrow(/reads its key from a value/);
    expect(run({ 'pages/x/view.tsx': settings("<SettingRow label={t('r.a')} help={t(a ? 'r.h' : b ? 's.a' : 'r.a', { x: y ? 1 : 2 })} />") })()[1]).toMatchObject({ words: 'row help alpha' });
  });

  it('a tab item it cannot read, beside ones it can', () => {
    expect(run({ 'pages/x/view.tsx': `${head}<Tabs param="tab" items={[{ id: 'a', label: t('s.a') }, { id: 'b', label: dynamic }]} />` })).toThrow(/a tab this script cannot read/);
    expect(run({ 'pages/x/view.tsx': `${head}<Tabs items={[item('a', t('s.a')), item(nextId, t('s.a'))]} />` })).toThrow(/a tab this script cannot read/);
    expect(run({ 'pages/x/view.tsx': `${head}<Tabs items={[item('a', t('s.a')), item (nextId, t('s.a'))]} />` })).toThrow(/a tab this script cannot read/);
  });

  it('a counted key is read as its plural form', () => {
    expect(run({ 'pages/x/view.tsx': settings("<SettingRow label={t('r.a')} help={t('n', { count: 2 })} />") })()[1]).toMatchObject({ words: 'rows' });
  });

  it('Tabs in a file not listed, even ones kept in local state', () => {
    expect(run({ 'pages/x/other.tsx': `${head}<Tabs value={v} items={[{ id: 'a', label: t('s.a') }]} />` })).toThrow(/add it to TAB_HOSTS/);
  });

  it('a listed tab the file no longer draws', () => {
    expect(run({ 'pages/x/view.tsx': `${head}<Tabs param="tab" items={[{ id: 'b', label: t('s.a') }]} />` })).toThrow(/tab "b" has no tail/);
  });

  it('a FAQ item the reader cannot read', () => {
    const view = { 'pages/x/view.tsx': `${head}<Page faq={{ items }} />` };
    expect(run({ ...view, 'pages/x/faq.ts': `${head}const items = [{ id: 'one', q: t('faq.one.q'), a: t('faq.one.a') }, { id: 'two', q: dyn, a: t('faq.one.a') }];` })).toThrow(/2 questions, 1 read/);
  });

  it('a FAQ no file draws as a list', () => {
    expect(run({ 'pages/x/faq.ts': `${head}const items = [{ id: 'one', q: t('faq.one.q'), a: t('faq.one.a') }];` })).toThrow(/no file of the page draws its questions/);
  });

  it('a key its table lacks', () => {
    const view = { 'pages/x/view.tsx': `${head}<Page faq={{ items }} />` };
    expect(run({ ...view, 'pages/x/faq.ts': `${head}const items = [{ id: 'one', q: t('faq.nope.q'), a: t('faq.one.a') }];` })).toThrow(/not in its strings table/);
  });

  it('reads a FAQ with its own words, at the path its list is drawn at', () => {
    const view = { 'pages/x/view.tsx': `${head}<Page faq={{ items }} />` };
    expect(run({ ...view, 'pages/x/faq.ts': `${head}const items = [{ id: 'one', q: t('faq.one.q'), a: t('faq.one.a') }];` })()).toEqual([
      { page: 'x', kind: 'faq', label: 'One?', to: '/sub#faq-one', words: 'yes' },
    ]);
  });

  it('a FAQ answer that is one of two keys by a condition (vault Export, per host) reads both; any other conditional fails', () => {
    const view = { 'pages/x/view.tsx': `${head}<Page faq={{ items }} />` };
    expect(run({ ...view, 'pages/x/faq.ts': `${head}const items = [{ id: 'one', q: t('faq.one.q'), a: hostEnv().browserPage === true ? t('faq.one.a') : t('r.h') }];` })()).toEqual([
      { page: 'x', kind: 'faq', label: 'One?', to: '/sub#faq-one', words: 'yes row help' },
    ]);
    expect(run({ ...view, 'pages/x/faq.ts': `${head}const items = [{ id: 'one', q: t('faq.one.q'), a: web ? t('faq.one.a') : text }];` })).toThrow(/1 questions, 0 read/);
    expect(run({ ...view, 'pages/x/faq.ts': `${head}const items = [{ id: 'one', q: t('faq.one.q'), a: web ? t('faq.nope.a') : t('r.h') }];` })).toThrow(/not in its strings table/);
  });
});
