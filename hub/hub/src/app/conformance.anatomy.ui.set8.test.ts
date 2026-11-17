// The eight further ui rules of the page-anatomy detector (scripts/lint/anatomy-ui.cjs) against fixtures.
// Every must-hit is a real offender's shape, scanned twice: with the rule on it has exactly its hits, with
// the rule switched off (`disabled`) they vanish. Every "not a hit" is a control, and every known static miss is a fixture
// asserting no hit, labelled with where it is caught. The first three ui rules have their own file (conformance.anatomy.ui.test.ts).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; scope: string; line: number; msg: string };
type Detector = {
  RULES: string[];
  CSS_RULES: string[];
  EXPLAIN: Record<string, string>;
  DEFAULT_REGISTRY: Record<string, unknown>;
  scan(files: Record<string, string>, opts?: { disabled?: string[]; registry?: unknown; readSrc?: (rel: string) => string | null }): { hits: Hit[]; usedExceptions: string[] };
};
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as Detector;
type Files = Record<string, string>;

const NEW: string[] = ['ui.rawUrl', 'ui.computerList', 'ui.nativeTitle', 'ui.inlineLabel', 'ui.actionTwice', 'ui.bareNumber', 'ui.badgeUnit', 'ui.folderField'];

/** A tiny kit: every part these rules name, by its real export name. */
const fn = (name: string, body = '<div>{p.children}</div>') => `export function ${name}(p: any) { return ${body}; }`;
const KIT: Files = {
  'kit/index.ts': ["export * from './parts';", "export { useStrings, makeT, countText, createColumnHelper, useDataView } from './hooks';"].join('\n'),
  'kit/parts.tsx': [
    ...['Button', 'TextButton', 'IconButton', 'LinkButton', 'Link', 'ExtLink', 'AddressField', 'AddressText', 'CodeBlock', 'Facts', 'Tabs', 'Tag', 'DataTable', 'TextField', 'Select', 'ComputerMark', 'PickerPanel', 'ContainerTable', 'ComputerPicker', 'FilterChips', 'ActionMenu', 'Stack'].map((n) => fn(n)),
    fn('Inner', '<span title="kit internal">{p.children}</span>'),
  ].join('\n'),
  'kit/hooks.ts': [
    'export function useStrings(t: any) { return (k: string, v?: any) => k; }',
    'export function makeT(t: any) { return (k: string, v?: any) => k; }',
    'export function countText(n: number, capped: boolean) { return String(n); }',
    'export function createColumnHelper<T>() { return { accessor: (a: any, o: any) => o }; }',
    'export function useDataView<T>(o: any) { return o; }',
  ].join('\n'),
};
const PAGE = 'pages/x/view.tsx';
const STRINGS = 'pages/x/strings.en.json';
const IMPORTS = [
  "import { Button, TextButton, IconButton, LinkButton, Link, ExtLink, AddressField, AddressText, CodeBlock, Facts, Tabs, Tag, DataTable, TextField, Select, ComputerMark, PickerPanel, ContainerTable, ComputerPicker, FilterChips, ActionMenu, Stack, useStrings, countText, createColumnHelper, useDataView } from '@kit';",
  "import { MenuItem } from 'react-aria-components';",
  "import strings from './strings.en.json';",
].join('\n');
/** English for the fixtures' keys (the Hub's strings.en.json shape). */
const EN: Record<string, string> = {
  a: 'Address',
  b: 'Delete',
  'k.open': 'Open SSH settings for {{name}}',
  'k.title': 'SSH keys',
  'k.col.computer': 'Computer',
  'k.reset': 'Reset everything',
  long: 'Open the full activity history',
  mine: 'This is mine',
  checkout: 'Check out',
  alias: 'Make an alias',
  domain: 'Use your own domain',
  remove: 'Remove',
  viewc: 'View computers',
  'folder.path': 'Folder path',
  'np.directory': 'Working folder',
  'cwd.label': 'Start in (cwd)',
  'dir.label': 'Directory',
  'file.path': 'File path',
  'folder.name': 'Folder name',
  'ext.dirs': 'Extension folders',
  steps: 'steps',
  new: 'New',
};
/** A page module: the kit imported, its strings table, `body` at module level (components, helpers), plus extra files. */
const page = (body: string, extra: Files = {}): Files => ({ [PAGE]: `${IMPORTS}\n${body}`, [STRINGS]: JSON.stringify(EN), ...extra });

function scanNew(files: Files, opts: { disabled?: string[] } = {}): Hit[] {
  return A.scan({ ...KIT, ...files }, opts).hits.filter((h) => NEW.includes(h.rule));
}
const of = (hits: Hit[], rule: string) => hits.filter((h) => h.rule === rule);

/** Exactly `n` hits of `rule` (on `lines`, when given), and none once `rule` is switched off: the disabled twin. */
function must(rule: string, name: string, files: Files, n = 1, lines?: number[]) {
  it(`${rule} must-hit: ${name}`, () => {
    const got = of(scanNew(files), rule);
    expect(got.length, `hits: ${JSON.stringify(got.map((h) => `${h.file}:${h.line} ${h.msg}`))}`).toBe(n);
    if (lines) expect(got.map((h) => h.line).sort((x, y) => x - y)).toEqual(lines);
    expect(of(scanNew(files, { disabled: [rule] }), rule), 'rule switched off').toEqual([]);
  });
}
/** No hit of `rule`. */
function clean(rule: string, name: string, files: Files) {
  it(`${rule} not a hit: ${name}`, () => {
    const got = of(scanNew(files), rule);
    expect(got.map((h) => `${h.file}:${h.line} ${h.msg}`)).toEqual([]);
  });
}
/** A known static miss: no hit, and the label names where it is caught. */
function miss(rule: string, name: string, caughtBy: string, files: Files) {
  it(`${rule} known-miss → ${caughtBy}: ${name}`, () => expect(of(scanNew(files), rule).map((h) => `${h.file}:${h.line}`)).toEqual([]));
}

describe('ids', () => {
  it('the eight rules follow the first three ui rules in order, each with an explanation, none a CSS rule', () => {
    const ui = A.RULES.filter((r) => r.startsWith('ui.'));
    expect(ui).toEqual(['ui.kitClass', 'ui.pageLook', 'ui.rawControl', ...NEW]);
    for (const r of NEW) {
      expect(A.EXPLAIN[r], r).toBeTruthy();
      expect(A.CSS_RULES.includes(r), r).toBe(false);
    }
  });
  it("exceptions.cjs UI is the detector's ui family, so an exceptions entry may name every ui rule", () => {
    const { UI } = createRequire(import.meta.url)('../../scripts/lint/exceptions.cjs') as { UI: string[] };
    expect(UI).toEqual(A.RULES.filter((r) => r.startsWith('ui.')));
  });
});

describe('ui.rawUrl', () => {
  const R = 'ui.rawUrl';
  must(R, 'KeyShare.tsx:52 an address variable in a span', page(`export function KeyShare({ url }: { url: string | null }) {
  const t = useStrings(strings);
  return <div>{url ? <div><span>{t('a')}</span><span translate="no">{url}</span></div> : null}</div>;
}`));
  must(R, 'Broadcast.tsx:450 a property `.url` as span text', page(`export function Link({ state }: any) {
  const link = state.link;
  return <div>{link && <div><span title={link.url}>{link.url}</span></div>}</div>;
}`));
  must(R, 'AppsSection.tsx:131 a cell printing a `*Url` property', page(`const col = createColumnHelper<any>();
export function Apps() { return <DataTable columns={[col.accessor('name', { cell: (c: any) => <span><span>{c.row.original.name}</span><span>{c.row.original.webUrl}</span></span> })]} />; }`));
  must(R, 'Hub.tsx:73 a Facts value: p.origin (conditional spread in a Fact[] array)', page(`type Fact = { label: string; value?: string; url?: string };
export function Preview({ p }: any) {
  const t = useStrings(strings);
  const facts: Fact[] = [{ label: t('a'), value: p.name }, ...(p.origin ? [{ label: t('a'), value: p.origin }] : [])];
  return <Facts items={facts} />;
}`));
  must(R, 'a Facts item under a Facts element items, value: endpoint', page(`export function V({ endpoint }: any) { return <Facts items={[{ label: 'API', value: endpoint }]} />; }`));
  must(R, '(b) an http(s) literal as JSX text', page(`export function V() { return <p>Open https://hoody.com to start</p>; }`));
  must(R, '(b) an http(s) string literal child', page(`export function V() { return <p>{'https://hoody.com'}</p>; }`));
  must(R, '(d) AddressText (ConnectProxy.tsx:70)', page(`export function V({ url }: any) { return <div><AddressText url={url} /></div>; }`));
  must(R, '(d) an ExtLink with scheme-stripped children', page(`export function V({ url }: any) { return <ExtLink href={url}>{url.replace(/^https?:\\/\\//, '')}</ExtLink>; }`));
  must(R, '(d) an ExtLink whose text is its href minus the scheme', page(`export function V() { return <ExtLink href="https://hoody.com/docs">hoody.com/docs</ExtLink>; }`));
  must(R, 'three sites in one file are three hits', page(`export function V({ url, href, apiEndpoint }: any) { return <div><span>{url}</span><span>{href}</span><span>{apiEndpoint}</span></div>; }`), 3);

  clean(R, 'shell/Sidebar.tsx:66,111 an identifier bound to JSX in scope', page(`export function Nav({ label, rail }: any) {
  const link = <Link href="/x">{label}</Link>;
  if (!rail) return link;
  return <div>{link}</div>;
}`));
  clean(R, 'a ReactNode prop named link', page(`export function V({ link }: { link: React.ReactNode }) { return <div>{link}</div>; }`));
  clean(R, 'a field placeholder / description', page(`export function V({ url, address }: any) { return <TextField label="Address" placeholder={url} description={address} />; }`));
  clean(R, 'inside ExtLink, Link, LinkButton, AddressField or CodeBlock', page(`export function V({ url, href, endpoint }: any) {
  return <div><ExtLink href={url}>{url}</ExtLink><Link href={href}>{href}</Link><LinkButton href={href}>{href}</LinkButton><AddressField>{url}</AddressField><CodeBlock>{endpoint}</CodeBlock><CodeBlock>{'curl https://x.dev'}</CodeBlock></div>;
}`));
  clean(R, 'an address as an attribute value', page(`export function V({ url }: any) { return <Button data-url={url}>Go</Button>; }`));
  clean(R, 'a Facts item that says url:', page(`type Fact = { label: string; url?: string };
export function V({ p }: any) { const facts: Fact[] = [{ label: 'Origin', url: p.origin }]; return <Facts items={facts} />; }`));
  clean(R, 'a label/value object that is not a Facts item (Select options)', page(`export function V({ rows }: any) { const options = rows.map((r: any) => ({ label: r.name, value: r.url })); return <Select options={options} />; }`));
  clean(R, 'names that only end like a URL word in lowercase (unlink, hyperlinkcount)', page(`export function V({ unlink, hyperlinkcount }: any) { return <p>{unlink}{hyperlinkcount}</p>; }`));
  miss(R, 'Logs factOf `value: r.value` (pages/logs/parts/Inspector.tsx:67)', 'review + ExtLink secret-by-shape', page(`type Fact = { label: string; value?: string };
function factOf(t: any) { return (r: any): Fact => ({ label: t('det.' + r.key), value: r.value, mono: true }); }
export function V({ rows, t }: any) { return <Facts items={rows.map(factOf(t))} />; }`));
});

describe('ui.computerList', () => {
  const R = 'ui.computerList';
  const KEYS = `type ComputerKey = { id: string; name: string };
const col = createColumnHelper<ComputerKey>();
export function KeysSection({ rows }: any) {
  const t = useStrings(strings);
  const columns = [col.accessor((r: ComputerKey) => r.name, { id: 'computer', header: t('k.col.computer') })];
  const view = useDataView<ComputerKey>({ rows, columns, getRowId: (r: ComputerKey) => r.id, sort: 'computer' });
  return <DataTable label={t('k.title')} view={view} columns={columns} />;
}`;
  must(R, 'KeysSection.tsx:65-90 useDataView<ComputerKey> and its DataTable are one site', page(KEYS), 1, [9]);
  // The counted views are collected first, so a render helper declared above its view is judged the same
  must(R, 'a DataTable in a helper declared above its counted useDataView stays one site', page(`type ComputerKey = { id: string; name: string };
const col = createColumnHelper<ComputerKey>();
export function KeysSection({ rows }: any) {
  const t = useStrings(strings);
  const columns = [col.accessor((r: ComputerKey) => r.name, { id: 'computer', header: t('k.col.computer') })];
  const table = () => <DataTable label={t('k.title')} view={view} columns={columns} />;
  const view = useDataView<ComputerKey>({ rows, columns, getRowId: (r: ComputerKey) => r.id, sort: 'computer' });
  return table();
}`), 1, [10]);
  must(R, 'a DataTable whose view is derived from a counted useDataView stays one site (ComputersList)', page(`type Computer = { id: string };
export function List({ rows, columns }: any) { const view = useDataView<Computer>({ rows, columns }); const shown = { ...view, x: 1 }; return <DataTable view={shown} columns={columns} />; }`));
  must(R, 'useDataView untyped whose columns include id container', page(`export function V({ rows }: any) { const columns = [{ id: 'container', header: 'C' }]; const view = useDataView({ rows, columns }); return <DataTable view={view} columns={columns} />; }`));
  must(R, 'a DataTable alone whose column helper is typed with a Container row', page(`type ContainerRow = { id: string };
const c = createColumnHelper<ContainerRow>();
export function V({ data }: any) { return <DataTable data={data} columns={[c.accessor('name', {})]} />; }`));
  must(R, 'ShareComputers.tsx:13 rows typed ShareComputer[] into li', page(`type ShareComputer = { id: string; name: string };
function Names({ rows }: { rows: readonly ShareComputer[] }) { return <ul>{rows.map((c) => <li key={c.id}>{c.name}</li>)}</ul>; }
export function V(p: any) { return <Names rows={p.rows} />; }`));
  must(R, 'realms/view.tsx:225 a .map() rendering ComputerMark', page(`export function V({ chosen }: any) { return <ul>{chosen.map((r: any) => <li key={r.id}><ComputerMark color={r.color} />{r.name}</li>)}</ul>; }`));
  must(R, 'LinkDrawers.tsx:352 PickerPanel items with ComputerMark', page(`export function V({ running }: any) { return <PickerPanel items={running.map((c: any) => ({ id: c.id, label: c.name, lead: <ComputerMark color={c.color} /> }))} />; }`));
  must(R, 'an array named *computers into PickerPanel items (no mark)', page(`export function V({ computers }: any) { return <PickerPanel items={computers.map((c: any) => ({ id: c.id, label: c.name }))} />; }`));
  must(R, 'Switchers.tsx:360 data.computers into MenuItem', page(`export function V({ data }: any) { return <div>{data.computers.map((c: any) => <MenuItem key={c.id}>{c.name}</MenuItem>)}</div>; }`));
  must(R, 'servers filtered then mapped into tr', page(`export function V({ servers }: any) { return <table><tbody>{servers.filter((s: any) => s.up).map((s: any) => <tr key={s.id}><td>{s.name}</td></tr>)}</tbody></table>; }`));
  must(R, 'a callback parameter typed *Container* into li', page(`type ContainerInfo = { id: string };
export function V({ items }: any) { return <ul>{items.map((c: ContainerInfo) => <li key={c.id}>{c.id}</li>)}</ul>; }`));
  must(R, 'SettingsDrawer.tsx:139 one named row builder mapped from two lists is one site', page(`export function V({ computers, a, b }: any) {
  const computerRow = (id: string) => { const c = computers.find((x: any) => x.id === id); return { id, label: c.name, lead: <ComputerMark color={c.color} /> }; };
  const items = [...a.map(computerRow), ...b.map(computerRow)];
  return <PickerPanel items={items} />;
}`), 1, [5]);
  must(R, 'Picker.tsx:686 nested maps: the inner list is the site, not the group map', page(`export function V({ groups }: any) { return <ul>{groups.map((g: any) => <li key={g.id}><ul>{g.rows.map((r: any) => <li key={r.id}><ComputerMark color={r.color} />{r.name}</li>)}</ul></li>)}</ul>; }`), 1);

  clean(R, 'inside ComputerPicker / ContainerTable', page(`export function V({ computers }: any) { return <div><ComputerPicker items={computers.map((c: any) => ({ id: c.id, label: c.name, lead: <ComputerMark color={c.color} /> }))} /><ContainerTable>{computers.map((c: any) => <tr key={c.id} />)}</ContainerTable></div>; }`));
  clean(R, 'FilterChips options (an element, and a data view filters entry)', page(`type Row = { id: string };
export function V({ computers, rows, columns }: any) {
  const view = useDataView<Row>({ rows, columns, filters: [{ id: 'computer', label: 'C', options: computers.map((c: any) => ({ value: c.id, label: c.name, mark: <ComputerMark color={c.color} /> })) }] });
  return <div><FilterChips options={computers.map((c: any) => ({ value: c.id, label: c.name, mark: <ComputerMark color={c.color} /> }))} /><DataTable view={view} columns={columns} /></div>;
}`));
  clean(R, 'a list of something else into li; computers mapped to ids', page(`export function V({ items, computers }: any) { const ids = computers.map((c: any) => c.id); return <ul data-n={ids.length}>{items.map((x: any) => <li key={x}>{x}</li>)}</ul>; }`));
  it(`${R} not a hit: an exceptions.ts entry drops the hit and is reported used`, () => {
    const reg = { ...A.DEFAULT_REGISTRY, exceptions: [{ path: PAGE, rules: [R] }] };
    const r = A.scan({ ...KIT, ...page(KEYS) }, { registry: reg });
    expect(of(r.hits, R)).toEqual([]);
    expect(r.usedExceptions).toContain(`${PAGE}|${R}`);
  });
  it(`${R}: a hit on a named callback declaration sits at that function, not <module>`, () => {
    const files = { ...KIT, ...page(`function renderComputer(c: any) { return <li key={c.id}><ComputerMark color={c.color} /></li>; }
export function V({ chosen }: any) { return <ul>{chosen.map(renderComputer)}</ul>; }`) };
    const at = (sites: string[]) => A.scan(files, { registry: { ...A.DEFAULT_REGISTRY, exceptions: [{ path: PAGE, rules: [R], sites }] } });
    expect(of(at(['nothing']).hits, R)).toHaveLength(1);
    expect(of(at(['<module>']).hits, R)).toHaveLength(1);
    const own = at(['renderComputer']);
    expect(of(own.hits, R)).toEqual([]);
    expect(own.usedExceptions).toEqual([`${PAGE}|${R}|renderComputer`]);
  });
  miss(R, 'a list built from a type named otherwise', 'review', page(`type Box = { id: string; name: string };
function Names({ rows }: { rows: readonly Box[] }) { return <ul>{rows.map((b) => <li key={b.id}>{b.name}</li>)}</ul>; }
export function V(p: any) { return <Names rows={p.rows} />; }`));
});

describe('ui.nativeTitle', () => {
  const R = 'ui.nativeTitle';
  must(R, 'HistorySection:44 title= on <time>', page(`export function V({ v }: any) { return <time dateTime={v} title={new Date(v).toLocaleString()}>{v}</time>; }`));
  must(R, 'AskDock:142 title= on <span>, one site per element', page(`export function V({ a, b }: any) { return <div><span className="target" title={a}>{a}</span><abbr title={b}>{b}</abbr></div>; }`), 2);
  clean(R, 'kit internals (a kit file is never scanned) and a kit part prop', page(`export function V() { return <Button title="kit prop">Go</Button>; }`));
  clean(R, 'an svg <title> element is not an attribute', page(`export function V() { return <svg><title>Chart</title></svg>; }`));
  // An <iframe>'s title is its accessible name (board Frame, Desktop, WidgetCard, NoteFrame)
  clean(R, 'title= on <iframe> is its accessible name', page(`export function V({ src, name }: any) { return <iframe src={src} title={name} />; }`));
  // Exempt only when every tag the element can be is an iframe, whichever branch comes first
  must(R, 'a dynamic tag that can be a div (iframe branch first)', page(`export function V({ c }: any) { const El = c ? 'iframe' : 'div'; return <El title="Details" />; }`));
  must(R, 'a dynamic tag that can be a div (div branch first)', page(`export function V({ c }: any) { const El = c ? 'div' : 'iframe'; return <El title="Details" />; }`));
  clean(R, 'a dynamic tag that is an iframe on both branches', page(`export function V({ c }: any) { const El = c ? 'iframe' : 'iframe'; return <El title="Details" />; }`));
});

describe('ui.inlineLabel', () => {
  const R = 'ui.inlineLabel';
  // Only an action held as a menu or row item (a holder named like an item list) is an inline row action
  clean(R, 'an unrelated { inline: true, label } that is no item', page(`export function V() { const t = useStrings(strings); const opts = { inline: true, label: t('long') }; return <div data-o={opts.label} />; }`));
  const rowAction = (label: string, extra = '') => page(`export function V({ open }: any) {
  const t = useStrings(strings);
  return <DataTable actions={(r: any) => [{ id: 'x', label: ${label}, icon: 'terminal', inline: true${extra}, onAction: () => open(r) }]} />;
}`);
  must(R, 'KeysSection.tsx:86 an interpolating label without short', rowAction("t('k.open', { name: r.name })"));
  must(R, 'a label over 20 characters without short', rowAction("t('long')"));
  must(R, 'a row action in an array const returned to actions', page(`export function V({ open }: any) {
  const t = useStrings(strings);
  const list = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => open() }];
  return <DataTable actions={() => list} />;
}`));
  // An exported list's readers are in other files, so its name is the evidence there
  must(R, 'an exported row-actions list (its readers are elsewhere)', page(`const t = useStrings(strings);
export const rowActions = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V() { return <div />; }`));
  clean(R, 'an exported list not named like an item list', page(`const t = useStrings(strings);
export const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V() { return <div />; }`));
  must(R, 'an exported list not named like an item list, used locally as row actions', page(`const t = useStrings(strings);
export const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V() { return <DataTable actions={() => presets} />; }`));
  // A map that rewrites a read field ends the walk; one that keeps them still holds the items
  clean(R, 'row actions mapped to supply short', page(`const t = useStrings(strings);
const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V() { return <DataTable actions={() => presets.map((x) => ({ ...x, short: 'Run' }))} />; }`));
  must(R, 'row actions mapped keeping the read fields', page(`const t = useStrings(strings);
const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V() { return <DataTable actions={() => presets.map((x) => ({ ...x, disabled: true }))} />; }`));
  // Each rule follows a map that keeps the fields it reads; a write to the item in the callback counts
  must(R, 'row actions mapped with a new handler keep their long label (item-walk-gaps 1)', page(`const t = useStrings(strings);
const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V({ go }: any) { return <DataTable actions={() => presets.map((x) => ({ ...x, onAction: () => go(x.id) }))} />; }`));
  must(R, 'row actions shown or left out by a conditional map, then filtered (item-walk-gaps 2)', page(`const t = useStrings(strings);
const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, visible: true, onAction: () => 0 }];
export function V() { return <DataTable actions={() => presets.map((x) => (x.visible ? x : null)).filter(Boolean)} />; }`));
  must(R, 'row actions kept by a block map with an early null (item-walk-gaps 2)', page(`const t = useStrings(strings);
const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V({ hide }: any) { return <DataTable actions={() => presets.map((x) => { if (hide) return null; return x; }).filter(Boolean)} />; }`));
  clean(R, 'row actions given short by a write in the map callback (item-walk-gaps 3)', page(`const t = useStrings(strings);
const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V() { return <DataTable actions={() => presets.map((x) => { x.short = 'Run'; return x; })} />; }`));
  clean(R, 'row actions replaced by a reassigned map parameter', page(`const t = useStrings(strings);
const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V() { return <DataTable actions={() => presets.map((x) => { x = { ...x, short: 'Run' }; return x; })} />; }`));
  clean(R, 'row actions given short by Object.assign in the map callback (item-walk-gaps 3)', page(`const t = useStrings(strings);
const presets = [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }];
export function V() { return <DataTable actions={() => presets.map((x) => { Object.assign(x, { short: 'Run' }); return x; })} />; }`));
  // A holder counts only when no property the value sits under is still unread
  clean(R, 'an exported holder whose list sits under another property', page(`const t = useStrings(strings);
export const rowActions = { pinned: [{ id: 'x', label: t('long'), icon: 'terminal', inline: true, onAction: () => 0 }] };
export function V() { return <div />; }`));
  for (const k of ['mine', 'checkout', 'alias', 'domain', 'remove', 'viewc']) clean(R, `under the bar: "${EN[k]}" (PRs/Ports/market)`, rowAction(`t('${k}')`));
  clean(R, 'a long label with short', rowAction("t('long')", ", short: t('b')"));
  clean(R, 'not inline', page(`export function V() { const t = useStrings(strings); return <DataTable actions={() => [{ id: 'x', label: t('long'), inline: false, onAction: () => 0 }]} />; }`));
  clean(R, 'an unresolved key is not reported', rowAction("t('no.such.key')"));
});

describe('ui.actionTwice', () => {
  const R = 'ui.actionTwice';
  must(R, '(a) an item returned by a function named like an item list (rowEntries)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  function rowEntries() { return [{ id: 'r', label: t('a'), onAction: go }]; }
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={rowEntries()} /></div>;
}`));
  must(R, '(a) items in an array const passed as items', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices} /></div>;
}`));
  // The item side is an object held as a menu or row item; a toast's action is not one (ProgramView.tsx:151)
  clean(R, "a toast's action with a button's label key (ProgramView.tsx:151)", page(`declare function showToast(o: any): void;
export function V({ go }: any) {
  const t = useStrings(strings);
  const done = () => showToast({ title: 'Added', action: { label: t('a'), onAction: () => go('/b') } });
  return <div><LinkButton href="/x">{t('a')}</LinkButton><Button onPress={done}>{t('b')}</Button></div>;
}`));
  clean(R, 'an unrelated { label, onAction } that is no item', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const cfg = { label: t('a'), onAction: go };
  return <div data-c={String(cfg.label)}><Button onPress={go}>{t('a')}</Button></div>;
}`));
  // The value must reach the item holder; a name it passes is not enough
  clean(R, 'an unrelated object under a variable named like an item list (quickActions, read by member only)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const quickActions = { label: t('a'), onAction: go }; // never drawn as a menu or row item
  return <div data-q={String(quickActions.label)}><Button onPress={go}>{t('a')}</Button></div>;
}`));
  clean(R, 'a list only logged inside a function named like an item list', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  function actions() { console.log(choices); return []; }
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={actions()} /></div>;
}`));
  clean(R, 'an item list used only as a condition', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.length ? [] : []} /></div>;
}`));
  clean(R, 'an object that is the left operand of && (a condition, not the value)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={(choices && []) as any} /></div>;
}`));
  clean(R, 'a local function named like an item list that nothing calls or hands on', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  function rowActions() { return [{ id: 'r', label: t('a'), onAction: go }]; }
  return <div data-n={rowActions.name}><Button onPress={() => go(1)}>{t('a')}</Button></div>;
}`));
  clean(R, 'an item list used itself as a condition', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices ? [] : []} /></div>;
}`));
  clean(R, 'an object whose own property is the list passed as items (a member read)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const quick = { label: t('a'), onAction: go, items: [] as any[] };
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={quick.items} /></div>;
}`));
  must(R, '(a) items from a memoised callback called in the prop (useCallback-like)', page(`declare function cb<T>(f: T, deps: unknown[]): T;
export function V({ go }: any) {
  const t = useStrings(strings);
  const getItems = cb(() => [{ id: 'r', label: t('a'), onAction: go }], []);
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={getItems()} /></div>;
}`));
  must(R, '(a) items filtered on the way to the prop', page(`export function V({ go, ok }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.filter(ok)} /></div>;
}`));
  must(R, '(a) a recursive item function ends (the hop bound)', page(`export function V({ go, more }: any) {
  const t = useStrings(strings);
  function list(): any[] { return [{ id: 'r', label: t('a'), onAction: go }, ...(more ? list() : [])]; }
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={list()} /></div>;
}`));
  // The narrow cases: map of a list, a list read back from a returned object, an exported list used locally
  must(R, '(a) an action list mapped on the way to items', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map((x) => ({ ...x }))} /></div>;
}`));
  must(R, '(a) a list in a returned object read back by its property', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  function rowParts() { return { choices: [{ id: 'r', label: t('a'), onAction: go }], n: 1 }; }
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={rowParts().choices} /></div>;
}`));
  clean(R, 'another property of that returned object read back (not the list)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  function rowParts() { return { choices: [{ id: 'r', label: t('a'), onAction: go }], n: 1 }; }
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={[rowParts().n] as any} /></div>;
}`));
  // map/flatMap keep the items only when the callback hands its item back; a holder
  // counts only when no property the value sits under is still unread
  clean(R, 'a list mapped to its labels on the way to items', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map((x) => x.label) as any} /></div>;
}`));
  clean(R, 'a list mapped by a named callback on the way to items', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const pick = (x: any) => x.label;
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map(pick) as any} /></div>;
}`));
  must(R, '(a) a list mapped by a named callback that keeps its item', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const enrich = (x: any) => ({ ...x, disabled: false });
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map(enrich)} /></div>;
}`));
  must(R, '(a) a list mapped by a named function declaration that keeps its item', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  function same(x: any) { return x; }
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map(same)} /></div>;
}`));
  must(R, '(a) a list mapped to supply short keeps its label and handler (item-walk-gaps 1)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map((x) => ({ ...x, short: 'Run' }))} /></div>;
}`));
  clean(R, 'a list mapped to a new label is not the button twice (item-walk-gaps 1)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map((x) => ({ ...x, label: t('b') }))} /></div>;
}`));
  must(R, '(a) a list shown or left out by a conditional map, then filtered (item-walk-gaps 2)', page(`export function V({ go, on }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map((x) => (on ? x : undefined)).filter(Boolean)} /></div>;
}`));
  clean(R, 'a list relabelled by a write in the map callback (item-walk-gaps 3)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map((x) => { x.label = t('b'); return x; })} /></div>;
}`));
  must(R, '(a) a list flatMapped to [x] or [] on the way to items', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.flatMap((x) => (x.id ? [x] : []))} /></div>;
}`));
  must(R, '(a) a list mapped by a block callback that returns its item spread', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const choices = [{ id: 'r', label: t('a'), onAction: go }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={choices.map(function (x) { return { ...x, k: 1 }; })} /></div>;
}`));
  clean(R, 'groups passed as items while the actions sit under each group', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const groups = [{ id: 'g', choices: [{ id: 'r', label: t('a'), onAction: go }] }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={groups as any} /></div>;
}`));
  clean(R, 'an items property whose actions sit under a property never read back', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const cfg = { items: { pinned: [{ id: 'r', label: t('a'), onAction: go }] } };
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={cfg.items as any} /></div>;
}`));
  must(R, '(a) a nested list under items read back by its property', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  function rowParts() { return { items: { choices: [{ id: 'r', label: t('a'), onAction: go }] } }; }
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={rowParts().items.choices} /></div>;
}`));
  must(R, '(a) an item pushed onto a list a row menu returns (Programs.tsx:199)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const rowMenu = (r: any) => { const out: any[] = []; out.push({ id: 'r', label: t('a'), onAction: () => go(r) }); return out; };
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><DataTable rowMenu={rowMenu} /></div>;
}`));
  must(R, '(a) a row-actions function handed on as the prop (vault/view.tsx:201)', page(`export function V({ go }: any) {
  const t = useStrings(strings);
  const actions = (r: any) => [{ id: 'r', label: t('a'), onAction: () => go(r) }];
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><DataTable actions={actions} /></div>;
}`));
  must(R, '(a) items through a call result and ?? (useMemo-like)', page(`declare function memo<T>(f: () => T): T;
export function V({ go, more }: any) {
  const t = useStrings(strings);
  const list = memo(() => [{ id: 'r', label: t('a'), onAction: go }]);
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu items={more ?? list} /></div>;
}`));
  must(R, '(a) an item in a conditional branch under a property named items', page(`export function V({ go, c }: any) {
  const t = useStrings(strings);
  const cfg = { items: c ? [{ id: 'r', label: t('a'), onAction: go }] : [] };
  return <div><Button onPress={() => go(1)}>{t('a')}</Button><ActionMenu {...cfg} /></div>;
}`));
  must(R, 'KeysSection.tsx:85-86 (c) onRowAction={open} and a row action calling open(r)', page(`export function V({ link, go }: any) {
  const t = useStrings(strings);
  const open = link ? (r: any) => go(r.id) : null;
  return <DataTable label={t('k.title')} onRowAction={open ?? false} actions={(r: any) => (open ? [{ id: 'ssh', label: t('k.open', { name: r.name }), inline: true, onAction: () => open(r) }] : [])} />;
}`), 1, [7]);
  must(R, '(a) one t key as a Button child and a menu item label', page(`export function V({ reset, resetAll }: any) {
  const t = useStrings(strings);
  return <div><Button onPress={reset}>{t('k.reset')}</Button><ActionMenu items={[{ id: 'r', label: t('k.reset'), onAction: resetAll }]} /></div>;
}`));
  must(R, '(a) a toast/link object with href', page(`export function V() {
  const t = useStrings(strings);
  const more = { id: 'm', label: t('a'), href: '/x' };
  return <div><LinkButton href="/x">{t('a')}</LinkButton><ActionMenu items={[more]} /></div>;
}`));
  must(R, '(b) one handler as onPress and a menu onAction (ProgramView focus)', page(`export function V({ setFocus }: any) {
  const t = useStrings(strings);
  const menu = [{ id: 'focus', label: t('b'), onAction: () => setFocus((f: boolean) => !f) }];
  return <div><IconButton label="Focus" onPress={() => setFocus((f: boolean) => !f)} /><ActionMenu items={menu} /></div>;
}`));
  must(R, 'an item matching (a) and (b) is one site', page(`export function V({ del }: any) {
  const t = useStrings(strings);
  return <div><Button onPress={del}>{t('b')}</Button><ActionMenu items={[{ id: 'd', label: t('b'), onAction: del }]} /></div>;
}`));
  must(R, '(b) a MenuItem element onAction', page(`export function V({ del }: any) { return <div><TextButton onPress={del}>Delete</TextButton><MenuItem onAction={del}>Delete</MenuItem></div>; }`));
  clean(R, 'separate components', page(`export function A({ del }: any) { const t = useStrings(strings); return <Button onPress={del}>{t('b')}</Button>; }
export function B({ del }: any) { const t = useStrings(strings); return <ActionMenu items={[{ id: 'd', label: t('b'), onAction: del }]} />; }`));
  clean(R, 'separate groups: the branches of one conditional, two returns of one function', page(`export function V({ del, wide }: any) {
  const t = useStrings(strings);
  if (wide) return <Button onPress={del}>{t('b')}</Button>;
  return wide === null ? <Button onPress={del}>{t('a')}</Button> : <ActionMenu items={[{ id: 'd', label: t('a'), onAction: del }]} />;
}`));
  clean(R, 'two module helpers (RowActions.tsx: rowEntries / headerParts) are two places', page(`export function rowEntries(t: any, h: any) { return [{ id: 'run', label: t('a'), onAction: h.onRun }]; }
export function headerParts(t: any, h: any) { return <Button onPress={h.onRun}>{t('a')}</Button>; }`));
  clean(R, 'different handlers and labels', page(`export function V({ a, b }: any) { const t = useStrings(strings); return <div><Button onPress={a}>{t('a')}</Button><ActionMenu items={[{ id: 'd', label: t('b'), onAction: b }]} /></div>; }`));
  miss(R, 'a duplicate across components (logs Bands.tsx:19/58)', 'review', page(`export function Spike({ onAround, t }: any) { return <Button onPress={() => onAround(1)}>{t('a')}</Button>; }
export function Strip({ onAround, t, g }: any) { return <ActionMenu items={[{ id: 'around', label: t('a'), onAction: () => onAround(g) }]} />; }`));
});

describe('ui.bareNumber', () => {
  const R = 'ui.bareNumber';
  // An accessor counts only on a column helper (an identifier declared as createColumnHelper<T>())
  clean(R, 'an accessor of something that is no column helper', page(`declare const other: any;
export function V() { const c = other.accessor('x', { meta: { align: 'end' } }); return <div data-c={String(c)} />; }`));
  const column = (opts: string) => page(`const col = createColumnHelper<any>();
export function V() { const t = useStrings(strings); return <DataTable columns={[col.accessor('stepCount', ${opts})]} />; }`);
  must(R, "workflows/List.tsx:23 meta.align 'end', no cell, no listLabel", column("{ header: t('steps'), meta: { align: 'end', width: '88px', priority: 3 } }"));
  must(R, 'meta.tip alone no longer exempts', column("{ header: t('steps'), meta: { align: 'end', tip: t('steps') } }"));
  must(R, 'a plain column def with accessorKey', page(`export function V() { return <DataTable columns={[{ accessorKey: 'n', meta: { align: 'end' } }]} />; }`));
  must(R, 'a Tag whose only child is a number (.length)', page(`export function V({ rows }: any) { const n = rows.length; return <Tag>{n}</Tag>; }`));
  must(R, 'a Tag whose only child is a literal number', page(`export function V() { return <Tag> 3 </Tag>; }`));
  clean(R, 'with a cell', column("{ meta: { align: 'end' }, cell: (c: any) => c.getValue() + ' steps' }"));
  clean(R, 'with listLabel (top level or in meta)', page(`const col = createColumnHelper<any>();
export function V() { return <DataTable columns={[col.accessor('a', { listLabel: (n: number) => n + ' steps', meta: { align: 'end' } }), col.accessor('b', { meta: { align: 'end', listLabel: (n: number) => n + ' steps' } })]} />; }`));
  clean(R, 'not end-aligned', column("{ meta: { align: 'start' } }"));
  clean(R, 'a Tag with words, or a number and words', page(`export function V({ rows }: any) { const t = useStrings(strings); return <div><Tag>{t('new')}</Tag><Tag>{rows.length} {t('steps')}</Tag></div>; }`));
  miss(R, 'a computed number in a span', 'review', page(`export function V({ rows }: any) { return <span>{rows.length}</span>; }`));
});

describe('ui.badgeUnit', () => {
  const R = 'ui.badgeUnit';
  // Only a unit the item always carries exempts it; a conditional or absent one counts the badge
  must(R, 'a badgeUnit in a conditional spread', page(`export function V({ on, f }: any) { return <Tabs items={[{ id: 'a', label: 'A', badge: 3, ...(on ? { badgeUnit: f } : {}) }]} />; }`));
  must(R, 'a badgeUnit that may be undefined', page(`export function V({ on, f }: any) { return <Tabs items={[{ id: 'a', label: 'A', badge: 3, badgeUnit: on ? f : undefined }]} />; }`));
  clean(R, 'a badgeUnit spread in unconditionally', page(`export function V() { const f = (n: number) => n + ' new'; return <Tabs items={[{ id: 'a', label: 'A', badge: 3, ...{ badgeUnit: f } }]} />; }`));
  // The unit the item finally carries decides (later writes win; an unknown spread may overwrite it)
  const tab = (decl: string, fields: string) => page(`export function V({ on, rest }: any) { const f = (n: number) => n + ' new'; ${decl} return <Tabs items={[{ id: 'a', label: 'A', badge: 3, ${fields} }]} />; }`);
  must(R, 'a badgeUnit that may be false (on && f)', tab('', 'badgeUnit: on && f'));
  must(R, 'a badgeUnit overwritten by a later spread of undefined', tab('', 'badgeUnit: f, ...{ badgeUnit: undefined }'));
  must(R, 'a badgeUnit followed by an unknown spread', tab('', 'badgeUnit: f, ...rest'));
  must(R, 'a badgeUnit followed by a spread of a call', tab('const more = () => ({});', 'badgeUnit: f, ...more()'));
  // Both operands of || / ?? may be spread; a unit name is followed to its binding; a repeated spread stays exact
  must(R, 'a badgeUnit followed by a ?? spread whose left side may overwrite it', tab('', 'badgeUnit: f, ...(rest ?? {})'));
  must(R, 'a badgeUnit followed by a || spread whose left side may overwrite it', tab('const none = { badgeUnit: undefined };', 'badgeUnit: f, ...(none || {})'));
  must(R, 'a badgeUnit bound to a const that may be undefined', tab('const unit = on ? f : undefined;', 'badgeUnit: unit'));
  must(R, 'a badgeUnit bound to a parameter-free let', tab('let unit; unit = f;', 'badgeUnit: unit'));
  must(R, 'a badgeUnit that is a parameter (unresolved)', page(`export function V({ g }: any) { return <Tabs items={[{ id: 'a', label: 'A', badge: 3, badgeUnit: g }]} />; }`));
  must(R, 'a badgeUnit bound through a chain of consts ending maybe-undefined', tab('const a = on && f; const unit = a;', 'badgeUnit: unit'));
  clean(R, 'a badgeUnit bound to a const function', tab('const unit = (n: number) => n + " new";', 'badgeUnit: unit'));
  clean(R, 'a badgeUnit bound to a local function', tab('function unit(n: number) { return n + " new"; }', 'badgeUnit: unit'));
  clean(R, 'a badgeUnit that is an imported function', tab('', 'badgeUnit: countText'));
  must(R, 'a badgeUnit bound to a const cycle (ends unknown)', tab('const a: any = b; const b: any = a;', 'badgeUnit: a'));
  clean(R, 'the same harmless const spread twice', tab("const extra = { title: 'A' };", 'badgeUnit: f, ...extra, ...extra'));
  clean(R, 'a && spread whose right side cannot write the unit', tab("const extra = { title: 'A' };", 'badgeUnit: f, ...(on && extra)'));
  must(R, 'a badgeUnit in a local const bound to a conditional object', tab('const u = on ? { badgeUnit: f } : {};', '...u'));
  clean(R, 'a badgeUnit from an unconditional local const spread', tab('const u = { badgeUnit: f };', '...u'));
  clean(R, 'an unknown spread before an own badgeUnit', tab('', '...rest, badgeUnit: f'));
  clean(R, 'a badgeUnit with a sure fallback (f ?? g)', tab('const g = (n: number) => n + " new";', 'badgeUnit: f ?? g'));
  clean(R, 'a badgeUnit method', tab('', 'badgeUnit(n: number) { return n + " new"; }'));
  must(R, 'BotPane.tsx:381-382 two guarded number badges', page(`declare function badgeCount(x: any): any;
export function V({ chan, delegates }: any) {
  const t = useStrings(strings);
  const openTasks = delegates.filter((d: any) => d.state !== 'closed').length;
  const appsWaiting = badgeCount(chan);
  return <Tabs items={[
    { id: 'activity', label: t('a') },
    { id: 'apps', label: t('a'), badge: appsWaiting > 0 ? appsWaiting : undefined },
    { id: 'work', label: t('a'), badge: openTasks > 0 ? openTasks : undefined },
  ]} />;
}`), 2, [11, 12]);
  must(R, 'PageTabs.tsx:18 countText (a "99+" string)', page(`export function V({ unread, capped }: { unread: number | undefined; capped: boolean }) {
  return <Tabs items={[{ id: 'inbox', label: 'Inbox', href: '/n', badge: unread && unread > 0 ? countText(unread, capped) : undefined }]} />;
}`));
  must(R, 'market/view.tsx:300 a badge in a conditional spread, typed number', page(`import { pendingCount } from './logic';
export function V({ res }: any) { return <Tabs items={[{ id: 'l', label: 'L' }, { id: 'r', label: 'R', ...(res.data ? { badge: pendingCount(res.data.rows) } : {}) }]} />; }`, { 'pages/x/logic.ts': 'export const pendingCount = (rows: readonly any[]): number => rows.length;' }));
  must(R, 'keys/parts/Frame.tsx:67 an item builder (one site, called three times), counts typed number', page(`type TabId = 'keys' | 'ssh' | 'shared';
interface FrameProps { counts?: Partial<Record<TabId, number | undefined>> }
export function Frame({ counts }: FrameProps) {
  const item = (id: TabId, label: string) => ({ id, label, badge: counts?.[id] });
  return <Tabs items={[item('keys', 'K'), item('ssh', 'S'), item('shared', 'H')]} />;
}`), 1, [7]);
  must(R, 'number-like strings: "12" and "99+"', page(`export function V() { return <Tabs items={[{ id: 'a', label: 'A', badge: '12' }, { id: 'b', label: 'B', badge: '99+' }]} />; }`), 2);
  must(R, 'items from a const array and a .map()', page(`export function V({ rows }: any) { const items = rows.map((r: any) => ({ id: r.id, label: r.name, badge: r.list.length })); return <Tabs items={items} />; }`));
  clean(R, 'with badgeUnit', page(`export function V({ n }: { n: number }) { return <Tabs items={[{ id: 'a', label: 'A', badge: n, badgeUnit: (x: number) => x + ' unread' }]} />; }`));
  clean(R, 'a word badge', page(`export function V() { const t = useStrings(strings); return <Tabs items={[{ id: 'a', label: 'A', badge: t('new') }, { id: 'b', label: 'B', badge: 'new' }]} />; }`));
  clean(R, 'a badge outside Tabs items (shell/Sidebar entries)', page(`export function V({ n }: { n: number }) { const entry = { id: 'a', label: 'A', badge: n }; return <Stack data-x={entry.id} />; }`));
  clean(R, 'an untyped value nobody shows to be a number', page(`export function V({ x }: any) { return <Tabs items={[{ id: 'a', label: 'A', badge: x }]} />; }`));
});

describe('ui.folderField', () => {
  const R = 'ui.folderField';
  must(R, 'Options.tsx:181 label t(folder.path) "Folder path"', page(`export function V({ v, set }: any) { const t = useStrings(strings); return <TextField label={t('folder.path')} mono value={v} onChange={set} />; }`));
  must(R, 'NewProgram.tsx:354 "Working folder"', page(`export function V({ v }: any) { const t = useStrings(strings); return <TextField label={t('np.directory')} value={v} />; }`));
  must(R, 'claude/Transfer.tsx:444 a t prop typed through a local alias of useStrings<typeof strings> (no strings.en.json near)', {
    'pages/y/claude/Transfer.tsx': `import { TextField, useStrings } from '@kit';
import strings from './Transfer.strings.en.json';
type T = ReturnType<typeof useStrings<typeof strings>>;
function PathField({ t, path }: { t: T; path: string }) { return <TextField label={t('path')} value={path} />; }
export function V() { const t = useStrings(strings); return <PathField t={t} path="" />; }`,
    'pages/y/claude/Transfer.strings.en.json': JSON.stringify({ path: 'Path below the home folder' }),
  });
  must(R, '"cwd" and "Directory" labels, a literal label and aria-label', page(`export function V() { const t = useStrings(strings); return <div><TextField label={t('cwd.label')} /><TextField aria-label={t('dir.label')} /><TextField label="Script folder" /></div>; }`), 3);
  must(R, 'board/options/model.ts:236 an opensFields { id, key } descriptor labelled "Folder"', {
    'pages/board/options/model.ts': "export const M = { files: { opensFields: { root: [], folder: [{ id: 'path', key: 'files.path.folder' }], editor: [{ id: 'path', key: 'files.path.file' }] } } };",
    'pages/board/options/strings.en.json': JSON.stringify({ 'files.path.folder.label': 'Folder', 'files.path.file.label': 'File' }),
  });
  must(R, "a { kind: 'text', key } option row labelled with cwd", {
    'pages/board/options/model.ts': "export const ROWS = [{ kind: 'text', id: 'cwd', key: 'term.cwd' }, { kind: 'seg', id: 'dir', key: 'term.dir' }];",
    'pages/board/options/strings.en.json': JSON.stringify({ 'term.cwd.label': 'Start folder', 'term.dir.label': 'Directory' }),
  });
  clean(R, 'the bare word "path"', page(`export function V() { const t = useStrings(strings); return <TextField label={t('file.path')} />; }`));
  clean(R, 'a multiline folder list (Board extension dirs)', page(`export function V() { const t = useStrings(strings); return <TextField multiline label={t('ext.dirs')} />; }`));
  clean(R, "a folder's name is not a place (declared narrowing)", page(`export function V() { const t = useStrings(strings); return <TextField label={t('folder.name')} />; }`));
  clean(R, 'an unresolved key is not reported', page(`export function V({ t2 }: any) { return <TextField label={t2.get('folder.path')} />; }`));
  clean(R, 'not a TextField', page(`export function V() { const t = useStrings(strings); return <Select label={t('folder.path')} />; }`));
});

// The layout gate hands the detector code files only and reads string tables through opts.readSrc (the gate's
// srcFiles/measure): the rules that read English resolve the same keys there as in a whole-tree scan, so the seeded rows and the
// tree's ratchet count the same hits.
describe('string tables through readSrc', () => {
  const R = 'ui.folderField';
  const body = `export function V({ v, set }: any) { const t = useStrings(strings); return <TextField label={t('folder.path')} mono value={v} onChange={set} />; }`;
  const code = { ...KIT, [PAGE]: `${IMPORTS}\n${body}` };
  it('a table read through readSrc resolves like one in files', () => {
    const readSrc = (rel: string) => (rel === STRINGS ? JSON.stringify(EN) : null);
    expect(of(A.scan(code, { readSrc }).hits, R).map((h) => h.line)).toEqual(of(A.scan({ ...code, [STRINGS]: JSON.stringify(EN) }).hits, R).map((h) => h.line));
    expect(of(A.scan(code, { readSrc }).hits, R)).toHaveLength(1);
  });
  // The reader serves only what readTree puts in files (strings.en.json), so the two runs see the same tables
  it('a strings table with its own name (View.strings.en.json) resolves through readSrc like one in files', () => {
    const named = { ...KIT, [PAGE]: `${IMPORTS.replace("'./strings.en.json'", "'./View.strings.en.json'")}\n${body}` };
    const table = JSON.stringify(EN);
    const viaReader = of(A.scan(named, { readSrc: (rel) => (rel === 'pages/x/View.strings.en.json' ? table : null) }).hits, R);
    expect(viaReader).toHaveLength(1);
    expect(viaReader.map((h) => h.line)).toEqual(of(A.scan({ ...named, 'pages/x/View.strings.en.json': table }).hits, R).map((h) => h.line));
  });
  it('a strings table in a dot folder or node_modules is no ui table through readSrc, as readTree never reads it', () => {
    for (const dir of ['.i18n', 'node_modules/x']) {
      const rel = `pages/x/${dir}/strings.en.json`;
      const hidden = { ...KIT, [PAGE]: `${IMPORTS.replace("'./strings.en.json'", `'./${dir}/strings.en.json'`)}\n${body}` };
      // the layout explain pass reads the import through readSrc too; only the ui rules decline it
      expect(of(A.scan(hidden, { readSrc: (r) => (r === rel ? JSON.stringify(EN) : null) }).hits, R), dir).toEqual([]);
    }
  });
  it('another imported JSON (labels.json) is no ui table through readSrc, as readTree never reads it', () => {
    const labels = { ...KIT, [PAGE]: `${IMPORTS.replace("import strings from './strings.en.json';", "import labels from './labels.json';")}\n${body.replace('useStrings(strings)', 'useStrings(labels)')}` };
    const hits = A.scan(labels, { readSrc: (rel) => (rel === 'pages/x/labels.json' ? JSON.stringify(EN) : null) }).hits;
    expect(of(hits, R)).toEqual([]);
  });
});
