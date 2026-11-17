// Vitest: Home claims no progress it did not read. The setup panel lists what setup does without marking any stage
// done or in progress, a milestone whose read failed says "Could not check" (never "Checking"), and the strings file
// holds no word that nothing draws.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderPage, screen, within } from '@app/testing';
import { stepsFrom } from './logic';
import page from './page';
import { FirstStepsBody } from './parts/FirstSteps';
import strings from './strings.en.json';
import './testWaits';

// The setup panel's 'provisioning', forced as home.states.test does (no fixture read answers it today).
const forced = vi.hoisted(() => ({ provisioning: false }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const real = core.useSetupState as (o?: { enabled?: boolean }) => { data?: unknown };
  return { ...core, useSetupState: (o?: { enabled?: boolean }) => { const r = real(o); return forced.provisioning && r.data ? { ...r, data: { kind: 'provisioning' } } : r; } };
});
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, usePageLink: (id: string) => ({ kind: 'hub', href: `/${id}` }) };
});
afterEach(() => {
  forced.provisioning = false;
});

describe('home: the setup panel', () => {
  it('lists the three stages in order and marks none of them done, in progress or next', async () => {
    forced.provisioning = true;
    await renderPage(page, { state: 'provisioning', realm: 'all' });
    await screen.findByText(strings['setup.provisioning.title']);
    const list = screen.getByText(strings['setup.step.reserve']).closest('ol')!;
    const items = within(list).getAllByRole('listitem');
    // The numbers are the style sheet's (a list counter on an empty, hidden mark): the words are the whole text.
    expect(items.map((li) => li.textContent)).toEqual([strings['setup.step.reserve'], strings['setup.step.create'], strings['setup.step.start']]);
    for (const li of items) {
      expect(li.getAttribute('data-state')).toBeNull();
      expect(li.querySelector('svg')).toBeNull();
      expect(li.querySelector('[aria-hidden="true"]')?.textContent).toBe('');
    }
    const words = strings as Record<string, string>;
    for (const gone of ['setup.step.done', 'setup.step.now', 'setup.step.next', 'setup.step.stuck']) expect(words[gone], gone).toBeUndefined();
  });
});

describe('home: first steps', () => {
  it('a milestone whose read failed is unknown and says so; one still being read says Checking', () => {
    expect(stepsFrom({ computer: true, key: null }, { key: true })).toEqual([
      { id: 'computer', done: true, unknown: false },
      { id: 'key', done: false, unknown: true, failed: true },
    ]);
    expect(stepsFrom({ computer: true, key: null })[1]).toEqual({ id: 'key', done: false, unknown: true });
    // A fact that is known is never "failed", whatever the last read did.
    expect(stepsFrom({ computer: true, key: true }, { key: true })[1]).toEqual({ id: 'key', done: true, unknown: false });
  });

  it('the row of a failed read shows "Could not check", not "Checking"', () => {
    render(<FirstStepsBody steps={stepsFrom({ computer: true, key: null }, { key: true })} tries={[]} />);
    expect(screen.getByText(strings['steps.unread'])).toBeVisible();
    expect(strings['steps.unread']).toBe('Could not check');
    expect(screen.queryByText(strings['steps.checking'])).toBeNull();
  });
});

describe('home: strings', () => {
  it('holds no key that nothing draws', () => {
    const words = strings as Record<string, string>;
    const gone = ['context.label', 'context.none', 'action.retryNow', 'action.openLastAgent', 'action.viewAll', 'action.viewAllOf', 'pick.state.running', 'pick.state.stopped', 'widget.loading', 'context.realm', 'context.computer', 'context.server', 'widget.refreshing', 'widget.count', 'steps.allDone'];
    for (const key of gone) expect(words[key], key).toBeUndefined();
  });
});
