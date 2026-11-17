// The render budget and reachability walk: in each scenario, walk every pager and every drill-in to its
// end and assert (1) at most VIEW_ROWS rows in the DOM at every step, (2) the rows visited equal the eligible set,
// (3) Other ways is present in every Directory state.
//
// Each scenario's catalogue is cut down (`small`) to the least that still makes every pager page: the walk over all
// 7,078 models drew every drill-in of every provider and ran the worker out of heap. Kept: up to SMALL.perClass
// providers of each kind (ready, needs a key, custom, unknown) so every Directory section and the Ready groups run past
// one page (Connected is the connect verb's only, never drawn here); SMALL.models models each, so a group has its "All N" drill-in; one provider with more than VIEW_ROWS
// models, so its drill-in pages and the row budget still binds; SMALL.ensembles ensembles. `pages` proves it.
import { agent, providers } from '@core';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { okBody, type AgentReads, type Scenario } from './fixtures/catalogue7k';
import { evidence7k } from './fixtures/evidence7k';
import { ModelBrowser } from './ModelBrowser';
import { PAGE, VIEW_ROWS } from './modelPaging';

afterEach(cleanup);

/** The pager each case must walk past its first page (nav label → at least this many pages). */
type Pages = Record<string, number>;
interface Case {
  scenario: Scenario;
  purpose: providers.Purpose;
  claude?: boolean;
  pages: Pages;
}

// Every case: the All providers section and the big provider's drill-in page.
const ALL: Pages = { 'All providers': 2, drill: Math.ceil((VIEW_ROWS + 1) / PAGE.drillIn) };
const CASES: Case[] = [
  { scenario: 'manyReady', purpose: 'bot', pages: { ...ALL, 'Ready to use': 2 } },
  { scenario: 'readyReadFailed', purpose: 'bot', pages: { ...ALL, 'Ready to use': 2 } },
  { scenario: 'manyCustom', purpose: 'bot', pages: { ...ALL, 'Needs attention': 2 } },
  { scenario: 'manyEnsembles', purpose: 'bot', pages: ALL },
  { scenario: 'claudeRows', purpose: 'agent', claude: true, pages: ALL },
  { scenario: 'freeOnly', purpose: 'bot', pages: ALL },
];

// perClass: All providers leaves out the Suggested ones (and, in choose, every ready one), so a kind needs more than both.
const SMALL = { perClass: PAGE.all + PAGE.suggested + 2, models: PAGE.groupOptions + 2, big: VIEW_ROWS + 10, ensembles: PAGE.ensembles + 2 } as const;
const FREE = 'hoody-ai/hoody-free';
const prefixOf = (spec: string) => spec.slice(0, spec.indexOf('/') + 1);

/** Cut a scenario's answers down in place (evidence7k's `edit`): see the header. */
function small(r: AgentReads) {
  const ps = okBody(r.providers)?.providers;
  const ms = okBody(r.models)?.models;
  if (!ps || !ms) return;
  const kind = (p: (typeof ps)[number]) => (p.id === 'hoody-ai' ? 'free' : p.custom ? 'custom' : (p.status?.state ?? 'none'));
  const perKind = new Map<string, number>();
  const kept = ps.filter((p) => {
    const k = kind(p);
    perKind.set(k, (perKind.get(k) ?? 0) + 1);
    return k === 'free' || perKind.get(k)! <= SMALL.perClass;
  });
  const big = kept.filter((p) => p.id !== 'hoody-ai').reduce((a, b) => (b.model_count > a.model_count ? b : a));
  const room = new Map(kept.map((p) => [p.prefix, p === big ? SMALL.big : SMALL.models]));
  let ensembles = 0;
  const models = ms.filter((m) => {
    if (m.source === 'fusion') return ++ensembles <= SMALL.ensembles;
    const left = room.get(prefixOf(m.spec));
    if (left === undefined) return false;
    if (left <= 0 && m.spec !== FREE) return false;
    room.set(prefixOf(m.spec), left - 1);
    return true;
  });
  const specs = new Set(models.map((m) => m.spec));
  for (const p of kept) p.model_count = models.filter((m) => m.spec.startsWith(p.prefix)).length;
  ps.splice(0, ps.length, ...kept);
  ms.splice(0, ms.length, ...models);
  const ready = okBody(r.ready)?.models;
  if (ready) ready.splice(0, ready.length, ...ready.filter((m) => specs.has(m.spec)));
  expect(big.model_count).toBeGreaterThan(VIEW_ROWS);
}

let maxRows = 0;
const countRows = () => {
  const n = document.querySelectorAll('[data-mc-row]').length;
  maxRows = Math.max(maxRows, n);
  expect(n).toBeLessThanOrEqual(VIEW_ROWS);
};
const press = (el: Element) => {
  fireEvent.click(el);
  countRows();
};
const options = (seen: Set<string>) => document.querySelectorAll<HTMLElement>('[role="option"]').forEach((o) => o.dataset.spec && seen.add(o.dataset.spec));
// Plain DOM queries: role queries over a 250-row tree, thousands of times, exhaust the worker's heap.
const nameOf = (el: Element) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
const buttons = (root: ParentNode = document) => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
const button = (name: string | RegExp, root: ParentNode = document) => buttons(root).find((b) => (typeof name === 'string' ? nameOf(b) === name : name.test(nameOf(b)))) ?? null;
const nav = (name: string | RegExp) => Array.from(document.querySelectorAll('nav')).find((n) => (typeof name === 'string' ? nameOf(n) === name : name.test(nameOf(n)))) ?? null;
const nextOf = (n: Element | null) => (n ? button('Next', n) : null);

/** The most pages each pager walked (its key: `walkPager`'s `key`). */
let walked: Record<string, number> = {};
/** Every page of the pager named `name` (from where it is), calling `visit` on each page; counts them under `key`. */
function walkPager(name: string | RegExp, visit: () => void, key: string) {
  visit();
  for (let n = 1; n < 1000; n++) {
    walked[key] = Math.max(walked[key] ?? 0, n);
    const next = nextOf(nav(name));
    if (!next || next.hasAttribute('disabled')) return;
    press(next);
    visit();
  }
  throw new Error('pager never ended');
}

/** The eligible set: every caller-eligible catalogue model that is listed (not gone), and Claude Code rows. */
function eligible(ev: providers.Evidence, rules: providers.JudgeRules): Set<string> {
  const out = new Set<string>();
  if (ev.catalogue.state === 'ok') for (const m of ev.catalogue.value.cat.models) if (rules.eligible(m.spec, ev) && providers.readinessOf(ev, m.spec) !== 'gone') out.add(m.spec);
  if (ev.claude?.state === 'ok') {
    for (const spec of [agent.claudeSpec(''), ...ev.claude.value.models.map((m) => agent.claudeSpec(m.id))]) if (rules.eligible(spec, ev) && providers.readinessOf(ev, spec) !== 'gone') out.add(spec);
  }
  return out;
}

describe.each(CASES)('reachability walk: $scenario', ({ scenario, purpose, claude, pages }) => {
  it(`every eligible row is reachable and no step draws more than ${VIEW_ROWS} rows`, () => {
    maxRows = 0;
    walked = {};
    const ev = evidence7k(scenario, { claude, edit: small });
    const rules = providers.rulesFor(purpose);
    render(<ModelBrowser evidence={ev} computerName="atlas" value="" rules={rules} purpose={purpose} offer={{ claude }} onChoose={() => undefined} onSetup={() => undefined} onOtherWay={() => undefined} onRetry={() => undefined} />);
    countRows();
    const seen = new Set<string>();
    const providersSeen = new Set<string>();

    const drill = (opener: HTMLElement) => {
      press(opener);
      walkPager(/ pages$/, () => options(seen), 'drill');
      const back = button(/^Back to/);
      expect(back).not.toBeNull();
      press(back!);
    };

    // Ready view: every group page, each group's "All N" drill-in.
    walkPager('Ready to use pages', () => {
      options(seen);
      for (const id of buttons().filter((b) => b.id.includes('-all-')).map((b) => b.id)) drill(document.getElementById(id)!);
    }, 'Ready to use');

    // Directory: every section page; each provider's drill-in; Other ways in every state.
    if (ev.catalogue.state === 'ok') {
      press(button('Set up a provider')!);
      const otherWays = () => expect(Array.from(document.querySelectorAll('h4')).some((h) => h.textContent === 'Other ways')).toBe(true);
      otherWays();
      const visitSection = () => {
        otherWays();
        for (const li of Array.from(document.querySelectorAll<HTMLElement>('li[data-provider]'))) {
          const pid = li.dataset.provider!;
          if (providersSeen.has(pid)) continue;
          providersSeen.add(pid);
          const opener = buttons(li).find((b) => b.id.includes('-open-')) ?? buttons(li)[0]!;
          drill(document.getElementById(opener.id)!);
          otherWays();
        }
      };
      visitSection();
      for (const [section, key] of [
        [/^Needs attention pages$/, 'Needs attention'],
        [/^Connected pages$/, 'Connected'],
        [/^All providers.* pages$/, 'All providers'],
      ] as const) {
        if (nav(section)) walkPager(section, visitSection, key);
      }
    }

    const want = eligible(ev, rules);
    expect(want.size).toBeGreaterThan(0);
    expect([...want].filter((spec) => !seen.has(spec))).toEqual([]);
    expect([...seen].filter((spec) => !want.has(spec))).toEqual([]);
    expect(maxRows).toBeLessThanOrEqual(VIEW_ROWS);
    // The cut catalogue still pages where it must: each named pager went past its first page.
    for (const [key, least] of Object.entries(pages)) expect(walked[key] ?? 0, key).toBeGreaterThanOrEqual(least);
  }, 60_000);
});
