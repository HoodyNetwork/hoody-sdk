// Vitest: the Upload dialog belongs to the computer it was opened on. When the pane shows another computer (Back,
// Forward), the dialog closes, and Forward back to the first computer does not bring it back: nothing is sent to
// either computer.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetFiles, sentChanges } from './fixtures';
import { resetUploads } from './uploadRun';
import page from './page';
import strings from './strings.en.json';
import us from './Upload.strings.en.json';

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));
// The page's first render waits up to 30 s: on a busy machine it can take longer than the 5 s default.
const FIRST = { timeout: 30_000 } as const;
const pane = () => screen.findByRole('region', { name: strings['pane.a'] }, FIRST);
const table = async (name: string) => within(await pane()).findByRole('table', { name: fill(strings['table.label'], { name }) }, FIRST);
const txt = (name: string, body = 'abc') => new File([body], name, { type: 'text/plain' });
const uploads = () => sentChanges.filter((x) => x.startsWith('upload:'));
const GRANITE = '/files?a=granite.0107&ap=%2F';
// atlas's /home/ada holds files, so its table is drawn (an empty folder such as atlas's /tmp shows the empty state, no table).
const ATLAS_ADA = `/files?a=atlas.00a1&ap=${encodeURIComponent('/home/ada')}`;
const ATLAS_TMP = `/files?a=atlas.00a1&ap=${encodeURIComponent('/tmp')}`;

// The page's view loads lazily: load it once up front, so the case's waits are not spent on that load.
beforeAll(async () => {
  await import('./view');
}, 120_000);
beforeEach(() => { resetFiles(); resetUploads(); });

describe('Upload: the computer it was opened on', () => {
  it('Back to another computer closes the plan; Forward does not reopen it; nothing is uploaded', async () => {
    const { router } = await renderPage(page, { realm: 'all', path: GRANITE });
    await table('granite');
    act(() => router.history.push(ATLAS_ADA));
    await table('atlas');
    const p = await pane();
    await waitFor(() => expect(within(p).getByRole('button', { name: us['action.upload'] })).not.toHaveAttribute('aria-disabled', 'true'));
    await userEvent.upload(within(p).getByLabelText(us['pick.label']) as HTMLInputElement, [txt('a.txt')]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    act(() => router.history.back());
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'granite.0107' }));
    await table('granite');
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => router.history.forward());
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', ap: '/home/ada' }));
    await table('atlas');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(uploads()).toEqual([]);
  }, 60_000);

  it('the same computer keeps the plan open while its folder listing refreshes', async () => {
    await renderPage(page, { realm: 'all', path: ATLAS_TMP });
    const p = await pane();
    await waitFor(() => expect(within(p).getByRole('button', { name: us['action.upload'] })).not.toHaveAttribute('aria-disabled', 'true'), FIRST);
    await userEvent.upload(within(p).getByLabelText(us['pick.label']) as HTMLInputElement, [txt('b.txt')]);
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: fill(us.primary_one, { count: 1 }) }));
    await waitFor(() => expect(uploads()).toEqual(['upload:/tmp/b.txt']));
    expect(screen.getByRole('dialog')).toBe(d);
  }, 60_000);
});
