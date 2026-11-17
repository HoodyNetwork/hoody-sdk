// A sub-section's description stands apart from its body on a tall terminal: one blank row, as the page header's.
// The row belongs to the body: a sub-section with no body (a title and a sentence over the sub-sections that follow)
// keeps none, so the next heading stays one row away, not two.
import type { ReactNode } from 'react';
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { Box, Text } from '@term/prim';
import { SubSection } from './Section';
import type { EmptyProof } from './types';

// Only core makes the proof of an empty list; a drawing test needs none of what it stands for.
const PROOF = {} as unknown as EmptyProof;

let s: PageSession | null = null;
let term: TestTerm | null = null;
afterEach(() => { s?.close(); s = null; term?.renderer.destroy(); term = null; });

/** The drawn rows from the first to the last that holds anything, blank rows kept. */
const rowsOf = (frame: string): string[] => {
  const rows = frame.split('\n').map((l) => l.trimEnd());
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  while (rows.length > 0 && rows[0] === '') rows.shift();
  return rows;
};

const draw = async (height: number, node: ReactNode): Promise<string[]> => {
  term = await drawTest(<Box dir="column" width={60}>{node}</Box>, { width: 60, height });
  await term.settle();
  return rowsOf(term.captureCharFrame());
};

test('120x80: Guide: one blank row between "Make the same call yourself"\'s description and its code', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 80, path: '/guide#build' });
  const lines = (await s.settle()).split('\n');
  const at = lines.findIndex((l) => l.includes('never the session token.'));
  expect(at).toBeGreaterThan(0);
  const col = lines[at]!.indexOf('never the session token.');
  expect(lines[at + 1]!.slice(col, col + 40).trim()).toBe('');
}, 240_000);

test('40 rows: a description and a body are one blank row apart', async () => {
  expect(await draw(40, <SubSection title="By model" description="What each model used."><Text>rows</Text></SubSection>))
    .toEqual(['By model', 'What each model used.', '', 'rows']);
}, 60_000);

test('40 rows: a sub-section with no body adds no row: the next heading is one blank row under its description', async () => {
  // The Network drawer's "Change the exit" tab: a title and a sentence, then the ways as sub-sections of their own.
  expect(await draw(40, <>
    <SubSection title="Other ways to change the exit" description="There are three." />
    <SubSection title="Through a proxy" description="Set it as the exit."><Text>curl</Text></SubSection>
  </>)).toEqual(['Other ways to change the exit', 'There are three.', '', 'Through a proxy', 'Set it as the exit.', '', 'curl']);
}, 60_000);

test('a body that is only a state (empty) stands one row lower at 40 rows than at 24', async () => {
  // No children, but the kit draws the body: the row is spent as for any other body.
  const at = async (height: number): Promise<number> => {
    const rows = await draw(height, <SubSection title="By model" description="What each model used." state={{ kind: 'empty', proof: PROOF }} empty={{ title: 'Nothing used yet', body: 'Usage shows here.', action: 'none' }} />);
    term?.renderer.destroy(); term = null;
    expect(rows.slice(0, 2)).toEqual(['By model', 'What each model used.']);
    return rows.findIndex((l) => l.includes('Nothing used yet'));
  };
  const short = await at(24);
  expect(short).toBeGreaterThan(1);
  expect(await at(40)).toBe(short + 1);
}, 60_000);

test('24 rows: no blank row is spent under a description', async () => {
  expect(await draw(24, <SubSection title="By model" description="What each model used."><Text>rows</Text></SubSection>))
    .toEqual(['By model', 'What each model used.', 'rows']);
}, 60_000);
