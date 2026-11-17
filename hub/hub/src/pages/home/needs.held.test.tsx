// Vitest: Needs you names every held change and gives it one action, its Check, on the page that sent it (the
// row "has no detail and nothing to click"). The scripts case is a record such as an e2e leaves (a script
// save whose answer was lost, then Discard draft): "Saving script <path> on <computer> was not confirmed", Check opens
// that script on Scripts. Another page's change names that page and links to it; a change filed under another realm
// stays out; past three lines, one "more" line; the computer is named from Home's own list, never by its id.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { fixtureWorld } from '@core';
import { CHANGE_STORE_KEY, writeChanges, type StoredChange } from '@core/change-store';
import * as C from '@core/changes';
import { render, renderPage, screen, within } from '@app/testing';
import { links as scripts } from '../scripts/links';
import { attemptPage } from './data';
import { HELD_SHOWN, heldLine, needsItems, SCRIPT_QUESTION_BASES, unresolvedLines, type HeldLine, type UnresolvedInput } from './logic';
import { NeedsYou } from './parts/NeedsYou';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

const W = fixtureWorld;
const personal = W.realms[0]!.id;
const ember = W.computers.find((c) => c.realm_ids.includes(personal))!;
const emberRow = { id: ember.id, name: ember.name, handle: `${ember.name}.${ember.id.slice(-4)}` };
const PATH = 'default/1/discard-held-probe.ts';
const realm = { name: 'Personal', all: false };

const scriptHeld = (computerId: string, at = 1794200111157): UnresolvedInput => ({
  ref: 'c7',
  base: 's:scripts:write',
  page: 'scripts',
  identity: { path: PATH, opId: 'c5cf451ba45101234a771daef45b4813' },
  target: { project: { id: 'be0000000000000000000b01' }, container: { id: computerId, server_name: 'live-node-1' } },
  at,
  held: true,
});
const items = (held: HeldLine[], sending = 0) => needsItems({ botsWaiting: undefined, computers: [], held, sending });

describe('heldLine', () => {
  it('names a held script save by its path and its computer, and links to that script on Scripts', () => {
    const line = heldLine(scriptHeld(ember.id), [emberRow], scripts.script);
    expect(line).toEqual({ id: 'c7', kind: 'script', path: 'discard-held-probe.ts', computer: ember.name, href: scripts.script(emberRow.handle, PATH) });
    expect(line.href).toBe(`/scripts?sel=${encodeURIComponent(`${emberRow.handle}~discard-held-probe.ts`)}`);
  });

  it('never shows a computer id: a computer Home does not list leaves the computer out and links to Scripts', () => {
    const line = heldLine(scriptHeld('ce0000000000000000000c01'), [emberRow], scripts.script);
    expect(line).toEqual({ id: 'c7', kind: 'script', path: 'discard-held-probe.ts', href: '/scripts' });
    expect(JSON.stringify(line)).not.toContain('ce0000000000000000000c01');
    expect(JSON.stringify(line)).not.toContain('live-node-1');
  });

  it("names another page's change by its page and links to it", () => {
    const line = heldLine({ ref: 'c8', base: 'lock:computer.create', page: 'computers', identity: { name: 'atlas' }, target: null, at: 5, held: true }, [], scripts.script);
    expect(line).toEqual({ id: 'c8', kind: 'page', page: 'computers', href: '/computers' });
  });

  it('another Scripts change than a script save (template deploy, restore, comments, env, tests) gets no Check: /scripts does not list it', () => {
    for (const key of ['instantiate', 'restore', 'comments', 'envUpdate', 'testsPut', 'remove', 'trigger']) {
      const line = heldLine({ ...scriptHeld(ember.id), base: `s:scripts:${key}`, identity: { path: PATH } }, [emberRow], scripts.script);
      expect(line).toEqual({ id: 'c7', kind: 'look', page: 'scripts', computer: ember.name, href: null });
    }
  });

  it('a script save that names no path (an older build\'s record) still links to Scripts, which lists it with its Stop tracking', () => {
    expect(heldLine({ ...scriptHeld(ember.id), identity: null }, [emberRow], scripts.script)).toEqual({ id: 'c7', kind: 'page', page: 'scripts', computer: ember.name, href: '/scripts' });
  });

  it('gives a change whose page is not known no link', () => {
    expect(heldLine({ ref: 'c9', base: null, page: null, identity: null, target: null, at: 5, held: true }, [], scripts.script)).toEqual({ id: 'c9', kind: 'unknown', href: null });
  });

  it('its id is the send\'s own ref, whatever its base and time: two sends at the same moment never share one', () => {
    expect(heldLine({ ...scriptHeld(ember.id), ref: 'c10' }, [emberRow], scripts.script).id).toBe('c10');
    expect(heldLine({ ...scriptHeld(ember.id), ref: 'c11' }, [emberRow], scripts.script).id).toBe('c11');
  });
});

describe('needs you, held changes', () => {
  it('shows the script line with what to do and one Check that opens the script', () => {
    const line = heldLine(scriptHeld(ember.id), [emberRow], scripts.script);
    render(<NeedsYou items={items([line])} realm={realm} />);
    const strip = within(screen.getByRole('heading', { name: strings['needs.title'] }).closest('section')!);
    expect(strip.getByText(`Saving script discard-held-probe.ts on ${ember.name} was not confirmed. Check whether it was saved.`, { selector: '[data-need] *' })).toBeInTheDocument();
    const links = strip.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(strings['needs.held.action']);
    expect(links[0]).toHaveAttribute('href', line.href);
    expect(links[0]).toHaveAttribute('data-variant', 'secondary');
  });

  it("names another page's change and checks it there", () => {
    const line = heldLine({ ref: 'c8', base: 'lock:computer.create', page: 'computers', identity: null, target: null, at: 5, held: true }, [], scripts.script);
    render(<NeedsYou items={items([line])} realm={realm} />);
    expect(screen.getByText('A change made on Computers was not confirmed. Check whether it went through.', { selector: '[data-need] *' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings['needs.held.action'] })).toHaveAttribute('href', '/computers');
  });

  it('shows at most three lines, then one line for the rest that checks the first of them', () => {
    const lines = Array.from({ length: 5 }, (_, n) => heldLine({ ref: `r${n}`, base: `s:p${n}:x`, page: n === 4 ? 'keys' : 'computers', identity: null, target: null, at: n, held: true }, [], scripts.script));
    const got = items(lines);
    expect(got.map((i) => i.key)).toEqual(['held:r0', 'held:r1', 'held:r2', 'more']);
    expect(HELD_SHOWN).toBe(3);
    render(<NeedsYou items={got} realm={realm} />);
    expect(screen.getByText('2 more changes were not confirmed', { selector: '[data-need] *' })).toBeInTheDocument();
    const checks = screen.getAllByRole('link', { name: strings['needs.held.action'] });
    expect(checks).toHaveLength(4);
    expect(checks[3]).toHaveAttribute('href', '/computers');
  });

  it('a change being sent is one line of its own, never a held one', () => {
    const got = items([], 2);
    expect(got).toEqual([{ key: 'changes', count: 2, scope: 'account', tone: 'warn' }]);
    render(<NeedsYou items={got} realm={realm} />);
    expect(screen.getByText('2 changes are being sent', { selector: '[data-need] *' })).toBeInTheDocument();
  });

  it('another Scripts change says where to look and has no action', () => {
    const line = heldLine({ ...scriptHeld(ember.id), base: 's:scripts:instantiate' }, [emberRow], scripts.script);
    render(<NeedsYou items={items([line])} realm={realm} />);
    expect(screen.getByText(`A change made on Scripts for ${ember.name} was not confirmed. Look at the script there to see whether it went through.`, { selector: '[data-need] *' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(JSON.stringify(strings)).toContain('needs.held.lookAny');
  });

  it('a change whose page is not known says so and has no action', () => {
    render(<NeedsYou items={items([{ id: '?@1', kind: 'unknown', href: null }])} realm={realm} />);
    expect(screen.getByText(strings['needs.held.unknown'], { selector: '[data-need] *' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('Home with the held script save stored', () => {
  async function seed(o: { realm?: string; sending?: boolean; questions?: readonly string[] } = {}) {
    const scope = 's:scripts:write' + (o.realm ? '@' + o.realm : '') + `#${ember.project_id}/${ember.id}`;
    const rec = {
      id: C.changeOwner() + scope + '\u0000' + '3c9021463d85296428f1f26188f3dfa14466d5d120ed08f35ca9c0353a76058a',
      pending: true, key: null, t: Date.now(), at: Date.now() - 60_000, fmt: 1,
      meta: { base: 's:scripts:write', target: { project: { id: ember.project_id }, container: { id: ember.id, server_name: ember.server_name } }, realm: o.realm ?? null, by: 's:scripts:write', page: 'scripts', identity: { path: PATH, opId: 'c5cf451ba45101234a771daef45b4813' } },
      inc: 'dc6ce6b7-cca9-4763-be54-61cc90922733', nonce: '35d8b8e3-36d0-4d21-9cf9-c9a91c77aa19', oc: 'ef84007b-f5cf-4c3a-9583-9e07eb3dce55',
      // sending: another tab's send of it is out now (its answer not in yet), not held.
      ...(o.sending ? { pending: false, sending: { tab: 'another-tab', at: Date.now() } } : {}),
    } as unknown as StoredChange;
    // questions: the Scripts read-only sends of these bases, each held (its answer lost) next to the save.
    const asks = (o.questions ?? []).map((base, i) => ({
      ...(rec as unknown as Record<string, unknown>),
      id: C.changeOwner() + base + `#${ember.project_id}/${ember.id}` + '\u0000' + String(i).padStart(64, '0'),
      pending: true, at: Date.now() - 30_000 + i,
      meta: { base, target: { project: { id: ember.project_id }, container: { id: ember.id, server_name: ember.server_name } }, realm: null, by: base, page: 'scripts' },
      inc: `dc6ce6b7-cca9-4763-be54-61cc9092${String(2000 + i)}`, nonce: `35d8b8e3-36d0-4d21-9cf9-c9a91c77${String(2000 + i)}`,
    })) as unknown as StoredChange[];
    writeChanges([rec, ...asks]);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY })); });
  }

  it('names it with its computer and its one action opens the script on Scripts', async () => {
    await renderPage(page);
    await seed();
    const text = `Saving script discard-held-probe.ts on ${ember.name} was not confirmed. Check whether it was saved.`;
    const line = (await screen.findByText(text, { selector: '[data-need] *' }, { timeout: 8000 })).closest('li')!;
    const check = within(line).getByRole('link', { name: strings['needs.held.action'] });
    // The page router's links carry the hash (#/scripts?...).
    expect(check).toHaveAttribute('href', '#' + scripts.script(`${ember.name}.${ember.id.slice(-4)}`, PATH));
    expect(screen.queryByText(/not settled yet/)).toBeNull();
  });

  it('a save another tab is sending now is the "being sent" line, with no Check', async () => {
    await renderPage(page);
    await seed({ sending: true });
    await screen.findByText('1 change is being sent', { selector: '[data-need] *' }, { timeout: 8000 });
    expect(screen.queryByText(/Saving script/)).toBeNull();
    expect(screen.queryByRole('link', { name: strings['needs.held.action'] })).toBeNull();
  });

  it("names no line for a Scripts read-only question held next to it (a Check whose own settle answer was lost, a code check...): a question is never a change", async () => {
    await renderPage(page);
    await seed({ questions: [...SCRIPT_QUESTION_BASES] });
    await screen.findByText(`Saving script discard-held-probe.ts on ${ember.name} was not confirmed. Check whether it was saved.`, { selector: '[data-need] *' }, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(document.querySelectorAll('li[data-need^="held:"]')).toHaveLength(1);
    expect(screen.queryByText(/A change made on Scripts/)).toBeNull();
    expect(screen.queryByText(/not settled yet|being sent|more/)).toBeNull();
  });

  it('leaves out the same save filed under another realm', async () => {
    await renderPage(page);
    await seed({ realm: 'f'.repeat(24) });
    await screen.findByRole('heading', { level: 1 }, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/discard-held-probe/)).toBeNull();
    expect(screen.queryByRole('heading', { name: strings['needs.title'] })).toBeNull();
  });
});

describe('attemptPage: every attempt sender names its page', () => {
  // Each live sender (core holdAttempt `by`), as the page that holds it writes it: a bare page id ('keys': mint and share),
  // or the page id then '.' or ':' and the action.
  it.each([
    ['keys', 'keys'], ['programs.add', 'programs'], ['apps:openwith', 'apps'], ['apps.github', 'apps'], ['files:upload', 'files'],
    ['files:link', 'files'], ['support:create', 'support'], ['support:reply', 'support'], ['support:close', 'support'], ['ai.agent-model', 'ai'],
  ])('%s is the %s page', (by, page) => {
    expect(attemptPage(by)).toBe(page);
  });
  it('a sender that is not a page id names no page', () => {
    for (const by of ['', 'Keys', 'keys/x', '.keys', ' keys']) expect(attemptPage(by)).toBeNull();
  });
  it('every sender the source declares names a page Home can name (whole-src scan)', () => {
    const src = join(import.meta.dirname, '../..');
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && /^(pages|ask|shell)\//.test(f));
    const senders = files.flatMap((f) => [...readFileSync(join(src, f), 'utf8').matchAll(/\b[A-Z_]*BY[A-Z_]*\s*=\s*['"]([a-z][a-z0-9.:-]*)['"]/g)].map((m) => m[1]!));
    expect(senders.length).toBeGreaterThanOrEqual(10);
    for (const by of senders) {
      const page = attemptPage(by);
      expect(page, by).not.toBeNull();
      expect(Object.hasOwn(strings, `needs.page.${page}`), by).toBe(true);
    }
  });
});

describe('Scripts read-only questions: Home never names one as a change', () => {
  const row = (base: string, held = true): UnresolvedInput => ({ ...scriptHeld(ember.id), ref: base, base, identity: null, held });
  it('the list is exactly scripts/data.ts\'s sends that prove nothing changed, each under its own base (no shared lock)', () => {
    const src = readFileSync(join(__dirname, '..', 'scripts', 'data.ts'), 'utf8');
    expect(src).toMatch(/const NOTHING_CHANGED = \(\): ReadVerdict => 'not_applied';/);
    // Parsed, not pattern-matched: every property whose value is an object literal with `proves:
    // NOTHING_CHANGED`, whatever its name's form (quoted, numeric, digits first) or its layout. A computed name, or a
    // `proves`/`lock` written as a shorthand or spread, cannot be judged, so it fails the scan.
    const file = ts.createSourceFile('data.ts', src, ts.ScriptTarget.Latest, true);
    const asks: { key: string; lock: boolean }[] = [];
    const unjudged: string[] = [];
    const named = (p: ts.ObjectLiteralElementLike, name: string) => !!p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name;
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
        const props = node.initializer.properties;
        const proves = props.find((p) => named(p, 'proves'));
        const asks1 = !!proves && ts.isPropertyAssignment(proves) && ts.isIdentifier(proves.initializer) && proves.initializer.text === 'NOTHING_CHANGED';
        if (asks1) {
          if (ts.isComputedPropertyName(node.name)) unjudged.push(`computed name at ${node.getStart()}`);
          else asks.push({ key: node.name.text, lock: props.some((p) => named(p, 'lock')) });
          if (props.some((p) => ts.isSpreadAssignment(p) || ts.isShorthandPropertyAssignment(p))) unjudged.push(`${node.name.getText()}: spread or shorthand`);
        } else if (props.some((p) => ts.isShorthandPropertyAssignment(p) && (p.name.text === 'proves' || p.name.text === 'lock'))) {
          unjudged.push(`${node.name.getText()}: shorthand proves/lock`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(unjudged).toEqual([]);
    for (const e of asks) expect(e.lock, `${e.key} under a shared lock would not be s:scripts:${e.key}`).toBe(false);
    expect(asks.length).toBeGreaterThan(0);
    expect(new Set(asks.map((e) => `s:scripts:${e.key}`))).toEqual(SCRIPT_QUESTION_BASES);
    expect(asks).toHaveLength(SCRIPT_QUESTION_BASES.size);
  });
  it('a held or sending question is neither a line nor counted as being sent; a script change beside it still is', () => {
    const out = unresolvedLines([...[...SCRIPT_QUESTION_BASES].flatMap((b) => [row(b), row(b, false)]), scriptHeld(ember.id), row('s:scripts:remove'), row('s:scripts:write', false)], [emberRow], scripts.script);
    expect(out.held.map((l) => l.kind)).toEqual(['script', 'look']);
    expect(out.sending).toBe(1);
  });
  it('a base of another page that happens to share a question\'s key is still named', () => {
    expect(unresolvedLines([{ ...row('s:computers:settle'), page: 'computers' }], [emberRow], scripts.script).held.map((l) => l.kind)).toEqual(['page']);
  });
});
