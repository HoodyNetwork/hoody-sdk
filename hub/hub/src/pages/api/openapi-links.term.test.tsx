// The Overview's OpenAPI description in a terminal: the two files' pages on GitHub show their whole address (as the
// page's Links section shows its addresses), and the two raw addresses (what an importer takes by URL) are drawn whole as copyable lines, before
// the package commands.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const GITHUB = ['https://github.com/HoodyNetwork/hoody-sdk/blob/main/generated/openapi.public.json', 'https://github.com/HoodyNetwork/hoody-sdk/blob/main/generated/openapi.public.yaml'];
const RAW = ['https://raw.githubusercontent.com/HoodyNetwork/hoody-sdk/main/generated/openapi.public.json', 'https://raw.githubusercontent.com/HoodyNetwork/hoody-sdk/main/generated/openapi.public.yaml'];

test('Overview: the GitHub pages show their address, the raw addresses are drawn whole, then the package commands', async () => {
  s = await renderPage({ page: 'api', path: '/api?view=overview', cols: 200, rows: 70 });
  const frame = await s.settle();
  const rows = frame.split('\n');
  const at = (text: string): number => rows.findIndex((r) => r.includes(text));
  expect(at(strings['spec.title'])).toBeGreaterThan(-1);
  expect(frame).toContain('is in the hoody-sdk repository on GitHub and on npm');
  expect(at(strings['spec.github.json'])).toBeGreaterThan(at(strings['spec.title']));
  expect(at(strings['spec.github.yaml'])).toBeGreaterThan(at(strings['spec.github.json']));
  for (const u of GITHUB) expect(at(u)).toBeGreaterThan(at(strings['spec.title']));
  expect(at(strings['spec.raw'])).toBeGreaterThan(at(GITHUB[1]!));
  for (const u of RAW) expect(at(u)).toBeGreaterThan(at(strings['spec.raw']));
  expect(at(strings['spec.pkg'])).toBeGreaterThan(at(RAW[1]!));
  expect(at('npm install hoody-sdk')).toBeGreaterThan(at(strings['spec.pkg']));
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
