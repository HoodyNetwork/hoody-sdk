// Vitest: the computer a New Bot drawer starts on (logic.startComputer): the one the page opened it for, else the one the
// top bar shows, when it can host a Bot (running, serving the shown realm); a computer that cannot says why and leaves
// the choice open.
import { describe, expect, it } from 'vitest';
import { canHostBot, startComputer, type HostCandidate } from './logic';

const c = (id: string, more: Partial<HostCandidate> = {}): HostCandidate => ({ id, name: id.toUpperCase(), state: 'running', listState: 'ok', ...more });

describe('startComputer', () => {
  const atlas = c('atlas');
  const borealis = c('borealis');
  const stopped = c('cinder', { state: 'stopped' });
  const starting = c('ember', { state: 'starting' });
  const other = c('dune', { listState: 'other_realm' });
  const failed = c('flint', { listState: 'failed' });

  it('a computer hosts a Bot when it runs and serves the shown realm (a failed Bots read does not rule it out)', () => {
    expect([atlas, stopped, starting, other, failed].map(canHostBot)).toEqual([true, false, false, false, true]);
  });

  const rows: [string, readonly HostCandidate[], string | undefined, string | undefined, ReturnType<typeof startComputer>][] = [
    ['the page opened it for a computer: that one, whatever the top bar shows', [atlas, borealis], 'atlas', 'borealis', { id: 'atlas', why: null }],
    ['the page opened it for a computer the list does not hold yet: as given', [], 'atlas', undefined, { id: 'atlas', why: null }],
    ['the page opened it for a stopped computer: open, with why (never a Bot sent to a computer that cannot run it)', [atlas, stopped], 'cinder', 'atlas', { id: undefined, why: { kind: 'notRunning', name: 'CINDER' } }],
    ['the shown computer, when it can host', [atlas, borealis], undefined, 'borealis', { id: 'borealis', why: null }],
    ['a shown computer whose Bots read failed still hosts', [atlas, failed], undefined, 'flint', { id: 'flint', why: null }],
    ['shown but stopped: open, with why', [atlas, borealis, stopped], undefined, 'cinder', { id: undefined, why: { kind: 'notRunning', name: 'CINDER' } }],
    ['shown but stopped, one other runs: still open (the top bar said another computer)', [atlas, stopped], undefined, 'cinder', { id: undefined, why: { kind: 'notRunning', name: 'CINDER' } }],
    ['shown but starting: open, with why', [atlas, starting], undefined, 'ember', { id: undefined, why: { kind: 'notRunning', name: 'EMBER' } }],
    ['shown but serving another realm: open, with why', [atlas, other], undefined, 'dune', { id: undefined, why: { kind: 'otherRealm', name: 'DUNE' } }],
    ['nothing can host: says none, whatever is shown', [stopped, other], undefined, 'cinder', { id: undefined, why: { kind: 'none' } }],
    ['no computers read yet: nothing picked, nothing said', [], undefined, 'atlas', { id: undefined, why: null }],
    ['no shown computer, one can host: that one', [atlas, stopped], undefined, undefined, { id: 'atlas', why: null }],
    ['no shown computer, several can host: open, nothing said', [atlas, borealis], undefined, undefined, { id: undefined, why: null }],
    ['a shown computer the list does not hold: as with none shown', [atlas, stopped], undefined, 'gone', { id: 'atlas', why: null }],
  ];
  it.each(rows)('%s', (_n, computers, initial, current, want) => {
    expect(startComputer(computers, initial, current)).toEqual(want);
  });
});
