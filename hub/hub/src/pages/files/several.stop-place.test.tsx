// Vitest, copying several items: while it runs, "Stop after this one" sits above the item list (a list of up to 100
// rows would otherwise push it out of sight while the dialog is busy).
import { beforeAll, beforeEach, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetFiles } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const enc = encodeURIComponent;
const two = (ap: string, bp: string, state?: string, b = 'atlas.00a1') => ({ path: `/files?a=atlas.00a1&ap=${enc(ap)}&b=${b}&bp=${enc(bp)}`, ...(state ? { state } : {}) });
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const paneA = () => screen.findByRole('region', { name: strings['pane.a'] });
const table = async () => within(await paneA()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });

beforeAll(async () => {
  await import('./view');
}, 120_000);
beforeEach(() => resetFiles());

it('Stop after this one comes before the item list while sending', async () => {
  await renderPage(page, two('/home/ada', '/tmp', 'firstSlow'));
  for (const n of [/notes\.txt/, /report\.pdf/]) await userEvent.click(within(await row(n)).getByRole('checkbox'));
  await userEvent.click(within(await paneA()).getByRole('button', { name: ts['action.copySelected'] }));
  const d = await screen.findByRole('dialog');
  const go = within(d).getByRole('button', { name: ts['copy.primary'] });
  await waitFor(() => expect(go).toBeEnabled());
  await userEvent.click(go);
  const stop = await within(d).findByRole('button', { name: ts['several.stop'] });
  const list = within(d).getByRole('list', { name: ts['several.listLabel'] });
  expect(stop.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
