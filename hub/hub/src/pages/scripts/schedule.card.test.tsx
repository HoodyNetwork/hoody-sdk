// Vitest: the Overview's Schedule card is always shown, says the schedule in words and as written
// (UTC) with its next runs as calculated here, and its one button opens Settings at the schedule field, off with a reason when
// the schedule can't be changed. The schedule field itself is the kit's ScheduleField (kit/forms/ScheduleField.test.tsx).
import { render, screen } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OverviewTab, schedWhy } from './parts/OverviewTab';
import strings from './strings.en.json';

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

const NOW = Date.UTC(2026, 10, 10, 7, 30);
const item = (o: object = {}) => ({ id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok', ...o }) as never;
const comp = (o: object = {}) => ({ id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [], summary: {}, aliases: [], deleted: [], ...o }) as never;
const card = (o: { it?: object; comp?: object; onSet?: () => void } = {}) =>
  render(<OverviewTab item={item(o.it)} comp={comp(o.comp)} onChanged={() => undefined} onSetSchedule={o.onSet ?? (() => undefined)} now={NOW} />);

describe('the Overview Schedule card', () => {
  it('with no schedule: the card still shows, says so, and offers Set schedule, which opens Settings', async () => {
    const onSet = vi.fn();
    card({ onSet });
    expect(await screen.findByText(strings['overview.schedNone'])).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: strings['overview.schedSet'] }));
    expect(onSet).toHaveBeenCalledTimes(1);
  });

  it('with no schedule the card is not an empty box: "Runs" says it runs only when called', async () => {
    card();
    const runs = await screen.findByText(strings['overview.schedWhen']);
    expect(runs.closest('section')?.textContent).toContain(strings['overview.schedNone']);
    expect(screen.getAllByText(strings['overview.schedNone'])).toHaveLength(1);
  });

  it('with a preset: words, the expression with UTC, the next runs as calculated, and Change schedule', async () => {
    const { container } = card({ it: { schedule: '0 8 * * *' } });
    expect(await screen.findByRole('button', { name: strings['overview.schedChange'] })).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toContain(strings['sched.daily']);
    expect(text).toContain(strings['overview.schedExprValue'].replace('{{cron}}', '0 8 * * *'));
    expect(text).toContain(strings['overview.schedNextValue'].replace('{{runs}}', ['2026-11-10 08:00', '2026-11-11 08:00', '2026-11-12 08:00'].join(' · ')));
  });

  it('an expression the Hub cannot name or calculate is shown as written, and says the runs are not calculated', async () => {
    const { container } = card({ it: { schedule: '@daily' } });
    await screen.findByRole('button', { name: strings['overview.schedChange'] });
    expect(container.textContent).toContain('@daily');
    expect(container.textContent).toContain(strings['pick.noCalc']);
  });

  it('the button is off, with the reason, when the schedule cannot be changed here', async () => {
    for (const [o, key] of [
      [{ comp: { state: 'off' } }, 'overview.schedWhy.off'],
      [{ comp: { caps: { revisions: false } } }, 'overview.schedWhy.old'],
      [{ it: { ownershipUnknown: true } }, 'overview.schedWhy.unknown'],
      [{ comp: { instances: null } }, 'overview.schedWhy.unknown'],
      [{ it: { managed: { template: 'Digest', elsewhere: false } } }, 'overview.schedWhy.managed'],
    ] as const) {
      const onSet = vi.fn();
      const r = card({ ...o, onSet });
      const b = await screen.findByRole('button', { name: strings['overview.schedSet'] });
      expect(b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true').toBe(true);
      expect(r.container.textContent).toContain(strings[key].replace('{{computer}}', 'atlas').replace('{{template}}', 'Digest'));
      await userEvent.click(b);
      expect(onSet).not.toHaveBeenCalled();
      r.unmount();
    }
  });

  it('the schedule action is not a second accent: the page keeps its one primary', async () => {
    const { container } = card({ it: { schedule: '0 8 * * *' } });
    const b = await screen.findByRole('button', { name: strings['overview.schedChange'] });
    expect(b.getAttribute('data-variant')).toBe('secondary');
    expect(container.querySelector('#script-schedule [data-variant="primary"], section [data-variant="primary"]')).toBeNull();
  });

  it('schedWhy: null when it can be changed', () => {
    expect(schedWhy(item() as never, comp() as never)).toBeNull();
  });

  it('no button where the page gives no way to Settings', async () => {
    render(<OverviewTab item={item({ schedule: '0 8 * * *' })} comp={comp()} onChanged={() => undefined} now={NOW} />);
    await screen.findByText(strings['overview.schedExprValue'].replace('{{cron}}', '0 8 * * *'));
    expect(screen.queryByRole('button', { name: strings['overview.schedChange'] })).toBeNull();
  });
});

// Run now on the card is off, with the reason, where nothing may be sent (the page tests: schedule.run.test.tsx).
describe('Run now off on the card', () => {
  it('a script with a caller key, or an off computer: Run now stays off with its reason and opens nothing', async () => {
    for (const [o, key] of [
      [{ it: { keyed: true } }, 'overview.runWhy.keyed'],
      [{ comp: { state: 'off' } }, 'overview.runWhy.off'],
    ] as const) {
      const onRun = vi.fn();
      const { unmount } = render(<OverviewTab item={item({ schedule: '0 8 * * *', ...('it' in o ? o.it : {}) })} comp={comp('comp' in o ? o.comp : {})} onChanged={() => undefined} onSetSchedule={() => undefined} onRunNow={onRun} />);
      const b = await screen.findByRole('button', { name: new RegExp(`^${strings['menu.run']}`) });
      await userEvent.click(b);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(onRun).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain(strings[key].replace('{{computer}}', 'atlas'));
      unmount();
    }
  });

  // The confirm checks again when it is pressed: what changed while it was open keeps it off, saying why.
  it('the confirm, open while the computer turns off or the schedule goes, stays off with the reason and runs nothing', async () => {
    for (const [o, key] of [
      [{ comp: { state: 'off' } }, 'overview.runWhy.off'],
      [{ it: { schedule: null } }, 'overview.runWhy.gone'],
      [{ it: { keyed: true } }, 'overview.runWhy.keyed'],
      [{ shown: false }, 'overview.runWhy.elsewhere'],
    ] as const) {
      const onRun = vi.fn();
      const props = (x: object = {}) => ({ item: item({ schedule: '0 8 * * *', ...('it' in x ? (x as { it: object }).it : {}) }), comp: comp('comp' in x ? (x as { comp: object }).comp : {}), runShown: 'shown' in x ? (x as { shown: boolean }).shown : true, onChanged: () => undefined, onSetSchedule: () => undefined, onRunNow: onRun });
      const { rerender, unmount } = render(<OverviewTab {...props()} />);
      await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${strings['menu.run']}`) }));
      const dialog = await screen.findByRole('alertdialog');
      rerender(<OverviewTab {...props(o)} />);
      expect(dialog.textContent).toContain(strings[key].replace('{{computer}}', 'atlas'));
      const b = screen.getAllByRole('button', { name: strings['menu.run'] }).find((x) => dialog.contains(x)) as HTMLButtonElement;
      await userEvent.click(b);
      expect(onRun).not.toHaveBeenCalled();
      unmount();
    }
  });
});
