// Vitest: the one restore predicate, one row per case. A stored draft
// comes back only from its own record, its own project's computer and its current attempt's stored prompt; a prompt that is not
// the Hub's shape asks the person to confirm the settings (never a guess, never the raw block); anything that cannot be read yet
// holds (unknown), and only a definite read moves a hold.
import { type DraftRecord } from '@core';
import { describe, expect, it } from 'vitest';
import { buildPrompt, MARKER } from './prompt';
import { guardBaseline, promptIsFix, promptToRead, recoverable, type Recover } from './recover';
import { NO_WRITER } from './record';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const rec = (o: Partial<DraftRecord> = {}): DraftRecord => ({
  draftId: 'restoreabc', mode: 'ai', project: 'p1', compId: 'comp-1', realm: R1, owner: 'fp1', exec: 1,
  current: 2, retained: 1, state: 'open', deploy: null, updatedAt: 1, ...o,
});
const list = (rows: Array<Record<string, unknown>>, totalPages = 1) => ({ data: { computers: rows, pagination: { totalPages } } });
const HERE = list([{ id: 'comp-1', project_id: 'p1', server_name: 'sg-1' }]);
const prompt = (o: { description?: string; address?: string; schedule?: string | null; exec?: number; fix?: boolean } = {}): string => {
  const p = buildPrompt(o.description ?? 'every monday at 9, mail the digest', {
    address: o.address ?? '/monday-digest', schedule: o.schedule === undefined ? '0 9 * * 1' : o.schedule, exec: o.exec ?? 1,
    ...(o.fix ? { fix: { problems: ['it throws'], code: 'return 1;' } } : {}),
  });
  if (!p.ok) throw new Error(p.why);
  return p.text;
};
const at = (n: number, text: string) => ({ n, text });
const k = (r: Recover) => (r.k === 'yes' || r.k === 'confirm' ? r.k : `${r.k}/${r.why}`);

describe('recoverable: one row per repro', () => {
  it('an unreadable record holds: unknown/read, never DraftGone', () => {
    expect(k(recoverable('unreadable', HERE, undefined))).toBe('unknown/read');
  });

  it('no record, or a discarded one: no/gone', () => {
    expect(k(recoverable(null, HERE, undefined))).toBe('no/gone');
    expect(k(recoverable(rec({ state: 'discarded' }), HERE, at(2, prompt())))).toBe('no/gone');
  });

  it('the same container id listed only under another project: no/project (never bound to p2)', () => {
    expect(k(recoverable(rec(), list([{ id: 'comp-1', project_id: 'p2' }]), at(2, prompt())))).toBe('no/project');
    expect(promptToRead(rec(), list([{ id: 'comp-1', project_id: 'p2' }]))).toBeNull();
  });

  it('a list that is not whole, a row without its project, or no list: unknown/list', () => {
    expect(k(recoverable(rec(), list([], 2), at(2, prompt())))).toBe('unknown/list');
    expect(k(recoverable(rec(), list([{ id: 'comp-1' }]), at(2, prompt())))).toBe('unknown/list');
    expect(k(recoverable(rec(), undefined, at(2, prompt())))).toBe('unknown/list');
  });

  it('a hold moves only on a definite read; unknown on the first read, no on the recheck', () => {
    const r = rec();
    expect(k(recoverable(r, list([], 2), undefined))).toBe('unknown/list');
    expect(k(recoverable(r, list([{ id: 'other', project_id: 'p1' }]), undefined))).toBe('no/project');
  });

  it('the prompt not read yet, or unreadable: unknown/read', () => {
    expect(k(recoverable(rec(), HERE, undefined))).toBe('unknown/read');
    expect(k(recoverable(rec(), HERE, 'unreadable'))).toBe('unknown/read');
    expect(promptToRead(rec(), HERE)).toEqual({ binding: expect.objectContaining({ exec: 1 }), n: 2 });
  });

  it('a prompt read for another attempt than the current one: no/generation', () => {
    expect(k(recoverable(rec({ current: 3 }), HERE, at(2, prompt())))).toBe('no/generation');
  });

  it('a stored prompt (the attempt still running) restores the inputs and lands on Build', () => {
    const r = recoverable(rec(), HERE, at(2, prompt({ schedule: null })));
    expect(r.k).toBe('yes');
    if (r.k !== 'yes') return;
    expect(r.land).toBe('build');
    expect(r.fix).toBe(false);
    expect(r.binding.target).toEqual({ project: { id: 'p1' }, container: { id: 'comp-1', server_name: 'sg-1' } });
    expect(r.draft).toMatchObject({
      id: 'restoreabc', way: 'ai', description: 'every monday at 9, mail the digest', route: '/monday-digest', schedule: null,
      attempt: 2, restored: true, linkAcknowledged: false, settingsConfirmed: true, link: false, code: '',
    });
  });

  it('a fix attempt reads as a fix from its stored prompt (its answer needs the map in this tab)', () => {
    const r = recoverable(rec(), HERE, at(2, prompt({ fix: true })));
    expect(r.k === 'yes' && r.fix).toBe(true);
  });

  it('a malformed prompt whose Length proves the cut: confirm, the description kept, settings unconfirmed, Where', () => {
    const bad = `${'every monday'}\n\n${MARKER}\nLength: 12\nAddress: not an address\nRuns: only when its address is called`;
    const r = recoverable(rec(), HERE, at(2, bad));
    expect(r.k).toBe('confirm');
    if (r.k !== 'confirm') return;
    expect(r.land).toBe('where');
    expect(r.draft).toMatchObject({ description: 'every monday', route: '', schedule: null, settingsConfirmed: false, linkAcknowledged: false, attempt: 2 });
  });

  it('a malformed prompt whose cut is not proven: confirm with no description (never a guess)', () => {
    const bad = `every monday\n\n${MARKER}\nLength: 99\nAddress: /x\nRuns: only when its address is called`;
    const r = recoverable(rec(), HERE, at(2, bad));
    expect(r.k === 'confirm' && r.draft.description).toBe('');
    expect(k(recoverable(rec(), HERE, at(2, 'no block at all')))).toBe('confirm');
  });

  it('no stored ask for the current attempt: confirm with no description', () => {
    const r = recoverable(rec(), HERE, { n: 2, none: true });
    expect(r.k === 'confirm' && r.draft.description).toBe('');
  });

  it('a block naming another folder than the record: confirm (the stored settings are not these)', () => {
    expect(k(recoverable(rec({ exec: 1 }), HERE, at(2, prompt({ exec: 3 }))))).toBe('confirm');
    const three = recoverable(rec({ exec: 3 }), HERE, at(2, prompt({ exec: 3 })));
    expect(three.k === 'yes' && three.binding.exec).toBe(3);
  });

  it('a record past open lands on Make it live from the record alone (no prompt read, no ?step)', () => {
    const deploy = { kind: 'write' as const, path: 'default/1/monday-digest.ts', opId: 'op1', sentAfter: 1, attempt: 2, beatAt: 1, phase: 'held' as const };
    for (const state of ['deploying', 'live_cleanup', 'consumed'] as const) {
      const r = recoverable(rec({ state, deploy }), HERE, undefined);
      expect(r.k === 'yes' && r.land).toBe('live');
    }
    expect(promptToRead(rec({ state: 'deploying', deploy }), HERE)).toBeNull();
  });

  it('a record past open restores its reservation\'s own address, never an empty or suggested one', () => {
    const deploy = { kind: 'write' as const, path: 'default/1/monday-digest.ts', opId: 'op1', sentAfter: 1, attempt: 0, beatAt: 1, phase: 'held' as const };
    for (const state of ['deploying', 'live_cleanup', 'consumed'] as const) {
      const r = recoverable(rec({ state, deploy, mode: 'write', current: 0 }), HERE, undefined);
      expect(r.k === 'yes' && [r.draft.route, r.draft.routeTouched]).toEqual(['/monday-digest', true]);
    }
  });

  it('a write-way draft restores without an agent attempt (current 0) and lands on the first step', () => {
    const r = recoverable(rec({ mode: 'write', current: 0, retained: null }), HERE, undefined);
    expect(r.k === 'yes' && [r.land, r.draft.way, r.draft.attempt]).toEqual(['what', 'write', 0]);
    expect(promptToRead(rec({ mode: 'write', current: 0 }), HERE)).toBeNull();
  });

  it('a write-way draft whose computer reports no agent writer (owner NO_WRITER) restores too', () => {
    const r = recoverable(rec({ mode: 'write', current: 0, retained: null, owner: NO_WRITER }), HERE, undefined);
    expect(r.k === 'yes' && [r.land, r.draft.way, r.binding.owner]).toEqual(['what', 'write', NO_WRITER]);
  });
});

describe('a restored attempt carries its build baseline in the draft', () => {
  it('yes and confirm drafts hold the inputs they were rebuilt with; a draft with no attempt holds none', () => {
    const y = recoverable(rec(), HERE, at(2, prompt({ schedule: null })));
    expect(y.k === 'yes' && y.draft.builtWith).toEqual({ description: 'every monday at 9, mail the digest', route: '/monday-digest', schedule: null, compId: 'comp-1' });
    const bad = `${'every monday'}\n\n${MARKER}\nLength: 12\nAddress: not an address\nRuns: only when its address is called`;
    const c = recoverable(rec(), HERE, at(2, bad));
    expect(c.k === 'confirm' && c.draft.builtWith).toEqual({ description: 'every monday', route: '', schedule: null, compId: 'comp-1' });
    const w = recoverable(rec({ current: 0, mode: 'write', retained: null }), HERE, undefined);
    expect(w.k === 'yes' && w.draft.builtWith).toBeNull();
  });
});

describe('promptIsFix: the settle reads the kind from the stored prompt only', () => {
  it('a Hub prompt says it; a malformed or missing one settles as a fix (map_lost without the map)', () => {
    expect(promptIsFix(prompt())).toBe(false);
    expect(promptIsFix(prompt({ fix: true }))).toBe(true);
    expect(promptIsFix('no block')).toBe(true);
    expect(promptIsFix(null)).toBe(true);
  });
});

describe('guardBaseline: the leave guard compares against a restore only when it is a definite one of the same attempt', () => {
  it('yes of the current attempt: the restored draft; anything else: null (over-warn)', () => {
    const yes = recoverable(rec(), HERE, at(2, prompt()));
    expect(guardBaseline(yes, 2)).not.toBeNull();
    expect(guardBaseline(yes, 3)).toBeNull();
    expect(guardBaseline(recoverable(rec(), HERE, at(2, 'malformed')), 2)).toBeNull();
    expect(guardBaseline(recoverable(rec(), list([], 2), undefined), 2)).toBeNull();
  });
});
