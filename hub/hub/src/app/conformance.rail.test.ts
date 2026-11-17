// @vitest-environment node
// The one left rail, by its sources: one set of numbers, one seam. The geometry itself is measured in a browser
// (kit/layouts/railgrid.spec.ts); these catch a page that forks the seam, which a screenshot of today's pages cannot.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(SRC, p), 'utf8');

describe('the rail seam', () => {
  it('holds the grid in three tokens: pad 12, lead 16, gap 8, so the text edge is 36', () => {
    const t = read('kit/tokens.css');
    expect(t).toMatch(/--rail-pad: var\(--sp-3\);/);
    expect(t).toMatch(/--rail-lead: var\(--sp-4\);/);
    expect(t).toMatch(/--rail-gap: var\(--sp-2\);/);
  });

  it('draws the AI rail through the kit: RailPane and the one handle, no relative reach into the kit', () => {
    const pane = read('pages/ai/parts/Pane.tsx');
    expect(pane).toMatch(/<RailPane\b/);
    expect(pane).toMatch(/<PaneSeparator\b/);
    expect(pane).toMatch(/usePaneWidth\('ai', 'list', RAIL\)/);
    expect(pane).not.toMatch(/kit\/layouts\//);
  });

  it('gives every rail the same width range', () => {
    expect(read('pages/ai/parts/Pane.pure.ts')).toMatch(/const RAIL: PaneRange = \{ min: 280, max: 560, def: 340 \};/);
    const ldp = read('kit/layouts/ListDetailPage.tsx');
    expect(ldp).toMatch(/const LIST_MIN = 280;/);
    expect(ldp).toMatch(/const LIST_MAX = 560;/);
    expect(ldp).toMatch(/listWidth = 340/);
  });

  it('keeps the conversation frame on the same width, with its own old value only where no rail set one', () => {
    const css = read('kit/agent/SplitLayout.module.css');
    expect(css).toMatch(/width: var\(--rail-width, 288px\);/);
    expect(css).toMatch(/width: var\(--rail-width, 304px\);/);
  });

  it('does not put a second frame in the rail: RailPane asks the table for none', () => {
    expect(read('kit/layouts/RailPane.tsx')).toMatch(/flush: true/);
    expect(read('kit/data/DataTable.tsx')).toMatch(/!bare && !pane\.flush && s\.framed/);
  });
});

describe('rail pages keep the seam', () => {
  const RAIL_PAGES = ['pages/bots/view.tsx', 'pages/computers/parts/ComputersList.tsx', 'pages/support/view.tsx', 'pages/vault/view.tsx', 'pages/ai/parts/Pane.tsx'];
  const RAIL_CSS = ['pages/bots/parts/pane.module.css', 'pages/ai/parts/Pane.module.css'];

  it('sets no width on the rail from a page stylesheet: the frame owns --rail-width', () => {
    for (const f of RAIL_CSS) expect(read(f), f).not.toMatch(/--rail-width\s*:|--ai-pane-w|--list-width\s*:/);
  });

  it('draws no separator of its own: role="separator" with a value lives in kit/layouts/PaneSeparator only', () => {
    for (const f of RAIL_PAGES) expect(read(f), f).not.toMatch(/role="separator"|aria-valuenow/);
    expect(read('kit/layouts/PaneSeparator.tsx')).toMatch(/role="separator"/);
  });

  it("puts each Bots computer's notes in its own group's note row; the group row holds no `extra`: its paused count joins its count words", () => {
    const v = read('pages/bots/view.tsx');
    expect(v.match(/\bextra\s*[:=]/g)).toBeNull();
    expect(v).toMatch(/c && c\.suspended > 0 \? t\('group\.paused', \{ count: c\.suspended \}\) : ''\]\.filter\(Boolean\)\.join\(' · '\)/);
    expect(v).toMatch(/note: <ComputerNotes computer=\{c\} named=\{false\}/);
    // The stack above the table keeps only what has no group: a single computer's notes, or a list with no Bots.
    // ...unless the table shows no rows (a search or filter matched no Bot): then the notes stay above it, named.
    expect(v).toMatch(/computers=\{grouped && bots\.length > 0 && view\.matched > 0 \? \[\] : computers\}/);
    expect(v).toMatch(/toolbarNote=\{bots\.length > 0 \? notices : undefined\}/);
  });

  it('caps any notice stack in a rail, whatever draws it, and fork notices come flush there', () => {
    expect(read('kit/data/DataTable.module.css')).toMatch(/\.rail \.toolbarNote \{\s*max-block-size: 30dvh;\s*overflow-y: auto;/);
    expect(read('kit/agent/ForkPending.tsx')).toMatch(/const flush = Boolean\(useListPane\(\)\.rail\);/);
  });

  // A list row's ⋯ has ONE look, the plain ghost dots, in a rail or not, selected or
  // not. The old rail rule (quiet at rest, boxed on hover or selection) is gone and must not come back.
  it('a rail row draws no ⋯ box of its own: the plain dots everywhere', () => {
    expect(read('kit/data/DataTable.module.css')).not.toMatch(/\.rail \.tr:not\(:hover, :focus-within, \.selected, \.active,/);
  });

  it('reads the region height the frame sets, under its one name', () => {
    expect(read('kit/layouts/RailPane.tsx')).toMatch(/'--rail-region-h'/);
    expect(read('pages/ai/parts/Conversation.module.css')).toMatch(/var\(--rail-region-h, 100dvh\)/);
  });

  it('asks for no questions beside a detail in fill mode, unless the address targets one', () => {
    expect(read('kit/layouts/ListDetailPage.tsx')).toMatch(/const faqShown = faq && \(mode !== 'fill' \|\| !hasDetail \|\| isFaqHash\(hash\)\);/);
  });
});
