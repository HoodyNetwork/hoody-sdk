// Vitest: Home says only what it read. A computer still being made is "Starting" (never "Stopped", never one that
// "needs a look"), each state has its own word on the context line, the setup age line claims no start time, and the
// two bare empty states say what to do next.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor } from '@app/testing';
import { contextState, homeState, needsItems } from './logic';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, usePageLink: (id: string) => ({ kind: 'hub', href: `/${id}` }) };
});

describe('home: the shown computer\'s state', () => {
  it('a computer being made is starting, as the Computers page says; other statuses keep their bucket', () => {
    for (const s of ['creating', 'claiming', 'copying', 'provisioning', 'pending', 'starting', 'restarting']) expect(homeState(s), s).toBe('starting');
    expect(homeState('running')).toBe('running');
    expect(homeState('stopped')).toBe('stopped');
    expect(homeState('failed')).toBe('attention');
    expect(homeState(undefined)).toBe('attention');
  });

  it('each state has its own word and dot; only a stopped computer is called stopped', () => {
    expect(contextState('running')).toEqual({ key: 'context.running', tone: 'ok' });
    expect(contextState('stopped')).toEqual({ key: 'context.stopped', tone: 'neutral' });
    expect(contextState('starting')).toEqual({ key: 'context.starting', tone: 'info' });
    expect(contextState('attention')).toEqual({ key: 'context.attention', tone: 'warn' });
    expect(strings['context.starting']).toBe('Starting');
    expect(strings['context.attention']).toBe('Needs a look');
  });

  it('a computer being made asks for no look', () => {
    expect(needsItems({ botsWaiting: undefined, computers: [{ name: 'atlas', handle: 'atlas.abcd', state: homeState('claiming') }], held: [], sending: 0 })).toEqual([]);
  });

  it('the context line of a computer being made says Starting, and Needs you does not name it', async () => {
    await renderPage(page, { state: 'firstMaking', realm: 'all' });
    await waitFor(() => expect(screen.getAllByText(strings['context.starting']).length).toBeGreaterThan(0));
    expect(screen.queryByText(strings['context.stopped'])).toBeNull();
    expect(screen.queryByText(strings['needs.computer'].replace('{{name}}', 'atlas'))).toBeNull();
  });
});

describe('home: words that claim only what was read', () => {
  it('the setup age line says how long this page has been checking, never when setup started', () => {
    expect(strings['setup.provisioning.elapsed']).toBe('Checking for {{time}}');
    expect(strings['setup.provisioning.justNow']).not.toMatch(/Started/);
  });

  it('the empty states say what to do next', () => {
    expect(strings['shared.emptyBody']).toMatch(/owner/);
    expect(strings['widget.empty']).toBe('Every card is hidden');
    expect(strings['widget.emptyBody']).toMatch(/Customize/);
  });
});
