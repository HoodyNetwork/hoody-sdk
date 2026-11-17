// A disabled Make a link always shows why, one line below it, with a way out where one
// exists. One answer (parts/share.ts shareWhy) feeds the button, the dialog's send and each link's switch and remove.
import { fireEvent, render, screen, userEvent } from '@app/testing';
import { SourceError } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shareWhy, shareWhyKey } from './parts/share';
import { OverviewTab } from './parts/OverviewTab';
import type * as Ops from './parts/ops';
import strings from './strings.en.json';
import KS from '@kit/states/strings.en.json';

const lock = vi.hoisted(() => ({ on: false }));
vi.mock('./parts/ops', async (orig) => {
  const real = await orig<typeof Ops>();
  return { ...real, useChange: (...a: Parameters<typeof real.useChange>) => ({ ...real.useChange(...a), ...(lock.on ? { locked: true } : {}) }) };
});
const idle = () => ({ mutateAsync: async () => ({ data: null }), isPending: false, pending: false, held: () => [], readBack: async () => false, dismissHeld: () => undefined, holdOf: async () => undefined });
vi.mock('./data', () => ({
  useUsage: () => ({ data: undefined, isPending: true, isError: false, refetch: async () => undefined }),
  useFailures: () => ({ data: undefined, isPending: true, isError: false, refetch: async () => undefined }),
  useAliasState: () => idle(),
  useAliasCreate: () => idle(),
  useAliasRemove: () => idle(),
  useAliasHeldElsewhere: () => null,
  useScriptsTarget: () => null,
  useSettle: () => ({ mutateAsync: async () => ({ data: null }), readBack: async () => false, holdOf: async () => undefined, isPending: false }),
}));

const S = strings as Record<string, string>;
const base = { id: 'atlas.1111~default/1/a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' };
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [], summary: {}, aliases: [], deleted: [] };
const link = { id: 'al1', url: 'https://x.example/a', target_path: '/a', enabled: true, created_at: '2026-11-10T00:00:00Z' };

beforeEach(() => { lock.on = false; });

describe('shareWhy: one reason per block, in a fixed order', () => {
  const unknown = { ...base, ownershipUnknown: true };
  it('names each block', () => {
    expect(shareWhy(base, {}, false)).toBeNull();
    expect(shareWhy({ ...base, path: 'notes.txt', route: '' }, {}, false)).toEqual({ k: 'noAddress' });
    expect(shareWhy({ ...base, path: 'default/1/[id].ts', route: '/[id]' }, {}, false)).toEqual({ k: 'dynamic' });
    expect(shareWhy({ ...base, managed: { template: 'web-form', elsewhere: false } }, {}, false)).toEqual({ k: 'managed', template: 'web-form' });
    expect(shareWhy(unknown, {}, false)).toEqual({ k: 'ownerReading' });
    expect(shareWhy(unknown, { ownerRead: { k: 'reading' } }, false)).toEqual({ k: 'ownerReading' });
    for (const kind of ['network', 'forbidden', 'not_found'] as const) expect(shareWhy(unknown, { ownerRead: { k: 'failed', kind, error: null } }, false)).toEqual({ k: 'ownerFailed', kind, error: null });
    expect(shareWhy(unknown, { ownerRead: { k: 'failed', kind: 'server', error: null } }, false)).toEqual({ k: 'ownerFailed', kind: 'other', error: null });
    // The agent's ownership_unknown (a realm of the computer not in use yet) is its own plain line.
    const cold = new SourceError('server', 'ownership_unknown', 503);
    expect(shareWhy(unknown, { ownerRead: { k: 'failed', kind: 'server', error: cold } }, false)).toEqual({ k: 'ownerFailed', kind: 'notOpen', error: cold });
    expect(shareWhy(unknown, { ownerRead: { k: 'failed', kind: 'server', error: new SourceError('server', 'internal', 500) } }, false)).toMatchObject({ kind: 'other' });
    expect(shareWhy(base, {}, true)).toEqual({ k: 'waiting' });
  });
  it('the links\' own actions skip the address reasons, never the others', () => {
    expect(shareWhy({ ...base, path: 'default/1/[id].ts', route: '/[id]' }, {}, false, true)).toBeNull();
    expect(shareWhy({ ...base, path: 'notes.txt', route: '' }, {}, false, true)).toBeNull();
    expect(shareWhy(unknown, {}, false, true)).toEqual({ k: 'ownerReading' });
    expect(shareWhy(base, {}, true, true)).toEqual({ k: 'waiting' });
  });
  it('every reason has its line in the strings', () => {
    const all = [{ k: 'noAddress' }, { k: 'dynamic' }, { k: 'managed', template: 't' }, { k: 'ownerReading' }, { k: 'waiting' }, ...(['network', 'forbidden', 'not_found', 'signedOut', 'rejected', 'noHost', 'notOpen', 'other'] as const).map((kind) => ({ k: 'ownerFailed', kind, error: null }))] as const;
    for (const w of all) expect(S[shareWhyKey(w as never)], w.k).toBeTruthy();
  });
});

const make = () => screen.getByRole('button', { name: S['share.make'] });
const REASONS = Object.entries(S).filter(([k]) => k.startsWith('share.why.')).map(([, v]) => v.replace(/\{\{\w+\}\}.*$/s, ''));
/** The reason line shown, or null: any share.why line's text (up to its first value) on the page. */
const why = (container: HTMLElement) => REASONS.find((r) => r && container.textContent?.includes(r)) ?? null;

describe('the Overview shows why Make a link is off', () => {
  it('no reason and an enabled button when nothing blocks', async () => {
    const { container } = render(<OverviewTab item={base as never} comp={comp as never} onChanged={() => undefined} />);
    expect(await screen.findByRole('button', { name: S['share.make'] })).toBeTruthy();
    expect(make().hasAttribute('disabled') || make().getAttribute('aria-disabled') === 'true').toBe(false);
    expect(why(container)).toBeNull();
  });

  const cases: { name: string; item?: object; comp?: object; locked?: boolean; text: () => string; check: boolean }[] = [
    { name: 'ownership still reading', item: { ownershipUnknown: true }, comp: { instances: null, ownerRead: { k: 'reading' } }, text: () => S['share.why.ownerReading']!, check: true },
    { name: 'agent did not answer', item: { ownershipUnknown: true }, comp: { instances: null, ownerRead: { k: 'failed', kind: 'network', error: { kind: 'network' } } }, text: () => S['share.why.ownerFailed.network']!.replace('{{computer}}', 'atlas'), check: true },
    { name: 'agent has no ownership read', item: { ownershipUnknown: true }, comp: { instances: null, ownerRead: { k: 'failed', kind: 'not_found', error: { kind: 'not_found' } } }, text: () => S['share.why.ownerFailed.not_found']!.replace('{{computer}}', 'atlas'), check: true },
    { name: 'agent had an error', item: { ownershipUnknown: true }, comp: { instances: null, ownerRead: { k: 'failed', kind: 'server', error: { kind: 'server' } } }, text: () => S['share.why.ownerFailed.other']!.replace('{{computer}}', 'atlas'), check: true },
    { name: 'made from an idea', item: { managed: { template: 'web-form', elsewhere: false } }, text: () => S['share.why.managed']!.replace('{{template}}', 'web-form'), check: false },
    { name: 'not a script address', item: { path: 'notes.txt', route: '' }, text: () => S['share.why.noAddress']!, check: false },
    { name: 'a link change is open', locked: true, text: () => S['share.why.waiting']!, check: false },
  ];
  for (const c of cases) {
    it(`${c.name}: the button is off and the line says why`, async () => {
      lock.on = !!c.locked;
      const onChanged = vi.fn();
      const { container } = render(<OverviewTab item={{ ...base, ...c.item } as never} comp={{ ...comp, ...c.comp } as never} onChanged={onChanged} />);
      await screen.findByRole('button', { name: S['share.make'] });
      expect(make().hasAttribute('disabled') || make().getAttribute('aria-disabled') === 'true').toBe(true);
      expect(why(container)).not.toBeNull();
      expect(container.textContent).toContain(c.text());
      const again = screen.queryByRole('button', { name: S['share.check'] });
      expect(!!again).toBe(c.check);
      if (again) {
        fireEvent.click(again);
        expect(onChanged).toHaveBeenCalledTimes(1);
      }
    });
  }

  it('a dynamic address with no link keeps its one empty-state line, not a second one', async () => {
    const { container } = render(<OverviewTab item={{ ...base, path: 'default/1/[id].ts', route: '/[id]' } as never} comp={comp as never} onChanged={() => undefined} />);
    await screen.findByRole('button', { name: S['share.make'] });
    expect(why(container)).toBeNull();
    expect(screen.getByText(S['share.dynamic']!)).toBeTruthy();
  });

  it('an existing link\'s switch and remove are off, with the same reason, while ownership is unknown', async () => {
    const { container } = render(<OverviewTab item={{ ...base, ownershipUnknown: true } as never} comp={{ ...comp, instances: null, ownerRead: { k: 'reading' }, aliases: [link] } as never} onChanged={() => undefined} />);
    const remove = await screen.findByRole('button', { name: S['share.remove'] });
    expect(remove.hasAttribute('disabled') || remove.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(container.textContent).toContain(S['share.why.ownerReading']);
  });

  it('overlapping blocks: a dynamic address with a link and unknown ownership shows both reasons, and Check again', async () => {
    const onChanged = vi.fn();
    const { container } = render(<OverviewTab item={{ ...base, path: 'default/1/[id].ts', route: '/[id]', ownershipUnknown: true } as never} comp={{ ...comp, instances: null, ownerRead: { k: 'failed', kind: 'network' }, aliases: [{ ...link, target_path: '/42' }] } as never} onChanged={onChanged} />);
    await screen.findByRole('button', { name: S['share.make'] });
    expect(container.textContent).toContain(S['share.dynamic']);
    expect(container.textContent).toContain(S['share.why.ownerFailed.network']!.replace('{{computer}}', 'atlas'));
    fireEvent.click(screen.getByRole('button', { name: S['share.check'] }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('a failed ownership read offers the rejection\'s Details (conformance.errors E1); a still-going read does not', async () => {
    const a = render(<OverviewTab item={{ ...base, ownershipUnknown: true } as never} comp={{ ...comp, instances: null, ownerRead: { k: 'failed', kind: 'network', error: { kind: 'network', status: 0 } } } as never} onChanged={() => undefined} />);
    await screen.findByRole('button', { name: S['share.make'] });
    expect(screen.getByRole('button', { name: KS['err.details'] })).toBeTruthy();
    a.unmount();
    render(<OverviewTab item={{ ...base, ownershipUnknown: true } as never} comp={{ ...comp, instances: null, ownerRead: { k: 'reading' } } as never} onChanged={() => undefined} />);
    await screen.findByRole('button', { name: S['share.make'] });
    expect(screen.queryByRole('button', { name: KS['err.details'] })).toBeNull();
  });

  it('a list the signed-in agent could not open says so plainly, offers Check again, and its Details show the agent\'s code', async () => {
    const onChanged = vi.fn();
    const cold = new SourceError('server', 'ownership_unknown', 503);
    const { container } = render(<OverviewTab item={{ ...base, ownershipUnknown: true } as never} comp={{ ...comp, instances: null, ownerRead: { k: 'failed', kind: 'server', error: cold } } as never} onChanged={onChanged} />);
    await screen.findByRole('button', { name: S['share.make'] });
    expect(container.textContent).toContain(S['share.why.ownerFailed.noHost']!.replace('{{computer}}', 'atlas'));
    expect(container.textContent).not.toMatch(/owns this script/);
    fireEvent.click(screen.getByRole('button', { name: S['share.check'] }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: KS['err.details'] }));
    expect(document.body.textContent).toContain('ownership_unknown');
  });

  it('no reason line speaks of an owner: each says what is checked', () => {
    for (const [k, v] of Object.entries(S)) if (k.startsWith('share.why.owner')) expect(v, k).not.toMatch(/\bowns?\b|\bowner/i);
  });

  // The agent answers ownership_unknown for more than a realm not in use, and a network error
  // can follow an answer whose body was lost, so neither line asserts its cause or when it clears (it never clears by itself: owner.held.test.tsx).
  it('the lines claim no more than the code proves: no sure cause for ownership_unknown, no "no answer" for a network error', () => {
    expect(S['share.why.ownerFailed.notOpen']).not.toMatch(/opens once|hasn't opened|will open/i);
    expect(S['share.why.ownerFailed.notOpen']).toMatch(/Check again/);
    expect(S['share.why.ownerFailed.network']).not.toMatch(/no answer/i);
  });

  it('one reason that blocks both is shown once', async () => {
    const { container } = render(<OverviewTab item={{ ...base, ownershipUnknown: true } as never} comp={{ ...comp, instances: null, ownerRead: { k: 'reading' }, aliases: [link] } as never} onChanged={() => undefined} />);
    await screen.findByRole('button', { name: S['share.make'] });
    expect(container.textContent!.split(S['share.why.ownerReading']!).length - 1).toBe(1);
    expect(screen.getAllByRole('button', { name: S['share.check'] })).toHaveLength(1);
  });
});
