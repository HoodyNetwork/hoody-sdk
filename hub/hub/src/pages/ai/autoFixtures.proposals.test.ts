// The TODO fixture's first row counts the proposed runs still waiting from its own decision state, so approving or
// denying one shows 1, then 0, and the row leaves Waiting for you: the count and the thread agree.
import { api, bootFixtureCore } from '@core';
import { describe, expect, it } from 'vitest';
import { actionRoutes } from './auto/todos/actions';
import { todoRoutes } from './auto/todos/data';
import { todoList } from './auto/todos/logic';
import { todoRules } from './autoFixtures';

const first = async () => {
  const raw = await api(todoRoutes.list);
  const row = todoList(raw, Date.now()).rows.find((r) => r.id === 'todo_1');
  if (!row) throw new Error('the fixture list holds no todo_1');
  return row;
};
const thread = async () => {
  const raw = (await api(todoRoutes.todo, { params: { id: 'todo_1' } })) as { todo: { proposals: Array<{ id: string; status: string }> } };
  return raw.todo.proposals;
};
const decide = (route: typeof actionRoutes.approve | typeof actionRoutes.deny, pid: string) => api(route, { params: { id: 'todo_1', pid } });

describe('the TODO fixture: proposals waiting', () => {
  it('starts with two waiting, on the Waiting tab', async () => {
    bootFixtureCore({ rules: todoRules() });
    const row = await first();
    expect(row.pendingProposals).toBe(2);
    expect(row.tab).toBe('waiting');
  });

  it('approving one shows 1, denying the other shows 0 and the row leaves Waiting; the thread agrees', async () => {
    bootFixtureCore({ rules: todoRules() });
    await decide(actionRoutes.approve, 'prop_1');
    expect((await first()).pendingProposals).toBe(1);
    expect((await first()).tab).toBe('waiting');
    expect((await thread()).map((p) => p.status)).toEqual(['approved', 'pending']);
    await decide(actionRoutes.deny, 'prop_2');
    const row = await first();
    expect(row.pendingProposals).toBe(0);
    expect(row.tab).not.toBe('waiting');
    expect((await thread()).map((p) => p.status)).toEqual(['approved', 'denied']);
  });

  it('a decision on one fixture world does not reach a fresh one', async () => {
    bootFixtureCore({ rules: todoRules() });
    await decide(actionRoutes.deny, 'prop_1');
    bootFixtureCore({ rules: todoRules() });
    expect((await first()).pendingProposals).toBe(2);
  });
});
