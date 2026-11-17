// Vitest: the apps fixtures agree with the rules (what a query finds, what is hidden).
import { describe, expect, it } from 'vitest';
import fx from './fixtures';
import { classify, findView } from './logic';

describe('apps fixtures', () => {
  it('list every nix candidate of the query, the plugin among the hidden ones', () => {
    const st = fx.states.many as unknown as Record<string, { data: { rows: object[] } }>;
    const rows = (st['search.nix']?.data.rows ?? []).map((c) => classify({ ...c, app: 'jupyter' } as never));
    expect(rows.map((r) => r.title)).toEqual(['jupyter', 'jupyterlab', 'jupyter-core', 'jupytext-nvim']);
    const v = findView('jupyter', [], { nix: { state: 'done', rows, partial: false, warming: false } }, { all: true });
    expect(v.list.map((i) => i.name)).toContain('jupytext-nvim');
  });
});
