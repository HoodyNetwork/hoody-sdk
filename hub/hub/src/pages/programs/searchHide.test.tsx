// Jump to leaves out Programs' places while the page asks for a computer: with no
// computer shown, or a stopped one, the view draws neither its tabs nor its questions. Read against the real deep
// index, and through the reader the shell loads (manifest searchHide) in the page's own context.
import { act, renderPage, screen } from '@app/testing';
import { chooseComputer, fixtureWorld } from '@core';
import { hidesTail } from '@kit';
import { DEEP } from 'virtual:hub-search-index';
import { describe, expect, it } from 'vitest';
import page from './page';
import useProgramsSearchHide, { programsHide } from './searchHide';

const mine = DEEP.filter((e) => e.page === 'programs');
const shown = (h: ReturnType<typeof programsHide>) => mine.filter((e) => !hidesTail(h, e.to));

describe('Programs in Jump to', () => {
  it('no computer shown, or a stopped one: none of its places', () => {
    expect(mine.length).toBeGreaterThan(3);
    expect(shown(programsHide({ data: null }))).toEqual([]);
    expect(shown(programsHide({ data: { running: false } }))).toEqual([]);
  });

  it('a running computer, or a computer list still read or not known: every place', () => {
    for (const c of [{ data: { running: true } }, { data: null, read: 'loading' as const }, { data: null, read: 'unknown' as const }]) {
      expect(programsHide(c), JSON.stringify(c)).toBeNull();
    }
  });

  const Probe = () => <output>{JSON.stringify(useProgramsSearchHide())}</output>;
  const probe = { ...page, load: async () => ({ default: Probe }) };
  const NONE = JSON.stringify({ only: [] });
  it('the reader: a running computer, then none shown, then a stopped one', async () => {
    const r = await renderPage(probe);
    expect(await screen.findByText('null', {}, { timeout: 8000 })).toBeInTheDocument();
    r.unmount();
    const r2 = await renderPage(probe, { computer: false });
    expect(await screen.findByText(NONE, {}, { timeout: 8000 })).toBeInTheDocument();
    r2.unmount();
    await renderPage(probe);
    const fjord = fixtureWorld.computers.find((c) => c.name === 'fjord');
    if (!fjord) throw new Error('no fjord');
    act(() => chooseComputer({ id: fjord.id, project_id: fjord.project_id, status: fjord.status }));
    expect(await screen.findByText(NONE, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
