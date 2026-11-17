import { describe, expect, it } from 'vitest';
import { computerChoices, modelOptions, programChoices } from './pickers';

const t = (k: string) => (k === 'pick.running' ? 'Running' : 'Stopped');

describe('computer choices (kit ComputerPicker rows)', () => {
  const list = [
    { id: 'c', name: 'zeta', running: true, location: 'Singapore · sg-2', flag: '🇸🇬' },
    { id: 'a', name: 'Alpha', running: false },
    { id: 'b', name: 'beta' },
  ];
  it('current first, then by name, each saying its state in words, its place, flag and realm', () => {
    const o = computerChoices(list, 'c', { name: 'Work', color: 'teal' }, t);
    expect(o.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(o[0]).toEqual({ id: 'c', name: 'zeta', running: true, state: 'Running', place: 'Singapore · sg-2', flag: '🇸🇬', realm: { name: 'Work', color: 'teal' } });
    expect(o[1]).toMatchObject({ running: false, state: 'Stopped' });
    expect(o[2]).toMatchObject({ running: true, state: 'Running' });
  });
  it('leaves the realm out when none is chosen', () => {
    expect(computerChoices(list, 'a', null, t)[0]).toEqual({ id: 'a', name: 'Alpha', running: false, state: 'Stopped' });
  });
});

describe('program choices (kit ProgramPicker rows)', () => {
  it('the same order, headings and port line as the options', () => {
    const tt = (k: string, v?: { start: string; end: string }) => (k === 'prog.ports' ? `Ports ${v?.start}–${v?.end}` : k === 'prog.groupSystem' ? 'System' : 'Yours');
    const o = programChoices([{ id: '3', name: 'hoody-files', system: true }, { id: '2', name: 'web', range: { start: 8000, end: 8010 } }, { id: '1', name: 'api' }], tt);
    expect(o).toEqual([
      { id: '1', name: 'api', group: 'Yours' },
      { id: '2', name: 'web', group: 'Yours', description: 'Ports 8000–8010' },
      { id: '3', name: 'hoody-files', group: 'System' },
    ]);
  });
});

describe('model options', () => {
  it('sorts by provider then name and numbers unnamed ones uniquely', () => {
    const o = modelOptions(
      [{ spec: 'p/x', label: '' }, { spec: 'a/z', label: 'Zed' }, { spec: 'p/y', label: '' }, { spec: 'a/b', label: 'Bee' }],
      (n) => `Unnamed model ${n}`,
    );
    expect(o.map((x) => x.label)).toEqual(['Bee', 'Zed', 'Unnamed model 1', 'Unnamed model 2']);
    expect(new Set(o.map((x) => x.label)).size).toBe(4);
  });
});

import { programOptions, savePick, sortedViews } from './pickers';

describe('savePick', () => {
  it('reports the store refusing, and a store that throws', () => {
    expect(savePick({ read: () => ({}), write: () => false }, 'p/m')).toBe(false);
    expect(savePick({ read: () => { throw new Error('x'); }, write: () => true }, 'p/m')).toBe(false);
  });
  it('keeps the rest of the record and says true when saved', () => {
    let got: unknown;
    expect(savePick({ read: () => ({ last: 1 }), write: (p) => { got = p; return true; } }, 'p/m')).toBe(true);
    expect(got).toEqual({ last: 1, model: 'p/m' });
  });
});

describe('sorted lists', () => {
  it('programs and saved views come by name', () => {
    const t = (k: string, v?: { start: string; end: string }) => (v ? `${k} ${v.start}-${v.end}` : k);
    expect(programOptions([{ id: '2', name: 'web' }, { id: '1', name: 'api' }], t).map((o) => o.label)).toEqual(['api', 'web']);
    expect(sortedViews([{ name: 'b' }, { name: 'A' }]).map((v) => v.name)).toEqual(['A', 'b']);
  });
  it("groups the user's programs first and the system programs after them, a range naming its ports", () => {
    const t = (k: string, v?: { start: string; end: string }) => (v ? `${k} ${v.start}-${v.end}` : k);
    const o = programOptions([
      { id: '7', name: 'hoody-terminal', system: true },
      { id: '2', name: 'Web', range: { start: 10000, end: 10003 } },
      { id: '9', name: 'hoody-exec', system: true },
      { id: '1', name: 'api', range: null },
    ], t);
    expect(o.map((x) => [x.value, x.label, x.group, x.description])).toEqual([
      ['1', 'api', 'prog.groupYours', undefined],
      // A port range is plain digits, never grouped.
      ['2', 'Web', 'prog.groupYours', 'prog.ports 10000-10003'],
      ['9', 'hoody-exec', 'prog.groupSystem', undefined],
      ['7', 'hoody-terminal', 'prog.groupSystem', undefined],
    ]);
  });
  it('numbers unnamed models in the order shown, across providers', () => {
    const o = modelOptions([{ spec: 'z/a', label: '' }, { spec: 'a/b', label: '' }], (n) => `U${n}`);
    expect(o.map((x) => [x.value, x.label])).toEqual([['a/b', 'U1'], ['z/a', 'U2']]);
  });
});
